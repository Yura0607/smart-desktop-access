# Smart Desktop Access companion

A small Python service for the Oracle VM that already runs hbbs/hbbr. The free hbbs server has no device list, so this process keeps one.

- The client registers its ID, computer name, email, and permanent password.
- Smart Desktop Access Admin reads the list and shows Connect, Disconnect, and Send email.
- Send email uses the owner's SMTP account when it is configured. Otherwise the admin app opens a prefilled message in the local mail program.

Nothing here is deployed for you. The steps below are what to run on the Ubuntu 22.04 VM.

## Ports

| Port | Use |
| --- | --- |
| TCP 21115-21117, UDP 21116 | already used by hbbs/hbbr |
| TCP 21120 | this companion |
| TCP 21118-21119 | later, for the browser client (see `docs/WEB.md`) |

Open 21120 in the Oracle security list and on the VM:

```sh
sudo iptables -I INPUT -p tcp --dport 21120 -j ACCEPT
```

The VM has 1 GB of RAM. This process is a single Python program with a JSON file. The systemd unit caps it at 128 MB.

## Install

On the VM, as a user who can `sudo`:

```sh
sudo useradd --system --create-home --home-dir /var/lib/sda-companion sda || true
sudo mkdir -p /opt/sda-companion /var/lib/sda-companion
sudo apt-get install -y python3-cryptography
sudo cp companion.py email_text.py notes.py /opt/sda-companion/
sudo cp -a web /opt/sda-companion/web
sudo cp sda-companion.env.example /etc/sda-companion.env
sudo chown -R sda:sda /opt/sda-companion /var/lib/sda-companion
sudo chmod 600 /etc/sda-companion.env
sudo cp sda-companion.service /etc/systemd/system/sda-companion.service
sudo systemctl daemon-reload
sudo systemctl enable --now sda-companion
sudo journalctl -u sda-companion -n 30 --no-pager
```

The first start prints a token when `COMPANION_ADMIN_TOKEN` is empty. It is also stored in `/var/lib/sda-companion/admin-token`. Paste it into the admin app once. It is not built into the apps.

## SMTP

Edit `/etc/sda-companion.env` with the mailbox the owner already has (any provider that allows SMTP). Restart:

```sh
sudo systemctl restart sda-companion
```

`GET https://smartdesktopaccess.duckdns.org/companion/api/v1/health` returns `"smtp": true` when the host and sender are set. The password is never written to the log. Gmail uses `smtp.gmail.com` port 587 with `SMTP_TLS=starttls` and an app password.

If SMTP is not set, or the provider refuses the message, Send email falls back to a `mailto:` link with the same English text.

## What the admin sees

- Native admin app: the Computers list, after the token is saved on that computer.
- Browser: `https://smartdesktopaccess.duckdns.org/companion/` (same token). The page lists every registered computer with its name, ID, and Online/Offline status. **Connect in browser** opens `/webclient/#/?id=<id>` and stores that computer's permanent password in same-origin `localStorage` (`peers.<id>.plainpwd`) and `sessionStorage` so the web client can sign in without a prompt. The password is never placed in a query string.
- Web client page: `https://smartdesktopaccess.duckdns.org/companion/view` (placeholder; must become full remote control from the browser; see `docs/WEB.md`).

## Caddy

The apps call `https://smartdesktopaccess.duckdns.org` and `https://smartdesktopaccess.duckdns.org/companion`. Caddy terminates TLS and strips the prefix:

```
smartdesktopaccess.duckdns.org {
	handle_path /companion/* {
		reverse_proxy 127.0.0.1:21120
	}
	handle {
		reverse_proxy 127.0.0.1:21114
	}
}
```

hbbs and hbbr stay on 21116 and 21117. Do not change their config for this. Old builds that still use the plain IP and ports 21114 and 21120 keep working during the move.

## API

`POST /api/v1/devices` — client registration. The first call returns `device_token`. Later calls must send it back, so another computer cannot replace the record.

`GET /api/v1/devices` — `Authorization: Bearer <token>`. Includes the permanent password so Connect can sign in. Treat the token like a password.

`POST /api/v1/devices/<id>/email` — same header. Sends the install mail, or returns `mailto` when SMTP is not available.

`PATCH /api/v1/devices/<id>` — same header, body `{"alias": "Front desk"}`. Empty alias clears the name. A later client registration does not replace it.

`POST /api/v1/devices/<id>/deactivate` — same header. Marks the computer so its next check-in uninstalls the program. The list shows it as uninstalling until the computer confirms. `POST /api/v1/devices/<id>/deactivated-ack` with the device token removes it. `DELETE /api/v1/devices/<id>` forgets it without an uninstall. Notes for a forgotten computer move to `notes-archive.json` in the data directory.

`POST /api/v1/clients` — same header, body `{"name", "email", "note"}`. Creates a pending record and a short invite code. `POST /api/v1/clients/<invite>/email` sends the install mail. The download links are `https://smartdesktopaccess.duckdns.org/companion/d/<invite>/windows` (and `mac`, `mac-intel`) and redirect to the client installers under `SDA_DOWNLOAD_BASE` (default `https://smartdesktopaccess.duckdns.org/downloads`). `HEAD` on those paths returns the same redirect. The person does not type the code. When the installed client registers with the same email address, ignoring capitals, the pending record becomes that device and keeps the name. `DELETE /api/v1/clients/<invite>` removes a pending record.

`GET /api/v1/devices/<id>/notes` and `PUT /api/v1/devices/<id>/notes` — same header. `<id>` is a device id or a pending invite. PUT body is `{"credentials": "..."}` (at most 10,000 characters). The value is a Fernet token in `notes.json`. The key is `notes.key` in the data directory, created on first start, mode 600. It is not written into `devices.json` and it is not logged.

`POST /api/v1/devices/<id>/log` body `{"text": "..."}` adds a work-log line with `created_at`. `PUT /api/v1/devices/<id>/log/<entry>` edits the text. `DELETE /api/v1/devices/<id>/log/<entry>` removes it. The list is newest first, capped at 200 lines. These routes use the same admin rate limit as the device list.

## Backups

Back up all of `/var/lib/sda-companion`. That directory holds `devices.json`, `notes.json`, `notes.key`, and `admin-token`. `notes.json` has the work log in plain text and credentials only as ciphertext. Restoring `notes.json` without `notes.key` makes the stored passwords unreadable. Do not commit either file.

Registration is open on purpose: the client program cannot keep a secret. After the first registration the device token blocks overwrites. Do not put the admin token in the client build.
