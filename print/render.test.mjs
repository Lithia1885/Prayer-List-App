// Smoke/golden test for the Wednesday print renderer: compiles the committed
// fixture and asserts the properties the office actually depends on. Runs
// wherever a typst binary is available (CI downloads a pinned release);
// skips cleanly elsewhere so `npm test` stays green on machines without it.
//
// Run directly:  node --test print/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PRINT_DIR = dirname(fileURLToPath(import.meta.url));
const TYPST = process.env.TYPST_BIN ?? "typst";
const haveTypst = spawnSync(TYPST, ["--version"]).status === 0;

test("fixture renders to a multi-page, page-numbered PDF", { skip: !haveTypst && "typst binary not available" }, () => {
  const r = spawnSync(process.execPath, [join(PRINT_DIR, "render.mjs"), "--png"], {
    env: { ...process.env, TYPST_BIN: TYPST },
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(r.status, 0, `render failed:\n${r.stderr}`);

  const build = join(PRINT_DIR, ".build");
  const pdf = readdirSync(build).find((f) => /^prayer_list_\d{8}\.pdf$/.test(f));
  assert.ok(pdf, "archive-named PDF was produced");
  assert.ok(statSync(join(build, pdf)).size > 10_000, "PDF is non-trivial");

  // The fixture is sized to paginate — pagination is the whole point of this
  // renderer (the "Page N of M" footer), so a one-page render means the
  // fixture shrank or the layout broke.
  const pages = readdirSync(build).filter((f) => /^preview-\d+\.png$/.test(f));
  assert.ok(pages.length >= 2, `expected a multi-page render, got ${pages.length} page(s)`);

  const data = JSON.parse(readFileSync(join(build, "data.json"), "utf8"));
  assert.equal(data.sections.length, 4, "all four print sections present");
  assert.ok(data.sections.every((s) => s.title && Array.isArray(s.entries)));
});

test("fixture exercises the shapes the live mapper produces", () => {
  const data = JSON.parse(readFileSync(join(PRINT_DIR, "fixtures", "sample-data.json"), "utf8"));
  const all = data.sections.flatMap((s) => s.entries);
  assert.ok(all.some((e) => e.relationship), "entry with relationship");
  assert.ok(all.some((e) => !e.relationship), "entry without relationship");
  assert.ok(all.some((e) => e.address && !e.request), "homebound address-only entry");
  assert.ok(all.some((e) => e.updated), "entry with an Updated date");
  // Titles and order are the production template's, verbatim — a drifted
  // title here means the clone drifted from the sheet the office knows.
  assert.deepEqual(
    data.sections.map((s) => s.title),
    ["Members & Family", "Other Text Requests for Prayer Received", "For Our Nation & World", "At Home Members"],
    "section titles/order match prayer_list_template.html",
  );
  const atHome = data.sections.find((s) => s.title === "At Home Members");
  assert.ok(atHome.entries.every((e) => !e.updated), "At Home entries carry no Updated suffix (matches the flow)");
});
