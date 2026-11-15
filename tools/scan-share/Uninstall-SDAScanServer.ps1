#Requires -RunAsAdministrator
# Removes the scan server (elevated "Run as administrator" PowerShell).
param([int]$Port = 8765, [switch]$RemoveFiles)
$taskName = 'SDA Scan Server'
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'SDA-ScanServer\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-NetFirewallRule -DisplayName "SDA Scan Server (TCP $Port)" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
& netsh.exe http delete urlacl url=http://+:$Port/ | Out-Host
if ($RemoveFiles) { Remove-Item -Recurse -Force (Join-Path $env:ProgramData 'SDA-Scan') -ErrorAction SilentlyContinue }
Write-Host 'Scan server removed.'
