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
    return (location.hash || "#diligence").replace("#", "");
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
      };
    });
  }

  function paintDashboard() {
    const favs = $("dash-favs");
    const recent = $("dash-recent");
    const events = $("dash-events");
    if (!favs) return;
    const watch = watchedRows();
    const reports = desk().reports || [];
    const log = desk().events || [];
    favs.innerHTML = "";
    if (!watch.length) {
      empty(favs, "No favourites yet. Star a company from Discover or Watchlist.");
    } else {
      watch.slice(0, 8).forEach((row) => {
        const block = document.createElement("div");
        block.className = "fav-row";
        block.innerHTML = `<strong>${row.name}</strong><span>${[row.exchange || row.market, row.sector, scoreText(row.score), row.label, when(row.at)].filter((item) => item && item !== "—").join(" · ")}</span>`;
        block.addEventListener("click", () => openCompany(row));
        favs.appendChild(block);
      });
    }
    recent.innerHTML = "";
    if (!reports.length) {
      empty(recent, "No runs yet. Due Diligence writes a report here after each analysis.");
    } else {
      reports.slice(0, 8).forEach((row) => {
        const block = document.createElement("div");
        block.className = "fav-row";
        block.innerHTML = `<strong>${row.name}</strong><span>${[when(row.at), row.horizon, row.label, scoreText(row.score)].filter(Boolean).join(" · ")}</span>`;
        block.addEventListener("click", () => openCompany(row));
        recent.appendChild(block);
      });
    }
    events.innerHTML = "";
    if (!log.length) {
      empty(events, "Changes appear after a second run on the same name, or when you add a favourite.");
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
    fillSelect($("watch-verdict"), rows.map((row) => row.label), "Verdict");
    rows = rows.filter((row) => {
      const blob = `${row.name} ${row.ticker} ${row.industry} ${row.sector}`.toLowerCase();
      if (query && !blob.includes(query)) return false;
      if (market && (row.exchange || row.market) !== market) return false;
      if (sector && row.sector !== sector) return false;
      if (verdict && row.label !== verdict) return false;
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
      tr.innerHTML = `<td colspan="9" class="empty-note">No companies on this shortlist. Star names from Discover after you find them.</td>`;
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
      wrap.appendChild(actionButton("Run Diligence", "", () => openCompany(row, true)));
      wrap.appendChild(actionButton("Remove", "ghost", () => toggleWatch(row)));
      actions.appendChild(wrap);
      tr.appendChild(star);
      tr.appendChild(company);
      tr.insertAdjacentHTML("beforeend", `<td>${row.exchange || row.market || "—"}</td><td>${row.industry || "—"}</td><td>${scoreText(row.score)}</td>`);
      const verdictCell = document.createElement("td");
      verdictCell.innerHTML = row.label ? `<span class="pill ${row.investable || tone(row.score)}">${row.label}</span>` : "—";
      tr.appendChild(verdictCell);
      tr.insertAdjacentHTML("beforeend", `<td class="${changeClass(row)}">${changeText(row)}</td><td>${when(row.at)}</td>`);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function paintReports() {
    const host = $("report-cards");
    if (!host) return;
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
    host.innerHTML = "";
    if (!rows.length) {
      empty(host, "No reports yet. Run Due Diligence to generate one.");
      return;
    }
    rows.forEach((row) => {
      const card = document.createElement("article");
      card.className = "report-card";
      card.innerHTML = `<h3>${row.name}</h3>
        <p><span class="pill ${row.investable || tone(row.score)}">${row.label || "Unscored"}</span> · ${scoreText(row.score)}</p>
        <p>${row.horizon || "Horizon not stored"}</p>
        <p>Generated ${when(row.at)}</p>`;
      const button = actionButton("View report", "", () => openCompany(row, true));
      card.appendChild(button);
      host.appendChild(card);
    });
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
    };
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
    const n = Number(rule);
    if (mode === "pct") return value > n / 100;
    if (mode === "min") return value >= n;
    return value < n;
  }

  function filterDiscover(rows) {
    return rows.filter((row) => {
      if ($("f-market")?.value && row.exchange !== $("f-market").value && row.country !== $("f-market").value) return false;
      if ($("f-sector")?.value && row.sector !== $("f-sector").value) return false;
      if ($("f-industry")?.value && row.industry !== $("f-industry").value) return false;
      if (!capPass(row.market_cap, $("f-cap")?.value)) return false;
      if (!growthPass(row.revenue_growth, $("f-rev")?.value)) return false;
      if (!growthPass(row.earnings_growth, $("f-earn")?.value)) return false;
      if ($("f-trend")?.value && row.earnings_trend !== $("f-trend").value) return false;
      if ($("f-event")?.value === "upcoming" && !row.upcoming_earnings) return false;
      if ($("f-event")?.value === "recent" && !row.recent_earnings) return false;
      if (!ratioPass(row.roe, $("f-roe")?.value, "pct")) return false;
      if (!ratioPass(row.roa, $("f-roa")?.value, "pct")) return false;
      if (!ratioPass(row.operating_margin, $("f-opm")?.value, "pct")) return false;
      if (!ratioPass(row.profit_margin, $("f-npm")?.value, "pct")) return false;
      if (!ratioPass(row.pe, $("f-pe")?.value, "lt")) return false;
      if (!ratioPass(row.pb, $("f-pb")?.value, "lt")) return false;
      if (!ratioPass(row.ev_ebitda, $("f-ev")?.value, "lt")) return false;
      if (!ratioPass(row.debt_to_equity, $("f-de")?.value, "lt")) return false;
      if (!ratioPass(row.score, $("f-dscore")?.value, "min")) return false;
      if (!ratioPass(row.fundScore, $("f-dfund")?.value, "min")) return false;
      if ($("f-dverdict")?.value && row.label !== $("f-dverdict").value) return false;
      return true;
    });
  }

  let lastDiscover = [];

  function paintDiscoverRows(rows) {
    lastDiscover = rows;
    const merged = rows.map(mergeResearch);
    fillSelect($("f-market"), merged.map((row) => row.exchange).concat(merged.map((row) => row.country)), "Any");
    fillSelect($("f-sector"), merged.map((row) => row.sector), "Any");
    fillSelect($("f-industry"), merged.map((row) => row.industry), "Any");
    fillSelect($("f-dverdict"), merged.map((row) => row.label), "Any");
    const filtered = filterDiscover(merged);
    const count = $("discover-count");
    if (count) count.textContent = `${filtered.length} compan${filtered.length === 1 ? "y" : "ies"} match your criteria`;
    const body = $("discover-body");
    if (!body) return;
    body.innerHTML = "";
    if (!filtered.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="10" class="empty-note">No published matches for these filters. Broaden a control or search another name.</td>`;
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
      wrap.appendChild(actionButton("View", "ghost", () => openCompany(row, true)));
      wrap.appendChild(actionButton("Run Diligence", "", () => openCompany(row, true)));
      actions.appendChild(wrap);
      tr.appendChild(star);
      tr.appendChild(company);
      tr.insertAdjacentHTML(
        "beforeend",
        `<td>${row.sector || "—"}</td><td>${cap(row.market_cap)}</td><td>${pct(row.revenue_growth)}</td><td>${pct(row.earnings_growth)}</td><td>${pct(row.roe)}</td><td>${num(row.pe)}</td><td>${scoreText(row.score)}</td>`
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

  async function loadSimilar() {
    const query = ($("discover-q")?.value || "").trim();
    const box = $("similar-box");
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
      const rows = data.results || [];
      if (note) {
        note.textContent = seed
          ? `Similar to ${seed.name} · ${[seed.sector, seed.industry].filter(Boolean).join(" · ") || "published profile"}`
          : "No published profile for that name.";
      }
      if (!box) return;
      box.hidden = !rows.length;
      box.innerHTML = "";
      rows.forEach((row) => {
        const chip = document.createElement("div");
        chip.className = "similar-chip";
        chip.innerHTML = `<strong>${row.name}</strong><span>${row.ticker} · ${row.industry || row.sector || "—"}</span>`;
        const actions = document.createElement("div");
        actions.className = "row-actions";
        actions.style.marginTop = "8px";
        actions.appendChild(starButton(row));
        actions.appendChild(actionButton("Run Diligence", "", () => openCompany({ ...row, listed: (row.ticker || "").includes(".") }, true)));
        chip.appendChild(actions);
        box.appendChild(chip);
      });
      await loadDiscover(query);
    } catch {
      if (note) note.textContent = "Could not load similar companies.";
    }
  }

  function applyPreset(name) {
    const set = (id, value) => { if ($(id)) $(id).value = value; };
    ["f-rev", "f-earn", "f-trend", "f-roe", "f-roa", "f-opm", "f-npm", "f-pe", "f-pb", "f-ev", "f-de", "f-dscore", "f-dfund", "f-cap"].forEach((id) => set(id, ""));
    if (name === "fundamentals") {
      set("f-roe", "10"); set("f-opm", "pos"); set("f-de", "100");
    } else if (name === "growth") {
      set("f-rev", "10"); set("f-earn", "10");
    } else if (name === "lowdebt") {
      set("f-de", "50");
    } else if (name === "profit") {
      set("f-npm", "pos"); set("f-roe", "pos");
    } else if (name === "earnings") {
      set("f-trend", "improving");
    } else if (name === "value") {
      set("f-pe", "25"); set("f-ev", "12");
    } else if (name === "score") {
      set("f-dscore", "70");
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

  $("dash-actions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-go]");
    if (button) go(button.getAttribute("data-go"));
  });

  ["watch-q", "watch-market", "watch-sector", "watch-verdict", "watch-change", "watch-sort"].forEach((id) => {
    $(id)?.addEventListener("input", paintWatch);
    $(id)?.addEventListener("change", paintWatch);
  });
  ["report-q", "report-verdict", "report-sort"].forEach((id) => {
    $(id)?.addEventListener("input", paintReports);
    $(id)?.addEventListener("change", paintReports);
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
  document.querySelector(".filter-box")?.addEventListener("change", () => {
    if (lastDiscover.length) paintDiscoverRows(lastDiscover);
  });

  window.Desk = { paint, toggleWatch, isWatched };
  paint((location.hash || "#diligence").replace("#", ""));
})();
