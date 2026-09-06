const $ = (id) => document.getElementById(id);

const form = $("form");
const filingForm = $("filing-form");
const empty = $("empty");
const result = $("result");
const loading = $("loading");
const errorBox = $("error");
const companyInput = $("company");
const tickerInput = $("company-ticker");
const listedInput = $("company-listed");
const suggestions = $("suggestions");
const addForm = $("add-form");
const addCompany = $("add-company");
const addTicker = $("add-ticker");
const addSuggestions = $("add-suggestions");
const addStatus = $("add-status");
let addTimer;
let addHits = [];
let addActive = -1;
let lastAnalyzed = null;
let suggestTimer;
let activeIndex = -1;
let currentHits = [];
let featuredCache = null;
const PAGE_SIZE = 40;
let suggestQuery = "";
let suggestOffset = 0;
let suggestHasMore = false;
let suggestLoading = false;
let suggestSeq = 0;

function show(el, on = true) {
  if (el) el.hidden = !on;
}

function money(value, currency) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function cap(value) {
  if (value == null) return "";
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  return String(value);
}

function pct(value) {
  if (value == null) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function fillList(node, items, fallback) {
  node.innerHTML = "";
  const rows = items && items.length ? items : [fallback];
  for (const item of rows) {
    const li = document.createElement("li");
    li.textContent = item;
    node.appendChild(li);
  }
}

const GLOSSARY = {
  "P/E": "Price-to-earnings. How many years of current profit the share price is paying for. Lower can mean cheaper; a high P/E can also mean investors expect faster growth.",
  "Forward P/E": "Price divided by expected next-year earnings. Looks ahead instead of using last year’s profit.",
  "PEG": "P/E compared with earnings growth. Near 1 is often seen as fairly priced; much higher can mean you are paying a lot for that growth.",
  "P/B": "Price-to-book. Share price versus the accounting net worth per share. Useful for banks and asset-heavy firms; less so for software.",
  "P/S": "Price-to-sales. Share price versus revenue. Handy when earnings are lumpy or the company is not yet profitable.",
  "EV": "Enterprise value. Market cap plus debt, minus cash — a fuller ‘takeover price’ than market cap alone.",
  "Market cap": "Shares outstanding times the share price. The market’s current value of the equity.",
  "EV/EBITDA": "Enterprise value divided by EBITDA. A common ‘how expensive is the whole business’ multiple, before interest and depreciation.",
  "EV/Sales": "Enterprise value divided by sales. Used when profit is thin or negative.",
  "EBITDA": "Earnings before interest, tax, depreciation and amortization. A rough operating-profit figure before financing and non-cash write-downs. Sometimes written EBIDTA.",
  "EBIT": "Operating profit after depreciation, before interest and tax. Closer to ‘profit from the business itself’ than EBITDA.",
  "EBITDA margin": "EBITDA as a share of sales. Higher means more of each rupee or dollar of sales becomes operating profit.",
  "EPS": "Earnings per share. Profit divided by the number of shares. The ‘E’ in P/E.",
  "Book value": "Accounting net assets per share (assets minus liabilities). Not the same as what the business would sell for.",
  "ROE": "Return on equity. Profit versus shareholders’ funds. High can be good, or a sign of heavy leverage or buybacks.",
  "ROA": "Return on assets. Profit versus the whole asset base. Shows how hard the assets work.",
  "ROCE": "Return on capital employed. Operating profit versus the capital tied up in the business. A favourite quality check.",
  "Net margin": "Net profit as a share of sales. What is left after all costs, interest, and tax.",
  "Operating margin": "Operating profit as a share of sales. Profitability of the core business.",
  "Gross margin": "Sales minus the direct cost of goods, as a share of sales. Pricing power and cost efficiency.",
  "Sales": "Revenue. What customers paid in the period, before costs.",
  "Gross profit": "Sales minus the direct cost of making or buying what was sold.",
  "Net profit": "The bottom line after interest, tax, and one-offs. What is left for shareholders.",
  "Revenue growth": "How fast sales rose versus the prior period. Negative means sales shrank.",
  "Earnings growth": "How fast profit rose versus the prior period.",
  "D/E": "Debt-to-equity. How much borrowed money sits against shareholders’ funds. Higher means more leverage risk.",
  "Current ratio": "Current assets divided by current liabilities. Below 1 can mean near-term bills are tight.",
  "Quick ratio": "Like the current ratio, but strips out inventory. A stricter liquidity check.",
  "Interest coverage": "Operating profit divided by interest cost. How many times the company can pay its interest bill.",
  "FCF": "Free cash flow. Cash from operations minus capex. The cash left after keeping the business running.",
  "OCF": "Operating cash flow. Cash the business actually collected from operations, not just accounting profit.",
  "Capex": "Capital expenditure. Cash spent on long-term assets — plants, equipment, software.",
  "Cash": "Cash and near-cash on the balance sheet.",
  "Debt": "Interest-bearing borrowings. Total debt is short-term plus long-term.",
  "Dividend yield": "Annual dividend as a share of the current price. What cash the stock pays you, before tax.",
  "Payout ratio": "Share of profit paid out as dividends. Very high can mean the dividend is stretched.",
  "Beta": "How much the stock typically moves versus the market. Above 1 is more volatile.",
  "Analyst target": "Average price target from covering analysts. Not a guarantee, and often behind the news.",
  "Implied upside": "Gap between the current price and the average analyst target.",
  "Street view": "The consensus analyst rating, such as buy, hold, or sell.",
  "Shares": "Number of shares outstanding. Used to turn profit into EPS.",
  "Insider holding": "Share of the company owned by management and other insiders.",
  "Institutional holding": "Share owned by funds, insurers, and other institutions.",
  "Interest": "The interest cost on borrowings in that period.",
  "Equity": "Shareholders’ funds. Assets minus liabilities.",
  "Total assets": "Everything the company owns or is owed, in accounting terms.",
  "Current assets": "Assets likely to turn into cash within a year — cash, receivables, inventory.",
  "Current liabilities": "Bills due within a year.",
  "SMA": "Simple moving average. The average close over 20, 50, or 200 days. Price above a rising average is a healthier trend.",
  "RSI": "Relative Strength Index. A 0–100 momentum gauge. Near 70 can be stretched up; near 30 can be stretched down.",
  "MACD": "Moving Average Convergence Divergence. Trend-following momentum. Above its signal line is usually constructive.",
  "ATR": "Average True Range. How large a typical daily swing is. Higher means a noisier stock.",
  "52-week range": "The high and low close over the last year. Shows where today’s price sits in that range.",
  "52-week high": "How far the price is below (or above) the one-year high.",
  "Period return": "Price change over the diligence horizon you picked.",
  "Last price": "The latest traded price used in this run.",
  "CAGR": "Compound annual growth rate. The steady yearly rate that would take the starting figure to the latest figure.",
  "Price CAGR": "How fast the share price compounded over that stretch. Past price growth is not a forecast.",
  "Expenses": "Operating costs in the period — what it took to generate those sales.",
  "Operating profit": "Profit from the main business after operating costs and depreciation, before interest and tax. Also called EBIT.",
  "Depreciation": "A non-cash charge that spreads the cost of long-lived assets over time.",
  "PBT": "Profit before tax. Earnings after interest, before the tax line.",
  "Tax": "Income-tax charge for the period.",
  "Total liabilities": "Everything the company owes — debt, payables, and other claims.",
  "Fixed assets": "Property, plant, and equipment used in the business.",
  "Investments": "Financial or strategic investments sitting on the balance sheet.",
  "Investing cash flow": "Cash spent or received from buying or selling long-term assets and investments. Often negative at growing firms.",
  "Financing cash flow": "Cash from issuing shares or debt, or cash paid as buybacks, dividends, and debt repayments.",
  "Net cash flow": "The net change in the cash balance over the period.",
};

function termNode(label, term) {
  const hint = GLOSSARY[term] || GLOSSARY[label];
  if (!hint) {
    const text = document.createElement("span");
    text.textContent = label;
    return text;
  }
  const wrap = document.createElement("span");
  wrap.className = "term";
  wrap.tabIndex = 0;
  wrap.textContent = label;
  const tip = document.createElement("span");
  tip.className = "term-tip";
  tip.textContent = hint;
  wrap.appendChild(tip);
  return wrap;
}

function fillTable(node, rows) {
  node.innerHTML = "";
  for (const row of rows || []) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.appendChild(termNode(row.label, row.term || row.label));
    const value = document.createElement("td");
    value.textContent = row.value;
    tr.appendChild(name);
    tr.appendChild(value);
    node.appendChild(tr);
  }
}

