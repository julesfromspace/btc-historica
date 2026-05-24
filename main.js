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
  const btnPlay = document.getElementById("btn-play");
  const btnPlayLabel = btnPlay.querySelector(".primary-btn-label");
  const btnReload = document.getElementById("btn-reload");

  btnReload.addEventListener("click", () => {
    window.location.reload();
  });

  // -- About modal -----------------------------------------------------------
  const aboutModal = document.getElementById("about-modal");
  const btnAbout = document.getElementById("btn-about");
  const btnAboutClose = document.getElementById("btn-about-close");

  function openAbout() {
    aboutModal.classList.remove("hidden");
    aboutModal.setAttribute("aria-hidden", "false");
  }
  function closeAbout() {
    aboutModal.classList.add("hidden");
    aboutModal.setAttribute("aria-hidden", "true");
  }

  btnAbout.addEventListener("click", (e) => {
    e.preventDefault();
    openAbout();
  });
  btnAboutClose.addEventListener("click", closeAbout);
  // Click on the dim scrim closes the modal too.
  aboutModal
    .querySelector("[data-modal-close]")
    .addEventListener("click", closeAbout);
  // Esc dismisses while the modal is visible.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !aboutModal.classList.contains("hidden")) {
      closeAbout();
    }
  });

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
  // Currently-applied monthly OHLC array. Used by the play-button driven
  // playback to step the crosshair through each candle in chronological
  // order. Refreshed inside applyMonthlyData() whenever new data arrives.
  let currentMonthly = [];

  // Pre-Mt.Gox era (2008-08 → 2010-06) is missing from CryptoCompare's
  // histoday response (zero-priced days are filtered out in
  // aggregateToMonthly). We slice it out of the embedded BTC_DATA once and
  // prepend it to whatever monthly data flows through applyMonthlyData so
  // pre-launch events (whitepaper, genesis, Pizza Day…) always have a
  // candle to anchor on, regardless of the data source.
  const PRE_LAUNCH_DATA = BTC_DATA.filter((d) => d.time < "2010-07-01");

  function toLineData(monthly) {
    return monthly.map((d) => ({ time: d.time, value: d.close }));
  }

  function applyMonthlyData(monthly) {
    let combined = monthly;
    if (
      PRE_LAUNCH_DATA.length > 0 &&
      monthly.length > 0 &&
      monthly[0].time > PRE_LAUNCH_DATA[PRE_LAUNCH_DATA.length - 1].time
    ) {
      combined = [...PRE_LAUNCH_DATA, ...monthly];
    }
    series.setData(combined);
    lineSeries.setData(toLineData(combined));
    const next = {};
    for (const d of combined) next[d.time] = d.close;
    closeByDate = next;
    currentMonthly = combined;
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
  //
  // When multiple events fall on the same monthly candle (e.g. Jan 2009
  // has 3 events; May 2021 has Tesla + China), the extra events are
  // placed on adjacent months so each dot still sits on a real data
  // point of the line. The first event in a month keeps its original
  // candle (so the most prominent event — e.g. the genesis block in
  // Jan 2009 — stays put), and extras are pushed forward in time:
  //   1 event → [0]; 2 → [0, +1]; 3 → [0, +1, +2]; etc.
  function shiftMonthKey(monthKey, offset) {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${yy}-${mm}-01`;
  }

  const BOTTOM_GAP = 16;
  const monthSeen = new Map();
  // Looked up by the crosshair handler so hovering a shifted month surfaces
  // the dot's event rather than searching by closest date.
  const eventByShiftedMonth = new Map();
  const eventDots = EVENTS.map((e) => {
    const monthKey = `${e.date.slice(0, 7)}-01`;
    const idxInMonth = monthSeen.get(monthKey) || 0;
    monthSeen.set(monthKey, idxInMonth + 1);
    const monthOffset = idxInMonth;
    const shiftedMonthKey = shiftMonthKey(monthKey, monthOffset);
    eventByShiftedMonth.set(shiftedMonthKey, e);
    const el = document.createElement("div");
    el.className = e.halving ? "event-dot halving" : "event-dot";
    el.title = e.title;
    dotsLayer.appendChild(el);
    return { event: e, el, shiftedMonthKey };
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

  // Event dates are precise (e.g., "2010-05-22"), but candles/closes are
  // monthly first-of-month. Snap to the same key for time-scale lookups
  // and price lookups so every event resolves to its containing month.
  function eventMonthKey(date) {
    return `${date.slice(0, 7)}-01`;
  }

  function updateDotPositions() {
    const ts = chart.timeScale();
    const tsHeight = ts.height();
    const wrapWidth = chartWrap.clientWidth;
    // The dot-layer fills #chart-wrap (inset: 0), but the chart's plot
    // area stops short of the right edge by the price-scale width. Clip
    // the dots' visible x-range so they don't bleed over the y-axis when
    // the chart is zoomed in.
    const psWidth = chart.priceScale("right").width();
    const plotWidth = Math.max(0, wrapWidth - psWidth);
    const lineMode = chartMode === "line";
    // On mobile, candle-mode dots get a fixed 8px size so they stay
    // visible even when the time scale packs many candles per pixel.
    // Desktop and line mode keep the candle-width-derived size.
    const isMobile = window.innerWidth <= 640;
    const dotSize = !lineMode && isMobile ? 8 : getCandleWidth();
    for (const { el, shiftedMonthKey } of eventDots) {
      const x = ts.timeToCoordinate(shiftedMonthKey);
      if (x == null || x < 0 || x > plotWidth) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "block";
      el.style.left = `${x}px`;
      el.style.width = `${dotSize}px`;
      el.style.height = `${dotSize}px`;
      if (lineMode) {
        const close = closeByDate[shiftedMonthKey];
        // Use the line (area) series — it owns the autoscaled price range
        // when the candle series is hidden, so its priceToCoordinate is
        // the only one guaranteed to match the rendered line during
        // scrolling and resize. The candle series' coordinate space can
        // lag a frame because it isn't contributing to the active scale.
        const y =
          close != null ? lineSeries.priceToCoordinate(close) : null;
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

  // Defer to the next animation frame so the chart has actually applied
  // its layout (timeScale + price scale autoscale) before we read
  // priceToCoordinate / timeToCoordinate. Calling them synchronously in
  // the callback can return stale coordinates while the chart is mid-
  // resize/zoom/sidepanel-slide, leaving dots floating off the line.
  let dotsRaf = 0;
  function scheduleUpdateDotPositions() {
    if (dotsRaf) return;
    dotsRaf = requestAnimationFrame(() => {
      dotsRaf = 0;
      updateDotPositions();
    });
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(
    scheduleUpdateDotPositions
  );

  // Track the chart-wrap size separately from time-range changes so dots
  // also resync after a pure layout change (e.g., the sidepanel slide
  // shrinks the chart-wrap without altering the visible logical range).
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(scheduleUpdateDotPositions).observe(chartWrap);
  }

  // Dragging the price axis rescales the price scale without firing a
  // logical-range change and without resizing chart-wrap, so the
  // observers above don't catch it. Reschedule the dot update for every
  // pointer move that follows a mousedown on the chart, plus once when
  // the drag ends.
  chartWrap.addEventListener("mousedown", () => {
    const onMove = () => scheduleUpdateDotPositions();
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      scheduleUpdateDotPositions();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

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
    // Snap to the dot's shifted month first — this matches the candle the
    // dot was actually placed on, so multi-event months (where extra
    // events were nudged to neighboring candles) hover correctly.
    const monthKey = `${iso.slice(0, 7)}-01`;
    if (eventByShiftedMonth.has(monthKey)) {
      return eventByShiftedMonth.get(monthKey);
    }
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
    // Match lightweight-charts' y-axis tick formatting (priceFormat
    // precision: 2): always 2 decimals, no thousands separator, no $.
    // Combined with tabular-nums on the label, this lines the digits up
    // column-by-column with the axis labels.
    return p.toFixed(2);
  }

  // Pin the price-label so its text left edge sits in the same column as
  // the y-axis tick numbers (which lightweight-charts renders left-aligned
  // inside the right-price-scale `<td>`). The td's left edge is
  // `chartWrap.clientWidth - priceScale("right").width()`. Position the
  // label box at that x; the box's own padding-left then matches the
  // chart's internal label inset (border + tick mark + text margin),
  // putting the digits in the same column for any value — `0.01` and
  // `340000.00` alike.
  function alignPriceLabelToAxis() {
    const psWidth = chart.priceScale("right").width();
    if (!psWidth) return;
    const tdLeft = chartWrap.clientWidth - psWidth;
    priceLabel.style.left = `${tdLeft}px`;
    priceLabel.style.right = "auto";
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
    alignPriceLabelToAxis();
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
    // Default: center the label on the hover line. If cursorX is so close
    // to the chart's left edge that the centered label would clip, anchor
    // the label's left edge to the hover line instead — so the date sits
    // to the right of the line at the start of the chart.
    const halfWidth = dateLabel.offsetWidth / 2;
    if (cursorX < halfWidth) {
      dateLabel.style.transform = "translateX(0)";
    } else {
      dateLabel.style.transform = "translateX(-50%)";
    }
    // Vertically center on the time-scale row.
    const tsHeight = chart.timeScale().height();
    dateLabel.style.bottom = `${Math.max(0, tsHeight / 2 - dateLabel.offsetHeight / 2)}px`;
    dateLabel.classList.remove("hidden");
  }

  function placeOverlayX(cursorX) {
    const wrapWidth = chartWrap.clientWidth;
    const GAP = 24; // distance between the overlay and the hover line
    const RIGHT_RESERVED = 64; // leave room for the price-axis label
    const LEFT_EDGE = 8;
    // Cap the overlay to a sensible reading width on desktop (800px),
    // but never let it spill past the chart's plot area on narrow
    // screens — leave room for the hover-line gap and price-axis label.
    const AVAILABLE = wrapWidth - LEFT_EDGE - GAP - RIGHT_RESERVED;
    const MAX_WIDTH = Math.max(160, Math.min(800, AVAILABLE));

    // The overlay must hug the title text exactly — including after wrap —
    // so we measure the longest rendered line of the title via Range rects
    // and set the overlay's width to that line width plus its horizontal
    // padding. `width: max-content` capped by max-width 560px would leave
    // a gap on the right whenever the wrapped text didn't reach the cap.
    overlay.style.maxWidth = `${MAX_WIDTH}px`;
    overlay.style.width = "max-content";

    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const rects = range.getClientRects();
    let textWidth = 0;
    for (const r of rects) {
      if (r.width > textWidth) textWidth = r.width;
    }
    const cs = getComputedStyle(overlay);
    const padX =
      parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    if (textWidth > 0) {
      overlay.style.width = `${Math.ceil(textWidth) + padX}px`;
    }
    const overlayWidth = overlay.offsetWidth;

    let left = cursorX + GAP;
    if (left + overlayWidth > wrapWidth - RIGHT_RESERVED) {
      // Flip to the left of the hover line. Right edge sits 24px from the
      // hover line; since the overlay is now exactly text-width wide, the
      // visible text ends flush against that 24px gap.
      left = cursorX - GAP - overlayWidth;
    }
    if (left < LEFT_EDGE) left = LEFT_EDGE;
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
    // Tint the date label with the halving accent so the time-axis chip
    // matches the vertical line and event title.
    dateLabel.style.background = active ? HALVING_COLOR : "";
    dateLabel.style.boxShadow = active
      ? `0 0 0 1px ${HALVING_COLOR}`
      : "";
  }

  // For halving events the parenthesized detail ("(50 → 25 BTC block
  // reward)") drops to its own line so the readout reads as a title +
  // sub-line rather than a single long string. All other titles render
  // unchanged. innerHTML is safe here because EVENTS is a static, vetted
  // array from data.js with no untrusted characters.
  function setEventTitle(event) {
    if (event.halving) {
      const escaped = event.title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      titleEl.innerHTML = escaped.replace(/ \(/, "<br>(");
    } else {
      titleEl.textContent = event.title;
    }
  }

  function hideCrosshairUI() {
    overlay.classList.add("hidden");
    priceLabel.classList.add("hidden");
    hoverHLine.classList.add("hidden");
    dateLabel.classList.add("hidden");
    setHalvingHover(false);
  }

  // Single source of truth for crosshair-driven UI (price/date labels,
  // hover line, event overlay). Called both by mouse-driven crosshair
  // moves and by the playback engine, so the labels render whether the
  // crosshair is set programmatically (where param.point is null) or via
  // the cursor.
  function renderCrosshairUI(time, cursorX) {
    if (
      !time ||
      cursorX == null ||
      cursorX < 0 ||
      cursorX > chartWrap.clientWidth
    ) {
      hideCrosshairUI();
      return;
    }
    const iso = timeToISO(time);
    const close = closeByDate[iso];

    updatePriceLabel(close);
    updateDateLabel(iso, cursorX);

    const event = findClosestEvent(iso);
    if (event) {
      setEventTitle(event);
      overlay.classList.remove("hidden");
      placeOverlayX(cursorX);
      setHalvingHover(Boolean(event.halving));

      if (hint && !hint.classList.contains("fade")) {
        hint.classList.add("fade");
      }
    } else if (playback.playing && titleEl.textContent) {
      overlay.classList.remove("hidden");
      placeOverlayX(cursorX);
      setHalvingHover(false);
    } else {
      overlay.classList.add("hidden");
      setHalvingHover(false);
    }
  }

  chart.subscribeCrosshairMove((param) => {
    if (!param.time) {
      hideCrosshairUI();
      return;
    }
    const cursorX =
      param.point && param.point.x != null
        ? param.point.x
        : chart.timeScale().timeToCoordinate(param.time);
    renderCrosshairUI(param.time, cursorX);
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

  // -- Playback (Start/Pause primary button) --------------------------------
  // Drives the crosshair month-by-month from the genesis-block month forward.
  // STEP_MS controls how quickly the crosshair sweeps across non-event
  // candles; whenever the cursor lands on a month that contains at least
  // one event, the playback dwells for EVENT_DWELL_MS so the user can read
  // the overlay before continuing. Pressing the button again pauses without
  // clearing the crosshair, and pressing once more resumes from where it
  // stopped. Reaching the last candle ends playback automatically.
  const STEP_MS = 380;
  const EVENT_DWELL_MS = 2000;
  const playbackMask = document.getElementById("playback-mask");
  const genesisExplosion = document.getElementById("genesis-explosion");

  // Burst of white lines at the genesis candle's chart-coordinates. Driven
  // by Motion (the vanilla-JS sibling of Framer Motion) which animates
  // each line outwards via a transform + opacity timeline. Falls back to
  // a CSS-only effect if Motion failed to load.
  function playGenesisExplosion() {
    if (!genesisExplosion || currentMonthly.length === 0) return;
    const ts = chart.timeScale();
    const x = ts.timeToCoordinate(GENESIS_MONTH);
    const close = closeByDate[GENESIS_MONTH];
    const y = close != null ? lineSeries.priceToCoordinate(close) : null;
    if (x == null || y == null) return;

    genesisExplosion.style.left = `${x}px`;
    genesisExplosion.style.top = `${y}px`;
    genesisExplosion.classList.remove("hidden");

    const lines = genesisExplosion.querySelectorAll(".explosion-line");
    if (window.Motion && typeof window.Motion.animate === "function") {
      // Three-phase explosion timeline:
      //   0 →  ~25%  : lines burst outward (width 0 → 22px, opacity 0 → 1)
      //                with an aggressive easeOut so they snap into place.
      //  25 → 100%   : lines drift slightly farther while fading (width
      //                22 → 28, opacity 1 → 0) with a slow easeIn so the
      //                light dies away rather than cuts off.
      // A small per-line stagger adds a touch of randomness so the burst
      // doesn't feel mechanical.
      const controls = window.Motion.animate(
        lines,
        {
          width: ["0px", "22px", "28px"],
          opacity: [0, 1, 0],
        },
        {
          duration: 0.6,
          offset: [0, 0.25, 1],
          easing: [
            [0.16, 0.84, 0.32, 1], // burst out (snappy easeOut)
            [0.4, 0, 0.7, 0.5], // fade out (gentle easeIn)
          ],
          delay: window.Motion.stagger
            ? window.Motion.stagger(0.018)
            : 0,
        }
      );
      controls.finished
        .catch(() => { })
        .then(() => {
          genesisExplosion.classList.add("hidden");
          lines.forEach((el) => {
            el.style.width = "";
            el.style.opacity = "";
          });
        });
    } else {
      // Motion unavailable — show statically for a moment then hide.
      lines.forEach((el) => {
        el.style.opacity = "1";
        el.style.width = "28px";
      });
      setTimeout(() => {
        genesisExplosion.classList.add("hidden");
        lines.forEach((el) => {
          el.style.opacity = "";
          el.style.width = "";
        });
      }, 600);
    }
  }

  // Use the dots' shifted months so playback dwells on the months where
  // the dots actually sit (e.g. June 2021 for the China-mining-ban event,
  // which was nudged out of the same May 2021 candle as Tesla).
  const eventMonthSet = new Set(eventByShiftedMonth.keys());
  // Playback begins at the genesis-block month (2009-01) regardless of
  // what happens to be the first event in EVENTS.
  const GENESIS_MONTH = "2009-01-01";

  const playback = {
    playing: false,
    idx: -1,
    raf: null,
    nextStepAt: 0,
    // Visible time range captured from the full-data chart (i.e., the
    // page-load "fitContent" view). Re-applied on every tick so that
    // slicing/appending data doesn't shift or rescale the timeline.
    lockedRange: null,
  };

  // Three button states drive label + icon:
  //   "idle"    — initial (or after playback finished): label "Start", play icon
  //   "playing" — playback is advancing: label "Pause", pause icon
  //   "paused"  — playback was started then paused mid-run: label "Resume",
  //                play icon (a click will continue from the same candle)
  function setPlayButtonState(state) {
    btnPlay.classList.toggle("playing", state === "playing");
    btnPlayLabel.textContent =
      state === "playing"
        ? "Pause"
        : state === "paused"
          ? "Resume"
          : "Start";
  }

  function findGenesisIndex() {
    for (let i = 0; i < currentMonthly.length; i++) {
      if (currentMonthly[i].time >= GENESIS_MONTH) return i;
    }
    return 0;
  }

  // Start of playback — use the month of the very first event in EVENTS
  // (currently the bitcoin.org domain registration in 2008-08), so the
  // pre-genesis events get their share of screen time too.
  function findPlaybackStartIndex() {
    if (EVENTS.length === 0) return 0;
    const firstEventMonth = eventMonthKey(EVENTS[0].date);
    for (let i = 0; i < currentMonthly.length; i++) {
      if (currentMonthly[i].time >= firstEventMonth) return i;
    }
    return 0;
  }

  function activeSeries() {
    return chartMode === "line" ? lineSeries : series;
  }

  function setCrosshairToIdx(i) {
    const c = currentMonthly[i];
    if (!c) return;
    chart.setCrosshairPosition(c.close, c.time, activeSeries());
  }

  // Position the playback mask so that everything to the right of the
  // current playback candle is hidden, while the price-axis (right) stays
  // exposed so its labels remain readable. The visibility is gated only
  // by `playback.idx` (not by `playback.playing`) so the mask also stays
  // up while playback is paused — in which case stopPlayback explicitly
  // hides it on natural end.
  function updatePlaybackMask() {
    if (playback.idx < 0) {
      playbackMask.classList.add("hidden");
      return;
    }
    const c = currentMonthly[playback.idx];
    if (!c) {
      playbackMask.classList.add("hidden");
      return;
    }
    const x = chart.timeScale().timeToCoordinate(c.time);
    if (x == null) {
      playbackMask.classList.add("hidden");
      return;
    }
    const psWidth = chart.priceScale("right").width();
    playbackMask.style.left = `${Math.max(0, x + 1)}px`;
    playbackMask.style.right = `${psWidth}px`;
    playbackMask.classList.remove("hidden");
  }

  function playbackTick(now) {
    if (!playback.playing) return;

    if (now >= playback.nextStepAt) {
      playback.idx += 1;
      if (playback.idx >= currentMonthly.length) {
        stopPlayback();
        return;
      }
      const candle = currentMonthly[playback.idx];
      // Move the crosshair onto this candle and slide the mask so the
      // future portion stays hidden while the past stays visible.
      setCrosshairToIdx(playback.idx);
      const x = chart.timeScale().timeToCoordinate(candle.time);
      renderCrosshairUI(candle.time, x);
      updatePlaybackMask();
      // Trigger the explosion animation the first time playback lands on
      // the genesis-block month.
      if (candle.time === GENESIS_MONTH) {
        requestAnimationFrame(playGenesisExplosion);
      }
      const dwell = eventMonthSet.has(candle.time) ? EVENT_DWELL_MS : STEP_MS;
      playback.nextStepAt = now + dwell;
    }

    playback.raf = requestAnimationFrame(playbackTick);
  }

  function startPlayback() {
    if (playback.playing || currentMonthly.length === 0) return;
    const freshStart =
      playback.idx < 0 || playback.idx >= currentMonthly.length - 1;
    if (freshStart) {
      // Reset the chart zoom to the page-load view; the chart keeps its
      // full data, so the price scale stays anchored to the historical
      // min/max while the playback mask hides the future portion.
      chart.timeScale().fitContent();
      playback.lockedRange = chart.timeScale().getVisibleRange();

      playback.idx = findPlaybackStartIndex();
      titleEl.textContent = "";
      overlay.classList.add("hidden");
    }
    // Disable user pan/zoom and chart hover; lock the time range so the
    // visible window doesn't shift while playback runs.
    chart.applyOptions({
      handleScroll: false,
      handleScale: false,
    });
    if (playback.lockedRange) {
      chart.timeScale().setVisibleRange(playback.lockedRange);
    }
    document.body.classList.add("playback");

    if (freshStart) {
      // Place the crosshair on the first candle, render the labels, and
      // slide the mask so only that candle is visible at the start.
      // Genesis has events, so seed the dwell with EVENT_DWELL_MS so the
      // title is readable before the next step kicks in.
      const candle = currentMonthly[playback.idx];
      setCrosshairToIdx(playback.idx);
      const x = candle
        ? chart.timeScale().timeToCoordinate(candle.time)
        : null;
      renderCrosshairUI(candle ? candle.time : null, x);
      updatePlaybackMask();
      const dwell =
        candle && eventMonthSet.has(candle.time) ? EVENT_DWELL_MS : STEP_MS;
      playback.nextStepAt = performance.now() + dwell;
    } else {
      // Resuming from a paused mid-playback state: tick on the next frame.
      playback.nextStepAt = 0;
    }

    playback.playing = true;
    setPlayButtonState("playing");
    playback.raf = requestAnimationFrame(playbackTick);
  }

  function stopPlayback() {
    playback.playing = false;
    if (playback.raf) cancelAnimationFrame(playback.raf);
    playback.raf = null;

    // If playback ran to the end, exit playback mode entirely: restore
    // pan/zoom + hover and hide the mask so the full chart is visible.
    // Otherwise this is a pause — leave the mask, the locked range, and
    // the disabled hover in place so the visual state stays frozen and
    // a follow-up Resume click can continue seamlessly.
    const reachedEnd = playback.idx >= currentMonthly.length - 1;
    if (reachedEnd) {
      chart.applyOptions({
        handleScroll: true,
        handleScale: true,
      });
      document.body.classList.remove("playback");
      playbackMask.classList.add("hidden");
      setPlayButtonState("idle");
    } else {
      setPlayButtonState("paused");
    }
  }

  btnPlay.addEventListener("click", () => {
    if (playback.playing) stopPlayback();
    else startPlayback();
  });

  // -- Sidepanel: community-suggested events ---------------------------------
  // Suggestions + votes live in Supabase so the list is shared across every
  // visitor. Each browser is signed in anonymously on load so it gets a
  // stable user_id, which the database uses to enforce one-vote-per-user
  // (a primary key on (suggestion_id, user_id)). Clicking the same arrow
  // twice removes the vote; clicking the opposite arrow flips it.
  const SUPABASE_URL = "https://dxaylvkclrpmqaeekrmo.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4YXlsdmtjbHJwbXFhZWVrcm1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjUyMTksImV4cCI6MjA5NTE0MTIxOX0.wBAVc-MWh3suBNtz95U7nc9skCT__2HA0tkyec5QZ7U";
  const sb =
    window.supabase && typeof window.supabase.createClient === "function"
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          realtime: { params: { eventsPerSecond: 5 } },
        })
      : null;

  // Client-side profanity guard — a cheap first pass. The hidden-flag in
  // Supabase is the moderator backstop for anything that slips through.
  // Edit this list freely to taste.
  const PROFANITY_LIST = [
    "fuck", "shit", "bitch", "asshole", "bastard", "dick", "piss",
    "cunt", "fag", "slut", "whore", "retard", "nigger", "nigga",
    "kike", "spic", "chink", "gook", "tranny",
  ];
  function hasProfanity(text) {
    const t = text.toLowerCase();
    return PROFANITY_LIST.some((w) => t.includes(w));
  }

  let suggestions = [];
  let userVotes = {};
  let currentUserId = null;

  function renderSuggestions() {
    suggestionList.innerHTML = "";
    if (suggestions.length === 0) {
      suggestionEmpty.classList.remove("hidden");
      return;
    }
    suggestionEmpty.classList.add("hidden");

    const sorted = [...suggestions].sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.created_at) - new Date(a.created_at)
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
      upBtn.setAttribute("aria-label", "Upvote");
      upBtn.addEventListener("click", () => vote(s.id, "up"));

      const score = document.createElement("span");
      score.className = "suggestion-score";
      score.textContent = s.score > 0 ? `+${s.score}` : `${s.score}`;

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className =
        "vote-btn" + (userVote === "down" ? " voted-down" : "");
      downBtn.textContent = "▼";
      downBtn.setAttribute("aria-label", "Downvote");
      downBtn.addEventListener("click", () => vote(s.id, "down"));

      controls.append(upBtn, score, downBtn);
      li.append(text, controls);
      suggestionList.appendChild(li);
    }
  }

  function showSuggestError(msg) {
    suggestInput.placeholder = msg;
    suggestInput.classList.add("suggest-input--error");
    clearTimeout(showSuggestError._t);
    showSuggestError._t = setTimeout(() => {
      suggestInput.placeholder = "Suggest a new event…";
      suggestInput.classList.remove("suggest-input--error");
    }, 2200);
  }

  async function vote(id, dir) {
    if (!sb || !currentUserId) return;
    const existing = userVotes[id] || null;
    const direction = dir === "up" ? 1 : -1;

    // Optimistic local update — real-time will reconcile from the server.
    const s = suggestions.find((x) => x.id === id);
    if (existing === dir) {
      if (s) s.score -= direction;
      delete userVotes[id];
    } else if (existing) {
      const oldDir = existing === "up" ? 1 : -1;
      if (s) s.score += direction - oldDir;
      userVotes[id] = dir;
    } else {
      if (s) s.score += direction;
      userVotes[id] = dir;
    }
    renderSuggestions();

    try {
      if (existing === dir) {
        await sb
          .from("votes")
          .delete()
          .match({ suggestion_id: id, user_id: currentUserId });
      } else if (existing) {
        await sb
          .from("votes")
          .update({ direction })
          .match({ suggestion_id: id, user_id: currentUserId });
      } else {
        await sb
          .from("votes")
          .insert({ suggestion_id: id, user_id: currentUserId, direction });
      }
    } catch (err) {
      // On failure, refetch authoritative state.
      console.error("vote failed", err);
      loadSuggestionsFromDb();
    }
  }

  async function addSuggestion(rawText) {
    if (!sb) return;
    const text = (rawText || "").trim();
    if (!text) return;
    if (hasProfanity(text)) {
      showSuggestError("Please keep it civil.");
      return;
    }
    const trimmed = text.slice(0, 140);
    const { error } = await sb
      .from("suggestions")
      .insert({ text: trimmed });
    if (error) {
      console.error("addSuggestion failed", error);
      showSuggestError("Could not save — try again.");
      return;
    }
    // Real-time will pick the new row up; nothing more to do here.
  }

  async function loadSuggestionsFromDb() {
    if (!sb) return;
    try {
      const [{ data: rows, error: rowsErr }, votesRes] = await Promise.all([
        sb
          .from("suggestions")
          .select("id, text, score, created_at")
          .order("score", { ascending: false })
          .order("created_at", { ascending: false }),
        currentUserId
          ? sb
              .from("votes")
              .select("suggestion_id, direction")
              .eq("user_id", currentUserId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (rowsErr) throw rowsErr;
      suggestions = rows || [];
      userVotes = {};
      for (const v of votesRes.data || []) {
        userVotes[v.suggestion_id] = v.direction === 1 ? "up" : "down";
      }
      renderSuggestions();
    } catch (err) {
      console.error("loadSuggestionsFromDb failed", err);
    }
  }

  async function initSuggestionsBackend() {
    if (!sb) return;
    // Anonymous sign-in gives each browser a stable user_id we can hang
    // votes off, while keeping the friction at zero (no email, password,
    // OAuth flow).
    const { data: existing } = await sb.auth.getSession();
    if (existing && existing.session && existing.session.user) {
      currentUserId = existing.session.user.id;
    } else {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) {
        console.error("anonymous sign-in failed", error);
      } else if (data && data.user) {
        currentUserId = data.user.id;
      }
    }

    await loadSuggestionsFromDb();

    // Real-time: any insert/update on suggestions (including the score
    // updates fired by the votes trigger) refreshes the panel for every
    // open tab. Vote rows for the current user keep our own UI state in
    // sync across devices.
    sb.channel("suggestions-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "suggestions" },
        () => loadSuggestionsFromDb()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        (payload) => {
          const row = payload.new || payload.old;
          if (row && row.user_id === currentUserId) loadSuggestionsFromDb();
        }
      )
      .subscribe();
  }

  initSuggestionsBackend();

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
      // Use the deferred scheduler so priceToCoordinate is read after the
      // chart has applied this frame's layout — otherwise dots can drift
      // off the line by a frame's worth of price-scale autoscale.
      scheduleUpdateDotPositions();
      if (performance.now() - start < SIDEPANEL_TRANSITION_MS) {
        sidepanelAnimRaf = requestAnimationFrame(step);
      } else {
        // Final settle: an extra deferred update once the slide has
        // finished, in case the very last frame's coordinates were still
        // catching up to the new chart size.
        requestAnimationFrame(() => {
          requestAnimationFrame(updateDotPositions);
        });
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
    if (playback.playing && playback.lockedRange) {
      // Refresh the locked range to the new fitContent for the new size,
      // so the mask's pixel coordinates stay in sync with the chart.
      playback.lockedRange = chart.timeScale().getVisibleRange();
    }
    scheduleUpdateDotPositions();
    requestAnimationFrame(updatePlaybackMask);
  });
})();
