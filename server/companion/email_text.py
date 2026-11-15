"""English installation email for non-technical customers.

Keep this wording in step with flutter/lib/common/sda/email_text.dart.
Installer files are served from SDA_DOWNLOAD_BASE.
"""

import os

DEFAULT_DOWNLOAD_BASE = "https://smartdesktopaccess.duckdns.org/downloads"
WINDOWS_NAME = "SmartDesktopAccess-windows-x64.exe"
MAC_ARM_NAME = "SmartDesktopAccess-macos-arm64.dmg"
MAC_INTEL_NAME = "SmartDesktopAccess-macos-x64.dmg"
PUBLIC_COMPANION = "https://smartdesktopaccess.duckdns.org/companion"

SUBJECT = "Your Smart Desktop Access program"

_FILES = {
    "windows": WINDOWS_NAME,
    "mac": MAC_ARM_NAME,
    "mac-intel": MAC_INTEL_NAME,
}


def download_base() -> str:
    raw = os.environ.get("SDA_DOWNLOAD_BASE", "").strip().rstrip("/")
    return raw or DEFAULT_DOWNLOAD_BASE


def direct_url(kind: str) -> str:
    name = _FILES.get(kind, "")
    if not name:
        return ""
    return download_base() + "/" + name


def download_links(invite: str = "") -> tuple[str, str, str]:
    if not invite:
        return direct_url("windows"), direct_url("mac"), direct_url("mac-intel")
    base = PUBLIC_COMPANION + "/d/" + invite
    return base + "/windows", base + "/mac", base + "/mac-intel"


def body(invite: str = "") -> str:
    windows_url, mac_arm_url, mac_intel_url = download_links(invite)
    return f"""Hello,

This is the program that lets your helper work on your computer with you.

Please install it once. After that you do not need to do anything else. Your computer can be reached when it is turned on and connected to the internet.

Windows
1. Download the Windows installer: {windows_url}
2. Open the downloaded file.
3. If Windows asks whether to allow changes, click Yes.
4. Click Install and wait until it finishes.
5. If a box asks for your email address, type the address this message was sent to, then click Save.
6. You can close the window. A small icon stays near the clock. That means the program is ready.

Mac (most Macs from 2020 onward, Apple silicon)
1. Download the Mac installer: {mac_arm_url}
2. Open the downloaded file and drag Smart Desktop Access into Applications.
3. Open Applications and double-click Smart Desktop Access.
4. If the Mac says the app cannot be opened: click Done, then open System Settings, go to Privacy & Security, and click Open Anyway.
5. When the Mac asks for Screen Recording, Accessibility, and Input Monitoring, turn each one on. The program needs these so your helper can see the screen and use the mouse and keyboard.
6. If a box asks for your email address, type the address this message was sent to, then click Save.
7. If it offers to install a background helper, click Install. That starts the program when you log in.

Older Intel Mac
Download this installer instead: {mac_intel_url}
Then follow the same Mac steps above.

You only do this once. If something does not work, reply to this email.

All downloads are also listed here: {download_base()}
"""


def mailto(address: str, invite: str = "") -> str:
    from urllib.parse import quote

    return "mailto:%s?subject=%s&body=%s" % (
        address,
        quote(SUBJECT),
        quote(body(invite)),
    )
