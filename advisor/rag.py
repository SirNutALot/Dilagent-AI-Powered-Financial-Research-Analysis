from __future__ import annotations

import html
import pickle
import re
from pathlib import Path
from typing import Any

from advisor.config import FILINGS_DIR
from advisor.scoring import clamp

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover
    fitz = None

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

QUERIES = {
    "growth": "revenue growth outlook strategy expansion guidance demand",
    "profit": "profit margin operating income earnings net income profitability",
    "debt": "debt leverage liquidity covenant credit facility interest coverage",
    "risk": "risk factors litigation investigation regulation competition impairment",
    "cash": "cash flow free cash flow capital expenditure liquidity working capital",
    "outlook": "outlook guidance forecast management discussion uncertainty",
}


def _store_paths(ticker: str, *, create: bool = False) -> tuple[Path, Path]:
    folder = FILINGS_DIR / ticker.upper()
    if create:
        folder.mkdir(parents=True, exist_ok=True)
    return folder, folder / "index.pkl"


def has_filing(ticker: str) -> bool:
    _, index_path = _store_paths(ticker)
    return index_path.exists()


def _html_to_text(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="ignore")
    text = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:800_000]


def _pdf_to_text(data: bytes) -> str:
    if fitz is None:
        raise RuntimeError("PyMuPDF is not installed.")
    document = fitz.open(stream=data, filetype="pdf")
    parts = [(page.get_text("text") or "") for page in document]
    document.close()
    return " ".join(" ".join(parts).split())[:800_000]


def _chunk(text: str, size: int = 900) -> list[str]:
    chunks = []
    step = size - 150
    for start in range(0, len(text), step):
        chunk = text[start:start + size].strip()
        if len(chunk) > 120:
            chunks.append(chunk)
    return chunks[:400]


def _write_index(ticker: str, chunks: list[str]) -> None:
    if not chunks:
        raise ValueError("Could not extract text from the filing.")
    vectorizer = TfidfVectorizer(stop_words="english", max_features=12000)
    matrix = vectorizer.fit_transform(chunks)
    _, index_path = _store_paths(ticker, create=True)
    index_path.write_bytes(pickle.dumps({
        "chunks": chunks,
        "vectorizer": vectorizer,
        "matrix": matrix,
    }))


def _extract_text(data: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf" or data[:4] == b"%PDF":
        return _pdf_to_text(data)
    return _html_to_text(data)


def index_document(ticker: str, data: bytes, filename: str) -> None:
    folder, _ = _store_paths(ticker, create=True)
    suffix = Path(filename).suffix.lower() or ".htm"
    (folder / f"filing{suffix}").write_bytes(data)
    _write_index(ticker, _chunk(_extract_text(data, filename)))


def index_payloads(ticker: str, payloads: list[dict[str, Any]]) -> None:
    folder, _ = _store_paths(ticker, create=True)
    chunks: list[str] = []
    for row in payloads:
        kind = row.get("kind") or "filing"
        filename = row.get("document") or f"{kind}.htm"
        suffix = Path(filename).suffix.lower() or ".htm"
        (folder / f"{kind}{suffix}").write_bytes(row["content"])
        text = _extract_text(row["content"], filename)
        label = f"{row.get('form') or kind} filed {row.get('filed') or ''}".strip()
        chunks.extend(_chunk(f"{label}. {text}"))
    _write_index(ticker, chunks[:500])


def save_filing(ticker: str, filename: str, data: bytes) -> Path:
    index_document(ticker, data, filename)
    folder, _ = _store_paths(ticker)
    matches = list(folder.glob("filing.*")) if folder.exists() else []
    return matches[0] if matches else folder / "filing.pdf"


def _search(ticker: str, query: str, k: int = 3) -> list[str]:
    _, index_path = _store_paths(ticker)
    if not index_path.exists():
        return []
    payload = pickle.loads(index_path.read_bytes())
    vector = payload["vectorizer"].transform([query])
    scores = cosine_similarity(vector, payload["matrix"]).ravel()
    top = scores.argsort()[::-1][:k]
    return [payload["chunks"][i] for i in top if scores[i] > 0.02]


def analyze_filing(ticker: str) -> dict[str, Any] | None:
    if not has_filing(ticker):
        return None

    excerpts: dict[str, list[str]] = {}
    blob_parts: list[str] = []
    for key, query in QUERIES.items():
        hits = _search(ticker, query, k=2)
        excerpts[key] = hits
        blob_parts.extend(hits)
    blob = " ".join(blob_parts).lower()

    score = 62.0
    highlights: list[str] = []
    concerns: list[str] = []

    positive = ("growth", "strong", "increase", "record", "robust", "expand")
    negative = ("decline", "uncertain", "litigation", "impairment", "going concern", "covenant", "loss")
    score += sum(2.5 for word in positive if word in blob)
    score -= sum(4.0 for word in negative if word in blob)
    if "going concern" in blob:
        concerns.append("The filing discusses going-concern language.")
        score -= 15
    if "litigation" in blob or "investigation" in blob:
        concerns.append("The filing discusses litigation or investigation risk.")
    if "growth" in blob and "revenue" in blob:
        highlights.append("Read of the annual report: management emphasizes growth.")
    if "cash flow" in blob and "positive" in blob:
        highlights.append("The annual report discusses cash-flow generation.")

    return {
        "score": round(clamp(score), 1),
        "highlights": highlights[:3],
        "concerns": concerns[:3],
        "excerpts": {key: values[:1] for key, values in excerpts.items() if values},
        "used": True,
    }
