"""Per-client credentials and work log.

Credentials are Fernet tokens. The key file is created on first use and is
not stored next to the device list. The work log is plain text in the same
notes file, which stays in the companion data directory.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

MAX_TEXT = 10_000
MAX_LOG_ENTRIES = 200
_ID_OK = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.")


def _valid_owner(owner: str) -> bool:
    return bool(owner) and len(owner) <= 64 and all(ch in _ID_OK for ch in owner)


def _check_text(text: str, empty_ok: bool) -> str:
    if not isinstance(text, str):
        raise ValueError("invalid text")
    if "\x00" in text:
        raise ValueError("invalid text")
    if len(text) > MAX_TEXT:
        raise ValueError("text too long")
    if not empty_ok and not text.strip():
        raise ValueError("text required")
    return text


class Notes:
    def __init__(self, data_dir: Path):
        self.path = data_dir / "notes.json"
        self.key_path = data_dir / "notes.key"
        self._lock = threading.Lock()
        data_dir.mkdir(parents=True, exist_ok=True)
        self._fernet = Fernet(self._load_key())
        if not self.path.exists():
            self._write({"owners": {}})

    def _load_key(self) -> bytes:
        if self.key_path.exists():
            key = self.key_path.read_bytes().strip()
        else:
            key = Fernet.generate_key()
            self.key_path.write_bytes(key + b"\n")
        try:
            os.chmod(self.key_path, 0o600)
        except OSError:
            pass
        return key

    def _read(self) -> dict[str, Any]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"owners": {}}
        if not isinstance(data, dict):
            return {"owners": {}}
        data.setdefault("owners", {})
        return data

    def _write(self, data: dict[str, Any]) -> None:
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data), encoding="utf-8")
        try:
            os.chmod(temporary, 0o600)
        except OSError:
            pass
        temporary.replace(self.path)

    def _decrypt(self, token: str) -> str:
        if not token:
            return ""
        try:
            return self._fernet.decrypt(token.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeError, ValueError) as err:
            raise RuntimeError("cannot read credentials") from err

    def _row(self, data: dict[str, Any], owner: str) -> dict[str, Any]:
        owners = data.setdefault("owners", {})
        row = owners.get(owner)
        if not isinstance(row, dict):
            row = {"credentials": "", "log": []}
            owners[owner] = row
        if not isinstance(row.get("credentials"), str):
            row["credentials"] = ""
        if not isinstance(row.get("log"), list):
            row["log"] = []
        return row

    def get(self, owner: str) -> dict[str, Any]:
        if not _valid_owner(owner):
            raise ValueError("invalid id")
        with self._lock:
            row = self._row(self._read(), owner)
            credentials = self._decrypt(row.get("credentials") or "")
            raw_log = [entry for entry in row.get("log") or [] if isinstance(entry, dict)]
        ordered = list(enumerate(raw_log))
        ordered.sort(
            key=lambda pair: (int(pair[1].get("created_at") or 0), pair[0]),
            reverse=True,
        )
        log = [dict(entry) for _, entry in ordered]
        return {"credentials": credentials, "log": log}

    def put_credentials(self, owner: str, text: str) -> None:
        if not _valid_owner(owner):
            raise ValueError("invalid id")
        text = _check_text(text, empty_ok=True)
        token = "" if text == "" else self._fernet.encrypt(text.encode("utf-8")).decode("ascii")
        with self._lock:
            data = self._read()
            row = self._row(data, owner)
            row["credentials"] = token
            self._write(data)

    def add_log(self, owner: str, text: str) -> dict[str, Any]:
        if not _valid_owner(owner):
            raise ValueError("invalid id")
        text = _check_text(text, empty_ok=False)
        entry = {
            "id": secrets.token_hex(8),
            "text": text,
            "created_at": int(time.time()),
        }
        with self._lock:
            data = self._read()
            row = self._row(data, owner)
            if len(row["log"]) >= MAX_LOG_ENTRIES:
                raise ValueError("too many entries")
            row["log"].append(entry)
            self._write(data)
        return dict(entry)

    def edit_log(self, owner: str, entry_id: str, text: str) -> dict[str, Any]:
        if not _valid_owner(owner):
            raise ValueError("invalid id")
        text = _check_text(text, empty_ok=False)
        with self._lock:
            data = self._read()
            row = self._row(data, owner)
            for entry in row["log"]:
                if isinstance(entry, dict) and entry.get("id") == entry_id:
                    entry["text"] = text
                    self._write(data)
                    return dict(entry)
        raise KeyError(entry_id)

    def delete_log(self, owner: str, entry_id: str) -> None:
        if not _valid_owner(owner):
            raise ValueError("invalid id")
        with self._lock:
            data = self._read()
            row = self._row(data, owner)
            kept = [entry for entry in row["log"] if not (isinstance(entry, dict) and entry.get("id") == entry_id)]
            if len(kept) == len(row["log"]):
                raise KeyError(entry_id)
            row["log"] = kept
            self._write(data)

    def reassign(self, source: str, dest: str) -> None:
        if not source or source == dest:
            return
        if not _valid_owner(source) or not _valid_owner(dest):
            raise ValueError("invalid id")
        with self._lock:
            data = self._read()
            owners = data.setdefault("owners", {})
            src = owners.pop(source, None)
            if not isinstance(src, dict):
                return
            dest_row = self._row(data, dest)
            if not dest_row.get("credentials") and src.get("credentials"):
                dest_row["credentials"] = src.get("credentials")
            incoming = [entry for entry in src.get("log") or [] if isinstance(entry, dict)]
            dest_row["log"] = list(dest_row.get("log") or []) + incoming
            if len(dest_row["log"]) > MAX_LOG_ENTRIES:
                dest_row["log"] = dest_row["log"][-MAX_LOG_ENTRIES:]
            self._write(data)

    def archive(self, owner: str) -> None:
        if not _valid_owner(owner):
            return
        with self._lock:
            data = self._read()
            owners = data.get("owners", {})
            row = owners.pop(owner, None)
            if not isinstance(row, dict):
                return
            self._write(data)
            self._append_archive(owner, row)

    def _append_archive(self, owner: str, row: dict[str, Any]) -> None:
        path = self.path.parent / "notes-archive.json"
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing = {"entries": []}
        if not isinstance(existing, dict):
            existing = {"entries": []}
        entries = existing.setdefault("entries", [])
        if not isinstance(entries, list):
            entries = []
            existing["entries"] = entries
        entries.append({"owner": owner, "archived_at": int(time.time()), "record": row})
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(existing), encoding="utf-8")
        try:
            os.chmod(temporary, 0o600)
        except OSError:
            pass
        temporary.replace(path)

    def drop(self, owner: str) -> None:
        if not _valid_owner(owner):
            return
        with self._lock:
            data = self._read()
            owners = data.get("owners", {})
            if owner not in owners:
                return
            owners.pop(owner, None)
            self._write(data)
