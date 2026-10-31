# Web admin and view-only client

The native admin app is the way to control a computer. Browsers are extra.

## What this pass includes

The companion service on the Oracle VM serves two pages:

- `http://129.213.112.22:21120/` — web admin. After you paste the companion token it lists computers, marks new ones, and sends the install email. It does not move the remote mouse. Use Smart Desktop Access Admin for that. Connect stays in the native app because the picture and input stack is not in the page.
- `http://129.213.112.22:21120/view` — the view-only page. It explains that the person at the computer must agree every time, and that the page cannot type or move the mouse. The Show screen button does not open a picture yet.

## What is still required for a real browser session

Flutter Web in this repository does not include the TypeScript client. That code lives in `flutter/web/js/`, which is gitignored and is not in this checkout. Without it, a browser cannot decode the remote screen. Copying a partial client in would not be a working viewer.

To finish it later:

1. Open TCP 21118 and 21119 on the Oracle security list and on the VM. Those are the ID server and relay WebSocket ports. 21115–21117 and UDP 21116 are already the native ports. 21120 is the companion.
2. Put a free DNS name on `129.213.112.22` (DuckDNS is enough) and a free Let's Encrypt certificate. Browsers will not use the camera, screen, or a secure WebSocket from a plain `http://` IP page.
3. Build the upstream web client (`flutter/web/js`) against this server's public key `IZnoUoa33KdpLzeQLzosH7I8oo6vRNVjv8MxezPM5Rc=` and host `129.213.112.22`, then serve it over HTTPS.
4. Keep the view-only rule: the web client shows the screen and nothing else. Every visit asks the person at the computer before the picture starts. Mouse and keyboard stay in the native admin app.
5. The admin page can stay on the companion. It does not need the WebSocket ports.

`flutter/lib/web/bridge.dart` already treats a web build as the admin app unless `SDA_VARIANT=client` is set, and it knows the companion URL. That is the groundwork for a later Flutter web shell. It does not display a remote screen by itself.
