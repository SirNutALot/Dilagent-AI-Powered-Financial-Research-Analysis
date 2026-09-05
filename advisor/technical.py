from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from advisor.scoring import inverse_band_score, num, pct, weighted_mean


def _rsi(close: pd.Series, window: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(window).mean()
    loss = (-delta.clip(upper=0)).rolling(window).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _macd(close: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    line = ema12 - ema26
    signal = line.ewm(span=9, adjust=False).mean()
    return line, signal, line - signal


def _atr(frame: pd.DataFrame, window: int = 14) -> pd.Series:
    high = frame["High"]
    low = frame["Low"]
    close = frame["Close"]
    prev_close = close.shift(1)
    true_range = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return true_range.rolling(window).mean()


def _last(series: pd.Series) -> float | None:
    if series is None or series.empty:
        return None
    value = series.dropna()
    if value.empty:
        return None
    return float(value.iloc[-1])


def analyze_technicals(history: pd.DataFrame, horizon: int) -> dict[str, Any]:
    frame = history.copy()
    close = frame["Close"]
    volume = frame["Volume"] if "Volume" in frame.columns else pd.Series(index=frame.index, dtype=float)

    frame["SMA20"] = close.rolling(20).mean()
    frame["SMA50"] = close.rolling(50).mean()
    frame["SMA200"] = close.rolling(200).mean()
    frame["EMA21"] = close.ewm(span=21, adjust=False).mean()
    frame["RSI"] = _rsi(close)
    macd, macd_signal, macd_hist = _macd(close)
    frame["MACD"] = macd
    frame["MACD_signal"] = macd_signal
    frame["MACD_hist"] = macd_hist
    frame["ATR"] = _atr(frame)
    std20 = close.rolling(20).std()
    frame["BB_mid"] = frame["SMA20"]
    frame["BB_upper"] = frame["SMA20"] + 2 * std20
    frame["BB_lower"] = frame["SMA20"] - 2 * std20
    frame["VolMA20"] = volume.rolling(20).mean()

    price = _last(close)
    sma20 = _last(frame["SMA20"])
    sma50 = _last(frame["SMA50"])
    sma200 = _last(frame["SMA200"])
    rsi = _last(frame["RSI"])
    macd_val = _last(frame["MACD"])
    macd_sig = _last(frame["MACD_signal"])
    atr = _last(frame["ATR"])
    vol = _last(volume)
    vol_avg = _last(frame["VolMA20"])
    bb_upper = _last(frame["BB_upper"])
    bb_lower = _last(frame["BB_lower"])

    lookback = min(max(horizon, 20), len(close) - 1)
    period_return = None
    if price and lookback > 0:
        past = float(close.iloc[-lookback - 1])
        if past:
            period_return = (price - past) / past

    high_52 = float(close.tail(252).max()) if len(close) else None
    low_52 = float(close.tail(252).min()) if len(close) else None
    dist_high = ((price - high_52) / high_52) if price and high_52 else None
    dist_low = ((price - low_52) / low_52) if price and low_52 else None

    trend_score = 50.0
    if price and sma20 and sma50 and sma200:
        stacked = price > sma20 > sma50 > sma200
        inverse = price < sma20 < sma50 < sma200
        if stacked:
            trend_score = 88
        elif inverse:
            trend_score = 22
        elif price > sma200 and sma50 > sma200:
            trend_score = 72
        elif price > sma200:
            trend_score = 60
        elif price < sma200:
            trend_score = 36
    elif price and sma50:
        trend_score = 68 if price > sma50 else 38

    rsi_score = 50.0
    if rsi is not None:
        if 45 <= rsi <= 65:
            rsi_score = 82
        elif 35 <= rsi < 45 or 65 < rsi <= 72:
            rsi_score = 64
        elif rsi < 30:
            rsi_score = 58  # oversold can be an entry, not a quality failure
        elif rsi > 78:
            rsi_score = 34
        else:
            rsi_score = 48

    macd_score = 50.0
    if macd_val is not None and macd_sig is not None:
        macd_score = 78 if macd_val > macd_sig else 36
        if macd_val > 0 and macd_val > macd_sig:
            macd_score = 86
        if macd_val < 0 and macd_val < macd_sig:
            macd_score = 28

    volume_score = 55.0
    if vol and vol_avg:
        volume_score = 74 if vol >= vol_avg * 1.1 else 58 if vol >= vol_avg * 0.8 else 46

    stretch_score = inverse_band_score(dist_high, [(-0.05, 78), (-0.02, 64), (0.0, 48), (0.02, 36)]) if dist_high is not None else 55

    score = weighted_mean([
        (trend_score, 0.40 if horizon >= 30 else 0.28),
        (rsi_score, 0.18 if horizon >= 30 else 0.26),
        (macd_score, 0.18 if horizon >= 30 else 0.24),
        (volume_score, 0.12),
        (stretch_score, 0.12),
    ]) or 50.0

    if score >= 68:
        signal = "BUY"
    elif score <= 38:
        signal = "SELL"
    else:
        signal = "HOLD"

    highlights: list[str] = []
    concerns: list[str] = []
    if price and sma200:
        if price > sma200:
            highlights.append("Price holds above the 200-day average — primary trend is up.")
        else:
            concerns.append("Price is below the 200-day average — the primary trend is damaged.")
    if rsi is not None:
        if rsi > 75:
            concerns.append(f"RSI at {rsi:.1f} is overbought; chasing here raises entry risk.")
        elif rsi < 30:
            highlights.append(f"RSI at {rsi:.1f} is oversold; a bounce setup exists if the thesis is intact.")
        else:
            highlights.append(f"RSI at {rsi:.1f} is in a usable range.")
    if macd_val is not None and macd_sig is not None:
        if macd_val > macd_sig:
            highlights.append("MACD is above its signal line.")
        else:
            concerns.append("MACD momentum is negative.")
    if period_return is not None:
        label = f"{horizon}-session return is {pct(period_return)}."
        (highlights if period_return >= 0 else concerns).append(label)

    chart_frame = frame.tail(180)
    chart = {
        "dates": [idx.strftime("%Y-%m-%d") for idx in chart_frame.index],
        "close": [round(float(v), 4) if pd.notna(v) else None for v in chart_frame["Close"]],
        "sma20": [round(float(v), 4) if pd.notna(v) else None for v in chart_frame["SMA20"]],
        "sma50": [round(float(v), 4) if pd.notna(v) else None for v in chart_frame["SMA50"]],
        "sma200": [round(float(v), 4) if pd.notna(v) else None for v in chart_frame["SMA200"]],
        "volume": [int(v) if pd.notna(v) else None for v in chart_frame["Volume"]] if "Volume" in chart_frame else [],
        "rsi": [round(float(v), 2) if pd.notna(v) else None for v in chart_frame["RSI"]],
    }

    return {
        "score": round(score, 1),
        "signal": signal,
        "indicators": {
            "price": price,
            "sma20": sma20,
            "sma50": sma50,
            "sma200": sma200,
            "rsi": rsi,
            "macd": macd_val,
            "macd_signal": macd_sig,
            "atr": atr,
            "bb_upper": bb_upper,
            "bb_lower": bb_lower,
            "volume": vol,
            "volume_avg": vol_avg,
            "return": period_return,
            "high_52": high_52,
            "low_52": low_52,
            "dist_high": dist_high,
            "dist_low": dist_low,
        },
        "display": [
            row for row in [
                {"label": "Last price", "value": num(price, 2), "term": "Last price"},
                {"label": "SMA 20 / 50 / 200", "value": f"{num(sma20, 2)} / {num(sma50, 2)} / {num(sma200, 2)}", "term": "SMA"},
                {"label": "RSI (14)", "value": num(rsi, 1), "term": "RSI"},
                {"label": "MACD", "value": num(macd_val, 3), "term": "MACD"},
                {"label": f"{horizon}d return", "value": pct(period_return), "term": "Period return"},
                {"label": "52-week range", "value": f"{num(low_52, 2)} – {num(high_52, 2)}", "term": "52-week range"},
                {"label": "Vs 52-week high", "value": pct(dist_high), "term": "52-week high"},
                {"label": "ATR (14)", "value": num(atr, 2), "term": "ATR"},
            ] if row["value"] and "None" not in str(row["value"])
        ],
        "highlights": highlights[:5],
        "concerns": concerns[:5],
        "chart": chart,
        "summary": (
            f"Technical posture is {signal.lower()} ({score:.0f}/100). "
            "This speaks to entry timing, not whether the business itself is sound."
        ),
    }
