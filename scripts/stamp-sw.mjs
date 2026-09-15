/* Postbuild: stamp dist/sw.js with a build id and a precache list.
 *
 * Run automatically by `npm run build` (see the postbuild script). Fails loudly
 * rather than silently no-opping, because every failure mode here ships a
 * worker that looks fine and never updates anyone.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Every file under `dir`, as "/"-joined paths relative to it, sorted. */
export const walk = (dir, prefix = "") => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push(rel);
  }
  return out.sort();
};

/**
 * SHA-256 over every built file's path and contents, truncated to 16 hex.
 * The worker itself is excluded: it is what we are about to write into.
 *
 * Path as well as contents, so that renaming a file changes the id even when
 * the bytes are identical. Sorted, so the id is a property of the output and
 * not of the order the filesystem happened to hand it over.
 */
export const computeBuildId = (dist, { exclude = ["sw.js"] } = {}) => {
  const hash = createHash("sha256");
  for (const rel of walk(dist)) {
    if (exclude.includes(rel)) continue;
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(join(dist, rel)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
};

const tagsNamed = (html, name) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => m[0]);

const attrOf = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return m ? m[1] : undefined;
};

/**
 * What the app needs to paint, read out of the real built index.html — never
 * hardcoded, never a glob over /assets. Large optional payloads (the fonts
 * index.html doesn't preload, the maskable icon) are left to fill on demand.
 */
export const collectPrecache = (html) => {
  const links = tagsNamed(html, "link");
  const hrefsFor = (rel) =>
    links
      .filter((tag) => (attrOf(tag, "rel") || "").toLowerCase() === rel)
      .map((tag) => attrOf(tag, "href"))
      .filter(Boolean);

  const entryScripts = tagsNamed(html, "script")
    .map((tag) => attrOf(tag, "src"))
    .filter(Boolean);

  const icons = hrefsFor("icon");

  const urls = [
    "/index.html",
    ...entryScripts,
    ...hrefsFor("stylesheet"),
    ...hrefsFor("manifest"),
    ...icons.slice(0, 1),
    ...hrefsFor("preload"),
  ];

  return [...new Set(urls)]
    .filter((url) => url.startsWith("/"))
    .filter((url) => !url.endsWith(".map"));
};

export const stamp = (source, buildId, precache) => {
  if (!source.includes("__BUILD_ID__")) {
    throw new Error(
      "stamp-sw: no __BUILD_ID__ placeholder in the worker — already stamped, or public/sw.js changed."
    );
  }
  if (!source.includes("__PRECACHE_URLS__")) {
    throw new Error(
      "stamp-sw: no __PRECACHE_URLS__ placeholder in the worker — already stamped, or public/sw.js changed."
    );
  }
  return source
    .replace("__BUILD_ID__", buildId)
    .replace("__PRECACHE_URLS__", JSON.stringify(precache));
};

export const assertPresent = (dist, urls) => {
  const missing = urls.filter((url) => !existsSync(join(dist, url.replace(/^\//, ""))));
  if (missing.length) {
    throw new Error(
      `stamp-sw: index.html references ${missing.length} file(s) that are not in the build: ${missing.join(", ")}`
    );
  }
};

export const stampBuild = (dist) => {
  const htmlPath = join(dist, "index.html");
  const swPath = join(dist, "sw.js");
  if (!existsSync(htmlPath)) throw new Error(`stamp-sw: no ${htmlPath} — did the build run?`);
  if (!existsSync(swPath)) throw new Error(`stamp-sw: no ${swPath} — is public/sw.js still there?`);

  const precache = collectPrecache(readFileSync(htmlPath, "utf8"));
  assertPresent(dist, precache);
  const buildId = computeBuildId(dist);
  writeFileSync(swPath, stamp(readFileSync(swPath, "utf8"), buildId, precache));
  return { buildId, precache };
};

// CLI. `import.meta.url` check keeps the exports importable from tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] || "dist";
  const { buildId, precache } = stampBuild(dist);
  console.log(`sw stamped — build ${buildId}, precaching ${precache.length}:`);
  for (const url of precache) console.log(`  ${url}`);
}
