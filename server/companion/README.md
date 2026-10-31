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
sudo cp companion.py email_text.py /opt/sda-companion/
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

`GET http://129.213.112.22:21120/api/v1/health` returns `"smtp": true` when the host and sender are set. The password is never written to the log.

If SMTP is not set, or the provider refuses the message, Send email falls back to a `mailto:` link with the same English text.

## What the admin sees

- Native admin app: the Computers list, after the token is saved on that computer.
- Browser: `http://129.213.112.22:21120/` (same token). Connect is not in the browser page; open the admin app for control.
- View-only page: `http://129.213.112.22:21120/view` (does not show a screen yet; see `docs/WEB.md`).

## API

`POST /api/v1/devices` — client registration. The first call returns `device_token`. Later calls must send it back, so another computer cannot replace the record.

`GET /api/v1/devices` — `Authorization: Bearer <token>`. Includes the permanent password so Connect can sign in. Treat the token like a password.

`POST /api/v1/devices/<id>/email` — same header. Sends the install mail, or returns `mailto` when SMTP is not available.

Registration is open on purpose: the client program cannot keep a secret. After the first registration the device token blocks overwrites. Do not put the admin token in the client build.
