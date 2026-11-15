# SDA-ScanServer.ps1 - free scan sharing server (Smart Desktop Access)
# Runs on the PC with the USB scanner. Serves WIA scans over HTTP on the local subnet.
# Endpoints (header X-SDA-Token required):
#   GET /status
#   GET /scan?format=pdf|jpg&dpi=150|200|300&color=1|0&source=flatbed|adf
# Normally started at boot by the scheduled task "SDA Scan Server" as SYSTEM (no logon needed).
param(
    [string]$ConfigPath = (Join-Path $env:ProgramData 'SDA-Scan\config.json'),
    [int]$StartupDelay = 0,          # seconds to wait before starting (boot: let USB/WIA/network settle)
    [int]$WaitScannerSeconds = 300   # wait up to this long for the WIA scanner to appear (server starts anyway)
)

$ErrorActionPreference = 'Stop'
$Version = '1.1.1'
$Base = Split-Path -Parent $ConfigPath
$LogFile = Join-Path $Base 'scan.log'

function Write-Log([string]$Message) {
    try {
        if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 1MB)) {
            Move-Item -Force $LogFile ($LogFile + '.1')
        }
        Add-Content -Path $LogFile -Value ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message) -Encoding UTF8
    } catch {}
}

# ---- single instance (boot task and a manual start must not fight over the port)
$mutex = $null
try {
    $created = $false
    $mutex = New-Object Threading.Mutex($false, 'Global\SDA-ScanServer', [ref]$created)
    if (-not $mutex.WaitOne(0)) { Write-Log "Another server instance is already running; exiting (pid $PID)."; exit 0 }
} catch [Threading.AbandonedMutexException] {
    # previous instance died without releasing; we own it now
} catch {
    Write-Log ("Another server instance is already running (" + $_.Exception.Message + "); exiting (pid $PID).")
    exit 0
}

$sess = (Get-Process -Id $PID).SessionId
Write-Log ("Process started as $env:USERDOMAIN\$env:USERNAME (pid $PID, session $sess), startup delay ${StartupDelay}s")
if ($StartupDelay -gt 0) { Start-Sleep -Seconds $StartupDelay }

$cfg = $null
for ($i = 0; $i -lt 30 -and -not $cfg; $i++) {
    try { $cfg = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json }
    catch { if ($i -eq 0) { Write-Log ('waiting for config: ' + $_.Exception.Message) }; Start-Sleep -Seconds 2 }
}
if (-not $cfg) { Write-Log "FATAL: cannot read $ConfigPath"; exit 3 }
$Port = 8765
if ($cfg.Port) { $Port = [int]$cfg.Port }
$Token = [string]$cfg.Token
if (-not $Token -or $Token.Length -lt 24) { Write-Log 'FATAL: token missing or too short in config.json'; exit 2 }

# ---- local subnet check -------------------------------------------------
function Get-LocalNets {
    $nets = @()
    foreach ($a in (Get-NetIPAddress -ErrorAction SilentlyContinue)) {
        try {
            $ip = [Net.IPAddress]::Parse(($a.IPAddress -split '%')[0])
            $nets += [pscustomobject]@{ Bytes = $ip.GetAddressBytes(); Prefix = [int]$a.PrefixLength }
        } catch {}
    }
    return $nets
}
$LocalNets = Get-LocalNets
$LocalNetsTime = Get-Date

function Test-SamePrefix([byte[]]$a, [byte[]]$b, [int]$prefix) {
    if ($a.Length -ne $b.Length) { return $false }
    $full = [math]::Floor($prefix / 8); $rem = $prefix % 8
    for ($i = 0; $i -lt $full; $i++) { if ($a[$i] -ne $b[$i]) { return $false } }
    if ($rem -gt 0) {
        $mask = (0xFF -shl (8 - $rem)) -band 0xFF
        if (($a[$full] -band $mask) -ne ($b[$full] -band $mask)) { return $false }
    }
    return $true
}

