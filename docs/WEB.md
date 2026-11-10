# Web admin and web client (full control)

Requirement: the web client gives full remote control of a customer's computer from any browser (iPad, iPhone, Android phones, Mac, Windows): live screen, mouse, keyboard, scrolling, and everything the native admin app can do. It is not view-only. The native Smart Desktop Access Admin app stays as it is.

## What this pass includes

The companion service serves two pages. Caddy exposes them at:

- `https://smartdesktopaccess.duckdns.org/companion/` — web admin. After you paste the companion token it lists computers, marks new ones, and sends the install email. It does not move the remote mouse. Use Smart Desktop Access Admin for that. Connect stays in the native app because the picture and input stack is not in the page.
- `https://smartdesktopaccess.duckdns.org/companion/view` — placeholder for the web client. It does not show a screen or take input yet. It must become the full-control web client described below.

## What is still required for the full-control web client

Flutter Web in this repository does not include the TypeScript client. That code lives in `flutter/web/js/`, which is gitignored and is not in this checkout. Without it, a browser cannot decode the remote screen. Copying a partial client in would not be a working web client.

To finish it later:

1. Open TCP 21118 and 21119 on the Oracle security list and on the VM. Those are the ID server and relay WebSocket ports. 21115–21117 and UDP 21116 are already the native ports. 21120 is the companion.
2. Keep HTTPS on `smartdesktopaccess.duckdns.org`. Browsers will not use a secure WebSocket from a plain `http://` page.
3. Build the upstream web client (`flutter/web/js`) against this server's public key `IZnoUoa33KdpLzeQLzosH7I8oo6vRNVjv8MxezPM5Rc=` and host `smartdesktopaccess.duckdns.org`, then serve it over HTTPS.
4. Full control in the browser, not view-only. The web client must:
   - show the remote screen live;
   - send mouse input (move, left/right/middle click, double-click, drag, wheel scroll);
   - send keyboard input (typing, special keys, and shortcuts such as Ctrl+Alt+Del, Ctrl/Cmd combinations, Esc, function keys), including an on-screen keyboard on touch devices;
   - on touch devices (iPad, iPhone, Android), map taps, long-press, two-finger scroll and pinch-zoom to mouse actions, with a trackpad-style mode;
   - offer the same session tools as the admin app where the browser allows it (clipboard, file transfer both ways, chat, voice, switching monitors, restart and lock);
   - work in current Safari, Chrome, Edge and Firefox on iPad, iPhone, Android phones, Mac and Windows, with no install.
5. Sign-in is required (the same admin account or companion token) before any session starts, over HTTPS only.
6. The admin page can stay on the companion. It does not need the WebSocket ports.

`flutter/lib/web/bridge.dart` already treats a web build as the admin app unless `SDA_VARIANT=client` is set, and it knows the companion URL. That is the groundwork for a later Flutter web shell. It does not display a remote screen by itself.
