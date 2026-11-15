# SDA-Scan.ps1
# English WinForms client for the SDA scan server that runs on DR2-PC.
# Requires Windows PowerShell 5.1. The saved file is always a PDF.
#
# Server (settings file C:\ProgramData\SDA-Scan\config.json on both PCs):
#   This client always uses the hostname DR2-PC (never an IP address).
#   Port: 8765, or the Port value in config.json.
#   Auth header: X-SDA-Token (the Token value in config.json).
#   GET /status
#   GET /scan?format=pdf|jpg&dpi=150|200|300&color=1|0&source=flatbed|adf
#
# This client always requests format=pdf. If the server returns a JPEG
# (or a ZIP of JPEGs), each image is wrapped in a minimal PDF (DCTDecode).
#
# Last-used folder and the "ask where to save" option are stored in
# %APPDATA%\SDA-Scan\settings.json. Default folder: Documents\Scans.

param(
    [string]$ConfigPath = (Join-Path $env:ProgramData 'SDA-Scan\config.json')
)

$ErrorActionPreference = 'Stop'
$script:ServerHost = 'DR2-PC'
$script:Title = 'Scan from Brother (DR2)'
$script:DefaultPort = 8765

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

function Show-Error([string]$Message) {
    [void][System.Windows.Forms.MessageBox]::Show(
        $Message,
        $script:Title,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
}

# ---- config (token stays in memory; it is never written to the UI or logs)
try {
    $script:cfg = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Show-Error ("The settings file was not found or could not be read:`r`n{0}`r`n`r`n{1}`r`n`r`nRun the client installer on this PC, using the same token as on DR2-PC." -f $ConfigPath, $_.Exception.Message)
    exit 1
}
if (-not $script:cfg.Token -or [string]$script:cfg.Token -eq '') {
    Show-Error ("The scan token is missing from:`r`n{0}`r`n`r`nRun the client installer on this PC, using the same token as on DR2-PC." -f $ConfigPath)
    exit 1
}
$script:Port = $script:DefaultPort
if ($script:cfg.Port) {
    $parsedPort = 0
    if ([int]::TryParse([string]$script:cfg.Port, [ref]$parsedPort) -and $parsedPort -gt 0 -and $parsedPort -lt 65536) {
        $script:Port = $parsedPort
    }
}

# ---- per-user settings
$script:DefaultDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Scans'
$script:SettingsPath = Join-Path $env:APPDATA 'SDA-Scan\settings.json'

function Get-Settings {
    $result = [pscustomobject]@{
        LastFolder = $script:DefaultDir
        AskSaveAs  = $false
    }
    try {
        if (Test-Path -LiteralPath $script:SettingsPath) {
            $s = Get-Content -Path $script:SettingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($s.LastFolder -and (Test-Path -LiteralPath ([string]$s.LastFolder) -PathType Container)) {
                $result.LastFolder = [string]$s.LastFolder
            }
            if ($null -ne $s.AskSaveAs) {
                $result.AskSaveAs = [bool]$s.AskSaveAs
            }
        }
    } catch {}
    if (-not (Test-Path -LiteralPath $result.LastFolder -PathType Container)) {
        New-Item -ItemType Directory -Force -Path $script:DefaultDir | Out-Null
        $result.LastFolder = $script:DefaultDir
    }
    return $result
}

function Save-Settings([string]$Folder, [bool]$AskSaveAs) {
    try {
        $dir = Split-Path -Parent $script:SettingsPath
        if (-not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }
        $obj = [pscustomobject]@{
            LastFolder = $Folder
            AskSaveAs  = $AskSaveAs
        }
        $obj | ConvertTo-Json | Set-Content -Path $script:SettingsPath -Encoding UTF8
    } catch {}
}

function New-ScanFileName {
    return ('scan-{0:yyyyMMdd-HHmmss}.pdf' -f (Get-Date))
}

function New-ScanPath([string]$Folder) {
    if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
        New-Item -ItemType Directory -Force -Path $Folder | Out-Null
    }
    $name = New-ScanFileName
    $path = Join-Path $Folder $name
    $n = 2
    while (Test-Path -LiteralPath $path) {
        $path = Join-Path $Folder (('scan-{0:yyyyMMdd-HHmmss}-{1}.pdf' -f (Get-Date), $n))
        $n++
    }
    return $path
}

