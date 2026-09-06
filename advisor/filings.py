from __future__ import annotations

import json
import threading
import time
from typing import Any

import httpx

from advisor.config import CACHE_DIR, EDGAR_CACHE_TTL, FILINGS_DIR, SEC_USER_AGENT
from advisor.catalog import matching_custom
from advisor.rag import has_filing, index_payloads

_TICKERS: list[dict[str, Any]] | None = None
ANNUAL_FORMS = ("10-K", "20-F", "40-F")
QUARTERLY_FORMS = ("10-Q",)
FEATURED_TICKERS = (
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "JPM", "JNJ", "XOM", "BRK-B", "V", "UNH", "WMT", "PG", "COST",
)
SEC_HEADERS = {
    "User-Agent": SEC_USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
}


def _client() -> httpx.Client:
    return httpx.Client(timeout=40.0, headers=SEC_HEADERS, follow_redirects=True)


def _edgar_tickers() -> list[dict[str, Any]]:
    global _TICKERS
    if _TICKERS is not None:
        return _TICKERS
    cache = CACHE_DIR / "edgar_tickers.json"
    if cache.exists() and time.time() - cache.stat().st_mtime < EDGAR_CACHE_TTL:
        _TICKERS = json.loads(cache.read_text(encoding="utf-8"))
        return _TICKERS
    try:
        with _client() as client:
            response = client.get("https://www.sec.gov/files/company_tickers.json")
            response.raise_for_status()
            rows = list(response.json().values())
        cache.write_text(json.dumps(rows), encoding="utf-8")
        _TICKERS = rows
        return rows
    except Exception:
        if cache.exists():
            _TICKERS = json.loads(cache.read_text(encoding="utf-8"))
            return _TICKERS
        return []


def _filer_row(row: dict[str, Any], score: int = 0) -> dict[str, Any]:
    return {
        "ticker": str(row.get("ticker") or "").upper(),
        "name": str(row.get("title") or "").strip(),
        "cik": str(row["cik_str"]).zfill(10),
        "reports": "10-K / 10-Q",
        "score": score,
    }


def featured_filers(limit: int = 12) -> list[dict[str, Any]]:
    by_ticker = {
        str(row.get("ticker") or "").upper(): row
        for row in _edgar_tickers()
    }
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for ticker in FEATURED_TICKERS:
        row = by_ticker.get(ticker)
        if not row or ticker in seen:
            continue
        seen.add(ticker)
        out.append(_filer_row(row, 90))
        if len(out) >= limit:
            break
    return out


_SORTED_FILERS: list[dict[str, Any]] | None = None


def _sorted_filers() -> list[dict[str, Any]]:
    global _SORTED_FILERS
    if _SORTED_FILERS is None:
        _SORTED_FILERS = sorted(
            [row for row in _edgar_tickers() if row.get("ticker") and row.get("title")],
            key=lambda row: str(row.get("title") or "").lower(),
        )
    return _SORTED_FILERS


def _match_score(query: str, ticker: str, title: str, cik: str = "") -> int:
    q = query.lower().strip()
    t = ticker.lower()
    n = title.lower()
    legal = n.split(",")[0]
    digits = "".join(ch for ch in q if ch.isdigit())
    cik_digits = "".join(ch for ch in str(cik) if ch.isdigit())
    if cik_digits and digits and (cik_digits == digits or cik_digits.lstrip("0") == digits.lstrip("0")):
        return 96
    if t == q:
        return 100
    if t.startswith(q):
        return 82
    if legal == q or legal == f"{q} inc." or legal == f"{q} inc":
        return 94
    if n.startswith(q):
        return 74
    if q in n:
        return 48
    tokens = [tok for tok in q.split() if len(tok) > 1]
    if tokens and all(tok in n for tok in tokens):
        return 42
    return 0


_BROWSE_ROWS: list[dict[str, Any]] | None = None


def _browse_rows() -> list[dict[str, Any]]:
    global _BROWSE_ROWS
    if _BROWSE_ROWS is None:
        _BROWSE_ROWS = [_filer_row(row, 10) for row in _sorted_filers()]
    return _BROWSE_ROWS


