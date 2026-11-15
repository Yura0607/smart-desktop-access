# Removes the scan client (normal PowerShell).
param([switch]$RemoveFiles)
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Scan from Brother (DR2).lnk'
Remove-Item -Force -ErrorAction SilentlyContinue $lnk
# older Ukrainian-named shortcut from v1.0.0
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Сканувати з Brother (DR2).lnk')
if ($RemoveFiles) { Remove-Item -Recurse -Force (Join-Path $env:ProgramData 'SDA-Scan') -ErrorAction SilentlyContinue }
Write-Host 'Scan client removed (scans in Documents\Scans are kept).'
