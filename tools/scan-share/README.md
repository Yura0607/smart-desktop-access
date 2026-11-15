# SDA Scan Share

Free tool for scanning on a USB scanner attached to another PC on the same local network.
It uses only Windows PowerShell 5.1 and the built-in WIA COM API, with no extra software.

- **Server** (`SDA-ScanServer.ps1`) runs on the PC with the USB scanner (DR2-PC, Brother MFC-L2760DW).
- **Client** (`SDA-Scan.ps1` + `SDA-Scan.vbs`) runs on the other PC (DR1-PC) and has a small English window: **Scan**, PDF output, and a choice of where to save.

## Using it (on DR1)

1. Put the document on the scanner glass (or in the feeder) of the Brother next to DR2.
2. Double-click the desktop shortcut **Scan from Brother (DR2)**.
3. Choose the quality (DPI), Color or Grayscale, and Scanner glass or Document feeder (ADF).
4. **Save to:** shows the folder (default `Documents\Scans`). Use **Browse...** to change it. The last folder is remembered.
   Tick **Ask where to save each time (Save As)** to get a Save As dialog for every scan.
5. Click **Scan**. The PDF is saved as `scan-YYYYMMDD-HHMMSS.pdf` and opens automatically.

If something is wrong, a message box explains it in plain English. Common causes:
- DR2-PC is off, or nobody is signed in there. The server runs in the signed-in user's session.
- The scanner is busy with another scan.
- The Brother is turned off or unplugged from USB.

## How it works

- The server listens on `http://DR2-PC:8765/`, which Windows HTTP.sys reserves through a URL ACL.
  - `GET /status` returns JSON: ok, version, host, busy, scanner.
  - `GET /scan?format=pdf|jpg&dpi=100|150|200|300|600&color=1|0&source=flatbed|adf` returns the scanned file.
- Security:
  - Every request must carry the header `X-SDA-Token: <token>`.
  - Only local-subnet addresses are accepted, and the firewall rule allows Private profile and LocalSubnet only.
  - One scan runs at a time; a second request gets HTTP 409.
- The token is stored only in `C:\ProgramData\SDA-Scan\config.json` on both PCs. The file is ACL-restricted to SYSTEM, Administrators and the user.
  - It is never in this repository. `<TOKEN>` below is a placeholder.
- Server log: `C:\ProgramData\SDA-Scan\scan.log` (rotates at 1 MB).
- The client always uses the computer name `DR2-PC`, never an IP address.

## Installing

Copy all files to `C:\ProgramData\SDA-Scan\` on both PCs.

**Server PC (DR2), in an elevated "Run as administrator" PowerShell:**

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force   # this window only
& C:\ProgramData\SDA-Scan\Install-SDAScanServer.ps1
# Token prompt: type <TOKEN>, or press Enter to generate a new one (it is then only in config.json).
```

The server installer:
- writes `config.json`;
- adds the URL ACL `http://+:8765/` for the signed-in user;
- adds the firewall rule **SDA Scan Server (TCP 8765)** (Inbound, Private, LocalSubnet);
- registers and starts the scheduled task **SDA Scan Server**. It runs at the user's logon, hidden, and restarts every minute after a failure.

**Client PC (DR1), in a normal PowerShell:**

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force   # this window only
& C:\ProgramData\SDA-Scan\Install-SDAScanClient.ps1
# Token prompt: type the same <TOKEN> as on the server (Enter keeps the current one).
```

The client installer writes `config.json` and creates the desktop shortcut **Scan from Brother (DR2)** (`wscript.exe SDA-Scan.vbs`, no console window).

## Removing

```powershell
# DR2, elevated PowerShell:
& C:\ProgramData\SDA-Scan\Uninstall-SDAScanServer.ps1 -RemoveFiles
# DR1, normal PowerShell:
& C:\ProgramData\SDA-Scan\Uninstall-SDAScanClient.ps1 -RemoveFiles
```

These remove the task, firewall rule, URL ACL, shortcut and the `C:\ProgramData\SDA-Scan` folder. Saved scans are kept.

## Notes

- Why a scheduled task at logon and not a service: WIA scanning works reliably in an interactive user session. The server therefore runs as the signed-in user, without admin rights.
- If DR2 restarts, the server starts again when someone signs in.
