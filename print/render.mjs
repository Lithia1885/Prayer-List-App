#!/usr/bin/env node
// Renders the Wednesday prayer-list PDF (the one with page numbers) and,
// in --live mode, uploads it to the SharePoint archive where the Power
// Automate flow picks it up and prints it.
//
//   node print/render.mjs                 fixture data -> .build/ PDF (no network)
//   node print/render.mjs --png           also emit per-page PNG previews
//   node print/render.mjs --live          fetch the real list app-only, render
//   node print/render.mjs --live --upload ...and PUT the PDF into the archive
//
// Live mode needs env: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
// (the "Prayer List Renderer" app registration — OPERATIONS.md §2 has the
// runbook). Zero npm dependencies on purpose: token + Graph calls are plain
// fetch, and the PDF is produced by the `typst` binary (TYPST_BIN to override).
//
// Uploading the same filename twice OVERWRITES (Graph PUT semantics). That is
// deliberate and unlike the old flow's create-only archive step: re-running
// the renderer on a Wednesday self-corrects instead of erroring.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PRINT_DIR = dirname(fileURLToPath(import.meta.url));
const BUILD = join(PRINT_DIR, ".build");
const CONFIG = JSON.parse(readFileSync(join(PRINT_DIR, "render.config.json"), "utf8"));

const args = new Set(process.argv.slice(2));
const LIVE = args.has("--live");
const UPLOAD = args.has("--upload");
const PNG = args.has("--png");
if (UPLOAD && !LIVE) fail("--upload only makes sense with --live.");

// The four print sections — titles and ORDER are verbatim from the production
// template (prayer_list_template.html): At Home Members prints LAST, after
// Nation & World. Category mapping matches the flow's Filter actions. At Home
// entries print request-else-address and no "(Updated ...)" suffix — matching
// the flow's Select_Homebound_Rows.
const SECTIONS = [
  { title: "Members & Family", categories: ["Member", "Family or Friend"], style: "standard" },
  { title: "Other Text Requests for Prayer Received", categories: ["Text-in request"], style: "standard" },
  { title: "For Our Nation & World", categories: ["Nation or World"], style: "standard" },
  { title: "At Home Members", categories: ["Homebound member"], style: "homebound" },
];

const TZ = CONFIG.timeZone;
const now = new Date();
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now).replaceAll("-", "");
const OUT_NAME = `prayer_list_${ymd}.pdf`;

function fail(msg) {
  console.error(`prayer-list render: ${msg}`);
  process.exit(1);
}

function fmtShort(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "2-digit", month: "numeric", day: "numeric" }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t)?.value;
  return `${get("month")}/${get("day")}/${get("year")}`;
}

async function graphToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env;
  for (const [k, v] of Object.entries({ GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET })) {
    if (!v) fail(`missing env ${k} — live mode needs the renderer app registration's credentials.`);
  }
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) fail(`token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function fetchLiveData(token) {
  // Fetch every row and filter client-side, same as the app does — a Graph
  // $filter on a non-indexed SharePoint column fails unpredictably, and this
  // list is small enough that correctness beats cleverness.
  const rows = [];
  let url = `https://graph.microsoft.com/v1.0/sites/${CONFIG.siteId}/lists/${CONFIG.requestsListId}/items?expand=fields&$top=200`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) fail(`list fetch failed (${res.status}): ${await res.text()}`);
    const page = await res.json();
    rows.push(...page.value);
    url = page["@odata.nextLink"];
  }
  const live = rows
    .map((r) => r.fields ?? {})
    .filter((f) => f.Status === "Active" || f.Status === "Ongoing")
    // The flow ordered by LastUpdated desc, Title asc — freshest news first.
    .sort((a, b) => String(b.LastUpdated ?? "").localeCompare(String(a.LastUpdated ?? "")) || String(a.Title ?? "").localeCompare(String(b.Title ?? "")));

  const sections = SECTIONS.map((s) => ({
    title: s.title,
    entries: live
      .filter((f) => s.categories.includes(f.Category))
      .map((f) => {
        if (s.style === "homebound") {
          return {
            name: f.Title ?? "(unnamed)",
            request: f.Request?.trim() || null,
            address: f.Request?.trim() ? null : f.Address?.trim() || null,
          };
        }
        return {
          name: f.Title ?? "(unnamed)",
          relationship: f.Relationship?.trim() || null,
          request: f.Request?.trim() || null,
          updated: fmtShort(f.LastUpdated),
        };
      }),
  }));

  return {
    church: CONFIG.church,
    date: new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now),
    // The banner date is M/d/yyyy ("8/12/2026") — the flow's MEETING_DATE format.
    dateDisplay: new Intl.DateTimeFormat("en-US", { timeZone: TZ }).format(now),
    sections,
  };
}

async function upload(token, pdfPath) {
  // The archive is (evidence: the flow's CreateFile folderPath and the app's
  // fetchLatestBulletin) a document LIBRARY named "Prayer List Archive" at
  // site root — not a folder inside Shared Documents. Resolve the drive by
  // name first; fall back to a same-named folder in the default library,
  // mirroring the app's dual strategy so both layouts keep working.
  const auth = { Authorization: `Bearer ${token}` };
  const folder = encodeURIComponent(CONFIG.archiveFolder);
  let target = `sites/${CONFIG.siteId}/drive/root:/${folder}/${OUT_NAME}:/content`;
  const drives = await fetch(`https://graph.microsoft.com/v1.0/sites/${CONFIG.siteId}/drives`, { headers: auth });
  if (drives.ok) {
    const lib = (await drives.json()).value.find(
      (d) => d.name.toLowerCase() === CONFIG.archiveFolder.toLowerCase(),
    );
    if (lib) target = `drives/${lib.id}/root:/${OUT_NAME}:/content`;
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/${target}`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/pdf" },
    body: readFileSync(pdfPath),
  });
  if (!res.ok) fail(`archive upload failed (${res.status}): ${await res.text()}`);
  console.log(`uploaded ${CONFIG.archiveFolder}/${OUT_NAME}`);
}

function compile(pdfPath) {
  const typst = process.env.TYPST_BIN ?? "typst";
  // --font-path: the sheet is Calibri; we vendor Carlito (metric twin) so the
  // render is identical on any machine, CI included.
  const run = (extra) => spawnSync(typst, ["compile", "--root", PRINT_DIR, "--font-path", join(PRINT_DIR, "fonts"), join(PRINT_DIR, "prayer-list.typ"), ...extra], { stdio: ["ignore", "inherit", "inherit"] });
  let r = run([pdfPath]);
  if (r.error?.code === "ENOENT") fail("`typst` not found — install it or set TYPST_BIN (CI downloads a pinned release).");
  if (r.status !== 0) fail("typst compile failed (see output above).");
  if (PNG) {
    r = run(["--format", "png", "--ppi", "120", join(BUILD, "preview-{p}.png")]);
    if (r.status !== 0) fail("png preview render failed.");
  }
}

mkdirSync(BUILD, { recursive: true });
let token = null;
let data;
if (LIVE) {
  token = await graphToken();
  data = await fetchLiveData(token);
} else {
  data = JSON.parse(readFileSync(join(PRINT_DIR, "fixtures", "sample-data.json"), "utf8"));
}
writeFileSync(join(BUILD, "data.json"), JSON.stringify(data, null, 2));

const pdfPath = join(BUILD, OUT_NAME);
compile(pdfPath);
console.log(`rendered ${pdfPath}`);
if (!existsSync(pdfPath)) fail("compile reported success but the PDF is missing.");
if (UPLOAD) await upload(token, pdfPath);