function fillWideTable(node, block) {
  node.innerHTML = "";
  if (!block || !block.rows) return;
  const head = document.createElement("tr");
  head.appendChild(document.createElement("th"));
  for (const header of block.headers || []) {
    const th = document.createElement("th");
    th.textContent = header;
    head.appendChild(th);
  }
  node.appendChild(head);
  for (const row of block.rows) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.appendChild(termNode(row.label, row.term || row.label));
    tr.appendChild(name);
    for (const cell of row.values || []) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    node.appendChild(tr);
  }
}

function renderDeep(fundamental) {
  const ratios = $("deep-ratios");
  const statements = $("deep-statements");
  const growth = $("growth-cards");
  const toggle = $("toggle-deep");
  const body = $("deep-body");
  if (!ratios || !statements) return;
  ratios.innerHTML = "";
  statements.innerHTML = "";
  if (growth) growth.innerHTML = "";
  for (const [title, rows] of Object.entries(fundamental.growth || {})) {
    if (!growth) break;
    const card = document.createElement("article");
    card.className = "growth-card";
    const heading = document.createElement("h3");
    heading.appendChild(termNode(title, title.includes("ROE") || title.includes("equity") ? "ROE" : title.includes("price") ? "Price CAGR" : "CAGR"));
    card.appendChild(heading);
    const table = document.createElement("table");
    fillTable(table, rows);
    card.appendChild(table);
    growth.appendChild(card);
  }
  const groups = fundamental.deep || {};
  for (const [title, rows] of Object.entries(groups)) {
    const article = document.createElement("article");
    const heading = document.createElement("h3");
    heading.textContent = title;
    const table = document.createElement("table");
    fillTable(table, rows);
    article.appendChild(heading);
    article.appendChild(table);
    ratios.appendChild(article);
  }
  for (const [title, block] of Object.entries(fundamental.statements || {})) {
    const wrap = document.createElement("section");
    wrap.className = "statement";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "These are the company’s reported numbers. Rest your cursor on a line if you want it explained. Nothing here is a prediction.";
    const table = document.createElement("table");
    table.className = "wide";
    fillWideTable(table, block);
    wrap.appendChild(heading);
    wrap.appendChild(note);
    wrap.appendChild(table);
    statements.appendChild(wrap);
  }
  if (toggle && body && !toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", () => {
      const open = body.hidden;
      body.hidden = !open;
      toggle.textContent = open ? "Hide the books" : "Open the books";
    });
  }
}

