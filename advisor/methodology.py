from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from advisor.config import APP_NAME, CACHE_DIR, HORIZON_LABELS, HORIZONS, llm_available
from advisor.decision import HORIZON_BLENDS, QUALITY_WEIGHTS
from advisor.filings import SEC_TICKERS_URL
from advisor.fundamental import FUNDAMENTAL_WEIGHTS
from advisor.india import NSE_EQUITY_URL
from advisor.llm import GROQ_MODEL, OPENAI_MODEL
from advisor.news import DESK_FEEDS, SOURCE_FEEDS

_NEWS_HOMES = {
    "Financial Times": "https://www.ft.com/",
    "Reuters Business": "https://www.reuters.com/business/",
    "CNBC": "https://www.cnbc.com/",
    "MarketWatch": "https://www.marketwatch.com/",
    "BBC Business": "https://www.bbc.com/news/business",
    "Yahoo Finance": "https://finance.yahoo.com/",
    "Google News": "https://news.google.com/",
}

MARKETS = (
    {
        "name": "NASDAQ",
        "url": "https://www.nasdaq.com/",
        "access": "SEC EDGAR company list plus Yahoo Finance quotes",
        "kind": "direct",
    },
    {
        "name": "NYSE",
        "url": "https://www.nyse.com/",
        "access": "SEC EDGAR company list plus Yahoo Finance quotes",
        "kind": "direct",
    },
    {
        "name": "NYSE American",
        "url": "https://www.nyse.com/markets/nyse-american",
        "access": "SEC EDGAR company list plus Yahoo Finance quotes",
        "kind": "direct",
    },
    {
        "name": "NYSE Arca",
        "url": "https://www.nyse.com/markets/nyse-arca",
        "access": "SEC EDGAR company list plus Yahoo Finance quotes",
        "kind": "direct",
    },
    {
        "name": "Cboe BZX",
        "url": "https://www.cboe.com/",
        "access": "SEC EDGAR company list plus Yahoo Finance quotes",
        "kind": "direct",
    },
    {
        "name": "National Stock Exchange of India (NSE)",
        "url": "https://www.nseindia.com/",
        "list_url": NSE_EQUITY_URL,
        "list_label": "Official NSE equity list (EQUITY_L.csv)",
        "access": "Dilagent downloads the official NSE equity list and maps symbols to Yahoo .NS tickers",
        "kind": "direct",
    },
    {
        "name": "BSE (formerly Bombay Stock Exchange)",
        "url": "https://www.bseindia.com/",
        "access": "Yahoo Finance quotes for .BO tickers. Dilagent does not download a BSE official list",
        "kind": "yahoo",
    },
    {
        "name": "London Stock Exchange",
        "url": "https://www.londonstockexchange.com/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Euronext",
        "url": "https://www.euronext.com/",
        "access": "Yahoo Finance listed search and quotes (Paris, Amsterdam, Brussels, Lisbon, Milan)",
        "kind": "yahoo",
    },
    {
        "name": "Deutsche Börse / Xetra",
        "url": "https://www.xetra.com/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "SIX Swiss Exchange",
        "url": "https://www.six-group.com/en/products-services/the-swiss-stock-exchange.html",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Japan Exchange Group (TSE / JPX)",
        "url": "https://www.jpx.co.jp/english/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Hong Kong Exchanges (HKEX)",
        "url": "https://www.hkex.com.hk/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Shanghai Stock Exchange",
        "url": "https://www.sse.com.cn/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Shenzhen Stock Exchange",
        "url": "https://www.szse.cn/English/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Taiwan Stock Exchange",
        "url": "https://www.twse.com.tw/en/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Korea Exchange (KRX / KOSDAQ)",
        "url": "https://www.krx.co.kr/main/main.jsp",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Singapore Exchange (SGX)",
        "url": "https://www.sgx.com/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Australian Securities Exchange (ASX)",
        "url": "https://www.asx.com.au/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Toronto Stock Exchange (TSX)",
        "url": "https://www.tsx.com/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "B3 (Brazil)",
        "url": "https://www.b3.com.br/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
    {
        "name": "Johannesburg Stock Exchange (JSE)",
        "url": "https://www.jse.co.za/",
        "access": "Yahoo Finance listed search and quotes",
        "kind": "yahoo",
    },
)


def _pct(value: float) -> str:
    return f"{round(value * 100):.0f}%"


def _cached_len(name: str) -> int | None:
    path = CACHE_DIR / name
    if not path.exists():
        return None
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if isinstance(rows, list):
        return len(rows)
    if isinstance(rows, dict):
        return len(rows)
    return None


def _news_outlets() -> list[dict[str, str]]:
    names: list[str] = []
    for row in SOURCE_FEEDS + DESK_FEEDS:
        name = row[0]
        if name not in names:
            names.append(name)
    return [{"name": name, "url": _NEWS_HOMES.get(name, "")} for name in names]


def methodology() -> dict[str, Any]:
    return {
        "name": APP_NAME,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "horizons": [{"days": days, "label": HORIZON_LABELS[days]} for days in HORIZONS],
        "quality_weights": {key: _pct(value) for key, value in QUALITY_WEIGHTS.items()},
        "horizon_blends": [
            {
                "label": row["label"],
                "fundamental": _pct(row["fundamental"]),
                "technical": _pct(row["technical"]),
                "news": _pct(row["news"]),
            }
            for row in HORIZON_BLENDS
        ],
        "fundamental_weights": [
            {"label": key.replace("_", " ").capitalize(), "weight": _pct(value)}
            for key, value in FUNDAMENTAL_WEIGHTS.items()
        ],
        "llm": {
            "available": llm_available(),
            "groq_model": GROQ_MODEL,
            "openai_model": OPENAI_MODEL,
            "groq_url": "https://console.groq.com/",
            "openai_url": "https://platform.openai.com/",
        },
        "coverage": {
            "sec_filers": _cached_len("edgar_tickers.json"),
            "nse_equities": _cached_len("nse_equities.json"),
        },
        "markets": list(MARKETS),
        "sources": [
            {
                "name": "SEC EDGAR",
                "url": "https://www.sec.gov/edgar",
                "detail": "US company tickers and 10-K / 10-Q HTML when a CIK exists.",
                "extra_url": SEC_TICKERS_URL,
                "extra_label": "SEC company tickers JSON",
            },
            {
                "name": "Yahoo Finance",
                "url": "https://finance.yahoo.com/",
                "detail": "Prices, statements, and published ratios used in Analytics, Discover, and Watchlist (via yfinance).",
                "extra_url": "https://pypi.org/project/yfinance/",
                "extra_label": "yfinance package",
            },
            {
                "name": "National Stock Exchange of India (NSE)",
                "url": "https://www.nseindia.com/",
                "detail": "Official NSE equity list, mapped to Yahoo .NS tickers.",
                "extra_url": NSE_EQUITY_URL,
                "extra_label": "NSE EQUITY_L.csv",
            },
            {
                "name": "TradingView",
                "url": "https://www.tradingview.com/",
                "detail": "Embedded daily charts on Analytics, Watchlist, and Dashboard. Not used as a Dilagent score input.",
            },
            {
                "name": "News RSS",
                "url": "",
                "detail": "Company-linked headlines from the outlets listed below. This is a language screen, not a legal review.",
            },
            {
                "name": "Your PDF",
                "url": "",
                "detail": "An uploaded annual report is indexed locally and can add filing notes to the fundamental score.",
            },
        ],
        "news": _news_outlets(),
    }
