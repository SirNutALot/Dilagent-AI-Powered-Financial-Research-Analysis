from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import yfinance as yf

from advisor.config import CACHE_DIR, EDGAR_CACHE_TTL, MARKET_CACHE_TTL
from advisor.filings import FEATURED_TICKERS, search_filers
from advisor.resolve import search_listed
from advisor.scoring import safe_float

_PROFILE_DIR = CACHE_DIR / "profiles"
_PROFILE_DIR.mkdir(parents=True, exist_ok=True)

SEED_TICKERS = list(FEATURED_TICKERS)


def _num(value: Any) -> float | None:
    return safe_float(value)


def _cache_path(ticker: str):
    safe = "".join(ch if ch.isalnum() or ch in {"-", "."} else "_" for ch in ticker)
    return _PROFILE_DIR / f"{safe}.json"


def _read_cache(ticker: str) -> dict[str, Any] | None:
    path = _cache_path(ticker)
    if not path.exists():
        return None
    if time.time() - path.stat().st_mtime > max(MARKET_CACHE_TTL, 6 * 60 * 60):
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_cache(row: dict[str, Any]) -> None:
    ticker = row.get("ticker")
    if not ticker:
        return
    _cache_path(ticker).write_text(json.dumps(row), encoding="utf-8")


def _earnings_trend(annual: float | None, quarterly: float | None) -> str | None:
    if annual is None and quarterly is None:
        return None
    if quarterly is not None and annual is not None:
        if quarterly > annual and quarterly > 0:
            return "improving"
        if quarterly < 0 and (annual is None or quarterly < annual):
            return "declining"
        if abs((quarterly or 0) - (annual or 0)) < 0.03:
            return "stable"
        return "improving" if quarterly > annual else "declining"
    growth = quarterly if quarterly is not None else annual
    if growth is None:
        return None
    if growth > 0.03:
        return "improving"
    if growth < -0.03:
        return "declining"
    return "stable"


def _earnings_event(info: dict[str, Any], handle: Any) -> dict[str, Any]:
    event: dict[str, Any] = {}
    stamp = info.get("mostRecentQuarter") or info.get("earningsTimestamp")
    if stamp:
        try:
            event["recent_earnings"] = time.strftime("%Y-%m-%d", time.gmtime(int(stamp)))
        except Exception:
            pass
    try:
        calendar = getattr(handle, "calendar", None)
        next_date = None
        if isinstance(calendar, dict):
            next_date = calendar.get("Earnings Date") or calendar.get("earningsDate")
        elif calendar is not None and hasattr(calendar, "get"):
            next_date = calendar.get("Earnings Date")
        if next_date is not None:
            if hasattr(next_date, "iloc"):
                next_date = next_date.iloc[0] if len(next_date) else None
            if hasattr(next_date, "strftime"):
                event["upcoming_earnings"] = next_date.strftime("%Y-%m-%d")
            elif next_date:
                event["upcoming_earnings"] = str(next_date)[:10]
    except Exception:
        pass
    surprise = _num(info.get("earningsQuarterlyGrowth"))
    if surprise is not None:
        event["earnings_surprise"] = surprise
    return event


def snapshot(ticker: str, *, force: bool = False) -> dict[str, Any] | None:
    symbol = (ticker or "").strip().upper()
    if not symbol:
        return None
    if not force:
        cached = _read_cache(symbol)
        if cached:
            return cached
    try:
        handle = yf.Ticker(symbol)
        try:
            info = handle.info or {}
        except Exception:
            info = {}
        if not info:
            try:
                info = handle.get_info() or {}
            except Exception:
                info = {}
        name = info.get("longName") or info.get("shortName")
        if not name and not info.get("marketCap"):
            return None
        annual = _num(info.get("earningsGrowth"))
        quarterly = _num(info.get("earningsQuarterlyGrowth"))
        row = {
            "ticker": symbol,
            "name": name or symbol,
            "sector": info.get("sector") or "",
            "industry": info.get("industry") or "",
            "exchange": info.get("exchange") or info.get("fullExchangeName") or "",
            "country": info.get("country") or "",
            "market_cap": _num(info.get("marketCap")),
            "revenue": _num(info.get("totalRevenue")),
            "revenue_growth": _num(info.get("revenueGrowth")),
            "earnings_growth": annual if annual is not None else quarterly,
            "earnings_quarterly_growth": quarterly,
            "earnings_trend": _earnings_trend(annual, quarterly),
            "roe": _num(info.get("returnOnEquity")),
            "roa": _num(info.get("returnOnAssets")),
            "gross_margin": _num(info.get("grossMargins")),
            "operating_margin": _num(info.get("operatingMargins")),
            "profit_margin": _num(info.get("profitMargins")),
            "pe": _num(info.get("trailingPE")),
            "forward_pe": _num(info.get("forwardPE")),
            "pb": _num(info.get("priceToBook")),
            "ps": _num(info.get("priceToSalesTrailing12Months")),
            "ev_ebitda": _num(info.get("enterpriseToEbitda")),
            "debt_to_equity": _num(info.get("debtToEquity")),
            "current_ratio": _num(info.get("currentRatio")),
            "free_cashflow": _num(info.get("freeCashflow")),
            "listed": "." in symbol or not info.get("cik"),
        }
        row.update(_earnings_event(info, handle))
        if not row["name"]:
            return None
        _write_cache(row)
        return row
    except Exception:
        return None


