from __future__ import annotations

import json
from typing import Any

import httpx

from advisor.config import groq_key, openai_key

GROQ_MODEL = "llama-3.3-70b-versatile"
OPENAI_MODEL = "gpt-4o-mini"


def _chat(url: str, key: str, model: str, system: str, user: str) -> str | None:
    try:
        with httpx.Client(timeout=25.0) as client:
            response = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "temperature": 0.3,
                    "max_tokens": 420,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


def narrate(payload: dict[str, Any]) -> str | None:
    system = (
        "You are an investment-research associate. Write a concise briefing for a "
        "long-term investor deciding whether a company is investable. "
        "Use only the supplied facts. Do not invent numbers. "
        "Do not give personalized financial advice. "
        "4-6 sentences. Lead with the investability verdict and why."
    )
    user = json.dumps({
        "company": payload.get("company"),
        "horizon_days": payload.get("horizon"),
        "verdict": payload.get("verdict"),
        "fundamental": {
            "score": payload.get("fundamental", {}).get("score"),
            "rating": payload.get("fundamental", {}).get("rating"),
            "highlights": payload.get("fundamental", {}).get("highlights"),
            "concerns": payload.get("fundamental", {}).get("concerns"),
        },
        "technical": {
            "score": payload.get("technical", {}).get("score"),
            "signal": payload.get("technical", {}).get("signal"),
            "highlights": payload.get("technical", {}).get("highlights"),
            "concerns": payload.get("technical", {}).get("concerns"),
        },
        "news": {
            "score": payload.get("news", {}).get("score"),
            "controversy": payload.get("news", {}).get("controversy"),
            "highlights": payload.get("news", {}).get("highlights"),
            "concerns": payload.get("news", {}).get("concerns"),
        },
    }, default=str)

    key = groq_key()
    if key:
        text = _chat(
            "https://api.groq.com/openai/v1/chat/completions",
            key,
            GROQ_MODEL,
            system,
            user,
        )
        if text:
            return text

    key = openai_key()
    if key:
        return _chat(
            "https://api.openai.com/v1/chat/completions",
            key,
            OPENAI_MODEL,
            system,
            user,
        )
    return None
