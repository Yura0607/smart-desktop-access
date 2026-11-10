# Smart Desktop Access

Remote access for Yuriy's customers. Two programs, one server, no account to configure.

| Program | Who runs it | What it does |
| --- | --- | --- |
| Smart Desktop Access | The customer's Windows or Mac computer | Accepts connections only. One install, then it starts with the computer. |
| Smart Desktop Access Admin | Yuriy, on Windows, Mac, Android, or iPhone/iPad | Connects out only. Lists every customer computer. |

The ID and relay server is built in: `smartdesktopaccess.duckdns.org` (ports 21116 and 21117), public key `IZnoUoa33KdpLzeQLzosH7I8oo6vRNVjv8MxezPM5Rc=`. Account login is `https://smartdesktopaccess.duckdns.org`. The companion is `https://smartdesktopaccess.duckdns.org/companion`. Change the host, and only the host, in [`src/product.rs`](src/product.rs).

Based on open-source software, [AGPL-3.0](LICENSE). Source: https://github.com/Yura0607/smart-desktop-access

## Installers

GitHub Release assets, from the **Smart Desktop Access release** workflow (tag `sda-v*`, or run it by hand). The file names stay the same on every release so the email links keep working:

`https://github.com/Yura0607/smart-desktop-access/releases/latest`

See [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) for the file list and the iPhone sideload limits. Builds are unsigned. No paid signing account is required.

A 32-bit Windows customer installer is also built: `SmartDesktopAccess-windows-x86.exe`. Flutter cannot target 32-bit Windows, so that build uses the older Sciter UI. It is the same incoming-only client (server address and key are built in, permanent password, companion registration, autostart service, Deactivate uninstalls itself), but the window is the legacy desktop UI with an approximate purple-and-blue theme. There is no 32-bit MSI and no 32-bit Admin app. GitHub Actions workflow **Smart Desktop Access Windows x86** produces it; the regular Windows and release workflows include it with the 64-bit client as well.

## Customer list and email

hbbs does not have a device list. [`server/companion`](server/companion/README.md) is a small Python service for the same Ubuntu VM. The client registers itself. The admin app shows Connect, Disconnect, and Send email. Deploy steps are in that README. This repository does not install it on the server.

Send email uses the SMTP account in `/etc/sda-companion.env`. If that is empty, the button opens the mail program with the English instructions already filled in.

## Web

[docs/WEB.md](docs/WEB.md) describes the browser admin that the companion serves and the web client. Requirement: the web client gives full remote control (screen, mouse, keyboard, and everything else) from any browser on iPad, phones, Mac and Windows. It is not view-only. The native admin app stays as it is. See [REQUIREMENTS.md](REQUIREMENTS.md).

## Build on a workstation

The desktop binary name follows `SDA_VARIANT`:

```sh
# customer app (incoming only) — the default
cargo build --features flutter

# admin app (outgoing only)
SDA_VARIANT=admin cargo build --features flutter
```

Flutter packaging uses the same variable. `res/sda/apply_variant.py` renames the macOS bundle and the Windows version resource when `SDA_VARIANT=admin`. Android and iOS projects in the tree are already the admin app.

The 32-bit Windows client is not a local Flutter build. GitHub Actions compiles it with `cargo build --features inline,vram,hwcodec` for `i686-pc-windows-msvc` and packs `sciter.dll` (the free 32-bit Sciter runtime) into `SmartDesktopAccess-windows-x86.exe`.