function openOwnLook(event) {
  if (event) event.preventDefault();
  const body = $("deep-body");
  const toggle = $("toggle-deep");
  if (body) body.hidden = false;
  if (toggle) toggle.textContent = "Hide the books";
  $("own-look")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function syncHorizonWarn() {
  const warn = $("horizon-warn");
  const select = $("horizon");
  if (!warn || !select) return;
  warn.hidden = Number(select.value) < 180;
}

function hideSuggestions() {
  show(suggestions, false);
  suggestions.innerHTML = "";
  activeIndex = -1;
  currentHits = [];
  suggestHasMore = false;
  suggestLoading = false;
}

function scorePct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(0)}%`;
}

function scoreTone(score) {
  if (score == null || Number.isNaN(Number(score))) return "mixed";
  if (Number(score) >= 70) return "good";
  if (Number(score) >= 45) return "mixed";
  return "warn";
}

function setPillar(cardId, scoreId, ratingId, tipId, score, rating, why) {
  $(scoreId).textContent = scorePct(score);
  $(ratingId).textContent = rating;
  $(tipId).textContent = why || "No explanation for this score yet.";
  const card = $(cardId);
  card.classList.remove("good", "mixed", "warn");
  card.classList.add(scoreTone(score));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightMatch(text, query) {
  const value = String(text || "");
  const needle = (query || "").trim();
  if (!needle) return escapeHtml(value);
  const index = value.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return escapeHtml(value);
  return `${escapeHtml(value.slice(0, index))}<mark>${escapeHtml(value.slice(index, index + needle.length))}</mark>${escapeHtml(value.slice(index + needle.length))}`;
}

function mergeCompanyHits(...lists) {
  const seen = new Set();
  const rows = [];
  for (const list of lists) {
    for (const row of list || []) {
      const ticker = (row.ticker || "").toUpperCase();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      rows.push({
        ticker,
        name: row.name || ticker,
        exchange: row.exchange || "",
        sector: row.sector || "",
        industry: row.industry || "",
        reports: row.reports || "",
        cik: row.cik || "",
        origin: row.origin || "",
        listed: row.origin === "listed" || row.origin === "custom" || ticker.includes("."),
        at: row.at,
        horizon: row.horizon,
        label: row.label,
        score: row.score,
      });
    }
  }
  return rows;
}

function suggestionLine(hit, query) {
  const meta = [hit.ticker, hit.exchange, hit.reports].filter(Boolean).join(" · ");
  const classification = [hit.sector, hit.industry].filter(Boolean).join(" · ");
  return `<strong>${highlightMatch(hit.name, query)}</strong><span class="suggest-sub">${highlightMatch(meta, query)}</span>${classification ? `<span class="suggest-meta">${highlightMatch(classification, query)}</span>` : ""}`;
}

function selectHit(hit) {
  companyInput.value = hit.name;
  tickerInput.value = hit.ticker;
  listedInput.value = hit.origin === "custom" || hit.origin === "listed" ? "1" : "";
  hideSuggestions();
}

function paintMoreHint() {
  const existing = suggestions.querySelector(".suggest-more");
  if (!suggestHasMore) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.textContent = suggestLoading ? "Loading more…" : "Scroll for every SEC filer";
    suggestions.appendChild(existing);
    return;
  }
  const hint = document.createElement("li");
  hint.className = "suggest-more";
  hint.textContent = suggestLoading ? "Loading more…" : "Scroll for every SEC filer";
  suggestions.appendChild(hint);
}

function appendHits(hits) {
  hits.forEach((hit) => {
    const li = document.createElement("li");
    li.innerHTML = suggestionLine(hit, suggestQuery);
    li.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectHit(hit);
    });
    suggestions.appendChild(li);
  });
}

function renderSuggestions(hits, append = false) {
  if (!append) {
    currentHits = hits;
    activeIndex = hits.length ? 0 : -1;
    suggestions.innerHTML = "";
  } else {
    currentHits = currentHits.concat(hits);
  }
  if (!currentHits.length) {
    hideSuggestions();
    return;
  }
  appendHits(hits);
  if (!append && currentHits.length) {
    suggestions.querySelector("li")?.classList.add("active");
  }
  paintMoreHint();
  show(suggestions, true);
}

function paintActive() {
  [...suggestions.children].forEach((node, i) => {
    node.classList.toggle("active", i === activeIndex);
  });
}

async function lookupCompanies(query, offset = 0) {
  const response = await fetch(
    `/api/companies?q=${encodeURIComponent(query)}&offset=${offset}&limit=${PAGE_SIZE}`
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Search failed");
  return data;
}

async function openSuggestions(query, reset = true) {
  if (!reset && (suggestLoading || !suggestHasMore)) return;
  if (reset) {
    suggestQuery = query;
    suggestOffset = 0;
    suggestHasMore = false;
    suggestSeq += 1;
  }
  const seq = suggestSeq;
  suggestLoading = true;
  paintMoreHint();
  try {
    if (reset && !query && featuredCache?.results?.length) {
      suggestHasMore = featuredCache.has_more;
      suggestOffset = featuredCache.results.length;
      renderSuggestions(featuredCache.results, false);
    }
    const data = await lookupCompanies(query, reset ? 0 : suggestOffset);
    if (seq !== suggestSeq || companyInput.value.trim() !== query) return;
    let hits = data.results || [];
    if (reset && query.length >= 2) {
      try {
        const listed = await fetch(`/api/listed?q=${encodeURIComponent(query)}`).then((res) => res.json());
        hits = mergeCompanyHits(listed.results, hits);
      } catch {
        /* listed search is optional enrichment */
      }
    }
    suggestHasMore = Boolean(data.has_more);
    suggestOffset = (data.offset || 0) + (data.results || []).length;
    if (!query && reset) {
      featuredCache = { results: hits, has_more: data.has_more };
    }
    renderSuggestions(hits, !reset);
  } catch {
    if (reset && seq === suggestSeq && !currentHits.length) hideSuggestions();
  } finally {
    if (seq === suggestSeq) {
      suggestLoading = false;
      paintMoreHint();
    }
  }
}

companyInput.addEventListener("focus", () => {
  openSuggestions(companyInput.value.trim());
});

companyInput.addEventListener("input", () => {
  tickerInput.value = "";
  const query = companyInput.value.trim();
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(() => openSuggestions(query), 160);
});

suggestions.addEventListener("scroll", () => {
  if (suggestions.hidden || !suggestHasMore || suggestLoading) return;
  const nearBottom =
    suggestions.scrollTop + suggestions.clientHeight >= suggestions.scrollHeight - 96;
  if (nearBottom) openSuggestions(suggestQuery, false);
});

companyInput.addEventListener("keydown", (event) => {
  if (suggestions.hidden || !currentHits.length) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeIndex = Math.min(currentHits.length - 1, activeIndex + 1);
    paintActive();
    suggestions.children[activeIndex]?.scrollIntoView({ block: "nearest" });
    if (activeIndex >= currentHits.length - 3) openSuggestions(suggestQuery, false);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex = Math.max(0, activeIndex - 1);
    paintActive();
  } else if (event.key === "Enter" && activeIndex >= 0) {
    event.preventDefault();
    selectHit(currentHits[activeIndex]);
  } else if (event.key === "Escape") {
    hideSuggestions();
  }
});

document.addEventListener("click", (event) => {
  const inField = event.target.closest(".company-field") || event.target.closest(".add-field");
  if (!event.target.closest(".company-field")) hideSuggestions();
  if (!event.target.closest(".add-field")) hideAddSuggestions();
  if (!inField) {
    document.querySelectorAll(".suggestions").forEach((node) => {
      if (node.id === "suggestions" || node.id === "add-suggestions") return;
      node.hidden = true;
      node.innerHTML = "";
    });
  }
});

function loadTradingView(tv) {
  const host = $("tv-host");
  const link = $("tv-link");
  host.innerHTML = "";
  if (!tv || !tv.symbol) {
    link.hidden = true;
    return;
  }
  link.hidden = false;
  link.href = tv.url;
  const container = document.createElement("div");
  container.className = "tradingview-widget-container";
  const widget = document.createElement("div");
  widget.className = "tradingview-widget-container__widget";
  container.appendChild(widget);
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async = true;
  script.text = JSON.stringify({
    autosize: true,
    symbol: tv.symbol,
    interval: "D",
    timezone: "Etc/UTC",
    theme: "light",
    style: "1",
    locale: "en",
    allow_symbol_change: true,
    calendar: false,
    hide_top_toolbar: false,
    hide_legend: false,
    withdateranges: true,
    save_image: true,
    support_host: "https://www.tradingview.com",
  });
  container.appendChild(script);
  host.appendChild(container);
}

function renderSources(filing) {
  const node = $("sources");
  node.innerHTML = "";
  for (const item of filing.sources || []) {
    const a = document.createElement("a");
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = item.label;
    node.appendChild(a);
  }
}

function renderCombined(verdict) {
  const combined = verdict.combined || {};
  $("combined-label").textContent = combined.label || verdict.label;
  $("combined-score").textContent = `${scorePct(combined.score ?? verdict.score)} · ${combined.stance || verdict.stance} · ${combined.confidence || verdict.confidence} confidence`;
  $("combined-summary").textContent = combined.summary || verdict.thesis;
  const grid = $("combined-grid");
  grid.innerHTML = "";
  const rows = [
    ["Fundamentals", verdict.pillars?.fundamental],
    ["Technicals", verdict.pillars?.technical],
    ["News / external", verdict.pillars?.news],
  ];
  for (const [title, pillar] of rows) {
    if (!pillar) continue;
    const article = document.createElement("article");
    article.className = scoreTone(pillar.score);
    article.innerHTML = `<strong>${title}: ${pillar.rating || "—"}</strong><span>${scorePct(pillar.score)}</span>`;
    grid.appendChild(article);
  }
}

function render(data) {
  const c = data.company;
  const v = data.verdict;
  $("meta").textContent = [c.ticker, c.sector, c.industry, c.exchange, data.horizon_label].filter(Boolean).join(" · ");
  $("name").textContent = c.name;
  const change = c.change != null ? ` ${pct(c.change)}` : "";
  const mcap = c.market_cap ? ` · ${cap(c.market_cap)} mkt cap` : "";
  $("price").textContent = `${money(c.price, c.currency)}${change}${mcap}`;
  $("filing-line").textContent = (c.filing || {}).label || "";
  renderSources(c.filing || {});
  $("verdict-label").textContent = v.label;
  $("verdict-score").textContent = v.score.toFixed(0);
  $("verdict-stance").textContent = `${v.stance} · ${v.confidence} confidence`;
  $("stamp").className = `stamp ${v.investable}`;
  $("briefing").textContent = data.briefing;
  const accuracy = $("accuracy-note");
  if (accuracy) {
    accuracy.textContent = data.horizon >= 180
      ? `These results can be wrong. A ${data.horizon_label} horizon is a broad sketch — Dilagent is only an advisor, not a forecast. Check the published numbers yourself.`
      : "These results can be wrong. Dilagent is an educational advisor, not a prediction or a recommendation. Read the published numbers yourself if you want to check the story.";
  }
  setPillar(
    "fund-card",
    "fund-score",
    "fund-rating",
    "fund-tip",
    data.fundamental.score,
    data.fundamental.rating,
    data.fundamental.why
  );
  setPillar(
    "tech-card",
    "tech-score",
    "tech-rating",
    "tech-tip",
    data.technical.score,
    data.technical.signal,
    data.technical.why
  );
  setPillar(
    "news-card",
    "news-score",
    "news-rating",
    "news-tip",
    data.news.score,
    data.news.controversy,
    data.news.why
  );
  fillList($("for"), v.reasons, "No clear supporting points.");
  fillList($("against"), v.against, "No material objections in this pass.");
  fillTable($("fund-table"), data.fundamental.display);
  fillTable($("tech-table"), data.technical.display);
  renderDeep(data.fundamental);
  $("news-summary").textContent = data.news.summary;
  const list = $("news-list");
  list.innerHTML = "";
  for (const item of data.news.articles.slice(0, 10)) {
    const li = document.createElement("li");
    const link = item.url ? `<a href="${item.url}" target="_blank" rel="noopener">${item.title}</a>` : item.title;
    li.innerHTML = `<span class="tag ${item.risk}">${item.risk}</span>${link}<div class="muted">${item.source || ""}${item.published ? " · " + item.published : ""}</div>`;
    list.appendChild(li);
  }
  renderCombined(v);
  loadTradingView(c.tradingview);
  rememberRun(data);
  lastAnalyzed = {
    ticker: c.ticker,
    name: c.name,
    listed: listedInput.value === "1",
    sector: c.sector || "",
    industry: c.industry || "",
    exchange: c.exchange || "",
  };
  paintResultStar();
}

async function runAnalyze(event) {
  event.preventDefault();
  hideSuggestions();
  const company = companyInput.value.trim();
  const ticker = tickerInput.value.trim();
  const horizon = $("horizon").value;
  const query = ticker || company;
  show(empty, false);
  show(result, false);
  show(errorBox, false);
  show(loading, true);
  $("run").disabled = true;
  $("loading-text").textContent = `Researching ${company}…`;
  try {
    const listed = listedInput.value === "1" ? "&listed=true" : "";
    const response = await fetch(`/api/analyze?q=${encodeURIComponent(query)}&horizon=${horizon}${listed}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Analysis failed");
    render(data);
    show(loading, false);
    show(result, true);
    setView("diligence");
  } catch (err) {
    show(loading, false);
    errorBox.textContent = err.message;
    show(errorBox, true);
  } finally {
    $("run").disabled = false;
  }
}

