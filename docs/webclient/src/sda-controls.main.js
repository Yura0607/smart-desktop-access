  // ---------------------------------------------------------------------------
  // SDA Controls: the session actions of the desktop app's toolbar for the web
  // client (Ctrl+Alt+Del, lock, restart, block input, privacy mode, monitors,
  // refresh, type text) plus full-screen and view-size controls.
  // Uses the existing bridge (window.setByName / window.curConn). Messages the
  // bundled web encoder does not know (restart) are encoded here and sent
  // through the session's own encrypted channel, with the same nonce counter.
  // ---------------------------------------------------------------------------
  var VER = "20261115-ctl2";
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
    "#sda-ctl-dbar #sda-ctl-fab{background:linear-gradient(135deg,#6d28d9,#2563eb);}",
    "#sda-ctl-btn{background:linear-gradient(135deg,#6d28d9,#2563eb)!important;color:#fff!important;}",
    "#sda-add-btn,#sda-sess-btn{background:#4338ca!important;color:#fff!important;} #sda-disc-btn{background:#fff!important;color:#be123c!important;}",
    "#sda-ctl-dbar{position:fixed;left:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:2147483100;display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100vw - 260px);}",
    "#sda-ctl-dbar button{height:40px;padding:0 16px;border:0;border-radius:20px;background:#4338ca;color:#fff;font:650 14px/40px system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 2px 10px rgba(30,27,75,.35);cursor:pointer;-webkit-tap-highlight-color:transparent;}",
    "#sda-ctl-dbar #sda-disc-btn2{background:#fff;color:#be123c;}",
    ".sda-ctl-pc{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:0 0 8px;border-radius:12px;background:#eef2ff;border:1px solid #c7d2fe;color:#1e1b4b;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
    ".sda-ctl-pc.off{opacity:.6;cursor:default;} .sda-ctl-pc:not(.off):active{background:#ddd6fe;}",
    ".sda-ctl-dot{width:14px;height:14px;border-radius:50%;flex:0 0 14px;} .sda-ctl-pctext{display:flex;flex-direction:column;min-width:0;flex:1;} .sda-ctl-pctext b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .sda-ctl-pctext small{color:#64748b;font-size:12px;}",
    ".sda-ctl-b.small{min-height:36px;min-width:0;padding:6px 12px;}",
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

    var ss = section(p, "Session", "g3");
    ss.g.appendChild(btn("+ Add computer", "add", actAddComputer, { cls: "primary", title: "Open another computer in a new tab; this one stays open" }));
    var nOpen = openSessions().length;
    ss.g.appendChild(btn("⇄ Sessions (" + nOpen + ")", "sessions", actSessions, { title: "Computers open in this browser" }));
    ss.g.appendChild(btn("Disconnect", "disconnect", actDisconnect, { cls: "danger" }));

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

  function confirmBox(title, text, okLabel, onOk, okCls) {
    var p = shell(title);
    p.setAttribute("data-kind", "confirm");
    var d = el("div", { cls: "sda-ctl-dlg" });
    d.appendChild(el("p", null, text));
    var row = el("div", { cls: "sda-ctl-row" });
    row.appendChild(btn("Cancel", "cancel", function () { closePanel(); }));
    row.appendChild(btn(okLabel, "confirm", function () { closePanel(); onOk(); }, { cls: okCls || "red" }));
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

  // --- open sessions across tabs (same browser) -------------------------------
  var TAB_UID = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var REG_KEY = "sda-open-sessions";
  var REG_TTL = 90000;
  function readReg() {
    var r = {};
    try { r = JSON.parse(localStorage.getItem(REG_KEY) || "{}") || {}; } catch (e) { r = {}; }
    var now = Date.now(), out = {};
    Object.keys(r).forEach(function (k) { var v = r[k]; if (v && v.id && now - (v.ts || 0) < REG_TTL) out[k] = v; });
    return out;
  }
  function writeReg(r) { try { localStorage.setItem(REG_KEY, JSON.stringify(r)); } catch (e) {} }
  function curId() { var c = conn(); return c && !c._userClosed && c._id ? String(c._id) : ""; }
  function heartbeat() {
    var r = readReg(), id = curId();
    if (id) r[TAB_UID] = { id: id, name: peerName(), ts: Date.now() };
    else delete r[TAB_UID];
    writeReg(r);
  }
  function dropSelf() { var r = readReg(); delete r[TAB_UID]; writeReg(r); }
  window.addEventListener("pagehide", dropSelf);
  window.addEventListener("beforeunload", dropSelf);
  function openSessions() {
    var r = readReg(), list = [];
    Object.keys(r).forEach(function (k) { list.push({ tab: k, id: r[k].id, name: r[k].name, mine: k === TAB_UID }); });
    var id = curId();
    if (id && !r[TAB_UID]) list.push({ tab: TAB_UID, id: id, name: peerName(), mine: true });
    list.sort(function (a, b) { return a.mine ? -1 : b.mine ? 1 : String(a.name).localeCompare(String(b.name)); });
    return list;
  }
  window.sdaOpenSessions = openSessions;
  var bc = null;
  try { bc = new BroadcastChannel("sda-tabs"); } catch (e) { bc = null; }
  function onTabMsg(m) {
    if (!m || m.to !== TAB_UID || m.type !== "focus") return;
    try { window.focus(); } catch (e) {}
    flashTitle();
  }
  if (bc) bc.onmessage = function (ev) { onTabMsg(ev.data); };
  window.addEventListener("storage", function (ev) {
    if (ev.key === "sda-tab-msg" && ev.newValue) { try { onTabMsg(JSON.parse(ev.newValue)); } catch (e) {} }
    if (ev.key === REG_KEY) updateBars();
  });
  function askFocus(tab) {
    var m = { to: tab, type: "focus", t: Date.now() };
    try { if (bc) bc.postMessage(m); } catch (e) {}
    try { localStorage.setItem("sda-tab-msg", JSON.stringify(m)); } catch (e2) {}
  }
  var baseTitle = null, flashT = null;
  function wantTitle() { return "SDA · " + peerName(); }
  function updateTitle() {
    if (curId() && inSession()) {
      if (baseTitle === null) baseTitle = document.title;
      if (!flashT && document.title !== wantTitle()) document.title = wantTitle();
    } else if (baseTitle !== null) { document.title = baseTitle; baseTitle = null; }
  }
  function flashTitle() {
    var n = 0;
    clearInterval(flashT);
    flashT = setInterval(function () {
      document.title = (n % 2 ? "" : "▶ ") + wantTitle();
      if (++n > 8) { clearInterval(flashT); flashT = null; updateTitle(); }
    }, 600);
  }

  // --- new tab opened from "+ Computer": connect once, like a list tap --------
  // The link is /webclient/#/?id=<ID>. The bundle's own ?id= auto-connect waits
  // for a Flutter callback that the home page never registers, so do the same
  // thing the computer list does (setByName("connect")), once, when ready.
  var LOAD_T = Date.now();
  var pendingOpen = null;
  try {
    var hm = (location.hash || "").match(/[?&]id=([^&]+)/);
    if (hm) {
      var hid = decodeURIComponent(hm[1]).trim();
      if (/^[A-Za-z0-9_-]{3,32}$/.test(hid)) pendingOpen = hid;
    }
  } catch (eH) {}
  function maybeOpenPending() {
    if (!pendingOpen) return;
    if (conn() || window.__sdaAutoConnectDone) { pendingOpen = null; return; }
    if (!bridgeReady() || Date.now() - LOAD_T < 1500) return;
    if (!document.querySelector("flt-glass-pane") && !document.querySelector("flutter-view")) return;
    if (!token()) { if (Date.now() - LOAD_T > 30000) pendingOpen = null; return; }
    if (!window.__sdaServerConfDone && Date.now() - LOAD_T < 10000) return;
    var id = pendingOpen;
    pendingOpen = null;
    window.__sdaAutoConnectDone = true;
    try {
      if (typeof window.sdaOpenComputer === "function") window.sdaOpenComputer(id);
      else window.setByName("connect", id);
      log("auto_open", id);
    } catch (e) {}
  }

  // --- disconnect -------------------------------------------------------------
  function doDisconnect() {
    closePanel();
    dropSelf();
    try { if (bridgeReady()) window.setByName("close", ""); log("close", ""); } catch (e) {}
    // Back to a clean computer list in this tab (no auto-connect id in the URL).
    setTimeout(function () {
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      try { location.reload(); } catch (e2) {}
    }, 250);
  }
  function actDisconnect() {
    confirmBox("Disconnect from " + peerName() + "?",
      "Only this connection is closed. Nothing changes on the remote computer.",
      "Disconnect", doDisconnect, "primary");
  }

  // --- add another computer (new tab) -----------------------------------------
  function token() { try { return localStorage.getItem("access_token") || ""; } catch (e) { return ""; } }
  function cleanName(n) { return String(n || "").replace(/\s*@(Online|Offline)\s*$/i, "").trim(); }
  function devName(d) { return cleanName(d.alias || d.hostname || d.id) || String(d.id); }
  function fetchDevices(cb) {
    var cached = [];
    try { cached = (window.sdaPeerStatus && window.sdaPeerStatus().devices) || []; } catch (e) {}
    var tok = token();
    if (!tok) { cb(cached, false); return; }
    fetch("/companion/api/v1/web-status", { method: "GET", headers: { Authorization: "Bearer " + tok }, credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
      .then(function (data) {
        var list = ((data && data.devices) || []).map(function (row) {
          return { id: String(row.id || "").trim(), alias: cleanName(row.alias), hostname: cleanName(row.hostname), online: !!row.online };
        }).filter(function (d) { return !!d.id; });
        list.sort(function (a, b) { if (a.online !== b.online) return a.online ? -1 : 1; return devName(a).toLowerCase().localeCompare(devName(b).toLowerCase()); });
        cb(list.length ? list : cached, true);
      })
      .catch(function () { cb(cached, false); });
  }
  function sessionUrl(id) { return location.pathname + "#/?id=" + encodeURIComponent(id); }
  function actAddComputer() {
    var p = shell("Open another computer", "It opens in a new tab. This session stays open.");
    p.setAttribute("data-kind", "picker");
    var box = el("div", { cls: "sda-ctl-dlg" });
    var listEl = el("div", { id: "sda-ctl-pick" });
    listEl.appendChild(el("p", { cls: "sda-ctl-note" }, "Loading computers…"));
    box.appendChild(listEl);
    p.appendChild(box);
    fetchDevices(function (devs, fresh) {
      if (!document.getElementById("sda-ctl-pick")) return;
      listEl.innerHTML = "";
      var open = {};
      openSessions().forEach(function (s) { open[s.id] = s; });
      var mine = curId();
      var online = devs.filter(function (d) { return d.online; }).length;
      listEl.appendChild(el("p", { cls: "sda-ctl-note" }, devs.length ? (devs.length + " computers, " + online + " online. Tap one to open it in a new tab.") : "No computers in your list."));
      devs.forEach(function (d) {
        var isMine = d.id === mine, other = open[d.id] && !open[d.id].mine;
        var canOpen = d.online && !isMine && !other;
        var row = el(canOpen ? "a" : "div", { cls: "sda-ctl-pc" + (canOpen ? "" : " off"), "data-id": d.id });
        if (canOpen) { row.setAttribute("href", sessionUrl(d.id)); row.setAttribute("target", "_blank"); row.setAttribute("rel", "noopener"); }
        var dot = el("span", { cls: "sda-ctl-dot" }); dot.style.background = d.online ? "#16a34a" : "#9ca3af";
        var tx = el("span", { cls: "sda-ctl-pctext" });
        tx.appendChild(el("b", null, devName(d)));
        tx.appendChild(el("small", null, d.id + " · " + (isMine ? "open in this tab" : other ? "already open in another tab" : d.online ? "Online" : "Offline")));
        row.appendChild(dot); row.appendChild(tx);
        if (canOpen) {
          row.addEventListener("click", function (ev) {
            ev.stopPropagation();
            log("open_tab", d.id);
            toast("Opening " + devName(d) + " in a new tab…");
            setTimeout(closePanel, 300);
          });
        } else if (other) {
          var go = btn("Switch", "goto-" + d.id, function () { switchTo(open[d.id]); });
          go.className += " small";
          row.appendChild(go);
        }
        listEl.appendChild(row);
      });
      if (!fresh && !token()) listEl.appendChild(el("p", { cls: "sda-ctl-note" }, "Sign in on the computer list to see online status."));
    });
  }
  window.sdaAddComputer = actAddComputer;

  function switchTo(s) {
    if (!s || s.mine) { closePanel(); return; }
    askFocus(s.tab);
    closePanel();
    toast("If the browser does not switch by itself, open the tab named “SDA · " + s.name + "”.");
  }
  function actSessions() {
    var list = openSessions();
    var p = shell("Open sessions", list.length + " computer" + (list.length === 1 ? "" : "s") + " open in this browser");
    p.setAttribute("data-kind", "sessions");
    var sec = section(p, null);
    sec.g.style.gridTemplateColumns = "1fr";
    list.forEach(function (s) {
      sec.g.appendChild(btn((s.mine ? "● " : "") + s.name + " (" + s.id + ")" + (s.mine ? " · this tab" : ""), "sess-" + s.id, function () { switchTo(s); }, { pressed: s.mine }));
    });
    var add = section(p, null);
    add.g.style.gridTemplateColumns = "1fr";
    add.g.appendChild(btn("+ Open another computer", "add", actAddComputer, { cls: "primary" }));
  }
  window.sdaShowSessions = actSessions;

  // --- quick buttons ------------------------------------------------------------
  function quick(id, label, aria, fn) {
    var b = el("button", { type: "button", id: id, "aria-label": aria, title: aria }, label);
    b.addEventListener("click", function (ev) { stop(ev); fn(); });
    return b;
  }
  function updateBars() {
    var n = openSessions().length;
    ["sda-sess-btn", "sda-sess-btn2"].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      b.textContent = "⇄ " + n + " open";
      b.style.display = n > 1 ? "" : "none";
    });
  }
  // iPad: buttons in the bottom session bar.
  window.sdaExtendSessionTools = function (bar) {
    if (!bar || document.getElementById("sda-ctl-btn")) return;
    ensureStyle();
    var cad = quick("sda-cad-btn", "Ctrl+Alt+Del", "Send Ctrl+Alt+Del", actCad);
    var b = quick("sda-ctl-btn", "☰ Controls", "Remote controls", function () { openMenu(false); });
    bar.insertBefore(b, bar.firstChild);
    shieldPointer(bar);
    var fit = document.getElementById("sda-fit-btn");
    if (fit && fit.nextSibling) bar.insertBefore(cad, fit.nextSibling); else bar.appendChild(cad);
    bar.appendChild(quick("sda-add-btn", "+ Computer", "Open another computer in a new tab", actAddComputer));
    bar.appendChild(quick("sda-sess-btn", "⇄", "Open sessions", actSessions));
    bar.appendChild(quick("sda-disc-btn", "Disconnect", "Disconnect from this computer", actDisconnect));
    updateBars();
  };
  // Desktop browsers: a floating bar at the top left.
  function ensureDesktopBar(want) {
    var bar = document.getElementById("sda-ctl-dbar");
    if (!want) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    if (bar || !document.body) return;
    ensureStyle();
    bar = el("div", { id: "sda-ctl-dbar" });
    var fab = quick("sda-ctl-fab", "☰ Controls", "Remote controls", function () { openMenu(false); });
    bar.appendChild(fab);
    bar.appendChild(quick("sda-add-btn2", "+ Computer", "Open another computer in a new tab", actAddComputer));
    bar.appendChild(quick("sda-sess-btn2", "⇄", "Open sessions", actSessions));
    bar.appendChild(quick("sda-disc-btn2", "Disconnect", "Disconnect from this computer", actDisconnect));
    shieldPointer(bar);
    document.body.appendChild(bar);
    updateBars();
  }

  // Mouse moves made over our own buttons/menu (desktop browsers hover) must
  // not move or click the remote mouse; the page-level Flutter listener sees
  // them too, so drop those at the bridge.
  var OUR_UI = "#sda-ctl-panel,#sda-ctl-shade,#sda-ctl-dbar,#sda-session-tools,#sda-ctl-toast";
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

  var lastHb = 0;
  function tick() {
    try { wrapBridge(); } catch (eW) {}
    try {
      var live = inSession();
      var bar = document.getElementById("sda-session-tools");
      if (bar) window.sdaExtendSessionTools(bar);
      ensureDesktopBar(live && !bar && !isIpadUi());
      if (!live && panelOpen) closePanel();
      maybeOpenPending();
      if (Date.now() - lastHb > 3000) { lastHb = Date.now(); heartbeat(); updateBars(); }
      updateTitle();
    } catch (e) {}
  }
  setInterval(tick, 500);
  document.addEventListener("fullscreenchange", function () { setTimeout(render, 100); });
  document.addEventListener("webkitfullscreenchange", function () { setTimeout(render, 100); });
  window.sdaOpenControls = function () { openMenu(false); };
