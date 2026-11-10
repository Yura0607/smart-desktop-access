#!/usr/bin/env python3
"""Copy companion devices into rustdesk-api's address book for user yuriy.

The /webclient/ page reads that address book via /api/server-config
(collection_id 0). New installs, renames, online status, and removals
are applied on each run.

Rename is two-way with last-changed-wins against the last synced name:
companion admin (and the native manager) stay the source of truth, but a
name edited in the web client is pushed back to the companion so the
next run does not revert it. Never prints tokens or passwords.
"""
from __future__ import annotations

import base64
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

COMPANION_ENV = Path("/etc/sda-companion.env")
COMPANION_TOKEN_FILE = Path("/var/lib/sda-companion/admin-token")
COMPANION_URL = "http://127.0.0.1:21120/api/v1/devices"
STATE_PATH = Path("/var/lib/sda-companion/web-alias-state.json")
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
    token = (os.environ.get("COMPANION_ADMIN_TOKEN") or "").strip().strip('"').strip("'")
    if not token and COMPANION_ENV.exists():
        try:
            lines = COMPANION_ENV.read_text().splitlines()
        except OSError:
            lines = []
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key == "COMPANION_ADMIN_TOKEN":
                token = value.strip().strip('"').strip("'")
    if not token and COMPANION_TOKEN_FILE.exists():
        try:
            token = COMPANION_TOKEN_FILE.read_text().strip()
        except OSError:
            token = ""
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


def load_state() -> dict:
    if not STATE_PATH.exists():
        return {}
    try:
        data = json.loads(STATE_PATH.read_text())
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True))
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    tmp.replace(STATE_PATH)
    try:
        os.chmod(STATE_PATH, 0o600)
    except OSError:
        pass


def push_alias(token: str, device_id: str, alias: str) -> None:
    request = Request(
        COMPANION_URL.rstrip("/") + "/" + device_id,
        data=json.dumps({"alias": alias}).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
        method="PATCH",
    )
    with urlopen(request, timeout=15) as response:
        response.read()


def choose_name(device_id: str, comp_name: str, web_name: str, last: str, token: str) -> str:
    """Last-changed-wins against the last name we synced."""
    if not last:
        return comp_name
    if web_name and web_name != last and web_name != comp_name:
        try:
            push_alias(token, device_id, web_name)
            return web_name
        except Exception:
            print("error: could not push web rename to companion", file=sys.stderr)
            return web_name
    if comp_name != last:
        return comp_name
    return comp_name


def main() -> None:
    token = companion_token()
    devices = fetch_devices(token)
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
    state = load_state()
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
        web_names = {}
        for item_id, row_id in existing.items():
            rec = connection.execute(
                "SELECT username, alias FROM address_books WHERE row_id = ?",
                (row_id,),
            ).fetchone()
            if not rec:
                continue
            username, alias = rec
            web_names[item_id] = str(alias or username or "").strip()

        keep: set[str] = set()
        pushed = 0
        for device in active:
            device_id = str(device["id"]).strip()
            keep.add(device_id)
            comp_name = display_name(device)
            last = str((state.get(device_id) or {}).get("alias") or "")
            web_name = web_names.get(device_id, "")
            name = choose_name(device_id, comp_name, web_name, last, token)
            if name != comp_name:
                pushed += 1
            if not name:
                name = device_id
            online = bool(device.get("online"))
            # Do not put Online/Offline in hostname. The Flutter card subtitle
            # is "{username}@{hostname}", which became "Name@Offline". Status
            # is the address-book `online` column plus /api/v1/web-status.
            # Include every non-deactivated companion device; do not filter
            # by online or recent activity.
            username = name
            host = str(device.get("hostname") or device.get("client_name") or "").strip()
            if host.lower() in ("online", "offline"):
                host = ""
            labeled = host
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
            state[device_id] = {"alias": name}
        removed = 0
        for device_id, row_id in existing.items():
            if device_id not in keep:
                connection.execute(
                    "DELETE FROM address_books WHERE row_id = ?",
                    (row_id,),
                )
                removed += 1
                state.pop(device_id, None)
        connection.commit()
        save_state(state)
        online_count = sum(1 for device in active if device.get("online"))
        print(
            f"synced={len(active)} removed={removed} online={online_count} "
            f"pushed={pushed} user_id={user_id}"
        )
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as err:
        print(f"error: sync failed: {type(err).__name__}: {err}", file=sys.stderr)
        sys.exit(1)