async function uploadFiling(event) {
  event.preventDefault();
  const company = companyInput.value.trim();
  const ticker = tickerInput.value.trim();
  const file = $("filing").files[0];
  const status = $("filing-status");
  if (!company && !ticker) {
    status.textContent = "Choose a company from the list first.";
    return;
  }
  if (!file) {
    status.textContent = "Choose a PDF filing.";
    return;
  }
  const body = new FormData();
  body.append("file", file);
  status.textContent = "Indexing filing…";
  $("upload").disabled = true;
  try {
    const listed = listedInput.value === "1" ? "&listed=true" : "";
    const response = await fetch(`/api/filings?q=${encodeURIComponent(ticker || company)}${listed}`, {
      method: "POST",
      body,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Upload failed");
    status.textContent = `Indexed for ${data.name || data.ticker}. Run diligence again to include it.`;
  } catch (err) {
    status.textContent = err.message;
  } finally {
    $("upload").disabled = false;
  }
}

function renderFlash(node, items) {
  node.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Tape is quiet. Headlines will appear here when feeds respond.";
    node.appendChild(li);
    return;
  }
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = index === 0 ? "flash-card is-lead" : "flash-card";
    const media = document.createElement("div");
    media.className = item.image ? "flash-media" : "flash-media is-empty";
    if (item.image) {
      const img = document.createElement("img");
      img.src = item.image;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => media.classList.add("is-empty"));
      media.appendChild(img);
    }
    const copy = document.createElement("div");
    copy.className = "flash-copy";
    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = item.title;
      copy.appendChild(link);
    } else {
      const title = document.createElement("strong");
      title.textContent = item.title;
      copy.appendChild(title);
    }
    const meta = [item.source, item.published].filter(Boolean).join(" · ");
    if (meta) {
      const line = document.createElement("span");
      line.className = "muted";
      line.textContent = meta;
      copy.appendChild(line);
    }
    li.appendChild(media);
    li.appendChild(copy);
    node.appendChild(li);
  });
}