# ---- HTTP helpers
if (-not ('SdaTimedWebClient' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Net;
public class SdaTimedWebClient : WebClient {
    public int TimeoutMs = 600000;
    protected override WebRequest GetWebRequest(Uri address) {
        WebRequest req = base.GetWebRequest(address);
        req.Timeout = this.TimeoutMs;
        HttpWebRequest http = req as HttpWebRequest;
        if (http != null) {
            http.ReadWriteTimeout = this.TimeoutMs;
        }
        return req;
    }
}
'@
}

function New-ScanClient([int]$TimeoutMs) {
    $wc = New-Object SdaTimedWebClient
    $wc.TimeoutMs = $TimeoutMs
    $wc.Encoding = [Text.Encoding]::UTF8
    $wc.Headers.Add('X-SDA-Token', [string]$script:cfg.Token)
    return $wc
}

function Get-ScanUrl([int]$Dpi, [bool]$Color, [bool]$Adf) {
    $c = 0
    if ($Color) { $c = 1 }
    $src = 'flatbed'
    if ($Adf) { $src = 'adf' }
    return ('http://{0}:{1}/scan?format=pdf&dpi={2}&color={3}&source={4}' -f $script:ServerHost, $script:Port, $Dpi, $c, $src)
}

function Get-StatusUrl {
    return ('http://{0}:{1}/status' -f $script:ServerHost, $script:Port)
}

function Get-ErrorText($Exception) {
    if ($null -eq $Exception) { return 'An unknown error occurred.' }
    $we = $Exception
    $guard = 0
    while ($we -and -not ($we -is [System.Net.WebException]) -and $guard -lt 8) {
        $we = $we.InnerException
        $guard++
    }
    if ($we -is [System.Net.WebException]) {
        $st = $we.Status
        $offline = @(
            [System.Net.WebExceptionStatus]::NameResolutionFailure,
            [System.Net.WebExceptionStatus]::ConnectFailure,
            [System.Net.WebExceptionStatus]::ReceiveFailure,
            [System.Net.WebExceptionStatus]::Timeout,
            [System.Net.WebExceptionStatus]::ProxyNameResolutionFailure,
            [System.Net.WebExceptionStatus]::ConnectionClosed,
            [System.Net.WebExceptionStatus]::KeepAliveFailure,
            [System.Net.WebExceptionStatus]::SendFailure,
            [System.Net.WebExceptionStatus]::PipelineFailure
        )
        if ($offline -contains $st) {
            return 'Could not reach DR2-PC. The computer may be turned off, or the scan server is not running (someone must be signed in to Windows on DR2-PC).'
        }
        if ($we.Response) {
            $code = [int]$we.Response.StatusCode
            $body = ''
            try {
                $stream = $we.Response.GetResponseStream()
                $sr = New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8)
                $body = $sr.ReadToEnd()
                $sr.Close()
            } catch {}
            switch ($code) {
                401 { return 'The scan server refused access (the token in the settings file is missing or incorrect).' }
                403 { return 'The scan server only accepts requests from the store network.' }
                409 { return 'The scanner is busy with another scan. Please try again in a minute.' }
                422 {
                    if ($body -match 'ADFEMPTY') {
                        return 'The document feeder is empty. Please put the pages in the feeder tray and try again.'
                    }
                    if ($body -match 'NOADF') {
                        return 'This scanner has no document feeder. Choose Scanner glass (flatbed) instead.'
                    }
                    if ($body) { return ("The scanner does not support this mode.`r`n`r`n{0}" -f $body) }
                    return 'The scanner does not support this mode.'
                }
                503 { return 'No scanner was found on DR2-PC. Check that the Brother is turned on and connected by USB.' }
                default {
                    if ($body) { return ("The scan server returned an error ({0}).`r`n`r`n{1}" -f $code, $body) }
                    return ('The scan server returned an error ({0}).' -f $code)
                }
            }
        }
        return 'Could not reach DR2-PC. The computer may be turned off, or the scan server is not running (someone must be signed in to Windows on DR2-PC).'
    }
    $msg = [string]$Exception.Message
    if ($msg -match 'No such host|could not be resolved|actively refused|Unable to connect|The remote name could not be resolved|timed out|The operation has timed out') {
        return 'Could not reach DR2-PC. The computer may be turned off, or the scan server is not running (someone must be signed in to Windows on DR2-PC).'
    }
    return $msg
}

