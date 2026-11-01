"""English installation email for non-technical customers.

Keep this wording in step with flutter/lib/common/sda/email_text.dart.
The download names are the stable GitHub release asset names.
"""

SOURCE_URL = "https://github.com/Yura0607/smart-desktop-access"
DOWNLOAD_PAGE_URL = SOURCE_URL + "/releases/latest"
WINDOWS_URL = DOWNLOAD_PAGE_URL + "/download/SmartDesktopAccess-windows-x64.exe"
MAC_ARM_URL = DOWNLOAD_PAGE_URL + "/download/SmartDesktopAccess-macos-arm64.dmg"
MAC_INTEL_URL = DOWNLOAD_PAGE_URL + "/download/SmartDesktopAccess-macos-x64.dmg"
PUBLIC_COMPANION = "https://smartdesktopaccess.duckdns.org/companion"

SUBJECT = "Your Smart Desktop Access program"


def direct_url(kind: str) -> str:
    if kind == "windows":
        return WINDOWS_URL
    if kind == "mac":
        return MAC_ARM_URL
    if kind == "mac-intel":
        return MAC_INTEL_URL
    return ""


def download_links(invite: str = "") -> tuple[str, str, str]:
    if not invite:
        return WINDOWS_URL, MAC_ARM_URL, MAC_INTEL_URL
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

All downloads are also listed here: {DOWNLOAD_PAGE_URL}
"""


def mailto(address: str, invite: str = "") -> str:
    from urllib.parse import quote

    return "mailto:%s?subject=%s&body=%s" % (
        address,
        quote(SUBJECT),
        quote(body(invite)),
    )
