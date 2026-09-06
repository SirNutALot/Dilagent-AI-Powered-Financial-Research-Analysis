# Dilagent

**v1.6** (broken comparison logic)

A due-diligence desk that answers one question: **is this company investable?**

Type a company name. SEC filers appear automatically. Names that are not there — TCS and other non-US listings — can be added from “Company not listed?” using the Yahoo symbol and an optional PDF.

1. **Fundamentals** — the annual report (10-K / 20-F from the SEC, or a PDF you upload) plus live financials: profitability, growth, leverage, cash, valuation.
2. **Technicals** — trend, RSI, MACD, volume, and stretch versus the 52-week range. This scores *entry timing*, not business quality.
3. **News / external risk** — headlines from Yahoo Finance, Google News, Financial Times, Reuters, CNBC, and MarketWatch.

Horizon changes the blend. A one-year view trusts the filing more; a one-week view listens harder to the tape and headlines.

## Run

Double-click `run.bat`, or:

```bash
pip install -r requirements.txt
uvicorn advisor.main:app --reload --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) and type a name (`Apple`, `Microsoft`, `Tata Consultancy`).

```bash
python -m advisor Apple --horizon 90
```

Optional written briefing: copy `.env.example` to `.env` and set `GROQ_API_KEY` or `OPENAI_API_KEY`.
