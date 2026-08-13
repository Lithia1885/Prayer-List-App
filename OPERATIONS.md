# Operations — The Prayer List

The app's README covers the code. This file covers everything *around* the
code that has to keep working for Wednesday to happen: the copier, the Power
Automate flow, the renderer, and the credentials that expire on dates nobody
remembers. Pattern borrowed from the bulletin repo's OPERATIONS.md: when
something breaks on a Tuesday night, start here.

## 0. The Wednesday timeline

Current (auto-print era, `flow/WeeklyPrayerList_AutoPrint_v5.zip` imported):

| When (ET) | What | Where |
|---|---|---|
| 1:00 PM Wed | Flow queries the list, builds HTML, converts to PDF (OneDrive), archives it, **prints 5 stapled sets**, emails office@ | Power Automate |
| on failure | High-importance alarm email to Bart with triage steps | Power Automate |

Future (page-numbers era, after the renderer cutover — see `flow/README.md`):

| When (ET) | What | Where |
|---|---|---|
| 11:15 AM / 12:15 PM Wed | GitHub Action renders the page-numbered PDF from the live list and uploads it to the archive (overwrites on re-run) | `.github/workflows/weekly-prayer-list.yml` |
| 12:58 PM Wed | The heat rock downloads today's PDF and prints 5 stapled sets on the Toshiba via its LAN queue (see `heatrock/README.md`) | office Windows box |
| 1:00 PM Wed | Flow verifies today's PDF exists and sends the office reminder | Power Automate |
| on failure | Three independent nets: GitHub emails the owner about a failed render; the rock refuses stale prints and logs to the event log (no paper = visible); the flow alarms if the file is missing | all three |

The rock failing never breaks Wednesday: the reminder email still fires and
the office prints manually from its preset queue — the pre-rock workflow is
the permanent fallback.

Exactly one of two emails ends every Wednesday: "printed and in the tray" to
the office, or the alarm to Bart.

## 1. The copier

**Toshiba e-STUDIO3515AC**, running **e-BRIDGE Plus for Universal Print
4.12.000** (installed via TopAccess → Administration → Application).

- Printer id: `90473f8f-0c59-41c9-bcfb-49d6f00b6aa2`
- Printer **share** id: `e3161c59-8a01-45e2-a108-0fff1aa19db1` (created
  2026-08-13, `allowAllUsers: true`). Jobs can only target shares. The share
  id is baked into the flow's print action — renaming the share in the portal
  is safe; deleting and recreating it is not (re-bake the flow).
- Admin portal: portal.azure.com → search "Universal Print".

**The job spec — frozen by office practice, don't change casually:**
**5 collated sets · two-sided, flip on long edge · stapled top-left ·
grayscale (austerity policy) · US Letter.** The whole run counts as ONE job
against the Universal Print pooled allowance (E3 licensing covers it).

Device facts that matter (from `GET /print/shares/{id}?$select=capabilities`):
PDF is accepted natively; staple options exist but there is **no folding
finisher** (a future booklet would print flat for hand-folding); device
defaults are one-sided/unstapled/color, which is why the flow pins everything.

Troubleshooting:
- Job vanished without error → TopAccess → Logs → View Logs → **Application
  Log**. "There are too many requests" = device-side throttling; wait ~10 min.
- If user authentication or department codes are ever enabled on the device,
  Universal Print jobs will fail auth unless a **Delegate User** is set or the
  submitting Azure account is added to the conversion mapping (Toshiba manual,
  "Setting a print user"). This is the classic silent job-eater.
- Never uninstall the e-BRIDGE app without deleting the printer from the
  Azure portal first (the manual is explicit about the order).

## 2. The SharePoint side (manual prerequisites)

