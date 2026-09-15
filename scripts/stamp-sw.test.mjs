import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectPrecache, computeBuildId, stamp, stampBuild } from "./stamp-sw.mjs";

const HTML = `<!doctype html><html><head>
<meta name="theme-color" content="#faf9f6" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
<link rel="apple-touch-icon" href="/icon-512.png" />
<link rel="preload" href="/fonts/np-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/libre-caslon-400.woff2" as="font" type="font/woff2" crossorigin />
<script type="module" crossorigin src="/assets/index-AAAA1111.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-BBBB2222.css">
</head><body><div id="root"></div></body></html>`;

const SW = 'const BUILD_ID = "__BUILD_ID__";\nconst PRECACHE_URLS = __PRECACHE_URLS__;\n';

let dist;

const write = (rel, contents) => {
  const abs = join(dist, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
};

const buildFixture = () => {
  write("index.html", HTML);
  write("sw.js", SW);
  write("manifest.webmanifest", "{}");
  write("icon-512.png", "png");
  write("icon-maskable-512.png", "png-maskable");
  write("fonts/np-400.woff2", "font-a");
  write("fonts/libre-caslon-400.woff2", "font-b");
  write("fonts/np-700.woff2", "font-unused");
  write("assets/index-AAAA1111.js", "console.log(1)");
  write("assets/index-BBBB2222.css", "body{}");
  write("assets/index-AAAA1111.js.map", "{}");
};

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), "stamp-sw-"));
  buildFixture();
});
afterEach(() => rmSync(dist, { recursive: true, force: true }));

describe("collectPrecache", () => {
  it("takes the entry bundle and stylesheet from index.html, not a glob", () => {
    const urls = collectPrecache(HTML);
    expect(urls).toContain("/assets/index-AAAA1111.js");
    expect(urls).toContain("/assets/index-BBBB2222.css");
  });

  it("includes the shell, manifest, one icon, and the preloaded fonts", () => {
    const urls = collectPrecache(HTML);
    expect(urls).toContain("/index.html");
    expect(urls).toContain("/manifest.webmanifest");
    expect(urls.filter((u) => u.startsWith("/icon"))).toEqual(["/icon-512.png"]);
    expect(urls).toContain("/fonts/np-400.woff2");
    expect(urls).toContain("/fonts/libre-caslon-400.woff2");
  });

  it("excludes source maps and large optional assets", () => {
    const urls = collectPrecache(HTML);
    expect(urls.some((u) => u.endsWith(".map"))).toBe(false);
    // Fonts index.html does not preload, and the maskable icon, fill on demand.
    expect(urls).not.toContain("/fonts/np-700.woff2");
    expect(urls).not.toContain("/icon-maskable-512.png");
  });
});

describe("computeBuildId", () => {
  it("stays the same when the build does not change", () => {
    const a = computeBuildId(dist);
    const b = computeBuildId(dist);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when any built file changes", () => {
    const before = computeBuildId(dist);
    write("assets/index-AAAA1111.js", "console.log(2)");
    expect(computeBuildId(dist)).not.toBe(before);
  });

  it("changes when a file is renamed even if the bytes are identical", () => {
    const before = computeBuildId(dist);
    rmSync(join(dist, "assets/index-AAAA1111.js"));
    write("assets/index-CCCC3333.js", "console.log(1)");
    expect(computeBuildId(dist)).not.toBe(before);
  });

  it("ignores the worker itself, which is what it is about to be written into", () => {
    const before = computeBuildId(dist);
    write("sw.js", SW + "// anything at all\n");
    expect(computeBuildId(dist)).toBe(before);
  });
});

describe("stamp", () => {
  it("replaces both placeholders", () => {
    const out = stamp(SW, "abc123", ["/index.html"]);
    expect(out).toContain('const BUILD_ID = "abc123"');
    expect(out).toContain('const PRECACHE_URLS = ["/index.html"]');
    expect(out).not.toContain("__BUILD_ID__");
    expect(out).not.toContain("__PRECACHE_URLS__");
  });

  it("refuses to stamp twice", () => {
    const once = stamp(SW, "abc123", ["/index.html"]);
    expect(() => stamp(once, "def456", ["/index.html"])).toThrow(/__BUILD_ID__/);
  });

  it("refuses a worker whose placeholders were renamed away", () => {
    expect(() => stamp('const BUILD_ID = "x";', "abc", [])).toThrow(/stamp-sw/);
  });
});

describe("stampBuild", () => {
  it("writes a stamped worker into the build", () => {
    const { buildId, precache } = stampBuild(dist);
    const out = readFileSync(join(dist, "sw.js"), "utf8");
    expect(out).toContain(`const BUILD_ID = "${buildId}"`);
    expect(out).toContain("/assets/index-AAAA1111.js");
    expect(precache).toContain("/assets/index-BBBB2222.css");
  });

  it("refuses a build whose preloaded files are missing", () => {
    rmSync(join(dist, "fonts/np-400.woff2"));
    expect(() => stampBuild(dist)).toThrow(/not in the build.*np-400\.woff2/s);
  });

  it("refuses a build whose entry bundle is missing", () => {
    rmSync(join(dist, "assets/index-AAAA1111.js"));
    expect(() => stampBuild(dist)).toThrow(/not in the build/);
  });
});
