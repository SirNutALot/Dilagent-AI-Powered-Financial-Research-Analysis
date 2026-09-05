from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

APP_NAME = "Dilagent"

DATA_DIR = ROOT / "data"
FILINGS_DIR = DATA_DIR / "filings"
CACHE_DIR = DATA_DIR / "cache"
WEB_DIR = ROOT / "web"

FILINGS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

HORIZONS = (1, 5, 10, 30, 60, 90, 180, 365, 730, 1095, 1825)
HORIZON_LABELS = {
    1: "1 day",
    5: "1 week",
    10: "2 weeks",
    30: "1 month",
    60: "2 months",
    90: "1 quarter",
    180: "6 months",
    365: "1 year",
    730: "2 years",
    1095: "3 years",
    1825: "5 years",
}

USER_AGENT = (
    "Dilagent/1.0 (educational research desk; dilagent@localhost) "
    "Mozilla/5.0"
)
SEC_USER_AGENT = "Dilagent Research contact@dilagent.app"

NEWS_TIMEOUT = 8.0
MARKET_CACHE_TTL = 15 * 60
NEWS_CACHE_TTL = 10 * 60
EDGAR_CACHE_TTL = 24 * 60 * 60


def groq_key() -> str | None:
    return os.getenv("GROQ_API_KEY") or None


def openai_key() -> str | None:
    return os.getenv("OPENAI_API_KEY") or None


def llm_available() -> bool:
    return bool(groq_key() or openai_key())