Site: `/sites/prayer-list-pilot` (the name is historical — it's production).
Site id and list ids live in `src/lib/graph.ts` and `print/render.config.json`.

- **Prayer Requests list** (`176cec8e-…`): columns `Title`, `Request`,
  `Category`, `Status`, `Relationship`, `DateSubmitted`, `Address`, `Notes`,
  plus app-managed `LastUpdated` (the honest "last touched" timestamp — the
  print-out's ordering and "(Updated …)" suffixes depend on it) and `PersonId`.
  Deleting or renaming these columns in SharePoint degrades the app silently.
- **PrayerEvents list** (`4140d627-…`): the audit trail.
- **"Prayer List Archive" is a document LIBRARY at site root**, not a folder
  inside Shared Documents. The flow's CreateFile path and the app's
  `fetchLatestBulletin` both rely on this; the renderer resolves the library
  by name and falls back to a same-named folder, tolerating either layout.
- `Shared Documents/Templates/prayer_list_template.html`: the current flow's
  HTML template. At cutover it retires — but its look must be cloned into
  `print/prayer-list.typ` first (see §4).

**Format freeze.** The printed sheet's layout is fixed by long office
practice and the prayer team's expectations. The renderer may add the
page-number footer; every other visual change needs the office's sign-off
*before* it ships, not after.

## 3. The Power Automate flow

One flow, imported from versioned packages in `flow/` (see `flow/README.md`
for import and cutover rituals). All connections are owned by
bart.arther@lithiaspringsmethodist.org; the Universal Print connection prints
as its owner.

Things learned the hard way, kept true in both packages:
- The original export's failure alarm was **dead code** — multiple `runAfter`
  entries AND together, and mid-pipeline failures mark downstream actions
  Skipped, so the alert conditions could never all hold. The fix: point the
  alarm at the final action with `Failed, Skipped, TimedOut`.
- The v5 archive step is create-only: **running the flow twice on the same
  day trips the alarm** (file already exists). The renderer's upload
  overwrites instead, so post-cutover re-runs self-correct.

## 4. The renderer (`print/`)

Why it exists: the office asked for **page numbers** ("Page 2 of 3" is how
you check a stapled set is complete), and OneDrive's HTML→PDF conversion —
the only standard-tier renderer Power Automate has — cannot produce them.

- `render.mjs` — zero-dependency Node. `node print/render.mjs` renders the
  committed fixture; `--png` adds page previews; `--live --upload` is what
  the weekly workflow runs. Needs `typst` (CI pins v0.13.1; set `TYPST_BIN`
  locally).
- `prayer-list.typ` — the layout. **Currently a placeholder** (see the
  warning at the top of the file): entry semantics are faithful to the flow's
  row markup, but the visual dress must be re-skinned as a 1:1 clone of the
  production sheet from a recent archive PDF before cutover. Only the footer
  is new.
- `render.test.mjs` — compiles the fixture and asserts the things the office
  depends on (multi-page output, archive-style filename, all four sections,
  homebound formatting). Runs in CI; skips without a typst binary.
- Fixture data is **invented names only** — never put real congregants in
  `fixtures/`.

## 5. Renderer app registration (AS BUILT — 2026-08-13)

The weekly workflow authenticates app-only. **As actually configured, there
is no separate renderer registration**: the prayer app's own Entra
registration (client id `746131b5-f33f-4df8-a4c0-5ccc08ca52c4`, the one in
`src/lib/msal.ts`) pulls double duty — public SPA client for the scribes,
confidential client for the renderer. It carries:

- Delegated `Sites.ReadWrite.All` (the SPA's scribe access, unchanged)
- **Application `Sites.Selected`** with admin consent (the renderer's lane)
- A **client secret**, used only by GitHub Actions (`GRAPH_CLIENT_SECRET`
  repo secret; the SPA never sees or needs it)
- A **site-level grant** on the prayer-list site: `roles: ["write"]` for
  this app id, created via
  `POST /v1.0/sites/{siteId}/permissions` (Graph Explorer, 2026-08-13,
  identity displayName "Prayer List Renderer")

This is fine — the secret's blast radius is the renderer only — but know the
coupling: deleting or re-creating the app registration now takes out BOTH
the scribes' sign-in and the Wednesday render. To audit the site grant:
`GET /v1.0/sites/{siteId}/permissions` in Graph Explorer.

To rotate or rebuild from scratch:

1. (If rebuilding) Entra → App registrations → the prayer app registration.
2. API permissions → Microsoft Graph → **Application** → `Sites.Selected` →
   **Grant admin consent**. (Deliberately not `Sites.Read.All` — the app
   should see this one site, not the tenant.)
3. Certificates & secrets → **New client secret** → longest expiry → copy the
   value now (shown once) and write down the expiry date.
4. Grant the app the site, in Graph Explorer (as admin):
   `POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions` with
   body
   `{"roles":["write"],"grantedToIdentities":[{"application":{"id":"<the client id above>","displayName":"Prayer List Renderer"}}]}`
   (Graph Explorer needs the delegated `Sites.FullControl.All` consent for
   this single call.)
5. GitHub repo → Settings → Secrets and variables → Actions: set
   `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`.
   **The same secret also lives on the heat rock** as DPAPI-protected
   `C:\heatrock\secret.dat` — rotation must touch BOTH (the Monday watchdog
   issue lists both steps; the write ritual is in `heatrock/README.md`).
6. Put the secret's expiry date in `print/render.config.json` →
   `graphSecretExpires` and merge (the watchdog counts down from it).
7. Actions → **Weekly prayer list render** → Run workflow → confirm the PDF
   lands in the archive.

## 6. Watchdogs, layered

| Signal | Covers | Where it lands |
|---|---|---|
| `secret-expiry.yml` (Mondays) | Renderer secret ≤45 days out, or date unset while credentials exist; self-closing issue with the rotation runbook | GitHub issue |
| Weekly workflow failure | Render/upload broke | GitHub email to repo owner |
| Flow alarm email | Anything in the print chain, including "no PDF today" after cutover | Bart's inbox, high importance |
| In-app | The Bulletin button silently disappears if the archive is unreachable — a stale-bulletin banner is a known candidate improvement | — |

## 7. Standing constraints

- **Graph print-job creation is delegated-only.** No app-only printing
  exists; cloud-side automation cannot print. This is why the printing leg
  lives on the heat rock's LAN queue — a local spooler job is outside
  Graph's rules entirely, needs no Universal Print license, and exposes the
  full finisher.
- The Universal Print connector is preview-vintage and its connection is
  per-user (not shareable).
- An empty week still prints five stapled sets of "No active entries this
  week." — accepted behavior.
- Workflow crons are UTC: `15 16 * * 3` is 12:15 PM EDT / 11:15 AM EST, both
  safely ahead of the 1:00 PM flow.
