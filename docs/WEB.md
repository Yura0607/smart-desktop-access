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

Each run reads the companion device list in place (the companion token from `/etc/sda-companion.env` or `/var/lib/sda-companion/admin-token`; the script never prints tokens or passwords), then upserts rows in `/opt/rustdesk-api/data/rustdeskapi.db` for `user_id` of `yuriy` and `collection_id` 0 (the personal book used by `/api/server-config`). It does not write into other collections. The display name is the companion alias if set, otherwise the hostname. Online status is stored as the hostname field `Online` / `Offline` because rustdesk-api's web-client payload does not copy alias or a live online flag; the cards therefore read like `Yuriy's Dell Laptop@Online`. The address-book `hash` column is base64 of the device's permanent password.

Removed or deactivated companion devices are deleted from that managed set (rows tagged `["sda-companion"]`). New installs and renames show up within about two minutes.

`/api/server-config` then returns those peers to the bundled web client. A small patch in rustdesk-api's web JS (`resources/web/js/src/ljw.js`, `connection.ts`, and `resources/web/js/dist/index.js`) stores the decoded hash as `plainpwd` and, when the remote sends its salt, calls `login(plainpwd)` so the password is hashed with the live salt and challenge. Putting the raw password bytes in the remembered `password` field skips the salt step and the remote answers "Wrong Password".

The old `/webclient2/` path (removed upstream) is served from `/var/www/sda-webclient2/index.html` so `/_admin/` "Web Client" links of the form `/webclient2/#/<id>` redirect to `/webclient/#/?id=<id>`.

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
