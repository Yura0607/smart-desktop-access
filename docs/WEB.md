# Web admin and web client (full control)

Requirement: the web client gives full remote control of a customer's computer from any browser (iPad, iPhone, Android phones, Mac, Windows): live screen, mouse, keyboard, scrolling, and everything the native admin app can do. It is not view-only. The native Smart Desktop Access Admin app stays as it is.

## What works now

Use the rustdesk-api web client (full control, not the companion placeholder):

- Web client: `https://smartdesktopaccess.duckdns.org/webclient/`
- Account admin: `https://smartdesktopaccess.duckdns.org/_admin/`
- Companion device list: `https://smartdesktopaccess.duckdns.org/companion/`
- Companion view page: `https://smartdesktopaccess.duckdns.org/companion/view` (still a placeholder; do not use this for control)

Sign in as the same account used on the admin site (`yuriy`). In the web client, type the computer ID and the computer's permanent password (the one the client registered with the companion). The page shows the remote screen and sends mouse and keyboard input. Incoming-only SDA clients use `approve-mode: password-click`: the permanent password is enough, or someone at the computer can click Accept.

The stock page still shows RustDesk (Beta) branding. No client or admin app rebuild is required for this path.

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

## Companion pages

The companion service still serves:

- `https://smartdesktopaccess.duckdns.org/companion/` — web admin. After you paste the companion token it lists computers, marks new ones, and sends the install email. It does not move the remote mouse.
- `https://smartdesktopaccess.duckdns.org/companion/view` — placeholder. It does not show a screen or take input. Remote control from the browser is the `/webclient/` page above.

## What a later branded web client would still add

Flutter Web in this repository does not include the TypeScript client (`flutter/web/js/` is gitignored). A Smart Desktop Access–branded shell would reuse the same `/ws/id` and `/ws/relay` routes and should:

- keep full control (screen, mouse, keyboard, scrolling, touch mapping on iPad and phones);
- offer the same session tools as the admin app where the browser allows it (clipboard, file transfer both ways, chat, voice, switching monitors, restart and lock);
- drop third-party branding except the AGPL notice in About;
- require sign-in over HTTPS before any session starts.

`flutter/lib/web/bridge.dart` already treats a web build as the admin app unless `SDA_VARIANT=client` is set, and it knows the companion URL. That is groundwork for a later Flutter web shell, not the live viewer.
