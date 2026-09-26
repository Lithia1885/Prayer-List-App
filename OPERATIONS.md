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
| 5:15 AM – 12:45 PM Wed | GitHub Action renders the page-numbered PDF from the live list and uploads it to the archive (overwrites on re-run) — scheduled every half hour across the window, because GitHub's scheduler runs hours late and the early tries are what still land in time; the freshest to land before printing wins | `.github/workflows/weekly-prayer-list.yml` |
| 11:45 AM Wed | Logic App dispatches the render workflow (one HTTP call, delivered immediately — unlike GitHub's own schedule); the render is done within a minute. The reliable kick, before the rock exists and after (§8) | Azure Logic App → GitHub |
| 12:30 PM Wed | The heat rock (once deployed) checks the archive; if today's PDF still isn't there, it kicks the render itself and waits for the file to land (see `heatrock/README.md`) | office Windows box |
| 12:58 PM Wed | The heat rock downloads today's PDF and prints 5 stapled sets on the Toshiba via its LAN queue — kicking the render first if it's somehow still missing | office Windows box |
| 1:00 PM Wed | Flow verifies today's PDF exists and sends the office reminder | Power Automate |
| on failure | Three independent nets: GitHub emails the owner about a *failed* render (a *late* schedule trigger emails nobody — the rock's 12:30 kick covers that, logging event 14 when it had to); the rock refuses stale prints and logs to the event log (no paper = visible); the flow alarms if the file is missing | all three |

The rock failing never breaks Wednesday: the reminder email still fires and
the office prints manually from its preset queue — the pre-rock workflow is
the permanent fallback.

Exactly one of two emails ends every Wednesday: "printed and in the tray" to
the office, or the alarm to Bart.

**Known weakness, and what covers it (as of 2026-09-09).** GitHub's
`schedule:` trigger has fired late every week it's been measured — 30 and
43 minutes late on 2026-08-19 and 08-26, over 3 hours late on 09-02, and
2h21m late on 09-09 with *two* scheduled attempts in the file (a single run
showed up, hours after both; the Monday watchdog's cron was 6 hours late on
08-31). Delay, not drop — but a 3-hour delay is a missed Wednesday all the
same, and more cron entries at the same times can't fix that. Three layers
now cover it, none of which trusts GitHub's clock:

1. **The cron window starts at 5:15 AM.** Late is the only direction the
   scheduler errs in, so a half-hourly window from 5:15 AM to 12:45 PM
   means even a 6-hour delay lands a sheet before 12:30; every later run
   overwrites with fresher data. (An early-morning sheet beats no sheet;
   that's the only trade.)
2. **A Logic App kicks the render at 11:45 AM** with a `workflow_dispatch`
   call — Azure's scheduler is the one the Power Automate flow has been
   punctual on all along, and dispatches reach Actions immediately. Built
   in the portal in ten minutes (§8); the tenant already has the
   subscription. No people-facing artifacts: nothing to read, nothing to
   click, nothing to be notified about.
3. **The heat rock kicks it at 12:30** if the file still isn't there,
   once the rock is deployed with its token (`heatrock/README.md` step 6).

(2) and (3) share one fine-grained token that can only run this repo's
Actions; its expiry is the `githubTokenExpires` the Monday watchdog counts
down. Until (2) is built, Wednesday rides on (1) plus someone noticing. On
a week the rock is down the office prints by hand from the archive, as in
the pre-rock era.

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

**e-BRIDGE Plus apps evaluated (2026-08, manuals + packages from Toshiba
support):** Both the SharePoint Online and Exchange Online apps are
license-fee apps (`LicenseNecessity: Required`; ~90-day trial), unlike the
free Universal Print app. The SharePoint app CAN print from the archive at
the panel with the full spec (Sets ×5, Black, Book duplex, Staple Upper
Left) — but it has **no configurable print defaults**, so the spec would be
four touchscreen choices per session behind a QR/email sign-in dance. For
the Wednesday job it lost to the heat rock (free, zero-touch, spec baked in
the queue). Its residual case is **scan-to-SharePoint** (filing paper into
the site from the copier) — evaluate the trial on that merit alone. The
Exchange app is scan-to-email only (outbound; no inbound print) — **case
closed**: this copier has no scan-to-email at all (scanning goes to its
built-in storage share), so the basic-auth SMTP retirement has nothing to
break here. The scan-to-SharePoint case is served free by **rock job #2**
(`heatrock/scan-gateway/`): the rock drains the copier's built-in share
into a SharePoint library every five minutes, retiring the map-a-network-
drive onboarding speech and keeping the copier's storage from filling.
Toshiba has NOT yet answered the native E-mail Direct Print OAuth
question; optional now that the rock covers zero-touch.

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
- **Notices list** — resolved **by name**, not by id, because it's created by
  hand (see below). One column, the default `Title`, which holds a notice id
  such as `move-v1`. One row per person per notice, written when they press
  OK on the standing banner (§9). The browser sends nothing else: SharePoint's
  own `Author` and `Created` are the record.
  **Until this list exists the banner stays hidden** — deliberately, so a
  missing list can never leave the church with a notice nobody can dismiss.
  Create it before shipping a notice:
  1. Site contents → New → List → Blank list, name it **Notices**. The
     default `Title` column is all it needs.
  2. Settings gear → List settings → Advanced settings → **Item-level
     Permissions**: Read access → *Read items that were created by the
     user*; Create and Edit access → *Create items and edit items that were
     created by the user*. Save.

  Step 2 is the privacy story in full — without it everyone can read
  everyone else's rows. The app also checks each row's `Author` against the
  signed-in person and ignores rows that aren't theirs, so a missed step 2
  can't hide the notice from the whole church; it would just mean who has
  read what is readable by all.
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
| `secret-expiry.yml` (Mondays) | Renderer Graph secret ≤45 days out (or date unset while credentials exist), and the heat rock's GitHub token ≤45 days out; self-closing issues carrying the rotation runbooks | GitHub issue |
| Weekly workflow failure | Render/upload broke | GitHub email to repo owner |
| Rock event log (source `PrayerListPrint`) | 14 = GitHub's schedule was late and the rock kicked the render; 15 = it couldn't (no token installed); 13 = nothing to print, or printing failed | Application log on the office box |
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
- Workflow crons are UTC: `15,45 9-16 * * 3` is every half hour from 09:15
  to 16:45 UTC on Wednesdays — 5:15 AM to 12:45 PM EDT, 4:15 to 11:45 AM
  EST — because GitHub's scheduled trigger runs hours late, unpredictably,
  and only the early slots reliably land in time. They are the first try;
  the Logic App's 11:45 kick (§8) and the rock's 12:30 check are the
  backstops (see §0).

## 8. The render kick (Azure Logic App) — 2026-09-09

Why this and not the flow: GitHub's scheduler runs this repo's crons hours
late (§0); the Power Automate tier here has no HTTP action; and driving an
Action through issues would turn a people channel into plumbing. Azure
Logic Apps is the same designer and the same punctual scheduler as Power
Automate, with HTTP built in, and the tenant already has a subscription —
the app's Static Web App lives in it. Cost is a fraction of a cent a month.

1. **The token.** GitHub → Settings → Developer settings → Personal access
   tokens → **Fine-grained tokens** → Generate: repository access **only
   this repository**, Repository permissions **Actions: Read and write**,
   nothing else. Longest expiry offered; **write the date down** — the
   token is shown once. It is the same token the heat rock uses
   (`heatrock/README.md` step 6): one token, one expiry. (If the
   organization blocks fine-grained tokens, allow them under its Settings →
   Personal access tokens.)
2. portal.azure.com → **Logic App** → Create: plan type **Consumption**,
   the Static Web App's resource group, name `prayer-list-render-kick`.
3. Designer, blank: trigger **Recurrence** — Week, **Wednesday**, **11:45**,
   time zone **Eastern Time (US & Canada)** (DST handled).
4. Action **HTTP**: POST
   `https://api.github.com/repos/Lithia1885/Prayer-List-App/actions/workflows/weekly-prayer-list.yml/dispatches`
   with headers `Accept: application/vnd.github+json`,
   `Authorization: Bearer <the token>`, `X-GitHub-Api-Version: 2022-11-28`,
   `User-Agent: prayer-list-kick`, and body `{"ref":"main"}`. In the
   action's **Settings**, turn on **Secure Inputs** so the token never
   appears in run history. GitHub answers 204 with an empty body.
5. Save, then **Run** once: a *Weekly prayer list render* run appears in
   the Actions tab within seconds. (On a day that isn't Wednesday that
   uploads a file named for today into the archive — harmless; delete it
   afterwards.)
6. Put the token's expiry in `heatrock/heatrock.config.json` →
   `githubTokenExpires` and merge; the Monday watchdog counts down from it,
   and its issue lists both places the token lives.

If the kick fails, the Logic App's run history says so, the cron window is
still in play, and the 1:00 flow alarms if nothing landed. Optional: an
Office 365 **Send an email** action configured to run only *after the HTTP
action fails*, for a same-morning heads-up.

## 9. The move to a new home — notice and blackout (2026-09-26)

### The standing notice

A banner sits at the top of the app, in the page flow above every route: it
pushes the list down, never covers it, and never disappears on its own.
Pressing **OK, I've read this** writes one row to the **Notices** list (§2)
and collapses the banner to a single line that reopens on a tap.

Read state lives in SharePoint, not in the browser, so it follows a person
from their phone to the office computer, and clearing a cache doesn't bring
the notice back.

Two files: `src/lib/notice.ts` holds the id and every word of the copy;
`src/components/NoticeBanner.tsx` renders it. Nothing else needs touching.

**To announce the date** — or to change the wording for any other reason —
edit `src/lib/notice.ts` and change *both*:

1. the copy, and
2. `NOTICE_ID`: `move-v1` → `move-v2`.

The acknowledgement rows are keyed by that id, so a new id means nobody has
read the new wording yet and everyone sees the full banner again. Editing
the copy *without* bumping the id is the failure mode to watch for: the
people who already pressed OK would never see the date. Bumping leaves the
old `move-v1` rows in the list; they're harmless, and worth keeping as the
record of who saw the first notice.

### Writer inventory — what has to stop for the blackout

Cutover is a Saturday night. Anything still writing to
`/sites/prayer-list-pilot` after the final export writes into the old list,
where it will be lost. Everything that can write, and how to stop it:

| Writer | Writes to | Stop it by |
|---|---|---|
| The app — request create, edit, status change, delete, merge | `Prayer Requests` | Taking it offline at the announced hour; it's the thing being replaced |
| The app — audit trail | `PrayerEvents` | Goes with the app |
| The app — notice acknowledgements | `Notices` | Goes with the app; nothing to migrate |
| Renderer, `print/render.mjs --live --upload` | `Prayer List Archive` (uploads today's PDF, overwriting) | Removing the `schedule:` from `.github/workflows/weekly-prayer-list.yml` — **and** disabling the Logic App kick (§8), because a `workflow_dispatch` fires whether or not a schedule exists |
| Power Automate flow | `Prayer List Archive` (v5 create-only archive step), office email | Turning the flow off in Power Automate |
| Heat rock | Nothing directly — it reads the archive and prints. But at 12:30 it *dispatches* the render (§0), so it writes by proxy | Disabling its scheduled task (`heatrock/Register-Task.ps1` registered it), or removing its token |

The rock is the one that looks harmless and isn't: it kicks a render when
the archive looks empty, so a Wednesday inside the blackout would push a
fresh PDF into the old library. Saturday night is chosen precisely because
the whole print chain is idle then — but if the blackout stretches across a
Wednesday, all three of the render, the kick and the rock have to be off.

Not on this list, because they don't write to the prayer site: the Bulletin
button (reads the archive) and the Monday secret watchdog (opens GitHub
issues, touches no SharePoint).

One to check rather than assume: the **scan gateway** (`heatrock/scan-gateway/`)
does write — it PUTs drained copier scans into a SharePoint library — but by
design into a general office site, not this one. Its `targetSiteId` is still
`TODO`; if it is ever pointed at `/sites/prayer-list-pilot`, it belongs in
the table above.
