# Scan gateway — copier storage → SharePoint

Rock job #2. The copier's scan-to-storage stays exactly as it is — same
buttons, same built-in share — but the rock drains that share every five
minutes into a SharePoint library. Which retires, permanently, the speech:

> "Ok, hold the Windows key and press R, then type \\192.168.10.11\… it's
> gonna ask about a username, the user is admin… and remember this only
> works when you are connected to our wifi."

Scans appear in SharePoint/Teams instead: searchable, permissioned,
reachable from anywhere, no drive mapping, no wifi caveat (only the rock
needs the LAN). Side benefit: the copier's internal storage stops silently
filling toward the day it refuses to scan.

## Setup (after the print job's steps 1–5 are done)

1. **Pick the destination** — a general office site, *not* the prayer-list
   site (different audience, different permissions). Grant the app write on
   it: same Graph Explorer POST as OPERATIONS.md §5 step 4, with that site's
   id. Fetch the id with
   `GET https://graph.microsoft.com/v1.0/sites/lithiaspringsmethodist.sharepoint.com:/sites/<siteName>`.
2. **Fill in `scan-gateway.config.json`** — `targetSiteId`, library, folder;
   verify `copierShare` (TopAccess → Administration → Setup → Save as File,
   or `net view \\192.168.10.11`).
3. **Prime the copier credential** once, as the task's account:
   `cmdkey /add:192.168.10.11 /user:admin /pass:<copier password>`
4. **Test by hand**: scan something at the copier, wait 2 minutes (settle
   guard), run `powershell -File Move-ScansToSharePoint.ps1`, and find it in
   the library.
5. **Register the schedule**: `Register-ScanGatewayTask.ps1` (elevated, same
   account). Runs every 5 minutes; quiet when there's nothing to do.

## Behavior worth knowing

- **Copy → verify size → then delete.** A failed upload leaves the scan on
  the copier untouched; the next pass retries. Nothing is ever deleted
  before SharePoint confirms the bytes.
- **Settle guard**: files younger than 90 seconds are assumed still being
  written and left for the next pass.
- **Names**: scanner filenames repeat (SCAN0001…), so uploads get a
  `yyyyMMdd-HHmmss-` prefix; the original name survives after it.
- **Diagnostics**: Application event log, source `PrayerListPrint`
  (event 22 = moved files, 23 = failure), transcripts in `C:\heatrock\logs`
  only on passes that did something.
- If the copier's IP ever changes (give it a DHCP reservation), update the
  config and re-run `cmdkey` for the new address.
