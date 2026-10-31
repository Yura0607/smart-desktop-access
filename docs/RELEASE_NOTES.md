# Smart Desktop Access

Two programs from one build:

- **Smart Desktop Access** is installed on the customer's computer. It only accepts connections. It sets a permanent password, starts with Windows (service) or macOS (background helper), and asks for an email address once.
- **Smart Desktop Access Admin** is the program you keep. It only makes connections. The Computers list has Connect, Disconnect, and Send email.

The ID and relay server is `129.213.112.22`. Customers do not type a server address.

## Downloads

Stable names, so the install email can keep pointing at "latest":

- `SmartDesktopAccess-windows-x64.exe` and `.msi` — customer, Windows
- `SmartDesktopAccess-macos-arm64.dmg` — customer, Macs from about 2020
- `SmartDesktopAccess-macos-x64.dmg` — customer, older Intel Macs
- `SmartDesktopAccessAdmin-windows-x64.exe` — your Windows app
- `SmartDesktopAccessAdmin-macos-arm64.dmg` and `-macos-x64.dmg` — your Mac app
- `SmartDesktopAccessAdmin-android-arm64.apk` — your Android phone
- `SmartDesktopAccessAdmin-ios-unsigned.zip` — your iPhone or iPad

These files are not signed. Windows shows a warning; click More info, then Run anyway. On a Mac, if the system says the app cannot be opened, use Privacy & Security and click Open Anyway.

## iPhone and iPad

There is no App Store build and no paid Apple developer account. The iOS artifact is unsigned.

- You can install it with a free sideload tool (AltStore or Sideloadly) while the phone is on the same Apple ID.
- A free sideload expires after about 7 days. The phone then needs the computer again to refresh it.
- Apple allows a small number of sideloaded apps on a free account.
- The zip contains the unsigned app. An `.ipa` is added when the build is able to export one without a signing team.

Full control of a customer's computer still uses the Windows or Mac client on their machine. The phone app is the admin, not the client.

## Before the first customer

1. Deploy `server/companion` on the Oracle VM (see `server/companion/README.md`).
2. Copy the companion token into Smart Desktop Access Admin.
3. Optional: put your SMTP account in `/etc/sda-companion.env`. Until then, Send email opens your own mail program with the message already written.
