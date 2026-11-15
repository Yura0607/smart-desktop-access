# Smart Desktop Access

Two programs from one build:

- **Smart Desktop Access** is installed on the customer's computer. It only accepts connections. It sets a permanent password, starts with Windows (service) or macOS (background helper), and asks for an email address once.
- **Smart Desktop Access Admin** is the program you keep. It only makes connections. The Computers list has Connect, Disconnect, and Send email.

The ID and relay server is `smartdesktopaccess.duckdns.org`. Customers do not type a server address.

## Downloads

Stable names, so the install email can keep pointing at "latest":

- `SmartDesktopAccess-windows-x64.exe` and `.msi` — customer, 64-bit Windows
- `SmartDesktopAccess-windows-x86.exe` — customer, 32-bit Windows (legacy Sciter UI; see below)
- `SmartDesktopAccess-macos-arm64.dmg` — customer, Macs from about 2020
- `SmartDesktopAccess-macos-x64.dmg` — customer, older Intel Macs
- `SmartDesktopAccessAdmin-windows-x64.exe` — your Windows app
- `SmartDesktopAccessAdmin-macos-arm64.dmg` and `-macos-x64.dmg` — your Mac app
- `SmartDesktopAccessAdmin-android-arm64.apk` — your Android phone
- `SmartDesktopAccessAdmin-ios-unsigned.zip` — your iPhone or iPad

These files are not signed. Windows shows a warning; click More info, then Run anyway. On a Mac, if the system says the app cannot be opened, use Privacy & Security and click Open Anyway.

### 32-bit Windows client

Flutter does not support 32-bit Windows, so this installer uses the older Sciter interface instead of the Flutter window used on 64-bit Windows. The built-in server, incoming-only mode, permanent password, companion registration, service autostart, Deactivate (silent uninstall), and Smart Desktop Access name still come from the same Rust client. Differences:

- The window is the legacy desktop UI. The purple-and-blue theme is approximate.
- There is a portable `.exe` only, not an `.msi`.
- Flutter-only screens (the newer home layout and related desktop polish) are not in this build.
- Voice, video (camera), and chat still use the Rust core, through the Sciter connection manager rather than the Flutter one.
- There is no 32-bit Admin app.

### Mac client: start at login and no password prompt

Same model as 64-bit Windows:

- On first start from Applications, the client installs its login service and macOS asks for an administrator password once. This writes `/Library/LaunchAgents/com.smartdesktopaccess.SmartDesktopAccess_server.plist` (runs the client's server at the login window and in every user session) and `/Library/LaunchDaemons/com.smartdesktopaccess.SmartDesktopAccess_service.plist` (the root helper). After that the client starts by itself on every boot and login.
- Earlier Mac builds wrote these files under a `com.carriez.SmartDesktopAccess_*` name that the app itself did not look for, so it kept asking to install the service on every start. The new installer step removes the old files and writes the new ones.
- The client makes a random permanent password on first run, keeps it in its settings folder, and registers it with the server every minute. The manager and the web client fill it in, and with a correct password no Accept panel appears. Only the logged-in user's copy registers the password; the copy that runs at the login window gets the same password hash from the user session, so the two can no longer drift apart.
- macOS does not let any app grant itself Screen Recording, Accessibility or Input Monitoring. On first start the client opens each system prompt in turn and keeps a card on its window until the switch is on. Without Accessibility the screen still shows but macOS silently ignores remote typing and clicks; the client now tells the person connecting when that is the case.
- After installing a new build, macOS can keep showing the old Accessibility switch as on while it no longer applies (the app is not signed with a paid Apple certificate, so each build looks like a new app). If typing stops working after an update: System Settings > Privacy & Security > Accessibility, select Smart Desktop Access, remove it with the minus button, add it again from Applications, and reconnect. Do the same under Input Monitoring and Screen Recording if needed.

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
