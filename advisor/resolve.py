from __future__ import annotations

from typing import Any

import yfinance as yf

from advisor.catalog import find_custom, matching_custom, remember_company
from advisor.filings import lookup_cik, search_filers


def _looks_listed(query: str) -> bool:
    raw = query.strip().upper()
    return "." in raw or "-" in raw and raw.split("-")[-1] in {"A", "B", "C"}


def search_listed(query: str, limit: int = 8) -> list[dict[str, Any]]:
    raw = (query or "").strip()
    if len(raw) < 2:
        return []
    try:
        search = yf.Search(raw, max_results=limit, news_count=0, raise_errors=False)
        quotes = [q for q in (search.quotes or []) if q.get("symbol")]
    except Exception:
        quotes = []

    hits: list[dict[str, Any]] = []
    seen: set[str] = set()
    for quote in quotes:
        kind = quote.get("quoteType") or "EQUITY"
        if kind not in {"EQUITY", "ETF"}:
            continue
        ticker = str(quote["symbol"]).upper()
        if ticker in seen:
            continue
        seen.add(ticker)
        name = quote.get("longname") or quote.get("shortname") or ticker
        cik = lookup_cik(ticker, name)
        hits.append({
            "ticker": ticker,
            "name": name,
            "exchange": quote.get("exchDisp") or quote.get("exchange"),
            "cik": cik,
            "reports": "10-K / 10-Q" if cik else "Published financials",
            "origin": "listed",
            "score": 80,
        })
        if len(hits) >= limit:
            break
    return hits


def _from_sec(query: str) -> dict[str, Any] | None:
    hits = search_filers(query, limit=8)
    sec_only = [row for row in hits if row.get("origin") != "custom"]
    if not sec_only:
        return None
    raw = query.strip()
    exact = [
        row for row in sec_only
        if row["ticker"] == raw.upper() or row["name"].lower() == raw.lower()
    ]
    if exact:
        return exact[0]
    if sec_only[0]["score"] >= 80 and (len(sec_only) == 1 or sec_only[0]["score"] - sec_only[1]["score"] >= 12):
        return sec_only[0]
    if len(sec_only) == 1:
        return sec_only[0]
    return None


def resolve_company(query: str, *, allow_listed: bool = False) -> dict[str, Any]:
    raw = (query or "").strip()
    if not raw:
        raise ValueError("Enter a company name.")

    custom = find_custom(raw)
    if custom:
        return {**custom, "query": raw}
    nearby = matching_custom(raw, limit=5)
    if len(nearby) == 1:
        return {**nearby[0], "query": raw}

    sec = _from_sec(raw)
    if sec:
        return {
            "query": raw,
            "ticker": sec["ticker"],
            "name": sec["name"],
            "cik": sec.get("cik") or lookup_cik(sec["ticker"], sec["name"]),
            "reports": sec.get("reports"),
            "origin": "sec",
        }

    if not allow_listed and not _looks_listed(raw):
        raise ValueError(
            "That name is not in the SEC list. Use “Company not listed?” "
            "to add a Yahoo-listed name such as TCS.NS."
        )

    hits = search_listed(raw)
    chosen = None
    if hits:
        exact = [row for row in hits if row["ticker"] == raw.upper() or row["name"].lower() == raw.lower()]
        chosen = exact[0] if exact else hits[0]
    if chosen is None:
        raise ValueError(f"No listed company matches '{raw}'.")

    saved = remember_company(chosen)
    return {**saved, "query": raw, "cik": chosen.get("cik")}
