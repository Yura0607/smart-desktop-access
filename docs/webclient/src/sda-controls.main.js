  // ---------------------------------------------------------------------------
  // SDA Controls: the session actions of the desktop app's toolbar for the web
  // client (Ctrl+Alt+Del, lock, restart, block input, privacy mode, monitors,
  // refresh, type text) plus full-screen and view-size controls.
  // Uses the existing bridge (window.setByName / window.curConn). Messages the
  // bundled web encoder does not know (restart) are encoded here and sent
  // through the session's own encrypted channel, with the same nonce counter.
  // ---------------------------------------------------------------------------
  var VER = "20261115-ctl1";
  var stats = window.__sdaCtl = { ver: VER, sent: [] };

  function conn() { return window.curConn || null; }
  function bridgeReady() { return typeof window.setByName === "function" && !window.setByName.__sdaStub; }
  function inSession() {
    var c = conn();
    var sock = c && c._ws && c._ws._websocket;
    return !!(c && c._peerInfo && sock && sock.readyState === 1 && !c._userClosed);
  }
  function peerName() {
    var c = conn(), pi = c && c._peerInfo;
    return (pi && (pi.hostname || pi.username)) || (c && c._id) || "the remote computer";
  }
  function peerPlatform() {
    var c = conn(), pi = c && c._peerInfo;
    return (pi && pi.platform) || "";
  }
  function isIpadUi() {
    try { return typeof window.sdaIsIpad === "function" && window.sdaIsIpad(); } catch (e) { return false; }
  }
  function log(ev, why) {
    stats.sent.push(ev + (why ? ":" + why : ""));
    if (stats.sent.length > 50) stats.sent.shift();
  }

  function call(name, value) {
    if (!bridgeReady() || !conn()) { toast("Not connected"); return false; }
    try { window.setByName(name, value); log(name, value); return true; }
    catch (e) { toast("Could not send"); return false; }
  }

  // --- raw protobuf + encrypted send ---------------------------------------
  function varint(n, out) { while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); } out.push(n); }
  function field(num, wire, out) { varint(num * 8 + wire, out); }
  function lenField(num, bytes, out) { field(num, 2, out); varint(bytes.length, out); for (var i = 0; i < bytes.length; i++) out.push(bytes[i]); }
  // Message { misc (19) : Misc { <inner> } }
  function miscMessage(inner) { var out = []; lenField(19, inner, out); return new Uint8Array(out); }
  function makeNonce(value) {
    var b = new Uint8Array(24);
    for (var i = 0; i < 24 && value > 0; i++) { var byte = value & 255; b[i] = byte; value = (value - byte) / 256; }
    return b;
  }
  function sendRaw(plain, what) {
    var c = conn(), ws = c && c._ws, sock = ws && ws._websocket;
    if (!sock || sock.readyState !== 1) { toast("Not connected"); return false; }
    var data = plain;
    var k = ws._secretKey;
    if (k) {
      k[1] += 1;
      data = nacl.secretbox(plain, makeNonce(k[1]), k[0]);
    }
    sock.send(data);
    log("raw", what);
    return true;
  }
  window.sdaCtlEncode = { miscMessage: miscMessage, nonce: makeNonce, secretbox: function (m, n, k) { return nacl.secretbox(m, n, k); }, open: function (b, n, k) { return nacl.secretbox.open(b, n, k); } };

  // --- actions --------------------------------------------------------------
  var state = { block: false, privacy: false, connId: null };
  function syncConnState() {
    var c = conn();
    var id = c ? c._id + "|" + (c._peerInfo ? "1" : "0") : null;
    if (id !== state.connId) { state.connId = id; state.block = false; state.privacy = false; }
  }

  function actCad() { closePanel(); if (call("ctrl_alt_del", "")) toast("Ctrl+Alt+Del sent"); }
  function actLock() { closePanel(); if (call("lock_screen", "")) toast("Lock screen sent"); }
  function actRefresh() { closePanel(); if (call("refresh", "")) toast("Screen refreshed"); }
  function actRestart() {
    confirmBox("Restart " + peerName() + "?",
      "The remote computer restarts right away. Unsaved work on it will be lost and this connection will drop. Reconnect in 1–2 minutes.",
      "Restart now", function () {
        // Misc.restart_remote_device (field 14) = true
        if (sendRaw(miscMessage([0x70, 0x01]), "restart_remote_device")) toast("Restart sent to " + peerName());
      });
  }
  function actBlock() {
    var on = !state.block;
    if (call("toggle_option", on ? "block-input" : "unblock-input")) {
      state.block = on;
      toast(on ? "User input on the remote computer is blocked" : "User input unblocked");
    }
    render();
  }
  function actPrivacy() {
    var c = conn();
    if (!c) return;
    var on = !state.privacy;
    try {
      // toggleOption flips the stored value; make sure it flips the way we want
      // and never leave privacy mode saved for the next connection.
      c._options = c._options || {};
      if (on) delete c._options["privacy-mode"]; else c._options["privacy-mode"] = true;
    } catch (e) {}
    if (call("toggle_option", "privacy-mode")) {
      state.privacy = on;
      try { c.setOption("privacy-mode", undefined); } catch (e2) {}
      toast(on ? "Privacy mode on: the remote screen is hidden from people at that computer" : "Privacy mode off");
    }
    render();
  }
  function actDisplay(i) { closePanel(); if (call("switch_display", i)) toast("Switched to monitor " + (i + 1)); }
  function actType() {
    textBox(function (text) {
      if (!text) return;
      var c = conn();
      if (!c || typeof c.inputString !== "function") { toast("Not connected"); return; }
      c.inputString(text);
      log("input_string", String(text.length));
      toast("Typed " + text.length + " character" + (text.length === 1 ? "" : "s"));
    });
  }
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function actFullscreen() {
    if (isFull()) { if (window.sdaExitFullscreen) window.sdaExitFullscreen(); }
    else if (window.sdaRequestFullscreen) window.sdaRequestFullscreen();
    setTimeout(render, 400);
  }
  function actView(mode) { if (window.sdaSetViewMode) window.sdaSetViewMode(mode); render(); }
  function actZoom(f) { if (window.sdaZoomBy) window.sdaZoomBy(f); render(); }
  function actWindow() {
    var vs = window.sdaGetViewState ? window.sdaGetViewState() : null;
    if (window.sdaSetWindowView && vs) window.sdaSetWindowView(!vs.windowView);
    render();
  }

  // --- UI ---------------------------------------------------------------------
  var CSS = [
    "#sda-ctl-fab{position:fixed;left:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:2147483100;height:40px;padding:0 16px;border:0;border-radius:20px;background:linear-gradient(135deg,#6d28d9,#2563eb);color:#fff;font:650 14px/40px system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 2px 10px rgba(30,27,75,.35);cursor:pointer;-webkit-tap-highlight-color:transparent;}",
    "#sda-ctl-btn{background:linear-gradient(135deg,#6d28d9,#2563eb)!important;color:#fff!important;}",
    "#sda-cad-btn{background:#4c1d95!important;color:#fff!important;}",
    "#sda-ctl-panel{position:fixed;z-index:2147483300;left:50%;top:50%;transform:translate(-50%,-50%);width:min(460px,calc(100vw - 24px));max-height:calc(100vh - 40px);overflow:auto;-webkit-overflow-scrolling:touch;background:#fff;color:#1e1b4b;border-radius:18px;box-shadow:0 18px 50px rgba(30,27,75,.45);font:15px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif;}",
    "#sda-ctl-panel *{box-sizing:border-box;}",
    "#sda-ctl-shade{position:fixed;inset:0;z-index:2147483250;background:rgba(15,23,42,.45);}",
    ".sda-ctl-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:linear-gradient(135deg,#6d28d9,#2563eb);color:#fff;border-radius:18px 18px 0 0;position:sticky;top:0;}",
    ".sda-ctl-head b{font-size:16px;} .sda-ctl-head small{display:block;opacity:.85;font-size:12px;font-weight:500;}",
    ".sda-ctl-x{width:40px;height:40px;border:0;border-radius:20px;background:rgba(255,255,255,.18);color:#fff;font-size:22px;line-height:40px;cursor:pointer;}",
    ".sda-ctl-sec{padding:10px 14px 4px;} .sda-ctl-sec h4{margin:4px 2px 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6d28d9;}",
    ".sda-ctl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;} .sda-ctl-grid.g3{grid-template-columns:repeat(3,1fr);} .sda-ctl-grid.g4{grid-template-columns:repeat(4,1fr);}",
    ".sda-ctl-b{min-height:46px;padding:8px 10px;border:1px solid #c7d2fe;border-radius:12px;background:#eef2ff;color:#1e1b4b;font:600 14px/1.2 inherit;font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;text-align:center;}",
    ".sda-ctl-b:active{background:#ddd6fe;} .sda-ctl-b[aria-pressed=true]{background:linear-gradient(135deg,#6d28d9,#2563eb);color:#fff;border-color:transparent;}",
    ".sda-ctl-b.danger{background:#fff1f2;border-color:#fecdd3;color:#9f1239;}",
    ".sda-ctl-note{margin:6px 2px 8px;font-size:12px;color:#475569;}",
    "#sda-ctl-toast{position:fixed;left:50%;bottom:calc(64px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483400;max-width:calc(100vw - 32px);padding:10px 16px;border-radius:12px;background:#1e1b4b;color:#fff;font:600 14px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);pointer-events:none;}",
    ".sda-ctl-dlg{padding:16px;} .sda-ctl-dlg p{margin:0 0 14px;color:#334155;} .sda-ctl-dlg textarea{width:100%;min-height:120px;padding:10px;border:1px solid #c7d2fe;border-radius:10px;font:15px/1.4 system-ui,sans-serif;color:#0f172a;}",
    ".sda-ctl-row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;} .sda-ctl-row .sda-ctl-b{min-width:110px;}",
    ".sda-ctl-b.primary{background:linear-gradient(135deg,#6d28d9,#2563eb);color:#fff;border-color:transparent;} .sda-ctl-b.red{background:#be123c;color:#fff;border-color:transparent;}"
  ].join("");
  function ensureStyle() {
    if (document.getElementById("sda-ctl-style") || !document.head) return;
    var st = document.createElement("style");
    st.id = "sda-ctl-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === "cls") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    return e;
  }
  function stop(ev) { try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {} }
  function btn(label, id, fn, extra) {
    var b = el("button", { type: "button", cls: "sda-ctl-b" + (extra && extra.cls ? " " + extra.cls : ""), "data-act": id }, label);
    if (extra && extra.pressed != null) b.setAttribute("aria-pressed", extra.pressed ? "true" : "false");
    if (extra && extra.title) b.title = extra.title;
    b.addEventListener("click", function (ev) { stop(ev); fn(); });
    return b;
  }

  var toastTimer = null;
  function toast(msg) {
    ensureStyle();
    var t = document.getElementById("sda-ctl-toast");
    if (!t) { t = el("div", { id: "sda-ctl-toast", role: "status" }); document.body.appendChild(t); }
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = "none"; }, 2600);
  }

  // Keys typed inside our panel/dialogs must never reach the remote computer
  // (Flutter and the session key listeners read keys at window level).
  function isOurs(t) { return !!(t && t.closest && t.closest("#sda-ctl-panel")); }
  ["keydown", "keyup", "keypress", "beforeinput", "input", "compositionstart", "compositionend"].forEach(function (type) {
    window.addEventListener(type, function (ev) {
      if (panelOpen || isOurs(ev.target)) {
        ev.stopImmediatePropagation();
        if (ev.type === "keydown" && ev.key === "Escape") closePanel();
      }
    }, true);
  });

  var POINTER_EVENTS = ["pointerdown", "pointermove", "pointerup", "pointercancel", "touchstart", "touchmove", "touchend", "touchcancel", "mousedown", "mousemove", "mouseup", "wheel", "contextmenu"];
  var panelOpen = false;
  function closePanel() {
    panelOpen = false;
    ["sda-ctl-panel", "sda-ctl-shade"].forEach(function (id) {
      var e = document.getElementById(id);
      if (e && e.parentNode) e.parentNode.removeChild(e);
    });
  }
  function shell(title, sub) {
    closePanel();
    ensureStyle();
    panelOpen = true;
    var shade = el("div", { id: "sda-ctl-shade" });
    shade.addEventListener("click", function (ev) { stop(ev); closePanel(); });
    POINTER_EVENTS.forEach(function (t) { shade.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true }); });
    var p = el("div", { id: "sda-ctl-panel", role: "dialog", "aria-label": title });
    POINTER_EVENTS.forEach(function (t) { p.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true }); });
    var head = el("div", { cls: "sda-ctl-head" });
    var h = el("div");
    h.appendChild(el("b", null, title));
    if (sub) h.appendChild(el("small", null, sub));
    var x = el("button", { type: "button", cls: "sda-ctl-x", "aria-label": "Close" }, "×");
    x.addEventListener("click", function (ev) { stop(ev); closePanel(); });
    head.appendChild(h); head.appendChild(x);
    p.appendChild(head);
    document.body.appendChild(shade);
    document.body.appendChild(p);
    return p;
  }
  function section(p, title, cls) {
    var s = el("div", { cls: "sda-ctl-sec" });
    if (title) s.appendChild(el("h4", null, title));
    var g = el("div", { cls: "sda-ctl-grid" + (cls ? " " + cls : "") });
    s.appendChild(g);
    p.appendChild(s);
    return { s: s, g: g };
  }

  function render() {
    if (!panelOpen || !document.getElementById("sda-ctl-panel") || document.getElementById("sda-ctl-panel").getAttribute("data-kind") !== "menu") return;
    openMenu(true);
  }

  function openMenu(keepScroll) {
    syncConnState();
    var old = document.getElementById("sda-ctl-panel");
    var scroll = keepScroll && old ? old.scrollTop : 0;
    var plat = peerPlatform();
    var p = shell("Remote controls", peerName() + (plat ? " · " + plat : ""));
    p.setAttribute("data-kind", "menu");

    var a = section(p, "Keys and power");
    a.g.appendChild(btn("Ctrl + Alt + Del", "cad", actCad, { title: "Send Ctrl+Alt+Del (Windows sign-in / security screen)" }));
    a.g.appendChild(btn("Lock screen", "lock", actLock));
    a.g.appendChild(btn("Refresh screen", "refresh", actRefresh));
    a.g.appendChild(btn("Restart computer…", "restart", actRestart, { cls: "danger" }));

    var b = section(p, "Remote input");
    b.g.appendChild(btn(state.block ? "Unblock user input" : "Block user input", "block", actBlock, { pressed: state.block, title: "Stop the mouse and keyboard at the remote computer while you work" }));
    if (/windows/i.test(plat) || !plat) b.g.appendChild(btn(state.privacy ? "Privacy mode: on" : "Privacy mode: off", "privacy", actPrivacy, { pressed: state.privacy, title: "Hide the remote screen from people sitting at that computer" }));
    b.g.appendChild(btn("Type text / paste…", "type", actType, { title: "Type text, or text from your clipboard, into the remote computer" }));

    var c = conn(), pi = c && c._peerInfo;
    var displays = (pi && pi.displays) || [];
    if (displays.length > 1) {
      var d = section(p, "Monitor", displays.length > 3 ? "g4" : "g3");
      var cur = pi.current_display || 0;
      displays.forEach(function (dsp, i) {
        d.g.appendChild(btn("Monitor " + (i + 1), "display" + i, function () { actDisplay(i); pi.current_display = i; render(); }, { pressed: i === cur, title: dsp.width + "×" + dsp.height }));
      });
    }

    var v = section(p, "Screen size", "g3");
    v.g.appendChild(btn(isFull() ? "Exit full screen" : "Full screen", "fullscreen", actFullscreen, { pressed: isFull() }));
    var vs = window.sdaGetViewState ? window.sdaGetViewState() : null;
    if (isIpadUi() && vs) {
      v.g.appendChild(btn(vs.windowView ? "Restore view" : "Window view", "window", actWindow, { pressed: vs.windowView, title: vs.windowView ? "Show the remote screen full size again" : "Shrink the remote screen into a smaller window" }));
      v.g.appendChild(btn("Zoom in", "zoomin", function () { actZoom(1.25); }));
      v.g.appendChild(btn("Fit to screen", "fit", function () { actView("fit"); }, { pressed: vs.mode === "fit" && vs.scale <= 1.001 }));
      v.g.appendChild(btn("Original 100%", "original", function () { actView("original"); }, { pressed: vs.mode === "original" }));
      v.g.appendChild(btn("Stretch", "stretch", function () { actView("stretch"); }, { pressed: vs.mode === "stretch" }));
      v.g.appendChild(btn("Zoom out", "zoomout", function () { actZoom(0.8); }));
      v.s.appendChild(el("p", { cls: "sda-ctl-note" }, "Zoom: " + Math.round((vs.scale || 1) * 100) + "% of " + ({ fit: "fit", original: "original size", stretch: "stretch" })[vs.mode] + ". Pinch with two fingers to zoom, drag with two fingers to move around."));
    } else {
      v.s.appendChild(el("p", { cls: "sda-ctl-note" }, "Original / Shrink / Stretch: tap the arrow at the bottom right, then the screen icon. Leave full screen to get the normal browser window back."));
    }
    var pnl = document.getElementById("sda-ctl-panel");
    if (pnl && scroll) pnl.scrollTop = scroll;
  }

  function confirmBox(title, text, okLabel, onOk) {
    var p = shell(title);
    p.setAttribute("data-kind", "confirm");
    var d = el("div", { cls: "sda-ctl-dlg" });
    d.appendChild(el("p", null, text));
    var row = el("div", { cls: "sda-ctl-row" });
    row.appendChild(btn("Cancel", "cancel", function () { closePanel(); }));
    row.appendChild(btn(okLabel, "confirm", function () { closePanel(); onOk(); }, { cls: "red" }));
    d.appendChild(row);
    p.appendChild(d);
  }

  function textBox(onSend) {
    var p = shell("Type text on " + peerName());
    p.setAttribute("data-kind", "text");
    var d = el("div", { cls: "sda-ctl-dlg" });
    d.appendChild(el("p", null, "The text is typed into the window that is active on the remote computer."));
    var ta = el("textarea", { id: "sda-ctl-text", maxlength: "4000", autocapitalize: "off", autocomplete: "off", spellcheck: "false", placeholder: "Type or paste text here" });
    d.appendChild(ta);
    var row = el("div", { cls: "sda-ctl-row" });
    if (navigator.clipboard && navigator.clipboard.readText) {
      row.appendChild(btn("Paste my clipboard", "paste", function () {
        navigator.clipboard.readText().then(function (t) { ta.value = (t || "").slice(0, 4000); ta.focus(); })
          .catch(function () { toast("The browser did not allow reading the clipboard. Long-press the box and choose Paste."); ta.focus(); });
      }));
    }
    row.appendChild(btn("Cancel", "cancel", function () { closePanel(); }));
    row.appendChild(btn("Type it", "send", function () { var t = ta.value; closePanel(); onSend(t); }, { cls: "primary" }));
    d.appendChild(row);
    p.appendChild(d);
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 50);
  }

  function shieldPointer(node) {
    if (!node || node.__sdaShield) return;
    node.__sdaShield = true;
    POINTER_EVENTS.forEach(function (t) { node.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true }); });
  }
  function openFromButton(ev) { stop(ev); openMenu(false); }

  // iPad: buttons in the bottom session bar. Desktop browsers: a floating button.
  window.sdaExtendSessionTools = function (bar) {
    if (!bar || document.getElementById("sda-ctl-btn")) return;
    ensureStyle();
    var cad = el("button", { type: "button", id: "sda-cad-btn", "aria-label": "Send Ctrl+Alt+Del" }, "Ctrl+Alt+Del");
    cad.addEventListener("click", function (ev) { stop(ev); actCad(); });
    var b = el("button", { type: "button", id: "sda-ctl-btn", "aria-label": "Remote controls" }, "☰ Controls");
    b.addEventListener("click", openFromButton);
    bar.insertBefore(b, bar.firstChild);
    shieldPointer(bar);
    var fit = document.getElementById("sda-fit-btn");
    if (fit && fit.nextSibling) bar.insertBefore(cad, fit.nextSibling); else bar.appendChild(cad);
  };

  // Mouse moves made over our own buttons/menu (desktop browsers hover) must
  // not move or click the remote mouse; the page-level Flutter listener sees
  // them too, so drop those at the bridge.
  var OUR_UI = "#sda-ctl-panel,#sda-ctl-shade,#sda-ctl-fab,#sda-session-tools,#sda-ctl-toast";
  var lastPtrOurs = false;
  ["pointermove", "pointerdown", "pointerup", "pointerover", "pointerout", "pointerenter", "pointerleave", "mousemove", "mousedown", "mouseup", "mouseover", "mouseout", "touchstart", "touchend"].forEach(function (t) {
    window.addEventListener(t, function (ev) {
      try { lastPtrOurs = !!(ev.target && ev.target.closest && ev.target.closest(OUR_UI)); } catch (e) { lastPtrOurs = false; }
    }, true);
  });
  function hoverOurs() {
    try {
      var h = document.querySelectorAll(":hover");
      var last = h.length ? h[h.length - 1] : null;
      return !!(last && last.closest && last.closest(OUR_UI));
    } catch (e) { return false; }
  }
  function wrapBridge() {
    var orig = window.setByName;
    if (!orig || orig.__sdaCtl || orig.__sdaStub) return;
    var w = function (name, value) {
      if (name === "send_mouse" && (lastPtrOurs || panelOpen || hoverOurs()) && !/"type":\s*"up"/.test(String(value))) { stats.droppedMouse = (stats.droppedMouse || 0) + 1; return; }
      return orig.apply(this, arguments);
    };
    w.__sdaCtl = true;
    if (orig.__sdaStab) w.__sdaStab = true;
    if (orig.__sdaStatus) w.__sdaStatus = true;
    window.setByName = w;
  }

  function tick() {
    try { wrapBridge(); } catch (eW) {}
    try {
      var live = inSession();
      var bar = document.getElementById("sda-session-tools");
      if (bar) window.sdaExtendSessionTools(bar);
      var fab = document.getElementById("sda-ctl-fab");
      var wantFab = live && !bar && !isIpadUi();
      if (wantFab && !fab && document.body) {
        ensureStyle();
        fab = el("button", { type: "button", id: "sda-ctl-fab", "aria-label": "Remote controls" }, "☰ Controls");
        fab.addEventListener("click", openFromButton);
        shieldPointer(fab);
        document.body.appendChild(fab);
      } else if (!wantFab && fab && fab.parentNode) fab.parentNode.removeChild(fab);
      if (!live && panelOpen) closePanel();
    } catch (e) {}
  }
  setInterval(tick, 500);
  document.addEventListener("fullscreenchange", function () { setTimeout(render, 100); });
  document.addEventListener("webkitfullscreenchange", function () { setTimeout(render, 100); });
  window.sdaOpenControls = function () { openMenu(false); };
