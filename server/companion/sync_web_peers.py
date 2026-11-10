#!/usr/bin/env python3
"""Copy companion devices into rustdesk-api's address book for user yuriy.

The /webclient/ page reads that address book via /api/server-config
(collection_id 0). New installs, renames, online status, and removals
are applied on each run. Never prints tokens or passwords.
"""
from __future__ import annotations

import base64
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

COMPANION_ENV = Path("/etc/sda-companion.env")
COMPANION_TOKEN_FILE = Path("/var/lib/sda-companion/admin-token")
COMPANION_URL = "http://127.0.0.1:21120/api/v1/devices"
DB_PATH = Path("/opt/rustdesk-api/data/rustdeskapi.db")
USERNAME = "yuriy"
MANAGED_TAG = "sda-companion"
COLLECTION_ID = 0
PLATFORM_MAP = {
    "windows": "Windows",
    "macos": "Mac OS",
    "linux": "Linux",
    "android": "Android",
    "ios": "iOS",
}


def companion_token() -> str:
    token = ""
    if COMPANION_ENV.exists():
        for line in COMPANION_ENV.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key == "COMPANION_ADMIN_TOKEN":
                token = value.strip().strip('"').strip("'")
    if not token and COMPANION_TOKEN_FILE.exists():
        token = COMPANION_TOKEN_FILE.read_text().strip()
    if not token:
        raise SystemExit("companion token is missing")
    return token


def fetch_devices(token: str) -> list[dict]:
    request = Request(COMPANION_URL, headers={"Authorization": "Bearer " + token})
    with urlopen(request, timeout=15) as response:
        payload = json.load(response)
    return list(payload.get("devices") or [])


def display_name(device: dict) -> str:
    for key in ("alias", "hostname", "client_name"):
        value = str(device.get(key) or "").strip()
        if value:
            return value
    return str(device.get("id") or "").strip()


def platform_of(device: dict) -> str:
    raw = str(device.get("platform") or "").strip()
    return PLATFORM_MAP.get(raw.lower(), raw)


def main() -> None:
    devices = fetch_devices(companion_token())
    active: list[dict] = []
    for device in devices:
        if device.get("deactivated"):
            continue
        device_id = str(device.get("id") or "").strip()
        if not device_id:
            continue
        active.append(device)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f+00:00")
    tags = json.dumps([MANAGED_TAG])
    connection = sqlite3.connect(str(DB_PATH), timeout=10)
    try:
        row = connection.execute(
            "SELECT id FROM users WHERE username = ? AND status = 1",
            (USERNAME,),
        ).fetchone()
        if not row:
            raise SystemExit("user yuriy was not found")
        user_id = int(row[0])
        existing = {
            str(item_id): int(row_id)
            for item_id, row_id in connection.execute(
                "SELECT id, row_id FROM address_books "
                "WHERE user_id = ? AND collection_id = ? AND tags LIKE ?",
                (user_id, COLLECTION_ID, f"%{MANAGED_TAG}%"),
            )
        }
        keep: set[str] = set()
        for device in active:
            device_id = str(device["id"]).strip()
            keep.add(device_id)
            name = display_name(device)
            online = bool(device.get("online"))
            # The bundled web client paints "{username}@{hostname}" and still
            # inserts "@" when username is empty. FromAddressBook also skips
            # alias, so the card title is the ID and the subtitle comes from
            # these two fields. Result: "Yuriy's Dell Laptop@Online".
            username = name
            labeled = "Online" if online else "Offline"
            alias = name
            password = str(device.get("password") or "")
            hashed = (
                base64.b64encode(password.encode("utf-8")).decode("ascii")
                if password
                else ""
            )
            platform = platform_of(device)
            if device_id in existing:
                connection.execute(
                    """
                    UPDATE address_books
                    SET username = ?, hostname = ?, alias = ?, platform = ?,
                        tags = ?, hash = ?, online = ?, updated_at = ?
                    WHERE row_id = ?
                    """,
                    (
                        username,
                        labeled,
                        alias,
                        platform,
                        tags,
                        hashed,
                        1 if online else 0,
                        now,
                        existing[device_id],
                    ),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO address_books (
                        id, username, password, hostname, alias, platform, tags,
                        hash, user_id, force_always_relay, rdp_port, rdp_username,
                        online, login_name, same_server, collection_id,
                        created_at, updated_at
                    ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, 0, '', '', ?, '', 0, ?, ?, ?)
                    """,
                    (
                        device_id,
                        username,
                        labeled,
                        alias,
                        platform,
                        tags,
                        hashed,
                        user_id,
                        1 if online else 0,
                        COLLECTION_ID,
                        now,
                        now,
                    ),
                )
        removed = 0
        for device_id, row_id in existing.items():
            if device_id not in keep:
                connection.execute(
                    "DELETE FROM address_books WHERE row_id = ?",
                    (row_id,),
                )
                removed += 1
        connection.commit()
        online_count = sum(1 for device in active if device.get("online"))
        print(
            f"synced={len(active)} removed={removed} online={online_count} user_id={user_id}"
        )
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        print("error: sync failed", file=sys.stderr)
        sys.exit(1)
