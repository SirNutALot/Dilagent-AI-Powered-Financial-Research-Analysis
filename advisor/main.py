from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from advisor.analyze import analyze
from advisor.config import APP_NAME, HORIZONS, WEB_DIR
from advisor.catalog import remember_company
from advisor.discover import discover, similar_companies, snapshot
from advisor.filings import list_filers, mark_uploaded_report
from advisor.news import market_headlines
from advisor.rag import has_filing, save_filing
from advisor.resolve import resolve_company, search_listed

app = FastAPI(
    title=APP_NAME,
    description="Due-diligence desk: is this company investable?",
    version="2.2.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "name": APP_NAME}


def _query(q: str | None, ticker: str | None) -> str:
    value = (q or ticker or "").strip()
    if not value:
        raise HTTPException(400, "Enter a company name.")
    return value


@app.get("/api/companies")
def api_companies(
    q: str = Query(default="", max_length=80),
    offset: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=100),
) -> dict:
    return list_filers(q, limit=limit, offset=offset)


@app.get("/api/headlines")
def api_headlines() -> dict:
    return {"results": market_headlines(28)}


@app.get("/api/listed")
def api_listed(q: str = Query(default="", max_length=80)) -> dict:
    return {"results": search_listed(q, limit=8)}


@app.get("/api/profile")
def api_profile(q: str = Query(..., max_length=80)) -> dict:
    row = snapshot(q)
    if not row:
        raise HTTPException(404, "No published profile found for that name.")
    return row


@app.get("/api/similar")
def api_similar(q: str = Query(..., max_length=80)) -> dict:
    return similar_companies(q)


@app.get("/api/discover")
def api_discover(
    q: str = Query(default="", max_length=80),
    tickers: str = Query(default="", max_length=400),
    similar: str = Query(default="", max_length=80),
) -> dict:
    extra = [part.strip() for part in tickers.split(",") if part.strip()]
    return discover(q, extra=extra, similar=similar)


@app.get("/api/analyze")
def api_analyze(
    q: str | None = Query(default=None, max_length=80),
    ticker: str | None = Query(default=None, max_length=80),
    horizon: int = Query(90),
    listed: bool = Query(False),
) -> dict:
    if horizon not in HORIZONS:
        raise HTTPException(400, f"horizon must be one of {list(HORIZONS)}")
    try:
        return analyze(_query(q, ticker), horizon, allow_listed=listed)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Could not complete analysis: {exc}") from exc


@app.post("/api/filings")
async def api_filings(
    q: str | None = Query(default=None, max_length=80),
    ticker: str | None = Query(default=None, max_length=80),
    listed: bool = Query(False),
    file: UploadFile = File(...),
) -> dict:
    identity = resolve_company(_query(q, ticker), allow_listed=listed)
    symbol = identity["ticker"]
    name = file.filename or "filing.pdf"
    if not name.lower().endswith(".pdf"):
        raise HTTPException(400, "Upload a PDF annual report or 10-K.")
    data = await file.read()
    if len(data) < 1000:
        raise HTTPException(400, "File is too small to be a financial report.")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(400, "File exceeds 25 MB.")
    try:
        save_filing(symbol, name, data)
        mark_uploaded_report(symbol)
        remember_company(identity)
    except Exception as exc:
        raise HTTPException(400, f"Could not read filing: {exc}") from exc
    return {"ticker": symbol, "name": identity["name"], "indexed": True, "has_filing": has_filing(symbol)}


if WEB_DIR.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIR), name="assets")


@app.get("/")
def index() -> FileResponse:
    page = WEB_DIR / "index.html"
    if not page.exists():
        raise HTTPException(404, "Web UI is missing.")
    return FileResponse(page)


@app.get("/{name}")
def static_file(name: str) -> FileResponse:
    if name in {"styles.css", "app.js", "desk.js"}:
        path = WEB_DIR / name
        if path.exists():
            return FileResponse(path)
    raise HTTPException(404, "Not found.")
