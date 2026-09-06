from __future__ import annotations

from typing import Any

from advisor.config import HORIZON_LABELS
from advisor.scoring import clamp, weighted_mean

QUALITY_WEIGHTS = {"fundamental": 0.88, "news": 0.12}

HORIZON_BLENDS = (
    {"max_days": 10, "label": "Up to 10 days", "fundamental": 0.38, "technical": 0.32, "news": 0.30},
    {"max_days": 60, "label": "Up to 60 days", "fundamental": 0.50, "technical": 0.25, "news": 0.25},
    {"max_days": 365, "label": "Up to 1 year", "fundamental": 0.62, "technical": 0.16, "news": 0.22},
    {"max_days": None, "label": "Beyond 1 year", "fundamental": 0.70, "technical": 0.10, "news": 0.20},
)


def _horizon_weights(horizon: int) -> tuple[float, float, float]:
    """Fundamentals dominate investability; technicals matter more near-term."""
    for row in HORIZON_BLENDS:
        if row["max_days"] is None or horizon <= row["max_days"]:
            return row["fundamental"], row["technical"], row["news"]
    last = HORIZON_BLENDS[-1]
    return last["fundamental"], last["technical"], last["news"]


def _confidence(fundamental: dict, technical: dict, news: dict, horizon: int) -> str:
    filled = 0
    filled += 1 if fundamental.get("display") else 0
    filled += 1 if technical.get("indicators", {}).get("sma200") else 0
    filled += 1 if news.get("articles") else 0
    spread = abs(fundamental["score"] - technical["score"])
    if news.get("controversy") == "severe" or filled < 2:
        return "Low"
    if filled == 3 and spread < 25 and horizon >= 30:
        return "High"
    return "Medium"


def combine(fundamental: dict[str, Any], technical: dict[str, Any], news: dict[str, Any], horizon: int) -> dict[str, Any]:
    wf, wt, wn = _horizon_weights(horizon)
    quality = weighted_mean([
        (fundamental["score"], QUALITY_WEIGHTS["fundamental"]),
        (news["score"], QUALITY_WEIGHTS["news"]),
    ]) or 50.0
    timing = technical["score"]
    blended = weighted_mean([
        (fundamental["score"], wf),
        (technical["score"], wt),
        (news["score"], wn),
    ]) or 50.0
    blended = clamp(blended)
    controversy = news.get("controversy") or "none"

    if news.get("veto"):
        investable = "no"
        stance = "avoid"
        label = "Not investable"
        thesis = "Headline risk includes fraud, default, or similar severe language. New capital should wait until that cloud clears."
    elif quality >= 68:
        investable = "yes"
        if controversy == "elevated":
            stance = "wait"
            label = "Investable — watch headline risk"
            thesis = "The business screens as investable, but active lawsuits or investigations argue for a slower entry."
        elif timing >= 58:
            stance = "accumulate"
            label = "Investable"
            thesis = "The business screens as investable and the tape is not fighting the entry."
        else:
            stance = "wait"
            label = "Investable — wait for a better entry"
            thesis = "The company looks investable, but technicals argue for patience on entry."
    elif quality >= 52:
        investable = "cautious"
        if controversy in {"elevated", "severe"}:
            stance = "wait"
            label = "Cautious — external risk elevated"
            thesis = "Quality is mixed and headline risk is high enough that new money should wait."
        elif timing >= 60:
            stance = "small-watch"
            label = "Cautiously investable"
            thesis = "Quality is mixed. A starter position is only sensible if you accept the listed risks."
        else:
            stance = "wait"
            label = "Cautiously investable — wait"
            thesis = "The company is not a clear reject, but neither quality nor timing is strong enough to press."
    else:
        investable = "no"
        stance = "avoid"
        label = "Not investable"
        thesis = "Fundamentals and/or external risk do not support putting fresh capital to work."

    reasons: list[str] = []
    reasons.extend(fundamental.get("highlights") or [])
    reasons.extend(technical.get("highlights") or [])
    against: list[str] = []
    against.extend(fundamental.get("concerns") or [])
    against.extend(news.get("concerns") or [])
    against.extend(technical.get("concerns") or [])

    return {
        "investable": investable,
        "stance": stance,
        "label": label,
        "score": round(blended, 1),
        "quality_score": round(quality, 1),
        "timing_score": round(timing, 1),
        "weights": {
            "fundamental": wf,
            "technical": wt,
            "news": wn,
            "horizon": horizon,
            "horizon_label": HORIZON_LABELS.get(horizon, f"{horizon} days"),
        },
        "confidence": _confidence(fundamental, technical, news, horizon),
        "thesis": thesis,
        "reasons": reasons[:6],
        "against": against[:6],
        "pillars": {
            "fundamental": {
                "score": fundamental.get("score"),
                "rating": fundamental.get("rating"),
                "read": fundamental.get("summary"),
            },
            "technical": {
                "score": technical.get("score"),
                "rating": technical.get("signal"),
                "read": technical.get("summary"),
            },
            "news": {
                "score": news.get("score"),
                "rating": news.get("controversy"),
                "read": news.get("summary"),
            },
        },
        "combined": {
            "label": label,
            "stance": stance,
            "score": round(blended, 1),
            "investable": investable,
            "confidence": _confidence(fundamental, technical, news, horizon),
            "thesis": thesis,
            "summary": (
                f"Combined verdict: {label} ({blended:.0f}/100, {stance}). "
                f"Fundamentals {fundamental.get('rating')} ({fundamental.get('score'):.0f}), "
                f"technicals {technical.get('signal')} ({technical.get('score'):.0f}), "
                f"news risk {news.get('controversy')} ({news.get('score'):.0f}). "
                f"{thesis}"
            ),
        },
    }
