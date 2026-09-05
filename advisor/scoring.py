from __future__ import annotations

from typing import Any


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:  # NaN
        return None
    return number


def band_score(value: float | None, thresholds: list[tuple[float, float]]) -> float | None:
    """Map a metric onto 0-100 using descending (minimum, score) pairs."""
    if value is None:
        return None
    for minimum, score in thresholds:
        if value >= minimum:
            return score
    return thresholds[-1][1] if thresholds else None


def inverse_band_score(value: float | None, thresholds: list[tuple[float, float]]) -> float | None:
    """Lower is better. thresholds are (maximum, score) ascending."""
    if value is None:
        return None
    for maximum, score in thresholds:
        if value <= maximum:
            return score
    return thresholds[-1][1] if thresholds else None


def weighted_mean(pairs: list[tuple[float | None, float]]) -> float | None:
    total_weight = 0.0
    total = 0.0
    for score, weight in pairs:
        if score is None:
            continue
        total += score * weight
        total_weight += weight
    if total_weight == 0:
        return None
    return total / total_weight


def pct(value: float | None, digits: int = 1) -> str | None:
    if value is None:
        return None
    return f"{value * 100:.{digits}f}%"


def num(value: float | None, digits: int = 2) -> str | None:
    if value is None:
        return None
    abs_value = abs(value)
    if abs_value >= 1_000_000_000_000:
        return f"{value / 1_000_000_000_000:.{digits}f}T"
    if abs_value >= 1_000_000_000:
        return f"{value / 1_000_000_000:.{digits}f}B"
    if abs_value >= 1_000_000:
        return f"{value / 1_000_000:.{digits}f}M"
    if abs_value >= 1_000:
        return f"{value:,.{digits}f}"
    return f"{value:.{digits}f}"
