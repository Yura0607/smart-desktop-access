#Requires -RunAsAdministrator
# Installs the scan server on the PC with the USB scanner (run in an elevated "Run as administrator" PowerShell).
# SDA-ScanServer.ps1 and this script must be in C:\ProgramData\SDA-Scan\
#   -Mode System (default): task "SDA Scan Server" runs at boot as SYSTEM - no Windows logon needed.
#   -Mode Logon           : fallback - task runs when -User signs in (someone must be logged in to scan).
#   Token prompt: press Enter to keep the token already in config.json (or generate one if there is none).
param(
    [ValidateSet('System', 'Logon')][string]$Mode = 'System',
    [int]$Port = 8765,
    [string]$User = '',
    [int]$StartupDelay = 60,
    [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:ProgramData 'SDA-Scan'
$Server = Join-Path $Dir 'SDA-ScanServer.ps1'
if (-not (Test-Path $Server)) { throw "Not found: $Server" }
if ($Mode -eq 'Logon') {
    if (-not $User) { $User = (Get-CimInstance Win32_ComputerSystem).UserName }
    if (-not $User) { throw 'Could not detect the signed-in user. Pass -User "PC\name".' }
}
Write-Host "Mode: $Mode$(if ($User) { " (user $User)" })"

# ---- token / config.json
$cfgFile = Join-Path $Dir 'config.json'
$old = $null
if (Test-Path $cfgFile) { try { $old = Get-Content -Path $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch {} }
$sec = Read-Host 'Token (shared secret; press Enter to keep the current one / generate a new one)' -AsSecureString
$Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$generated = $false
if (-not $Token -and $old -and $old.Token) { $Token = [string]$old.Token; Write-Host 'Keeping the current token.' }
if (-not $Token) {
    $b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    $Token = -join ($b | ForEach-Object { $_.ToString('x2') }); $generated = $true
}
if ($Token.Length -lt 24) { throw 'Token is too short (minimum 24 characters).' }
[pscustomobject]@{ Token = $Token; Port = $Port } | ConvertTo-Json | Set-Content -Path $cfgFile -Encoding UTF8
$grants = @('*S-1-5-18:(F)', '*S-1-5-32-544:(F)')
if ($User) { $grants += "${User}:(R)" }
& icacls.exe $cfgFile /inheritance:r /grant:r @grants | Out-Null
Write-Host "config.json written; access only: SYSTEM, Administrators$(if ($User) { ", $User" })"
if ($User) {
    # the logon-mode server runs as the user and must be able to write scan.log
    & icacls.exe $Dir /grant "${User}:(OI)(CI)M" | Out-Null
}

# ---- stop any running server before re-registering
$taskName = 'SDA Scan Server'
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'SDA-ScanServer\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

# ---- URL ACL: SYSTEM, Administrators and (logon mode) the user may listen on the port
$sddl = 'D:(A;;GX;;;SY)(A;;GX;;;BA)'
if ($User) { $sid = (New-Object Security.Principal.NTAccount($User)).Translate([Security.Principal.SecurityIdentifier]).Value; $sddl += "(A;;GX;;;$sid)" }
& netsh.exe http delete urlacl url=http://+:$Port/ 2>$null | Out-Null
& netsh.exe http add urlacl url=http://+:$Port/ sddl=$sddl | Out-Host

# ---- firewall: Private profile only, local subnet only
$ruleName = "SDA Scan Server (TCP $Port)"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host "Firewall rule '$ruleName' created (Private, LocalSubnet)"

# ---- scheduled task
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$taskArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Server`""
if ($Mode -eq 'System') {
    $taskArgs += " -StartupDelay $StartupDelay"
    # boot trigger + a 5-minute watchdog trigger: if the server process ever exits, the next tick starts it again
    # (Task Scheduler's "restart on failure" only retries launches that fail, not a process that exits later).
    # A running instance makes the watchdog tick a no-op (MultipleInstances IgnoreNew + single-instance mutex).
    $boot = New-ScheduledTaskTrigger -AtStartup
    $watch = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date.AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $trigger = @($boot, $watch)
    $principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
    $desc = 'Smart Desktop Access: shares the USB scanner on the local network (starts at boot as SYSTEM, no logon needed)'
} else {
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
    $principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
    $desc = 'Smart Desktop Access: shares the USB scanner on the local network (starts when the user signs in)'
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs -WorkingDirectory $Dir
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $desc | Out-Null
if (-not $NoStart) {
    Start-ScheduledTask -TaskName $taskName
    Start-Sleep -Seconds 5
}
Get-ScheduledTask -TaskName $taskName | Format-Table TaskName, State -AutoSize
if ($generated) { Write-Host 'A new token was generated - it is only in config.json; copy it to the client.' }
Write-Host "Done. Log: $(Join-Path $Dir 'scan.log')"