function Test-LocalAddr([Net.IPAddress]$ip) {
    if ($ip.IsIPv4MappedToIPv6) { $ip = $ip.MapToIPv4() }
    if ([Net.IPAddress]::IsLoopback($ip)) { return $true }
    if ($ip.IsIPv6LinkLocal) { return $true }
    $age = ((Get-Date) - $script:LocalNetsTime).TotalSeconds
    if ($age -gt 300 -or ($script:LocalNets.Count -eq 0 -and $age -gt 5)) { $script:LocalNets = @(Get-LocalNets); $script:LocalNetsTime = Get-Date }
    $b = $ip.GetAddressBytes()
    foreach ($n in $script:LocalNets) {
        if ($n.Prefix -gt 0 -and (Test-SamePrefix $b $n.Bytes $n.Prefix)) { return $true }
    }
    # addresses may have changed (e.g. DHCP finished after boot): refresh once and re-check
    if ($age -gt 10) {
        $script:LocalNets = @(Get-LocalNets); $script:LocalNetsTime = Get-Date
        foreach ($n in $script:LocalNets) {
            if ($n.Prefix -gt 0 -and (Test-SamePrefix $b $n.Bytes $n.Prefix)) { return $true }
        }
    }
    return $false
}

function Test-Token([string]$t) {
    if (-not $t) { return $false }
    $a = [Text.Encoding]::UTF8.GetBytes($t); $b = [Text.Encoding]::UTF8.GetBytes($script:Token)
    $diff = $a.Length -bxor $b.Length
    for ($i = 0; $i -lt [math]::Min($a.Length, $b.Length); $i++) { $diff = $diff -bor ($a[$i] -bxor $b[$i]) }
    return ($diff -eq 0)
}

function Send-Text($ctx, [int]$code, [string]$text, [string]$ctype = 'text/plain; charset=utf-8') {
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($text)
        $ctx.Response.StatusCode = $code
        $ctx.Response.ContentType = $ctype
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {} finally { try { $ctx.Response.Close() } catch {} }
}

function Get-ScannerName {
    try {
        $dm = New-Object -ComObject WIA.DeviceManager
        # Type 1 = scanner (Brother WIA driver). The Windows eSCL/IPP-over-USB driver (SWD\EsclUsb) reports
        # other type values (e.g. 65535), so accept anything that is not a camera (2) or video device (3).
        $first = $null
        foreach ($d in $dm.DeviceInfos) {
            if ($d.Type -eq 2 -or $d.Type -eq 3) { continue }
            $n = [string]$d.Properties.Item('Name').Value
            if ($d.Type -eq 1 -or $n -match 'Brother') { return $n }
            if (-not $first) { $first = $n }
        }
        if ($first) { return $first }
    } catch {}
    return $null
}

