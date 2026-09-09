# One-time: registers the Wednesday 12:58 PM print task on the heat rock.
# Run from an elevated PowerShell in this folder, AS THE ACCOUNT the task
# should run under (the DPAPI secret is bound to that account). Prompts once
# for that account's password so the task can run without a logged-on session.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Event log source for the script's success/failure entries (idempotent).
if (-not [System.Diagnostics.EventLog]::SourceExists("PrayerListPrint")) {
    New-EventLog -LogName Application -Source "PrayerListPrint"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$root\Print-PrayerList.ps1`""
# Local time on purpose: the rock and the copier share a timezone and a
# building. 12:58 lands the paper as the 1:00 reminder email goes out, with
# the render done since ~12:15.
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At 12:58PM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$user = "$env:USERDOMAIN\$env:USERNAME"
$cred = Get-Credential -UserName $user -Message "Password for the account this task runs as"

Register-ScheduledTask -TaskName "Print Prayer List (Wednesday)" `
    -Action $action -Trigger $trigger -Settings $settings `
    -User $user -Password $cred.GetNetworkCredential().Password `
    -RunLevel Limited -Force

Write-Output "Registered. Test now with: Start-ScheduledTask -TaskName 'Print Prayer List (Wednesday)'"
Write-Output "(A test run prints five real stapled sets — warn the office before firing it for fun.)"
