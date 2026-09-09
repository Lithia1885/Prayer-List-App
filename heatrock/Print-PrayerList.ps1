# Prints the Wednesday prayer list on the office Toshiba, unattended.
#
# Runs on the heat rock (Task Scheduler, Wednesdays 12:58 PM local) after the
# GitHub renderer has uploaded the day's PDF (~12:15). The division of labor:
#   - GitHub renders (tested, versioned, page-numbered)
#   - this script only downloads and prints
#   - the PRINT QUEUE owns the job spec (5 stapled duplex grayscale sets) —
#     no print settings are passed here, so the spec can't fork
#
# Identity: the same app registration as the renderer, app-only. Graph's
# delegated-only rule applies to its cloud PRINT API — irrelevant here, since
# printing is a local spooler job; Graph is only used to READ the archive,
# which the existing Sites.Selected grant covers.
#
# Refuses to print anything but TODAY'S file, deliberately: distributing last
# week's list because this week's render failed is worse than no paper — and
# the 1:00 flow independently alarms on a missing file, so a refusal here is
# never silent for long.
#
# Failures land in the Application event log (source "PrayerListPrint") and in
# $logDir transcripts. Setup: see README.md in this folder.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $root "heatrock.config.json") | ConvertFrom-Json
$render = Get-Content (Join-Path $root "..\print\render.config.json") | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path $cfg.logDir | Out-Null
Start-Transcript -Path (Join-Path $cfg.logDir ("run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt")) | Out-Null

function Fail($msg) {
    Write-EventLog -LogName Application -Source "PrayerListPrint" -EntryType Error -EventId 13 -Message $msg
    Write-Error $msg
    Stop-Transcript | Out-Null
    exit 1
}

try {
    # ---- Secret: DPAPI-protected, bound to the account this task runs as ----
    if (-not (Test-Path $cfg.secretPath)) { Fail "No secret at $($cfg.secretPath) — run the one-time secret step in README.md (as the task's user)." }
    $secure = Get-Content $cfg.secretPath | ConvertTo-SecureString
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

    # ---- Token (client credentials) ----
    $tok = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$($cfg.tenantId)/oauth2/v2.0/token" -Body @{
        client_id = $cfg.clientId; client_secret = $secret
        grant_type = "client_credentials"; scope = "https://graph.microsoft.com/.default"
    }
    $H = @{ Authorization = "Bearer $($tok.access_token)" }

    # ---- Find the archive (library by name, folder fallback — same dual
    #      strategy as the app and the renderer) ----
    $graph = "https://graph.microsoft.com/v1.0"
    $items = $null
    $drives = Invoke-RestMethod -Headers $H -Uri "$graph/sites/$($render.siteId)/drives"
    $lib = $drives.value | Where-Object { $_.name -ieq $render.archiveFolder } | Select-Object -First 1
    if ($lib) {
        $items = (Invoke-RestMethod -Headers $H -Uri "$graph/drives/$($lib.id)/root/children?`$top=100").value
    } else {
        $enc = [uri]::EscapeDataString($render.archiveFolder)
        $items = (Invoke-RestMethod -Headers $H -Uri "$graph/sites/$($render.siteId)/drive/root:/${enc}:/children?`$top=100").value
    }

    # ---- Today's file only (local time — the rock lives in Georgia) ----
    $today = Get-Date -Format "yyyyMMdd"
    $name = "prayer_list_$today.pdf"
    $pdf = $items | Where-Object { $_.name -ieq $name } | Select-Object -First 1
    if (-not $pdf) { Fail "No $name in '$($render.archiveFolder)' — the render likely failed (check GitHub Actions). Refusing to print a stale week." }

    $tmp = Join-Path $env:TEMP $name
    Invoke-WebRequest -Headers $H -Uri "$graph/drives/$(if ($lib) { $lib.id } else { (Invoke-RestMethod -Headers $H -Uri "$graph/sites/$($render.siteId)/drive").id })/items/$($pdf.id)/content" -OutFile $tmp
    $head = [System.Text.Encoding]::ASCII.GetString((Get-Content $tmp -AsByteStream -TotalCount 4))
    if ($head -ne "%PDF") { Fail "Downloaded $name is not a PDF (got '$head') — not sending garbage to the copier." }

    # ---- Print. The queue's defaults ARE the job spec; Sumatra just delivers. ----
    if (-not (Get-Printer -Name $cfg.queueName -ErrorAction SilentlyContinue)) { Fail "Print queue '$($cfg.queueName)' does not exist on this machine — see README.md setup." }
    if (-not (Test-Path $cfg.sumatraPath)) { Fail "SumatraPDF not found at $($cfg.sumatraPath)." }
    $p = Start-Process -FilePath $cfg.sumatraPath -ArgumentList @("-print-to", "`"$($cfg.queueName)`"", "-silent", "-exit-when-done", "`"$tmp`"") -Wait -PassThru
    if ($p.ExitCode -ne 0) { Fail "SumatraPDF exited $($p.ExitCode) — job may not have reached the spooler." }

    Write-EventLog -LogName Application -Source "PrayerListPrint" -EntryType Information -EventId 12 -Message "Printed $name to '$($cfg.queueName)'."
    Write-Output "Printed $name."
    Remove-Item $tmp -ErrorAction SilentlyContinue
    Stop-Transcript | Out-Null
    exit 0
}
catch {
    Fail "Unhandled: $($_.Exception.Message)"
}