# ---- scan worker (runs in its own STA runspace) ---------------------------
$ScanScript = {
    param($ctx, $opt, $LogFile)
    $ErrorActionPreference = 'Stop'
    function Log([string]$m) { try { Add-Content -Path $LogFile -Value ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $m) -Encoding UTF8 } catch {} }
    function Reply($code, [string]$ctype, [byte[]]$bytes, [string]$fname) {
        try {
            $ctx.Response.StatusCode = $code
            $ctx.Response.ContentType = $ctype
            if ($fname) { $ctx.Response.AddHeader('Content-Disposition', 'attachment; filename="' + $fname + '"') }
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch { Log ('send failed: ' + $_.Exception.Message) } finally { try { $ctx.Response.Close() } catch {} }
    }
    function ReplyText($code, [string]$t) { Reply $code 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($t)) $null }
    function Set-Prop($props, [int]$id, $val) {
        foreach ($p in $props) { if ($p.PropertyID -eq $id) { $p.Value = $val; return $true } }
        return $false
    }
    function Get-Prop($props, [int]$id) {
        foreach ($p in $props) { if ($p.PropertyID -eq $id) { return $p } }
        return $null
    }
    function New-Pdf($pages) {
        $inv = [Globalization.CultureInfo]::InvariantCulture
        $ms = New-Object IO.MemoryStream
        $enc = [Text.Encoding]::ASCII
        $off = @{}
        $W = { param([string]$s) $b = $enc.GetBytes($s); $ms.Write($b, 0, $b.Length) }
        & $W "%PDF-1.4`n%"; $ms.Write([byte[]](0xE2, 0xE3, 0xCF, 0xD3), 0, 4); & $W "`n"
        $n = $pages.Count
        $kids = ((0..($n - 1)) | ForEach-Object { '{0} 0 R' -f (3 + 3 * $_) }) -join ' '
        $off[1] = $ms.Position; & $W "1 0 obj`n<< /Type /Catalog /Pages 2 0 R >>`nendobj`n"
        $off[2] = $ms.Position; & $W "2 0 obj`n<< /Type /Pages /Kids [$kids] /Count $n >>`nendobj`n"
        for ($i = 0; $i -lt $n; $i++) {
            $p = $pages[$i]; $pn = 3 + 3 * $i; $im = $pn + 1; $cn = $pn + 2
            $ws = ([math]::Round($p.W * 72.0 / $p.Dpi, 2)).ToString($inv)
            $hs = ([math]::Round($p.H * 72.0 / $p.Dpi, 2)).ToString($inv)
            $off[$pn] = $ms.Position
            & $W "$pn 0 obj`n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $ws $hs] /Resources << /XObject << /Im0 $im 0 R >> >> /Contents $cn 0 R >>`nendobj`n"
            $off[$im] = $ms.Position
            & $W ("$im 0 obj`n<< /Type /XObject /Subtype /Image /Width {0} /Height {1} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {2} >>`nstream`n" -f $p.W, $p.H, $p.Bytes.Length)
            $ms.Write($p.Bytes, 0, $p.Bytes.Length)
            & $W "`nendstream`nendobj`n"
            $c = "q $ws 0 0 $hs 0 0 cm /Im0 Do Q"
            $off[$cn] = $ms.Position
            & $W ("$cn 0 obj`n<< /Length {0} >>`nstream`n{1}`nendstream`nendobj`n" -f $c.Length, $c)
        }
        $total = 3 + 3 * $n
        $xref = $ms.Position
        & $W "xref`n0 $total`n0000000000 65535 f `n"
        for ($k = 1; $k -lt $total; $k++) { & $W ("{0:D10} 00000 n `n" -f [long]$off[$k]) }
        & $W "trailer`n<< /Size $total /Root 1 0 R >>`nstartxref`n$xref`n%%EOF`n"
        return , $ms.ToArray()
    }
    function To-Jpeg([byte[]]$raw, [int]$dpi) {
        $src = $null; $bmp = $null; $g = $null
        try {
            $in = New-Object IO.MemoryStream (, $raw)
            $src = [Drawing.Image]::FromStream($in)
            $bmp = New-Object Drawing.Bitmap $src.Width, $src.Height, ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
            $bmp.SetResolution($dpi, $dpi)
            $g = [Drawing.Graphics]::FromImage($bmp)
            $g.Clear([Drawing.Color]::White)
            $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
            $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
            $ep = New-Object Drawing.Imaging.EncoderParameters 1
            $ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality, [long]85)
            $out = New-Object IO.MemoryStream
            $bmp.Save($out, $codec, $ep)
            return [pscustomobject]@{ Bytes = $out.ToArray(); W = $bmp.Width; H = $bmp.Height; Dpi = $dpi }
        } finally { if ($g) { $g.Dispose() }; if ($bmp) { $bmp.Dispose() }; if ($src) { $src.Dispose() } }
    }

    $t0 = Get-Date
    try {
        Add-Type -AssemblyName System.Drawing
        $dm = New-Object -ComObject WIA.DeviceManager
        $info = $null
        foreach ($d in $dm.DeviceInfos) {
            if ($d.Type -eq 2 -or $d.Type -eq 3) { continue }   # cameras / video
            if (-not $info) { $info = $d }
            if ([string]$d.Properties.Item('Name').Value -match 'Brother') { $info = $d; break }
        }
        if (-not $info) { Log 'scan: no WIA scanner found'; ReplyText 503 'NOSCANNER: no WIA scanner found on the server PC'; return }
        $name = [string]$info.Properties.Item('Name').Value
        $dev = $info.Connect()
        $adf = ($opt.Source -eq 'adf')
        # WIA 2.0 drivers (e.g. Windows eSCL/IPP-USB) expose "Flatbed" / "Feeder" child items;
        # older WIA 1 drivers use one item plus the document-handling property 3088.
        $pick = $null; $itemNames = @()
        for ($k = 1; $k -le $dev.Items.Count; $k++) {
            $it = $dev.Items.Item($k)
            $nm = ''; try { $nm = [string]$it.Properties.Item('Item Name').Value } catch {}
            $itemNames += $nm
            if (-not $pick) {
                if ($adf -and $nm -match 'Feeder|ADF|Document') { $pick = $it }
                if (-not $adf -and $nm -match 'Flatbed|Platen|Glass') { $pick = $it }
            }
        }
        Log ("scan: device '" + $name + "' items: " + ($itemNames -join ', '))
        if ($pick) {
            $item = $pick
        } elseif ($adf) {
            if (-not (Set-Prop $dev.Properties 3088 1)) { ReplyText 422 'NOADF: scanner has no document feeder'; return }
            [void](Set-Prop $dev.Properties 3096 1)
            $item = $dev.Items.Item(1)
        } else {
            try { [void](Set-Prop $dev.Properties 3088 2) } catch {}
            $item = $dev.Items.Item(1)
        }
        $intent = 2; if ($opt.Color) { $intent = 1 }
        try { [void](Set-Prop $item.Properties 6146 $intent) } catch { Log ('intent: ' + $_.Exception.Message) }
        # resolution: use the requested DPI, or the nearest one the driver supports
        $useDpi = $opt.Dpi
        foreach ($pid_ in 6147, 6148) {
            $p = Get-Prop $item.Properties $pid_
            if (-not $p) { continue }
            try { $p.Value = $opt.Dpi } catch {
                $cands = @()
                try {
                    if ($p.SubType -eq 2) { foreach ($v in $p.SubTypeValues) { $cands += [int]$v } }
                    elseif ($p.SubType -eq 1) { $cands += [Math]::Min([Math]::Max($opt.Dpi, [int]$p.SubTypeMin), [int]$p.SubTypeMax) }
                } catch {}
                if ($cands.Count -gt 0) {
                    $best = $cands | Sort-Object { [Math]::Abs($_ - $opt.Dpi) } | Select-Object -First 1
                    $p.Value = $best
                    Log ("dpi {0} not supported by the driver, using {1}" -f $opt.Dpi, $best)
                } else { Log ('dpi: ' + $_.Exception.Message) }
            }
            try { if ($pid_ -eq 6147) { $useDpi = [int]$p.Value } } catch {}
        }
        try { [void](Set-Prop $item.Properties 6149 0); [void](Set-Prop $item.Properties 6150 0) } catch {}
        try {
            $wx = Get-Prop $item.Properties 6151; $hy = Get-Prop $item.Properties 6152
            if ($wx) { $wx.Value = $wx.SubTypeMax }
            if ($hy) { $hy.Value = $hy.SubTypeMax }
        } catch { Log ('extent: ' + $_.Exception.Message) }

        $jpegFmt = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
        $pages = New-Object System.Collections.ArrayList
        $max = 1; if ($adf) { $max = 50 }
        for ($i = 0; $i -lt $max; $i++) {
            $img = $null
            try {
                try { $img = $item.Transfer($jpegFmt) } catch {
                    if ($_.Exception.HResult -eq -2145320957 -or $_.Exception.Message -match '80210003') { throw }
                    $img = $item.Transfer()
                }
            } catch {
                $hr = $_.Exception.HResult
                if ($hr -eq -2145320957 -or $_.Exception.Message -match '80210003') {
                    if ($pages.Count -eq 0) { ReplyText 422 'ADFEMPTY: document feeder is empty'; return }
                    break
                }
                throw
            }
            $raw = [byte[]]$img.FileData.BinaryData
            [void]$pages.Add((To-Jpeg $raw $useDpi))
        }
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        if ($opt.Format -eq 'pdf') {
            $pdf = New-Pdf $pages
            Reply 200 'application/pdf' $pdf "scan-$stamp.pdf"
            $size = $pdf.Length; $kind = 'pdf'
        } elseif ($pages.Count -eq 1) {
            Reply 200 'image/jpeg' $pages[0].Bytes "scan-$stamp.jpg"
            $size = $pages[0].Bytes.Length; $kind = 'jpg'
        } else {
            Add-Type -AssemblyName System.IO.Compression
            $zms = New-Object IO.MemoryStream
            $zip = New-Object IO.Compression.ZipArchive ($zms, [IO.Compression.ZipArchiveMode]::Create, $true)
            for ($k = 0; $k -lt $pages.Count; $k++) {
                $e = $zip.CreateEntry(('scan-{0}-p{1:D2}.jpg' -f $stamp, ($k + 1)))
                $s = $e.Open(); $s.Write($pages[$k].Bytes, 0, $pages[$k].Bytes.Length); $s.Close()
            }
            $zip.Dispose()
            $zb = $zms.ToArray()
            Reply 200 'application/zip' $zb "scan-$stamp.zip"
            $size = $zb.Length; $kind = 'zip'
        }
        Log ('scan OK: {0} pages={1} {2}x{3} dpi={4} color={5} src={6} -> {7} {8} bytes in {9:N1}s' -f $name, $pages.Count, $pages[0].W, $pages[0].H, $useDpi, $opt.Color, $opt.Source, $kind, $size, ((Get-Date) - $t0).TotalSeconds)
    } catch {
        $msg = $_.Exception.Message
        Log ('scan FAILED: ' + $msg)
        ReplyText 500 ('SCANERROR: ' + $msg)
    }
}

