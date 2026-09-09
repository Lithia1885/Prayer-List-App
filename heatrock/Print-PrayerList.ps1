# Prints the Wednesday prayer list on the office Toshiba, unattended — and
# makes sure there is a list to print first.
#
# Runs on the heat rock (Task Scheduler, local time) twice each Wednesday:
#   12:30 PM  -EnsureOnly   if today's PDF isn't in the archive yet, kick the
#                           GitHub render and wait for it to land
#   12:58 PM  (print)       same check as a last resort, then download and print
#
# The division of labor:
#   - GitHub renders (tested, versioned, page-numbered)
#   - this script makes sure that happened, then downloads and prints
#   - the PRINT QUEUE owns the job spec (5 stapled duplex grayscale sets) —
#     no print settings are passed here, so the spec can't fork
#
# Why the rock kicks the render: GitHub's scheduled trigger is best-effort,
# and every week it has been watched it fired 30 minutes to 3+ hours late
# (OPERATIONS.md §0). Task Scheduler on a box in the building does not. The
# kick is the same workflow_dispatch a human does from the Actions tab, made
# with a fine-grained token that can do nothing but run this repo's Actions.
# Without the token file the script behaves as it always did: refuses to
# print a stale week, and the 1:00 flow alarms.
#
# Identity for Graph: the same app registration as the renderer, app-only.
# Graph's delegated-only rule applies to its cloud PRINT API — irrelevant
# here, since printing is a local spooler job; Graph is only used to READ the
# archive, which the existing Sites.Selected grant covers.
#
# Refuses to print anything but TODAY'S file, deliberately: distributing last
# week's list because this week's render failed is worse than no paper — and
# the 1:00 flow independently alarms on a missing file, so a refusal here is
# never silent for long.
#
# Outcomes land in the Application event log (source "PrayerListPrint":
# 12 printed · 13 failed · 14 render kicked · 15 render missing and no token
# to kick it · 16 kicked render landed) and in $logDir transcripts. Setup:
# README.md in this folder. Windows PowerShell 5.1 (what powershell.exe is)
# and PowerShell 7 both work.

[CmdletBinding()]
param(
    [switch]$EnsureOnly,   # make sure today's PDF exists (kick GitHub if not); don't print
    [switch]$TokenCheck    # prove the GitHub token can dispatch, without dispatching
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $root "heatrock.config.json") | ConvertFrom-Json
$render = Get-Content (Join-Path $root "..\print\render.config.json") | ConvertFrom-Json

$mode = if ($TokenCheck) { "tokencheck" } elseif ($EnsureOnly) { "ensure" } else { "print" }
New-Item -ItemType Directory -Force -Path $cfg.logDir | Out-Null
Start-Transcript -Path (Join-Path $cfg.logDir ("$mode-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt")) | Out-Null

# The event-log source only exists once Register-Task.ps1 has run elevated;
# a by-hand test before that must still work, so logging never throws (the
# transcript has everything regardless).
function Log($type, $id, $msg) {
    try { Write-EventLog -LogName Application -Source "PrayerListPrint" -EntryType $type -EventId $id -Message $msg } catch {}
    Write-Output "[$type $id] $msg"
}

function Fail($msg) {
    Log Error 13 $msg
    Stop-Transcript | Out-Null
    exit 1
}

function Done($msg) {
    Write-Output $msg
    Stop-Transcript | Out-Null
    exit 0
}

