#!/usr/bin/env python3
"""Point macOS and Windows packaging names at the admin variant.

Android and iOS sources already use the admin name. The Rust crate reads
SDA_VARIANT on its own. Run this before a desktop admin build.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PAIRS = (
    ("com.smartdesktopaccess.client", "com.smartdesktopaccess.admin"),
    ("PRODUCT_NAME = SmartDesktopAccess\n", "PRODUCT_NAME = SmartDesktopAccessAdmin\n"),
    ("<string>smartdesktopaccess</string>", "<string>smartdesktopaccessadmin</string>"),
    ("<string>Smart Desktop Access</string>", "<string>Smart Desktop Access Admin</string>"),
    (
        'VALUE "FileDescription", "Smart Desktop Access"',
        'VALUE "FileDescription", "Smart Desktop Access Admin"',
    ),
    (
        'VALUE "InternalName", "SmartDesktopAccess"',
        'VALUE "InternalName", "SmartDesktopAccessAdmin"',
    ),
    (
        'VALUE "OriginalFilename", "SmartDesktopAccess.exe"',
        'VALUE "OriginalFilename", "SmartDesktopAccessAdmin.exe"',
    ),
    (
        'VALUE "ProductName", "Smart Desktop Access"',
        'VALUE "ProductName", "Smart Desktop Access Admin"',
    ),
)

FILES = (
    "flutter/macos/Runner/Configs/AppInfo.xcconfig",
    "flutter/macos/Runner/Info.plist",
    "flutter/macos/Runner.xcodeproj/project.pbxproj",
    "flutter/windows/runner/Runner.rc",
)


def main() -> None:
    if os.environ.get("SDA_VARIANT") != "admin":
        print("SDA_VARIANT is not admin; leaving client names in place")
        return
    for relative in FILES:
        path = ROOT / relative
        text = path.read_text(encoding="utf-8")
        updated = text
        for old, new in PAIRS:
            if new in updated:
                continue
            updated = updated.replace(old, new)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            print(f"updated {relative}")


if __name__ == "__main__":
    main()