# ---- JPEG info + minimal PDF wrapper (one JPEG per page, /Filter /DCTDecode)
function Get-JpegInfo([byte[]]$Data) {
    if ($null -eq $Data -or $Data.Length -lt 4) { throw 'The image data is empty.' }
    if ($Data[0] -ne 0xFF -or $Data[1] -ne 0xD8) { throw 'The server returned data that is not a JPEG image.' }
    $i = 2
    $len = $Data.Length
    while ($i + 9 -lt $len) {
        if ($Data[$i] -ne 0xFF) { $i++; continue }
        $marker = $Data[$i + 1]
        if ($marker -eq 0xD8 -or $marker -eq 0xD9) { $i += 2; continue }
        if ($marker -eq 0x00 -or ($marker -ge 0xD0 -and $marker -le 0xD7)) { $i += 2; continue }
        if ($i + 3 -ge $len) { break }
        $seglen = ([int]$Data[$i + 2] -shl 8) + [int]$Data[$i + 3]
        if ($seglen -lt 2) { break }
        # SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
        if (($marker -ge 0xC0 -and $marker -le 0xC3) -or
            ($marker -ge 0xC5 -and $marker -le 0xC7) -or
            ($marker -ge 0xC9 -and $marker -le 0xCB) -or
            ($marker -ge 0xCD -and $marker -le 0xCF)) {
            $h = ([int]$Data[$i + 5] -shl 8) + [int]$Data[$i + 6]
            $w = ([int]$Data[$i + 7] -shl 8) + [int]$Data[$i + 8]
            $comp = [int]$Data[$i + 9]
            if ($w -le 0 -or $h -le 0) { throw 'The JPEG image has an invalid size.' }
            return [pscustomobject]@{ W = $w; H = $h; Components = $comp }
        }
        $i += 2 + $seglen
    }
    throw 'Could not read the size of the JPEG image.'
}

