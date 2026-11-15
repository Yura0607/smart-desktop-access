# Web admin and web client (full control)

Requirement: the web client gives full remote control of a customer's computer from any browser (iPad, iPhone, Android phones, Mac, Windows): live screen, mouse, keyboard, scrolling, and everything the native admin app can do. It is not view-only. The native Smart Desktop Access Admin app stays as it is.

## What works now

Use the rustdesk-api web client (full control, not the companion placeholder):

- Web client: `https://smartdesktopaccess.duckdns.org/webclient/`
- Account admin: `https://smartdesktopaccess.duckdns.org/_admin/`
- Companion device list: `https://smartdesktopaccess.duckdns.org/companion/`
- Companion view page: `https://smartdesktopaccess.duckdns.org/companion/view` (still a placeholder; do not use this for control)

Sign in as the same account used on the admin site (`yuriy`). After login, `/webclient/` lists every computer that has the SDA client installed (the companion's registered devices). Each card shows the ID, the owner's Rename alias (or the hostname if none is set), and Online/Offline. Click a card to put its ID in the Remote ID field; on a phone, tap the card to connect, and on a desktop double-click the card or click the arrow. You should not have to type IDs or the device password.

The device's permanent password is copied into rustdesk-api's address book and applied automatically when the session starts (the web client hashes it with the live salt and challenge). Incoming-only SDA clients use `approve-mode: password-click`: that saved password is enough, or someone at the computer can click Accept.

The stock page may still show third-party branding until the web-client look is updated. No native admin app or incoming-client rebuild is required for this path.

## WebSocket routing (wss through 443)

Browsers will not use a plain `ws://` connection from the HTTPS page. nginx on `smartdesktopaccess.duckdns.org` terminates TLS and proxies the RustDesk WebSockets:

| Browser URL | Upstream |
| --- | --- |
| `wss://smartdesktopaccess.duckdns.org/ws/id` | `http://127.0.0.1:21118` (hbbs) |
| `wss://smartdesktopaccess.duckdns.org/ws/relay` | `http://127.0.0.1:21119` (hbbr) |

Both locations send `Upgrade` / `Connection` headers and use a 3600s read/send timeout. rustdesk-api `conf/config.yaml` sets:

```yaml
rustdesk:
  id-server: "smartdesktopaccess.duckdns.org:21116"
  relay-server: "smartdesktopaccess.duckdns.org:21117"
  api-server: "https://smartdesktopaccess.duckdns.org"
  ws-host: "wss://smartdesktopaccess.duckdns.org"
```

The bundled `/webclient/` then connects to `/ws/id` and `/ws/relay` instead of dialing ports 21118 and 21119 directly.

TCP 21118 and 21119 are also allowed in the VM iptables (`/etc/iptables/rules.v4`) as a fallback. Direct access from the public internet still times out unless the Oracle Cloud security list allows those ports. The 443 proxy does not need a new cloud firewall hole.

Login protection is unchanged: `captcha-threshold: -1`, the fail2ban `sda-login` jail, and the nginx `limit_req` zone on `/api/login` and `/api/admin/login`.


## Device list and saved passwords

Companion-registered devices are copied into rustdesk-api's address book for user `yuriy` so `/webclient/` and `/_admin/` can show them.

- Script: `/opt/sda-companion/sync_web_peers.py`
- Timer: `sda-sync-web-peers.timer` (`OnBootSec=30s`, `OnUnitActiveSec=2min`, `AccuracySec=15s`)
- Oneshot service: `sda-sync-web-peers.service` runs `/usr/bin/python3 /opt/sda-companion/sync_web_peers.py`

Each run reads the companion device list in place (the companion token from `/etc/sda-companion.env` or `/var/lib/sda-companion/admin-token`; the script never prints tokens or passwords), then upserts rows in `/opt/rustdesk-api/data/rustdeskapi.db` for `user_id` of `yuriy` and `collection_id` 0 (the personal book used by `/api/server-config`). It does not write into other collections. Every non-deactivated companion device is copied; there is no filter on online or recent activity. The display name is the companion alias if set, otherwise the hostname. The address-book `online` column follows the companion last-check-in flag. Hostname is no longer set to `Online` / `Offline`, so Flutter cards do not show a `Name@Offline` suffix. The address-book `hash` column is base64 of the device's permanent password.

The web client defaults to the Address Book tab (`peer-tab-index` 3, not Recent). `/companion/api/v1/web-status` (same login as web rename: the signed-in rustdesk-api user `yuriy` or `admin`) returns `{id, alias, hostname, platform, online}` for every active companion device and never includes passwords or device tokens. `sda-status.js` paints that full list with a green circle when the companion says online and a grey circle when it says offline, strips any leftover `@Online` / `@Offline` text, and refreshes every 20 seconds while the list is visible. It also answers Flutter’s `query_onlines` hook with `callback_query_onlines` so the built-in dots stay in sync. The list overlay is hidden during a remote session so fullscreen, the live canvas, and Rename keep working.

Tap a computer to connect in the same tab (`setByName('connect')`). Do not auto-open windows: an earlier `window.open('/webclient/#/?id=<id>')` on a list tap made iPad Safari navigate the current tab and reload-loop `GET /webclient/` without ever reaching `/ws/id`.

To watch two computers at once in the browser, open a second tab yourself and tap another computer there. On a Mac or desktop browser, a “+ New tab” button (shown on the list and during a session) does a single `window.open('/webclient/', '_blank')` with no computer id and no retries, so the new tab only shows the list. That button is hidden on iPad, because Safari may navigate the same tab instead of opening another; on iPad use Safari’s own new-tab control, or keep the home-screen app open and open a Safari tab as well.

Each tab has its own `curConn`, WebSocket, and `sessionStorage` (`sda-connect-id`, `sda-connect-plainpwd`, `sda-resume-*`, `sda-tab-session-id`, `sda-remote-id`). Shared `localStorage` keeps the signed-in rustdesk-api token, rendezvous key, and address-book `peers` so both tabs can log in. `getByName('remote_id')` prefers this tab’s `sessionStorage`, so tab B writing `remote-id` into `localStorage` does not change tab A’s remote id. Leftover copies of those session keys are removed from `localStorage` on load. There is no `BroadcastChannel` and no `storage` listener that would close or reconnect the other tab. `getServerConf` still skips `location.reload()` and skips the fetch while that tab’s `window.curConn` is live. On Safari the Flutter service worker is unregistered, so it cannot bounce one tab when the other connects.

The native manager app is unchanged: stock RustDesk desktop already opens further connections with `newRemoteDesktop` / `ConnectionTabPage` and the “Open in New Tab” (`kOptionOpenInTabs`) or “Open in new window” (`kOptionOpenInWindows`) options.

Removed or deactivated companion devices are deleted from that managed set (rows tagged `["sda-companion"]`). New installs still appear in the address-book database on the two-minute sync timer (or immediately after a web rename). Online/offline dots do not wait for that timer; they follow `/api/v1/web-status`. A rename made in `/webclient/` or in the companion admin is written to the companion first and then synced into the address book immediately, so the web list updates on the next page load rather than after the timer.

`/api/server-config` then returns those peers to the bundled web client. A small patch in rustdesk-api's web JS (`resources/web/js/src/ljw.js`, `connection.ts`, and `resources/web/js/dist/index.js`) stores the decoded hash as `plainpwd` and, when the remote sends its salt, calls `login(plainpwd)` so the password is hashed with the live salt and challenge. Putting the raw password bytes in the remembered `password` field skips the salt step and the remote answers "Wrong Password".

That same JS must not reload the page just because a successful login wrote a remembered `password` back into the peer. Doing so tore down the relay after "Connected, waiting for image..." (the Flutter splash came back and the list returned, with `WebSock.onclose` and a leftover `VideoFrame` warning). `getServerConf` now updates `plainpwd` in place, skips the fetch while a session (`window.curConn`) is live, and never calls `location.reload()` during an active or just-started connection.

Companion "Connect in browser" opens `/webclient/#/?id=<id>` (and may set `sessionStorage` `sda-connect-id` / `sda-connect-plainpwd` or `postMessage` `{source:'sda-companion', type:'sda-connect'}`). Flutter rewrites the hash to `#/`, so the client also copies the id into `sessionStorage` and calls `setByName('connect', id)` after the address book has been applied.

Safari / iPadOS often reports WASM SIMD but the SIMD VP9 decoder does not produce frames, so the loader uses the non-SIMD `OGVDecoderVideoVP9W` build and disables `threading` (it needs `SharedArrayBuffer`). iPad (including desktop-mode Macintosh UAs with `maxTouchPoints > 1`) also runs that decoder on the main thread; a real Mac keeps the worker. Frames that arrive before the decoder is ready are ignored instead of throwing.

Once the first video frame arrives, the client sends a single Shift key (not Enter, and not any password or PIN) so a locked Windows PC drops the lock-screen clock and shows the sign-in field. On iPad the session toolbar includes the on-screen keyboard; Ctrl+Alt+Del is in the overflow menu (`Insert Ctrl + Alt + Del`) and calls the existing `ctrl_alt_del` handler.

The old `/webclient2/` path (removed upstream) is served from `/var/www/sda-webclient2/index.html` so `/_admin/` "Web Client" links of the form `/webclient2/#/<id>` redirect to `/webclient/#/?id=<id>`.

## iPad Safari vs Mac Safari

A real iPad on iPadOS 13+ often reports itself as Macintosh desktop Safari (`Intel Mac OS X 10_15_7`, Version/27.2) when Request Desktop Website is on. Detect iPad with any of: an `iPad`/`iPhone`/`iPod` UA; a Macintosh UA that also contains `Mobile`; `navigator.platform` of `MacIntel` or `iPad` with `maxTouchPoints > 1`; or a Macintosh UA with `maxTouchPoints > 1`.

On iPad, iPhone, and Android, VP9 decoding runs on the main thread (`worker: false`) and skips the SIMD wasm (`OGVDecoderVideoVP9W`). Safari on a real Mac (`Macintosh` and `maxTouchPoints <= 1`) is left on `worker: true` with the non-SIMD decoder — that path already worked and must not be changed.

`/webclient/js/dist/` is served with `expires -1` and `Cache-Control: no-cache` so a stale `index.js` does not keep an old decoder. `index.html` is also no-cache and loads `js/dist/index.js` with a cache-busting query. Safari unregisters the Flutter service worker so it cannot pin old wasm/JS.

If an iPad still shows a black screen after an update, close every `smartdesktopaccess.duckdns.org` tab, then on the iPad go to Settings → Safari → Advanced → Website Data, search for `smartdesktopaccess.duckdns.org`, and remove it. Reopen `/webclient/` (a new tab, not a frozen one). Clearing all Safari history is not required.

## Mid-session reloads (iPad “the connection drops”)

When the relay closes at the same second as a fresh `GET /webclient/` (only `index.html`, not `main.dart.js`), the tab itself reloaded. A search of the live client found no `location.reload` / `location.href =` during a session:

- `getServerConf` no longer reloads the page (that older bug tore down “Connected, waiting for image”).
- Safari’s service-worker unregister does not reload.
- Flutter’s `main.dart.js` only *reads* `location` for routing; it does not reload.
- The rename overlay called `location.reload()` after Save. That button is hidden during a session, and Save now skips the reload if `window.curConn` is set.

The remaining explanation is iPadOS Safari killing or crashing the WebContent process (memory / jetsam) while main-thread VP9 wasm and Flutter are both running, then auto-reloading the tab. Rapid `/webclient/` hits a few seconds apart match that pattern.

To lower memory on iPad only (Mac is unchanged):

- Login requests `image-quality: low` so the remote sends smaller frames.
- Decoded frames are painted at most about 10 FPS (`sdaShouldSkipDraw`); every VP9 packet is still decoded so the stream stays valid.
- The branding `MutationObserver` is debounced and disconnects after 15 seconds so it does not walk the whole DOM on every Flutter paint.

Forcing Flutter’s HTML renderer on iPad was tried and not kept: it did not improve the session in WebKit, and Flutter already auto-selects HTML on mobile/iPad (`flt-renderer="html (auto-selected)"`). CanvasKit is left alone on a real Mac.

If the relay drops while the page is still up, the client silently reconnects to the same ID up to 3 times (not after the user taps close, and not before the first frame / peer info). Auto-resume after a full tab reload is disabled: that path called `setByName('connect')` before Flutter finished starting and left a white screen. After an unexpected reload the user sees the computer list again (a clean list is better than a blank page). In-page reconnect does not reload the tab.

## White screen after reload (iPad)

Yuriy’s real iPad (05:10–05:16 UTC, 10 Nov 2026) loaded `/webclient/` three times in four seconds, each with `jserror` `NoSuchMethodError: method not found: 'apply' on null` before any connect. A later session (`310906599`) showed video (`ff=1`), then `jserror` `Instance of minified:az` at 05:16:03 and 05:16:13 (throttled), then at 05:16:17 a full `GET /webclient/` 200 with `pagehide pers=0` and `visibility=hidden` tore down the relay. The following load logged `resume n=1`, the same `apply` on null, `pageshow`, and nothing more — a white screen.

Causes:

1. Flutter’s bootstrap (`aHo`) calls `window.isMobile()`, `window.init()`, and `window.getByName('version')` through JS-interop `obj[name].apply(obj, args)` (`A.lW.af` / `Hs`). `loadMainDartJs()` runs immediately, but `js/dist/index.js` is `type=module` (deferred), so those functions were often still `null` → `NoSuchMethodError: method not found: 'apply' on null`. After that throw Flutter never painted.

2. There is no `location.reload` / `location.href =` / `location.replace` / `history.go` / `window.open` in the live session JS (rename’s reload still runs only after Save when `window.curConn` is unset). `main.dart.js` only *reads* `location` for routing. The jserror handler only sends a breadcrumb; it does not navigate. `pagehide pers=0` plus a new document GET means the document unloaded while JS could still beacon — a real navigation or a WebKit-initiated recovery reload (not a hard crash, which would not send `pagehide`).

3. `Instance of minified:az` is Dart’s default `toString` for class `az`. In this build `A.az` is the `dart:html` Event interceptor (`gY4` → `event.target`). During a session the RGBA path is JS `onRgba(pixels)` → `A.ahJ` → `A.adQ` → `decodeImageFromPixels` (`A.aQF` / `$.ah().UB`). On the HTML renderer (iPad’s auto-selected renderer) that builds a BMP (`A.b6h`: `122 + width*height*4` bytes and a JS pixel copy) every frame, then decodes it (`mX`). A decode/image failure surfaces as a DOM Event, which stringifies as `Instance of minified:az`. Widget `update image` errors are already caught inside Flutter (`A.adP`). A flood of those exceptions plus the large per-frame BMP churn matches Safari then unloading the tab.

Fixes (Mac unchanged: VP9 worker stays on, HTML-renderer is not forced):

- `index.html` installs stubs for `window.isMobile`, `window.init`, `window.getByName`, and `window.setByName` *before* `main.dart.js` loads. Early `init` calls are queued and flushed when the real module arrives (`window.__sdaRealInit`).
- RGBA and `onGlobalEvent` callbacks are wrapped (`sdaSafeOnRgba`, `sdaSafeGlobalEvent`) so a Dart/JS exception cannot become an uncaught page error.
- Companion one-click auto-connect waits until Flutter has registered `onGlobalEvent` *and* `flt-glass-pane` / `flutter-view` exist; it will not call a stub `setByName`. If auto-connect throws, it clears `sda-connect-id` and leaves the list.
- Auto-resume-after-reload is off (`resume-skip` breadcrumb). Leftover `sda-resume-active` / resume `sda-connect-id` are cleared on load.
- If Flutter never paints a view (8s, checked again at 14s), a purple fallback offers **Show my computers** instead of a blank page. That button is the only remaining navigation, and only after a tap.
- On iPad, iPhone, and Android (the same `sdaIsIpad` check, which now includes `/Android/` as well as iPhone/iPod), live frames are drawn with `drawImage` onto a reused `<canvas id="sda-live-canvas">` placed in a black full-viewport wrapper. The canvas is sized with *contain* (fit-to-window, aspect ratio kept, no cropping) and re-positioned on `resize`, `orientationchange`, and `visualViewport` changes so it stays letterboxed in the center. Because Flutter’s mobile renderer would otherwise use a cover scale (and crop), the overlay captures pointer events and maps them to remote desktop coordinates from its own rect, so taps land on what you see. Flutter still gets `onRgba` on the first frame and on a size change (to dismiss “waiting for image”); later frames skip `onRgba` to avoid the HTML renderer’s per-frame BMP. Connecting also sets the peer `view-style` to `shrink` (RustDesk’s scale-to-fit / not “original”) so Mac/desktop CanvasKit letterboxes the same way, and requests element fullscreen from that tap (`requestFullscreen` / `webkitRequestFullscreen`). iPad Safari often requires a user gesture and may still refuse fullscreen in the browser tab; `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `viewport-fit=cover`, and the web app manifest `display: fullscreen` (with `standalone` fallback) make Add to Home Screen the reliable way to hide Safari chrome. Flutter’s engine rewrites the viewport meta after it boots; `sda-stability.js` puts `viewport-fit=cover` back so safe-area cover survives that rewrite. This client has no `change_resolution` API, so the remote’s display size is left unchanged.

Breadcrumbs: `GET`/`POST /webclient/sda-log?e=...` (204, logged by nginx). Events include `load`, `connect`, `beat` (every 30s while a frame is flowing), `pagehide`, `pageshow`, `visibility`, `jserror`, `unhandled`, `reconnect`, `resume-skip`, `rgba-err`, `cb-err`, `white-fallback`, `overlay`, `fullscreen`, and `userclose`. Query fields are `e`, `id`, `ff`, `conn`, `ipad`, `rndr`, `vis`, `pers`, `n`, `why`, `mem` (Chrome only), `t`. No tokens or passwords. `jserror`, `unhandled`, `rgba-err`, and `cb-err` are logged at most once every 10 seconds per message so a noisy Flutter exception cannot flood the log.

If an iPad still shows a white screen after this update, close every `smartdesktopaccess.duckdns.org` tab, then Settings → Safari → Advanced → Website Data → remove `smartdesktopaccess.duckdns.org`, and open `/webclient/` in a new tab.

## Connecting dialog and keyboard focus

The bundled Flutter build treats almost every JS `msgbox` as a dialog with Cancel and OK, and OK navigates home (`closeConnection`). Status dialogs such as "Connecting... / Logging in..." and "Successful / Connected, waiting for image..." are therefore not forwarded from JS. An empty first-frame `msgbox` is treated as a dismiss plus keyboard-focus hook. Flutter's own "waiting for image" loader still closes itself when the first RGBA frame arrives, so the overlay disappears without tapping OK. If that dialog is somehow still visible, Cancel only dismisses it; OK must not be required, and the session stays up after the first frame.

After the first frame the client focuses Flutter's `flt-glass-pane` once so a physical keyboard or iPad keyboard case can target the page. It does not retry that focus: repeating `pane.focus()` closed the iPad on-screen keyboard. The helper never runs while a `flt-text-editing-host` `<input>`/`<textarea>`, our `#sda-kb-host`, or any other text field is active.

The iPad live overlay covers Flutter's session toolbar, so hardware keys are forwarded from `keydown`/`keyup` through `setByName('input_key')` (this web client has no JS grabber and defaults to Input source 1, which makes Flutter ignore keys). Overlay handlers call `preventDefault` only on pointer events, never on key events, and they do not blur the text-editing host. A user-gesture “Keyboard” button (`#sda-kb-btn`) focuses a hidden textarea so the iPad on-screen keyboard can open; typed text is sent with `input_key` / `input_string`. The OSK still cannot be opened by script without that tap.

Those same touch clients also get a “Touch screen” toggle (`#sda-touch-btn`) and a “Fit” button next to Keyboard, bottom-left. Flutter’s stock `touch-mode` / `kOptionTouchMode` setting lives in the mobile toolbar, which our overlay covers, so the mode is implemented on the overlay with `curConn.inputMouse` (the same masks as `setByName('send_mouse')`) and the choice is stored in `localStorage` as `sda-touch-mode`. Default is on (more natural on a tablet or phone). Touch mode: a tap left-clicks exactly where the finger is (absolute coordinates through the contain-fit overlay rect, including any local zoom/pan); a long-press is a right-click; a one-finger drag is a left-button drag; a two-finger drag scrolls when the picture is fit. Mouse (trackpad) mode: a finger moves the cursor relatively and a tap clicks at the cursor, not under the finger. A two-finger pinch zooms the overlay locally up to 4× in both modes (the viewport meta is `user-scalable=no`, so this is not browser zoom), a two-finger drag pans while zoomed, and a two-finger double-tap or Fit resets to contain-fit. Tap mapping always uses the live canvas `getBoundingClientRect()`, so coordinates stay correct while zoomed. A desktop Mac (`Macintosh` and `maxTouchPoints <= 1`) is unchanged: no overlay, no toolbar, CanvasKit as before.

The overlay hides Flutter’s remote cursor, so on iPad/phones we draw our own mouse arrow on a `#sda-cursor` canvas (`pointer-events: none`) above the video. RustDesk `cursor_data` / `cursor_id` / `cursor_position` messages (forwarded by `connection.ts` through `pushEvent`) are hooked in `sdaSafeGlobalEvent`: the remote cursor bitmap and hotspot are cached and drawn, mapped through the same contain-fit and zoom/pan rect as taps. Local moves update the arrow immediately so it follows a finger without waiting for the peer echo. Until a bitmap arrives, a white arrow with a black outline is used. In trackpad mode (Touch screen off) a drag moves the arrow and a tap anywhere left-clicks at the arrow, not under the finger; a second tap soon after is a double-click at the same point. Floating **Left click** and **Right click** buttons appear next to Fit only in that mode and send those clicks at the arrow. Desktop Mac/CanvasKit does not get this overlay cursor, so Flutter’s own cursor is not doubled.

Pointer moves on the overlay are coalesced with `requestAnimationFrame` (`queueAbsMove`): the arrow follows the finger immediately, but `inputMouse` is sent at most once per frame, and a pending move is flushed on pointer-up so the last position is not lost. The `#sda-cursor` bitmap is painted only when the cursor image or device pixel ratio changes; afterwards the arrow is moved with a CSS `translate3d` transform (no `clearRect`/`drawImage` or `left`/`top` layout on every move). Moves are not written to `/webclient/sda-log`. The live-canvas skip gap is adaptive instead of a fixed 100 ms (about 10 fps): about 33 ms when a blit takes 14 ms or less (up to ~30 fps), 40 ms when it takes up to 24 ms (~25 fps), and 50 ms if drawing is slower (~20 fps). `pointerup`, `pointercancel`, `lostpointercapture`, `touchend`/`touchcancel`, a window-level pointer-up, `blur`, and hiding the page all release pointer capture, flush the queued move, send a left-button up if a drag was held, and clear gesture state so the remote arrow cannot stay stuck down.

The overlay script is versioned at `docs/webclient/sda-stability.js` and deployed to `/opt/rustdesk-api/resources/web/sda-stability.js`, included from `/webclient/index.html` with a cache-busting `?v=` query.

## Renaming a computer in the browser

The name you set here is the owner's Rename (the companion device name). It is the same name the native manager shows, and it always overrides the computer's self-chosen name.

In the web client:

1. Open `https://smartdesktopaccess.duckdns.org/webclient/` and sign in.
2. On the computer list, tap **Rename** at the top right (the button is hidden during a remote session).
3. The **Rename a computer** window lists every computer with its ID and current name.
4. Change the name in that computer's field (up to 80 characters) and tap **Save** next to it.
5. The page reloads (only if no remote session is open) and the card shows the new name right away. The same name is stored on the companion, so the native manager app and `https://smartdesktopaccess.duckdns.org/companion/` show it too.

The companion admin page already has its own Rename control (it prompts for a name and `PATCH`es `/api/v1/devices/<id>`). Either path wins if it is the latest change: `sync_web_peers.py` keeps a last-synced name in `/var/lib/sda-companion/web-alias-state.json` and uses last-changed-wins between the web address book and the companion.

A rename from `/webclient/` calls `POST /companion/api/v1/web-rename` with the signed-in user's rustdesk-api token. Companion checks `/api/currentUser` (the account is in `name`, not `username`) and allows `yuriy` or `admin`, then writes the alias and runs `sync_web_peers.py` immediately. The overlay script lives at `/opt/rustdesk-api/resources/web/sda-rename.js` and is included from `/webclient/index.html`.

The sync oneshot also keeps `/opt/rustdesk-api/data/rustdeskapi.db` group-writable by `sda` so the companion process (user `sda`) can update the address book itself. The script reads `COMPANION_ADMIN_TOKEN` from the environment or `/var/lib/sda-companion/admin-token`; it does not need world-readable `/etc/sda-companion.env`.

## Companion pages

The companion service still serves:

- `https://smartdesktopaccess.duckdns.org/companion/` — web admin. After you paste the companion token it lists computers, marks new ones, sends the install email, and can Rename a computer (same companion alias as the web client). It does not move the remote mouse.
- `https://smartdesktopaccess.duckdns.org/companion/view` — placeholder. It does not show a screen or take input. Remote control from the browser is the `/webclient/` page above.

## What a later branded web client would still add

Flutter Web in this repository does not include the TypeScript client (`flutter/web/js/` is gitignored). A Smart Desktop Access–branded shell would reuse the same `/ws/id` and `/ws/relay` routes and should:

- keep full control (screen, mouse, keyboard, scrolling, touch mapping on iPad and phones);
- offer the same session tools as the admin app where the browser allows it (clipboard, file transfer both ways, chat, voice, switching monitors, restart and lock);
- drop third-party branding except the AGPL notice in About;
- require sign-in over HTTPS before any session starts.

`flutter/lib/web/bridge.dart` already treats a web build as the admin app unless `SDA_VARIANT=client` is set, and it knows the companion URL. That is groundwork for a later Flutter web shell, not the live viewer.
