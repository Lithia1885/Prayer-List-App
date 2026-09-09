# One-time: registers the every-5-minutes scan-gateway task on the heat rock.
# Run elevated, AS THE SAME ACCOUNT as the print task (it reuses the DPAPI
# secret and the cmdkey copier credential, both bound to that account).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not [System.Diagnostics.EventLog]::SourceExists("PrayerListPrint")) {
    New-EventLog -LogName Application -Source "PrayerListPrint"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$root\Move-ScansToSharePoint.ps1`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
    -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$user = "$env:USERDOMAIN\$env:USERNAME"
$cred = Get-Credential -UserName $user -Message "Password for the account this task runs as"

Register-ScheduledTask -TaskName "Scan Gateway (copier to SharePoint)" `
    -Action $action -Trigger $trigger -Settings $settings `
    -User $user -Password $cred.GetNetworkCredential().Password `
    -RunLevel Limited -Force

Write-Output "Registered - runs every 5 minutes. Prime the copier credential once with:"
Write-Output "  cmdkey /add:<copier-ip> /user:admin /pass:<copier password>"
Write-Output "Then test by scanning something and running: Start-ScheduledTask -TaskName 'Scan Gateway (copier to SharePoint)'"
