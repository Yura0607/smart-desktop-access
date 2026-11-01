import json
import os
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
        self.assertIn(email_text.WINDOWS_URL, text)
        self.assertIn(email_text.MAC_ARM_URL, text)
        self.assertIn(email_text.MAC_INTEL_URL, text)
        self.assertNotIn("RustDesk", text)
        self.assertNotIn("129.213.112.22", text)

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


if __name__ == "__main__":
    unittest.main()
