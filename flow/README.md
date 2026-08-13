# Power Automate flow packages (versioned)

The Wednesday flow lives in Power Automate, but its source of truth lives
here — the flow was built and is maintained as importable packages so nobody
has to reconstruct it click-by-click in the designer. The pretty-printed
`definition-*.json` files are for diffing and review; the zips are what you
import. All packages share the same flow id, so importing with **Update**
replaces the flow in place and keeps its run history.

## Packages

- **`WeeklyPrayerList_AutoPrint_v5.zip`** — the current era. Generates the
  list (HTML template + OneDrive PDF conversion, no page numbers), archives
  it, prints 5 collated two-sided stapled grayscale sets on the office
  copier via Universal Print, emails office@, and carries the repaired
  catch-all failure alarm. Diffable source: `definition-autoprint-v5.json`.

- **`WeeklyPrayerList_PrintOnly.zip`** — the cutover era. **Do not import
  until the repo renderer is live and proven** (OPERATIONS.md §5, then a
  green manual run of the weekly workflow with the PDF visible in the
  archive). It stops generating entirely: fetches today's repo-rendered PDF
  from the archive library, prints the same job spec, emails. Its failure
  alarm distinguishes "renderer never produced the file" (check GitHub
  Actions) from "print step failed" (print by hand). Diffable source:
  `definition-printonly.json`.

## Import ritual

1. make.powerautomate.com → Connections: ensure a **Universal Print**
   connection exists (sign in as the account with printer-share access).
2. My flows → Import → **Import package (legacy)** → upload the zip.
3. Resource setup: flow = **Update**; map each connection (SharePoint,
   Office 365 ×2, Universal Print — the v5 package also wants OneDrive; the
   print-only one does not).
4. After import: confirm the flow is **On**, then Test → Run once. A test
   run is a real run: real paper, real emails.

## Cutover checklist (v5 → print-only)

1. OPERATIONS.md §5 app-registration runbook completed; repo secrets set.
2. `print/prayer-list.typ` re-skinned as a 1:1 clone of the production sheet
   (the format freeze is real — page numbers are the only sanctioned change)
   and the office has seen and blessed a sample.
3. Manual run of **Weekly prayer list render** → today's PDF appears in the
   archive with page numbers.
4. Import `WeeklyPrayerList_PrintOnly.zip` (Update).
5. Next Wednesday, watch the timeline in OPERATIONS.md §0 happen on its own.

Rollback at any point: re-import `WeeklyPrayerList_AutoPrint_v5.zip` (Update)
and the generator era resumes exactly as before.
