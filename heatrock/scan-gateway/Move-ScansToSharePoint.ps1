# Rock job #2: drain the copier's built-in scan share into SharePoint.
#
# Runs every 5 minutes (Register-ScanGatewayTask.ps1). For each file on
# \\copier\share that has settled (older than minAgeSeconds), upload it to
# the target SharePoint library/folder, verify the size round-tripped, then
# delete the original. Copy-verify-delete, never move-and-hope: a failed
# upload leaves the scan exactly where the copier put it, and the next pass
# retries.
#
# Same identity as the print job and the renderer (app-only; the target site
# needs its own Sites.Selected grant - see scan-gateway.config.json). Copier
# SMB credentials live in Windows Credential Manager via cmdkey, so plain
# UNC paths just work under the task's account.
#
# Event log: source "PrayerListPrint" (shared with the print job) -
# event 22 uploads, 23 failures. Quiet when there is nothing to do.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $root "scan-gateway.config.json") | ConvertFrom-Json

function Fail($msg) {
    Write-EventLog -LogName Application -Source "PrayerListPrint" -EntryType Error -EventId 23 -Message $msg
    Write-Error $msg
    exit 1
}

if ($cfg.targetSiteId -eq "TODO") { Fail "scan-gateway.config.json still has targetSiteId=TODO - pick the destination site and grant it (see config notes)." }

$share = "\\$($cfg.copierHost)\$($cfg.copierShare)"
if (-not (Test-Path $share)) { Fail "Cannot reach $share - copier off, IP changed, or cmdkey credentials missing for this account." }

$cutoff = (Get-Date).AddSeconds(-1 * $cfg.minAgeSeconds)
$files = Get-ChildItem -Path $share -File -ErrorAction Stop | Where-Object { $_.LastWriteTime -lt $cutoff }
if (-not $files) { exit 0 }  # nothing settled; stay silent

New-Item -ItemType Directory -Force -Path $cfg.logDir | Out-Null
Start-Transcript -Path (Join-Path $cfg.logDir ("scans-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt")) | Out-Null

try {
    $secure = Get-Content $cfg.secretPath | ConvertTo-SecureString
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    $tok = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$($cfg.graphTenantId)/oauth2/v2.0/token" -Body @{
        client_id = $cfg.graphClientId; client_secret = $secret
        grant_type = "client_credentials"; scope = "https://graph.microsoft.com/.default"
    }
    $H = @{ Authorization = "Bearer $($tok.access_token)" }
    $graph = "https://graph.microsoft.com/v1.0"

    # Resolve the target library by name (default Documents = the site's
    # default drive; a named library is found the dual-strategy way).
    $driveId = $null
    $drives = Invoke-RestMethod -Headers $H -Uri "$graph/sites/$($cfg.targetSiteId)/drives"
    $lib = $drives.value | Where-Object { $_.name -ieq $cfg.targetLibrary } | Select-Object -First 1
    if ($lib) { $driveId = $lib.id } else { $driveId = (Invoke-RestMethod -Headers $H -Uri "$graph/sites/$($cfg.targetSiteId)/drive").id }

    $moved = @()
    foreach ($f in $files) {
        # Timestamp prefix: scanner filenames repeat (SCAN0001...), SharePoint
        # names must not. The original name survives after the prefix.
        $dest = "{0}-{1}" -f $f.LastWriteTime.ToString("yyyyMMdd-HHmmss"), $f.Name
        $folder = [uri]::EscapeDataString($cfg.targetFolder)
        $destEnc = [uri]::EscapeDataString($dest)
        $up = Invoke-RestMethod -Method Put -Headers $H -ContentType "application/octet-stream" `
            -Uri "$graph/drives/$driveId/root:/${folder}/${destEnc}:/content" `
            -InFile $f.FullName
        if ($up.size -ne $f.Length) { Fail "Size mismatch uploading '$($f.Name)' ($($f.Length) local vs $($up.size) uploaded) - leaving the original on the copier." }
        if ($cfg.deleteAfterUpload) { Remove-Item -LiteralPath $f.FullName -Force }
        $moved += $dest
    }

    Write-EventLog -LogName Application -Source "PrayerListPrint" -EntryType Information -EventId 22 `
        -Message ("Moved {0} scan(s) to '{1}/{2}': {3}" -f $moved.Count, $cfg.targetLibrary, $cfg.targetFolder, ($moved -join ", "))
    Write-Output "Moved $($moved.Count) scan(s)."
    Stop-Transcript | Out-Null
    exit 0
}
catch {
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
    Fail "Unhandled: $($_.Exception.Message)"
}