def warm_filers() -> None:
    def _run() -> None:
        try:
            _browse_rows()
        except Exception:
            pass
    threading.Thread(target=_run, daemon=True).start()


def list_filers(query: str, limit: int = 40, offset: int = 0) -> dict[str, Any]:
    raw = (query or "").strip()
    custom = matching_custom(raw, limit=80)
    if len(raw) < 2:
        universe = _browse_rows()
        seen = {row["ticker"] for row in custom}
        merged = custom + [row for row in universe if row["ticker"] not in seen]
        merged.sort(key=lambda row: (str(row.get("name") or "").lower(), row.get("ticker") or ""))
    else:
        hits: list[tuple[int, dict[str, Any]]] = []
        for row in _edgar_tickers():
            ticker = str(row.get("ticker") or "").strip()
            title = str(row.get("title") or "").strip()
            if not ticker or not title:
                continue
            score = _match_score(raw, ticker, title, str(row.get("cik_str") or ""))
            if score:
                hits.append((score, _filer_row(row, score)))
        hits.sort(key=lambda item: (-item[0], item[1]["name"]))
        seen = {row["ticker"] for row in custom}
        merged = custom + [item[1] for item in hits if item[1]["ticker"] not in seen]
    total = len(merged)
    page = merged[offset:offset + limit]
    return {
        "results": page,
        "offset": offset,
        "limit": limit,
        "total": total,
        "has_more": offset + len(page) < total,
    }