async function loadHeadlines() {
  const left = $("flash-left-list");
  const right = $("flash-right-list");
  if (!left || !right) return;
  try {
    const response = await fetch("/api/headlines");
    const data = await response.json();
    const rows = data.results || [];
    const leftRows = data.tape && data.tape.length ? data.tape : rows.slice(0, Math.ceil(rows.length / 2));
    const rightRows = data.headlines && data.headlines.length ? data.headlines : rows.slice(Math.ceil(rows.length / 2));
    renderFlash(left, leftRows);
    renderFlash(right, rightRows);
  } catch {
    renderFlash(left, []);
    renderFlash(right, []);
  }
}

const DESK_STORE = "dilagent-desk";
const VIEWS = ["diligence", "dashboard", "watchlist", "reports", "discover", "method"];

function normalizeView(view) {
  if (view === "analytics") return "diligence";
  return view;
}

function readDesk() {
  try {
    return JSON.parse(localStorage.getItem(DESK_STORE) || "{}");
  } catch {
    return {};
  }
}

function writeDesk(next) {
  localStorage.setItem(DESK_STORE, JSON.stringify(next));
}

function rememberRun(data) {
  const company = data.company || {};
  const verdict = data.verdict || {};
  if (!company.ticker && !company.name) return;
  const state = readDesk();
  const ticker = company.ticker || "";
  const previous = (state.reports || []).find((item) => item.ticker === ticker);
  const fund = data.fundamental?.metrics || {};
  const tech = data.technical?.indicators || {};
  const row = {
    ticker,
    name: company.name || ticker,
    listed: listedInput.value === "1",
    sector: company.sector || "",
    industry: company.industry || "",
    exchange: company.exchange || "",
    market: company.exchange || company.country || "",
    score: verdict.score,
    prevScore: previous && previous.score != null ? previous.score : null,
    label: verdict.label,
    stance: verdict.stance,
    investable: verdict.investable,
    horizon: data.horizon_label || "",
    horizonDays: data.horizon,
    fundScore: data.fundamental?.score,
    techScore: data.technical?.score,
    newsScore: data.news?.score,
    pe: fund.trailing_pe,
    pb: fund.price_to_book,
    ps: fund.price_to_sales,
    roe: fund.roe,
    revenueGrowth: fund.revenue_growth,
    earningsGrowth: fund.earnings_growth,
    debtToEquity: fund.debt_to_equity,
    fcf: fund.free_cashflow,
    currentRatio: fund.current_ratio,
    roa: fund.roa,
    forwardPe: fund.forward_pe,
    evEbitda: fund.ev_ebitda,
    grossMargin: fund.gross_margin,
    operatingMargin: fund.operating_margin,
    profitMargin: fund.profit_margin,
    marketCap: company.market_cap,
    rsi: tech.rsi,
    at: Date.now(),
    status: "Historical report",
  };
  const reports = [row, ...(state.reports || [])].slice(0, 40);
  const exists = (state.watch || []).some((item) => item.ticker === ticker);
  const watch = exists
    ? (state.watch || []).map((item) => (
      item.ticker === ticker
        ? { ...item, name: row.name, cik: company.cik || item.cik, sector: row.sector, industry: row.industry, exchange: row.exchange }
        : item
    ))
    : [{
        ticker,
        name: row.name,
        listed: row.listed,
        cik: company.cik || "",
        sector: row.sector,
        industry: row.industry,
        exchange: row.exchange,
        addedAt: row.at,
      }, ...(state.watch || [])];
  const events = [...(state.events || [])];
  if (!exists) {
    events.unshift({
      type: "watch",
      ticker,
      name: row.name,
      text: `${row.name} added to Watchlist after Analytics`,
      at: row.at,
    });
  }
  events.unshift({
    type: "report",
    ticker,
    name: row.name,
    text: `New report generated for ${row.name}: ${row.label || "unscored"} · ${row.score != null ? `${Math.round(row.score)}%` : "—"}`,
    at: row.at,
  });
  if (previous && previous.score != null && row.score != null && Math.abs(row.score - previous.score) >= 2) {
    const delta = row.score - previous.score;
    events.unshift({
      type: delta > 0 ? "score-up" : "score-down",
      ticker,
      name: row.name,
      text: `${row.name} score ${delta > 0 ? "rose" : "fell"} from ${Math.round(previous.score)}% to ${Math.round(row.score)}%`,
      at: row.at,
    });
  }
  writeDesk({ ...state, watch, reports, events: events.slice(0, 40) });
}

