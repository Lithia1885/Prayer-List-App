# One-time: registers the heat rock's two Wednesday tasks. Run from an
# elevated PowerShell in this folder, AS THE ACCOUNT the tasks should run
# under (the DPAPI-protected secret and token are bound to that account).
# Prompts once for that account's password so the tasks run logged-off.
#
#   12:30 PM  Ensure Prayer List Render   Print-PrayerList.ps1 -EnsureOnly
#   12:58 PM  Print Prayer List           Print-PrayerList.ps1
#
# Local time on purpose: the rock and the copier share a timezone and a
# building. GitHub's cron window and the flow's 11:45 kick are nominally
# done by 12:15 — anything not in the archive by 12:30 means both ran late
# or failed, and the rock kicks the render with 28 minutes for it to land
# before the paper is due. 12:58 lands the paper as the 1:00 reminder email
# goes out.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Event log source for the script's entries (idempotent).
if (-not [System.Diagnostics.EventLog]::SourceExists("PrayerListPrint")) {
    New-EventLog -LogName Application -Source "PrayerListPrint"
}

$user = "$env:USERDOMAIN\$env:USERNAME"
$cred = Get-Credential -UserName $user -Message "Password for the account these tasks run as"
$password = $cred.GetNetworkCredential().Password
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

function Register-RockTask($name, $at, $extraArgs) {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$root\Print-PrayerList.ps1`" $extraArgs"
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At $at
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
        -User $user -Password $password -RunLevel Limited -Force | Out-Null
    Write-Output "Registered '$name' (Wednesdays $at)."
}

Register-RockTask "Ensure Prayer List Render (Wednesday)" "12:30PM" "-EnsureOnly"
Register-RockTask "Print Prayer List (Wednesday)" "12:58PM" ""

Write-Output "Prove the token first, with no side effects: powershell -File `"$root\Print-PrayerList.ps1`" -TokenCheck"
Write-Output "Test printing: Start-ScheduledTask -TaskName 'Print Prayer List (Wednesday)'"
Write-Output "  (prints five real stapled sets — warn the office before firing it for fun.)"
