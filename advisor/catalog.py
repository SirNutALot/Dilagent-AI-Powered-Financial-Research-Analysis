from __future__ import annotations

import json
from typing import Any

from advisor.config import DATA_DIR

CATALOG_PATH = DATA_DIR / "custom_companies.json"


def load_custom() -> list[dict[str, Any]]:
    if not CATALOG_PATH.exists():
        return []
    try:
        rows = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    return rows if isinstance(rows, list) else []


def remember_company(entry: dict[str, Any]) -> dict[str, Any]:
    ticker = str(entry.get("ticker") or "").upper()
    if not ticker:
        raise ValueError("Ticker is required.")
    payload = {
        "ticker": ticker,
        "name": entry.get("name") or ticker,
        "cik": entry.get("cik"),
        "exchange": entry.get("exchange"),
        "reports": entry.get("reports") or "Published financials",
        "origin": "custom",
        "score": 95,
    }
    rows = [row for row in load_custom() if str(row.get("ticker") or "").upper() != ticker]
    rows.append(payload)
    rows.sort(key=lambda row: str(row.get("name") or "").lower())
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_PATH.write_text(json.dumps(rows[:80], indent=2), encoding="utf-8")
    return payload


def find_custom(query: str) -> dict[str, Any] | None:
    raw = (query or "").strip()
    if not raw:
        return None
    upper = raw.upper()
    lower = raw.lower()
    for row in load_custom():
        if str(row.get("ticker") or "").upper() == upper:
            return row
        if str(row.get("name") or "").lower() == lower:
            return row
    return None


def matching_custom(query: str, limit: int = 8) -> list[dict[str, Any]]:
    raw = (query or "").strip().lower()
    rows = load_custom()
    if not raw:
        return rows[:limit]
    hits = []
    for row in rows:
        ticker = str(row.get("ticker") or "").lower()
        name = str(row.get("name") or "").lower()
        if raw == ticker or raw in ticker or raw in name:
            hits.append(row)
    return hits[:limit]
