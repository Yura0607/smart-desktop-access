import http.client
import json
import os
import stat
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import admin_2fa
import companion
import email_text


class CompanionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["COMPANION_ADMIN_TOKEN"] = "test-token"
        key_path = Path(self.tmp.name) / "secret.key"
        key_path.write_bytes(os.urandom(32))
        os.environ["SDA_SECRET_KEY_FILE"] = str(key_path)
        self.totp_secret = admin_2fa.generate_secret()
        totp_path = Path(self.tmp.name) / "admin-totp.secret"
        totp_path.write_text(self.totp_secret + "\n", encoding="utf-8")
        os.environ["SDA_ADMIN_TOTP_SECRET_FILE"] = str(totp_path)
        self.server = companion.serve("127.0.0.1", 0, Path(self.tmp.name))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:%s" % self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def request(self, method, path, payload=None, token=None):
        data = None if payload is None else json.dumps(payload).encode()
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as response:
                body = response.read()
                return response.status, json.loads(body.decode() or "{}")
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read().decode() or "{}")

    def test_register_list_and_email_fallback(self):
        status, created = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Marys-Mac",
                "email": "mary@example.com",
                "password": "secret-password",
                "platform": "macos",
            },
        )
        self.assertEqual(status, 200)
        token = created["device_token"]
        self.assertTrue(token)

        status, denied = self.request("GET", "/api/v1/devices")
        self.assertEqual(status, 401)

        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(status, 200)
        self.assertEqual(listed["devices"][0]["hostname"], "Marys-Mac")
        self.assertTrue(listed["devices"][0]["online"])
        self.assertEqual(listed["devices"][0]["password"], "secret-password")
        self.assertNotIn("device_token", listed["devices"][0])

        status, _ = self.request(
            "POST",
            "/api/v1/devices",
            {"id": "123456789", "hostname": "taken", "device_token": "nope"},
        )
        self.assertEqual(status, 401)

        status, updated = self.request(
            "POST",
            "/api/v1/devices",
            {"id": "123456789", "hostname": "Marys-Mac", "device_token": token},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["device_token"], token)

        status, letter = self.request(
            "POST",
            "/api/v1/devices/123456789/email",
            {},
            token="test-token",
        )
        self.assertEqual(status, 200)
        self.assertFalse(letter["sent"])
        self.assertIn("mailto:mary@example.com", letter["mailto"])
        self.assertIn("Windows", letter["body"])
        self.assertIn("Mac", letter["body"])
        self.assertNotIn("RustDesk", letter["body"])

    def test_install_email_has_both_platforms(self):
        text = email_text.body()
        self.assertIn(email_text.direct_url("windows"), text)
        self.assertIn(email_text.direct_url("mac"), text)
        self.assertIn(email_text.direct_url("mac-intel"), text)
        self.assertIn("SmartDesktopAccess-windows-x64.exe", text)
        self.assertNotIn("github.com", text)
        self.assertNotIn("RustDesk", text)
        self.assertNotIn("129.213.112.22", text)

    def test_invite_redirect_uses_download_base(self):
        os.environ["SDA_DOWNLOAD_BASE"] = "https://downloads.example/files/"
        try:
            self.assertEqual(
                email_text.direct_url("windows"),
                "https://downloads.example/files/SmartDesktopAccess-windows-x64.exe",
            )
            self.assertEqual(
                email_text.direct_url("mac"),
                "https://downloads.example/files/SmartDesktopAccess-macos-arm64.dmg",
            )
            self.assertEqual(
                email_text.direct_url("mac-intel"),
                "https://downloads.example/files/SmartDesktopAccess-macos-x64.dmg",
            )
            host, port = self.server.server_address
            for method in ("GET", "HEAD"):
                conn = http.client.HTTPConnection(host, port, timeout=5)
                conn.request(method, "/d/ABC234/mac")
                response = conn.getresponse()
                body = response.read()
                self.assertEqual(response.status, 302)
                self.assertEqual(
                    response.getheader("Location"),
                    "https://downloads.example/files/SmartDesktopAccess-macos-arm64.dmg",
                )
                self.assertEqual(body, b"")
                conn.close()
        finally:
            os.environ.pop("SDA_DOWNLOAD_BASE", None)

    def test_deactivate_uninstalls_only_after_the_device_confirms(self):
        secret = "sda-credential-deactivate-me"
        status, created = self._register()
        self.assertEqual(status, 200)
        self.assertNotIn("deactivated", created)
        status, denied = self.request("POST", "/api/v1/devices/123456789/deactivate")
        self.assertEqual(status, 401)
        self.request(
            "PUT",
            "/api/v1/devices/123456789/notes",
            {"credentials": secret},
            token="test-token",
        )
        status, marked = self.request(
            "POST",
            "/api/v1/devices/123456789/deactivate",
            token="test-token",
        )
        self.assertEqual(status, 200)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertTrue(listed["devices"][0]["deactivated"])
        status, again = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Office-PC",
                "email": "mary@example.com",
                "password": "pw",
                "device_token": created["device_token"],
                "deactivated": False,
            },
        )
        self.assertEqual(status, 200)
        self.assertTrue(again["deactivated"])
        status, wrong = self.request(
            "POST",
            "/api/v1/devices/123456789/deactivated-ack",
            {"device_token": "nope"},
        )
        self.assertEqual(status, 401)
        status, other = self._register(device_id="222222222", email="other@example.com")
        self.assertEqual(status, 200)
        status, early = self.request(
            "POST",
            "/api/v1/devices/222222222/deactivated-ack",
            {"device_token": other["device_token"]},
        )
        self.assertEqual(status, 409)
        status, acked = self.request(
            "POST",
            "/api/v1/devices/123456789/deactivated-ack",
            {"device_token": created["device_token"]},
        )
        self.assertEqual(status, 200)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual([row["id"] for row in listed["devices"]], ["222222222"])
        archive = (Path(self.tmp.name) / "notes-archive.json").read_text(encoding="utf-8")
        self.assertNotIn(secret, archive)
        self.assertIn("123456789", json.loads(archive)["entries"][0]["owner"])
        status, removed = self.request(
            "DELETE",
            "/api/v1/devices/222222222",
            token="test-token",
        )
        self.assertEqual(status, 200)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(listed["devices"], [])

    def test_client_name_does_not_replace_alias(self):
        status, created = self._register()
        self.assertEqual(status, 200)
        status, named = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Office-PC",
                "email": "mary@example.com",
                "password": "pw",
                "device_token": created["device_token"],
                "client_name": "Front desk PC",
            },
        )
        self.assertEqual(status, 200)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(listed["devices"][0]["client_name"], "Front desk PC")
        status, renamed = self.request(
            "PATCH",
            "/api/v1/devices/123456789",
            {"alias": "Owner name"},
            token="test-token",
        )
        self.assertEqual(status, 200)
        self.assertEqual(renamed["alias"], "Owner name")
        status, again = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Office-PC",
                "email": "mary@example.com",
                "password": "pw",
                "device_token": created["device_token"],
                "client_name": "Changed by the computer",
            },
        )
        self.assertEqual(status, 200)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        device = listed["devices"][0]
        self.assertEqual(device["alias"], "Owner name")
        self.assertEqual(device["client_name"], "Changed by the computer")
        status, rejected = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Office-PC",
                "email": "mary@example.com",
                "password": "pw",
                "device_token": created["device_token"],
                "client_name": "x" * 81,
            },
        )
        self.assertEqual(status, 400)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(listed["devices"][0]["client_name"], "Changed by the computer")
        self.assertEqual(listed["devices"][0]["alias"], "Owner name")

    def test_alias_survives_reregistration(self):
        status, created = self.request(
            "POST",
            "/api/v1/devices",
            {"id": "123456789", "hostname": "Office-PC", "password": "pw"},
        )
        self.assertEqual(status, 200)
        token = created["device_token"]
        status, renamed = self.request(
            "PATCH",
            "/api/v1/devices/123456789",
            {"alias": "Front desk"},
            token="test-token",
        )
        self.assertEqual(status, 200)
        self.assertEqual(renamed["alias"], "Front desk")
        self.assertNotIn("device_token", renamed)
        status, _ = self.request(
            "PATCH",
            "/api/v1/devices/123456789",
            {"alias": "Stolen"},
        )
        self.assertEqual(status, 401)
        status, updated = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Office-PC-2",
                "device_token": token,
                "alias": "from the client",
            },
        )
        self.assertEqual(status, 200)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        device = listed["devices"][0]
        self.assertEqual(device["alias"], "Front desk")
        self.assertEqual(device["hostname"], "Office-PC-2")

    def test_pending_client_links_by_email(self):
        status, denied = self.request(
            "POST",
            "/api/v1/clients",
            {"name": "Front desk", "email": "Mary@Example.com"},
        )
        self.assertEqual(status, 401)
        status, pending = self.request(
            "POST",
            "/api/v1/clients",
            {"name": "Front desk", "email": "Mary@Example.com", "note": "lobby"},
            token="test-token",
        )
        self.assertEqual(status, 200)
        self.assertTrue(pending["pending"])
        self.assertEqual(pending["alias"], "Front desk")
        invite = pending["invite"]
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(listed["pending"][0]["id"], invite)
        status, created = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Office-PC",
                "email": "mary@example.com",
                "password": "pw",
            },
        )
        self.assertEqual(status, 200)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(listed["pending"], [])
        device = listed["devices"][0]
        self.assertEqual(device["alias"], "Front desk")
        self.assertEqual(device["invite"], invite)
        self.assertEqual(device["note"], "lobby")
        status, again = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Office-PC",
                "email": "mary@example.com",
                "device_token": created["device_token"],
                "alias": "from the client",
            },
        )
        self.assertEqual(status, 200)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(listed["devices"][0]["alias"], "Front desk")
        status, extra = self.request(
            "POST",
            "/api/v1/clients",
            {"name": "Spare", "email": "spare@example.com"},
            token="test-token",
        )
        self.assertEqual(status, 200)
        status, removed = self.request(
            "DELETE",
            "/api/v1/clients/" + extra["invite"],
            token="test-token",
        )
        self.assertEqual(status, 200)
        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(listed["pending"], [])

    def test_invalid_email_and_register_rate_limit(self):
        status, body = self.request(
            "POST",
            "/api/v1/devices",
            {"id": "123456789", "email": "not-an-email", "hostname": "PC"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid email")
        old = companion.REGISTER_LIMIT
        companion.REGISTER_LIMIT = 3
        try:
            for index in range(2):
                status, _ = self.request(
                    "POST",
                    "/api/v1/devices",
                    {"id": "12345678%d" % index, "hostname": "PC"},
                )
                self.assertEqual(status, 200)
            status, limited = self.request(
                "POST",
                "/api/v1/devices",
                {"id": "123456782", "hostname": "PC"},
            )
            self.assertEqual(status, 429)
            self.assertEqual(limited["error"], "too many requests")
        finally:
            companion.REGISTER_LIMIT = old

    def _register(self, device_id="123456789", email="mary@example.com"):
        return self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": device_id,
                "hostname": "Office-PC",
                "email": email,
                "password": "pw",
            },
        )

    def test_notes_are_encrypted_and_survive_linking(self):
        secret = "sda-credential-HorseBattery-99!"
        status, pending = self.request(
            "POST",
            "/api/v1/clients",
            {"name": "Front desk", "email": "mary@example.com"},
            token="test-token",
        )
        self.assertEqual(status, 200)
        invite = pending["invite"]
        status, denied = self.request(
            "PUT",
            "/api/v1/devices/%s/notes" % invite,
            {"credentials": secret},
        )
        self.assertEqual(status, 401)
        status, saved = self.request(
            "PUT",
            "/api/v1/devices/%s/notes" % invite,
            {"credentials": secret},
            token="test-token",
        )
        self.assertEqual(status, 200)
        status, too_long = self.request(
            "PUT",
            "/api/v1/devices/%s/notes" % invite,
            {"credentials": "x" * 10001},
            token="test-token",
        )
        self.assertEqual(status, 400)
        status, loaded = self.request(
            "GET",
            "/api/v1/devices/%s/notes" % invite,
            token="test-token",
        )
        self.assertEqual(status, 200)
        self.assertEqual(loaded["credentials"], secret)
        status, first = self.request(
            "POST",
            "/api/v1/devices/%s/log" % invite,
            {"text": "replaced the toner"},
            token="test-token",
        )
        self.assertEqual(status, 200)
        self.assertIn("created_at", first)
        status, second = self.request(
            "POST",
            "/api/v1/devices/%s/log" % invite,
            {"text": "checked the printer"},
            token="test-token",
        )
        self.assertEqual(status, 200)
        status, edited = self.request(
            "PUT",
            "/api/v1/devices/%s/log/%s" % (invite, second["id"]),
            {"text": "checked the scanner"},
            token="test-token",
        )
        self.assertEqual(status, 200)
        self.assertEqual(edited["created_at"], second["created_at"])
        data_dir = Path(self.tmp.name)
        stored = (data_dir / "notes.json").read_text(encoding="utf-8")
        devices = (data_dir / "devices.json").read_text(encoding="utf-8")
        self.assertNotIn(secret, stored)
        self.assertNotIn(secret, devices)
        self.assertIn("replaced the toner", stored)
        key_mode = os.stat(data_dir / "notes.key").st_mode & 0o777
        self.assertEqual(key_mode, stat.S_IRUSR | stat.S_IWUSR)
        notes_mode = os.stat(data_dir / "notes.json").st_mode & 0o777
        self.assertEqual(notes_mode, stat.S_IRUSR | stat.S_IWUSR)
        status, created = self._register()
        self.assertEqual(status, 200)
        status, moved = self.request(
            "GET",
            "/api/v1/devices/123456789/notes",
            token="test-token",
        )
        self.assertEqual(status, 200)
        self.assertEqual(moved["credentials"], secret)
        self.assertEqual(
            [entry["text"] for entry in moved["log"]],
            ["checked the scanner", "replaced the toner"],
        )
        status, gone = self.request(
            "GET",
            "/api/v1/devices/%s/notes" % invite,
            token="test-token",
        )
        self.assertEqual(status, 404)
        status, again = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Office-PC",
                "email": "mary@example.com",
                "password": "pw",
                "device_token": created["device_token"],
            },
        )
        self.assertEqual(status, 200)
        status, kept = self.request(
            "GET",
            "/api/v1/devices/123456789/notes",
            token="test-token",
        )
        self.assertEqual(kept["credentials"], secret)
        status, removed = self.request(
            "DELETE",
            "/api/v1/devices/123456789/log/%s" % first["id"],
            token="test-token",
        )
        self.assertEqual(status, 200)
        status, after = self.request(
            "GET",
            "/api/v1/devices/123456789/notes",
            token="test-token",
        )
        self.assertEqual([entry["text"] for entry in after["log"]], ["checked the scanner"])
        devices = (data_dir / "devices.json").read_text(encoding="utf-8")
        self.assertNotIn(secret, devices)
        status, spare = self.request(
            "POST",
            "/api/v1/clients",
            {"name": "Spare", "email": "spare@example.com"},
            token="test-token",
        )
        self.assertEqual(status, 200)
        spare_secret = "sda-credential-spare-door-code"
        status, _ = self.request(
            "PUT",
            "/api/v1/devices/%s/notes" % spare["invite"],
            {"credentials": spare_secret},
            token="test-token",
        )
        self.assertEqual(status, 200)
        status, _ = self.request(
            "DELETE",
            "/api/v1/clients/%s" % spare["invite"],
            token="test-token",
        )
        self.assertEqual(status, 200)
        stored = (data_dir / "notes.json").read_text(encoding="utf-8")
        self.assertNotIn(spare_secret, stored)
        self.assertNotIn(spare["invite"], json.loads(stored)["owners"])

    def test_web_status_hides_secrets_and_lists_offline(self):
        status, created = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Marys-Mac",
                "email": "mary@example.com",
                "password": "secret-password",
                "platform": "macos",
            },
        )
        self.assertEqual(status, 200)
        self.assertTrue(created.get("device_token"))
        status, renamed = self.request(
            "PATCH",
            "/api/v1/devices/123456789",
            {"alias": "Mary Laptop"},
            token="test-token",
        )
        self.assertEqual(status, 200)

        status, denied = self.request("GET", "/api/v1/web-status")
        self.assertEqual(status, 401)

        status, body = self.request("GET", "/api/v1/web-status", token="test-token")
        self.assertEqual(status, 200)
        devices = body.get("devices") or []
        self.assertEqual(len(devices), 1)
        row = devices[0]
        self.assertEqual(row["id"], "123456789")
        self.assertEqual(row["alias"], "Mary Laptop")
        self.assertEqual(row["hostname"], "Marys-Mac")
        self.assertTrue(row["online"])
        blob = json.dumps(body)
        self.assertNotIn("secret-password", blob)
        self.assertNotIn(created["device_token"], blob)
        self.assertNotIn("password", row)
        self.assertNotIn("device_token", row)
        self.assertNotIn("email", row)

    def test_device_secrets_are_encrypted_at_rest(self):
        secret = "secret-password"
        status, created = self.request(
            "POST",
            "/api/v1/devices",
            {
                "id": "123456789",
                "hostname": "Marys-Mac",
                "email": "mary@example.com",
                "password": secret,
                "platform": "macos",
            },
        )
        self.assertEqual(status, 200)
        token = created["device_token"]
        self.assertTrue(token)
        self.assertFalse(token.startswith(companion.ENC_PREFIX))

        stored = json.loads(Path(self.tmp.name, "devices.json").read_text(encoding="utf-8"))
        record = stored["devices"]["123456789"]
        self.assertTrue(record["password"].startswith(companion.ENC_PREFIX))
        self.assertTrue(record["device_token"].startswith(companion.ENC_PREFIX))
        self.assertNotIn(secret, json.dumps(stored))
        self.assertNotIn(token, json.dumps(stored))

        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(status, 200)
        self.assertEqual(listed["devices"][0]["password"], secret)
        self.assertNotIn("device_token", listed["devices"][0])

        status, public = self.request("GET", "/api/v1/web-status", token="test-token")
        self.assertEqual(status, 200)
        self.assertNotIn(secret, json.dumps(public))

    def test_migrates_legacy_plaintext_secrets_on_startup(self):
        self.server.shutdown()
        self.server.server_close()
        data_dir = Path(self.tmp.name)
        legacy = {
            "devices": {
                "123456789": {
                    "id": "123456789",
                    "hostname": "Office-PC",
                    "email": "pat@example.com",
                    "password": "legacy-password",
                    "device_token": "legacy-device-token",
                    "first_seen": 1,
                    "last_seen": 1,
                }
            }
        }
        (data_dir / "devices.json").write_text(json.dumps(legacy), encoding="utf-8")
        self.server = companion.serve("127.0.0.1", 0, data_dir)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:%s" % self.server.server_address[1]

        stored = json.loads((data_dir / "devices.json").read_text(encoding="utf-8"))
        record = stored["devices"]["123456789"]
        self.assertTrue(record["password"].startswith(companion.ENC_PREFIX))
        self.assertTrue(record["device_token"].startswith(companion.ENC_PREFIX))
        blob = json.dumps(stored)
        self.assertNotIn("legacy-password", blob)
        self.assertNotIn("legacy-device-token", blob)

        status, listed = self.request("GET", "/api/v1/devices", token="test-token")
        self.assertEqual(status, 200)
        self.assertEqual(listed["devices"][0]["password"], "legacy-password")

        status, updated = self.request(
            "POST",
            "/api/v1/devices",
            {"id": "123456789", "hostname": "Office-PC", "device_token": "legacy-device-token"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["device_token"], "legacy-device-token")

    def test_save_state_writes_private_file(self):
        import sync_web_peers

        path = Path(self.tmp.name) / "web-alias-state.json"
        old = sync_web_peers.STATE_PATH
        sync_web_peers.STATE_PATH = path
        try:
            sync_web_peers.save_state({"123456789": {"alias": "Front desk"}})
        finally:
            sync_web_peers.STATE_PATH = old
        self.assertTrue(path.is_file())
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["123456789"]["alias"], "Front desk")

    def test_notes_rate_limit(self):
        status, _ = self._register()
        self.assertEqual(status, 200)
        old = companion.ADMIN_LIMIT
        companion.ADMIN_LIMIT = 2
        try:
            self.assertEqual(
                self.request("GET", "/api/v1/devices/123456789/notes", token="test-token")[0],
                200,
            )
            self.assertEqual(
                self.request("GET", "/api/v1/devices/123456789/notes", token="test-token")[0],
                200,
            )
            status, body = self.request(
                "GET",
                "/api/v1/devices/123456789/notes",
                token="test-token",
            )
            self.assertEqual(status, 429)
            self.assertEqual(body["error"], "too many requests")
        finally:
            companion.ADMIN_LIMIT = old

    def request_raw(self, method, path, payload=None, cookie=None):
        data = None if payload is None else json.dumps(payload).encode()
        headers = {}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if cookie:
            headers["Cookie"] = cookie
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as err:
            return err.code, err.headers, err.read()

    def test_admin_2fa_check_and_verify(self):
        status, headers, body = self.request_raw("GET", "/api/v1/admin-2fa/check")
        self.assertEqual(status, 401)
        self.assertIn(b"unauthorized", body)

        status, headers, body = self.request_raw("GET", "/api/v1/admin-2fa")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers.get("Content-Type", ""))
        self.assertIn(b"Admin verification", body)
        self.assertIn(b"#6d28d9", body)
        self.assertIn(b"#2563eb", body)

        status, headers, body = self.request_raw(
            "POST",
            "/api/v1/admin-2fa/verify",
            {"code": "000000"},
        )
        self.assertEqual(status, 401)

        code = admin_2fa.totp_code(self.totp_secret)
        status, headers, body = self.request_raw(
            "POST",
            "/api/v1/admin-2fa/verify",
            {"code": code},
        )
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode())["ok"], True)
        set_cookie = headers.get("Set-Cookie") or ""
        self.assertIn(admin_2fa.COOKIE_NAME + "=", set_cookie)
        self.assertIn("HttpOnly", set_cookie)
        self.assertIn("Secure", set_cookie)
        self.assertIn("SameSite=Strict", set_cookie)
        self.assertIn("Max-Age=43200", set_cookie)
        cookie = set_cookie.split(";", 1)[0]
        self.assertTrue(cookie.startswith(admin_2fa.COOKIE_NAME + "="))

        status, headers, body = self.request_raw("GET", "/api/v1/admin-2fa/check", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode())["ok"], True)

        status, headers, body = self.request_raw(
            "GET",
            "/api/v1/admin-2fa/check",
            cookie=admin_2fa.COOKIE_NAME + "=v1.9999999999." + ("0" * 64),
        )
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