function New-PdfFromJpegs($JpegList, [int]$Dpi) {
    $pages = New-Object System.Collections.ArrayList
    if ($JpegList -is [byte[]]) {
        [void]$pages.Add($JpegList)
    } elseif ($JpegList -is [System.Collections.IEnumerable]) {
        foreach ($item in $JpegList) { [void]$pages.Add([byte[]]$item) }
    } else {
        throw 'There are no pages to put in the PDF.'
    }
    $n = $pages.Count
    if ($n -lt 1) { throw 'There are no pages to put in the PDF.' }
    if ($Dpi -le 0) { $Dpi = 200 }
    $inv = [Globalization.CultureInfo]::InvariantCulture
    $ms = New-Object IO.MemoryStream
    $enc = [Text.Encoding]::ASCII
    $off = @{}
    $write = {
        param([string]$s)
        $b = $enc.GetBytes($s)
        $ms.Write($b, 0, $b.Length)
    }
    & $write "%PDF-1.4`n%"
    $ms.Write([byte[]](0xE2, 0xE3, 0xCF, 0xD3), 0, 4)
    & $write "`n"
    $kids = ((0..($n - 1)) | ForEach-Object { '{0} 0 R' -f (3 + 3 * $_) }) -join ' '
    $off[1] = $ms.Position
    & $write "1 0 obj`n<< /Type /Catalog /Pages 2 0 R >>`nendobj`n"
    $off[2] = $ms.Position
    & $write ("2 0 obj`n<< /Type /Pages /Kids [{0}] /Count {1} >>`nendobj`n" -f $kids, $n)
    for ($i = 0; $i -lt $n; $i++) {
        $jpeg = [byte[]]$pages[$i]
        $info = Get-JpegInfo $jpeg
        $cs = '/DeviceRGB'
        if ($info.Components -eq 1) { $cs = '/DeviceGray' }
        elseif ($info.Components -eq 4) { $cs = '/DeviceCMYK' }
        $pn = 3 + 3 * $i
        $im = $pn + 1
        $cn = $pn + 2
        $ws = ([math]::Round($info.W * 72.0 / $Dpi, 2)).ToString($inv)
        $hs = ([math]::Round($info.H * 72.0 / $Dpi, 2)).ToString($inv)
        $off[$pn] = $ms.Position
        & $write ("{0} 0 obj`n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {1} {2}] /Resources << /XObject << /Im0 {3} 0 R >> >> /Contents {4} 0 R >>`nendobj`n" -f $pn, $ws, $hs, $im, $cn)
        $off[$im] = $ms.Position
        $jlen = $jpeg.Length
        & $write ("{0} 0 obj`n<< /Type /XObject /Subtype /Image /Width {1} /Height {2} /ColorSpace {3} /BitsPerComponent 8 /Filter /DCTDecode /Length {4} >>`nstream`n" -f $im, $info.W, $info.H, $cs, $jlen)
        $ms.Write($jpeg, 0, $jlen)
        & $write "`nendstream`nendobj`n"
        $c = "q $ws 0 0 $hs 0 0 cm /Im0 Do Q"
        $off[$cn] = $ms.Position
        & $write ("{0} 0 obj`n<< /Length {1} >>`nstream`n{2}`nendstream`nendobj`n" -f $cn, $c.Length, $c)
    }
    $total = 3 + 3 * $n
    $xref = $ms.Position
    & $write ("xref`n0 {0}`n0000000000 65535 f `n" -f $total)
    for ($k = 1; $k -lt $total; $k++) {
        & $write ("{0:D10} 00000 n `n" -f [long]$off[$k])
    }
    & $write ("trailer`n<< /Size {0} /Root 1 0 R >>`nstartxref`n{1}`n%%EOF`n" -f $total, $xref)
    return , $ms.ToArray()
}

function Convert-ScanToPdf([byte[]]$Bytes, [int]$Dpi) {
    if ($null -eq $Bytes -or $Bytes.Length -lt 4) {
        throw 'The server returned an empty response.'
    }
    # Already a PDF
    if ($Bytes[0] -eq 0x25 -and $Bytes[1] -eq 0x50 -and $Bytes[2] -eq 0x44 -and $Bytes[3] -eq 0x46) {
        return , $Bytes
    }
    $jpegs = New-Object System.Collections.ArrayList
    if ($Bytes[0] -eq 0xFF -and $Bytes[1] -eq 0xD8) {
        [void]$jpegs.Add($Bytes)
    } elseif ($Bytes[0] -eq 0x50 -and $Bytes[1] -eq 0x4B) {
        Add-Type -AssemblyName System.IO.Compression
        $ms = New-Object IO.MemoryStream(, $Bytes)
        $zip = New-Object IO.Compression.ZipArchive($ms, [IO.Compression.ZipArchiveMode]::Read)
        try {
            foreach ($entry in ($zip.Entries | Sort-Object FullName)) {
                if ($entry.Length -le 0) { continue }
                $es = $entry.Open()
                try {
                    $oms = New-Object IO.MemoryStream
                    $es.CopyTo($oms)
                    $jb = $oms.ToArray()
                    if ($jb.Length -ge 2 -and $jb[0] -eq 0xFF -and $jb[1] -eq 0xD8) {
                        [void]$jpegs.Add($jb)
                    }
                } finally {
                    $es.Dispose()
                }
            }
        } finally {
            $zip.Dispose()
            $ms.Dispose()
        }
        if ($jpegs.Count -eq 0) {
            throw 'The server returned a ZIP file that did not contain any JPEG pages.'
        }
    } else {
        throw 'The server returned a file that is not a PDF or a JPEG.'
    }
    return , (New-PdfFromJpegs $jpegs $Dpi)
}

