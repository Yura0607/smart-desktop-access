#!/usr/bin/env python3
"""Small companion for the free hbbs server.

Clients register their ID, hostname, email, and permanent password.
The admin app lists them and asks this process to send the install email.

SMTP credentials come from the environment, never from the source tree.
Run `python3 companion.py` after reading README.md. Do not commit the env file.
"""

from __future__ import annotations

import json
import os
import secrets
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import email_text
import notes as client_notes

ONLINE_SECONDS = 180
ID_OK = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.")
REGISTER_LIMIT = 30
ADMIN_LIMIT = 120
RATE_WINDOW_SECONDS = 60.0
MAX_EMAIL_LEN = 254
MAX_HOSTNAME_LEN = 128
MAX_ID_LEN = 64
MAX_NOTE_LEN = 500
INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def now() -> int:
    return int(time.time())


def valid_email(value: str) -> bool:
    if not value:
        return True
    if len(value) > MAX_EMAIL_LEN or any(ch in value for ch in " \t\r\n"):
        return False
    local, sep, domain = value.partition("@")
    if not sep or not local or "@" in domain or "." not in domain:
        return False
    return not domain.startswith(".") and not domain.endswith(".")


class RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str, limit: int, window: float = RATE_WINDOW_SECONDS) -> bool:
        stamp = time.monotonic()
        with self._lock:
            recent = [item for item in self._hits.get(key, []) if stamp - item < window]
            if len(recent) >= limit:
                self._hits[key] = recent
                return False
            recent.append(stamp)
            self._hits[key] = recent
            return True