function openDiligence(row, run = true) {
  if (!row) {
    setView("diligence");
    companyInput?.focus();
    return;
  }
  companyInput.value = row.name || row.ticker || "";
  tickerInput.value = row.ticker || "";
  listedInput.value = row.listed ? "1" : "";
  if (row.horizonDays && $("horizon") && [...$("horizon").options].some((item) => item.value === String(row.horizonDays))) {
    $("horizon").value = String(row.horizonDays);
  }
  setView("diligence");
  if (run) form.requestSubmit();
}

function closeNav() {
  document.querySelector(".top")?.classList.remove("is-open");
  const toggle = $("nav-toggle");
  if (!toggle) return;
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "Menu";
}

function setView(view) {
  const next = VIEWS.includes(normalizeView(view)) ? normalizeView(view) : "diligence";
  const analysis = next === "diligence";
  show($("desk-search"), analysis);
  show($("desk-main"), analysis);
  show($("view-dashboard"), next === "dashboard");
  show($("view-watchlist"), next === "watchlist");
  show($("view-reports"), next === "reports");
  show($("view-discover"), next === "discover");
  show($("view-method"), next === "method");
  document.querySelectorAll("[data-view]").forEach((node) => {
    if (node.tagName === "A") node.classList.toggle("is-active", node.dataset.view === next);
  });
  if (window.Desk) window.Desk.paint(next);
  if (next !== "diligence") window.scrollTo({ top: 0, behavior: "smooth" });
  closeNav();
  const hash = next === "diligence" ? "analytics" : next;
  if (location.hash !== `#${hash}`) history.replaceState(null, "", `#${hash}`);
}