# DPAPI-protected files, bound to the account this task runs as.
function Read-Protected($path) {
    $secure = Get-Content $path | ConvertTo-SecureString
    [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

function Get-HttpStatus($err) {
    try { [int]$err.Exception.Response.StatusCode } catch { 0 }
}

function Invoke-GitHub($method, $path, $body) {
    $headers = @{
        Authorization          = "Bearer $(Read-Protected $cfg.githubTokenPath)"
        Accept                 = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent"           = "heatrock"
    }
    $uri = "https://api.github.com$path"
    if ($body) { Invoke-RestMethod -Method $method -Uri $uri -Headers $headers -Body $body -ContentType "application/json" }
    else { Invoke-RestMethod -Method $method -Uri $uri -Headers $headers }
}

$dispatches = "/repos/$($cfg.githubRepo)/actions/workflows/$($cfg.renderWorkflow)/dispatches"

try {
    if ($TokenCheck) {
        # A dispatch against a ref that cannot exist: 422 ("No ref found")
        # means the token authenticated AND has the write permission the real
        # kick needs; anything else is the actual problem. Nothing runs.
        if (-not (Test-Path $cfg.githubTokenPath)) { Fail "No GitHub token at $($cfg.githubTokenPath) — run the token step in README.md (as the task's user)." }
        try {
            Invoke-GitHub Post $dispatches '{"ref":"refs/heads/heatrock-token-check-never-a-branch"}'
            Fail "GitHub accepted a dispatch on a ref that should not exist — something is off; check the Actions tab."
        } catch {
            $code = Get-HttpStatus $_
            if ($code -eq 422) { Done "Token OK: authenticates and may run Actions in $($cfg.githubRepo)." }
            Fail "Token check failed (HTTP $code): $($_.Exception.Message). 401 = expired or revoked; 404/403 = wrong repository or missing 'Actions: read and write'."
        }
    }

    # ---- Graph token (client credentials) ----
    if (-not (Test-Path $cfg.secretPath)) { Fail "No secret at $($cfg.secretPath) — run the one-time secret step in README.md (as the task's user)." }
    $tok = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$($cfg.tenantId)/oauth2/v2.0/token" -Body @{
        client_id = $cfg.clientId; client_secret = (Read-Protected $cfg.secretPath)
        grant_type = "client_credentials"; scope = "https://graph.microsoft.com/.default"
    }
    $H = @{ Authorization = "Bearer $($tok.access_token)" }
    $graph = "https://graph.microsoft.com/v1.0"

    # ---- Find the archive (library by name, folder fallback — same dual
    #      strategy as the app and the renderer) ----
    $drives = Invoke-RestMethod -Headers $H -Uri "$graph/sites/$($render.siteId)/drives"
    $lib = $drives.value | Where-Object { $_.name -ieq $render.archiveFolder } | Select-Object -First 1
    $archive = "$graph/sites/$($render.siteId)/drive/root:/$([uri]::EscapeDataString($render.archiveFolder))"
    if ($lib) { $archive = "$graph/drives/$($lib.id)/root:" }

    # ---- Today's file only (local time — the rock lives in Georgia).
    #      Addressed by path rather than listed, so the archive can grow past
    #      one page of children without today's file falling off the end. ----
    $name = "prayer_list_$(Get-Date -Format 'yyyyMMdd').pdf"
    function Get-TodaysPdf {
        try { Invoke-RestMethod -Headers $H -Uri "$archive/$name" }
        catch { if ((Get-HttpStatus $_) -eq 404) { $null } else { throw } }
    }

    $pdf = Get-TodaysPdf
    if (-not $pdf) {
        if (-not (Test-Path $cfg.githubTokenPath)) {
            Log Warning 15 "No $name in the archive and no GitHub token at $($cfg.githubTokenPath), so the rock can't kick the render — README.md step 6."
            Fail "No $name in '$($render.archiveFolder)' — the render hasn't happened (GitHub's schedule is late, or it failed: check the Actions tab). Refusing to print a stale week."
        }
        Log Warning 14 "No $name in the archive at $(Get-Date -Format 'h:mm tt') — GitHub's schedule is late again; dispatching the render workflow from the rock."
        try { Invoke-GitHub Post $dispatches '{"ref":"main"}' }
        catch { Fail "Dispatching the render failed (HTTP $(Get-HttpStatus $_)): $($_.Exception.Message). Token expired or revoked? README.md has the rotation." }
        $deadline = (Get-Date).AddMinutes($cfg.renderWaitMinutes)
        do { Start-Sleep -Seconds 20; $pdf = Get-TodaysPdf } until ($pdf -or (Get-Date) -gt $deadline)
        if (-not $pdf) { Fail "Dispatched the render but $name had not landed after $($cfg.renderWaitMinutes) minutes — check the run in the Actions tab." }
        Log Information 16 "Kicked render landed: $name is in the archive."
    }
    if ($EnsureOnly) { Done "$name is in the archive." }

    # ---- Download and sanity-check ----
    $tmp = Join-Path $env:TEMP $name
    Invoke-WebRequest -UseBasicParsing -Headers $H -Uri "$graph/drives/$($pdf.parentReference.driveId)/items/$($pdf.id)/content" -OutFile $tmp
    $head = New-Object byte[] 4
    $fs = [IO.File]::OpenRead($tmp)
    try { [void]$fs.Read($head, 0, 4) } finally { $fs.Close() }
    if ([Text.Encoding]::ASCII.GetString($head) -ne "%PDF") { Fail "Downloaded $name is not a PDF — not sending garbage to the copier." }

    # ---- Print. The queue's defaults ARE the job spec; Sumatra just delivers. ----
    if (-not (Get-Printer -Name $cfg.queueName -ErrorAction SilentlyContinue)) { Fail "Print queue '$($cfg.queueName)' does not exist on this machine — see README.md setup." }
    if (-not (Test-Path $cfg.sumatraPath)) { Fail "SumatraPDF not found at $($cfg.sumatraPath)." }
    $p = Start-Process -FilePath $cfg.sumatraPath -ArgumentList @("-print-to", "`"$($cfg.queueName)`"", "-silent", "-exit-when-done", "`"$tmp`"") -Wait -PassThru
    if ($p.ExitCode -ne 0) { Fail "SumatraPDF exited $($p.ExitCode) — job may not have reached the spooler." }

    Log Information 12 "Printed $name to '$($cfg.queueName)'."
    Remove-Item $tmp -ErrorAction SilentlyContinue
    Done "Printed $name."
}
catch {
    Fail "Unhandled: $($_.Exception.Message)"
}