# ---- UI
$script:settings = Get-Settings

$form = New-Object System.Windows.Forms.Form
$form.Text = $script:Title
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.ClientSize = New-Object System.Drawing.Size 500, 352
$form.Font = New-Object System.Drawing.Font 'Segoe UI', 10
$form.KeyPreview = $true

function Add-Label([string]$Text, [int]$X, [int]$Y) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $Text
    $l.Location = New-Object System.Drawing.Point $X, $Y
    $l.AutoSize = $true
    $form.Controls.Add($l)
    return $l
}

function Add-Combo([int]$X, [int]$Y, [int]$Width, [string[]]$Items, [int]$Selected) {
    $cb = New-Object System.Windows.Forms.ComboBox
    $cb.DropDownStyle = 'DropDownList'
    $cb.Location = New-Object System.Drawing.Point $X, $Y
    $cb.Width = $Width
    [void]$cb.Items.AddRange($Items)
    $cb.SelectedIndex = $Selected
    $form.Controls.Add($cb)
    return $cb
}

[void](Add-Label 'Quality (DPI):' 16 18)
$script:cbDpi = Add-Combo 200 16 280 @('150', '200', '300') 1

[void](Add-Label 'Color:' 16 54)
$script:cbCol = Add-Combo 200 52 280 @('Color', 'Grayscale') 0

[void](Add-Label 'Pages:' 16 90)
$script:cbSrc = Add-Combo 200 88 280 @('Scanner glass (flatbed)', 'Document feeder (ADF)') 0

[void](Add-Label 'Save to:' 16 132)
$script:txtFolder = New-Object System.Windows.Forms.TextBox
$script:txtFolder.Location = New-Object System.Drawing.Point 200, 128
$script:txtFolder.Size = New-Object System.Drawing.Size 188, 24
$script:txtFolder.Text = $script:settings.LastFolder
$form.Controls.Add($script:txtFolder)

$script:btnBrowse = New-Object System.Windows.Forms.Button
$script:btnBrowse.Text = 'Browse...'
$script:btnBrowse.Location = New-Object System.Drawing.Point 394, 126
$script:btnBrowse.Size = New-Object System.Drawing.Size 86, 28
$form.Controls.Add($script:btnBrowse)

$script:chkAsk = New-Object System.Windows.Forms.CheckBox
$script:chkAsk.Text = 'Ask where to save each time (Save As)'
$script:chkAsk.Location = New-Object System.Drawing.Point 200, 164
$script:chkAsk.AutoSize = $true
$script:chkAsk.Checked = [bool]$script:settings.AskSaveAs
$form.Controls.Add($script:chkAsk)

$script:status = New-Object System.Windows.Forms.Label
$script:status.Location = New-Object System.Drawing.Point 16, 204
$script:status.Size = New-Object System.Drawing.Size 468, 36
$script:status.Text = 'Ready.'
$form.Controls.Add($script:status)

$script:progress = New-Object System.Windows.Forms.ProgressBar
$script:progress.Location = New-Object System.Drawing.Point 16, 246
$script:progress.Size = New-Object System.Drawing.Size 468, 18
$script:progress.Style = 'Continuous'
$script:progress.Value = 0
$form.Controls.Add($script:progress)

$script:btnScan = New-Object System.Windows.Forms.Button
$script:btnScan.Text = 'Scan'
$script:btnScan.Location = New-Object System.Drawing.Point 374, 280
$script:btnScan.Size = New-Object System.Drawing.Size 110, 36
$form.Controls.Add($script:btnScan)
$form.AcceptButton = $script:btnScan

$script:busy = $false
$script:scanStarted = $false
$script:scanWc = $null
$script:pendingPath = $null
$script:pendingDpi = 200
$script:lastPct = -1

function Invoke-OnUi([scriptblock]$Action) {
    if ($form.IsHandleCreated -and $form.InvokeRequired) {
        [void]$form.BeginInvoke($Action)
    } else {
        & $Action
    }
}

