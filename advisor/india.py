from __future__ import annotations

import csv
import io
import json
import time
from typing import Any

import httpx

from advisor.config import CACHE_DIR, EDGAR_CACHE_TTL, USER_AGENT

NSE_EQUITY_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
_CACHE_PATH = CACHE_DIR / "nse_equities.json"
_ROWS: list[dict[str, Any]] | None = None

_EQ_SERIES = {"EQ", "BE"}


def _headers() -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Accept": "text/csv,*/*",
    }


def _parse(raw: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(raw))
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in reader:
        series = (item.get("SERIES") or item.get(" SERIES") or "").strip().upper()
        symbol = (item.get("SYMBOL") or "").strip().upper()
        name = (item.get("NAME OF COMPANY") or "").strip()
        if not symbol or not name or series not in _EQ_SERIES:
            continue
        ticker = f"{symbol}.NS"
        if ticker in seen:
            continue
        seen.add(ticker)
        rows.append({
            "ticker": ticker,
            "name": name,
            "exchange": "NSE",
            "reports": "NSE / published financials",
            "origin": "nse",
            "score": 70,
        })
    rows.sort(key=lambda row: row["name"].lower())
    return rows


def nse_equities(*, force: bool = False) -> list[dict[str, Any]]:
    global _ROWS
    if _ROWS is not None and not force:
        return _ROWS
    if not force and _CACHE_PATH.exists() and time.time() - _CACHE_PATH.stat().st_mtime < EDGAR_CACHE_TTL:
        try:
            _ROWS = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
            return _ROWS
        except Exception:
            pass
    try:
        with httpx.Client(timeout=25.0, headers=_headers(), follow_redirects=True) as client:
            response = client.get(NSE_EQUITY_URL)
            response.raise_for_status()
        rows = _parse(response.text)
        if rows:
            _CACHE_PATH.write_text(json.dumps(rows), encoding="utf-8")
            _ROWS = rows
            return rows
    except Exception:
        pass
    if _CACHE_PATH.exists():
        _ROWS = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
        return _ROWS
    _ROWS = []
    return _ROWS


def find_nse(query: str) -> dict[str, Any] | None:
    raw = (query or "").strip()
    if not raw:
        return None
    upper = raw.upper()
    core = upper.split(".")[0]
    lower = raw.lower()
    for row in nse_equities():
        ticker = row["ticker"]
        if ticker == upper or ticker.split(".")[0] == core:
            return row
        if row["name"].lower() == lower:
            return row
    return None


def matching_nse(query: str, limit: int = 40) -> list[dict[str, Any]]:
    raw = (query or "").strip().lower()
    rows = nse_equities()
    if not raw:
        return rows[:limit]
    hits: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        ticker = row["ticker"].lower()
        core = ticker.split(".")[0]
        name = row["name"].lower()
        score = 0
        if core == raw or ticker == raw:
            score = 100
        elif name == raw:
            score = 94
        elif core.startswith(raw) or name.startswith(raw):
            score = 80
        elif raw in name:
            score = 48
        if score:
            hits.append((score, row))
    hits.sort(key=lambda item: (-item[0], item[1]["name"]))
    return [item[1] for item in hits[:limit]]