document.querySelectorAll("[data-view]").forEach((node) => {
  node.addEventListener("click", (event) => {
    event.preventDefault();
    setView(node.dataset.view);
  });
});

$("nav-toggle")?.addEventListener("click", () => {
  const bar = document.querySelector(".top");
  if (!bar) return;
  const open = !bar.classList.contains("is-open");
  bar.classList.toggle("is-open", open);
  $("nav-toggle").setAttribute("aria-expanded", String(open));
  $("nav-toggle").textContent = open ? "Close" : "Menu";
});

function paintResultStar() {
  const button = $("result-star");
  if (!button || !lastAnalyzed?.ticker) return;
  const saved = window.Desk ? window.Desk.isWatched(lastAnalyzed.ticker) : false;
  button.hidden = false;
  button.classList.toggle("is-on", saved);
  button.textContent = saved ? "★" : "☆";
  button.title = saved ? "Remove from Watchlist" : "Add to Watchlist";
  button.setAttribute("aria-label", button.title);
}

$("result-star")?.addEventListener("click", (event) => {
  event.preventDefault();
  if (!lastAnalyzed?.ticker || !window.Desk) return;
  window.Desk.toggleWatch(lastAnalyzed);
  paintResultStar();
});

function attachCompanySearch(input, list, options) {
  if (!input || !list) return;
  const settings = options || {};
  let timer;
  let hits = [];
  let active = -1;
  let seq = 0;

  function hide() {
    list.hidden = true;
    list.innerHTML = "";
    hits = [];
    active = -1;
  }

  function paint() {
    [...list.children].forEach((node, index) => node.classList.toggle("active", index === active));
  }

  function render(rows, query) {
    hits = rows;
    active = rows.length ? 0 : -1;
    list.innerHTML = "";
    if (!rows.length) {
      hide();
      return;
    }
    rows.forEach((hit, index) => {
      const li = document.createElement("li");
      if (index === 0) li.classList.add("active");
      li.innerHTML = suggestionLine(hit, query);
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
        settings.onSelect(hit);
        hide();
      });
      list.appendChild(li);
    });
    list.hidden = false;
  }

  async function lookup(query) {
    const id = ++seq;
    const local = settings.local ? settings.local(query) : [];
    if (settings.source === "local") {
      if (id === seq) render(local, query);
      return;
    }
    if (query.length < 1) {
      try {
        const data = await lookupCompanies("", 0);
        if (id === seq) render(mergeCompanyHits(local, data.results), query);
      } catch {
        if (id === seq) render(local, query);
      }
      return;
    }
    if (query.length < 2) {
      hide();
      return;
    }
    try {
      const [sec, listed] = await Promise.all([
        lookupCompanies(query, 0),
        fetch(`/api/listed?q=${encodeURIComponent(query)}`).then((res) => res.json()).catch(() => ({ results: [] })),
      ]);
      if (id !== seq) return;
      render(mergeCompanyHits(local, listed.results, sec.results), query);
    } catch {
      if (id === seq) render(local, query);
    }
  }

  input.addEventListener("focus", () => lookup(input.value.trim()));
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => lookup(input.value.trim()), 160);
  });
  input.addEventListener("keydown", (event) => {
    if (list.hidden || !hits.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      active = Math.min(hits.length - 1, active + 1);
      paint();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = Math.max(0, active - 1);
      paint();
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      settings.onSelect(hits[active]);
      hide();
    } else if (event.key === "Escape") {
      hide();
    }
  });
}