function Set-UiBusy([bool]$Busy) {
    $script:busy = $Busy
    $script:btnScan.Enabled = -not $Busy
    $script:btnBrowse.Enabled = -not $Busy
    $script:txtFolder.Enabled = -not $Busy
    $script:chkAsk.Enabled = -not $Busy
    $script:cbDpi.Enabled = -not $Busy
    $script:cbCol.Enabled = -not $Busy
    $script:cbSrc.Enabled = -not $Busy
    if ($Busy) {
        $script:lastPct = -1
        $script:progress.Style = 'Marquee'
        $script:progress.MarqueeAnimationSpeed = 30
    } else {
        $script:progress.Style = 'Continuous'
        $script:progress.MarqueeAnimationSpeed = 0
        $script:progress.Value = 0
    }
}

function Get-ChosenFolder {
    $folder = $script:txtFolder.Text.Trim()
    if (-not $folder) { $folder = $script:DefaultDir }
    return $folder
}

function Complete-ScanUi($ErrorObject, [string]$SavedPath) {
    if ($script:scanWc) {
        try { $script:scanWc.Dispose() } catch {}
        $script:scanWc = $null
    }
    if ($ErrorObject) {
        Set-UiBusy $false
        $script:status.Text = 'Error.'
        Show-Error (Get-ErrorText $ErrorObject)
        return
    }
    $script:progress.Style = 'Continuous'
    $script:progress.MarqueeAnimationSpeed = 0
    $script:progress.Value = 100
    $script:status.Text = ('Saved: {0}' -f (Split-Path -Leaf $SavedPath))
    Set-UiBusy $false
    $script:progress.Value = 100
    try {
        Start-Process -FilePath $SavedPath
    } catch {
        Show-Error ("The PDF was saved, but it could not be opened automatically:`r`n{0}`r`n`r`n{1}" -f $SavedPath, $_.Exception.Message)
    }
}

$script:btnBrowse.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'Choose the folder for scanned PDF files'
    $dlg.ShowNewFolderButton = $true
    $current = Get-ChosenFolder
    if (Test-Path -LiteralPath $current -PathType Container) {
        $dlg.SelectedPath = $current
    } elseif (Test-Path -LiteralPath $script:DefaultDir -PathType Container) {
        $dlg.SelectedPath = $script:DefaultDir
    }
    if ($dlg.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $script:txtFolder.Text = $dlg.SelectedPath
        Save-Settings $dlg.SelectedPath $script:chkAsk.Checked
    }
})

function Start-StatusCheck {
    $script:status.Text = 'Checking DR2-PC...'
    $wc = New-ScanClient 5000
    $wc.add_DownloadStringCompleted({
        param($sender, $e)
        $err = $e.Error
        $cancelled = $e.Cancelled
        $text = $null
        if (-not $err -and -not $cancelled) { $text = [string]$e.Result }
        $script:statusErr = $err
        $script:statusJson = $text
        try { $sender.Dispose() } catch {}
        Invoke-OnUi {
            if ($script:busy -or $script:scanStarted) { return }
            if ($script:statusErr) {
                $script:status.Text = Get-ErrorText $script:statusErr
                return
            }
            try {
                $st = $script:statusJson | ConvertFrom-Json
                $name = [string]$st.scanner
                if ($st.busy) {
                    $script:status.Text = 'DR2-PC is online, but the scanner is busy.'
                } elseif ($name) {
                    $script:status.Text = ('Ready. Scanner on DR2-PC: {0}' -f $name)
                } else {
                    $script:status.Text = 'DR2-PC is online, but no scanner was found.'
                }
            } catch {
                $script:status.Text = 'Ready.'
            }
        }
    })
    $wc.DownloadStringAsync([uri](Get-StatusUrl))
}

