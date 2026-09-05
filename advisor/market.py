from __future__ import annotations

import time
from typing import Any

import pandas as pd
import yfinance as yf

from advisor.config import MARKET_CACHE_TTL
from advisor.scoring import safe_float

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def normalize_ticker(raw: str) -> str:
    ticker = (raw or "").strip().upper()
    if not ticker:
        raise ValueError("Ticker is required.")
    return ticker


def _flatten_columns(frame: pd.DataFrame) -> pd.DataFrame:
    if isinstance(frame.columns, pd.MultiIndex):
        frame = frame.copy()
        frame.columns = frame.columns.droplevel(1)
    return frame


def _info(ticker: yf.Ticker) -> dict[str, Any]:
    try:
        info = ticker.info or {}
    except Exception:
        info = {}
    if not info:
        try:
            info = ticker.get_info() or {}
        except Exception:
            info = {}
    return info


def fetch_company(ticker: str, *, force: bool = False) -> dict[str, Any]:
    symbol = normalize_ticker(ticker)
    now = time.time()
    cached = _CACHE.get(symbol)
    if cached and not force and now - cached[0] < MARKET_CACHE_TTL:
        return cached[1]

    handle = yf.Ticker(symbol)
    info = _info(handle)
    history = handle.history(period="10y", auto_adjust=True, timeout=25)
    history = _flatten_columns(history)
    if history.empty or "Close" not in history.columns:
        raise ValueError(f"No market data found for '{symbol}'. Try the full company name.")

    name = info.get("longName") or info.get("shortName") or symbol
    payload = {
        "ticker": symbol,
        "name": name,
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "country": info.get("country"),
        "currency": info.get("currency") or info.get("financialCurrency") or "USD",
        "exchange": info.get("exchange"),
        "summary": info.get("longBusinessSummary"),
        "website": info.get("website"),
        "info": info,
        "history": history,
        "financials": handle.financials,
        "quarterly_financials": handle.quarterly_financials,
        "balance_sheet": handle.balance_sheet,
        "quarterly_balance_sheet": handle.quarterly_balance_sheet,
        "cashflow": handle.cashflow,
        "quarterly_cashflow": handle.quarterly_cashflow,
        "price": safe_float(info.get("currentPrice")) or safe_float(history["Close"].iloc[-1]),
        "previous_close": safe_float(info.get("previousClose")) or safe_float(history["Close"].iloc[-2] if len(history) > 1 else history["Close"].iloc[-1]),
        "market_cap": safe_float(info.get("marketCap")),
        "handle": handle,
    }
    _CACHE[symbol] = (now, payload)
    return payload
