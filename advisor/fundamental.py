from __future__ import annotations

from typing import Any

import pandas as pd

from advisor.scoring import band_score, inverse_band_score, num, pct, safe_float, weighted_mean

FUNDAMENTAL_WEIGHTS = {
    "profitability": 0.28,
    "growth": 0.20,
    "balance_sheet": 0.20,
    "cash": 0.14,
    "valuation": 0.12,
    "filing_notes": 0.06,
}


def _latest_statement_value(frame: pd.DataFrame | None, row_names: list[str]) -> float | None:
    if frame is None or getattr(frame, "empty", True):
        return None
    index_map = {str(idx).strip().lower(): idx for idx in frame.index}
    for name in row_names:
        key = name.lower()
        if key in index_map:
            series = frame.loc[index_map[key]]
            for value in series.tolist():
                number = safe_float(value)
                if number is not None:
                    return number
    return None


def _growth(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return (current - previous) / abs(previous)


def _two_period_growth(frame: pd.DataFrame | None, row_names: list[str]) -> float | None:
    if frame is None or getattr(frame, "empty", True) or frame.shape[1] < 2:
        return None
    index_map = {str(idx).strip().lower(): idx for idx in frame.index}
    for name in row_names:
        key = name.lower()
        if key not in index_map:
            continue
        series = frame.loc[index_map[key]]
        values = [safe_float(v) for v in series.tolist()]
        values = [v for v in values if v is not None]
        if len(values) >= 2:
            return _growth(values[0], values[1])
    return None


def _dividend_yield(value: Any) -> float | None:
    number = safe_float(value)
    if number is None:
        return None
    # Yahoo sometimes stores 0.71 for a 0.71% yield, sometimes 0.0071.
    if number > 0.25:
        number = number / 100.0
    return number


def extract_metrics(company: dict[str, Any]) -> dict[str, float | None]:
    info = company.get("info") or {}
    financials = company.get("financials")
    cashflow = company.get("cashflow")

    balance = company.get("balance_sheet")
    ebit = _latest_statement_value(financials, ["EBIT", "Operating Income", "Ebit"])
    interest = _latest_statement_value(financials, ["Interest Expense", "Interest Expense Non Operating"])
    assets = _latest_statement_value(balance, ["Total Assets"])
    current_liab = _latest_statement_value(balance, ["Current Liabilities"])
    roce = None
    if ebit is not None and assets and current_liab is not None:
        employed = assets - current_liab
        if employed:
            roce = ebit / employed
    coverage = None
    if ebit is not None and interest not in (None, 0):
        coverage = ebit / abs(interest)

    return {
        "trailing_pe": safe_float(info.get("trailingPE")),
        "forward_pe": safe_float(info.get("forwardPE")),
        "peg": safe_float(info.get("pegRatio") or info.get("trailingPegRatio")),
        "price_to_book": safe_float(info.get("priceToBook")),
        "price_to_sales": safe_float(info.get("priceToSalesTrailing12Months")),
        "ev_ebitda": safe_float(info.get("enterpriseToEbitda")),
        "ev_revenue": safe_float(info.get("enterpriseToRevenue")),
        "enterprise_value": safe_float(info.get("enterpriseValue")),
        "market_cap": safe_float(info.get("marketCap")) or safe_float(company.get("market_cap")),
        "ebitda": safe_float(info.get("ebitda")) or _latest_statement_value(financials, ["EBITDA", "Normalized EBITDA"]),
        "ebit": ebit,
        "ebitda_margin": safe_float(info.get("ebitdaMargins")),
        "profit_margin": safe_float(info.get("profitMargins")),
        "operating_margin": safe_float(info.get("operatingMargins")),
        "gross_margin": safe_float(info.get("grossMargins")),
        "roe": safe_float(info.get("returnOnEquity")),
        "roa": safe_float(info.get("returnOnAssets")),
        "roce": roce,
        "eps": safe_float(info.get("trailingEps")),
        "forward_eps": safe_float(info.get("forwardEps")),
        "book_value": safe_float(info.get("bookValue")),
        "revenue": safe_float(info.get("totalRevenue")) or _latest_statement_value(
            financials, ["Total Revenue", "Operating Revenue"]
        ),
        "net_income": safe_float(info.get("netIncomeToCommon")) or _latest_statement_value(
            financials, ["Net Income", "Net Income Common Stockholders"]
        ),
        "interest_coverage": coverage,
        "debt_to_equity": safe_float(info.get("debtToEquity")),
        "current_ratio": safe_float(info.get("currentRatio")),
        "quick_ratio": safe_float(info.get("quickRatio")),
        "revenue_growth": safe_float(info.get("revenueGrowth")) or _two_period_growth(
            financials, ["Total Revenue", "Operating Revenue"]
        ),
        "earnings_growth": safe_float(info.get("earningsGrowth")) or safe_float(info.get("earningsQuarterlyGrowth")),
        "free_cashflow": safe_float(info.get("freeCashflow")) or _latest_statement_value(
            cashflow, ["Free Cash Flow"]
        ),
        "operating_cashflow": safe_float(info.get("operatingCashflow")) or _latest_statement_value(
            cashflow, ["Operating Cash Flow", "Total Cash From Operating Activities"]
        ),
        "capex": _latest_statement_value(cashflow, ["Capital Expenditure"]),
        "total_cash": safe_float(info.get("totalCash")),
        "total_debt": safe_float(info.get("totalDebt")),
        "shares": safe_float(info.get("sharesOutstanding")),
        "insider_hold": safe_float(info.get("heldPercentInsiders")),
        "institution_hold": safe_float(info.get("heldPercentInstitutions")),
        "dividend_yield": _dividend_yield(info.get("dividendYield")),
        "payout_ratio": safe_float(info.get("payoutRatio")),
        "beta": safe_float(info.get("beta")),
        "target_mean": safe_float(info.get("targetMeanPrice")),
        "analyst_opinions": safe_float(info.get("numberOfAnalystOpinions")),
        "recommendation": (info.get("recommendationKey") or "").replace("_", " ") or None,
    }


def _component_scores(metrics: dict[str, float | None]) -> dict[str, float | None]:
    profitability = weighted_mean([
        (band_score(metrics["roe"], [(0.25, 95), (0.18, 85), (0.12, 72), (0.08, 58), (0.04, 42), (0, 28)]), 0.4),
        (band_score(metrics["profit_margin"], [(0.25, 95), (0.15, 82), (0.08, 68), (0.04, 52), (0, 35)]), 0.35),
        (band_score(metrics["operating_margin"], [(0.25, 94), (0.15, 80), (0.08, 66), (0.03, 48), (0, 32)]), 0.25),
    ])
    growth = weighted_mean([
        (band_score(metrics["revenue_growth"], [(0.2, 92), (0.1, 80), (0.05, 68), (0.0, 52), (-0.05, 38)]), 0.55),
        (band_score(metrics["earnings_growth"], [(0.25, 94), (0.12, 80), (0.05, 66), (0.0, 50), (-0.1, 34)]), 0.45),
    ])
    balance = weighted_mean([
        (inverse_band_score(metrics["debt_to_equity"], [(40, 92), (80, 78), (140, 62), (220, 44), (400, 28)]), 0.55),
        (band_score(metrics["current_ratio"], [(2.0, 90), (1.5, 78), (1.2, 66), (1.0, 50), (0.7, 32)]), 0.45),
    ])
    cash = None
    fcf = metrics["free_cashflow"]
    ocf = metrics["operating_cashflow"]
    if fcf is not None and ocf is not None:
        cash = 88 if fcf > 0 and ocf > 0 else 70 if ocf > 0 else 32
    elif fcf is not None:
        cash = 84 if fcf > 0 else 30
    elif ocf is not None:
        cash = 76 if ocf > 0 else 34

    valuation = weighted_mean([
        (inverse_band_score(metrics["trailing_pe"], [(12, 88), (18, 76), (25, 62), (35, 48), (50, 34)]), 0.4),
        (inverse_band_score(metrics["peg"], [(0.8, 90), (1.2, 76), (1.8, 60), (2.5, 44), (4, 30)]), 0.35),
        (inverse_band_score(metrics["price_to_book"], [(1.5, 86), (3, 72), (6, 58), (12, 44), (20, 32)]), 0.25),
    ])
    return {
        "profitability": profitability,
        "growth": growth,
        "balance_sheet": balance,
        "cash": cash,
        "valuation": valuation,
    }


def _highlights(metrics: dict[str, float | None], components: dict[str, float | None]) -> tuple[list[str], list[str]]:
    good: list[str] = []
    bad: list[str] = []

    if metrics["roe"] is not None:
        if metrics["roe"] >= 0.80:
            good.append(f"Reported ROE is {pct(metrics['roe'])}; extreme readings often reflect buybacks more than operating return.")
        elif metrics["roe"] >= 0.15:
            good.append(f"Return on equity is {pct(metrics['roe'])}.")
        elif metrics["roe"] < 0.08:
            bad.append(f"Return on equity is weak at {pct(metrics['roe'])}.")
        else:
            good.append(f"Return on equity is adequate at {pct(metrics['roe'])}.")
    if metrics["profit_margin"] is not None:
        if metrics["profit_margin"] >= 0.12:
            good.append(f"Net margin of {pct(metrics['profit_margin'])} shows a durable earnings engine.")
        elif metrics["profit_margin"] < 0.04:
            bad.append(f"Net margin is thin at {pct(metrics['profit_margin'])}.")
    if metrics["revenue_growth"] is not None:
        if metrics["revenue_growth"] >= 0.08:
            good.append(f"Revenue is growing at {pct(metrics['revenue_growth'])}.")
        elif metrics["revenue_growth"] < 0:
            bad.append(f"Revenue contracted {pct(metrics['revenue_growth'])}.")
    if metrics["debt_to_equity"] is not None:
        if metrics["debt_to_equity"] <= 80:
            good.append(f"Leverage is contained (D/E {num(metrics['debt_to_equity'], 1)}).")
        elif metrics["debt_to_equity"] >= 200:
            bad.append(f"Balance sheet is leveraged (D/E {num(metrics['debt_to_equity'], 1)}).")
    if metrics["free_cashflow"] is not None:
        if metrics["free_cashflow"] > 0:
            good.append(f"Free cash flow is positive at {num(metrics['free_cashflow'])}.")
        else:
            bad.append("The company is burning free cash flow.")
    if metrics["trailing_pe"] is not None and metrics["trailing_pe"] > 40:
        bad.append(f"Valuation is demanding (P/E {num(metrics['trailing_pe'], 1)}).")
    if metrics["current_ratio"] is not None and metrics["current_ratio"] < 1:
        bad.append(f"Current ratio {num(metrics['current_ratio'], 2)} flags near-term liquidity pressure.")

    if components.get("profitability") and components["profitability"] >= 75 and not good:
        good.append("Profitability metrics screen as strong.")
    if components.get("balance_sheet") and components["balance_sheet"] < 40:
        bad.append("The balance sheet is a material risk to investability.")
    return good[:5], bad[:5]


def _rating(score: float) -> str:
    if score >= 75:
        return "STRONG"
    if score >= 55:
        return "MODERATE"
    return "RISKY"


def _metric_rows(rows: list[tuple[str, str | None, str]]) -> list[dict[str, str]]:
    return [
        {"label": label, "value": value, "term": term}
        for label, value, term in rows
        if value is not None
    ]


def _col_label(column: Any) -> str:
    text = str(column)
    return text[:10] if len(text) >= 4 else text


def _statement_block(frame: pd.DataFrame | None, specs: list[tuple[list[str], str, str]], periods: int = 4) -> dict[str, Any] | None:
    if frame is None or getattr(frame, "empty", True):
        return None
    columns = list(frame.columns)[:periods]
    index_map = {str(idx).strip().lower(): idx for idx in frame.index}
    rows = []
    for names, label, term in specs:
        series = None
        for name in names:
            key = index_map.get(name.lower())
            if key is not None:
                series = frame.loc[key]
                break
        if series is None:
            continue
        values = []
        found = False
        for column in columns:
            try:
                number = safe_float(series.loc[column])
            except Exception:
                number = safe_float(series.get(column) if hasattr(series, "get") else None)
            values.append(num(number) if number is not None else "—")
            found = found or number is not None
        if found:
            rows.append({"label": label, "term": term, "values": values})
    if not rows:
        return None
    return {"headers": [_col_label(column) for column in columns], "rows": rows}


def _frame_values(frame: pd.DataFrame | None, names: list[str], limit: int = 8) -> list[float]:
    if frame is None or getattr(frame, "empty", True):
        return []
    index_map = {str(idx).strip().lower(): idx for idx in frame.index}
    series = None
    for name in names:
        key = index_map.get(name.lower())
        if key is not None:
            series = frame.loc[key]
            break
    if series is None:
        return []
    values = []
    for column in list(frame.columns)[:limit]:
        try:
            number = safe_float(series.loc[column])
        except Exception:
            number = None
        if number is not None:
            values.append(number)
    return values


def _cagr(values: list[float], years: int) -> float | None:
    if len(values) <= years:
        years = len(values) - 1
    if years < 1:
        return None
    start = values[years]
    end = values[0]
    if not start:
        return None
    return (end / abs(start)) ** (1 / years) - 1 if start < 0 else (end / start) ** (1 / years) - 1


def _price_cagr(history: pd.DataFrame | None, years: int) -> float | None:
    if history is None or getattr(history, "empty", True) or "Close" not in history.columns:
        return None
    close = history["Close"].dropna()
    if close.empty:
        return None
    need = int(years * 252)
    end = float(close.iloc[-1])
    if len(close) <= need:
        start = float(close.iloc[0])
        span = max(len(close) / 252.0, 0.25)
    else:
        start = float(close.iloc[-need])
        span = float(years)
    if not start:
        return None
    return (end / start) ** (1 / span) - 1


def _growth_cards(company: dict[str, Any], metrics: dict[str, float | None]) -> dict[str, list[dict[str, str]]]:
    sales = _frame_values(company.get("financials"), ["Total Revenue", "Operating Revenue"])
    profit = _frame_values(company.get("financials"), ["Net Income", "Net Income Common Stockholders"])
    history = company.get("history")
    cards = {
        "Compounded sales growth": _metric_rows([
            ("5 years", pct(_cagr(sales, 5)), "CAGR"),
            ("3 years", pct(_cagr(sales, 3)), "CAGR"),
            ("1 year", pct(_cagr(sales, 1)), "CAGR"),
        ]),
        "Compounded profit growth": _metric_rows([
            ("5 years", pct(_cagr(profit, 5)), "CAGR"),
            ("3 years", pct(_cagr(profit, 3)), "CAGR"),
            ("1 year", pct(_cagr(profit, 1)), "CAGR"),
        ]),
        "Stock price CAGR": _metric_rows([
            ("5 years", pct(_price_cagr(history, 5)), "Price CAGR"),
            ("3 years", pct(_price_cagr(history, 3)), "Price CAGR"),
            ("1 year", pct(_price_cagr(history, 1)), "Price CAGR"),
        ]),
        "Return on equity": _metric_rows([
            ("Latest", pct(metrics.get("roe")), "ROE"),
            ("ROA", pct(metrics.get("roa")), "ROA"),
            ("ROCE", pct(metrics.get("roce")), "ROCE"),
        ]),
    }
    return {title: rows for title, rows in cards.items() if rows}


def _statements(company: dict[str, Any]) -> dict[str, Any]:
    income = [
        (["Total Revenue", "Operating Revenue"], "Sales", "Sales"),
        (["Total Expenses"], "Expenses", "Expenses"),
        (["Gross Profit"], "Gross profit", "Gross profit"),
        (["EBITDA", "Normalized EBITDA"], "EBITDA", "EBITDA"),
        (["EBIT", "Operating Income", "Ebit"], "Operating profit", "Operating profit"),
        (["Interest Expense", "Interest Expense Non Operating"], "Interest", "Interest"),
        (["Reconciled Depreciation", "Depreciation"], "Depreciation", "Depreciation"),
        (["Pretax Income", "EBT"], "Profit before tax", "PBT"),
        (["Tax Provision", "Income Tax Expense"], "Tax", "Tax"),
        (["Net Income", "Net Income Common Stockholders"], "Net profit", "Net profit"),
        (["Basic EPS", "Diluted EPS"], "EPS", "EPS"),
    ]
    balance = [
        (["Common Stock", "Stockholders Equity"], "Equity capital / reserves", "Equity"),
        (["Total Debt", "Long Term Debt"], "Borrowings", "Debt"),
        (["Current Liabilities"], "Current liabilities", "Current liabilities"),
        (["Total Liabilities Net Minority Interest", "Total Liabilities"], "Total liabilities", "Total liabilities"),
        (["Net PPE", "Properties Plant And Equipment"], "Fixed assets", "Fixed assets"),
        (["Investments And Advances", "Investmentin Financial Assets"], "Investments", "Investments"),
        (["Current Assets"], "Current assets", "Current assets"),
        (["Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments"], "Cash", "Cash"),
        (["Total Assets"], "Total assets", "Total assets"),
    ]
    cash = [
        (["Operating Cash Flow", "Total Cash From Operating Activities"], "Cash from operations", "OCF"),
        (["Investing Cash Flow", "Net Cash Used For Investing Activities"], "Cash from investing", "Investing cash flow"),
        (["Financing Cash Flow", "Net Cash From Financing Activities"], "Cash from financing", "Financing cash flow"),
        (["Free Cash Flow"], "Free cash flow", "FCF"),
        (["Capital Expenditure"], "Capex", "Capex"),
        (["Changes In Cash", "End Cash Position"], "Net cash flow", "Net cash flow"),
    ]
    blocks = {
        "Quarterly results": _statement_block(company.get("quarterly_financials"), income, periods=8),
        "Profit & loss": _statement_block(company.get("financials"), income, periods=6),
        "Balance sheet": _statement_block(company.get("balance_sheet"), balance, periods=6),
        "Cash flows": _statement_block(company.get("cashflow"), cash, periods=6),
    }
    quarterly_balance = _statement_block(company.get("quarterly_balance_sheet"), balance, periods=6)
    if quarterly_balance:
        blocks["Quarterly balance sheet"] = quarterly_balance
    return {title: block for title, block in blocks.items() if block}


def analyze_fundamentals(company: dict[str, Any], rag_notes: dict[str, Any] | None = None) -> dict[str, Any]:
    metrics = extract_metrics(company)
    components = _component_scores(metrics)
    rag_score = None
    if rag_notes and rag_notes.get("score") is not None:
        rag_score = float(rag_notes["score"])

    score = weighted_mean([
        (components["profitability"], FUNDAMENTAL_WEIGHTS["profitability"]),
        (components["growth"], FUNDAMENTAL_WEIGHTS["growth"]),
        (components["balance_sheet"], FUNDAMENTAL_WEIGHTS["balance_sheet"]),
        (components["cash"], FUNDAMENTAL_WEIGHTS["cash"]),
        (components["valuation"], FUNDAMENTAL_WEIGHTS["valuation"]),
        (rag_score, FUNDAMENTAL_WEIGHTS["filing_notes"]),
    ])
    if score is None:
        score = 50.0

    highlights, concerns = _highlights(metrics, components)
    if rag_notes:
        highlights.extend(rag_notes.get("highlights") or [])
        concerns.extend(rag_notes.get("concerns") or [])

    price = company.get("price")
    target = metrics["target_mean"]
    upside = None
    if price and target:
        upside = (target - price) / price

    display = _metric_rows([
        ("P/E (TTM)", num(metrics["trailing_pe"], 1), "P/E"),
        ("Forward P/E", num(metrics["forward_pe"], 1), "Forward P/E"),
        ("PEG", num(metrics["peg"], 2), "PEG"),
        ("Price / Book", num(metrics["price_to_book"], 2), "P/B"),
        ("ROE", pct(metrics["roe"]), "ROE"),
        ("EBITDA", num(metrics["ebitda"]), "EBITDA"),
        ("EV / EBITDA", num(metrics["ev_ebitda"], 1), "EV/EBITDA"),
        ("Net margin", pct(metrics["profit_margin"]), "Net margin"),
        ("Operating margin", pct(metrics["operating_margin"]), "Operating margin"),
        ("Revenue growth", pct(metrics["revenue_growth"]), "Revenue growth"),
        ("Earnings growth", pct(metrics["earnings_growth"]), "Earnings growth"),
        ("Debt / Equity", num(metrics["debt_to_equity"], 1), "D/E"),
        ("Current ratio", num(metrics["current_ratio"], 2), "Current ratio"),
        ("Free cash flow", num(metrics["free_cashflow"]), "FCF"),
        ("Dividend yield", pct(metrics["dividend_yield"]), "Dividend yield"),
        ("Beta", num(metrics["beta"], 2), "Beta"),
        ("Analyst target", num(target, 2), "Analyst target"),
        ("Implied upside", pct(upside), "Implied upside"),
        ("Street view", metrics["recommendation"], "Street view"),
    ])
    deep = {
        "Valuation": _metric_rows([
            ("Market cap", num(metrics["market_cap"]), "Market cap"),
            ("Enterprise value", num(metrics["enterprise_value"]), "EV"),
            ("P/E (TTM)", num(metrics["trailing_pe"], 1), "P/E"),
            ("Forward P/E", num(metrics["forward_pe"], 1), "Forward P/E"),
            ("PEG", num(metrics["peg"], 2), "PEG"),
            ("Price / Book", num(metrics["price_to_book"], 2), "P/B"),
            ("Price / Sales", num(metrics["price_to_sales"], 2), "P/S"),
            ("EV / EBITDA", num(metrics["ev_ebitda"], 1), "EV/EBITDA"),
            ("EV / Sales", num(metrics["ev_revenue"], 2), "EV/Sales"),
            ("EPS (TTM)", num(metrics["eps"], 2), "EPS"),
            ("Book value / share", num(metrics["book_value"], 2), "Book value"),
        ]),
        "Profitability": _metric_rows([
            ("Sales", num(metrics["revenue"]), "Sales"),
            ("EBITDA", num(metrics["ebitda"]), "EBITDA"),
            ("EBIT", num(metrics["ebit"]), "EBIT"),
            ("Net profit", num(metrics["net_income"]), "Net profit"),
            ("Gross margin", pct(metrics["gross_margin"]), "Gross margin"),
            ("EBITDA margin", pct(metrics["ebitda_margin"]), "EBITDA margin"),
            ("Operating margin", pct(metrics["operating_margin"]), "Operating margin"),
            ("Net margin", pct(metrics["profit_margin"]), "Net margin"),
            ("ROE", pct(metrics["roe"]), "ROE"),
            ("ROA", pct(metrics["roa"]), "ROA"),
            ("ROCE", pct(metrics["roce"]), "ROCE"),
            ("Interest coverage", num(metrics["interest_coverage"], 1), "Interest coverage"),
        ]),
        "Growth & payout": _metric_rows([
            ("Revenue growth", pct(metrics["revenue_growth"]), "Revenue growth"),
            ("Earnings growth", pct(metrics["earnings_growth"]), "Earnings growth"),
            ("Dividend yield", pct(metrics["dividend_yield"]), "Dividend yield"),
            ("Payout ratio", pct(metrics["payout_ratio"]), "Payout ratio"),
            ("Beta", num(metrics["beta"], 2), "Beta"),
        ]),
        "Balance sheet": _metric_rows([
            ("Cash", num(metrics["total_cash"]), "Cash"),
            ("Total debt", num(metrics["total_debt"]), "Debt"),
            ("Debt / Equity", num(metrics["debt_to_equity"], 1), "D/E"),
            ("Current ratio", num(metrics["current_ratio"], 2), "Current ratio"),
            ("Quick ratio", num(metrics["quick_ratio"], 2), "Quick ratio"),
            ("Shares outstanding", num(metrics["shares"]), "Shares"),
            ("Insider holding", pct(metrics["insider_hold"]), "Insider holding"),
            ("Institutional holding", pct(metrics["institution_hold"]), "Institutional holding"),
        ]),
        "Cash flow": _metric_rows([
            ("Operating cash flow", num(metrics["operating_cashflow"]), "OCF"),
            ("Free cash flow", num(metrics["free_cashflow"]), "FCF"),
            ("Capex", num(metrics["capex"]), "Capex"),
        ]),
    }

    return {
        "score": round(score, 1),
        "rating": _rating(score),
        "components": {k: (round(v, 1) if v is not None else None) for k, v in components.items()},
        "metrics": metrics,
        "display": display,
        "deep": {title: rows for title, rows in deep.items() if rows},
        "growth": _growth_cards(company, metrics),
        "statements": _statements(company),
        "highlights": highlights[:6],
        "concerns": concerns[:6],
        "rag": rag_notes,
        "summary": (
            f"Fundamentals screen as {_rating(score).lower()} "
            f"({score:.0f}/100) based on profitability, growth, leverage, cash, and valuation."
        ),
    }