$script:btnScan.Add_Click({
    if ($script:busy) { return }

    $dpi = 200
    [void][int]::TryParse([string]$script:cbDpi.SelectedItem, [ref]$dpi)
    $color = ($script:cbCol.SelectedIndex -eq 0)
    $adf = ($script:cbSrc.SelectedIndex -eq 1)
    $ask = [bool]$script:chkAsk.Checked
    $folder = Get-ChosenFolder

    if ($ask) {
        $dlg = New-Object System.Windows.Forms.SaveFileDialog
        $dlg.Title = 'Save scan as'
        $dlg.Filter = 'PDF document (*.pdf)|*.pdf'
        $dlg.DefaultExt = 'pdf'
        $dlg.AddExtension = $true
        $dlg.OverwritePrompt = $true
        $dlg.FileName = New-ScanFileName
        if (Test-Path -LiteralPath $folder -PathType Container) {
            $dlg.InitialDirectory = $folder
        } else {
            try {
                New-Item -ItemType Directory -Force -Path $folder | Out-Null
                $dlg.InitialDirectory = $folder
            } catch {
                $dlg.InitialDirectory = $script:DefaultDir
            }
        }
        if ($dlg.ShowDialog($form) -ne [System.Windows.Forms.DialogResult]::OK) { return }
        $target = $dlg.FileName
        if ([IO.Path]::GetExtension($target) -ne '.pdf') {
            $target = [IO.Path]::ChangeExtension($target, '.pdf')
        }
        $folder = Split-Path -Parent $target
        $script:txtFolder.Text = $folder
    } else {
        try {
            $target = New-ScanPath $folder
        } catch {
            Show-Error ("Could not use the folder:`r`n{0}`r`n`r`n{1}" -f $folder, $_.Exception.Message)
            return
        }
    }
    Save-Settings $folder $ask

    $script:pendingPath = $target
    $script:pendingDpi = $dpi

    $script:scanStarted = $true
    Set-UiBusy $true
    $script:status.Text = 'Scanning... please wait. This can take a little while.'

    $wc = New-ScanClient 600000
    $script:scanWc = $wc
    $wc.add_DownloadProgressChanged({
        param($sender, $e)
        if ($e.TotalBytesToReceive -le 0) { return }
        $pct = [int]$e.ProgressPercentage
        if ($pct -eq $script:lastPct) { return }
        $script:lastPct = $pct
        $script:scanPct = $pct
        Invoke-OnUi {
            if (-not $script:busy) { return }
            $script:progress.Style = 'Continuous'
            $p = $script:scanPct
            if ($p -lt 0) { $p = 0 }
            if ($p -gt 100) { $p = 100 }
            $script:progress.Value = $p
            $script:status.Text = ('Downloading scan... {0}%' -f $p)
        }
    })
    $wc.add_DownloadDataCompleted({
        param($sender, $e)
        $err = $e.Error
        $cancelled = $e.Cancelled
        $path = [string]$script:pendingPath
        $dpiDone = [int]$script:pendingDpi
        $saved = $null
        $convErr = $null
        if ($cancelled) {
            $convErr = New-Object System.OperationCanceledException 'The scan was cancelled.'
        } elseif ($err) {
            $convErr = $err
        } else {
            try {
                $pdf = Convert-ScanToPdf ([byte[]]$e.Result) $dpiDone
                $dir = Split-Path -Parent $path
                if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
                    New-Item -ItemType Directory -Force -Path $dir | Out-Null
                }
                [IO.File]::WriteAllBytes($path, $pdf)
                $saved = $path
            } catch {
                $convErr = $_.Exception
                if ($path) { Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $path }
            }
        }
        $script:scanResultError = $convErr
        $script:scanResultPath = $saved
        Invoke-OnUi { Complete-ScanUi $script:scanResultError $script:scanResultPath }
    })
    $wc.DownloadDataAsync([uri](Get-ScanUrl $dpi $color $adf))
})

$form.Add_FormClosing({
    param($sender, $e)
    if ($script:busy) {
        $e.Cancel = $true
        [void][System.Windows.Forms.MessageBox]::Show(
            'A scan is still running. Please wait for it to finish.',
            $script:Title,
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        )
    }
})

$form.Add_Shown({ Start-StatusCheck })

[void]$form.ShowDialog()
