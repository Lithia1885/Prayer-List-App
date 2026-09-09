# Power Automate flow packages (versioned)

The Wednesday flow lives in Power Automate, but its source of truth lives
here — importable packages so nobody reconstructs it click-by-click in the
designer. The pretty-printed `definition-*.json` files are for diffing and
review; the zips are what you import. All packages share the same flow id, so
importing with **Update** replaces the flow in place and keeps its history.

A hard-won fact baked into every package: the original export's failure alarm
was dead code (AND-ed `runAfter` conditions no failure could satisfy). All
variants here carry the repaired catch-all alarm.

## The lineup, in chronological order

- **`WeeklyPrayerList_AlarmFix_NoPrint.zip`** — **today's flow.** The
  original generator (HTML template + OneDrive PDF conversion, no page
  numbers), original "ready to print" email, repaired alarm. Import this to
  run the pre-renderer era safely. Connections: SharePoint, OneDrive,
  Office 365 ×2. Source: `definition-alarmfix-noprint.json`.

- **`WeeklyPrayerList_NotifyOnly.zip`** — **the cutover target.** The repo
  renderer owns typesetting (page numbers, Carlito, the cloned sheet); the
  flow shrinks to: verify today's `prayer_list_YYYYMMDD.pdf` exists in the
  archive → send the same "ready to print" reminder to office@ → alarm on
  any failure, distinguishing "renderer never produced the file" (check
  GitHub Actions) from "only the email failed." Manual printing continues
  unchanged. **Import only after a green manual run of the weekly render
  workflow** — before that, there is no file to find and Wednesday becomes
  an alarm. Connections: SharePoint, Office 365 ×2 (OneDrive retired).
  Source: `definition-notifyonly.json`.

- **`WeeklyPrayerList_PrintOnly.zip`** — **shelved: needs the Universal
  Print connector**, which Microsoft documents but has not actually shipped
  to tenants. If it ever appears in the connection catalog, this is
  NotifyOnly plus auto-print (5 collated sets, duplex long-edge, staple
  top-left, grayscale, share baked by id). Source:
  `definition-printonly.json`.

- **`WeeklyPrayerList_AutoPrint_v5.zip`** — **superseded.** Old engine plus
  the Universal Print action; kept for history. Blocked by the same missing
  connector and made obsolete by the renderer. Source:
  `definition-autoprint-v5.json`.

## Import ritual

1. My flows → Import → **Import package (legacy)** → upload the zip.
2. Resource setup: flow = **Update**; map each connection the package lists.
3. After import: confirm the flow is **On**, then Test → Run once. A test
   run is a real run — real emails, and (for the current era) a real PDF.

## Cutover checklist (AlarmFix → NotifyOnly)

1. Renderer app registration + repo secrets done (OPERATIONS.md §5), and
   `graphSecretExpires` set in `print/render.config.json`.
2. The office has blessed the cloned sheet (format freeze — page numbers are
   the only sanctioned change).
3. Manual run of **Weekly prayer list render** → today's page-numbered PDF
   visible in the archive.
4. Import `WeeklyPrayerList_NotifyOnly.zip` (Update).
5. Next Wednesday: renderer uploads by ~12:15 ET, flow confirms and emails
   at 1:00, she prints as always — now with "N | P a g e" on every sheet.

Rollback at any point: re-import `WeeklyPrayerList_AlarmFix_NoPrint.zip` and
the old engine resumes exactly as before.

## The render kick (2026-09-09; built by hand until it's exported here)

GitHub's own scheduler has run the Wednesday render 30 minutes to 6 hours
late every week it's been measured (OPERATIONS.md §0), so the flow — whose
Recurrence trigger has been punctual all along — kicks the render itself.
The tier here has no HTTP action, but the **GitHub** connector is standard,
and an *issue* is something Actions reacts to immediately: the workflow
renders on any issue titled exactly **`Render the prayer list`** opened by
an owner, member or collaborator, then closes it with a link to the run.
No token to store or rotate; the connection is the repo owner's own
GitHub sign-in.

A second, separate flow (leave the Wednesday flow alone):

1. My flows → **New flow → Scheduled cloud flow**. Name: `Kick the
   prayer-list render`. Recurrence: **Week**, on **Wednesday**, at
   **11 : 45**, time zone **Eastern Time (US & Canada)** — that's 30 minutes
   after the last cron slot and 73 before the paper is due; the render
   itself takes about a minute end to end.
2. **New step → GitHub → Create an issue.** Sign in as the repo owner's
   GitHub account when it asks for a connection. Repository owner
   `Lithia1885`, repository `Prayer-List-App`, title exactly
   `Render the prayer list`, body `Kicked by the Wednesday flow.`
3. Save. **Test → Manually**: within about a minute the issue appears in
   the repo, the **Weekly prayer list render** run starts, and the issue
   closes itself with a link. (On a day that isn't Wednesday this uploads a
   file named for today into the archive — harmless; delete it afterwards.)
4. House rule: **Export → Package (.zip)** the flow and commit it here as
   `WeeklyPrayerList_RenderKick.zip` with its pretty-printed definition
   next to the others, so nobody reconstructs it click-by-click.

If the kick fails (most likely the GitHub connection needing a fresh
sign-in), Power Automate emails the flow owner, the render's own cron
window is still in play, and the issue simply never appears — which is
itself the tell. A kick whose render *failed* leaves the issue open.
