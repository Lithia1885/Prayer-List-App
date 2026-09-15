/* Prayer List service worker.
 *
 * Hand-rolled rather than generated, because the generated one took over a
 * running page and reloaded it without asking. This one never activates
 * itself: it waits until the page asks (SKIP_WAITING) or until the app is
 * fully closed and reopened.
 *
 * Both placeholders below are filled in by scripts/stamp-sw.mjs as a postbuild
 * step. The build id is a hash of every built file, which is what makes updates
 * work at all: a browser decides whether to install a new worker by byte-
 * comparing this file against the copy it has, so if the file never changes,
 * nothing ever updates. Hashing the output (rather than stamping a timestamp)
 * also means a redeploy of identical output produces the same id and doesn't
 * churn an update through every installed copy.
 *
 * Editing this file? The stamper throws if either placeholder goes missing, so
 * a rename fails the build rather than shipping a worker that never updates.
 */

const BUILD_ID = "__BUILD_ID__";
const PRECACHE_URLS = __PRECACHE_URLS__;

const CACHE_PREFIX = "prayer-list-";
const CACHE = CACHE_PREFIX + BUILD_ID;
const SHELL = "/index.html";

// MSAL's popup lands on its own document and parses the auth response out of
// its own URL. It must reach the network every time — serving it the app shell,
// or any cached copy, breaks sign-in.
const BYPASS = [/^\/auth-popup\.html$/];

// Vite's content-hashed output: /assets/<name>-<hash>.<ext>. These bytes never
// change, which is what makes cache-first safe here and nowhere else.
const HASHED = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i;

const RETRY_MS = 400;

self.addEventListener("install", (event) => {
  // No skipWaiting. A waiting worker takes over when the last tab closes, or
  // when a page explicitly asks below.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

const sweep = async () => {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map((name) => caches.delete(name))
  );
};

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await sweep();
      await self.clients.claim();
      // Twice on purpose. The outgoing worker can still be finishing a cache
      // write when the first sweep runs, and `caches.open` on a just-deleted
      // name quietly recreates it — stranding a whole build's assets on the
      // device until the update after next.
      await sweep();
    })()
  );
});

// HTML is never served from cache while the network works: a stale shell is the
// entire failure mode this worker exists to prevent.
const networkFirstShell = async (request) => {
  try {
    const response = await fetch(request);
    // Only an ok response earns the right to be stored. A navigation that lands
    // mid-deploy gets a 5xx error page, and caching that would replace the
    // shell with an error screen for the rest of this build's cache lifetime.
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(SHELL, response.clone());
    }
    return response;
  } catch (err) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    throw err;
  }
};

const fetchAndStore = async (request, cache) => {
  const response = await fetch(request);
  if (response && response.ok) await cache.put(request, response.clone());
  return response;
};

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    return await fetchAndStore(request, cache);
  } catch (err) {
    // One retry. A dropped image re-fetches itself and a dropped chunk lands in
    // an error boundary, but a dropped STYLESHEET paints the whole app unstyled
    // and an installed copy then resumes that wounded page indefinitely. These
    // URLs are immutable, so a retry can only ever fetch the same bytes later.
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    return fetchAndStore(request, cache);
  }
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  // Cross-origin is never touched — Graph and Entra in particular. Stale
  // prayer data would be worse than no offline support.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (BYPASS.some((re) => re.test(url.pathname))) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (PRECACHE_URLS.indexOf(url.pathname) !== -1 || HASHED.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else — the fonts index.html doesn't preload, the maskable icon,
  // anything added later — fills on demand from the network.
});
