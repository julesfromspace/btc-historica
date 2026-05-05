(() => {
  const chartEl = document.getElementById("chart");
  const chartWrap = document.getElementById("chart-wrap");
  const overlay = document.getElementById("event-overlay");
  const titleEl = document.getElementById("event-title");
  const dateLabel = document.getElementById("date-label");
  const priceLabel = document.getElementById("price-label");
  const dotsLayer = document.getElementById("event-dots");
  const hoverHLine = document.getElementById("hover-h-line");
  const btnCandles = document.getElementById("btn-candles");
  const btnLine = document.getElementById("btn-line");
  const hint = document.getElementById("hint");
  const btnSidepanel = document.getElementById("btn-sidepanel");
  const btnSidepanelClose = document.getElementById("btn-sidepanel-close");
  const sidepanel = document.getElementById("sidepanel");
  const suggestionList = document.getElementById("suggestion-list");
  const suggestionEmpty = document.getElementById("suggestion-empty");
  const suggestForm = document.getElementById("suggest-form");
  const suggestInput = document.getElementById("suggest-input");
  const suggestSubmit = document.getElementById("suggest-submit");

  const chart = LightweightCharts.createChart(chartEl, {
    layout: {
      background: { type: "solid", color: "#000000" },
      textColor: "#666666",
      fontFamily: "-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: "#0d0d0d" },
      horzLines: { color: "#0d0d0d" },
    },
    rightPriceScale: {
      mode: LightweightCharts.PriceScaleMode.Logarithmic,
      borderColor: "#1a1a1a",
      scaleMargins: { top: 0.06, bottom: 0.06 },
    },
    timeScale: {
      borderColor: "#1a1a1a",
      timeVisible: false,
      secondsVisible: false,
      rightOffset: 4,
      barSpacing: 8,
      fixLeftEdge: true,
      fixRightEdge: true,
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: "#ffffff",
        width: 1,
        style: LightweightCharts.LineStyle.Solid,
        labelVisible: false,
      },
      horzLine: {
        // Built-in horizontal line is hidden — we draw our own at the
        // hovered candle's close price (see #hover-h-line).
        color: "rgba(0, 0, 0, 0)",
        width: 1,
        style: LightweightCharts.LineStyle.Solid,
        labelVisible: false,
      },
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  });

  // -- Series setup ----------------------------------------------------------
  // Two series share one price scale and one data source. The candle series
  // is the canonical source (full OHLC); the area series is derived from it
  // (close-only) and shown when the user toggles to the line view. Both are
  // styled with the same monochrome white-on-black palette and have the
  // same chart-level chrome disabled (priceLineVisible / lastValueVisible /
  // crosshairMarkerVisible) so the only visual difference is candles vs.
  // gradient area.

  const SHARED_SERIES_OPTIONS = {
    priceLineVisible: false,
    lastValueVisible: false,
  };

  const series = chart.addCandlestickSeries({
    ...SHARED_SERIES_OPTIONS,
    upColor: "#e6e6e6",
    downColor: "#0a0a0a",
    borderUpColor: "#e6e6e6",
    borderDownColor: "#7a7a7a",
    wickUpColor: "#bdbdbd",
    wickDownColor: "#7a7a7a",
    priceFormat: {
      type: "price",
      precision: 2,
      minMove: 0.01,
    },
    visible: false,
  });

  const lineSeries = chart.addAreaSeries({
    ...SHARED_SERIES_OPTIONS,
    lineColor: "#ffffff",
    topColor: "rgba(255, 255, 255, 0.16)",
    bottomColor: "rgba(255, 255, 255, 0)",
    lineWidth: 1,
    crosshairMarkerVisible: false,
    visible: true,
  });

  // -- Unified data pipeline -------------------------------------------------
  // applyMonthlyData() is the SINGLE entry point for putting price data on
  // the chart, regardless of source:
  //   • initial paint from the embedded BTC_DATA fallback
  //   • CryptoCompare live data once the fetch resolves
  // It writes to both the candle series and the area (line) series and
  // refreshes the close-by-date lookup that the hover labels and the
  // line-mode event dots both consume. Adding a future data source
  // (different exchange, websocket update, etc.) means calling this one
  // function — both chart types pick up the change automatically.

  let closeByDate = {};

  function toLineData(monthly) {
    return monthly.map((d) => ({ time: d.time, value: d.close }));
  }

  function applyMonthlyData(monthly) {
    series.setData(monthly);
    lineSeries.setData(toLineData(monthly));
    const next = {};
    for (const d of monthly) next[d.time] = d.close;
    closeByDate = next;
  }

  // Render embedded data immediately so the chart paints without waiting on
  // the network. The same applyMonthlyData call is used again when live data
  // arrives below — both chart types stay in sync automatically.
  applyMonthlyData(BTC_DATA);

  // -- Live data via CryptoCompare ------------------------------------------
  // The free `histoday` endpoint returns true daily OHLC back to BTC's
  // inception. We aggregate to monthly client-side and cache the result in
  // localStorage so reloads don't re-hit the API.
  const CACHE_KEY = "btc_historica_monthly_v1";
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.fetchedAt || !Array.isArray(obj.data)) return null;
      if (Date.now() - obj.fetchedAt > CACHE_TTL_MS) return null;
      return obj.data;
    } catch {
      return null;
    }
  }

  function saveCache(data) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ fetchedAt: Date.now(), data })
      );
    } catch {
      // Storage might be disabled or full — non-fatal, just skip caching.
    }
  }

  // Aggregate an array of {time(unix s), open, high, low, close} daily candles
  // into monthly OHLC keyed by the first-of-month ISO string.
  function aggregateToMonthly(daily) {
    const groups = new Map();
    for (const d of daily) {
      // CryptoCompare backfills pre-launch days with zeros; skip them.
      if (!(d.high > 0) || !(d.close > 0)) continue;
      const date = new Date(d.time * 1000);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
      const g = groups.get(key);
      if (!g) {
        groups.set(key, {
          time: key,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          _firstTs: d.time,
          _lastTs: d.time,
        });
      } else {
        if (d.time < g._firstTs) {
          g.open = d.open;
          g._firstTs = d.time;
        }
        if (d.time > g._lastTs) {
          g.close = d.close;
          g._lastTs = d.time;
        }
        if (d.high > g.high) g.high = d.high;
        if (d.low < g.low || g.low === 0) g.low = d.low;
      }
    }
    return Array.from(groups.values())
      .sort((a, b) => a.time.localeCompare(b.time))
      .map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
  }

  async function fetchLiveBTC() {
    const cached = loadCache();
    if (cached) return cached;

    const url =
      "https://min-api.cryptocompare.com/data/v2/histoday" +
      "?fsym=BTC&tsym=USD&allData=true";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.Response !== "Success" || !json.Data || !json.Data.Data) {
      throw new Error(json.Message || "Unexpected response shape");
    }
    const monthly = aggregateToMonthly(json.Data.Data);
    if (monthly.length === 0) throw new Error("Empty aggregated data");
    saveCache(monthly);
    return monthly;
  }

  fetchLiveBTC()
    .then((data) => {
      // Same pipeline as the embedded data — both chart types update.
      applyMonthlyData(data);
      chart.timeScale().fitContent();
      requestAnimationFrame(updateDotPositions);
    })
    .catch((err) => {
      // Stay on embedded BTC_DATA — chart already rendered, user sees no error.
      console.warn("[BTC Historica] live fetch failed, using embedded data:", err);
    });

  // Chart mode — "line" (default) or "candle". Toggled by the buttons in
  // the top-right corner; dot positioning and series visibility both depend
  // on this.
  let chartMode = "line";

  // Event indicator dots — rendered as DOM elements. In candle mode they
  // pin to the bottom of the chart with a 16px gap above the x-axis. In
  // line mode they sit on the line at each event's close price.
  const BOTTOM_GAP = 16;
  const eventDots = EVENTS.map((e) => {
    const el = document.createElement("div");
    el.className = e.halving ? "event-dot halving" : "event-dot";
    el.title = e.title;
    dotsLayer.appendChild(el);
    return { event: e, el };
  });

  function getCandleWidth() {
    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return 6;
    const totalBars = range.to - range.from;
    if (totalBars <= 0) return 6;
    const tsWidth = ts.width();
    // Match lightweight-charts' internal candle body sizing (barSpacing - 1).
    return Math.max(2, tsWidth / totalBars - 1);
  }

  function updateDotPositions() {
    const ts = chart.timeScale();
    const tsHeight = ts.height();
    const wrapWidth = chartWrap.clientWidth;
    const dotSize = getCandleWidth();
    const lineMode = chartMode === "line";
    for (const { event, el } of eventDots) {
      const x = ts.timeToCoordinate(event.date);
      if (x == null || x < 0 || x > wrapWidth) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "block";
      el.style.left = `${x}px`;
      el.style.width = `${dotSize}px`;
      el.style.height = `${dotSize}px`;
      if (lineMode) {
        const close = closeByDate[event.date];
        const y = close != null ? series.priceToCoordinate(close) : null;
        if (y == null) {
          el.style.display = "none";
          continue;
        }
        el.style.top = `${y}px`;
        el.style.bottom = "";
        el.style.transform = "translate(-50%, -50%)";
      } else {
        el.style.top = "";
        el.style.bottom = `${tsHeight + BOTTOM_GAP}px`;
        el.style.transform = "translateX(-50%)";
      }
    }
  }

  chart.timeScale().subscribeVisibleLogicalRangeChange(updateDotPositions);

  // Quick lookup: date string -> event
  const eventsByDate = Object.fromEntries(EVENTS.map((e) => [e.date, e]));

  function timeToISO(t) {
    if (typeof t === "string") return t;
    if (t && typeof t === "object" && "year" in t) {
      const m = String(t.month).padStart(2, "0");
      const d = String(t.day).padStart(2, "0");
      return `${t.year}-${m}-${d}`;
    }
    if (typeof t === "number") {
      // business day timestamp (seconds)
      const d = new Date(t * 1000);
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${d.getUTCFullYear()}-${m}-${day}`;
    }
    return null;
  }

  function findClosestEvent(iso) {
    if (!iso) return null;
    if (eventsByDate[iso]) return eventsByDate[iso];
    const target = new Date(iso).getTime();
    let best = null;
    let bestDiff = Infinity;
    for (const e of EVENTS) {
      const diff = Math.abs(new Date(e.date).getTime() - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = e;
      }
    }
    // Only surface if within ~45 days of an event
    const FORTY_FIVE_DAYS = 45 * 24 * 60 * 60 * 1000;
    return bestDiff <= FORTY_FIVE_DAYS ? best : null;
  }

  function formatEventDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }).toUpperCase();
  }

  // X-axis label format: "01 Mon Jan '26"
  function formatAxisDate(iso) {
    const d = new Date(iso);
    const day = String(d.getUTCDate()).padStart(2, "0");
    const wkd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    const mon = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    const yr = "'" + String(d.getUTCFullYear()).slice(-2);
    return `${day} ${wkd} ${mon} ${yr}`;
  }

  function formatPrice(p) {
    if (p == null) return "—";
    if (p < 1) return `$${p.toFixed(3)}`;
    if (p < 100) return `$${p.toFixed(2)}`;
    return `$${Math.round(p).toLocaleString("en-US")}`;
  }

  function updatePriceLabel(close) {
    if (close == null) {
      priceLabel.classList.add("hidden");
      hoverHLine.classList.add("hidden");
      return;
    }
    const y = series.priceToCoordinate(close);
    if (y == null) {
      priceLabel.classList.add("hidden");
      hoverHLine.classList.add("hidden");
      return;
    }
    priceLabel.textContent = formatPrice(close);
    priceLabel.style.top = `${y}px`;
    priceLabel.classList.remove("hidden");
    hoverHLine.style.top = `${y}px`;
    hoverHLine.classList.remove("hidden");
  }

  function updateDateLabel(iso, cursorX) {
    if (!iso || cursorX == null) {
      dateLabel.classList.add("hidden");
      return;
    }
    dateLabel.textContent = formatAxisDate(iso);
    dateLabel.style.left = `${cursorX}px`;
    // Vertically center on the time-scale row.
    const tsHeight = chart.timeScale().height();
    dateLabel.style.bottom = `${Math.max(0, tsHeight / 2 - dateLabel.offsetHeight / 2)}px`;
    dateLabel.classList.remove("hidden");
  }

  function placeOverlayX(cursorX) {
    const wrapWidth = chartWrap.clientWidth;
    const overlayWidth = overlay.offsetWidth || 320;
    const PAD = 18;
    const RIGHT_RESERVED = 64; // leave room for the price-axis label
    let left = cursorX + PAD;
    const maxLeft = wrapWidth - overlayWidth - RIGHT_RESERVED;
    if (left > maxLeft) {
      // Flip to the left of the cursor when there isn't room on the right.
      left = cursorX - overlayWidth - PAD;
    }
    if (left < 8) left = 8;
    overlay.style.left = `${left}px`;
  }

  // Track halving-hover state so we only re-apply chart options when it
  // actually changes (avoids spamming applyOptions on every mousemove).
  const HALVING_COLOR = "#f7931a";
  const DEFAULT_VERT_COLOR = "#ffffff";
  let halvingHoverActive = false;

  function setHalvingHover(active) {
    if (active === halvingHoverActive) return;
    halvingHoverActive = active;
    chart.applyOptions({
      crosshair: {
        vertLine: { color: active ? HALVING_COLOR : DEFAULT_VERT_COLOR },
      },
    });
    titleEl.style.color = active ? HALVING_COLOR : "";
  }

  chart.subscribeCrosshairMove((param) => {
    if (
      !param.point ||
      !param.time ||
      param.point.x < 0 ||
      param.point.y < 0 ||
      param.point.x > chartWrap.clientWidth ||
      param.point.y > chartWrap.clientHeight
    ) {
      overlay.classList.add("hidden");
      priceLabel.classList.add("hidden");
      hoverHLine.classList.add("hidden");
      dateLabel.classList.add("hidden");
      setHalvingHover(false);
      return;
    }

    const iso = timeToISO(param.time);
    const close = closeByDate[iso];

    // Horizontal line and price label both anchor to the candle's close
    // price (computed via priceToCoordinate), independent of cursor Y.
    updatePriceLabel(close);
    updateDateLabel(iso, param.point.x);

    const event = findClosestEvent(iso);
    if (!event) {
      overlay.classList.add("hidden");
      setHalvingHover(false);
      return;
    }

    titleEl.textContent = event.title;
    overlay.classList.remove("hidden");
    placeOverlayX(param.point.x);
    setHalvingHover(Boolean(event.halving));

    // First time the user hovers an event, fade out the centered hint.
    if (hint && !hint.classList.contains("fade")) {
      hint.classList.add("fade");
    }
  });

  // -- Chart-type toggle (candles / line) -----------------------------------
  function setChartMode(mode) {
    if (mode === chartMode) return;
    chartMode = mode;
    if (mode === "line") {
      series.applyOptions({ visible: false });
      lineSeries.applyOptions({ visible: true });
      btnLine.classList.add("selected");
      btnCandles.classList.remove("selected");
    } else {
      series.applyOptions({ visible: true });
      lineSeries.applyOptions({ visible: false });
      btnCandles.classList.add("selected");
      btnLine.classList.remove("selected");
    }
    requestAnimationFrame(updateDotPositions);
  }

  btnCandles.addEventListener("click", () => setChartMode("candle"));
  btnLine.addEventListener("click", () => setChartMode("line"));

  // -- Sidepanel: user-suggested events with one-vote-per-user ---------------
  // Empty by default. Suggestions and votes persist to localStorage so they
  // survive reload. Voting is per-browser (no backend), and locked to once
  // per suggestion in either direction.
  const SUGGESTIONS_KEY = "btc_historica_suggestions_v1";
  const VOTES_KEY = "btc_historica_votes_v1";

  function loadJSON(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage disabled — ignore */
    }
  }

  let suggestions = Array.isArray(loadJSON(SUGGESTIONS_KEY, []))
    ? loadJSON(SUGGESTIONS_KEY, [])
    : [];
  let userVotes = loadJSON(VOTES_KEY, {}) || {};

  function makeId() {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function renderSuggestions() {
    suggestionList.innerHTML = "";
    if (suggestions.length === 0) {
      suggestionEmpty.classList.remove("hidden");
      return;
    }
    suggestionEmpty.classList.add("hidden");

    const sorted = [...suggestions].sort(
      (a, b) => b.score - a.score || b.createdAt - a.createdAt
    );

    for (const s of sorted) {
      const li = document.createElement("li");
      li.className = "suggestion-item";

      const text = document.createElement("div");
      text.className = "suggestion-text";
      text.textContent = s.text;

      const controls = document.createElement("div");
      controls.className = "suggestion-controls";

      const userVote = userVotes[s.id] || null;

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "vote-btn" + (userVote === "up" ? " voted-up" : "");
      upBtn.textContent = "▲";
      upBtn.disabled = !!userVote;
      upBtn.setAttribute("aria-label", "Upvote");
      upBtn.addEventListener("click", () => vote(s.id, "up"));

      const score = document.createElement("span");
      score.className = "suggestion-score";
      score.textContent = s.score > 0 ? `+${s.score}` : `${s.score}`;

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "vote-btn" + (userVote === "down" ? " voted-down" : "");
      downBtn.textContent = "▼";
      downBtn.disabled = !!userVote;
      downBtn.setAttribute("aria-label", "Downvote");
      downBtn.addEventListener("click", () => vote(s.id, "down"));

      controls.append(upBtn, score, downBtn);
      li.append(text, controls);
      suggestionList.appendChild(li);
    }
  }

  function vote(id, dir) {
    if (userVotes[id]) return; // one vote per user, no changes
    const s = suggestions.find((x) => x.id === id);
    if (!s) return;
    s.score += dir === "up" ? 1 : -1;
    userVotes[id] = dir;
    saveJSON(SUGGESTIONS_KEY, suggestions);
    saveJSON(VOTES_KEY, userVotes);
    renderSuggestions();
  }

  function addSuggestion(rawText) {
    const text = rawText.trim();
    if (!text) return;
    suggestions.push({
      id: makeId(),
      text,
      score: 0,
      createdAt: Date.now(),
    });
    saveJSON(SUGGESTIONS_KEY, suggestions);
    renderSuggestions();
  }

  function autoGrow() {
    suggestInput.style.height = "auto";
    suggestInput.style.height = Math.max(48, suggestInput.scrollHeight) + "px";
  }

  function updateSubmitState() {
    suggestSubmit.disabled = suggestInput.value.trim().length === 0;
  }

  suggestInput.addEventListener("input", () => {
    autoGrow();
    updateSubmitState();
  });
  updateSubmitState();

  suggestForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addSuggestion(suggestInput.value);
    suggestInput.value = "";
    autoGrow();
    updateSubmitState();
    suggestInput.focus();
  });

  renderSuggestions();

  // The sidepanel pushes the chart aside (rather than overlaying it) by
  // adding `body.sidepanel-open`, which transitions #container's left
  // padding. We resize the chart on every animation frame for the duration
  // of the transition so the candles/line stay legible while the layout
  // animates.
  // Must match the CSS transition durations on .sidepanel (transform) and
  // #container (padding-left). Keeping these three values in sync is what
  // makes the panel slide and the chart resize feel like one motion.
  const SIDEPANEL_TRANSITION_MS = 150;
  let sidepanelAnimRaf = 0;

  function animateChartDuringSidepanel() {
    cancelAnimationFrame(sidepanelAnimRaf);
    const start = performance.now();
    const step = () => {
      resize();
      chart.timeScale().fitContent();
      updateDotPositions();
      if (performance.now() - start < SIDEPANEL_TRANSITION_MS) {
        sidepanelAnimRaf = requestAnimationFrame(step);
      }
    };
    sidepanelAnimRaf = requestAnimationFrame(step);
  }

  function setSidepanelOpen(open) {
    sidepanel.classList.toggle("open", open);
    document.body.classList.toggle("sidepanel-open", open);
    sidepanel.setAttribute("aria-hidden", String(!open));
    animateChartDuringSidepanel();
    if (open) {
      // Defer focus until the slide-in transition is well under way so the
      // input is not focused before it's visible.
      setTimeout(() => suggestInput.focus(), 200);
    }
  }
  btnSidepanel.addEventListener("click", () => {
    setSidepanelOpen(!sidepanel.classList.contains("open"));
  });
  btnSidepanelClose.addEventListener("click", () => setSidepanelOpen(false));

  // Fit content initially, then handle resizes.
  function resize() {
    chart.applyOptions({
      width: chartEl.clientWidth,
      height: chartEl.clientHeight,
    });
  }
  resize();
  chart.timeScale().fitContent();
  requestAnimationFrame(updateDotPositions);

  window.addEventListener("resize", () => {
    resize();
    chart.timeScale().fitContent();
    requestAnimationFrame(updateDotPositions);
  });
})();