function Start-ScanJob($ctx, $opt) {
    $rs = [runspacefactory]::CreateRunspace()
    $rs.ApartmentState = 'STA'
    $rs.ThreadOptions = 'ReuseThread'
    $rs.Open()
    $ps = [powershell]::Create()
    $ps.Runspace = $rs
    [void]$ps.AddScript($ScanScript.ToString()).AddArgument($ctx).AddArgument($opt).AddArgument($LogFile)
    return [pscustomobject]@{ PS = $ps; RS = $rs; Handle = $ps.BeginInvoke(); Started = Get-Date }
}

function Clear-Job {
    if ($script:job -and -not $script:job.Handle.IsCompleted -and ((Get-Date) - $script:job.Started).TotalMinutes -gt 10) {
        Write-Log 'job: scan worker stuck > 10 min, abandoning it'
        try { [void]$script:job.PS.BeginStop($null, $null) } catch {}
        $script:job = $null
        return
    }
    if ($script:job -and $script:job.Handle.IsCompleted) {
        try { [void]$script:job.PS.EndInvoke($script:job.Handle) } catch { Write-Log ('job: ' + $_.Exception.Message) }
        try { $script:job.PS.Dispose(); $script:job.RS.Dispose() } catch {}
        $script:job = $null
    }
}

