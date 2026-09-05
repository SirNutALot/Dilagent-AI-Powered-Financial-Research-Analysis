from __future__ import annotations

from typing import Any

from advisor.config import HORIZONS, HORIZON_LABELS, llm_available
from advisor.decision import combine
from advisor.filings import ensure_annual_report
from advisor.fundamental import analyze_fundamentals
from advisor.llm import narrate
from advisor.market import fetch_company
from advisor.news import analyze_news
from advisor.rag import analyze_filing, has_filing
from advisor.catalog import remember_company
from advisor.resolve import resolve_company
from advisor.technical import analyze_technicals

_TV_EXCHANGE = {
    "NMS": "NASDAQ",
    "NGM": "NASDAQ",
    "NCM": "NASDAQ",
    "NAS": "NASDAQ",
    "NYQ": "NYSE",
    "NYE": "NYSE",
    "PCX": "NYSEARCA",
    "ASE": "AMEX",
    "BTS": "BATS",
    "NSI": "NSE",
    "BSE": "BSE",
}


def _why_fundamental(data: dict[str, Any]) -> str:
    bits = list(data.get("highlights") or []) + list(data.get("concerns") or [])
    return (
        f"Fundamentals sit at {data['score']:.0f}% after scoring profitability, growth, "
        f"leverage, cash generation, and valuation. "
        + " ".join(bits[:3])
    ).strip()


def _why_technical(data: dict[str, Any]) -> str:
    bits = list(data.get("highlights") or []) + list(data.get("concerns") or [])
    return (
        f"Technical confidence is {data['score']:.0f}% from trend, RSI, MACD, volume, "
        f"and stretch versus the 52-week range. This is entry timing, not business quality. "
        + " ".join(bits[:3])
    ).strip()


def _why_news(data: dict[str, Any]) -> str:
    counts = data.get("counts") or {}
    return (
        f"News confidence is {data['score']:.0f}% because controversy is {data.get('controversy')}. "
        f"{counts.get('elevated', 0)} elevated and {counts.get('severe', 0)} severe headlines "
        f"were flagged in the latest scan. "
        + " ".join((data.get("concerns") or data.get("highlights") or [])[:2])
    ).strip()


def _tradingview(ticker: str, exchange: str | None) -> dict[str, str]:
    prefix = _TV_EXCHANGE.get((exchange or "").upper())
    core = ticker.split(".")[0] if ticker else ticker
    symbol = f"{prefix}:{core}" if prefix else ticker
    return {
        "symbol": symbol,
        "url": f"https://www.tradingview.com/chart/?symbol={symbol}",
    }


def analyze(query: str, horizon: int = 90, *, use_llm: bool = True, allow_listed: bool = False) -> dict[str, Any]:
    if horizon not in HORIZONS:
        raise ValueError(f"Horizon must be one of {HORIZONS}.")

    identity = resolve_company(query, allow_listed=allow_listed)
    symbol = identity["ticker"]
    company = fetch_company(symbol)
    if identity.get("origin") in {"listed", "custom"}:
        remember_company({
            **identity,
            "name": company["name"],
            "exchange": company.get("exchange") or identity.get("exchange"),
        })
    filing = ensure_annual_report(symbol, company["name"], identity.get("cik"))
    rag_notes = analyze_filing(symbol)
    fundamental = analyze_fundamentals(company, rag_notes)
    technical = analyze_technicals(company["history"], horizon)
    news = analyze_news(symbol, company["name"], company.get("handle"))
    fundamental["why"] = _why_fundamental(fundamental)
    technical["why"] = _why_technical(technical)
    news["why"] = _why_news(news)
    verdict = combine(fundamental, technical, news, horizon)

    briefing = None
    if use_llm and llm_available():
        briefing = narrate({
            "company": {
                "ticker": symbol,
                "name": company["name"],
                "sector": company["sector"],
                "industry": company["industry"],
            },
            "horizon": horizon,
            "verdict": verdict,
            "fundamental": fundamental,
            "technical": technical,
            "news": news,
            "filing": filing,
        })

    if not briefing:
        filing_note = f" {filing.get('label')}" if filing.get("used") else ""
        briefing = (
            f"{verdict['label']} for {company['name']} over a "
            f"{HORIZON_LABELS[horizon]} horizon. {verdict['thesis']} "
            f"Company quality {verdict['quality_score']:.0f}%; "
            f"entry timing {verdict['timing_score']:.0f}%.{filing_note}"
        )

    change = None
    if company.get("price") and company.get("previous_close"):
        change = (company["price"] - company["previous_close"]) / company["previous_close"]

    return {
        "company": {
            "query": identity["query"],
            "ticker": symbol,
            "name": company["name"],
            "sector": company["sector"],
            "industry": company["industry"],
            "country": company["country"],
            "currency": company["currency"],
            "exchange": company["exchange"],
            "website": company["website"],
            "summary": company.get("summary"),
            "price": company.get("price"),
            "previous_close": company.get("previous_close"),
            "change": change,
            "market_cap": company.get("market_cap"),
            "cik": identity.get("cik"),
            "has_filing": has_filing(symbol) or bool(rag_notes),
            "filing": filing,
            "tradingview": _tradingview(symbol, company.get("exchange")),
        },
        "horizon": horizon,
        "horizon_label": HORIZON_LABELS[horizon],
        "verdict": verdict,
        "fundamental": fundamental,
        "technical": technical,
        "news": news,
        "briefing": briefing,
        "disclaimer": (
            "Educational research only. Results can be wrong. "
            "This is not investment advice, a solicitation, or a recommendation personalized to you."
        ),
    }
