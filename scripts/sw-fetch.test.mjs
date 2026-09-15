/* Drives the real public/sw.js in a sandbox: no browser, no workbox, just the
 * file that ships, with the service-worker globals stubbed out. The point is
 * the routing decisions — which requests the worker takes over and which it
 * leaves alone — because getting those wrong is what serves a stale shell.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SW_SOURCE = readFileSync(join(HERE, "..", "public", "sw.js"), "utf8");

const PRECACHE = ["/index.html", "/assets/index-AAAA1111.js", "/fonts/np-400.woff2"];
const ORIGIN = "https://prayer.example.org";

const makeCache = () => {
  const store = new Map();
  return {
    store,
    match: vi.fn(async (key) => store.get(typeof key === "string" ? key : key.url)),
    put: vi.fn(async (key, value) => {
      store.set(typeof key === "string" ? key : key.url, value);
    }),
    addAll: vi.fn(async () => {}),
  };
};

const load = ({ fetchImpl } = {}) => {
  const listeners = {};
  const cache = makeCache();
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };
  const self = {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
  };
  const fetchFn = vi.fn(fetchImpl ?? (async () => response(200)));
  const source = SW_SOURCE.replace("__BUILD_ID__", "testbuild").replace(
    "__PRECACHE_URLS__",
    JSON.stringify(PRECACHE)
  );
  new Function("self", "caches", "fetch", "setTimeout", source)(
    self,
    caches,
    fetchFn,
    (fn) => fn() // no real delay in the retry path
  );
  return { listeners, cache, caches, self, fetchFn };
};

const response = (status, body = "ok") => ({
  ok: status >= 200 && status < 300,
  status,
  body,
  clone() {
    return this;
  },
});

/** Dispatch a fetch event; returns the response the worker produced, or null
 *  if it declined to handle the request at all. */
const dispatch = async (sw, { url, method = "GET", mode = "no-cors" }) => {
  let handled = null;
  const request = { url: url.startsWith("http") ? url : ORIGIN + url, method, mode };
  sw.listeners.fetch({ request, respondWith: (p) => (handled = p) });
  return handled === null ? null : await handled;
};

let sw;
beforeEach(() => {
  sw = load();
});

describe("navigations", () => {
  it("go to the network first and cache an ok response as the shell", async () => {
    const res = await dispatch(sw, { url: "/", mode: "navigate" });
    expect(sw.fetchFn).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(sw.cache.put).toHaveBeenCalledWith("/index.html", expect.anything());
  });

  it("do NOT cache a non-ok response — a mid-deploy 5xx must not become the shell", async () => {
    sw = load({ fetchImpl: async () => response(503, "deploying") });
    const res = await dispatch(sw, { url: "/", mode: "navigate" });
    expect(res.status).toBe(503);
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("fall back to the cached shell only when the network throws", async () => {
    sw = load({ fetchImpl: async () => { throw new TypeError("offline"); } });
    sw.cache.store.set("/index.html", response(200, "cached shell"));
    const res = await dispatch(sw, { url: "/", mode: "navigate" });
    expect(res.body).toBe("cached shell");
  });

  it("leave the auth popup document alone", async () => {
    const res = await dispatch(sw, { url: "/auth-popup.html", mode: "navigate" });
    expect(res).toBeNull();
    expect(sw.fetchFn).not.toHaveBeenCalled();
  });
});

describe("hashed assets", () => {
  it("are served cache-first", async () => {
    sw.cache.store.set(ORIGIN + "/assets/index-ZZZZ9999.js", response(200, "cached js"));
    const res = await dispatch(sw, { url: "/assets/index-ZZZZ9999.js" });
    expect(res.body).toBe("cached js");
    expect(sw.fetchFn).not.toHaveBeenCalled();
  });

  it("are fetched and stored on a miss", async () => {
    const res = await dispatch(sw, { url: "/assets/index-ZZZZ9999.css" });
    expect(res.status).toBe(200);
    expect(sw.cache.put).toHaveBeenCalled();
  });

  it("retry once before giving up — a dropped stylesheet paints the app unstyled", async () => {
    let calls = 0;
    sw = load({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("network blip");
        return response(200, "recovered css");
      },
    });
    const res = await dispatch(sw, { url: "/assets/index-ZZZZ9999.css" });
    expect(calls).toBe(2);
    expect(res.body).toBe("recovered css");
  });

  it("include the precached paths even though they carry no hash", async () => {
    sw.cache.store.set(ORIGIN + "/fonts/np-400.woff2", response(200, "cached font"));
    const res = await dispatch(sw, { url: "/fonts/np-400.woff2" });
    expect(res.body).toBe("cached font");
  });
});

describe("what the worker never touches", () => {
  it("cross-origin requests — Graph and Entra", async () => {
    expect(await dispatch(sw, { url: "https://graph.microsoft.com/v1.0/sites/x" })).toBeNull();
    expect(await dispatch(sw, { url: "https://login.microsoftonline.com/common" })).toBeNull();
    expect(sw.fetchFn).not.toHaveBeenCalled();
  });

  it("same-origin API routes", async () => {
    expect(await dispatch(sw, { url: "/api/anything" })).toBeNull();
  });

  it("non-GET requests", async () => {
    expect(await dispatch(sw, { url: "/", method: "POST", mode: "navigate" })).toBeNull();
  });

  it("unhashed, non-precached assets — they fill on demand", async () => {
    expect(await dispatch(sw, { url: "/fonts/np-700.woff2" })).toBeNull();
    expect(await dispatch(sw, { url: "/icon-maskable-512.png" })).toBeNull();
  });
});

describe("lifecycle", () => {
  it("does not skipWaiting on install", async () => {
    const waits = [];
    sw.listeners.install({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    expect(sw.cache.addAll).toHaveBeenCalledWith(PRECACHE);
  });

  it("skips waiting only when a page asks", () => {
    sw.listeners.message({ data: { type: "SKIP_WAITING" } });
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated messages", () => {
    sw.listeners.message({ data: { type: "SOMETHING_ELSE" } });
    sw.listeners.message({});
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("sweeps old build caches twice, around clients.claim()", async () => {
    const order = [];
    sw.caches.keys = vi.fn(async () => {
      order.push("sweep");
      return ["prayer-list-old", "prayer-list-testbuild", "unrelated-cache"];
    });
    sw.caches.delete = vi.fn(async (name) => {
      order.push(`delete:${name}`);
      return true;
    });
    sw.self.clients.claim = vi.fn(async () => {
      order.push("claim");
    });
    const waits = [];
    sw.listeners.activate({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);

    expect(order.filter((o) => o === "sweep")).toHaveLength(2);
    expect(order.indexOf("claim")).toBeGreaterThan(order.indexOf("sweep"));
    expect(order.lastIndexOf("sweep")).toBeGreaterThan(order.indexOf("claim"));
    // Only older builds of THIS app, never someone else's cache.
    expect(sw.caches.delete).toHaveBeenCalledWith("prayer-list-old");
    expect(sw.caches.delete).not.toHaveBeenCalledWith("prayer-list-testbuild");
    expect(sw.caches.delete).not.toHaveBeenCalledWith("unrelated-cache");
  });
});
