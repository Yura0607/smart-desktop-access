/* Smart Desktop Access: session breadcrumbs, iPad draw cap, silent reconnect.
   Never logs tokens or passwords. */
(function () {
  var MAX_RECONNECT = 3;
  var MAX_RESUME = 3;
  var lastDraw = 0;
  var drawGap = 33;
  var lastBlitMs = 0;
  var pendingMove = null;
  var moveRaf = 0;
  window.__sdaPerf = {
    pointerMoves: 0,
    inputsSent: 0,
    frames: 0,
    lastBlitMs: 0,
    drawGap: 33,
    reset: function () {
      this.pointerMoves = 0;
      this.inputsSent = 0;
      this.frames = 0;
    }
  };

  function isIpad() {
    if (window.__sdaIsIpadCached !== undefined) return window.__sdaIsIpadCached;
    var ua = navigator.userAgent || "";
    var touch = Number(navigator.maxTouchPoints || 0);
    var yes = /iPad|iPhone|iPod/i.test(ua)
      || /Android/i.test(ua)
      || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))
      || ((navigator.platform === "MacIntel" || navigator.platform === "iPad") && touch > 1)
      || (/Macintosh/i.test(ua) && touch > 1);
    window.__sdaIsIpadCached = yes;
    return yes;
  }
  window.sdaIsIpad = isIpad;

  function safeId() {
    try {
      if (window.curConn && window.curConn._id) return String(window.curConn._id);
      return sessionStorage.getItem("sda-resume-id") || "";
    } catch (e) {
      return "";
    }
  }

  function sdaLog(event, extra) {
    try {
      extra = extra || {};
      var q = [];
      function add(k, v) {
        if (v === undefined || v === null || v === "") return;
        q.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v).slice(0, 80)));
      }
      add("e", event);
      add("id", extra.id || safeId());
      add("ff", (window.curConn && window.curConn._firstFrame) ? "1" : "0");
      add("conn", window.curConn ? "1" : "0");
      add("ipad", isIpad() ? "1" : "0");
      var rndr = window.flutterWebRenderer || "";
      try {
        if (!rndr && document.body) rndr = document.body.getAttribute("flt-renderer") || "";
      } catch (e) {}
      add("rndr", rndr);
      add("vis", document.visibilityState || "");
      if (extra.pers !== undefined) add("pers", extra.pers ? "1" : "0");
      if (extra.n !== undefined) add("n", extra.n);
      if (extra.why) add("why", extra.why);
      try {
        var mem = performance && performance.memory;
        if (mem && mem.usedJSHeapSize) add("mem", Math.round(mem.usedJSHeapSize / 1048576));
      } catch (e) {}
      add("t", Math.floor(Date.now() / 1000));
      var url = "/webclient/sda-log?" + q.join("&");
      if (navigator.sendBeacon) {
        try { navigator.sendBeacon(url); return; } catch (e) {}
      }
      if (typeof fetch === "function") {
        fetch(url, { method: "POST", keepalive: true, credentials: "omit" }).catch(function () {});
        return;
      }
      var img = new Image();
      img.src = url;
    } catch (e) {}
  }
  window.sdaLog = sdaLog;

  window.sdaShouldSkipDraw = function () {
    if (!isIpad()) return false;
    if (lastBlitMs > 24) drawGap = 50;
    else if (lastBlitMs > 14) drawGap = 40;
    else drawGap = 33;
    if (window.__sdaPerf) window.__sdaPerf.drawGap = drawGap;
    var now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if (lastDraw && now - lastDraw < drawGap) return true;
    lastDraw = now;
    return false;
  };

  window.sdaTryReconnect = function (conn, err) {
    try {
      if (!conn || conn._userClosed) return false;
      if (!conn._id) return false;
      if (!conn._firstFrame && !conn._sdaPeerReady) return false;
      conn._sdaReconnects = (conn._sdaReconnects || 0) + 1;
      var why = "";
      try { why = (err && (err.type || err.reason || String(err))) || ""; } catch (e) {}
      if (conn._sdaReconnects > MAX_RECONNECT) {
        sdaLog("reconnect-giveup", { id: conn._id, n: conn._sdaReconnects, why: why });
        return false;
      }
      sdaLog("reconnect", { id: conn._id, n: conn._sdaReconnects, why: why });
      console.log("sda auto-reconnect " + conn._sdaReconnects + " " + conn._id);
      setTimeout(function () {
        if (conn._userClosed) return;
        try { conn.reconnect(); } catch (e) { console.error(e); }
      }, 800 * conn._sdaReconnects);
      return true;
    } catch (e) {
      return false;
    }
  };

  function markResume(id) {
    if (!id) return;
    try {
      sessionStorage.setItem("sda-resume-id", String(id));
      sessionStorage.setItem("sda-resume-active", "1");
    } catch (e) {}
  }

  function clearResume() {
    try { sessionStorage.removeItem("sda-resume-active"); } catch (e) {}
  }

  function maybeResumeAfterReload() {
    // Auto-resume after an unexpected reload called setByName('connect')
    // before Flutter finished init and left a white screen. A clean device
    // list is better than a blank page. In-page sdaTryReconnect is unchanged.
    try {
      var active = sessionStorage.getItem("sda-resume-active") === "1";
      var id = sessionStorage.getItem("sda-resume-id") || "";
      var n = parseInt(sessionStorage.getItem("sda-resume-n") || "0", 10) || 0;
      sessionStorage.removeItem("sda-resume-active");
      if (active) {
        try { sessionStorage.removeItem("sda-connect-id"); } catch (e2) {}
        sdaLog("resume-skip", { id: id, n: n, why: "list-not-white" });
        console.log("sda skip resume after reload; showing list");
      }
    } catch (e) {}
  }

  maybeResumeAfterReload();

  setInterval(function () {
    try {
      if (window.curConn && window.curConn._firstFrame) {
        sessionStorage.setItem("sda-resume-n", "0");
        markResume(window.curConn._id);
        sdaLog("beat");
      }
    } catch (e) {}
  }, 30000);

  window.addEventListener("pagehide", function (ev) {
    sdaLog("pagehide", { pers: ev.persisted });
  });
  window.addEventListener("pageshow", function (ev) {
    sdaLog("pageshow", { pers: ev.persisted });
  });
  document.addEventListener("visibilitychange", function () {
    sdaLog("visibility", { why: document.visibilityState });
  });
  var lastErrAt = {};
  function logOnce(event, why) {
    var key = event + ":" + why;
    var now = Date.now();
    if (lastErrAt[key] && now - lastErrAt[key] < 10000) return;
    lastErrAt[key] = now;
    sdaLog(event, { why: why });
  }

  window.sdaFlutterViewReady = function () {
    try {
      return !!(document.querySelector("flt-glass-pane") || document.querySelector("flutter-view"));
    } catch (e) {
      return false;
    }
  };

  window.sdaSafeOnRgba = function (buf) {
    try {
      if (typeof window.onRgba === "function") window.onRgba(buf);
    } catch (e) {
      logOnce("rgba-err", String((e && e.message) || e).slice(0, 80));
    }
  };

  window.sdaSafeGlobalEvent = function (payload) {
    try { handleCursorEvent(payload); } catch (e0) {}
    try {
      if (typeof window.onGlobalEvent === "function") window.onGlobalEvent(payload);
    } catch (e) {
      logOnce("cb-err", String("onGlobalEvent:" + ((e && e.message) || e)).slice(0, 80));
    }
  };

  window.sdaCallFlutter = function (fn, arg, name) {
    try {
      if (typeof fn === "function") return fn(arg);
    } catch (e) {
      logOnce("cb-err", String((name || "cb") + ":" + ((e && e.message) || e)).slice(0, 80));
    }
  };

  function sdaEnsureNotWhite() {
    try {
      if (document.querySelector("flt-glass-pane") || document.querySelector("flutter-view")) {
        var old = document.getElementById("sda-fallback");
        if (old && old.parentNode) old.parentNode.removeChild(old);
        return;
      }
      if (document.getElementById("sda-fallback")) return;
      var el = document.createElement("div");
      el.id = "sda-fallback";
      el.setAttribute("role", "alert");
      el.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#2D1B69;color:#fff;font-family:system-ui,sans-serif;z-index:999999;padding:28px;text-align:center;";
      el.innerHTML = '<p style="font-size:18px;max-width:28rem;line-height:1.4">Smart Desktop Access could not open. Your computers are safe \u2014 tap below to show the list.</p><p><button type="button" id="sda-fallback-btn" style="font-size:18px;padding:14px 22px;border:0;border-radius:10px;background:#6C4DFF;color:#fff">Show my computers</button></p>';
      document.body.appendChild(el);
      document.getElementById("sda-fallback-btn").onclick = function () {
        try {
          sessionStorage.removeItem("sda-resume-active");
          sessionStorage.removeItem("sda-connect-id");
        } catch (e2) {}
        location.replace("/webclient/");
      };
      sdaLog("white-fallback", { why: "no-flutter-view" });
    } catch (e) {}
  }
  setTimeout(sdaEnsureNotWhite, 8000);
  setTimeout(sdaEnsureNotWhite, 14000);

  var overlay = null;
  var overlayWrap = null;
  var overlayCtx = null;
  var overlayLogged = false;
  var frameW = 0;
  var frameH = 0;
  var inputBound = false;

  function viewSize() {
    try {
      var vv = window.visualViewport;
      if (vv && vv.width && vv.height) {
        return { x: vv.offsetLeft || 0, y: vv.offsetTop || 0, w: vv.width, h: vv.height };
      }
    } catch (e) {}
    return { x: 0, y: 0, w: window.innerWidth || 1, h: window.innerHeight || 1 };
  }

  function restoreKeyboardFocus() {
    try {
      if (typeof window.sdaIsTextEditingHost === "function" && window.sdaIsTextEditingHost()) return;
      var ae = document.activeElement;
      if (ae) {
        var tag = (ae.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || ae.isContentEditable) return;
        if (ae.closest && ae.closest("flt-text-editing-host")) return;
      }
      if (typeof window.sdaFocusRemoteKeyboard === "function") window.sdaFocusRemoteKeyboard();
    } catch (e) {}
  }

  var viewScale = 1;
  var viewPanX = 0;
  var viewPanY = 0;
  var pointers = {};
  var gesture = "";
  var longTimer = null;
  var startPt = null;
  var startClient = null;
  var leftHeld = false;
  var mouseCursor = { x: 0, y: 0 };
  var mouseCursorReady = false;
  var lastTrackpadTap = 0;
  var cursorEl = null;
  var cursorCache = {};
  var cursorCurrent = null;
  var cursorFallback = null;
  var localCursorLock = 0;
  var lastTwoFingerUp = 0;
  var pinch = null;
  var scrollAcc = 0;
  var TOUCH_KEY = "sda-touch-mode";
  var MAX_SCALE = 4;
  // View modes for the iPad live view (SDA Controls menu): "fit" keeps the
  // whole remote screen visible, "original" shows it 1:1 (one remote pixel =
  // one CSS pixel, pan with two fingers), "stretch" fills the screen. The
  // "window" view shrinks the picture into a smaller centred box. Touch and
  // mouse mapping always use the canvas' real on-screen rect, so they stay
  // exact in every mode, zoom level and orientation.
  var VIEW_MODE_KEY = "sda-view-mode";
  var viewMode = "fit";
  try {
    var vmSaved = localStorage.getItem(VIEW_MODE_KEY);
    if (vmSaved === "original" || vmSaved === "stretch") viewMode = vmSaved;
  } catch (eVm) {}
  var windowView = false;
  var WINDOW_FRAC = 0.72;
  var LONG_MS = 550;
  var SLOP = 12;

  function readTouchMode() {
    try {
      var v = localStorage.getItem(TOUCH_KEY);
      if (v === "0" || v === "false" || v === "N" || v === "n") return false;
      if (v === "1" || v === "true" || v === "Y" || v === "y") return true;
    } catch (e) {}
    return true;
  }
  var touchModeOn = readTouchMode();

  function persistTouchMode(on) {
    try { localStorage.setItem(TOUCH_KEY, on ? "1" : "0"); } catch (e) {}
    try { localStorage.setItem("sda-flutter-local:touch-mode", on ? "Y" : "N"); } catch (e2) {}
    try { localStorage.setItem("touch-mode", on ? "Y" : "N"); } catch (e3) {}
    try {
      if (window.curConn && typeof window.curConn.setOption === "function") {
        window.curConn.setOption("touch-mode", on ? "Y" : "N");
      }
      if (typeof window.setByName === "function" && !window.setByName.__sdaStub) {
        window.setByName("option", JSON.stringify({ name: "touch-mode", value: on ? "Y" : "N" }));
        window.setByName("peer_option", JSON.stringify({ name: "touch-mode", value: on ? "Y" : "N" }));
      }
    } catch (e4) {}
  }

  function setTouchMode(on) {
    touchModeOn = !!on;
    persistTouchMode(touchModeOn);
    updateSessionTools();
  }
  window.sdaSetTouchMode = setTouchMode;
  window.sdaGetTouchMode = function () { return !!touchModeOn; };
  window.sdaGetViewTransform = function () {
    return { scale: viewScale, panX: viewPanX, panY: viewPanY, frameW: frameW, frameH: frameH, touch: !!touchModeOn };
  };

  function imageBox() {
    var v = viewSize();
    if (!windowView) return v;
    var w = Math.round(v.w * WINDOW_FRAC);
    var h = Math.round(v.h * WINDOW_FRAC);
    return { x: v.x + Math.round((v.w - w) / 2), y: v.y + Math.round((v.h - h) / 2), w: w, h: h, inset: true };
  }

  function containRect(imgW, imgH) {
    var v = imageBox();
    if (!imgW || !imgH) return null;
    var scale = Math.min(v.w / imgW, v.h / imgH);
    if (!(scale > 0) || !isFinite(scale)) scale = 1;
    var dw = imgW * scale;
    var dh = imgH * scale;
    if (viewMode === "original") {
      scale = 1;
      dw = imgW;
      dh = imgH;
    } else if (viewMode === "stretch") {
      return { left: v.x, top: v.y, width: v.w, height: v.h, scale: scale, imgW: imgW, imgH: imgH, view: v, mode: viewMode };
    }
    return {
      mode: viewMode,
      left: v.x + (v.w - dw) / 2,
      top: v.y + (v.h - dh) / 2,
      width: dw,
      height: dh,
      scale: scale,
      imgW: imgW,
      imgH: imgH,
      view: v
    };
  }

  function clampScale(s) {
    if (!(s > 1)) return 1;
    if (s > MAX_SCALE) return MAX_SCALE;
    return s;
  }

  function clampPan() {
    var r = containRect(frameW, frameH);
    if (!r) return;
    if (viewScale <= 1.001) {
      viewScale = 1;
      if (r.width <= r.view.w + 0.5 && r.height <= r.view.h + 0.5) {
        viewPanX = 0;
        viewPanY = 0;
        return;
      }
    }
    var dw = r.width * viewScale;
    var dh = r.height * viewScale;
    var v = r.view;
    var left = r.left + viewPanX;
    var top = r.top + viewPanY;
    var minLeft = dw >= v.w ? v.x + v.w - dw : v.x;
    var maxLeft = dw >= v.w ? v.x : v.x + v.w - dw;
    if (minLeft > maxLeft) { var tl = minLeft; minLeft = maxLeft; maxLeft = tl; }
    if (left < minLeft) viewPanX = minLeft - r.left;
    if (left > maxLeft) viewPanX = maxLeft - r.left;
    var minTop = dh >= v.h ? v.y + v.h - dh : v.y;
    var maxTop = dh >= v.h ? v.y : v.y + v.h - dh;
    if (minTop > maxTop) { var tt = minTop; minTop = maxTop; maxTop = tt; }
    if (top < minTop) viewPanY = minTop - r.top;
    if (top > maxTop) viewPanY = maxTop - r.top;
  }

  function resetZoom() {
    viewScale = 1;
    viewPanX = 0;
    viewPanY = 0;
    positionOverlay();
    updateSessionTools();
  }
  window.sdaResetZoom = resetZoom;

  function setViewMode(mode) {
    if (mode !== "fit" && mode !== "original" && mode !== "stretch") return;
    viewMode = mode;
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch (e) {}
    resetZoom();
    sdaLog("viewmode", { why: mode });
  }
  function setWindowView(on) {
    windowView = !!on;
    resetZoom();
  }
  function zoomBy(f) {
    var r = containRect(frameW, frameH);
    if (!r) return;
    if (f < 1 && viewScale <= 1.001) {
      if (viewMode !== "fit") setViewMode("fit");
      return;
    }
    var b = r.view;
    applyZoomAt(b.x + b.w / 2, b.y + b.h / 2, viewScale * f);
    positionOverlay();
    updateSessionTools();
  }
  window.sdaSetViewMode = setViewMode;
  window.sdaSetWindowView = setWindowView;
  window.sdaZoomBy = zoomBy;
  window.sdaGetViewState = function () {
    return { mode: viewMode, scale: viewScale, windowView: windowView, live: !!(overlay && overlay.style.display !== "none" && frameW) };
  };

  function applyZoomAt(cx, cy, newScale) {
    var r = containRect(frameW, frameH);
    if (!r) return;
    newScale = clampScale(newScale);
    var left = r.left + viewPanX;
    var top = r.top + viewPanY;
    var ratio = viewScale > 0 ? (newScale / viewScale) : 1;
    viewScale = newScale;
    viewPanX = (cx - (cx - left) * ratio) - r.left;
    viewPanY = (cy - (cy - top) * ratio) - r.top;
    clampPan();
  }

  function baseOverflows() {
    var r = containRect(frameW, frameH);
    return !!(r && (r.width > r.view.w + 0.5 || r.height > r.view.h + 0.5));
  }

  function positionOverlay() {
    if (!overlay || !frameW || !frameH) return;
    if (overlay.style.display === "none") return;
    var r = containRect(frameW, frameH);
    if (!r) return;
    clampPan();
    var oL = r.left + viewPanX, oT = r.top + viewPanY;
    var oW = r.width * viewScale, oH = r.height * viewScale;
    overlay.style.left = oL + "px";
    overlay.style.top = oT + "px";
    overlay.style.width = oW + "px";
    overlay.style.height = oH + "px";
    // Clip the picture to the view box (matters in window view); clipped
    // parts take no taps either.
    var b = r.view;
    var cT = Math.max(0, b.y - oT), cL = Math.max(0, b.x - oL);
    var cB = Math.max(0, (oT + oH) - (b.y + b.h)), cR = Math.max(0, (oL + oW) - (b.x + b.w));
    var clip = (cT || cL || cB || cR) ? ("inset(" + cT + "px " + cR + "px " + cB + "px " + cL + "px)") : "";
    if (overlay.style.clipPath !== clip) { overlay.style.clipPath = clip; overlay.style.webkitClipPath = clip; }
    overlay.style.outline = windowView ? "2px solid #7c3aed" : "";
    if (overlayWrap) {
      var v = viewSize();
      overlayWrap.style.left = v.x + "px";
      overlayWrap.style.top = v.y + "px";
      overlayWrap.style.width = v.w + "px";
      overlayWrap.style.height = v.h + "px";
      overlayWrap.style.display = "block";
    }
    positionCursor();
  }

  function eventToRemote(src) {
    if (!overlay || !frameW || !frameH) return null;
    var r = overlay.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var x = Math.round((src.clientX - r.left) / r.width * frameW);
    var y = Math.round((src.clientY - r.top) / r.height * frameH);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > frameW - 1) x = frameW - 1;
    if (y > frameH - 1) y = frameH - 1;
    return { x: x, y: y };
  }

  function sendMouse(type, buttons, x, y) {
    try {
      if (!window.curConn || typeof window.curConn.inputMouse !== "function") return;
      var mask = 0;
      if (type === "down") mask = 1;
      else if (type === "up") mask = 2;
      else if (type === "wheel") mask = 3;
      if (buttons === "left") mask |= (1 << 3);
      else if (buttons === "right") mask |= (2 << 3);
      else if (buttons === "wheel") mask |= (4 << 3);
      x = Math.round(x);
      y = Math.round(y);
      window.__sdaLastInput = { x: x, y: y, type: type, buttons: buttons || "", mask: mask, t: Date.now() };
      if (type !== "wheel") {
        mouseCursor.x = x;
        mouseCursor.y = y;
        mouseCursorReady = true;
        localCursorLock = Date.now();
        positionCursor();
      }
      if (window.__sdaPerf) window.__sdaPerf.inputsSent++;
      window.curConn.inputMouse(mask, x, y, false, false, false, false);
    } catch (e) {}
  }

  function queueAbsMove(buttons, x, y) {
    pendingMove = { buttons: buttons || "", x: x, y: y };
    if (!moveRaf) {
      moveRaf = requestAnimationFrame(function () {
        moveRaf = 0;
        var queued = pendingMove;
        pendingMove = null;
        if (queued) sendMouse("", queued.buttons, queued.x, queued.y);
      });
    }
  }

  function flushPendingMove() {
    if (moveRaf) {
      try { cancelAnimationFrame(moveRaf); } catch (e) {}
      moveRaf = 0;
    }
    if (pendingMove) {
      var queued = pendingMove;
      pendingMove = null;
      sendMouse("", queued.buttons, queued.x, queued.y);
    }
  }

  function dartNum(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (v == null || v === "") return 0;
    try {
      var p = JSON.parse(v);
      if (typeof p === "number") return p;
      return Number(p) || 0;
    } catch (e) {
      return Number(v) || 0;
    }
  }

  function dartId(v) {
    if (v == null) return "";
    if (typeof v === "object" && v.toString) return String(v.toString());
    try { return String(JSON.parse(v)); } catch (e) { return String(v); }
  }

  function dartBytes(v) {
    if (!v) return null;
    if (v instanceof Uint8Array || v instanceof Uint8ClampedArray) return v;
    if (Array.isArray(v)) return new Uint8ClampedArray(v);
    if (typeof v === "string") {
      try {
        var p = JSON.parse(v);
        if (Array.isArray(p)) return new Uint8ClampedArray(p);
      } catch (e) {}
    }
    return null;
  }

  function makeFallbackCursor() {
    if (cursorFallback) return cursorFallback;
    var c = document.createElement("canvas");
    c.width = 24;
    c.height = 24;
    var ctx = c.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(1.5, 1.5);
    ctx.lineTo(1.5, 18.5);
    ctx.lineTo(5.5, 14.5);
    ctx.lineTo(8.5, 21.5);
    ctx.lineTo(10.5, 20.5);
    ctx.lineTo(7.2, 13.5);
    ctx.lineTo(13.5, 13.5);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#fff";
    ctx.stroke();
    ctx.fill();
    cursorFallback = { canvas: c, hotx: 1, hoty: 1, w: 24, h: 24, fallback: true };
    return cursorFallback;
  }

  function storeCursorImage(id, hotx, hoty, width, height, colors) {
    if (!width || !height || !colors || colors.length < width * height * 4) return;
    var c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    var ctx = c.getContext("2d");
    ctx.putImageData(new ImageData(new Uint8ClampedArray(colors), width, height), 0, 0);
    var rec = { canvas: c, hotx: hotx || 0, hoty: hoty || 0, w: width, h: height, fallback: false };
    if (id) cursorCache[String(id)] = rec;
    cursorCurrent = rec;
    positionCursor();
  }

  function handleCursorEvent(payload) {
    if (!payload) return;
    var ev = payload;
    if (typeof ev === "string") {
      try { ev = JSON.parse(ev); } catch (e) { return; }
    }
    if (!ev || !ev.name) return;
    if (ev.name === "cursor_data") {
      storeCursorImage(
        dartId(ev.id), dartNum(ev.hotx), dartNum(ev.hoty),
        dartNum(ev.width), dartNum(ev.height), dartBytes(ev.colors)
      );
    } else if (ev.name === "cursor_id") {
      var id = dartId(ev.id);
      if (id && cursorCache[id]) {
        cursorCurrent = cursorCache[id];
        positionCursor();
      }
    } else if (ev.name === "cursor_position") {
      if (Date.now() - localCursorLock < 180) return;
      if (gesture === "drag" || gesture === "pending" || leftHeld) return;
      mouseCursor.x = dartNum(ev.x);
      mouseCursor.y = dartNum(ev.y);
      mouseCursorReady = true;
      positionCursor();
    }
  }

  function remoteToScreen(rx, ry) {
    if (!overlay || !frameW || !frameH) return null;
    var r = overlay.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: r.left + rx / frameW * r.width,
      y: r.top + ry / frameH * r.height,
      scale: r.width / frameW
    };
  }

  function ensureCursorEl() {
    if (cursorEl && cursorEl.parentNode) return cursorEl;
    cursorEl = document.createElement("canvas");
    cursorEl.id = "sda-cursor";
    cursorEl.setAttribute("aria-hidden", "true");
    cursorEl.style.cssText = "position:fixed;left:0;top:0;width:24px;height:24px;pointer-events:none;z-index:2147483002;display:none;image-rendering:pixelated;will-change:transform;transform-origin:0 0;";
    document.body.appendChild(cursorEl);
    return cursorEl;
  }

  function hideCursorEl() {
    if (cursorEl) cursorEl.style.display = "none";
  }

  var paintedCursor = null;
  var paintedDpr = 0;

  function paintCursorImage(el, img) {
    var dpr = window.devicePixelRatio || 1;
    if (paintedCursor === img && paintedDpr === dpr && el.width) return;
    var bw = Math.max(1, Math.round(img.w * dpr));
    var bh = Math.max(1, Math.round(img.h * dpr));
    if (el.width !== bw || el.height !== bh) {
      el.width = bw;
      el.height = bh;
    }
    var ctx = el.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, img.w, img.h);
    ctx.drawImage(img.canvas, 0, 0);
    paintedCursor = img;
    paintedDpr = dpr;
  }

  function positionCursor() {
    try {
      if (!isIpad() || !window.curConn || !overlay || overlay.style.display === "none" || !frameW || !frameH) {
        hideCursorEl();
        return;
      }
      ensureMouseCursor();
      var img = cursorCurrent || makeFallbackCursor();
      var scr = remoteToScreen(mouseCursor.x, mouseCursor.y);
      if (!scr) { hideCursorEl(); return; }
      var cssScale = Math.max(1, scr.scale);
      var el = ensureCursorEl();
      paintCursorImage(el, img);
      el.style.width = (img.w * cssScale) + "px";
      el.style.height = (img.h * cssScale) + "px";
      var x = scr.x - img.hotx * cssScale;
      var y = scr.y - img.hoty * cssScale;
      el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
      el.style.display = "block";
    } catch (e) {}
  }

  window.sdaGetCursorInfo = function () {
    var img = cursorCurrent || cursorFallback || makeFallbackCursor();
    var scr = remoteToScreen(mouseCursor.x, mouseCursor.y);
    var el = document.getElementById("sda-cursor");
    var r = el && el.style.display !== "none" ? el.getBoundingClientRect() : null;
    return {
      x: mouseCursor.x,
      y: mouseCursor.y,
      ready: !!mouseCursorReady,
      hasImage: !!(cursorCurrent && !cursorCurrent.fallback),
      visible: !!(el && el.style.display !== "none"),
      fallback: !!(img && img.fallback),
      hotx: img ? img.hotx : 0,
      hoty: img ? img.hoty : 0,
      cssScale: scr ? Math.max(1, scr.scale) : 1,
      screen: scr,
      rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
    };
  };

  function ensureMouseCursor() {
    if (mouseCursorReady) return;
    mouseCursor.x = frameW ? Math.round(frameW / 2) : 0;
    mouseCursor.y = frameH ? Math.round(frameH / 2) : 0;
    mouseCursorReady = true;
  }

  function pointerCount() {
    var n = 0;
    for (var k in pointers) {
      if (Object.prototype.hasOwnProperty.call(pointers, k)) n++;
    }
    return n;
  }

  function pointerValues() {
    var out = [];
    for (var k in pointers) {
      if (Object.prototype.hasOwnProperty.call(pointers, k)) out.push(pointers[k]);
    }
    return out;
  }

  function clearLongTimer() {
    if (longTimer) {
      clearTimeout(longTimer);
      longTimer = null;
    }
  }

  function releaseLeft(pt) {
    if (!leftHeld) return;
    leftHeld = false;
    var pos = pt || startPt || mouseCursor;
    if (pos) sendMouse("up", "left", pos.x, pos.y);
  }

  function fireLongPress() {
    longTimer = null;
    if (gesture !== "pending" || pointerCount() !== 1) return;
    var pt = startPt;
    if (!touchModeOn) {
      ensureMouseCursor();
      pt = mouseCursor;
    }
    if (!pt) return;
    gesture = "longpress";
    sendMouse("down", "right", pt.x, pt.y);
    sendMouse("up", "right", pt.x, pt.y);
  }

  function handlePinchMove() {
    var pts = pointerValues();
    if (pts.length < 2 || !pinch) return;
    var x0 = pts[0].x, y0 = pts[0].y, x1 = pts[1].x, y1 = pts[1].y;
    var dist = Math.hypot(x1 - x0, y1 - y0);
    var cx = (x0 + x1) / 2;
    var cy = (y0 + y1) / 2;
    if (!(dist > 0) || !(pinch.dist > 0)) {
      pinch.dist = dist;
      pinch.cx = cx;
      pinch.cy = cy;
      return;
    }
    var newScale = clampScale(viewScale * (dist / pinch.dist));
    var grew = Math.abs(dist - pinch.originDist) > 16;
    if (pinch.reset) {
      pinch.dist = dist;
      pinch.cx = cx;
      pinch.cy = cy;
      return;
    }
    if (newScale > 1.001 || viewScale > 1.001 || grew || baseOverflows()) {
      applyZoomAt(cx, cy, newScale);
      viewPanX += cx - pinch.cx;
      viewPanY += cy - pinch.cy;
      clampPan();
      positionOverlay();
      updateSessionTools();
    } else if (viewScale <= 1.001) {
      scrollAcc += cy - pinch.cy;
      if (Math.abs(scrollAcc) >= 10) {
        var steps = Math.round(scrollAcc / 10);
        sendMouse("wheel", "wheel", 0, -steps);
        scrollAcc = 0;
      }
    }
    pinch.dist = dist;
    pinch.cx = cx;
    pinch.cy = cy;
  }

  function onOverlayPointerDown(ev) {
    try {
      if (ev && ev.cancelable) ev.preventDefault();
      if (ev) ev.stopPropagation();
      try { if (overlay && overlay.setPointerCapture && ev.pointerId != null) overlay.setPointerCapture(ev.pointerId); } catch (e0) {}
      var id = String(ev.pointerId);
      pointers[id] = { x: ev.clientX, y: ev.clientY, t: Date.now(), id: id };
      var n = pointerCount();
      if (n >= 2) {
        clearLongTimer();
        releaseLeft(eventToRemote(ev));
        var pts = pointerValues();
        var dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        var cx = (pts[0].x + pts[1].x) / 2;
        var cy = (pts[0].y + pts[1].y) / 2;
        var now = Date.now();
        if (now - lastTwoFingerUp < 400) {
          resetZoom();
          gesture = "pinch";
          pinch = { dist: dist, originDist: dist, cx: cx, cy: cy, reset: true };
          return;
        }
        gesture = "pinch";
        pinch = { dist: dist, originDist: dist, cx: cx, cy: cy, reset: false };
        scrollAcc = 0;
        return;
      }
      startClient = { x: ev.clientX, y: ev.clientY };
      startPt = eventToRemote(ev);
      gesture = "pending";
      if (touchModeOn && startPt) {
        sendMouse("", "", startPt.x, startPt.y);
      }
      clearLongTimer();
      longTimer = setTimeout(fireLongPress, LONG_MS);
    } catch (e) {}
  }

  function onOverlayPointerMove(ev) {
    try {
      if (ev && ev.cancelable) ev.preventDefault();
      if (ev) ev.stopPropagation();
      if (window.__sdaPerf) window.__sdaPerf.pointerMoves++;
      var id = String(ev.pointerId);
      if (!pointers[id]) return;
      var prev = pointers[id];
      pointers[id] = { x: ev.clientX, y: ev.clientY, t: prev.t, id: id };
      if (pointerCount() >= 2 || gesture === "pinch") {
        handlePinchMove();
        return;
      }
      if (gesture === "longpress" || gesture === "ignore") return;
      var dx = ev.clientX - (startClient ? startClient.x : ev.clientX);
      var dy = ev.clientY - (startClient ? startClient.y : ev.clientY);
      if (gesture === "pending" && (dx * dx + dy * dy) < SLOP * SLOP) {
        return;
      }
      clearLongTimer();
      var pt = eventToRemote(ev);
      if (touchModeOn) {
        if (gesture === "pending") {
          gesture = "drag";
          flushPendingMove();
          if (startPt) sendMouse("down", "left", startPt.x, startPt.y);
          leftHeld = true;
        }
        if (pt) {
          mouseCursor.x = pt.x;
          mouseCursor.y = pt.y;
          mouseCursorReady = true;
          localCursorLock = Date.now();
          positionCursor();
          queueAbsMove(leftHeld ? "left" : "", pt.x, pt.y);
        }
      } else {
        gesture = "drag";
        ensureMouseCursor();
        var rect = overlay.getBoundingClientRect();
        if (rect.width && rect.height) {
          mouseCursor.x += (ev.clientX - prev.x) / rect.width * frameW;
          mouseCursor.y += (ev.clientY - prev.y) / rect.height * frameH;
          if (mouseCursor.x < 0) mouseCursor.x = 0;
          if (mouseCursor.y < 0) mouseCursor.y = 0;
          if (mouseCursor.x > frameW - 1) mouseCursor.x = frameW - 1;
          if (mouseCursor.y > frameH - 1) mouseCursor.y = frameH - 1;
        }
        localCursorLock = Date.now();
        positionCursor();
        queueAbsMove("", mouseCursor.x, mouseCursor.y);
      }
    } catch (e) {}
  }

  function forceReleaseAll(pos) {
    try {
      flushPendingMove();
      clearLongTimer();
      if (leftHeld) releaseLeft(pos || startPt || mouseCursor);
      pointers = {};
      gesture = "";
      startPt = null;
      startClient = null;
      pinch = null;
      scrollAcc = 0;
    } catch (e) {
      leftHeld = false;
      pointers = {};
      gesture = "";
    }
  }

  function onOverlayPointerUp(ev) {
    try {
      if (ev && ev.cancelable) ev.preventDefault();
      if (ev) ev.stopPropagation();
      var id = ev && ev.pointerId != null ? String(ev.pointerId) : "";
      if (id && !pointers[id] && !leftHeld && !gesture && !pendingMove) return;
      try {
        if (overlay && overlay.releasePointerCapture && ev && ev.pointerId != null) {
          overlay.releasePointerCapture(ev.pointerId);
        }
      } catch (e0) {}
      flushPendingMove();
      var wasPinch = gesture === "pinch" || pointerCount() >= 2;
      if (id) delete pointers[id];
      var n = pointerCount();
      if (wasPinch) {
        if (n < 2) {
          lastTwoFingerUp = Date.now();
          pinch = null;
          scrollAcc = 0;
          gesture = n ? "ignore" : "";
        }
        if (!n && leftHeld) releaseLeft(eventToRemote(ev) || startPt || mouseCursor);
        if (!n) {
          startPt = null;
          startClient = null;
          gesture = "";
        }
        restoreKeyboardFocus();
        return;
      }
      clearLongTimer();
      var pt = eventToRemote(ev) || startPt;
      if (gesture === "pending") {
        if (touchModeOn && pt) {
          sendMouse("down", "left", pt.x, pt.y);
          sendMouse("up", "left", pt.x, pt.y);
        } else if (!touchModeOn) {
          ensureMouseCursor();
          sendMouse("down", "left", mouseCursor.x, mouseCursor.y);
          sendMouse("up", "left", mouseCursor.x, mouseCursor.y);
          lastTrackpadTap = Date.now();
        }
      } else if (gesture === "drag") {
        if (leftHeld) releaseLeft(pt);
      }
      if (leftHeld && !n) releaseLeft(pt || mouseCursor);
      gesture = n ? "ignore" : "";
      if (!n) {
        startPt = null;
        startClient = null;
      }
      restoreKeyboardFocus();
    } catch (e) {
      forceReleaseAll(mouseCursor);
    }
  }

  function onTouchEndFallback(ev) {
    try {
      if (ev && ev.touches && ev.touches.length > 0) return;
      if (!pointerCount() && !leftHeld && !gesture && !pendingMove) return;
      var touch = ev && ev.changedTouches && ev.changedTouches[0];
      var ids = [];
      for (var k in pointers) {
        if (Object.prototype.hasOwnProperty.call(pointers, k)) ids.push(k);
      }
      if (!ids.length) {
        onOverlayPointerUp({
          pointerId: "touch",
          clientX: touch ? touch.clientX : 0,
          clientY: touch ? touch.clientY : 0
        });
        return;
      }
      ids.forEach(function (pid) {
        onOverlayPointerUp({
          pointerId: pid,
          clientX: touch ? touch.clientX : 0,
          clientY: touch ? touch.clientY : 0
        });
      });
    } catch (e) {
      forceReleaseAll(mouseCursor);
    }
  }

  function bindOverlayInput(el) {
    if (!el || el.__sdaInput) return;
    el.__sdaInput = true;
    el.addEventListener("pointerdown", onOverlayPointerDown, { passive: false });
    el.addEventListener("pointermove", onOverlayPointerMove, { passive: false });
    el.addEventListener("pointerup", onOverlayPointerUp, { passive: false });
    el.addEventListener("pointercancel", onOverlayPointerUp, { passive: false });
    el.addEventListener("lostpointercapture", onOverlayPointerUp, { passive: false });
    el.addEventListener("touchend", onTouchEndFallback, { passive: false });
    el.addEventListener("touchcancel", onTouchEndFallback, { passive: false });
    if (!window.__sdaWinPtrBound) {
      window.__sdaWinPtrBound = true;
      window.addEventListener("pointerup", onOverlayPointerUp, true);
      window.addEventListener("pointercancel", onOverlayPointerUp, true);
      window.addEventListener("blur", function () { forceReleaseAll(mouseCursor); });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible") forceReleaseAll(mouseCursor);
      });
    }
  }

  function removeSessionTools() {
    try {
      var bar = document.getElementById("sda-session-tools");
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    } catch (e) {}
  }

  function hideOverlay() {
    window.__sdaFlutterGotFrame = false;
    window.__sdaOverlayForceFlutter = false;
    frameW = 0;
    frameH = 0;
    viewScale = 1;
    viewPanX = 0;
    viewPanY = 0;
    windowView = false;
    forceReleaseAll(mouseCursor);
    pointers = {};
    gesture = "";
    clearLongTimer();
    leftHeld = false;
    pinch = null;
    mouseCursorReady = false;
    if (overlay) {
      overlay.style.display = "none";
      overlay._sdaDown = false;
      try {
        overlay.width = 1;
        overlay.height = 1;
      } catch (e) {}
    }
    if (overlayWrap) overlayWrap.style.display = "none";
    overlayCtx = null;
    removeSessionTools();
    hideCursorEl();
    try {
      var ta = document.getElementById("sda-kb-host");
      if (ta) {
        try { ta.blur(); } catch (e2) {}
      }
    } catch (e3) {}
  }

  function ensureOverlay() {
    if (!overlayWrap || !overlayWrap.parentNode) {
      overlayWrap = document.createElement("div");
      overlayWrap.id = "sda-live-wrap";
      overlayWrap.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;background:#000;z-index:2147483000;display:none;pointer-events:none;";
      document.body.appendChild(overlayWrap);
    }
    if (!overlay || !overlay.parentNode) {
      overlay = document.createElement("canvas");
      overlay.id = "sda-live-canvas";
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = "position:fixed;left:0;top:0;pointer-events:auto;touch-action:none;z-index:2147483001;display:none;background:#000;";
      overlayWrap.appendChild(overlay);
      overlayCtx = overlay.getContext("2d", { alpha: false, desynchronized: true });
      bindOverlayInput(overlay);
    }
    return overlay;
  }

  window.sdaHideOverlay = hideOverlay;

  window.sdaScreenToRemote = function (clientX, clientY) {
    return eventToRemote({ clientX: clientX, clientY: clientY });
  };

  window.sdaGetInputState = function () {
    return {
      gesture: gesture,
      leftHeld: !!leftHeld,
      pointers: pointerCount(),
      pendingMove: !!pendingMove,
      touch: !!touchModeOn
    };
  };

  window.sdaOverlayInfo = function () {
    var r = overlay && overlay.style.display !== "none" ? overlay.getBoundingClientRect() : null;
    return {
      frameW: frameW,
      frameH: frameH,
      rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
      contain: containRect(frameW, frameH),
      view: viewSize(),
      scale: viewScale,
      panX: viewPanX,
      panY: viewPanY,
      touch: !!touchModeOn,
      cursor: window.sdaGetCursorInfo ? window.sdaGetCursorInfo() : null,
      lastInput: window.__sdaLastInput || null,
      fullscreen: !!(document.fullscreenElement || document.webkitFullscreenElement),
      mode: viewMode,
      windowView: windowView
    };
  };

  window.sdaBlitOverlay = function (sourceCanvas, width, height) {
    if (!isIpad()) return;
    if (!sourceCanvas || !width || !height) return;
    if (!window.curConn) {
      hideOverlay();
      return;
    }
    try {
      var vis = ensureOverlay();
      frameW = width;
      frameH = height;
      if (vis.width !== width || vis.height !== height || !overlayCtx) {
        vis.width = width;
        vis.height = height;
        overlayCtx = vis.getContext("2d", { alpha: false, desynchronized: true });
      }
      var t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      overlayCtx.drawImage(sourceCanvas, 0, 0, width, height);
      var t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      lastBlitMs = t1 - t0;
      if (window.__sdaPerf) {
        window.__sdaPerf.frames++;
        window.__sdaPerf.lastBlitMs = lastBlitMs;
      }
      vis.style.display = "block";
      positionOverlay();
      try { ensureSessionTools(); } catch (e3) {}
      if (!overlayLogged) {
        overlayLogged = true;
        var info = containRect(width, height);
        sdaLog("overlay", { why: width + "x" + height + (info ? "-contain" : "") });
      }
    } catch (e) {
      logOnce("overlay-err", String((e && e.message) || e).slice(0, 80));
    }
  };

  function onViewportChange() {
    try { positionOverlay(); } catch (e) {}
  }
  window.addEventListener("resize", onViewportChange);

  function isEditingHost() {
    try {
      if (typeof window.sdaIsTextEditingHost === "function" && window.sdaIsTextEditingHost()) return true;
      var ae = document.activeElement;
      if (!ae) return false;
      if (ae.id === "sda-kb-host") return true;
      var tag = (ae.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || ae.isContentEditable) return true;
      if (ae.closest && ae.closest("flt-text-editing-host")) return true;
    } catch (e) {}
    return false;
  }

  function browserKeyName(ev) {
    var k = ev && ev.key;
    if (!k) return "";
    var special = {
      Enter: "VK_RETURN", Backspace: "VK_BACK", Tab: "VK_TAB", Escape: "VK_ESCAPE",
      " ": "VK_SPACE", Spacebar: "VK_SPACE", ArrowLeft: "VK_LEFT", ArrowUp: "VK_UP",
      ArrowRight: "VK_RIGHT", ArrowDown: "VK_DOWN", Delete: "VK_DELETE", Home: "VK_HOME",
      End: "VK_END", PageUp: "VK_PRIOR", PageDown: "VK_NEXT", Insert: "VK_INSERT",
      Shift: "VK_SHIFT", Control: "VK_CONTROL", Alt: "VK_MENU", Meta: "Meta"
    };
    if (special[k]) return special[k];
    if (/^F([1-9]|1[0-2])$/.test(k)) return "VK_" + k;
    if (k.length === 1) return k;
    return "";
  }

  // Double-key fix: Flutter's own keyboard handler (window keydown/keyup ->
  // RawKeyboard -> setByName("input_key")) also forwards physical keys once its
  // remote page has focus (e.g. after any click). Our capture listener below
  // forwards them too, so every char arrived twice. We stay the single sender
  // for the key events we forward and drop Flutter's copy of that same event.
  var KEY_DEDUP_MS = 300;
  var keyClaimAt = -1e9;
  var ownKeySend = 0;
  window.__sdaKeyStats = { own: 0, flutterPassed: 0, flutterDropped: 0 };
  function keyNow() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }
  function sendOwnKey(json) {
    ownKeySend++;
    try {
      window.__sdaKeyStats.own++;
      window.setByName("input_key", json);
    } finally {
      ownKeySend--;
    }
  }
  // In the iPad keyboard box we send text, Enter and Backspace ourselves
  // (at keydown, see handleKbHostKeydown); arrows/F-keys stay with Flutter.
  function kbHostWillSend(ev) {
    var k = ev && ev.key;
    if (!k) return false;
    if (ev.isComposing || ev.keyCode === 229) return false;
    return k.length === 1 || k === "Enter" || k === "Backspace";
  }
  // Decide, per physical key event, whether we are the one sending it.
  function claimKeyEvent(ev) {
    var mine = false;
    try {
      patchConnKeys(window.curConn);
      if (window.curConn) {
        var ae = document.activeElement;
        if (ae && ae.id === "sda-kb-host") mine = kbHostWillSend(ev);
        else if (!isEditingHost()) mine = !!browserKeyName(ev) && typeof window.setByName === "function" && !window.setByName.__sdaStub;
      }
    } catch (e) {}
    keyClaimAt = mine ? keyNow() : -1e9;
  }
  // Connection-level single-sender guard. Every key path (our listener, the
  // iPad keyboard host, Flutter RawKeyboard via setByName, or anything calling
  // curConn.inputKey/inputString directly) ends at the Connection. For each
  // physical keydown/keyup, the first sender (ours or "other") owns that event
  // and any send from the other side for the same event is dropped.
  var KEY_GUARD_MS = 400;
  var physKey = null;
  window.__sdaKeyGuard = { allowed: 0, dropped: 0, free: 0 };
  function notePhysKey(ev) {
    if (!ev || (ev.type !== "keydown" && ev.type !== "keyup")) return;
    physKey = { t: keyNow(), owner: "" };
  }
  window.addEventListener("keydown", notePhysKey, true);
  window.addEventListener("keyup", notePhysKey, true);
  function guardKeySend() {
    var g = window.__sdaKeyGuard;
    var k = physKey;
    if (!k || keyNow() - k.t > KEY_GUARD_MS) { g.free++; return true; }
    var who = ownKeySend > 0 ? "own" : "other";
    if (!k.owner) k.owner = who;
    if (k.owner !== who) { g.dropped++; return false; }
    g.allowed++;
    return true;
  }
  function patchConnKeys(c) {
    if (!c || c.__sdaKeyGuard) return;
    try {
      ["inputKey", "inputString"].forEach(function (fn) {
        var o = c[fn];
        if (typeof o !== "function") return;
        c[fn] = function () {
          if (!guardKeySend()) return;
          return o.apply(c, arguments);
        };
      });
      c.__sdaKeyGuard = true;
    } catch (e) {}
  }
  setInterval(function () { try { patchConnKeys(window.curConn); } catch (e) {} }, 200);

  function isDuplicateFlutterKey(name) {
    if (name !== "input_key" || ownKeySend > 0) return false;
    if (keyNow() - keyClaimAt < KEY_DEDUP_MS) {
      window.__sdaKeyStats.flutterDropped++;
      return true;
    }
    window.__sdaKeyStats.flutterPassed++;
    return false;
  }

  // iPad double-letter fix: on iPad the web client runs in "mobile" mode,
  // where js/common.ts mapKey() turns every single character that is not
  // a-z (capitals, digits, punctuation, Cyrillic...) into a KeyEvent.unicode.
  // The remote (legacy keyboard mode) types a unicode char on EVERY event,
  // down and up alike, so a down+up pair typed it twice. Such chars must be
  // sent once, as a press. a-z map to chr, which honours down/up.
  function keyMapIsMobile() {
    try { return typeof window.isMobile === "function" && !!window.isMobile(); } catch (e) { return false; }
  }
  function charKeyInfo(ch, ev) {
    var name = ch;
    // Hotkeys (Ctrl/Alt/Cmd + letter) go as plain a-z so they stay real key chords.
    if (ev && (ev.ctrlKey || ev.altKey || ev.metaKey) && /^[A-Za-z]$/.test(ch)) name = ch.toLowerCase();
    return { name: name, unicode: keyMapIsMobile() && !/^[a-z]$/.test(name) };
  }
  window.__sdaKeyPress = { press: 0, skippedUp: 0, kbKeydown: 0, kbInputSkipped: 0 };
  function sendPressKey(name, ev, keepShift) {
    window.__sdaKeyPress.press++;
    sendOwnKey(JSON.stringify({
      name: name,
      down: "false",
      press: "true",
      alt: ev && ev.altKey ? "true" : "false",
      ctrl: ev && ev.ctrlKey ? "true" : "false",
      shift: keepShift && ev && ev.shiftKey ? "true" : "false",
      command: ev && ev.metaKey ? "true" : "false"
    }));
  }

  function sendSessionKey(ev) {
    if (!window.curConn) return;
    if (isEditingHost()) return;
    var name = browserKeyName(ev);
    if (!name) return;
    if (typeof window.setByName !== "function" || window.setByName.__sdaStub) return;
    var down = ev.type === "keydown";
    if (name.length === 1) {
      var info = charKeyInfo(name, ev);
      name = info.name;
      if (info.unicode) {
        if (down) { try { sendPressKey(name, ev, false); } catch (e1) {} }
        else window.__sdaKeyPress.skippedUp++;
        return;
      }
    }
    // Never preventDefault/stopPropagation on key events.
    try {
      sendOwnKey(JSON.stringify({
        name: name,
        down: down ? "true" : "false",
        press: "false",
        alt: ev.altKey ? "true" : "false",
        ctrl: ev.ctrlKey ? "true" : "false",
        shift: ev.shiftKey ? "true" : "false",
        command: ev.metaKey ? "true" : "false"
      }));
    } catch (e) {}
  }

  // iPad keyboard box (#sda-kb-host). Flutter's RawKeyboard listener calls
  // preventDefault() on hardware keydowns, so the textarea never got an
  // input event and Magic-keyboard letters were lost; on-screen keys that do
  // reach the textarea must not be sent a second time. So: send the key
  // here, once, and skip the matching textarea input that may follow.
  var kbPending = null;
  function handleKbHostKeydown(ev) {
    kbPending = null;
    if (!window.curConn || typeof window.setByName !== "function" || window.setByName.__sdaStub) return;
    if (!kbHostWillSend(ev)) return;
    var k = ev.key;
    window.__sdaKeyPress.kbKeydown++;
    if (k === "Enter") { sendPressKey("VK_RETURN", ev, true); kbPending = { kind: "enter", t: keyNow() }; return; }
    if (k === "Backspace") { sendPressKey("VK_BACK", ev, true); kbPending = { kind: "back", t: keyNow() }; return; }
    if (k === " ") { sendPressKey("VK_SPACE", ev, true); kbPending = { kind: "text", t: keyNow() }; return; }
    var info = charKeyInfo(k, ev);
    sendPressKey(info.name, ev, !info.unicode && (ev.ctrlKey || ev.altKey || ev.metaKey));
    kbPending = { kind: "text", t: keyNow() };
  }

  document.addEventListener("keydown", function (ev) {
    try { claimKeyEvent(ev); } catch (e0) {}
    try {
      if (!window.curConn) return;
      var kae = document.activeElement;
      if (kae && kae.id === "sda-kb-host") { handleKbHostKeydown(ev); return; }
      if (isEditingHost()) return;
      var ae = document.activeElement;
      if (!ae || ae.id === "sda-live-canvas" || ae === overlay || ae === overlayWrap || ae === document.body || ae === document.documentElement) {
        restoreKeyboardFocus();
      }
      sendSessionKey(ev);
    } catch (e) {}
  }, true);
  document.addEventListener("keyup", function (ev) {
    try { claimKeyEvent(ev); } catch (e0) {}
    try { sendSessionKey(ev); } catch (e) {}
  }, true);

  var kbLast = "";
  function handleKbHostInput(ev) {
    var ta = document.getElementById("sda-kb-host");
    if (!ta || !window.curConn || typeof window.setByName !== "function" || window.setByName.__sdaStub) return;
    // Mid-composition (accents, CJK, dictation): wait for compositionend.
    if (ev && ev.isComposing) return;
    var nv = ta.value || "";
    var ov = kbLast;
    var pend = kbPending;
    if (pend && keyNow() - pend.t < 1000) {
      var added = nv.length > ov.length ? nv.substring(ov.length) : "";
      var match = (pend.kind === "back" && nv.length < ov.length)
        || (pend.kind === "enter" && added === "\n")
        || (pend.kind === "text" && added.length === 1 && added !== "\n");
      if (match) {
        kbPending = null;
        window.__sdaKeyPress.kbInputSkipped++;
        kbLast = nv.length > 200 ? "" : nv;
        if (nv.length > 200) ta.value = "";
        return;
      }
    }
    function send(name) {
      try {
        sendOwnKey(JSON.stringify({
          name: name, down: "false", press: "true",
          alt: "false", ctrl: "false", shift: "false", command: "false"
        }));
      } catch (e) {}
    }
    if (nv.length < ov.length) {
      var n = ov.length - nv.length;
      for (var i = 0; i < n; i++) send("VK_BACK");
    } else if (nv.length > ov.length) {
      var content = nv.substring(ov.length);
      if (content.length > 1 && typeof window.curConn.inputString === "function") {
        try { ownKeySend++; window.setByName("input_string", content); } catch (e2) {} finally { ownKeySend--; }
      } else {
        for (var j = 0; j < content.length; j++) {
          var ch = content.charAt(j);
          if (ch === "\n") send("VK_RETURN");
          else if (ch === " ") send("VK_SPACE");
          else send(ch);
        }
      }
    }
    if (nv.length > 200) {
      ta.value = "";
      kbLast = "";
    } else {
      kbLast = nv;
    }
  }

  function ensureKbHost() {
    var ta = document.getElementById("sda-kb-host");
    if (ta) return ta;
    if (!document.body) return null;
    ta = document.createElement("textarea");
    ta.id = "sda-kb-host";
    ta.setAttribute("autocapitalize", "off");
    ta.setAttribute("autocomplete", "off");
    ta.setAttribute("autocorrect", "off");
    ta.setAttribute("spellcheck", "false");
    ta.setAttribute("aria-label", "Remote keyboard");
    ta.style.cssText = "position:fixed;left:0;bottom:0;width:100%;height:1px;opacity:0;border:0;padding:0;margin:0;font-size:16px;z-index:2147483090;background:transparent;resize:none;outline:none;";
    ta.addEventListener("input", handleKbHostInput);
    ta.addEventListener("compositionend", function () { setTimeout(function () { handleKbHostInput(null); }, 0); });
    document.body.appendChild(ta);
    return ta;
  }

  function openOnScreenKeyboard(ev) {
    if (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
    }
    var ta = ensureKbHost();
    if (!ta) return;
    try { ta.focus(); } catch (e) {}
  }
  window.sdaOpenOnScreenKeyboard = openOnScreenKeyboard;

  function stopToolEvent(ev) {
    if (!ev) return;
    try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
  }

  function updateSessionTools() {
    var touch = document.getElementById("sda-touch-btn");
    if (touch) {
      touch.setAttribute("aria-pressed", touchModeOn ? "true" : "false");
      touch.title = touchModeOn
        ? "Touch screen on: a tap clicks where your finger is"
        : "Touch screen off: drag to move the arrow; tap anywhere, or use Left click, to click at the arrow";
    }
    var fit = document.getElementById("sda-fit-btn");
    if (fit) {
      var isFit = viewScale <= 1.001 && viewMode === "fit";
      fit.setAttribute("data-fit", isFit ? "1" : "0");
      fit.title = isFit ? "Already fit to the screen" : "Reset zoom to fit the screen";
    }
    var bar = document.getElementById("sda-session-tools");
    if (bar) bar.setAttribute("data-touch", touchModeOn ? "1" : "0");
    positionCursor();
  }

  function toggleTouchMode(ev) {
    stopToolEvent(ev);
    setTouchMode(!touchModeOn);
  }

  function onFitClick(ev) {
    stopToolEvent(ev);
    if (viewMode !== "fit") setViewMode("fit");
    else resetZoom();
  }

  function ensureSessionTools() {
    if (!isIpad() || !window.curConn) {
      removeSessionTools();
      return;
    }
    if (!document.body) return;
    if (!document.getElementById("sda-session-style")) {
      var style = document.createElement("style");
      style.id = "sda-session-style";
      style.textContent = [
        "#sda-session-tools{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483100;display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100vw - 24px);pointer-events:none;}",
        "#sda-session-tools button{pointer-events:auto;height:36px;padding:0 14px;border:0;border-radius:18px;cursor:pointer;font:650 14px/36px system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 2px 8px rgba(15,23,42,.18);white-space:nowrap;-webkit-tap-highlight-color:transparent;}",
        "#sda-kb-btn{background:#1d4ed8;color:#fff;}",
        "#sda-touch-btn{background:#15803d;color:#fff;}",
        "#sda-touch-btn[aria-pressed=\"false\"]{background:#fff;color:#0f172a;}",
        "#sda-fit-btn{background:#334155;color:#fff;}",
        "#sda-fit-btn[data-fit=\"1\"]{opacity:.55;}",
        "#sda-lclick-btn,#sda-rclick-btn{background:#0f172a;color:#fff;}",
        "#sda-session-tools[data-touch=\"1\"] #sda-lclick-btn,#sda-session-tools[data-touch=\"1\"] #sda-rclick-btn{display:none;}"
      ].join("");
      document.head.appendChild(style);
    }
    var bar = document.getElementById("sda-session-tools");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "sda-session-tools";
      var kb = document.createElement("button");
      kb.id = "sda-kb-btn";
      kb.type = "button";
      kb.textContent = "Keyboard";
      kb.title = "Open the on-screen keyboard";
      kb.setAttribute("aria-label", "Open the on-screen keyboard");
      kb.addEventListener("click", openOnScreenKeyboard);
      var touch = document.createElement("button");
      touch.id = "sda-touch-btn";
      touch.type = "button";
      touch.textContent = "Touch screen";
      touch.setAttribute("aria-label", "Touch screen");
      touch.addEventListener("click", toggleTouchMode);
      var fit = document.createElement("button");
      fit.id = "sda-fit-btn";
      fit.type = "button";
      fit.textContent = "Fit";
      fit.setAttribute("aria-label", "Fit the remote screen");
      fit.addEventListener("click", onFitClick);
      var lbtn = document.createElement("button");
      lbtn.id = "sda-lclick-btn";
      lbtn.type = "button";
      lbtn.textContent = "Left click";
      lbtn.title = "Left-click at the mouse arrow";
      lbtn.setAttribute("aria-label", "Left click at the mouse arrow");
      lbtn.addEventListener("click", function (ev) {
        stopToolEvent(ev);
        ensureMouseCursor();
        sendMouse("down", "left", mouseCursor.x, mouseCursor.y);
        sendMouse("up", "left", mouseCursor.x, mouseCursor.y);
      });
      var rbtn = document.createElement("button");
      rbtn.id = "sda-rclick-btn";
      rbtn.type = "button";
      rbtn.textContent = "Right click";
      rbtn.title = "Right-click at the mouse arrow";
      rbtn.setAttribute("aria-label", "Right click at the mouse arrow");
      rbtn.addEventListener("click", function (ev) {
        stopToolEvent(ev);
        ensureMouseCursor();
        sendMouse("down", "right", mouseCursor.x, mouseCursor.y);
        sendMouse("up", "right", mouseCursor.x, mouseCursor.y);
      });
      bar.appendChild(kb);
      bar.appendChild(touch);
      bar.appendChild(fit);
      bar.appendChild(lbtn);
      bar.appendChild(rbtn);
      document.body.appendChild(bar);
      try { if (typeof window.sdaExtendSessionTools === "function") window.sdaExtendSessionTools(bar); } catch (eX) {}
    }
    updateSessionTools();
  }
  function ensureKeyboardBtn() { ensureSessionTools(); }

  window.addEventListener("orientationchange", function () {
    setTimeout(onViewportChange, 50);
    setTimeout(onViewportChange, 250);
    setTimeout(onViewportChange, 600);
  });
  try {
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewportChange);
      window.visualViewport.addEventListener("scroll", onViewportChange);
    }
  } catch (e) {}

  function sdaEnsureViewStyle(id) {
    try {
      var peers = JSON.parse(localStorage.getItem("peers") || "{}");
      if (id && peers[id]) {
        peers[id]["view-style"] = "shrink";
        localStorage.setItem("peers", JSON.stringify(peers));
      }
      if (window.curConn && typeof window.curConn.setOption === "function") {
        window.curConn.setOption("view-style", "shrink");
      }
    } catch (e) {}
  }
  window.sdaEnsureViewStyle = sdaEnsureViewStyle;

  function sdaRequestFullscreen() {
    try {
      var doc = document;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
      var el = document.documentElement;
      var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
      if (!fn) {
        sdaLog("fullscreen", { why: "unsupported" });
        return;
      }
      var ret = fn.call(el, { navigationUI: "hide" });
      if (ret && typeof ret.then === "function") {
        ret.then(function () {
          sdaLog("fullscreen", { why: "ok" });
          onViewportChange();
        }).catch(function () {
          sdaLog("fullscreen", { why: "denied" });
        });
      } else {
        sdaLog("fullscreen", { why: "ok" });
      }
    } catch (e) {
      sdaLog("fullscreen", { why: "err" });
    }
  }
  window.sdaRequestFullscreen = sdaRequestFullscreen;

  function sdaExitFullscreen() {
    try {
      var fn = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
      if (fn && (document.fullscreenElement || document.webkitFullscreenElement)) fn.call(document);
    } catch (e) {}
  }
  window.sdaExitFullscreen = sdaExitFullscreen;

  window.addEventListener("error", function (ev) {
    var msg = (ev && ev.message) || (ev && ev.error && ev.error.message) || "error";
    logOnce("jserror", String(msg).slice(0, 80));
  });
  window.addEventListener("unhandledrejection", function (ev) {
    var msg = ev && ev.reason;
    try { msg = msg && (msg.message || String(msg)); } catch (e) { msg = "reject"; }
    logOnce("unhandled", String(msg || "reject").slice(0, 80));
  });
  window.addEventListener("freeze", function () { sdaLog("freeze"); });

  function wrapSetByName() {
    var orig = window.setByName;
    if (!orig || orig.__sdaStab) return;
    var wrapped = function (name, value) {
      if (isDuplicateFlutterKey(name)) return;
      if (name === "connect") {
        markResume(value);
        sdaLog("connect", { id: value });
        sdaEnsureViewStyle(value);
        sdaRequestFullscreen();
      }
      if (name === "close") {
        if (window.curConn) window.curConn._userClosed = true;
        clearResume();
        sdaLog("userclose", { id: safeId() });
        if (typeof hideOverlay === "function") hideOverlay();
        sdaExitFullscreen();
      }
      try {
        return orig.apply(this, arguments);
      } catch (e) {
        sdaLog("cb-err", { why: String("setByName:" + ((e && e.message) || e)).slice(0, 80) });
      }
    };
    if (orig.__sdaStub) wrapped.__sdaStub = true;
    if (orig.__sdaStatus) wrapped.__sdaStatus = true;
    wrapped.__sdaStab = true;
    window.setByName = wrapped;
  }
  wrapSetByName();
  setInterval(wrapSetByName, 500);

  var WANTED_VIEWPORT = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

  function sdaEnsureViewport() {
    try {
      var head = document.head;
      if (!head) return;
      var list = document.querySelectorAll('meta[name="viewport"]');
      var vp = list[0];
      if (!vp) {
        vp = document.createElement("meta");
        vp.setAttribute("name", "viewport");
        head.insertBefore(vp, head.firstChild);
      }
      var cur = vp.getAttribute("content") || "";
      if (cur.indexOf("viewport-fit=cover") === -1) {
        vp.setAttribute("content", cur ? (cur.replace(/\s+$/, "") + ", viewport-fit=cover") : WANTED_VIEWPORT);
      }
      for (var i = 1; i < list.length; i++) {
        try { if (list[i].parentNode) list[i].parentNode.removeChild(list[i]); } catch (e2) {}
      }
      function ensureMeta(name, content) {
        var el = document.querySelector('meta[name="' + name + '"]');
        if (!el) {
          el = document.createElement("meta");
          el.setAttribute("name", name);
          head.appendChild(el);
        }
        if ((el.getAttribute("content") || "") !== content) el.setAttribute("content", content);
      }
      ensureMeta("apple-mobile-web-app-capable", "yes");
      ensureMeta("mobile-web-app-capable", "yes");
      ensureMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
    } catch (e) {}
  }
  sdaEnsureViewport();
  try {
    if (window.MutationObserver && document.documentElement) {
      var mo = new MutationObserver(function () { sdaEnsureViewport(); });
      mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["content", "name"] });
    }
  } catch (e) {}
  document.addEventListener("DOMContentLoaded", sdaEnsureViewport);
  setTimeout(sdaEnsureViewport, 400);
  setTimeout(sdaEnsureViewport, 2000);
  setTimeout(sdaEnsureViewport, 6000);

  sdaLog("load", { why: isIpad() ? "ipad" : "other" });
})();
