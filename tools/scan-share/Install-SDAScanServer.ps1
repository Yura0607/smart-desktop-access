#Requires -RunAsAdministrator
# Installs the scan server on the PC with the USB scanner (run in an elevated "Run as administrator" PowerShell).
# SDA-ScanServer.ps1 and this script must be in C:\ProgramData\SDA-Scan\
param(
    [int]$Port = 8765,
    [string]$User = ''
)
$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:ProgramData 'SDA-Scan'
$Server = Join-Path $Dir 'SDA-ScanServer.ps1'
if (-not (Test-Path $Server)) { throw "Not found: $Server" }
if (-not $User) { $User = (Get-CimInstance Win32_ComputerSystem).UserName }
if (-not $User) { throw 'Could not detect the signed-in user. Pass -User "PC\name".' }
Write-Host "Server will run as: $User"

$sec = Read-Host 'Token (shared secret; press Enter to generate a new one)' -AsSecureString
$Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$generated = $false
if (-not $Token) {
    $b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    $Token = -join ($b | ForEach-Object { $_.ToString('x2') }); $generated = $true
}
if ($Token.Length -lt 24) { throw 'Token is too short (minimum 24 characters).' }

$cfgFile = Join-Path $Dir 'config.json'
[pscustomobject]@{ Token = $Token; Port = $Port } | ConvertTo-Json | Set-Content -Path $cfgFile -Encoding UTF8
& icacls.exe $cfgFile /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' "${User}:(R)" | Out-Null
Write-Host "config.json written; access only: SYSTEM, Administrators, $User"

# URL ACL so the server can listen on the port without admin rights
& netsh.exe http delete urlacl url=http://+:$Port/ 2>$null | Out-Null
& netsh.exe http add urlacl url=http://+:$Port/ user="$User" | Out-Host

# Firewall: Private profile only, local subnet only
$ruleName = "SDA Scan Server (TCP $Port)"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host "Firewall rule '$ruleName' created (Private, LocalSubnet)"

# Scheduled task at user logon
$taskName = 'SDA Scan Server'
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Server`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'Smart Desktop Access: shares the USB scanner on the local network' | Out-Null
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 4
Get-ScheduledTask -TaskName $taskName | Format-Table TaskName, State -AutoSize
if ($generated) { Write-Host 'A new token was generated - it is only in config.json; copy it to the client.' }
Write-Host "Done. Log: $(Join-Path $Dir 'scan.log')"
