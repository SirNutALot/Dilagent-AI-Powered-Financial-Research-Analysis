# Dilagent

**v1.10** — due-diligence desk.

Type a company name and get a scored view of whether it looks investable from published filings, live financials, technicals, and headlines. This is educational research, not investment advice.

**New here?** Open **[INSTRUCTIONS.md](INSTRUCTIONS.md)**. On Windows: run **setup.bat** once, then always use **run.bat**.

SEC filers appear automatically. Names that are not there — TCS and other non-US listings — can be added from **Company not listed?** with the Yahoo symbol and an optional PDF.

## Pages

- **Analytics** — the core desk. Fundamentals, technicals, news risk, and a combined verdict. Horizon changes the blend: a one-year view trusts the filing more; a short horizon listens harder to the tape and headlines.
- **Dashboard** — favourites, a major-move chart, and news on names you track.
- **Watchlist** — names you follow, with quotes, sort, and compare.
- **History** — saved Analytics runs (one snapshot per company).
- **Discover** — search and filter the published book, including the full SEC universe.

Prices default to the listing currency. Watchlist and Discover can show Price and Market cap in another currency. Hover a column header or a dotted term for a short definition. TradingView charts stay in the listing currency; compare uses a converted Dilagent line when the table currency differs.

## What you need

- **Python 3.10 or newer** on your PATH. On Windows, tick **Add python.exe to PATH** when you install from [python.org](https://www.python.org/downloads/).
- An internet connection. Quotes, FX, headlines, and SEC filings are fetched live (Yahoo Finance, SEC EDGAR, and public news feeds).
- Optional: a [Groq](https://console.groq.com/) or [OpenAI](https://platform.openai.com/) API key if you want a written briefing. The desk runs without one.

## First-time setup

Step-by-step: **[INSTRUCTIONS.md](INSTRUCTIONS.md)**.

The setup script creates a local virtual environment in `spvenv`, installs the packages in `requirements.txt`, copies `.env.example` to `.env` if you do not already have one, starts the desk, and opens your browser.

### Windows

1. Clone this repo, or download the ZIP and unzip it.
2. Double-click **setup.bat** (first time only).
3. Wait for packages to install. The first run can take a few minutes.
4. The desk opens at [http://127.0.0.1:8000](http://127.0.0.1:8000). Leave the black window open while you work. Close it to stop.

If Windows blocks the script, click **More info** → **Run anyway**.

After that, always double-click **run.bat**. Do not run setup.bat again unless install is broken.

### macOS and Linux

```bash
chmod +x setup.sh run.sh
./setup.sh
```

The desk opens at [http://127.0.0.1:8000](http://127.0.0.1:8000). Leave the terminal open. Press Ctrl+C to stop.

After that, use `./run.sh`.

## Later runs

Once setup has finished once:

- **Windows:** double-click **run.bat**
- **macOS / Linux:** `./run.sh`

`run.bat` will call `setup.bat` for you if the virtual environment or packages are missing.

You can also start it yourself:

```bash
spvenv\Scripts\python.exe -m uvicorn advisor.main:app --host 127.0.0.1 --port 8000
```

On macOS / Linux use `spvenv/bin/python` instead.

## Optional written briefing

Setup already creates `.env` from `.env.example`. Edit `.env` and set one of:

```
GROQ_API_KEY=your_key
OPENAI_API_KEY=your_key
```

Restart the desk after saving. Without a key, scores and sources still work; only the written briefing is thinner.

## Using the desk

1. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).
2. Type a name (`Apple`, `Microsoft`, `Tata Consultancy`).
3. Pick a horizon and run Analytics. The first look-up for a company can take a moment while the annual report is fetched.
4. Save names to Watchlist, compare them, or browse Discover.

Command-line (same scores, no browser):

```bash
spvenv\Scripts\python.exe -m advisor Apple --horizon 90
```

## Notes

- Do not commit `.env`. It is gitignored.
- Cached filings live under `data/` and are also gitignored.
- If a page looks stale after an update, hard-refresh the browser (**Ctrl+F5**).

**Not investment advice.** Dilagent is for learning how published numbers, charts, and headlines can be read together. You are responsible for any decision you make.
