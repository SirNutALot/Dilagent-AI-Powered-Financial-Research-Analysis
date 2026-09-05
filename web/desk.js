(function () {
  const $ = (id) => document.getElementById(id);

  function desk() {
    return window.readDesk ? window.readDesk() : { watch: [], reports: [], events: [] };
  }

  function latestReport(ticker) {
    return (desk().reports || []).find((row) => row.ticker === ticker) || null;
  }

  function isWatched(ticker) {
    return (desk().watch || []).some((row) => row.ticker === ticker);
  }

  function toggleWatch(row) {
    if (!row || !row.ticker || !window.writeDesk) return;
    const state = desk();
    const exists = (state.watch || []).some((item) => item.ticker === row.ticker);
    const watch = exists
      ? (state.watch || []).filter((item) => item.ticker !== row.ticker)
      : [{
          ticker: row.ticker,
          name: row.name || row.ticker,
          listed: !!row.listed,
          sector: row.sector || "",
          industry: row.industry || "",
          exchange: row.exchange || "",
          addedAt: Date.now(),
        }, ...(state.watch || [])];
    const events = exists
      ? state.events || []
      : [{
          type: "watch",
          ticker: row.ticker,
          name: row.name || row.ticker,
          text: `${row.name || row.ticker} added to Watchlist`,
          at: Date.now(),
        }, ...(state.events || [])].slice(0, 40);
    window.writeDesk({ ...state, watch, events });
    paint(currentView());
  }

  function currentView() {
    const raw = (location.hash || "#analytics").replace("#", "");
    return raw === "analytics" ? "diligence" : raw;
  }

  function go(view) {
    if (window.setView) window.setView(view);
  }

  function openCompany(row, run) {
    if (window.openDiligence) window.openDiligence(row, run !== false);
  }

  function tone(score) {
    if (score == null || Number.isNaN(Number(score))) return "";
    if (Number(score) >= 70) return "yes";
    if (Number(score) >= 45) return "cautious";
    return "no";
  }

  function scoreText(score) {
    return score == null || Number.isNaN(Number(score)) ? "—" : `${Math.round(Number(score))}%`;
  }

  function when(value) {
    return value ? new Date(value).toLocaleDateString() : "—";
  }

  function changeText(row) {
    if (row.score == null || row.prevScore == null) return "—";
    const delta = Number(row.score) - Number(row.prevScore);
    if (Math.abs(delta) < 0.5) return "0";
    return `${delta > 0 ? "+" : ""}${Math.round(delta)}`;
  }

  function changeClass(row) {
    if (row.score == null || row.prevScore == null) return "chg";
    const delta = Number(row.score) - Number(row.prevScore);
    if (delta > 0.5) return "chg up";
    if (delta < -0.5) return "chg down";
    return "chg";
  }

  function cap(value) {
    if (value == null) return "—";
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    return String(Math.round(value));
  }

  function pct(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function num(value, digits) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return Number(value).toFixed(digits == null ? 1 : digits);
  }

  function empty(node, text) {
    node.innerHTML = `<p class="empty-note">${text}</p>`;
  }

  function starButton(row) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `star-btn${isWatched(row.ticker) ? " is-on" : ""}`;
    button.title = isWatched(row.ticker) ? "Remove from Watchlist" : "Add to Watchlist";
    button.textContent = isWatched(row.ticker) ? "★" : "☆";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleWatch(row);
    });
    return button;
  }

  function actionButton(label, kind, handler) {
    const button = document.createElement("button");
    button.type = "button";
    if (kind === "ghost") button.className = "ghost";
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function fillSelect(node, values, placeholder) {
    if (!node) return;
    const current = node.value;
    const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    node.innerHTML = `<option value="">${placeholder}</option>` + unique.map((value) => `<option>${value}</option>`).join("");
    if (unique.includes(current)) node.value = current;
  }

  function watchedRows() {
    return (desk().watch || []).map((item) => {
      const report = latestReport(item.ticker) || {};
      return {
        ...item,
        ...report,
        ticker: item.ticker,
        name: item.name || report.name,
        listed: item.listed || report.listed,
        sector: item.sector || report.sector || "",
        industry: item.industry || report.industry || "",
        exchange: item.exchange || report.exchange || "",
      };
    });
  }

  function uniqueCompanies(reports) {
    const seen = new Set();
    const rows = [];
    for (const row of reports || []) {
      if (!row.ticker || seen.has(row.ticker)) continue;
      seen.add(row.ticker);
      rows.push(row);
    }
    return rows;
  }

  function paintDashboard() {
    const favs = $("dash-favs");
    const recent = $("dash-recent");
    const reportsNode = $("dash-reports");
    const events = $("dash-events");
    if (!favs) return;
    const watch = watchedRows();
    const reports = desk().reports || [];
    const log = desk().events || [];
    favs.innerHTML = "";
    if (!watch.length) {
      empty(favs, "Nothing saved yet. Search on Discover or Watchlist and star a name. You do not need to run Analytics first.");
    } else {
      watch.slice(0, 8).forEach((row) => {
        const block = document.createElement("div");
        block.className = "fav-row";
        const analyzed = row.at ? [scoreText(row.score), row.label, changeText(row), when(row.at)] : ["Not analyzed"];
        block.innerHTML = `<strong>${row.name}</strong><span>${[row.exchange || row.market, row.sector, ...analyzed].filter((item) => item && item !== "—").join(" · ")}</span>`;
        block.addEventListener("click", () => openCompany(row, Boolean(row.at)));
        favs.appendChild(block);
      });
    }
    recent.innerHTML = "";
    const analyzed = uniqueCompanies(reports);
    if (!analyzed.length) {
      empty(recent, "No Analytics runs yet. Open Analytics, pick a name, and run it.");
    } else {
      analyzed.slice(0, 8).forEach((row) => {
        const block = document.createElement("div");
        block.className = "fav-row";
        block.innerHTML = `<strong>${row.name}</strong><span>${[when(row.at), row.horizon, row.label, scoreText(row.score)].filter(Boolean).join(" · ")}</span>`;
        block.addEventListener("click", () => openCompany(row));
        recent.appendChild(block);
      });
    }
    if (reportsNode) {
      reportsNode.innerHTML = "";
      if (!reports.length) {
        empty(reportsNode, "No stored reports yet. Each Analytics run is saved here as a historical snapshot.");
      } else {
        reports.slice(0, 6).forEach((row) => {
          const block = document.createElement("div");
          block.className = "fav-row";
          block.innerHTML = `<strong>${row.name}</strong><span>${["Historical report", when(row.at), row.horizon, row.label, scoreText(row.score)].filter(Boolean).join(" · ")}</span>`;
          block.addEventListener("click", () => go("reports"));
          reportsNode.appendChild(block);
        });
      }
    }
    events.innerHTML = "";
    if (!log.length) {
      empty(events, "Add a favourite or run Analytics twice on the same name to see score and report changes.");
    } else {
      log.slice(0, 10).forEach((row) => {
        const block = document.createElement("div");
        block.className = "event-row";
        block.innerHTML = `<strong>${row.text}</strong><span>${when(row.at)}</span>`;
        if (row.ticker) block.addEventListener("click", () => openCompany(row));
        events.appendChild(block);
      });
    }
  }

  function paintWatch() {
    const body = $("watch-body");
    if (!body) return;
    const query = ($("watch-q")?.value || "").trim().toLowerCase();
    const market = $("watch-market")?.value || "";
    const sector = $("watch-sector")?.value || "";
    const verdict = $("watch-verdict")?.value || "";
    const change = $("watch-change")?.value || "";
    const sort = $("watch-sort")?.value || "name";
    let rows = watchedRows();
    fillSelect($("watch-market"), rows.map((row) => row.exchange || row.market), "Market");
    fillSelect($("watch-sector"), rows.map((row) => row.sector), "Sector");
    if ($("watch-verdict")) {
      const kept = $("watch-verdict").value;
      const labels = [...new Set(rows.map((row) => row.label).filter(Boolean))].sort();
      $("watch-verdict").innerHTML = `<option value="">Verdict</option><option value="unanalyzed">Not analyzed</option>` +
        labels.map((label) => `<option>${label}</option>`).join("");
      if (kept) $("watch-verdict").value = kept;
    }
    rows = rows.filter((row) => {
      const blob = `${row.name} ${row.ticker} ${row.industry} ${row.sector} ${row.exchange || ""}`.toLowerCase();
      if (query && !blob.includes(query)) return false;
      if (market && (row.exchange || row.market) !== market) return false;
      if (sector && row.sector !== sector) return false;
      if (verdict === "unanalyzed" && row.at) return false;
      if (verdict && verdict !== "unanalyzed" && row.label !== verdict) return false;
      if (change === "up" && !(row.score != null && row.prevScore != null && row.score > row.prevScore)) return false;
      if (change === "down" && !(row.score != null && row.prevScore != null && row.score < row.prevScore)) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "score") return (b.score || -1) - (a.score || -1);
      if (sort === "at") return (b.at || 0) - (a.at || 0);
      return (a.name || "").localeCompare(b.name || "");
    });
    body.innerHTML = "";
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="10" class="empty-note">No saved names match. Search above to add a company without running Analytics.</td>`;
      body.appendChild(tr);
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const star = document.createElement("td");
      star.appendChild(starButton(row));
      const company = document.createElement("td");
      company.innerHTML = `<strong>${row.name}</strong><div class="muted">${row.ticker}</div>`;
      const actions = document.createElement("td");
      const wrap = document.createElement("div");
      wrap.className = "row-actions";
      wrap.appendChild(actionButton("Open", "ghost", () => openCompany(row, false)));
      wrap.appendChild(actionButton("Run Analytics", "", () => openCompany(row, true)));
      wrap.appendChild(actionButton("Remove", "ghost", () => toggleWatch(row)));
      actions.appendChild(wrap);
      tr.appendChild(star);
      tr.appendChild(company);
      tr.insertAdjacentHTML("beforeend", `<td>${row.exchange || row.market || "—"}</td><td>${row.sector || "—"}</td><td>${row.industry || "—"}</td><td>${scoreText(row.score)}</td>`);
      const verdictCell = document.createElement("td");
      verdictCell.innerHTML = row.label
        ? `<span class="pill ${row.investable || tone(row.score)}">${row.label}</span>`
        : `<span class="muted">Not analyzed</span>`;
      tr.appendChild(verdictCell);
      tr.insertAdjacentHTML("beforeend", `<td class="${changeClass(row)}">${changeText(row)}</td><td>${row.at ? when(row.at) : "—"}</td>`);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function selectedReports() {
    return [...document.querySelectorAll(".report-check:checked")].map((node) => Number(node.value));
  }

  function paintReports() {
    const body = $("report-body");
    const host = $("report-cards");
    if (!body && !host) return;
    const query = ($("report-q")?.value || "").trim().toLowerCase();
    const verdict = $("report-verdict")?.value || "";
    const sort = $("report-sort")?.value || "at";
    let rows = [...(desk().reports || [])];
    fillSelect($("report-verdict"), rows.map((row) => row.label), "Verdict");
    rows = rows.filter((row) => {
      const blob = `${row.name} ${row.ticker}`.toLowerCase();
      if (query && !blob.includes(query)) return false;
      if (verdict && row.label !== verdict) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "score") return (b.score || -1) - (a.score || -1);
      if (sort === "name") return (a.name || "").localeCompare(b.name || "");
      return (b.at || 0) - (a.at || 0);
    });
    if (body) {
      body.innerHTML = "";
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="8" class="empty-note">No reports yet. Run Analytics to generate a historical snapshot.</td></tr>`;
        return;
      }
      const latest = uniqueCompanies(desk().reports || []).map((row) => `${row.ticker}-${row.at}`);
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        const check = document.createElement("td");
        check.innerHTML = `<input type="checkbox" class="report-check" value="${(desk().reports || []).indexOf(row)}" />`;
        const company = document.createElement("td");
        company.innerHTML = `<strong>${row.name}</strong><div class="muted">${row.ticker}</div>`;
        const actions = document.createElement("td");
        const wrap = document.createElement("div");
        wrap.className = "row-actions";
        wrap.appendChild(actionButton("Open", "ghost", () => openCompany(row, false)));
        wrap.appendChild(actionButton("View report", "", () => openCompany(row, true)));
        actions.appendChild(wrap);
        const status = latest.includes(`${row.ticker}-${row.at}`) ? "Latest stored" : "Earlier run";
        tr.appendChild(check);
        tr.appendChild(company);
        tr.insertAdjacentHTML("beforeend", `<td>${scoreText(row.score)}</td>`);
        const verdictCell = document.createElement("td");
        verdictCell.innerHTML = row.label
          ? `<span class="pill ${row.investable || tone(row.score)}">${row.label}</span>`
          : "—";
        tr.appendChild(verdictCell);
        tr.insertAdjacentHTML("beforeend", `<td>${row.horizon || "—"}</td><td>${when(row.at)}</td><td class="muted">${status}</td>`);
        tr.appendChild(actions);
        body.appendChild(tr);
      });
    }
  }

  function compareReports() {
    const box = $("compare-box");
    if (!box) return;
    const all = desk().reports || [];
    const picked = selectedReports().map((index) => all[index]).filter(Boolean);
    if (picked.length < 2) {
      box.hidden = false;
      box.innerHTML = `<p class="empty-note">Select at least two historical reports, then compare.</p>`;
      return;
    }
    const headers = picked.map((row) => `${row.name}<div class="muted">${when(row.at)} · ${row.horizon || "—"}</div>`);
    const metrics = [
      ["Status", () => "Historical report"],
      ["Overall score", (row) => scoreText(row.score)],
      ["Fundamentals", (row) => scoreText(row.fundScore)],
      ["Technicals", (row) => scoreText(row.techScore)],
      ["News / external", (row) => scoreText(row.newsScore)],
      ["Verdict", (row) => row.label || "—"],
      ["Horizon", (row) => row.horizon || "—"],
      ["Date", (row) => when(row.at)],
      ["P/E", (row) => num(row.pe)],
      ["P/B", (row) => num(row.pb, 2)],
      ["ROE", (row) => pct(row.roe)],
      ["Revenue growth", (row) => pct(row.revenueGrowth)],
      ["Earnings growth", (row) => pct(row.earningsGrowth)],
      ["Debt / Equity", (row) => num(row.debtToEquity)],
      ["Free cash flow", (row) => cap(row.fcf)],
      ["RSI", (row) => num(row.rsi)],
    ];
    const tableRows = metrics.map(([label, read]) => {
      const cells = picked.map((row) => `<td>${read(row)}</td>`).join("");
      return `<tr><td>${label}</td>${cells}</tr>`;
    }).join("");
    const scoreRows = [
      ["Overall", "score"],
      ["Fundamentals", "fundScore"],
      ["Technicals", "techScore"],
      ["News / external", "newsScore"],
    ].map(([label, key]) => {
      const bars = picked.map((row) => {
        const value = row[key];
        const width = value == null ? 0 : Math.max(0, Math.min(100, Number(value)));
        const klass = tone(value);
        return `<div class="cmp-bar-row"><span>${row.ticker}</span><div class="cmp-track"><i class="${klass === "yes" ? "is-yes" : klass === "cautious" ? "is-wait" : klass === "no" ? "is-no" : ""}" style="width:${width}%"></i></div><span>${scoreText(value)}</span></div>`;
      }).join("");
      return `<div class="cmp-metric"><strong>${label}</strong>${bars}</div>`;
    }).join("");

    let spark = "";
    const sameTicker = picked.every((row) => row.ticker === picked[0].ticker);
    if (sameTicker) {
      const history = (desk().reports || [])
        .filter((row) => row.ticker === picked[0].ticker && row.score != null)
        .slice()
        .sort((a, b) => a.at - b.at);
      if (history.length >= 2) {
        const scores = history.map((row) => Number(row.score));
        const min = Math.min(...scores, 0);
        const max = Math.max(...scores, 100);
        const points = scores.map((score, index) => {
          const x = 20 + (index * (360 / Math.max(history.length - 1, 1)));
          const y = 100 - ((score - min) / Math.max(max - min, 1)) * 80;
          return `${x},${y}`;
        }).join(" ");
        spark = `<p class="kicker">Score over stored runs</p>
          <svg class="compare-spark" viewBox="0 0 400 120" role="img" aria-label="Score history">
            <polyline fill="none" stroke="#0b57d0" stroke-width="2" points="${points}" />
          </svg>
          <p class="muted">${history.map((row) => `${when(row.at)} ${scoreText(row.score)}`).join(" · ")}</p>`;
      }
    }

    box.hidden = false;
    box.innerHTML = `<p class="kicker">Comparison</p>
      <h3>Historical reports — not a live Analytics run</h3>
      <p class="compare-meta">Similar based on the stored snapshot from each run. Open Analytics and run again for a current analysis. Missing fields show as —.</p>
      <div class="compare-charts">${scoreRows}</div>
      ${spark}
      <div class="table-wrap"><table class="wide data-table">
        <thead><tr><th>Metric</th>${headers.map((item) => `<th>${item}</th>`).join("")}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table></div>`;
  }

  function researchMap() {
    const map = {};
    (desk().reports || []).forEach((row) => {
      if (row.ticker && !map[row.ticker]) map[row.ticker] = row;
    });
    return map;
  }

  function mergeResearch(row) {
    const extra = researchMap()[row.ticker] || {};
    return {
      ...row,
      score: extra.score,
      fundScore: extra.fundScore,
      techScore: extra.techScore,
      newsScore: extra.newsScore,
      label: extra.label,
      investable: extra.investable,
      listed: extra.listed || row.listed || (row.ticker || "").includes("."),
      prevScore: extra.prevScore,
    };
  }

  const FILTER_FIELDS = [
    ["name", "Company name", "text"],
    ["ticker", "Ticker", "text"],
    ["country", "Country", "text"],
    ["region", "Region", "text"],
    ["exchange", "Exchange", "text"],
    ["sector", "Sector", "text"],
    ["industry", "Industry", "text"],
    ["quote_type", "Security type", "text"],
    ["company_size", "Company size", "text"],
    ["market_cap", "Market cap", "number"],
    ["price", "Price", "number"],
    ["day_change", "Day change", "number"],
    ["week52_change", "52-week change", "pct"],
    ["week52_position", "52-week position", "pct"],
    ["week52_high_dist", "Distance from 52-week high", "pct"],
    ["week52_low_dist", "Distance from 52-week low", "pct"],
    ["beta", "Beta", "number"],
    ["price_vs_sma50", "Price vs 50-day average", "pct"],
    ["price_vs_sma200", "Price vs 200-day average", "pct"],
    ["revenue", "Revenue", "number"],
    ["revenue_growth", "Revenue growth", "pct"],
    ["earnings_growth", "Earnings growth", "pct"],
    ["earnings_quarterly_growth", "Quarterly earnings growth", "pct"],
    ["eps", "EPS", "number"],
    ["net_income", "Net income", "number"],
    ["roe", "ROE", "pct"],
    ["roa", "ROA", "pct"],
    ["gross_margin", "Gross margin", "pct"],
    ["operating_margin", "Operating margin", "pct"],
    ["ebitda_margin", "EBITDA margin", "pct"],
    ["profit_margin", "Net margin", "pct"],
    ["ebitda", "EBITDA", "number"],
    ["pe", "P/E", "number"],
    ["forward_pe", "Forward P/E", "number"],
    ["peg", "PEG", "number"],
    ["pb", "Price / Book", "number"],
    ["ps", "Price / Sales", "number"],
    ["ev_ebitda", "EV / EBITDA", "number"],
    ["ev_revenue", "EV / Sales", "number"],
    ["enterprise_value", "Enterprise value", "number"],
    ["book_value", "Book value / share", "number"],
    ["upside", "Implied upside", "pct"],
    ["debt_to_equity", "Debt / Equity", "number"],
    ["current_ratio", "Current ratio", "number"],
    ["quick_ratio", "Quick ratio", "number"],
    ["free_cashflow", "Free cash flow", "number"],
    ["operating_cashflow", "Operating cash flow", "number"],
    ["fcf_margin", "FCF margin", "pct"],
    ["total_cash", "Cash", "number"],
    ["total_debt", "Total debt", "number"],
    ["net_debt", "Net debt", "number"],
    ["dividend_yield", "Dividend yield", "pct"],
    ["dividend_rate", "Dividend per share", "number"],
    ["payout_ratio", "Payout ratio", "pct"],
    ["held_insiders", "Insider ownership", "pct"],
    ["held_institutions", "Institutional ownership", "pct"],
    ["score", "Dilagent score", "score"],
    ["fundScore", "Fundamentals score", "score"],
    ["techScore", "Technical score", "score"],
    ["newsScore", "News score", "score"],
  ];

  function parseFilterValue(raw, kind) {
    if (raw === "" || raw == null) return null;
    if (kind === "text") return String(raw);
    let value = Number(raw);
    if (Number.isNaN(value)) return null;
    if (kind === "pct" && Math.abs(value) > 1) value = value / 100;
    return value;
  }

  function customPass(row) {
    const rows = [...document.querySelectorAll(".custom-row")];
    return rows.every((node) => {
      const field = node.querySelector(".cf-field")?.value;
      const op = node.querySelector(".cf-op")?.value;
      const raw = node.querySelector(".cf-value")?.value;
      const raw2 = node.querySelector(".cf-value-b")?.value;
      if (!field || !op) return true;
      const meta = FILTER_FIELDS.find((item) => item[0] === field);
      const kind = meta ? meta[2] : "number";
      const actual = row[field];
      if (op === "available") return actual != null && actual !== "";
      if (op === "missing") return actual == null || actual === "";
      if (kind === "text") {
        const text = String(actual || "").toLowerCase();
        const needle = String(raw || "").toLowerCase();
        if (!needle && op !== "available" && op !== "missing") return true;
        if (op === "contains") return text.includes(needle);
        if (op === "starts") return text.startsWith(needle);
        if (op === "eq") return text === needle;
        return true;
      }
      if (actual == null || Number.isNaN(Number(actual))) return false;
      const n = Number(actual);
      const value = parseFilterValue(raw, kind);
      const valueB = parseFilterValue(raw2, kind);
      if (op !== "between" && value == null) return true;
      if (op === "gt") return n > value;
      if (op === "gte") return n >= value;
      if (op === "lt") return n < value;
      if (op === "lte") return n <= value;
      if (op === "eq") return Math.abs(n - value) < 1e-6;
      if (op === "between") {
        if (value == null || valueB == null) return true;
        return n >= Math.min(value, valueB) && n <= Math.max(value, valueB);
      }
      return true;
    });
  }

  function addCustomFilter() {
    const host = $("custom-filter-rows");
    if (!host) return;
    const row = document.createElement("div");
    row.className = "custom-row";
    row.innerHTML = `<select class="cf-field">${FILTER_FIELDS.map((item) => `<option value="${item[0]}">${item[1]}</option>`).join("")}</select>
      <select class="cf-op">
        <option value="gt">Greater than</option>
        <option value="gte">Greater than or equal</option>
        <option value="lt">Less than</option>
        <option value="lte">Less than or equal</option>
        <option value="eq">Equal to</option>
        <option value="between">Between</option>
        <option value="contains">Contains</option>
        <option value="starts">Starts with</option>
        <option value="available">Is available</option>
        <option value="missing">Is not available</option>
      </select>
      <input class="cf-value" type="text" placeholder="Value" />
      <input class="cf-value-b" type="text" placeholder="And" hidden />`;
    const second = row.querySelector(".cf-value-b");
    row.querySelector(".cf-op").addEventListener("change", (event) => {
      second.hidden = event.target.value !== "between";
    });
    const remove = actionButton("Remove", "ghost", () => {
      row.remove();
      if (lastDiscover.length) paintDiscoverRows(lastDiscover);
    });
    row.appendChild(remove);
    host.appendChild(row);
  }

  function growthPass(value, rule) {
    if (!rule) return true;
    if (value == null) return false;
    if (rule === "pos") return value > 0;
    if (rule === "neg") return value < 0;
    return value > Number(rule) / 100;
  }

  function capPass(value, rule) {
    if (!rule) return true;
    if (value == null) return false;
    if (rule === "micro") return value < 3e8;
    if (rule === "small") return value < 2e9;
    if (rule === "mid") return value >= 2e9 && value < 1e10;
    if (rule === "large") return value >= 1e10 && value < 2e11;
    if (rule === "mega") return value >= 2e11;
    return true;
  }

  function ratioPass(value, rule, mode) {
    if (!rule) return true;
    if (value == null) return false;
    if (rule === "pos") return value > 0;
    if (rule === "neg") return value < 0;
    const n = Number(rule);
    if (mode === "pct") return value > n / 100;
    if (mode === "min") return value >= n;
    if (mode === "gt") return value > n;
    return value < n;
  }

  function filterDiscover(rows) {
    return rows.filter((row) => {
      if ($("f-country")?.value && row.country !== $("f-country").value) return false;
      if ($("f-region")?.value && row.region !== $("f-region").value) return false;
      if ($("f-market")?.value && row.exchange !== $("f-market").value) return false;
      if ($("f-sector")?.value && row.sector !== $("f-sector").value) return false;
      if ($("f-industry")?.value && row.industry !== $("f-industry").value) return false;
      if ($("f-type")?.value && row.quote_type !== $("f-type").value) return false;
      if ($("f-size")?.value && row.company_size !== $("f-size").value) return false;
      if (!capPass(row.market_cap, $("f-cap")?.value)) return false;
      if ($("f-price")?.value) {
        if (row.price == null) return false;
        const rule = $("f-price").value;
        if (rule === "200p" && row.price <= 200) return false;
        if (rule !== "200p" && row.price >= Number(rule)) return false;
      }
      if ($("f-day")?.value === "pos" && !(row.day_change > 0)) return false;
      if ($("f-day")?.value === "neg" && !(row.day_change < 0)) return false;
      if (!growthPass(row.week52_change, $("f-yret")?.value)) return false;
      if ($("f-52pos")?.value) {
        if (row.week52_position == null) return false;
        if ($("f-52pos").value === "high" && row.week52_position < 0.8) return false;
        if ($("f-52pos").value === "low" && row.week52_position > 0.2) return false;
        if ($("f-52pos").value === "mid" && (row.week52_position < 0.35 || row.week52_position > 0.65)) return false;
      }
      if ($("f-beta")?.value === "1p") {
        if (!(row.beta > 1)) return false;
      } else if (!ratioPass(row.beta, $("f-beta")?.value, "lt")) return false;
      if ($("f-sma50")?.value === "above" && !(row.price_vs_sma50 > 0)) return false;
      if ($("f-sma50")?.value === "below" && !(row.price_vs_sma50 < 0)) return false;
      if ($("f-sma200")?.value === "above" && !(row.price_vs_sma200 > 0)) return false;
      if ($("f-sma200")?.value === "below" && !(row.price_vs_sma200 < 0)) return false;
      if (!growthPass(row.revenue_growth, $("f-rev")?.value)) return false;
      if (!growthPass(row.earnings_growth, $("f-earn")?.value)) return false;
      if (!growthPass(row.earnings_quarterly_growth, $("f-qearn")?.value)) return false;
      if ($("f-trend")?.value && row.earnings_trend !== $("f-trend").value) return false;
      if ($("f-esign")?.value === "pos" && !(row.net_income > 0)) return false;
      if ($("f-esign")?.value === "neg" && !(row.net_income < 0)) return false;
      if ($("f-eps")?.value === "pos" && !(row.eps > 0)) return false;
      if ($("f-eps")?.value === "neg" && !(row.eps < 0)) return false;
      if ($("f-event")?.value === "upcoming" && !row.upcoming_earnings) return false;
      if ($("f-event")?.value === "recent" && !row.recent_earnings) return false;
      if (!ratioPass(row.roe, $("f-roe")?.value, "pct")) return false;
      if (!ratioPass(row.roa, $("f-roa")?.value, "pct")) return false;
      if (!ratioPass(row.gross_margin, $("f-gm")?.value, "pct")) return false;
      if (!ratioPass(row.operating_margin, $("f-opm")?.value, "pct")) return false;
      if (!ratioPass(row.ebitda_margin, $("f-ebitda-m")?.value, "pct")) return false;
      if (!ratioPass(row.profit_margin, $("f-npm")?.value, "pct")) return false;
      if (!ratioPass(row.ebitda, $("f-ebitda")?.value, "pos")) return false;
      if (!ratioPass(row.net_income, $("f-ni")?.value, "pos")) return false;
      if (!ratioPass(row.pe, $("f-pe")?.value, "lt")) return false;
      if (!ratioPass(row.forward_pe, $("f-fpe")?.value, "lt")) return false;
      if (!ratioPass(row.pb, $("f-pb")?.value, "lt")) return false;
      if (!ratioPass(row.ps, $("f-ps")?.value, "lt")) return false;
      if (!ratioPass(row.ev_ebitda, $("f-ev")?.value, "lt")) return false;
      if (!ratioPass(row.ev_revenue, $("f-evs")?.value, "lt")) return false;
      if (!ratioPass(row.upside, $("f-upside")?.value, "pct")) return false;
      if (!ratioPass(row.debt_to_equity, $("f-de")?.value, "lt")) return false;
      if (!ratioPass(row.current_ratio, $("f-cr")?.value, "min")) return false;
      if (!ratioPass(row.quick_ratio, $("f-qr")?.value, "min")) return false;
      if (!ratioPass(row.free_cashflow, $("f-fcf")?.value, "pos")) return false;
      if (!ratioPass(row.operating_cashflow, $("f-ocf")?.value, "pos")) return false;
      if (!ratioPass(row.fcf_margin, $("f-fcfm")?.value, "pct")) return false;
      if ($("f-nd")?.value === "cash" && !(row.net_debt < 0)) return false;
      if ($("f-nd")?.value === "debt" && !(row.net_debt > 0)) return false;
      if (!ratioPass(row.dividend_yield, $("f-div")?.value, "pct")) return false;
      if ($("f-payout")?.value && (row.payout_ratio == null || row.payout_ratio >= Number($("f-payout").value) / 100)) return false;
      if ($("f-ins")?.value && !(row.held_insiders > Number($("f-ins").value) / 100)) return false;
      if ($("f-inst")?.value && !(row.held_institutions > Number($("f-inst").value) / 100)) return false;
      if (!ratioPass(row.score, $("f-dscore")?.value, "min")) return false;
      if (!ratioPass(row.fundScore, $("f-dfund")?.value, "min")) return false;
      if (!ratioPass(row.techScore, $("f-dtech")?.value, "min")) return false;
      if (!ratioPass(row.newsScore, $("f-dnews")?.value, "min")) return false;
      if ($("f-dverdict")?.value && row.label !== $("f-dverdict").value) return false;
      if ($("f-dchg")?.value === "up" && !(row.score != null && row.prevScore != null && row.score > row.prevScore)) return false;
      if ($("f-dchg")?.value === "down" && !(row.score != null && row.prevScore != null && row.score < row.prevScore)) return false;
      if (!customPass(row)) return false;
      return true;
    });
  }

  let lastDiscover = [];

  function paintDiscoverRows(rows) {
    lastDiscover = rows;
    const merged = rows.map(mergeResearch);
    fillSelect($("f-country"), merged.map((row) => row.country), "Any");
    fillSelect($("f-region"), merged.map((row) => row.region), "Any");
    fillSelect($("f-market"), merged.map((row) => row.exchange), "Any");
    fillSelect($("f-sector"), merged.map((row) => row.sector), "Any");
    fillSelect($("f-industry"), merged.map((row) => row.industry), "Any");
    fillSelect($("f-type"), merged.map((row) => row.quote_type), "Any");
    fillSelect($("f-dverdict"), merged.map((row) => row.label), "Any");
    const filtered = filterDiscover(merged);
    const count = $("discover-count");
    if (count) count.textContent = `${filtered.length} compan${filtered.length === 1 ? "y" : "ies"} match your criteria`;
    const body = $("discover-body");
    if (!body) return;
    body.innerHTML = "";
    if (!filtered.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="12" class="empty-note">No published matches for these filters. Broaden a control or search another name.</td>`;
      body.appendChild(tr);
      return;
    }
    filtered.forEach((row) => {
      const tr = document.createElement("tr");
      const star = document.createElement("td");
      star.appendChild(starButton(row));
      const company = document.createElement("td");
      company.innerHTML = `<strong>${row.name}</strong><div class="muted">${row.ticker}</div>`;
      const actions = document.createElement("td");
      const wrap = document.createElement("div");
      wrap.className = "row-actions";
      wrap.appendChild(actionButton("View", "ghost", () => openCompany(row, false)));
      wrap.appendChild(actionButton("Run Analytics", "", () => openCompany(row, true)));
      actions.appendChild(wrap);
      tr.appendChild(star);
      tr.appendChild(company);
      tr.insertAdjacentHTML(
        "beforeend",
        `<td>${row.exchange || "—"}</td><td>${row.sector || "—"}</td><td>${row.industry || "—"}</td><td>${cap(row.market_cap)}</td><td>${pct(row.revenue_growth)}</td><td>${pct(row.earnings_growth)}</td><td>${pct(row.roe)}</td><td>${num(row.pe)}</td><td>${scoreText(row.score)}</td>`
      );
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  async function loadDiscover(similar) {
    const count = $("discover-count");
    if (count) count.textContent = "Reading published financials…";
    const query = ($("discover-q")?.value || "").trim();
    const tickers = [
      ...watchedRows().map((row) => row.ticker),
      ...(desk().reports || []).map((row) => row.ticker),
    ].filter(Boolean).join(",");
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (tickers) params.set("tickers", tickers);
    if (similar) params.set("similar", similar);
    try {
      const response = await fetch(`/api/discover?${params.toString()}`);
      const data = await response.json();
      paintDiscoverRows(data.results || []);
    } catch {
      if (count) count.textContent = "Could not load published company data.";
    }
  }

  function relatedPass(seed, row, wanted) {
    if (!seed || !wanted.length) return true;
    return wanted.some((key) => {
      if (key === "industry") return seed.industry && row.industry === seed.industry;
      if (key === "sector") return seed.sector && row.sector === seed.sector;
      if (key === "market") return (seed.exchange && row.exchange === seed.exchange) || (seed.country && row.country === seed.country);
      if (key === "mcap" && seed.market_cap && row.market_cap) {
        const ratio = Math.max(seed.market_cap, row.market_cap) / Math.min(seed.market_cap, row.market_cap);
        return ratio <= 4;
      }
      if (key === "revenue" && seed.revenue && row.revenue) {
        const ratio = Math.max(seed.revenue, row.revenue) / Math.min(seed.revenue, row.revenue);
        return ratio <= 4;
      }
      if (key === "growth" && seed.revenue_growth != null && row.revenue_growth != null) {
        return Math.abs(seed.revenue_growth - row.revenue_growth) <= 0.08;
      }
      if (key === "profit" && seed.roe != null && row.roe != null) {
        return Math.abs(seed.roe - row.roe) <= 0.08;
      }
      if (key === "value" && seed.pe != null && row.pe != null) {
        return Math.abs(seed.pe - row.pe) / Math.max(Math.abs(seed.pe), 1) <= 0.4;
      }
      if (key === "health" && seed.debt_to_equity != null && row.debt_to_equity != null) {
        return Math.abs(seed.debt_to_equity - row.debt_to_equity) / Math.max(Math.abs(seed.debt_to_equity), 1) <= 0.4;
      }
      return false;
    });
  }

  async function loadSimilar() {
    const query = ($("discover-q")?.value || "").trim();
    const note = $("similar-note");
    if (!query) {
      if (note) {
        note.hidden = false;
        note.textContent = "Enter a company first, then find similar names.";
      }
      return;
    }
    if (note) {
      note.hidden = false;
      note.textContent = `Looking for companies related to ${query}…`;
    }
    try {
      const response = await fetch(`/api/similar?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      const seed = data.seed;
      const wanted = [...document.querySelectorAll("#similar-criteria input:checked")].map((node) => node.value);
      const rows = (data.results || []).filter((row) => relatedPass(seed, row, wanted));
      if (note) {
        note.textContent = seed
          ? `Similar based on selected criteria to ${seed.name} · ${[seed.sector, seed.industry].filter(Boolean).join(" · ") || "profile"} — not a recommendation.`
          : "No published profile for that name.";
      }
      paintDiscoverRows(rows);
    } catch {
      if (note) note.textContent = "Could not load similar companies.";
    }
  }

  const PRESET_IDS = [
    "f-rev", "f-earn", "f-qearn", "f-trend", "f-roe", "f-roa", "f-opm", "f-npm",
    "f-pe", "f-pb", "f-ev", "f-de", "f-dscore", "f-dfund", "f-dchg", "f-cap",
    "f-fcf", "f-ni", "f-esign",
  ];

  function applyPreset(name) {
    const set = (id, value) => { if ($(id)) $(id).value = value; };
    PRESET_IDS.forEach((id) => set(id, ""));
    if (name === "fundamentals") {
      set("f-roe", "10"); set("f-opm", "pos"); set("f-de", "100");
    } else if (name === "growth") {
      set("f-rev", "10"); set("f-earn", "10");
    } else if (name === "lowdebt") {
      set("f-de", "50");
    } else if (name === "profit") {
      set("f-npm", "pos"); set("f-roe", "pos"); set("f-ni", "pos");
    } else if (name === "earnings") {
      set("f-trend", "improving");
    } else if (name === "value") {
      set("f-pe", "25"); set("f-ev", "12");
    } else if (name === "fcf") {
      set("f-fcf", "pos");
    } else if (name === "score") {
      set("f-dscore", "70");
    } else if (name === "improving") {
      set("f-dchg", "up");
    } else if (name === "similar") {
      loadSimilar();
      return;
    }
    if (lastDiscover.length) paintDiscoverRows(lastDiscover);
    else loadDiscover();
  }

  function paint(view) {
    if (view === "dashboard") paintDashboard();
    if (view === "watchlist") paintWatch();
    if (view === "reports") paintReports();
    if (view === "discover" && !lastDiscover.length) loadDiscover();
    if (view === "discover" && lastDiscover.length) paintDiscoverRows(lastDiscover);
  }

  ["watch-q", "watch-market", "watch-sector", "watch-verdict", "watch-change", "watch-sort"].forEach((id) => {
    $(id)?.addEventListener("input", paintWatch);
    $(id)?.addEventListener("change", paintWatch);
  });
  ["report-q", "report-verdict", "report-sort"].forEach((id) => {
    $(id)?.addEventListener("input", paintReports);
    $(id)?.addEventListener("change", paintReports);
  });

  async function searchWatchNames(event) {
    if (event) event.preventDefault();
    const query = ($("watch-find")?.value || "").trim();
    const host = $("watch-hits");
    const body = $("watch-hit-body");
    const count = $("watch-hit-count");
    if (!host || !body) return;
    if (query.length < 2) {
      host.hidden = true;
      return;
    }
    count.textContent = "Searching the existing company list…";
    host.hidden = false;
    try {
      const [sec, listed, discovered] = await Promise.all([
        fetch(`/api/companies?q=${encodeURIComponent(query)}&limit=20`).then((res) => res.json()),
        fetch(`/api/listed?q=${encodeURIComponent(query)}`).then((res) => res.json()).catch(() => ({ results: [] })),
        fetch(`/api/discover?q=${encodeURIComponent(query)}`).then((res) => res.json()).catch(() => ({ results: [] })),
      ]);
      const seen = new Set();
      const hits = [];
      for (const row of [...(discovered.results || []), ...(sec.results || []), ...(listed.results || [])]) {
        const ticker = (row.ticker || "").toUpperCase();
        if (!ticker || seen.has(ticker)) continue;
        seen.add(ticker);
        hits.push({
          ticker,
          name: row.name || ticker,
          exchange: row.exchange || "",
          sector: row.sector || "",
          industry: row.industry || "",
          cik: row.cik || "",
          listed: row.origin === "listed" || ticker.includes("."),
        });
      }
      count.textContent = `${hits.length} match${hits.length === 1 ? "" : "es"} — add to Watchlist without running Analytics.`;
      body.innerHTML = "";
      if (!hits.length) {
        body.innerHTML = `<tr><td colspan="5" class="empty-note">No company in the SEC / Yahoo list matched that search.</td></tr>`;
        return;
      }
      hits.forEach((row) => {
        const tr = document.createElement("tr");
        const sector = [row.sector, row.industry].filter(Boolean).join(" / ") || "—";
        tr.innerHTML = `<td><strong>${row.name}</strong></td><td>${row.ticker}</td><td>${row.exchange || "—"}</td><td>${sector}</td>`;
        const actions = document.createElement("td");
        const wrap = document.createElement("div");
        wrap.className = "row-actions";
        wrap.appendChild(starButton(row));
        wrap.appendChild(actionButton(isWatched(row.ticker) ? "Saved" : "Add to Watchlist", "ghost", () => {
          if (!isWatched(row.ticker)) toggleWatch(row);
          enrichWatch(row);
        }));
        wrap.appendChild(actionButton("Run Analytics", "", () => openCompany(row, true)));
        actions.appendChild(wrap);
        tr.appendChild(actions);
        body.appendChild(tr);
      });
    } catch {
      count.textContent = "Search failed.";
    }
  }

  async function enrichWatch(row) {
    try {
      const response = await fetch(`/api/profile?q=${encodeURIComponent(row.ticker)}`);
      if (!response.ok || !window.writeDesk) return;
      const profile = await response.json();
      const state = desk();
      const watch = (state.watch || []).map((item) => (
        item.ticker === row.ticker
          ? {
              ...item,
              name: profile.name || item.name,
              sector: profile.sector || item.sector,
              industry: profile.industry || item.industry,
              exchange: profile.exchange || item.exchange,
            }
          : item
      ));
      window.writeDesk({ ...state, watch });
      paintWatch();
    } catch {
      /* published profile is optional */
    }
  }

  let watchTimer;
  $("watch-search")?.addEventListener("submit", searchWatchNames);
  $("watch-find")?.addEventListener("input", () => {
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => searchWatchNames(), 320);
  });
  $("add-filter")?.addEventListener("click", addCustomFilter);
  $("open-method")?.addEventListener("click", () => go("method"));
  $("report-compare")?.addEventListener("click", compareReports);

  $("discover-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadDiscover();
  });
  $("discover-similar")?.addEventListener("click", loadSimilar);
  $("discover-presets")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (button) applyPreset(button.getAttribute("data-preset"));
  });
  document.querySelector(".filter-box")?.addEventListener("change", () => {
    if (lastDiscover.length) paintDiscoverRows(lastDiscover);
  });

  window.Desk = { paint, toggleWatch, isWatched };
  paint(currentView());
})();
