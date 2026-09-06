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
          cik: row.cik || "",
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
    watchHydrateKey = "";
    paint(currentView());
    if (window.paintResultStar) window.paintResultStar();
  }

  function listingCore(ticker) {
    return (ticker || "").split(".")[0].toUpperCase();
  }

  function isSideSecurity(ticker) {
    return /-(P|PA|PB|PC|PR|WS|WT|W|U|R|UN)(\.|$)/i.test(ticker || "") || /\.PR/i.test(ticker || "");
  }

  function issuerKey(row) {
    const cik = String(row.cik || "").replace(/^0+/, "");
    if (cik) return `cik:${cik}`;
    return `core:${listingCore(row.ticker)}`;
  }

  function findIssuerMatch(row, watch) {
    const key = issuerKey(row);
    return (watch || []).find((item) => item.ticker !== row.ticker && issuerKey(item) === key) || null;
  }

  function addWatch(row) {
    if (!row || !row.ticker) return;
    const match = findIssuerMatch(row, desk().watch || []);
    if (match && (isSideSecurity(row.ticker) || listingCore(row.ticker) === listingCore(match.ticker))) {
      enrichWatch(match);
      return;
    }
    if (!isWatched(row.ticker)) toggleWatch(row);
    enrichWatch(row);
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
    const saved = isWatched(row.ticker);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `star-btn${saved ? " is-on" : ""}`;
    button.title = saved ? "Remove from Watchlist" : "Add to Watchlist";
    button.setAttribute("aria-label", button.title);
    button.textContent = saved ? "★" : "☆";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleWatch(row);
    });
    return button;
  }

  function moneyShort(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function sparkSvg(closes) {
    if (!closes || closes.length < 2) return "—";
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = Math.max(max - min, 1e-9);
    const points = closes.map((value, index) => {
      const x = (index / (closes.length - 1)) * 72;
      const y = 20 - ((value - min) / span) * 18;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const up = closes[closes.length - 1] >= closes[0];
    return `<svg class="spark" viewBox="0 0 72 22" aria-hidden="true"><polyline fill="none" stroke="${up ? "#0d6b4c" : "#b42318"}" stroke-width="1.5" points="${points}" /></svg>`;
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
      empty(favs, "Nothing saved yet. Star a company or run Analytics. Analyzed companies are added to Watchlist automatically.");
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

  let watchManaging = false;
  let watchQuotes = {};
  let watchSparks = {};
  let watchHydrateKey = "";

  function groupWatchRows(rows) {
    const used = new Set();
    const groups = [];
    rows.forEach((row) => {
      if (used.has(row.ticker)) return;
      const pack = rows.filter((other) => {
        if (used.has(other.ticker) && other.ticker !== row.ticker) return false;
        if (other.ticker === row.ticker) return true;
        const sameCik = row.cik && other.cik && String(row.cik).replace(/^0+/, "") === String(other.cik).replace(/^0+/, "");
        const sameCore = listingCore(row.ticker) === listingCore(other.ticker) && isSideSecurity(other.ticker);
        return Boolean(sameCik || sameCore);
      });
      pack.forEach((item) => used.add(item.ticker));
      const primary = pack.find((item) => item.at) || pack.find((item) => !isSideSecurity(item.ticker)) || pack[0];
      groups.push({
        ...primary,
        alternates: pack.filter((item) => item.ticker !== primary.ticker),
      });
    });
    return groups;
  }

  function mergeQuote(row) {
    const extra = watchQuotes[row.ticker] || {};
    return {
      ...row,
      cik: row.cik || extra.cik,
      price: extra.price,
      day_change_pct: extra.day_change_pct,
      market_cap: extra.market_cap,
      revenue_growth: extra.revenue_growth,
      earnings_growth: extra.earnings_growth,
      roe: row.roe ?? extra.roe,
      pe: row.pe ?? extra.pe,
      sector: row.sector || extra.sector,
      industry: row.industry || extra.industry,
      exchange: row.exchange || extra.exchange,
    };
  }

  function setWatchManaging(on) {
    watchManaging = Boolean(on);
    const bar = $("watch-manage-bar");
    const toggle = $("watch-manage");
    if (bar) bar.hidden = !watchManaging;
    if (toggle) toggle.hidden = watchManaging;
    document.querySelectorAll("#watch-table .manage-only").forEach((node) => {
      node.hidden = !watchManaging;
    });
    paintWatch(false);
  }

  async function hydrateWatchMarket(rows) {
    const tickers = rows.map((row) => row.ticker).filter(Boolean);
    const key = tickers.join(",");
    if (!key || key === watchHydrateKey) return;
    watchHydrateKey = key;
    try {
      const [disc, spark] = await Promise.all([
        fetch(`/api/discover?tickers=${encodeURIComponent(key)}`).then((res) => res.json()),
        fetch(`/api/spark?tickers=${encodeURIComponent(key)}`).then((res) => res.json()).catch(() => ({ results: {} })),
      ]);
      watchQuotes = {};
      for (const row of disc.results || []) watchQuotes[row.ticker] = row;
      watchSparks = spark.results || {};
      paintWatch(false);
    } catch {
      watchHydrateKey = "";
    }
  }

  function paintWatch(refresh = true) {
    const body = $("watch-body");
    if (!body) return;
    const query = ($("watch-q")?.value || "").trim().toLowerCase();
    const market = $("watch-market")?.value || "";
    const sector = $("watch-sector")?.value || "";
    const verdict = $("watch-verdict")?.value || "";
    const change = $("watch-change")?.value || "";
    const sort = $("watch-sort")?.value || "name";
    let rows = groupWatchRows(watchedRows().map(mergeQuote));
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
    document.querySelectorAll("#watch-table .manage-only").forEach((node) => {
      node.hidden = !watchManaging;
    });
    body.innerHTML = "";
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="${watchManaging ? 15 : 14}" class="empty-note">No saved names match. Search above to add a company without running Analytics.</td>`;
      body.appendChild(tr);
      if (refresh) hydrateWatchMarket(watchedRows());
      return;
    }
    rows.forEach((row) => {
      const quote = mergeQuote(row);
      const spark = watchSparks[row.ticker] || {};
      const tr = document.createElement("tr");
      if (watchManaging) {
        const check = document.createElement("td");
        check.className = "manage-only";
        check.innerHTML = `<input type="checkbox" class="watch-check" value="${row.ticker}" />`;
        tr.appendChild(check);
      }
      const star = document.createElement("td");
      star.appendChild(starButton(row));
      const company = document.createElement("td");
      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "watch-name";
      nameBtn.textContent = row.name;
      nameBtn.addEventListener("click", () => openCompany(row, true));
      company.appendChild(nameBtn);
      if (row.alternates && row.alternates.length) {
        const note = document.createElement("div");
        note.className = "alt-note";
        note.textContent = `Also ${row.alternates.map((item) => item.ticker).join(", ")}`;
        company.appendChild(note);
      }
      const actions = document.createElement("td");
      const wrap = document.createElement("div");
      wrap.className = "row-actions";
      wrap.appendChild(actionButton("Run Analytics", "", () => openCompany(row, true)));
      actions.appendChild(wrap);
      const day = quote.day_change_pct;
      const dayClass = day == null ? "chg" : day > 0 ? "chg up" : day < 0 ? "chg down" : "chg";
      tr.appendChild(star);
      tr.appendChild(company);
      tr.insertAdjacentHTML(
        "beforeend",
        `<td>${row.ticker}</td><td>${moneyShort(quote.price)}</td><td class="${dayClass}">${pct(day)}</td><td>${cap(quote.market_cap)}</td><td>${pct(quote.revenue_growth)}</td><td>${pct(quote.earnings_growth)}</td><td>${pct(quote.roe)}</td><td>${num(quote.pe)}</td><td>${scoreText(row.score)}</td>`
      );
      const verdictCell = document.createElement("td");
      verdictCell.innerHTML = row.label
        ? `<span class="pill ${row.investable || tone(row.score)}">${row.label}</span>`
        : `<span class="muted">Not analyzed</span>`;
      tr.appendChild(verdictCell);
      const trend = document.createElement("td");
      trend.innerHTML = sparkSvg(spark.closes);
      if (spark.week_return != null) {
        trend.insertAdjacentHTML("beforeend", `<div class="alt-note">${pct(spark.week_return)} 1w</div>`);
      }
      tr.appendChild(trend);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    if (refresh) hydrateWatchMarket(rows);
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
        body.innerHTML = `<tr><td colspan="7" class="empty-note">No reports yet. Run Analytics to generate a historical snapshot. Watched names do not appear here until they have been analyzed.</td></tr>`;
        return;
      }
      const latest = uniqueCompanies(desk().reports || []).map((row) => `${row.ticker}-${row.at}`);
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.className = "is-clickable";
        const check = document.createElement("td");
        check.innerHTML = `<input type="checkbox" class="report-check" value="${(desk().reports || []).indexOf(row)}" />`;
        const company = document.createElement("td");
        company.innerHTML = `<strong>${row.name}</strong><div class="muted">${row.ticker}</div>`;
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
        tr.addEventListener("click", (event) => {
          if (event.target.closest("input")) return;
          openCompany(row, true);
        });
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
    box.innerHTML = `<p class="kicker">Report comparison</p>
      <h3>Historical Analytics results</h3>
      <p class="compare-meta">This compares stored runs, not the companies on your Watchlist. Click a report row to reopen Analytics. Missing fields show as —.</p>
      <div class="compare-charts">${scoreRows}</div>
      ${spark}
      <div class="table-wrap"><table class="wide data-table">
        <thead><tr><th>Metric</th>${headers.map((item) => `<th>${item}</th>`).join("")}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table></div>`;
  }

  function metricBars(picked, label, key, format) {
    const usable = picked.filter((row) => row[key] != null && !Number.isNaN(Number(row[key])));
    if (!usable.length) return "";
    const max = Math.max(...usable.map((row) => Math.abs(Number(row[key]))), 1e-9);
    const bars = picked.map((row) => {
      const value = row[key];
      const width = value == null ? 0 : Math.min(100, (Math.abs(Number(value)) / max) * 100);
      return `<div class="cmp-bar-row"><span>${row.ticker}</span><div class="cmp-track"><i style="width:${width}%"></i></div><span>${format(value)}</span></div>`;
    }).join("");
    return `<div class="cmp-metric"><strong>${label}</strong>${bars}</div>`;
  }

  function scoreBars(picked) {
    return [
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
  }

  async function compareWatch() {
    const box = $("watch-compare");
    if (!box) return;
    const tickers = [...document.querySelectorAll(".watch-check:checked")].map((node) => node.value);
    if (tickers.length < 2) {
      box.hidden = false;
      box.innerHTML = `<p class="empty-note">Select at least two companies on your Watchlist, then compare.</p>`;
      return;
    }
    const byTicker = Object.fromEntries(watchedRows().map((row) => [row.ticker, row]));
    let published = {};
    try {
      const response = await fetch(`/api/discover?tickers=${encodeURIComponent(tickers.join(","))}`);
      const data = await response.json();
      for (const row of data.results || []) published[row.ticker] = row;
    } catch {
      published = {};
    }
    const picked = tickers.map((ticker) => {
      const saved = byTicker[ticker] || { ticker };
      const extra = published[ticker] || {};
      return {
        ...extra,
        ...saved,
        ticker,
        name: saved.name || extra.name || ticker,
        price: extra.price,
        day_change_pct: extra.day_change_pct,
        beta: extra.beta,
        market_cap: extra.market_cap,
        revenue_growth: extra.revenue_growth,
        earnings_growth: extra.earnings_growth,
        roe: saved.roe ?? extra.roe,
        roa: saved.roa ?? extra.roa,
        pe: saved.pe ?? extra.pe,
        forward_pe: saved.forwardPe ?? extra.forward_pe,
        pb: saved.pb ?? extra.pb,
        ps: extra.ps,
        ev_ebitda: saved.evEbitda ?? extra.ev_ebitda,
        debt_to_equity: saved.debtToEquity ?? extra.debt_to_equity,
        current_ratio: saved.currentRatio ?? extra.current_ratio,
        free_cashflow: saved.fcf ?? extra.free_cashflow,
        gross_margin: extra.gross_margin,
        operating_margin: extra.operating_margin,
        profit_margin: extra.profit_margin,
      };
    });
    const headers = picked.map((row) => `${row.name}<div class="muted">${row.ticker}${row.at ? ` · Analyzed ${when(row.at)}` : " · Not analyzed"}</div>`);
    const metrics = [
      ["Status", (row) => (row.at ? "Saved and analyzed" : "Saved — not analyzed")],
      ["Dilagent score", (row) => scoreText(row.score)],
      ["Fundamentals", (row) => scoreText(row.fundScore)],
      ["Technicals", (row) => scoreText(row.techScore)],
      ["News / external", (row) => scoreText(row.newsScore)],
      ["Verdict", (row) => row.label || "Not analyzed"],
      ["Market", (row) => row.exchange || row.market || "—"],
      ["Current price", (row) => moneyShort(row.price)],
      ["Daily change", (row) => pct(row.day_change_pct)],
      ["1-week return", (row) => pct((watchSparks[row.ticker] || {}).week_return)],
      ["1-month return", (row) => pct((watchSparks[row.ticker] || {}).month_return)],
      ["Beta", (row) => num(row.beta, 2)],
      ["Market cap", (row) => cap(row.market_cap)],
      ["Revenue growth", (row) => pct(row.revenue_growth)],
      ["Earnings growth", (row) => pct(row.earnings_growth)],
      ["ROE", (row) => pct(row.roe)],
      ["ROA", (row) => pct(row.roa)],
      ["Gross margin", (row) => pct(row.gross_margin)],
      ["Operating margin", (row) => pct(row.operating_margin)],
      ["Net margin", (row) => pct(row.profit_margin)],
      ["P/E", (row) => num(row.pe)],
      ["Forward P/E", (row) => num(row.forward_pe)],
      ["Price / Book", (row) => num(row.pb, 2)],
      ["Price / Sales", (row) => num(row.ps, 2)],
      ["EV / EBITDA", (row) => num(row.ev_ebitda)],
      ["Debt / Equity", (row) => num(row.debt_to_equity)],
      ["Current ratio", (row) => num(row.current_ratio, 2)],
      ["Free cash flow", (row) => cap(row.free_cashflow)],
    ];
    const tableRows = metrics.map(([label, read]) => `<tr><td>${label}</td>${picked.map((row) => `<td>${read(row)}</td>`).join("")}</tr>`).join("");
    const extraCharts = [
      metricBars(picked, "Revenue growth", "revenue_growth", pct),
      metricBars(picked, "Earnings growth", "earnings_growth", pct),
      metricBars(picked, "ROE", "roe", pct),
      metricBars(picked, "P/E", "pe", num),
    ].filter(Boolean).join("");
    box.hidden = false;
    box.innerHTML = `<p class="kicker">Watchlist comparison</p>
      <h3>Companies you are tracking</h3>
      <p class="compare-meta">This compares the companies on your Watchlist, not historical Analytics reports. Unanalyzed names show — / Not analyzed. Missing published fields show as —.</p>
      <div class="compare-charts">${scoreBars(picked)}${extraCharts}</div>
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
    ["week_return", "1-week return", "pct"],
    ["month_return", "1-month return", "pct"],
    ["quarter_return", "3-month return", "pct"],
    ["half_return", "6-month return", "pct"],
    ["ytd_return", "YTD return", "pct"],
    ["year_return", "1-year return", "pct"],
    ["year3_return", "3-year return", "pct"],
    ["year5_return", "5-year return", "pct"],
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

  const DILAGENT_VERDICTS = [
    "Investable",
    "Investable — wait for a better entry",
    "Investable — watch headline risk",
    "Cautiously investable",
    "Cautiously investable — wait",
    "Cautious — external risk elevated",
    "Not investable",
  ];

  const GROWTH_PRESETS = [
    ["", "Any"],
    ["declining", "Declining"],
    ["flat", "Flat"],
    ["growing", "Growing"],
    ["strong", "Strong growth"],
    ["neg", "Negative"],
    ["0-5", "0–5%"],
    ["5-10", "5–10%"],
    ["10-20", "10–20%"],
    ["20-30", "20–30%"],
    ["30-50", "30–50%"],
    ["50+", "50%+"],
    ["custom", "Custom"],
  ];

  const MARGIN_PRESETS = [
    ["", "Any"],
    ["neg", "Negative"],
    ["pos", "Positive"],
    ["0-5", "0–5%"],
    ["5-10", "5–10%"],
    ["10-15", "10–15%"],
    ["15-20", "15–20%"],
    ["20-30", "20–30%"],
    ["30-50", "30–50%"],
    ["50+", "50%+"],
    ["custom", "Custom range"],
  ];

  const ROE_PRESETS = [
    ["", "Any"],
    ["neg", "Negative"],
    ["0-5", "0–5%"],
    ["5-10", "5–10%"],
    ["10-15", "10–15%"],
    ["15-20", "15–20%"],
    ["20-30", "20–30%"],
    ["30+", "30%+"],
    ["custom", "Custom range"],
  ];

  const MULTIPLE_PRESETS = [
    ["", "Any"],
    ["neg", "Negative"],
    ["na", "Not available"],
    ["lt10", "< 10"],
    ["10-15", "10–15"],
    ["15-20", "15–20"],
    ["20-30", "20–30"],
    ["30-50", "30–50"],
    ["50+", "50+"],
    ["custom", "Custom range"],
  ];

  const RETURN_PRESETS = [
    ["", "Any"],
    ["large_down", "Large decline"],
    ["mod_down", "Moderate decline"],
    ["flat", "Flat"],
    ["mod_up", "Moderate gain"],
    ["strong_up", "Strong gain"],
    ["lt-50", "< -50%"],
    ["-50--20", "-50% to -20%"],
    ["-20-0", "-20% to 0%"],
    ["0-10", "0% to 10%"],
    ["10-25", "10% to 25%"],
    ["25-50", "25% to 50%"],
    ["50+", "50%+"],
    ["custom", "Custom range"],
  ];

  const SCORE_PRESETS = [
    ["", "Any"],
    ["lt40", "< 40"],
    ["40-49", "40–49"],
    ["50-59", "50–59"],
    ["60-69", "60–69"],
    ["70-79", "70–79"],
    ["80-89", "80–89"],
    ["90+", "90+"],
    ["custom", "Custom range"],
  ];

  const SCREENER = [
    {
      id: "company",
      title: "Company",
      open: true,
      hint: "Narrow the company universe. Selected values are combined with OR.",
      controls: [
        { type: "multi", id: "country", field: "country", label: "Country" },
        { type: "multi", id: "market", field: "exchange", label: "Exchange / Market" },
        { type: "multi", id: "sector", field: "sector", label: "Sector" },
        { type: "multi", id: "industry", field: "industry", label: "Industry" },
        {
          type: "num", id: "cap", field: "market_cap", label: "Market capitalization", kind: "cap",
          minPh: "Min $B", maxPh: "Max $B",
          presets: [
            ["", "Any"],
            ["micro", "Micro cap"],
            ["small", "Small cap"],
            ["mid", "Mid cap"],
            ["large", "Large cap"],
            ["mega", "Mega cap"],
            ["gt10b", "> $10B"],
            ["lt5b", "< $5B"],
            ["1-10b", "$1B – $10B"],
            ["custom", "Custom range"],
          ],
        },
      ],
    },
    {
      id: "growth",
      title: "Growth",
      controls: [
        { type: "num", id: "rev", field: "revenue_growth", label: "Revenue growth", kind: "pct", presets: GROWTH_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "earn", field: "earnings_growth", label: "Earnings growth", kind: "pct", presets: GROWTH_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "qearn", field: "earnings_quarterly_growth", label: "Profit growth", kind: "pct", presets: GROWTH_PRESETS, minPh: "Min %", maxPh: "Max %", note: "Published quarterly earnings growth." },
        {
          type: "choice", id: "trend", label: "Growth direction",
          presets: [
            ["", "Any"],
            ["declining", "Declining"],
            ["stable", "Flat"],
            ["improving", "Growing"],
            ["strong", "Strong growth"],
          ],
        },
      ],
    },
    {
      id: "profit",
      title: "Profitability",
      controls: [
        { type: "num", id: "roe", field: "roe", label: "ROE", kind: "pct", presets: ROE_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "roa", field: "roa", label: "ROA", kind: "pct", presets: ROE_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "gm", field: "gross_margin", label: "Gross margin", kind: "pct", presets: MARGIN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "opm", field: "operating_margin", label: "Operating margin", kind: "pct", presets: MARGIN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "ebitda-m", field: "ebitda_margin", label: "EBITDA margin", kind: "pct", presets: MARGIN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "npm", field: "profit_margin", label: "Net margin", kind: "pct", presets: MARGIN_PRESETS, minPh: "Min %", maxPh: "Max %" },
      ],
    },
    {
      id: "value",
      title: "Valuation",
      hint: "Negative multiples and missing values are separate from the positive ranges.",
      controls: [
        { type: "num", id: "pe", field: "pe", label: "P/E", kind: "multiple", presets: MULTIPLE_PRESETS, minPh: "Min", maxPh: "Max" },
        { type: "num", id: "fpe", field: "forward_pe", label: "Forward P/E", kind: "multiple", presets: MULTIPLE_PRESETS, minPh: "Min", maxPh: "Max" },
        { type: "num", id: "pb", field: "pb", label: "Price / Book", kind: "multiple", presets: MULTIPLE_PRESETS, minPh: "Min", maxPh: "Max" },
        { type: "num", id: "ps", field: "ps", label: "Price / Sales", kind: "multiple", presets: MULTIPLE_PRESETS, minPh: "Min", maxPh: "Max" },
        { type: "num", id: "ev", field: "ev_ebitda", label: "EV / EBITDA", kind: "multiple", presets: MULTIPLE_PRESETS, minPh: "Min", maxPh: "Max" },
        { type: "num", id: "evs", field: "ev_revenue", label: "EV / Sales", kind: "multiple", presets: MULTIPLE_PRESETS, minPh: "Min", maxPh: "Max" },
      ],
    },
    {
      id: "health",
      title: "Financial Health",
      controls: [
        {
          type: "num", id: "de", field: "debt_to_equity", label: "Debt / Equity", kind: "de",
          minPh: "Min", maxPh: "Max",
          presets: [
            ["", "Any"],
            ["0", "0"],
            ["lt0.25", "< 0.25"],
            ["0.25-0.5", "0.25–0.5"],
            ["0.5-1", "0.5–1"],
            ["1-2", "1–2"],
            ["2-5", "2–5"],
            ["5+", "5+"],
            ["custom", "Custom"],
          ],
        },
        {
          type: "num", id: "cr", field: "current_ratio", label: "Current ratio", kind: "ratio",
          minPh: "Min", maxPh: "Max",
          presets: [
            ["", "Any"],
            ["lt1", "< 1"],
            ["1-1.5", "1–1.5"],
            ["1.5-2", "1.5–2"],
            ["2-3", "2–3"],
            ["3+", "3+"],
            ["custom", "Custom range"],
          ],
        },
        {
          type: "num", id: "fcf", field: "free_cashflow", label: "Free cash flow", kind: "cash",
          minPh: "Min $M", maxPh: "Max $M",
          presets: [
            ["", "Any"],
            ["neg", "Negative"],
            ["pos", "Positive"],
            ["gt10m", "> $10M"],
            ["gt100m", "> $100M"],
            ["gt1b", "> $1B"],
            ["custom", "Custom"],
          ],
        },
        {
          type: "num", id: "ocf", field: "operating_cashflow", label: "Operating cash flow", kind: "cash",
          minPh: "Min $M", maxPh: "Max $M",
          presets: [
            ["", "Any"],
            ["neg", "Negative"],
            ["pos", "Positive"],
            ["gt10m", "> $10M"],
            ["gt100m", "> $100M"],
            ["gt1b", "> $1B"],
            ["custom", "Custom"],
          ],
        },
        {
          type: "num", id: "nd", field: "net_debt", label: "Net debt", kind: "netdebt",
          minPh: "Min $M", maxPh: "Max $M",
          presets: [
            ["", "Any"],
            ["cash", "Net cash"],
            ["debt", "Net debt"],
            ["custom", "Custom range"],
          ],
        },
      ],
    },
    {
      id: "market",
      title: "Market Performance",
      hint: "1-day and 1-year use published Yahoo fields. Other windows use daily price history when available.",
      controls: [
        { type: "num", id: "day", field: "day_change_pct", label: "1-day return", kind: "ret", presets: RETURN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "week", field: "week_return", label: "1-week return", kind: "ret", presets: RETURN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "month", field: "month_return", label: "1-month return", kind: "ret", presets: RETURN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "quarter", field: "quarter_return", label: "3-month return", kind: "ret", presets: RETURN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "half", field: "half_return", label: "6-month return", kind: "ret", presets: RETURN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "ytd", field: "ytd_return", label: "YTD return", kind: "ret", presets: RETURN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "year", field: "week52_change", label: "1-year return", kind: "ret", presets: RETURN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "year3", field: "year3_return", label: "3-year return", kind: "ret", presets: RETURN_PRESETS, minPh: "Min %", maxPh: "Max %" },
        { type: "num", id: "year5", field: "year5_return", label: "5-year return", kind: "ret", presets: RETURN_PRESETS, minPh: "Min %", maxPh: "Max %" },
      ],
    },
    {
      id: "div",
      title: "Dividends",
      controls: [
        {
          type: "choice", id: "divpay", label: "Dividend-paying",
          presets: [
            ["", "Any"],
            ["pays", "Pays a dividend"],
            ["none", "Does not pay a dividend"],
          ],
        },
        {
          type: "num", id: "div", field: "dividend_yield", label: "Dividend yield", kind: "pct",
          minPh: "Min %", maxPh: "Max %",
          presets: [
            ["", "Any"],
            ["none", "No dividend"],
            ["0-2", "0–2%"],
            ["2-4", "2–4%"],
            ["4-6", "4–6%"],
            ["6+", "6%+"],
            ["custom", "Custom"],
          ],
        },
        {
          type: "num", id: "payout", field: "payout_ratio", label: "Payout ratio", kind: "pct",
          minPh: "Min %", maxPh: "Max %",
          presets: [
            ["", "Any"],
            ["lt30", "< 30%"],
            ["30-50", "30–50%"],
            ["50-70", "50–70%"],
            ["70+", "70%+"],
            ["custom", "Custom"],
          ],
        },
      ],
    },
    {
      id: "dilagent",
      title: "Dilagent",
      hint: "Scores and verdicts appear after an Analytics run. These are screening controls, not recommendations.",
      controls: [
        { type: "num", id: "dscore", field: "score", label: "Dilagent score", kind: "score", presets: SCORE_PRESETS, minPh: "Min", maxPh: "Max" },
        { type: "num", id: "dfund", field: "fundScore", label: "Fundamentals score", kind: "score", presets: SCORE_PRESETS, minPh: "Min", maxPh: "Max" },
        { type: "num", id: "dtech", field: "techScore", label: "Technicals score", kind: "score", presets: SCORE_PRESETS, minPh: "Min", maxPh: "Max" },
        { type: "num", id: "dnews", field: "newsScore", label: "News / external score", kind: "score", presets: SCORE_PRESETS, minPh: "Min", maxPh: "Max" },
        { type: "multi", id: "verdict", field: "label", label: "Verdict", static: DILAGENT_VERDICTS },
        {
          type: "num", id: "dchg", field: "score_delta", label: "Score change", kind: "delta",
          minPh: "Min pts", maxPh: "Max pts",
          presets: [
            ["", "Any"],
            ["up", "Improving"],
            ["flat", "No meaningful change"],
            ["down", "Declining"],
            ["custom", "Custom change range"],
          ],
        },
      ],
    },
  ];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function optionHtml(pairs) {
    return pairs.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
  }

  function buildScreener() {
    const host = $("screener-groups");
    if (!host || host.dataset.ready) return;
    host.innerHTML = SCREENER.map((group) => {
      const controls = group.controls.map((spec) => {
        if (spec.type === "multi") {
          return `<div class="ms" data-ms="${spec.id}" data-field="${spec.field}">
            <span class="nf-label">${esc(spec.label)}</span>
            <p class="ms-hint">Match any selected</p>
            <div class="ms-list" id="ms-${spec.id}"></div>
          </div>`;
        }
        if (spec.type === "choice") {
          return `<div class="nf" data-nf="${spec.id}" data-kind="choice">
            <span class="nf-label">${esc(spec.label)}</span>
            <select class="nf-preset" id="f-${spec.id}">${optionHtml(spec.presets)}</select>
          </div>`;
        }
        return `<div class="nf" data-nf="${spec.id}" data-field="${spec.field}" data-kind="${spec.kind}">
          <span class="nf-label">${esc(spec.label)}</span>
          ${spec.note ? `<p class="ms-hint">${esc(spec.note)}</p>` : ""}
          <select class="nf-preset" id="f-${spec.id}">${optionHtml(spec.presets)}</select>
          <div class="nf-custom" hidden>
            <input class="nf-min" type="number" step="any" placeholder="${esc(spec.minPh || "Min")}" />
            <input class="nf-max" type="number" step="any" placeholder="${esc(spec.maxPh || "Max")}" />
          </div>
        </div>`;
      }).join("");
      return `<details class="filter-group" data-group="${group.id}"${group.open ? " open" : ""}>
        <summary>${esc(group.title)}<span class="fg-count"></span></summary>
        ${group.hint ? `<p class="muted">${esc(group.hint)}</p>` : ""}
        <div class="filter-grid">${controls}</div>
      </details>`;
    }).join("");
    SCREENER.forEach((group) => {
      group.controls.forEach((spec) => {
        if (spec.type === "multi" && spec.static) fillMulti($(`ms-${spec.id}`), spec.static);
      });
    });
    host.dataset.ready = "1";
  }

  function deRatio(value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const n = Number(value);
    return n > 10 ? n / 100 : n;
  }

  function scoreDelta(row) {
    if (row.score == null || row.prevScore == null) return null;
    return Number(row.score) - Number(row.prevScore);
  }

  function paysDividend(row) {
    return (row.dividend_yield != null && row.dividend_yield > 0) || (row.dividend_rate != null && row.dividend_rate > 0);
  }

  function rowMetric(row, field) {
    if (field === "score_delta") return scoreDelta(row);
    if (field === "debt_to_equity") return deRatio(row.debt_to_equity);
    if (field === "week52_change") return row.week52_change ?? row.year_return;
    if (field === "day_change_pct") {
      if (row.day_change_pct != null) return row.day_change_pct;
      if (row.price != null && row.day_change != null && row.price !== row.day_change) {
        const prev = Number(row.price) - Number(row.day_change);
        if (prev) return Number(row.day_change) / prev;
      }
      return null;
    }
    return row[field];
  }

  function customNative(input, kind) {
    if (!input || input.value === "" || input.value == null) return null;
    const n = Number(input.value);
    if (Number.isNaN(n)) return null;
    if (kind === "pct" || kind === "ret") return n / 100;
    if (kind === "cap") return n * 1e9;
    if (kind === "cash" || kind === "netdebt") return n * 1e6;
    return n;
  }

  function presetBounds(kind, preset) {
    const pct = {
      declining: { max: 0, exMax: true },
      flat: { min: -0.02, max: 0.02 },
      growing: { min: 0, exMin: true },
      strong: { min: 0.2 },
      neg: { max: 0, exMax: true },
      pos: { min: 0, exMin: true },
      none: { none: true },
      "0-5": { min: 0, max: 0.05 },
      "5-10": { min: 0.05, max: 0.1 },
      "10-15": { min: 0.1, max: 0.15 },
      "15-20": { min: 0.15, max: 0.2 },
      "10-20": { min: 0.1, max: 0.2 },
      "20-30": { min: 0.2, max: 0.3 },
      "30-50": { min: 0.3, max: 0.5 },
      "0-2": { min: 0, max: 0.02, exMin: true },
      "2-4": { min: 0.02, max: 0.04 },
      "4-6": { min: 0.04, max: 0.06 },
      "6+": { min: 0.06 },
      "30+": { min: 0.3 },
      "50+": { min: 0.5 },
      lt30: { max: 0.3, exMax: true },
      "30-50": { min: 0.3, max: 0.5 },
      "50-70": { min: 0.5, max: 0.7 },
      "70+": { min: 0.7 },
      large_down: { max: -0.2, exMax: true },
      mod_down: { min: -0.2, max: 0, exMax: true },
      mod_up: { min: 0.02, max: 0.2 },
      strong_up: { min: 0.2 },
      "lt-50": { max: -0.5, exMax: true },
      "-50--20": { min: -0.5, max: -0.2 },
      "-20-0": { min: -0.2, max: 0 },
      "0-10": { min: 0, max: 0.1 },
      "10-25": { min: 0.1, max: 0.25 },
      "25-50": { min: 0.25, max: 0.5 },
    };
    if (kind === "pct" || kind === "ret") return pct[preset] || null;
    if (kind === "multiple") {
      return {
        neg: { max: 0, exMax: true },
        lt10: { min: 0, max: 10, exMax: true },
        "10-15": { min: 10, max: 15 },
        "15-20": { min: 15, max: 20 },
        "20-30": { min: 20, max: 30 },
        "30-50": { min: 30, max: 50 },
        "50+": { min: 50 },
      }[preset] || null;
    }
    if (kind === "cap") {
      return {
        micro: { min: 0, max: 3e8, exMax: true },
        small: { min: 3e8, max: 2e9, exMax: true },
        mid: { min: 2e9, max: 1e10, exMax: true },
        large: { min: 1e10, max: 2e11, exMax: true },
        mega: { min: 2e11 },
        gt10b: { min: 1e10 },
        lt5b: { max: 5e9, exMax: true },
        "1-10b": { min: 1e9, max: 1e10 },
      }[preset] || null;
    }
    if (kind === "de") {
      return {
        "0": { min: 0, max: 0.01, exMax: true },
        "lt0.25": { max: 0.25, exMax: true },
        "0.25-0.5": { min: 0.25, max: 0.5 },
        "0.5-1": { min: 0.5, max: 1 },
        "1-2": { min: 1, max: 2 },
        "2-5": { min: 2, max: 5 },
        "5+": { min: 5 },
      }[preset] || null;
    }
    if (kind === "ratio") {
      return {
        lt1: { max: 1, exMax: true },
        "1-1.5": { min: 1, max: 1.5 },
        "1.5-2": { min: 1.5, max: 2 },
        "2-3": { min: 2, max: 3 },
        "3+": { min: 3 },
      }[preset] || null;
    }
    if (kind === "cash") {
      return {
        neg: { max: 0, exMax: true },
        pos: { min: 0, exMin: true },
        gt10m: { min: 1e7 },
        gt100m: { min: 1e8 },
        gt1b: { min: 1e9 },
      }[preset] || null;
    }
    if (kind === "netdebt") {
      return {
        cash: { max: 0, exMax: true },
        debt: { min: 0, exMin: true },
      }[preset] || null;
    }
    if (kind === "score") {
      return {
        lt40: { max: 40, exMax: true },
        "40-49": { min: 40, max: 50, exMax: true },
        "50-59": { min: 50, max: 60, exMax: true },
        "60-69": { min: 60, max: 70, exMax: true },
        "70-79": { min: 70, max: 80, exMax: true },
        "80-89": { min: 80, max: 90, exMax: true },
        "90+": { min: 90 },
      }[preset] || null;
    }
    if (kind === "delta") {
      return {
        up: { min: 0.5 },
        flat: { min: -0.5, max: 0.5 },
        down: { max: -0.5, exMax: true },
      }[preset] || null;
    }
    return null;
  }

  function passBounds(value, bounds, row, kind) {
    if (!bounds) return true;
    if (bounds.missing) return value == null || value === "";
    if (bounds.none) return !paysDividend(row);
    if (value == null || Number.isNaN(Number(value))) return false;
    const n = Number(value);
    if (kind === "multiple" && n < 0 && bounds.max != null && bounds.max > 0 && (bounds.min == null || bounds.min >= 0)) {
      return false;
    }
    if (bounds.min != null && (bounds.exMin ? n <= bounds.min : n < bounds.min)) return false;
    if (bounds.max != null && (bounds.exMax ? n >= bounds.max : n > bounds.max)) return false;
    return true;
  }

  function selectedMulti(id) {
    return [...document.querySelectorAll(`#ms-${id} input:checked`)].map((node) => node.value);
  }

  function nfRoot(id) {
    return document.querySelector(`[data-nf="${id}"]`);
  }

  function readBounds(root) {
    if (!root) return null;
    const kind = root.dataset.kind;
    const preset = root.querySelector(".nf-preset")?.value || "";
    if (!preset) return null;
    if (preset === "na") return { missing: true };
    if (preset === "custom") {
      return {
        min: customNative(root.querySelector(".nf-min"), kind),
        max: customNative(root.querySelector(".nf-max"), kind),
      };
    }
    return presetBounds(kind, preset);
  }

  function syncCustomVisibility() {
    document.querySelectorAll(".nf").forEach((root) => {
      const custom = root.querySelector(".nf-custom");
      if (custom) custom.hidden = root.querySelector(".nf-preset")?.value !== "custom";
    });
  }

  function fillMulti(host, values) {
    if (!host) return;
    const checked = new Set([...host.querySelectorAll("input:checked")].map((node) => node.value));
    const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    host.innerHTML = unique.length
      ? unique.map((value) => `<label class="ms-item"><input type="checkbox" value="${esc(value)}"${checked.has(value) ? " checked" : ""} /> ${esc(value)}</label>`).join("")
      : `<p class="ms-hint" style="padding:8px 10px">No values in this result set.</p>`;
  }

  function choicePass(id, row) {
    const preset = $(`f-${id}`)?.value || "";
    if (!preset) return true;
    if (id === "trend") {
      if (preset === "strong") return row.revenue_growth != null && row.revenue_growth >= 0.2;
      return row.earnings_trend === preset;
    }
    if (id === "divpay") {
      return preset === "pays" ? paysDividend(row) : !paysDividend(row);
    }
    return true;
  }

  function filterDiscover(rows) {
    return rows.filter((row) => {
      for (const group of SCREENER) {
        for (const spec of group.controls) {
          if (spec.type === "multi") {
            const picked = selectedMulti(spec.id);
            if (picked.length && !picked.includes(row[spec.field] || "")) return false;
          } else if (spec.type === "choice") {
            if (!choicePass(spec.id, row)) return false;
          } else {
            const bounds = readBounds(nfRoot(spec.id));
            if (bounds && !passBounds(rowMetric(row, spec.field), bounds, row, spec.kind)) return false;
          }
        }
      }
      return customPass(row);
    });
  }

  function sortDiscover(rows) {
    const key = $("discover-sort")?.value || "";
    const dir = $("discover-dir")?.value || "desc";
    if (!key) return rows;
    const sign = dir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      if (key === "name") return sign * (a.name || "").localeCompare(b.name || "");
      const av = rowMetric(a, key);
      const bv = rowMetric(b, key);
      if (av == null && bv == null) return (a.name || "").localeCompare(b.name || "");
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return (a.name || "").localeCompare(b.name || "");
      return av > bv ? sign : -sign;
    });
  }

  function presetLabel(spec, value) {
    const hit = (spec.presets || []).find((item) => item[0] === value);
    return hit ? hit[1] : value;
  }

  function customChip(spec, root) {
    const min = root.querySelector(".nf-min")?.value;
    const max = root.querySelector(".nf-max")?.value;
    const unit = spec.kind === "pct" || spec.kind === "ret" ? "%"
      : spec.kind === "cap" ? "B"
      : spec.kind === "cash" || spec.kind === "netdebt" ? "M"
      : "";
    if (min && max) return `${spec.label} ${min}–${max}${unit}`;
    if (min) return `${spec.label} > ${min}${unit}`;
    if (max) return `${spec.label} < ${max}${unit}`;
    return `${spec.label} custom`;
  }

  function activeChips() {
    const chips = [];
    for (const group of SCREENER) {
      for (const spec of group.controls) {
        if (spec.type === "multi") {
          selectedMulti(spec.id).forEach((value) => chips.push({ id: spec.id, value, label: value, multi: true }));
        } else if (spec.type === "choice") {
          const preset = $(`f-${spec.id}`)?.value || "";
          if (preset) chips.push({ id: spec.id, label: `${spec.label}: ${presetLabel(spec, preset)}` });
        } else {
          const root = nfRoot(spec.id);
          const preset = root?.querySelector(".nf-preset")?.value || "";
          if (!preset) continue;
          chips.push({
            id: spec.id,
            label: preset === "custom" ? customChip(spec, root) : `${spec.label}: ${presetLabel(spec, preset)}`,
          });
        }
      }
    }
    document.querySelectorAll(".custom-row").forEach((node, index) => {
      const field = node.querySelector(".cf-field")?.value;
      const meta = FILTER_FIELDS.find((item) => item[0] === field);
      if (field) chips.push({ id: `custom-${index}`, label: meta ? meta[1] : field, custom: true, index });
    });
    return chips;
  }

  function renderChips(matchCount) {
    const host = $("filter-chips");
    const chips = activeChips();
    if (host) {
      host.hidden = !chips.length;
      host.innerHTML = chips.map((chip) => (
        `<span class="filter-chip">${esc(chip.label)} <button type="button" data-clear="${esc(chip.id)}"${chip.multi ? ` data-value="${esc(chip.value)}"` : ""}${chip.custom ? ` data-custom="${chip.index}"` : ""} aria-label="Remove">×</button></span>`
      )).join("") + (chips.length ? `<button type="button" class="ghost" id="clear-filters">Clear all</button>` : "");
    }
    const count = $("discover-count");
    if (count && lastDiscover.length) {
      count.textContent = `${matchCount} compan${matchCount === 1 ? "y" : "ies"} match`;
    }
    document.querySelectorAll(".filter-group").forEach((group) => {
      const id = group.getAttribute("data-group");
      const spec = SCREENER.find((item) => item.id === id);
      const n = spec ? spec.controls.filter((control) => {
        if (control.type === "multi") return selectedMulti(control.id).length;
        return !!$(`f-${control.id}`)?.value;
      }).length : 0;
      const badge = group.querySelector(".fg-count");
      if (badge) badge.textContent = n ? ` · ${n}` : "";
    });
  }

  function clearControl(id, value) {
    const multi = document.querySelector(`[data-ms="${id}"]`);
    if (multi) {
      multi.querySelectorAll("input").forEach((node) => {
        if (!value || node.value === value) node.checked = false;
      });
      return;
    }
    const root = nfRoot(id);
    if (!root) return;
    const select = root.querySelector(".nf-preset");
    if (select) select.value = "";
    root.querySelectorAll(".nf-min, .nf-max").forEach((node) => { node.value = ""; });
    const custom = root.querySelector(".nf-custom");
    if (custom) custom.hidden = true;
  }

  function clearAllFilters() {
    SCREENER.forEach((group) => {
      group.controls.forEach((spec) => clearControl(spec.id));
    });
    const extra = $("custom-filter-rows");
    if (extra) extra.innerHTML = "";
    document.querySelectorAll("#discover-presets [data-preset]").forEach((btn) => btn.classList.remove("is-active"));
  }

  function setNf(id, preset, min, max) {
    const root = nfRoot(id);
    const select = $(`f-${id}`) || root?.querySelector(".nf-preset");
    if (select) select.value = preset || "";
    if (root) {
      const minEl = root.querySelector(".nf-min");
      const maxEl = root.querySelector(".nf-max");
      if (minEl) minEl.value = min ?? "";
      if (maxEl) maxEl.value = max ?? "";
    }
  }

  let lastDiscover = [];
  let discoverSparks = {};
  let discoverSparkKey = "";
  let applyingPreset = false;

  function withSpark(row) {
    const spark = discoverSparks[row.ticker] || {};
    return {
      ...row,
      week_return: spark.week_return ?? row.week_return,
      month_return: spark.month_return ?? row.month_return,
      quarter_return: spark.quarter_return ?? row.quarter_return,
      half_return: spark.half_return ?? row.half_return,
      ytd_return: spark.ytd_return ?? row.ytd_return,
      year_return: spark.year_return ?? row.year_return,
      year3_return: spark.year3_return ?? row.year3_return,
      year5_return: spark.year5_return ?? row.year5_return,
    };
  }

  async function hydrateDiscoverSparks(rows) {
    const tickers = [...new Set(rows.map((row) => row.ticker).filter(Boolean))].slice(0, 40);
    const key = tickers.join(",");
    if (!key || key === discoverSparkKey) return;
    discoverSparkKey = key;
    try {
      const response = await fetch(`/api/spark?tickers=${encodeURIComponent(key)}&window=long`);
      const data = await response.json();
      discoverSparks = data.results || {};
      if (lastDiscover.length) paintDiscoverRows(lastDiscover);
    } catch {
      discoverSparkKey = "";
    }
  }

  function paintDiscoverRows(rows) {
    lastDiscover = rows;
    const merged = rows.map(mergeResearch).map(withSpark);
    fillMulti($("ms-country"), merged.map((row) => row.country));
    fillMulti($("ms-market"), merged.map((row) => row.exchange));
    fillMulti($("ms-sector"), merged.map((row) => row.sector));
    fillMulti($("ms-industry"), merged.map((row) => row.industry));
    syncCustomVisibility();
    const filtered = sortDiscover(filterDiscover(merged));
    renderChips(filtered.length);
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
      hydrateDiscoverSparks(data.results || []);
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
      hydrateDiscoverSparks(rows);
    } catch {
      if (note) note.textContent = "Could not load similar companies.";
    }
  }

  function applyPreset(name) {
    if (name === "similar") {
      document.querySelectorAll("#discover-presets [data-preset]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.getAttribute("data-preset") === name);
      });
      loadSimilar();
      return;
    }
    applyingPreset = true;
    try {
      clearAllFilters();
      document.querySelectorAll("#discover-presets [data-preset]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.getAttribute("data-preset") === name);
      });
      if (name === "fundamentals") {
        setNf("roe", "custom", 15, "");
        setNf("opm", "custom", 10, "");
        setNf("de", "custom", "", 1);
      } else if (name === "growth") {
        setNf("rev", "custom", 10, "");
        setNf("earn", "custom", 10, "");
      } else if (name === "lowdebt") {
        setNf("de", "custom", "", 1);
      } else if (name === "profit") {
        setNf("npm", "pos");
        setNf("roe", "custom", 10, "");
      } else if (name === "earnings") {
        setNf("trend", "improving");
      } else if (name === "value") {
        setNf("pe", "custom", 10, 30);
        setNf("ev", "custom", "", 12);
      } else if (name === "fcf") {
        setNf("fcf", "pos");
      } else if (name === "score") {
        setNf("dscore", "custom", 70, "");
      } else if (name === "improving") {
        setNf("dchg", "up");
      }
      document.querySelectorAll(".filter-group").forEach((group) => {
        const id = group.getAttribute("data-group");
        const spec = SCREENER.find((item) => item.id === id);
        if (spec && spec.controls.some((control) => {
          if (control.type === "multi") return selectedMulti(control.id).length;
          return !!$(`f-${control.id}`)?.value;
        })) group.open = true;
      });
      syncCustomVisibility();
      if (lastDiscover.length) paintDiscoverRows(lastDiscover);
      else loadDiscover();
    } finally {
      applyingPreset = false;
    }
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
              cik: profile.cik || item.cik,
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

  $("watch-search")?.addEventListener("submit", (event) => event.preventDefault());
  if (window.attachCompanySearch) {
    window.attachCompanySearch($("watch-find"), $("watch-suggestions"), {
      onSelect(hit) {
        addWatch(hit);
        if ($("watch-find")) $("watch-find").value = "";
      },
    });
    window.attachCompanySearch($("discover-q"), $("discover-suggestions"), {
      onSelect(hit) {
        if ($("discover-q")) $("discover-q").value = hit.name;
        loadDiscover();
      },
    });
    window.attachCompanySearch($("report-q"), $("report-suggestions"), {
      source: "local",
      local(query) {
        const needle = (query || "").trim().toLowerCase();
        return (desk().reports || []).filter((row) => {
          const blob = `${row.name} ${row.ticker}`.toLowerCase();
          return !needle || blob.includes(needle);
        }).slice(0, 12);
      },
      onSelect(hit) {
        if ($("report-q")) $("report-q").value = hit.name || hit.ticker;
        paintReports();
      },
    });
  }
  $("add-filter")?.addEventListener("click", addCustomFilter);
  $("open-method")?.addEventListener("click", () => go("method"));
  $("report-compare")?.addEventListener("click", compareReports);
  $("watch-compare-btn")?.addEventListener("click", compareWatch);
  $("watch-manage")?.addEventListener("click", () => setWatchManaging(true));
  $("watch-manage-cancel")?.addEventListener("click", () => {
    const box = $("watch-compare");
    if (box) box.hidden = true;
    setWatchManaging(false);
  });
  $("watch-remove-btn")?.addEventListener("click", () => {
    const tickers = [...document.querySelectorAll(".watch-check:checked")].map((node) => node.value);
    if (!tickers.length || !window.writeDesk) return;
    const state = desk();
    window.writeDesk({
      ...state,
      watch: (state.watch || []).filter((item) => !tickers.includes(item.ticker)),
    });
    setWatchManaging(false);
    if (window.paintResultStar) window.paintResultStar();
  });

  $("discover-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadDiscover();
  });
  $("discover-similar")?.addEventListener("click", loadSimilar);
  $("discover-presets")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (button) applyPreset(button.getAttribute("data-preset"));
  });
  document.querySelector(".filter-box")?.addEventListener("change", (event) => {
    if (event.target.classList.contains("nf-preset")) {
      const root = event.target.closest(".nf");
      const custom = root?.querySelector(".nf-custom");
      if (custom) custom.hidden = event.target.value !== "custom";
    }
    if (!applyingPreset) {
      document.querySelectorAll("#discover-presets [data-preset]").forEach((btn) => btn.classList.remove("is-active"));
    }
    if (lastDiscover.length) paintDiscoverRows(lastDiscover);
  });
  let filterInputTimer = 0;
  document.querySelector(".filter-box")?.addEventListener("input", (event) => {
    if (!event.target.classList.contains("nf-min") && !event.target.classList.contains("nf-max")) return;
    clearTimeout(filterInputTimer);
    filterInputTimer = setTimeout(() => {
      if (lastDiscover.length) paintDiscoverRows(lastDiscover);
    }, 120);
  });
  $("discover-sort")?.addEventListener("change", () => {
    if (lastDiscover.length) paintDiscoverRows(lastDiscover);
  });
  $("discover-dir")?.addEventListener("change", () => {
    if (lastDiscover.length) paintDiscoverRows(lastDiscover);
  });
  $("filter-chips")?.addEventListener("click", (event) => {
    if (event.target.id === "clear-filters") {
      clearAllFilters();
      if (lastDiscover.length) paintDiscoverRows(lastDiscover);
      return;
    }
    const button = event.target.closest("[data-clear]");
    if (!button) return;
    if (button.hasAttribute("data-custom")) {
      document.querySelectorAll(".custom-row")[Number(button.getAttribute("data-custom"))]?.remove();
    } else {
      clearControl(button.getAttribute("data-clear"), button.getAttribute("data-value"));
    }
    document.querySelectorAll("#discover-presets [data-preset]").forEach((btn) => btn.classList.remove("is-active"));
    if (lastDiscover.length) paintDiscoverRows(lastDiscover);
  });

  window.Desk = { paint, toggleWatch, isWatched, addWatch };
  buildScreener();
  paint(currentView());
})();
