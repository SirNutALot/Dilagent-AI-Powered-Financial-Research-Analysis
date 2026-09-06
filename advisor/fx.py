from __future__ import annotations

import json
import time
from typing import Any

import yfinance as yf

from advisor.config import CACHE_DIR, MARKET_CACHE_TTL
from advisor.scoring import safe_float

QUOTE_CURRENCY = "USD"
_FX_PATH = CACHE_DIR / "fx_usd.json"
_RATES: dict[str, float] = {}
_RATES_AT = 0.0

_SUFFIX_CURRENCY = {
    "NS": "INR", "NSE": "INR", "BO": "INR", "BSE": "INR",
    "SA": "BRL",
    "L": "GBP",
    "T": "JPY", "TYO": "JPY",
    "HK": "HKD",
    "SS": "CNY", "SZ": "CNY",
    "KS": "KRW", "KQ": "KRW",
    "TW": "TWD", "TWO": "TWD",
    "SI": "SGD",
    "AX": "AUD",
    "TO": "CAD", "V": "CAD",
    "SW": "CHF",
    "PA": "EUR", "AS": "EUR", "BR": "EUR", "DE": "EUR", "F": "EUR",
    "MI": "EUR", "MC": "EUR", "LS": "EUR",
    "ST": "SEK", "HE": "EUR", "CO": "DKK", "OL": "NOK",
    "JO": "ZAR",
    "MX": "MXN",
    "TA": "ILS",
}

DISPLAY_CURRENCIES = (
    ("USD", "US dollar"),
    ("EUR", "Euro"),
    ("GBP", "British pound"),
    ("INR", "Indian rupee"),
    ("JPY", "Japanese yen"),
    ("CNY", "Chinese yuan"),
    ("HKD", "Hong Kong dollar"),
    ("KRW", "South Korean won"),
    ("TWD", "Taiwan dollar"),
    ("SGD", "Singapore dollar"),
    ("AUD", "Australian dollar"),
    ("CAD", "Canadian dollar"),
    ("CHF", "Swiss franc"),
    ("BRL", "Brazilian real"),
    ("ZAR", "South African rand"),
    ("MXN", "Mexican peso"),
    ("SEK", "Swedish krona"),
    ("NOK", "Norwegian krone"),
    ("DKK", "Danish krone"),
    ("AED", "UAE dirham"),
    ("SAR", "Saudi riyal"),
)


def infer_currency(ticker: str, currency: str | None = None) -> str:
    raw = str(currency or "").strip().upper()
    if raw:
        return raw
    symbol = str(ticker or "").upper()
    if "." not in symbol:
        return QUOTE_CURRENCY
    return _SUFFIX_CURRENCY.get(symbol.rsplit(".", 1)[-1], QUOTE_CURRENCY)


def _load_disk() -> None:
    global _RATES, _RATES_AT
    if not _FX_PATH.exists():
        return
    try:
        payload = json.loads(_FX_PATH.read_text(encoding="utf-8"))
    except Exception:
        return
    if time.time() - float(payload.get("at") or 0) >= MARKET_CACHE_TTL:
        return
    rates = payload.get("rates") or {}
    _RATES = {str(key).upper(): float(value) for key, value in rates.items() if value}
    _RATES_AT = float(payload.get("at") or 0)


def _save_disk() -> None:
    _FX_PATH.parent.mkdir(parents=True, exist_ok=True)
    _FX_PATH.write_text(json.dumps({"at": _RATES_AT, "rates": _RATES}), encoding="utf-8")


def _yahoo_last(symbol: str) -> float | None:
    try:
        handle = yf.Ticker(symbol)
        try:
            last = safe_float(getattr(handle.fast_info, "last_price", None))
        except Exception:
            last = None
        if last:
            return last
        history = handle.history(period="5d", auto_adjust=True, timeout=12)
        if history is not None and not history.empty and "Close" in history.columns:
            return safe_float(history["Close"].iloc[-1])
    except Exception:
        return None
    return None


def _fetch_to_usd(currency: str) -> float | None:
    if currency == QUOTE_CURRENCY:
        return 1.0
    direct = _yahoo_last(f"{currency}{QUOTE_CURRENCY}=X")
    if direct:
        return direct
    inverse = _yahoo_last(f"{QUOTE_CURRENCY}{currency}=X")
    if inverse:
        return 1.0 / inverse
    return None


def usd_rate(currency: str) -> float | None:
    global _RATES_AT
    code = infer_currency("", currency)
    if code == QUOTE_CURRENCY:
        return 1.0
    if not _RATES or time.time() - _RATES_AT >= MARKET_CACHE_TTL:
        _load_disk()
    if code in _RATES and time.time() - _RATES_AT < MARKET_CACHE_TTL:
        return _RATES[code]
    rate = _fetch_to_usd(code)
    if rate:
        if time.time() - _RATES_AT >= MARKET_CACHE_TTL:
            _RATES.clear()
            _RATES_AT = time.time()
        _RATES[code] = rate
        _RATES[QUOTE_CURRENCY] = 1.0
        _save_disk()
    return rate


def attach_currency(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    out["currency"] = infer_currency(str(row.get("ticker") or ""), row.get("currency"))
    return out


def annotate_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [attach_currency(row) for row in rows]


def fx_table(codes: list[str] | None = None) -> dict[str, Any]:
    rates: dict[str, float] = {QUOTE_CURRENCY: 1.0}
    wanted = [infer_currency("", code) for code in (codes or []) if code]
    for code in wanted:
        rate = usd_rate(code)
        if rate:
            rates[code] = rate
    return {
        "base": QUOTE_CURRENCY,
        "rates": rates,
        "currencies": [{"code": code, "label": label} for code, label in DISPLAY_CURRENCIES],
    }
