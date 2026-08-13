# The heat rock

The always-on Windows box in the church office whose job is to print the
Wednesday prayer list — five collated, two-sided, top-left-stapled,
black-and-white sets — with no human involved. It exists because Microsoft
never shipped the Universal Print connector for Power Automate, cloud print
jobs are delegated-only, and a LAN print queue answers to nobody's licensing
tier or roadmap.

Division of labor: **GitHub renders** (page numbers, tested, versioned) →
**the rock downloads and prints** → **the flow reminds and alarms**. The rock
failing never breaks Wednesday: the 1:00 email still goes out and the office
prints manually from its preset queue, same as the pre-rock era.

## Setup, bare Windows → first stapled page

1. **Install the Toshiba LAN driver** for the e-STUDIO3515AC (the full
   driver, not a universal/basic one — the finisher options must be present).
2. **Create the queue that owns the spec.** Add a second printer instance
   named exactly **`Prayer List (5 stapled sets)`** pointing at the copier.
   In its **Printing defaults** (Administration tab — not "preferences,"
   which are per-user), set: **5 copies · collate · two-sided, flip on long
   edge · staple top-left · black & white · Letter**. The script passes no
   print settings, ever — this queue is the single source of truth for the
   job spec, the same way `render.config.json` is for the site identity.
3. **Install SumatraPDF** (silent PDF printing — the standard tool):
   `winget install SumatraPDF.SumatraPDF`, or update `sumatraPath` in
   `heatrock.config.json` if it lands elsewhere.
4. **Copy this folder** to `C:\heatrock` (or clone the repo; the script
   expects `..\print\render.config.json` to exist, so a full clone is
   simplest and keeps the rock updateable with `git pull`).
5. **Store the secret** — one time, in a PowerShell running AS THE ACCOUNT
   the scheduled task will use (DPAPI binds the file to that account):

   ```powershell
   Read-Host "Graph client secret" -AsSecureString | ConvertFrom-SecureString | Set-Content C:\heatrock\secret.dat
   ```

   This is the same secret as the GitHub `GRAPH_CLIENT_SECRET`. **Rotation
   now has two touchpoints** — the GitHub repo secret AND this file. The
   Monday expiry-watchdog issue lists both.
6. **Test the script by hand** (prints five real stapled sets — warn the
   office): `powershell -File C:\heatrock\Print-PrayerList.ps1`
7. **Register the schedule**: elevated PowerShell, same account →
   `powershell -File C:\heatrock\Register-Task.ps1` (Wednesdays 12:58 PM
   local; prompts for the account password so it runs logged-off).

## Behavior worth knowing

- **Refuses to print anything but today's file.** A missing
  `prayer_list_YYYYMMDD.pdf` means the render failed; printing last week's
  list would be quiet misinformation, so the script errors instead — and the
  1:00 flow independently alarms about the missing file.
- **Diagnostics**: Application event log, source `PrayerListPrint`
  (Event 12 success, 13 failure), plus per-run transcripts in
  `C:\heatrock\logs`.
- **Windows Update is part of the design surface.** Set the active-hours /
  restart window so the box is never mid-reboot at Wednesday 12:58, and
  check the event log after patch Tuesdays.
- The task has `-StartWhenAvailable`, so if the rock was asleep or booting
  at 12:58 it fires as soon as it can.

## "Other stuff" policy

The rock will attract jobs — that's fine (it's why it exists), but every new
job inherits the pet problem. House rule from OPERATIONS.md: anything the
rock does gets a folder like this one — script, config, README, event-log
source — in some repo. No snowflake tasks configured only by hand.
