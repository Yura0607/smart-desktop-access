"""Prepared TOTP gate for the rustdesk-api /_admin/ console.

The secret lives in /etc/sda/admin-totp.secret and is never logged.
Nginx auth_request should stay disabled until the owner enables the snippet.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import struct
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

DEFAULT_SECRET_FILE = Path("/etc/sda/admin-totp.secret")
DEFAULT_KEY_FILE = Path("/etc/sda/secret.key")
COOKIE_NAME = "sda_admin_2fa"
COOKIE_TTL_SECONDS = 12 * 60 * 60
TOTP_DIGITS = 6
TOTP_STEP = 30
TOTP_WINDOW = 1


def generate_secret() -> str:
    return base64.b32encode(os.urandom(20)).decode("ascii").rstrip("=")


def totp_code(secret: str, when: int | None = None) -> str:
    padded = secret.strip().upper()
    padded += "=" * ((8 - len(padded) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    counter = int((time.time() if when is None else when) // TOTP_STEP)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = int.from_bytes(digest[offset : offset + 4], "big") & 0x7FFFFFFF
    return str(number % (10**TOTP_DIGITS)).zfill(TOTP_DIGITS)


def totp_ok(secret: str, code: str) -> bool:
    digits = "".join(ch for ch in str(code) if ch.isdigit())
    if len(digits) != TOTP_DIGITS:
        return False
    now = int(time.time())
    for skew in range(-TOTP_WINDOW, TOTP_WINDOW + 1):
        expected = totp_code(secret, now + skew * TOTP_STEP)
        if hmac.compare_digest(expected, digits):
            return True
    return False


def extract_code(raw: bytes, content_type: str) -> str:
    if not raw:
        raise ValueError("empty body")
    ctype = (content_type or "").split(";")[0].strip().lower()
    text = raw.decode("utf-8")
    if ctype == "application/json" or text.lstrip().startswith("{"):
        import json

        value = json.loads(text)
        if not isinstance(value, dict):
            raise ValueError("json object required")
        return str(value.get("code") or value.get("token") or "")
    parsed = parse_qs(text, keep_blank_values=True)
    return (parsed.get("code") or parsed.get("token") or [""])[0]


def _load_key_file(path: Path) -> bytes:
    raw = path.read_bytes()
    if len(raw) == 32:
        return raw
    decoded = bytes.fromhex(raw.strip().decode("ascii"))
    if len(decoded) != 32:
        raise ValueError("secret key file must contain 32 raw bytes or 64 hex chars")
    return decoded


class TotpGate:
    def __init__(self, secret: str, cookie_key: bytes) -> None:
        self.secret = secret.strip().replace(" ", "")
        self.cookie_key = cookie_key

    @classmethod
    def from_env(cls) -> "TotpGate | None":
        secret_path = Path(os.environ.get("SDA_ADMIN_TOTP_SECRET_FILE") or DEFAULT_SECRET_FILE)
        if not secret_path.is_file():
            return None
        secret = secret_path.read_text(encoding="utf-8").strip().replace(" ", "")
        if not secret:
            return None
        key_path = Path(os.environ.get("SDA_SECRET_KEY_FILE") or DEFAULT_KEY_FILE)
        try:
            cookie_key = _load_key_file(key_path)
        except (OSError, ValueError, UnicodeDecodeError):
            cookie_key = hmac.new(b"sda-admin-2fa-cookie", secret.encode("utf-8"), hashlib.sha256).digest()
        return cls(secret, cookie_key)

    def verify(self, code: str) -> bool:
        return totp_ok(self.secret, code)

    def issue_cookie(self) -> str:
        exp = int(time.time()) + COOKIE_TTL_SECONDS
        payload = f"v1.{exp}"
        sig = hmac.new(self.cookie_key, payload.encode("ascii"), hashlib.sha256).hexdigest()
        return f"{payload}.{sig}"

    def cookie_ok(self, value: str) -> bool:
        parts = (value or "").split(".")
        if len(parts) != 3 or parts[0] != "v1":
            return False
        payload = f"{parts[0]}.{parts[1]}"
        expected = hmac.new(self.cookie_key, payload.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, parts[2]):
            return False
        try:
            exp = int(parts[1])
        except ValueError:
            return False
        return exp > int(time.time())

    def cookie_from_header(self, header: str | None) -> str:
        raw = header or ""
        for part in raw.split(";"):
            if "=" not in part:
                continue
            name, value = part.split("=", 1)
            if name.strip() == COOKIE_NAME:
                return value.strip()
        return ""

    def cookie_valid(self, header: str | None) -> bool:
        return self.cookie_ok(self.cookie_from_header(header))

    def set_cookie_header(self, value: str) -> str:
        return (
            f"{COOKIE_NAME}={value}; Max-Age={COOKIE_TTL_SECONDS}; Path=/; "
            "HttpOnly; Secure; SameSite=Strict"
        )


def page_bytes() -> bytes:
    path = Path(__file__).parent / "web" / "admin_2fa.html"
    return path.read_bytes()