def search_filers(query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Companies Dilagent can actually pull reports for: SEC 10-K / 10-Q filers."""
    return list_filers(query, limit=limit, offset=0)["results"]


def lookup_cik(ticker: str, name: str) -> str | None:
    rows = _edgar_tickers()
    if not rows:
        return None
    symbols = {ticker.upper(), ticker.split(".")[0].upper()}
    for row in rows:
        if str(row.get("ticker") or "").upper() in symbols:
            return str(row["cik_str"]).zfill(10)
    needle = (name or "").strip().lower()
    if len(needle) < 4:
        return None
    for row in rows:
        title = str(row.get("title") or "").lower()
        if title == needle:
            return str(row["cik_str"]).zfill(10)
    return None


def _meta_path(ticker: str):
    return FILINGS_DIR / ticker.upper() / "meta.json"


def load_filing_meta(ticker: str) -> dict[str, Any] | None:
    path = _meta_path(ticker)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def mark_uploaded_report(ticker: str) -> None:
    _save_meta(ticker, {
        "source": "upload",
        "form": "Uploaded report",
        "label": "Uploaded company report",
    })


def _save_meta(ticker: str, meta: dict[str, Any]) -> None:
    path = _meta_path(ticker)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, indent=2), encoding="utf-8")


def _pick_form(recent: dict[str, Any], forms: tuple[str, ...]) -> int | None:
    for i, form in enumerate(recent.get("form") or []):
        if form in forms:
            return i
    return None


def _download_index(client: httpx.Client, cik: str, recent: dict[str, Any], index: int, kind: str) -> dict[str, Any]:
    accession = recent["accessionNumber"][index]
    document = recent["primaryDocument"][index]
    filed = recent["filingDate"][index]
    form = recent["form"][index]
    url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-', '')}/{document}"
    file_response = client.get(url)
    file_response.raise_for_status()
    return {
        "kind": kind,
        "form": form,
        "accession": accession,
        "document": document,
        "filed": filed,
        "url": url,
        "content": file_response.content,
    }


def _download_reports(cik: str) -> list[dict[str, Any]]:
    with _client() as client:
        response = client.get(f"https://data.sec.gov/submissions/CIK{cik}.json")
        response.raise_for_status()
        recent = response.json().get("filings", {}).get("recent", {})
        docs: list[dict[str, Any]] = []
        annual = _pick_form(recent, ANNUAL_FORMS)
        quarterly = _pick_form(recent, QUARTERLY_FORMS)
        if annual is not None:
            docs.append(_download_index(client, cik, recent, annual, "annual"))
        if quarterly is not None:
            docs.append(_download_index(client, cik, recent, quarterly, "quarterly"))
        return docs


def published_sources(ticker: str, website: str | None = None) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(label: str, url: str | None) -> None:
        if not url or url in seen:
            return
        seen.add(url)
        sources.append({"label": label, "url": url})

    add("Company website", website)
    if ticker:
        add("Yahoo Finance profile", f"https://finance.yahoo.com/quote/{ticker}")
        add("Yahoo Finance financials", f"https://finance.yahoo.com/quote/{ticker}/financials")
    return sources


def filing_sources(meta: dict[str, Any], cik: str | None) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(label: str, url: str | None) -> None:
        if not url or url in seen:
            return
        seen.add(url)
        sources.append({"label": label, "url": url})

    add(f"{meta.get('form') or 'Annual report'} filed {meta.get('filed') or ''}".strip(), meta.get("url"))
    quarterly = meta.get("quarterly") or {}
    add(f"{quarterly.get('form') or '10-Q'} filed {quarterly.get('filed') or ''}".strip(), quarterly.get("url"))
    for row in meta.get("reports") or []:
        add(f"{row.get('form') or 'Filing'} filed {row.get('filed') or ''}".strip(), row.get("url"))
    if cik:
        add(
            "All SEC filings for this company",
            f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&owner=exclude&count=40",
        )
    return sources


def _label(docs_meta: list[dict[str, Any]]) -> str:
    parts = [f"{row['form']} filed {row['filed']}" for row in docs_meta]
    return " · ".join(parts) + " (SEC)" if parts else "SEC reports on file"


def ensure_annual_report(ticker: str, name: str, cik: str | None) -> dict[str, Any]:
    cached = load_filing_meta(ticker) if has_filing(ticker) else None
    if cached and cached.get("quarterly"):
        payload = {
            "used": True,
            "source": cached.get("source", "cached"),
            "form": cached.get("form"),
            "filed": cached.get("filed"),
            "url": cached.get("url"),
            "quarterly": cached.get("quarterly"),
            "reports": cached.get("reports") or [],
            "label": cached.get("label") or "SEC reports on file",
        }
        payload["sources"] = filing_sources(payload, cik)
        return payload
    if not cik:
        if has_filing(ticker):
            uploaded = load_filing_meta(ticker) or {
                "source": "upload",
                "form": "Uploaded report",
                "label": "Uploaded company report",
            }
            uploaded["used"] = True
            uploaded["sources"] = filing_sources(uploaded, None)
            if not uploaded.get("label"):
                uploaded["label"] = "Uploaded company report"
            return uploaded
        return {
            "used": False,
            "source": None,
            "label": "No SEC 10-K/10-Q for this listing. Dilagent used published financials. Upload the company’s report for a deeper read.",
            "sources": published_sources(ticker),
        }
    try:
        payloads = _download_reports(cik)
    except Exception:
        return {
            "used": False,
            "source": None,
            "label": "Could not reach the SEC filing archive. Dilagent used published financials.",
            "sources": published_sources(ticker),
        }
    if not payloads:
        return {
            "used": False,
            "source": None,
            "label": "No 10-K or 10-Q on file at the SEC.",
            "sources": published_sources(ticker),
        }
    index_payloads(ticker, payloads)
    annual = next((row for row in payloads if row["kind"] == "annual"), payloads[0])
    quarterly = next((row for row in payloads if row["kind"] == "quarterly"), None)
    slim = [{k: row[k] for k in ("kind", "form", "filed", "url", "accession")} for row in payloads]
    meta = {
        "source": "sec",
        "form": annual["form"],
        "filed": annual["filed"],
        "url": annual["url"],
        "accession": annual["accession"],
        "quarterly": (
            {"form": quarterly["form"], "filed": quarterly["filed"], "url": quarterly["url"]}
            if quarterly else None
        ),
        "reports": slim,
        "label": _label(slim),
    }
    _save_meta(ticker, meta)
    meta["sources"] = filing_sources(meta, cik)
    return {"used": True, **meta}
