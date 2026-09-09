# The heat rock

The always-on Windows box in the church office whose job is to print the
Wednesday prayer list — five collated, two-sided, top-left-stapled,
black-and-white sets — with no human involved. It exists because Microsoft
never shipped the Universal Print connector for Power Automate, cloud print
jobs are delegated-only, and a LAN print queue answers to nobody's licensing
tier or roadmap.

Division of labor: **GitHub renders** (page numbers, tested, versioned) →
**the rock makes sure that happened, then downloads and prints** → **the
flow reminds and alarms**. The "makes sure" is new (2026-09-09): GitHub's
scheduled trigger has run 30 minutes to 3+ hours late every week it has been
watched, so at 12:30 the rock checks the archive and, if today's PDF isn't
there, kicks the render itself — the same "Run workflow" a human does from
the Actions tab, with a token that can do nothing else. The rock failing
never breaks Wednesday: the 1:00 email still goes out and the office prints
manually from its preset queue, same as the pre-rock era.

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
5. **Store the Graph secret** — one time, in a PowerShell running AS THE
   ACCOUNT the scheduled tasks will use (DPAPI binds the file to that account):

   ```powershell
   Read-Host "Graph client secret" -AsSecureString | ConvertFrom-SecureString | Set-Content C:\heatrock\secret.dat
   ```

   This is the same secret as the GitHub `GRAPH_CLIENT_SECRET`. **Rotation
   now has two touchpoints** — the GitHub repo secret AND this file. The
   Monday expiry-watchdog issue lists both.
6. **Store the GitHub token** that lets the rock kick the render. On GitHub,
   as the repo owner: Settings → Developer settings → Personal access tokens
   → **Fine-grained tokens** → Generate new token. Repository access:
   **only this repository**. Repository permissions: **Actions: Read and
   write** (Metadata: Read comes along by itself). Nothing else. Take the
   longest expiry offered and **write the date down** — the token is shown
   once. (If the organization blocks fine-grained tokens, allow them under
   the org's Settings → Personal access tokens; a classic token would need
   the whole `repo` scope, far more than this job deserves.) Then, in the
   same kind of PowerShell as step 5:

   ```powershell
   Read-Host "GitHub token" -AsSecureString | ConvertFrom-SecureString | Set-Content C:\heatrock\github-token.dat
   ```

   This is the same token the Logic App kick uses (OPERATIONS.md §8) — if
   that exists already, reuse it rather than minting a second one. Put the
   expiry date in `heatrock.config.json` → `githubTokenExpires`
   (`YYYY-MM-DD`) and merge; the Monday watchdog counts down from it and
   opens an issue 45 days out. Without the token file the rock still works —
   it just can't kick the render, and Wednesday is back to depending on
   the Logic App and GitHub's clock.
7. **Prove the token** (no side effects — it authenticates and confirms the
   Actions write permission without running anything):
   `powershell -File C:\heatrock\Print-PrayerList.ps1 -TokenCheck`
8. **Test the script by hand** (prints five real stapled sets — warn the
   office): `powershell -File C:\heatrock\Print-PrayerList.ps1`. On a day
   with no PDF in the archive yet, this first kicks a real render, which
   uploads a file named for today — harmless, but delete it from the archive
   afterwards if it isn't a Wednesday.
9. **Register the schedule**: elevated PowerShell, same account →
   `powershell -File C:\heatrock\Register-Task.ps1`. Two tasks, both local
   time, one password prompt so they run logged-off: **12:30 PM**
   ensure-the-render, **12:58 PM** print.

## Behavior worth knowing

- **12:30: kick the render if nothing else has.** GitHub's own cron window
  and the Logic App's 11:45 kick are all nominally done by 12:15; if
  `prayer_list_YYYYMMDD.pdf` isn't in the archive at 12:30, the rock
  dispatches the render workflow and waits up to `renderWaitMinutes` (5) for
  the file to land — a render takes about 20 seconds once a runner picks it
  up. The 12:58 print run makes the same check as a last resort before
  printing. A late GitHub run arriving afterwards just overwrites the file
  with a fresher render; nothing prints twice.
- **Refuses to print anything but today's file.** A missing
  `prayer_list_YYYYMMDD.pdf` that the rock couldn't fix (no token, dispatch
  refused, render didn't land) means the render failed; printing last week's
  list would be quiet misinformation, so the script errors instead — and the
  1:00 flow independently alarms about the missing file.
- **Diagnostics**: Application event log, source `PrayerListPrint` —
  12 printed · 13 failed · 14 render kicked (GitHub's schedule was late) ·
  15 render missing and no token to kick it · 16 kicked render landed —
  plus per-run transcripts in `C:\heatrock\logs` (`ensure-*`, `print-*`,
  `tokencheck-*`). A 14 most weeks is GitHub's problem, not the rock's; a 15
  means step 6 was skipped.
- **Windows Update is part of the design surface.** Set the active-hours /
  restart window so the box is never mid-reboot at Wednesday 12:30–1:00, and
  check the event log after patch Tuesdays.
- Both tasks have `-StartWhenAvailable`, so if the rock was asleep or booting
  at the trigger time they fire as soon as they can.
- Works under Windows PowerShell 5.1 (`powershell.exe`, what the tasks run)
  and PowerShell 7 alike.

## "Other stuff" policy

The rock will attract jobs — that's fine (it's why it exists), but every new
job inherits the pet problem. House rule from OPERATIONS.md: anything the
rock does gets a folder like this one — script, config, README, event-log
source — in some repo. No snowflake tasks configured only by hand.
