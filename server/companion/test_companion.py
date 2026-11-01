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

import companion
import email_text


class CompanionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["COMPANION_ADMIN_TOKEN"] = "test-token"
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


if __name__ == "__main__":
    unittest.main()
