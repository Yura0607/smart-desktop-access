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

ONLINE_SECONDS = 180
ID_OK = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.")
REGISTER_LIMIT = 30
ADMIN_LIMIT = 120
RATE_WINDOW_SECONDS = 60.0
MAX_EMAIL_LEN = 254
MAX_HOSTNAME_LEN = 128
MAX_ID_LEN = 64


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
            devices[device_id] = record
            self._write(data)
            return dict(devices[device_id])

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

    def send(self, recipient: str) -> None:
        message = EmailMessage()
        message["Subject"] = email_text.SUBJECT
        message["From"] = self.sender
        message["To"] = recipient
        message.set_content(email_text.body())
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


def make_handler(store: Store, smtp: Smtp, admin_token: str, limiter: RateLimiter):
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
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
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
            if path == "/api/v1/health":
                self._send(200, {"ok": True, "smtp": smtp.configured})
                return
            if path == "/api/v1/devices":
                if self._too_fast("admin"):
                    return
                if not self._authorized():
                    self._send(401, {"error": "unauthorized"})
                    return
                self._send(200, {"devices": store.list_devices()})
                return
            self._send(404, {"error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            try:
                payload = self._json()
            except (ValueError, json.JSONDecodeError):
                self._send(400, {"error": "bad json"})
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
            self._send(404, {"error": "not found"})

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
    server = ThreadingHTTPServer((host, port), make_handler(store, smtp, token, limiter))
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