def hydrate(tickers: list[str], limit: int = 28) -> list[dict[str, Any]]:
    seen: set[str] = set()
    ordered: list[str] = []
    for ticker in tickers:
        symbol = (ticker or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        ordered.append(symbol)
        if len(ordered) >= limit:
            break
    rows: list[dict[str, Any]] = []
    missing = []
    for symbol in ordered:
        cached = _read_cache(symbol)
        if cached:
            rows.append(cached)
        else:
            missing.append(symbol)
    if missing:
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(snapshot, symbol): symbol for symbol in missing}
            try:
                for future in as_completed(futures, timeout=28):
                    try:
                        row = future.result()
                    except Exception:
                        row = None
                    if row:
                        rows.append(row)
            except TimeoutError:
                pass
    by_ticker = {row["ticker"]: row for row in rows}
    return [by_ticker[symbol] for symbol in ordered if symbol in by_ticker]


def _search_tickers(query: str) -> list[str]:
    raw = (query or "").strip()
    if len(raw) < 2:
        return []
    names: list[str] = []
    try:
        for row in search_filers(raw, limit=16):
            if row.get("ticker"):
                names.append(row["ticker"])
    except Exception:
        pass
    try:
        for row in search_listed(raw, limit=12):
            if row.get("ticker"):
                names.append(row["ticker"])
    except Exception:
        pass
    return names


def cached_universe() -> list[str]:
    names: list[str] = []
    if _PROFILE_DIR.exists():
        cutoff = time.time() - EDGAR_CACHE_TTL
        for path in _PROFILE_DIR.glob("*.json"):
            if path.stat().st_mtime < cutoff:
                continue
            try:
                row = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if row.get("ticker"):
                names.append(row["ticker"])
    return names


def discover(
    query: str = "",
    *,
    extra: list[str] | None = None,
    similar: str = "",
    limit: int = 40,
) -> dict[str, Any]:
    tickers: list[str] = []
    if similar:
        seed = snapshot(similar) or snapshot(query)
        related = similar_tickers(similar or query, seed)
        tickers.extend(related)
    if query:
        tickers.extend(_search_tickers(query))
        if query.upper() not in {item.upper() for item in tickers}:
            tickers.insert(0, query)
    tickers.extend(extra or [])
    if not query and not similar:
        tickers.extend(SEED_TICKERS)
        tickers.extend(cached_universe())
    rows = hydrate(tickers, limit=limit)
    return {
        "results": rows,
        "count": len(rows),
        "note": (
            "Figures are published Yahoo Finance fields only. "
            "Dilagent scores appear after a Due Diligence run."
        ),
    }


def similar_tickers(query: str, seed: dict[str, Any] | None = None) -> list[str]:
    seed = seed or snapshot(query)
    if not seed:
        return _search_tickers(query)
    probes = [seed.get("industry") or "", seed.get("sector") or "", seed.get("name") or ""]
    names: list[str] = []
    for probe in probes:
        token = " ".join(str(probe).replace("—", " ").replace("-", " ").split()[:3])
        if len(token) < 3:
            continue
        names.extend(_search_tickers(token))
    names.extend(cached_universe())
    names.extend(SEED_TICKERS)
    out: list[str] = []
    seen = {seed["ticker"]}
    for ticker in names:
        symbol = ticker.upper()
        if symbol in seen:
            continue
        seen.add(symbol)
        out.append(symbol)
    return out


def similar_companies(query: str, limit: int = 12) -> dict[str, Any]:
    seed = snapshot(query)
    if not seed:
        return {"seed": None, "results": []}
    rows = hydrate(similar_tickers(query, seed), limit=24)

    def closeness(row: dict[str, Any]) -> tuple:
        score = 0
        if row.get("industry") and row.get("industry") == seed.get("industry"):
            score += 6
        if row.get("sector") and row.get("sector") == seed.get("sector"):
            score += 4
        if row.get("country") and row.get("country") == seed.get("country"):
            score += 1
        cap_a = seed.get("market_cap") or 0
        cap_b = row.get("market_cap") or 0
        if cap_a and cap_b:
            ratio = max(cap_a, cap_b) / min(cap_a, cap_b)
            if ratio <= 3:
                score += 2
            elif ratio <= 8:
                score += 1
        rev_a = seed.get("revenue") or 0
        rev_b = row.get("revenue") or 0
        if rev_a and rev_b:
            ratio = max(rev_a, rev_b) / min(rev_a, rev_b)
            if ratio <= 3:
                score += 1
        return (-score, row.get("name") or "")

    ranked = [row for row in rows if row["ticker"] != seed["ticker"]]
    ranked.sort(key=closeness)
    return {"seed": seed, "results": ranked[:limit]}
