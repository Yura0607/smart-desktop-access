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


def now() -> int:
    return int(time.time())


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
        if not device_id or any(ch not in ID_OK for ch in device_id):
            raise ValueError("invalid id")
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
            devices[device_id] = {
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
        rows.sort(key=lambda row: (not row["online"], row.get("hostname") or row["id"]))
        return rows

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


def make_handler(store: Store, smtp: Smtp, admin_token: str):
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
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
            return header == "Bearer " + admin_token

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
    server = ThreadingHTTPServer((host, port), make_handler(store, smtp, token))
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