# ---- main loop -----------------------------------------------------------
$job = $null
$ScannerName = Get-ScannerName
$waitUntil = (Get-Date).AddSeconds($WaitScannerSeconds)
if (-not $ScannerName) { Write-Log "No WIA scanner yet; waiting up to ${WaitScannerSeconds}s for it to appear" }
$rescanAt = (Get-Date).AddSeconds(45); $rescanned = $false
while (-not $ScannerName -and (Get-Date) -lt $waitUntil) {
    Start-Sleep -Seconds 5
    $ScannerName = Get-ScannerName
    if (-not $ScannerName -and -not $rescanned -and (Get-Date) -gt $rescanAt) {
        # after a reboot the Brother scan interface sometimes comes up without its WIA driver bound;
        # a PnP re-scan (needs admin/SYSTEM) rebinds it
        $rescanned = $true
        try { $o = & pnputil.exe /scan-devices 2>&1 | Out-String; Write-Log ('No scanner after 45s; ran pnputil /scan-devices: ' + ($o -replace '\s+', ' ').Trim()) }
        catch { Write-Log ('pnputil /scan-devices failed: ' + $_.Exception.Message) }
    }
}
if (-not $ScannerName) { Write-Log 'Still no WIA scanner; starting anyway (/status and /scan re-check it on every request)' }
$LocalNets = @(Get-LocalNets); $LocalNetsTime = Get-Date
Write-Log ("Server $Version starting on port $Port as $env:USERDOMAIN\$env:USERNAME (session $sess), scanner: " + $ScannerName)
while ($true) {
    $listener = $null
    try {
        $listener = New-Object Net.HttpListener
        $listener.Prefixes.Add("http://+:$Port/")
        $listener.Start()
        Write-Log "Listening on http://+:$Port/"
        while ($listener.IsListening) {
            $ctx = $listener.GetContext()
            try {
                Clear-Job
                $req = $ctx.Request
                $ip = $req.RemoteEndPoint.Address
                if (-not (Test-LocalAddr $ip)) { Write-Log "403 from $ip"; Send-Text $ctx 403 'forbidden'; continue }
                if (-not (Test-Token $req.Headers['X-SDA-Token'])) { Write-Log "401 from $ip $($req.Url.AbsolutePath)"; Send-Text $ctx 401 'unauthorized'; continue }
                $busy = [bool]$job
                switch ($req.Url.AbsolutePath.ToLowerInvariant()) {
                    '/status' {
                        if (-not $busy) { $n = Get-ScannerName; if ($n) { $ScannerName = $n } }
                        $s = [ordered]@{ ok = $true; version = $Version; host = $env:COMPUTERNAME; busy = $busy; scanner = $ScannerName }
                        Send-Text $ctx 200 ($s | ConvertTo-Json -Compress) 'application/json; charset=utf-8'
                    }
                    '/scan' {
                        if ($busy) { Write-Log "409 busy from $ip"; Send-Text $ctx 409 'BUSY: another scan is in progress'; break }
                        $q = $req.QueryString
                        $fmt = ([string]$q['format']).ToLowerInvariant(); if ($fmt -notin @('pdf', 'jpg')) { $fmt = 'pdf' }
                        $dpi = 200; [void][int]::TryParse([string]$q['dpi'], [ref]$dpi); if ($dpi -notin @(100, 150, 200, 300, 600)) { $dpi = 200 }
                        $color = ([string]$q['color'] -ne '0')
                        $src = ([string]$q['source']).ToLowerInvariant(); if ($src -ne 'adf') { $src = 'flatbed' }
                        $opt = [pscustomobject]@{ Format = $fmt; Dpi = $dpi; Color = $color; Source = $src }
                        Write-Log "scan request from $ip format=$fmt dpi=$dpi color=$color source=$src"
                        $job = Start-ScanJob $ctx $opt
                    }
                    default { Send-Text $ctx 404 'not found' }
                }
            } catch {
                Write-Log ('request error: ' + $_.Exception.Message)
                Send-Text $ctx 500 'server error'
            }
        }
    } catch {
        Write-Log ('listener error: ' + $_.Exception.Message)
    } finally {
        try { if ($listener) { $listener.Close() } } catch {}
    }
    Start-Sleep -Seconds 5
}