class Store:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write({"devices": {}})

    def _read(self) -> dict[str, Any]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"devices": {}}

    def _write(self, data: dict[str, Any]) -> None:
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, indent=2), encoding="utf-8")
        try:
            os.chmod(temporary, 0o600)
        except OSError:
            pass
        temporary.replace(self.path)

    def upsert(self, payload: dict[str, Any]) -> dict[str, Any]:
        device_id = str(payload.get("id") or "").strip()
        if (
            not device_id
            or len(device_id) > MAX_ID_LEN
            or any(ch not in ID_OK for ch in device_id)
        ):
            raise ValueError("invalid id")
        email = str(payload.get("email") or "").strip()
        if not valid_email(email):
            raise ValueError("invalid email")
        hostname = str(payload.get("hostname") or "")
        if len(hostname) > MAX_HOSTNAME_LEN:
            raise ValueError("hostname too long")
        with self._lock:
            data = self._read()
            devices = data.setdefault("devices", {})
            current = devices.get(device_id, {})
            token = str(current.get("device_token") or "")
            presented = str(payload.get("device_token") or "")
            if token and presented != token:
                raise PermissionError("device token")
            if not token:
                token = secrets.token_urlsafe(24)
            stamp = now()
            email = str(payload.get("email") or current.get("email") or "").strip()
            password = str(payload.get("password") or current.get("password") or "")
            # The client must not replace a name the admin set.
            alias = str(current.get("alias") or "").strip()
            invite = str(current.get("invite") or "").strip()
            note = str(current.get("note") or "")
            linked = None if invite else self._pop_pending_locked(data, email)
            if linked:
                alias = str(linked.get("alias") or alias)
                invite = str(linked.get("invite") or "")
                note = str(linked.get("note") or note)
            record = {
                "id": device_id,
                "hostname": str(payload.get("hostname") or current.get("hostname") or ""),
                "email": email,
                "password": password,
                "platform": str(payload.get("platform") or current.get("platform") or ""),
                "version": str(payload.get("version") or current.get("version") or ""),
                "device_token": token,
                "first_seen": int(current.get("first_seen") or stamp),
                "last_seen": stamp,
            }
            if alias:
                record["alias"] = alias
            if invite:
                record["invite"] = invite
            if note:
                record["note"] = note
            devices[device_id] = record
            self._write(data)
            result = dict(record)
            if linked:
                result["_linked_from"] = str(linked.get("invite") or "")
            return result

    def list_devices(self) -> list[dict[str, Any]]:
        with self._lock:
            devices = self._read().get("devices", {})
        stamp = now()
        rows = []
        for device in devices.values():
            row = dict(device)
            row.pop("device_token", None)
            row["online"] = stamp - int(row.get("last_seen") or 0) <= ONLINE_SECONDS
            rows.append(row)
        rows.sort(
            key=lambda row: (
                not row["online"],
                (row.get("alias") or row.get("hostname") or row["id"]).lower(),
            )
        )
        return rows

    def _pop_pending_locked(self, data: dict[str, Any], email: str) -> dict[str, Any] | None:
        target = email.casefold()
        if not target:
            return None
        pending = data.setdefault("pending", {})
        matches = [
            (code, row)
            for code, row in pending.items()
            if str(row.get("email") or "").casefold() == target
        ]
        if not matches:
            return None
        matches.sort(key=lambda item: int(item[1].get("created") or 0))
        code, row = matches[0]
        pending.pop(code, None)
        return row

    def create_pending(self, name: str, email: str, note: str) -> dict[str, Any]:
        name = name.strip()
        email = email.strip()
        note = note.strip()
        if not name or len(name) > 80 or any(ch in name for ch in "\r\n\x00"):
            raise ValueError("invalid name")
        if not email or not valid_email(email):
            raise ValueError("invalid email")
        if len(note) > MAX_NOTE_LEN or "\x00" in note:
            raise ValueError("invalid note")
        with self._lock:
            data = self._read()
            pending = data.setdefault("pending", {})
            invite = ""
            for _ in range(20):
                candidate = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(6))
                if candidate not in pending:
                    invite = candidate
                    break
            if not invite:
                raise ValueError("could not allocate invite")
            row = {
                "id": invite,
                "invite": invite,
                "alias": name,
                "email": email,
                "note": note,
                "pending": True,
                "created": now(),
            }
            pending[invite] = row
            self._write(data)
            return dict(row)

    def list_pending(self) -> list[dict[str, Any]]:
        with self._lock:
            pending = self._read().get("pending", {})
        rows = [dict(row) for row in pending.values()]
        rows.sort(key=lambda row: int(row.get("created") or 0))
        return rows

    def delete_pending(self, invite: str) -> bool:
        with self._lock:
            data = self._read()
            pending = data.get("pending", {})
            if invite not in pending:
                return False
            pending.pop(invite, None)
            self._write(data)
            return True

    def get_pending(self, invite: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._read().get("pending", {}).get(invite)
        return dict(row) if isinstance(row, dict) else None

    def set_alias(self, device_id: str, alias: str) -> dict[str, Any] | None:
        alias = alias.strip()
        if len(alias) > 80:
            raise ValueError("alias too long")
        if any(ch in alias for ch in "\r\n\x00"):
            raise ValueError("invalid alias")
        with self._lock:
            data = self._read()
            devices = data.get("devices", {})
            current = devices.get(device_id)
            if not isinstance(current, dict):
                return None
            if alias:
                current["alias"] = alias
            else:
                current.pop("alias", None)
            devices[device_id] = current
            self._write(data)
        return self.get(device_id)

    def get(self, device_id: str) -> dict[str, Any] | None:
        for row in self.list_devices():
            if row["id"] == device_id:
                return row
        return None


class Smtp:
    def __init__(self) -> None:
        self.host = os.environ.get("SMTP_HOST", "").strip()
        self.port = int(os.environ.get("SMTP_PORT", "587") or "587")
        self.user = os.environ.get("SMTP_USER", "").strip()
        self.password = os.environ.get("SMTP_PASSWORD", "")
        self.sender = os.environ.get("SMTP_FROM", "").strip() or self.user
        self.mode = os.environ.get("SMTP_TLS", "starttls").strip().lower()

    @property
    def configured(self) -> bool:
        return bool(self.host and self.sender)

    def send(self, recipient: str, text: str | None = None) -> None:
        message = EmailMessage()
        message["Subject"] = email_text.SUBJECT
        message["From"] = self.sender
        message["To"] = recipient
        message.set_content(text if text is not None else email_text.body())
        if self.mode == "ssl":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(self.host, self.port, context=context, timeout=30) as smtp:
                self._login(smtp)
                smtp.send_message(message)
            return
        with smtplib.SMTP(self.host, self.port, timeout=30) as smtp:
            smtp.ehlo()
            if self.mode != "none":
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            self._login(smtp)
            smtp.send_message(message)

    def _login(self, smtp: smtplib.SMTP) -> None:
        if self.user:
            smtp.login(self.user, self.password)


def _device_parts(path: str) -> list[str] | None:
    prefix = "/api/v1/devices/"
    if not path.startswith(prefix):
        return None
    rest = path[len(prefix) :].strip("/")
    if not rest or "/" not in rest:
        return None
    return rest.split("/")


def _download_target(path: str) -> str:
    parts = [part for part in path.split("/") if part]
    if len(parts) != 3 or parts[0] != "d":
        return ""
    return email_text.direct_url(parts[2])


def make_handler(store: Store, smtp: Smtp, admin_token: str, limiter: RateLimiter, client_notes_store: client_notes.Notes):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:
            # Do not log request bodies; they contain passwords.
            return

        def _send(self, status: int, payload: dict[str, Any] | None = None, body: bytes | None = None, content_type: str = "application/json") -> None:
            data = body if body is not None else json.dumps(payload or {}).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
            self.end_headers()
            self.wfile.write(data)

        def _json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length") or "0")
            if length <= 0:
                return {}
            if length > 64_000:
                raise ValueError("body too large")
            raw = self.rfile.read(length)
            value = json.loads(raw.decode("utf-8"))
            if not isinstance(value, dict):
                raise ValueError("json object required")
            return value

        def _authorized(self) -> bool:
            header = self.headers.get("Authorization", "")
            return bool(admin_token) and header == "Bearer " + admin_token

        def _client_ip(self) -> str:
            forwarded = self.headers.get("X-Forwarded-For", "")
            if forwarded:
                hop = forwarded.split(",")[0].strip()
                if hop:
                    return hop
            return self.client_address[0]

        def _too_fast(self, bucket: str) -> bool:
            limit = REGISTER_LIMIT if bucket == "register" else ADMIN_LIMIT
            if limiter.allow(f"{bucket}:{self._client_ip()}", limit):
                return False
            self._send(429, {"error": "too many requests"})
            return True

        def do_OPTIONS(self) -> None:  # noqa: N802
            self._send(204, {})

        def do_HEAD(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            download = _download_target(path)
            if not download:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(302)
            self.send_header("Location", download)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path in ("/", "/admin"):
                page = (Path(__file__).parent / "web" / "admin.html").read_bytes()
                self._send(200, body=page, content_type="text/html; charset=utf-8")
                return
            if path == "/view":
                page = (Path(__file__).parent / "web" / "view.html").read_bytes()
                self._send(200, body=page, content_type="text/html; charset=utf-8")
                return
            if path == "/favicon.ico":
                icon = Path(__file__).parent / "web" / "favicon.png"
                if icon.exists():
                    self._send(200, body=icon.read_bytes(), content_type="image/png")
                else:
                    self._send(404, {"error": "missing"})
                return
            download = _download_target(path)
            if download:
                self.send_response(302)
                self.send_header("Location", download)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if path == "/api/v1/health":
                self._send(200, {"ok": True, "smtp": smtp.configured})
                return
            if path == "/api/v1/devices":
                if self._too_fast("admin"):
                    return
                if not self._authorized():
                    self._send(401, {"error": "unauthorized"})
                    return
                self._send(200, {"devices": store.list_devices(), "pending": store.list_pending()})
                return
            parts = _device_parts(path)
            if parts is not None and parts[1:] == ["notes"]:
                self._read_notes(parts[0])
                return
            self._send(404, {"error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            try:
                payload = self._json()
            except (ValueError, json.JSONDecodeError):
                self._send(400, {"error": "bad json"})
                return
            if path == "/api/v1/clients":
                if self._too_fast("admin"):
                    return
                if not self._authorized():
                    self._send(401, {"error": "unauthorized"})
                    return
                try:
                    created = store.create_pending(
                        str(payload.get("name") or ""),
                        str(payload.get("email") or ""),
                        str(payload.get("note") or ""),
                    )
                except ValueError as err:
                    self._send(400, {"error": str(err)})
                    return
                self._send(200, created)
                return
            if path == "/api/v1/devices":
                if self._too_fast("register"):
                    return
                try:
                    saved = store.upsert(payload)
                except PermissionError:
                    self._send(401, {"error": "device token"})
                    return
                except ValueError as err:
                    self._send(400, {"error": str(err)})
                    return
                linked_from = str(saved.pop("_linked_from", "") or "")
                if linked_from:
                    try:
                        client_notes_store.reassign(linked_from, str(saved.get("id") or ""))
                    except Exception as err:
                        print("notes reassign failed:", type(err).__name__)
                self._send(200, {"ok": True, "device_token": saved["device_token"]})
                return
            if path.startswith("/api/v1/devices/") and path.endswith("/email"):
                if self._too_fast("admin"):
                    return
                if not self._authorized():
                    self._send(401, {"error": "unauthorized"})
                    return
                device_id = path[len("/api/v1/devices/") : -len("/email")].strip("/")
                device = store.get(device_id)
                if device is None:
                    self._send(404, {"error": "unknown device"})
                    return
                recipient = str(device.get("email") or "").strip()
                if "@" not in recipient:
                    self._send(400, {"error": "no email"})
                    return
                letter = {
                    "ok": True,
                    "to": recipient,
                    "subject": email_text.SUBJECT,
                    "body": email_text.body(),
                    "mailto": email_text.mailto(recipient),
                }
                if not smtp.configured:
                    letter["sent"] = False
                    letter["fallback"] = "mailto"
                    self._send(200, letter)
                    return
                try:
                    smtp.send(recipient)
                except Exception:
                    letter["sent"] = False
                    letter["fallback"] = "mailto"
                    self._send(200, letter)
                    return
                letter["sent"] = True
                self._send(200, letter)
                return
            if path.startswith("/api/v1/clients/") and path.endswith("/email"):
                if self._too_fast("admin"):
                    return
                if not self._authorized():
                    self._send(401, {"error": "unauthorized"})
                    return
                invite = path[len("/api/v1/clients/") : -len("/email")].strip("/")
                pending = store.get_pending(invite)
                if pending is None:
                    self._send(404, {"error": "unknown client"})
                    return
                recipient = str(pending.get("email") or "").strip()
                text = email_text.body(invite)
                letter = {
                    "ok": True,
                    "to": recipient,
                    "subject": email_text.SUBJECT,
                    "body": text,
                    "mailto": email_text.mailto(recipient, invite),
                }
                if not smtp.configured:
                    letter["sent"] = False
                    letter["fallback"] = "mailto"
                    self._send(200, letter)
                    return
                try:
                    smtp.send(recipient, text)
                except Exception:
                    letter["sent"] = False
                    letter["fallback"] = "mailto"
                    self._send(200, letter)
                    return
                letter["sent"] = True
                self._send(200, letter)
                return
            parts = _device_parts(path)
            if parts is not None and parts[1:] == ["log"]:
                self._add_log(parts[0], payload)
                return
            self._send(404, {"error": "not found"})

        def do_PUT(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            try:
                payload = self._json()
            except (ValueError, json.JSONDecodeError):
                self._send(400, {"error": "bad json"})
                return
            parts = _device_parts(path)
            if parts is not None and parts[1:] == ["notes"]:
                self._write_notes(parts[0], payload)
                return
            if parts is not None and len(parts) == 3 and parts[1] == "log":
                self._edit_log(parts[0], parts[2], payload)
                return
            self._send(404, {"error": "not found"})

        def do_DELETE(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            parts = _device_parts(path)
            if parts is not None and len(parts) == 3 and parts[1] == "log":
                self._remove_log(parts[0], parts[2])
                return
            prefix = "/api/v1/clients/"
            if not path.startswith(prefix) or "/" in path[len(prefix) :].strip("/"):
                self._send(404, {"error": "not found"})
                return
            if self._too_fast("admin"):
                return
            if not self._authorized():
                self._send(401, {"error": "unauthorized"})
                return
            invite = path[len(prefix) :].strip("/")
            if not store.delete_pending(invite):
                self._send(404, {"error": "unknown client"})
                return
            client_notes_store.drop(invite)
            self._send(200, {"ok": True})

        def do_PATCH(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            prefix = "/api/v1/devices/"
            if not path.startswith(prefix) or "/" in path[len(prefix) :].strip("/"):
                self._send(404, {"error": "not found"})
                return
            if self._too_fast("admin"):
                return
            if not self._authorized():
                self._send(401, {"error": "unauthorized"})
                return
            device_id = path[len(prefix) :].strip("/")
            try:
                payload = self._json()
            except (ValueError, json.JSONDecodeError):
                self._send(400, {"error": "bad json"})
                return
            if "alias" not in payload:
                self._send(400, {"error": "alias required"})
                return
            try:
                saved = store.set_alias(device_id, str(payload.get("alias") or ""))
            except ValueError as err:
                self._send(400, {"error": str(err)})
                return
            if saved is None:
                self._send(404, {"error": "unknown device"})
                return
            self._send(200, saved)

        def _admin(self) -> bool:
            if self._too_fast("admin"):
                return False
            if not self._authorized():
                self._send(401, {"error": "unauthorized"})
                return False
            return True

        def _known(self, owner: str) -> bool:
            if store.get(owner) is None and store.get_pending(owner) is None:
                self._send(404, {"error": "unknown device"})
                return False
            return True

        def _read_notes(self, owner: str) -> None:
            if not self._admin() or not self._known(owner):
                return
            try:
                self._send(200, client_notes_store.get(owner))
            except RuntimeError:
                self._send(500, {"error": "cannot read credentials"})
            except ValueError as err:
                self._send(400, {"error": str(err)})

        def _write_notes(self, owner: str, payload: dict[str, Any]) -> None:
            if not self._admin() or not self._known(owner):
                return
            if "credentials" not in payload:
                self._send(400, {"error": "credentials required"})
                return
            try:
                client_notes_store.put_credentials(owner, payload.get("credentials"))
            except ValueError as err:
                self._send(400, {"error": str(err)})
                return
            except RuntimeError:
                self._send(500, {"error": "cannot read credentials"})
                return
            self._send(200, {"ok": True})

        def _add_log(self, owner: str, payload: dict[str, Any]) -> None:
            if not self._admin() or not self._known(owner):
                return
            try:
                entry = client_notes_store.add_log(owner, payload.get("text"))
            except ValueError as err:
                self._send(400, {"error": str(err)})
                return
            self._send(200, entry)

        def _edit_log(self, owner: str, entry_id: str, payload: dict[str, Any]) -> None:
            if not self._admin() or not self._known(owner):
                return
            try:
                entry = client_notes_store.edit_log(owner, entry_id, payload.get("text"))
            except KeyError:
                self._send(404, {"error": "unknown entry"})
                return
            except ValueError as err:
                self._send(400, {"error": str(err)})
                return
            self._send(200, entry)

        def _remove_log(self, owner: str, entry_id: str) -> None:
            if not self._admin() or not self._known(owner):
                return
            try:
                client_notes_store.delete_log(owner, entry_id)
            except KeyError:
                self._send(404, {"error": "unknown entry"})
                return
            except ValueError as err:
                self._send(400, {"error": str(err)})
                return
            self._send(200, {"ok": True})

    return Handler


def load_admin_token(data_dir: Path) -> str:
    configured = os.environ.get("COMPANION_ADMIN_TOKEN", "").strip()
    if configured:
        return configured
    path = data_dir / "admin-token"
    if path.exists():
        existing = path.read_text(encoding="utf-8").strip()
        if existing:
            return existing
    token = secrets.token_urlsafe(32)
    path.write_text(token + "\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    print("Companion admin token (paste this into Smart Desktop Access Admin):")
    print(token)
    return token


def serve(host: str, port: int, data_dir: Path) -> ThreadingHTTPServer:
    data_dir.mkdir(parents=True, exist_ok=True)
    store = Store(data_dir / "devices.json")
    token = load_admin_token(data_dir)
    smtp = Smtp()
    limiter = RateLimiter()
    client_notes_store = client_notes.Notes(data_dir)
    server = ThreadingHTTPServer(
        (host, port),
        make_handler(store, smtp, token, limiter, client_notes_store),
    )
    return server


def main() -> None:
    host = os.environ.get("COMPANION_HOST", "0.0.0.0")
    port = int(os.environ.get("COMPANION_PORT", "21120"))
    data_dir = Path(os.environ.get("COMPANION_DATA", "/var/lib/sda-companion"))
    server = serve(host, port, data_dir)
    print(f"Smart Desktop Access companion listening on {host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