window.readDesk = readDesk;
window.writeDesk = writeDesk;
window.setView = setView;
window.openDiligence = openDiligence;
window.attachCompanySearch = attachCompanySearch;
window.paintResultStar = paintResultStar;

window.addEventListener("hashchange", () => {
  const view = normalizeView((location.hash || "#analytics").replace("#", ""));
  if (VIEWS.includes(view)) setView(view);
});

const startView = normalizeView((location.hash || "#analytics").replace("#", ""));
setView(VIEWS.includes(startView) ? startView : "diligence");

loadHeadlines();
syncHorizonWarn();
$("horizon")?.addEventListener("change", syncHorizonWarn);
$("open-own-look")?.addEventListener("click", openOwnLook);
form.addEventListener("submit", runAnalyze);
if (filingForm) filingForm.addEventListener("submit", uploadFiling);

$("toggle-add").addEventListener("click", () => {
  addForm.hidden = !addForm.hidden;
  if (!addForm.hidden) addCompany.focus();
});

function hideAddSuggestions() {
  show(addSuggestions, false);
  addSuggestions.innerHTML = "";
  addHits = [];
  addActive = -1;
}

function selectAddHit(hit) {
  addCompany.value = hit.name;
  addTicker.value = hit.ticker;
  hideAddSuggestions();
}

function renderAddSuggestions(hits) {
  addHits = hits;
  addActive = hits.length ? 0 : -1;
  addSuggestions.innerHTML = "";
  if (!hits.length) {
    hideAddSuggestions();
    return;
  }
  hits.forEach((hit, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${hit.name}</strong><span>${hit.ticker} · ${hit.reports} · ${hit.exchange || ""}</span>`;
    if (i === 0) li.classList.add("active");
    li.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectAddHit(hit);
    });
    addSuggestions.appendChild(li);
  });
  show(addSuggestions, true);
}

addCompany.addEventListener("input", () => {
  addTicker.value = "";
  const query = addCompany.value.trim();
  clearTimeout(addTimer);
  if (query.length < 2) {
    hideAddSuggestions();
    return;
  }
  addTimer = setTimeout(async () => {
    try {
      const response = await fetch(`/api/listed?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (addCompany.value.trim() === query) renderAddSuggestions(data.results || []);
    } catch {
      hideAddSuggestions();
    }
  }, 200);
});

addCompany.addEventListener("keydown", (event) => {
  if (addSuggestions.hidden || !addHits.length) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    addActive = Math.min(addHits.length - 1, addActive + 1);
    [...addSuggestions.children].forEach((node, i) => node.classList.toggle("active", i === addActive));
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    addActive = Math.max(0, addActive - 1);
    [...addSuggestions.children].forEach((node, i) => node.classList.toggle("active", i === addActive));
  } else if (event.key === "Enter" && addActive >= 0) {
    event.preventDefault();
    selectAddHit(addHits[addActive]);
  } else if (event.key === "Escape") {
    hideAddSuggestions();
  }
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAddSuggestions();
  const name = addCompany.value.trim();
  const ticker = addTicker.value.trim() || name;
  const horizon = $("horizon").value;
  const file = $("add-filing").files[0];
  if (!ticker) {
    addStatus.textContent = "Search and pick a listed company first.";
    return;
  }
  addStatus.textContent = file ? "Indexing the report, then researching…" : "Adding the company and researching…";
  $("add-run").disabled = true;
  show(empty, false);
  show(result, false);
  show(errorBox, false);
  show(loading, true);
  try {
    if (file) {
      const body = new FormData();
      body.append("file", file);
      const uploaded = await fetch(`/api/filings?q=${encodeURIComponent(ticker)}&listed=true`, {
        method: "POST",
        body,
      });
      const uploadData = await uploaded.json();
      if (!uploaded.ok) throw new Error(uploadData.detail || "Could not index the PDF.");
    }
    const response = await fetch(`/api/analyze?q=${encodeURIComponent(ticker)}&horizon=${horizon}&listed=true`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Analysis failed");
    companyInput.value = data.company.name;
    tickerInput.value = data.company.ticker;
    listedInput.value = "1";
    featuredCache = null;
    addForm.hidden = true;
    addStatus.textContent = `${data.company.name} is now in your list.`;
    render(data);
    show(loading, false);
    show(result, true);
    setView("diligence");
  } catch (err) {
    show(loading, false);
    addStatus.textContent = err.message;
    errorBox.textContent = err.message;
    show(errorBox, true);
  } finally {
    $("add-run").disabled = false;
  }
});
