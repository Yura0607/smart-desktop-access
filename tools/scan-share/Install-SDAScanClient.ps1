# Installs the scan client (normal PowerShell, no admin rights needed).
# SDA-Scan.ps1, SDA-Scan.vbs and this script must be in C:\ProgramData\SDA-Scan\
param([string]$ServerHost = 'DR2-PC', [int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:ProgramData 'SDA-Scan'
$Client = Join-Path $Dir 'SDA-Scan.ps1'
$Launcher = Join-Path $Dir 'SDA-Scan.vbs'
foreach ($f in @($Client, $Launcher)) { if (-not (Test-Path $f)) { throw "Not found: $f" } }
$cfgFile = Join-Path $Dir 'config.json'
$sec = Read-Host 'Token (the same one as on the server; press Enter to keep the current one)' -AsSecureString
$Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
if (-not $Token -and (Test-Path $cfgFile)) {
    try { $Token = [string](Get-Content -Path $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json).Token } catch {}
    if ($Token) { Write-Host 'Keeping the current token.' }
}
if (-not $Token -or $Token.Length -lt 24) { throw 'Token is empty or too short.' }
[pscustomobject]@{ Token = $Token; Host = $ServerHost; Port = $Port } | ConvertTo-Json | Set-Content -Path $cfgFile -Encoding UTF8
$me = "$env:USERDOMAIN\$env:USERNAME"
& icacls.exe $cfgFile /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' "${me}:(F)" | Out-Null
Write-Host "config.json written (access: SYSTEM, Administrators, $me)"
$desk = [Environment]::GetFolderPath('Desktop')
$lnkName = 'Scan from Brother (DR2).lnk'
$sh = New-Object -ComObject WScript.Shell
$tmp = Join-Path $desk 'SDA-Scan-tmp.lnk'; $lnk = $sh.CreateShortcut($tmp)
$lnk.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$lnk.Arguments = "`"$Launcher`""
$lnk.WorkingDirectory = $Dir
$lnk.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',16'
$lnk.Description = 'Scan from the Brother on DR2-PC'
$lnk.Save(); Move-Item -Force $tmp (Join-Path $desk $lnkName)
# remove the older Ukrainian-named shortcut from v1.0.0, if present
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $desk ([string][char]0x0421 + [string][char]0x043A + [string][char]0x0430 + [string][char]0x043D + [string][char]0x0443 + [string][char]0x0432 + [string][char]0x0430 + [string][char]0x0442 + [string][char]0x0438 + ' ' + [string][char]0x0437 + ' Brother (DR2).lnk'))
Write-Host "Shortcut created: $(Join-Path $desk $lnkName)"
