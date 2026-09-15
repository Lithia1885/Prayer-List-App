/* Service worker registration and the update handshake.
 *
 * Lives here rather than in a component on purpose: registration has to run at
 * the entry point, before the UI mounts and outside the auth gate. A browser
 * parked on the sign-in screen is the one most likely to be sitting on a stale
 * build, and if the effect that registers lived in a component that only
 * renders after sign-in, that browser would never register anything.
 */

const SW_URL = "/sw.js";
const POLL_MS = 30 * 60 * 1000;

let registration: ServiceWorkerRegistration | null = null;
let updateReady = false;

// Module state is per-tab, which is exactly what this needs: the worker claims
// every client, so one tab pressing "Reload now" fires controllerchange in all
// of them. Only the tab that asked reloads itself; the rest get the offer and
// keep running old code until someone there says otherwise. Consent is per-page.
let selfInitiated = false;

// Mutable on purpose. `navigator.serviceWorker.controller` is still null while
// registration runs and only becomes set moments later, so reading it once at
// startup would mean the session that installed the worker could never
// recognise a later swap.
let hasBeenControlled = false;

type UpdateListener = (ready: boolean) => void;
const listeners = new Set<UpdateListener>();

const publish = (ready: boolean) => {
  updateReady = ready;
  for (const listener of listeners) listener(ready);
};

/** Subscribe to "a new build is waiting". Fires immediately with current state. */
export const subscribeToUpdates = (listener: UpdateListener): (() => void) => {
  listeners.add(listener);
  listener(updateReady);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Land on the current build. Applies a waiting worker if there is one —
 * without that, its cached copy of the old entry bundle survives the reload
 * and the next attempt fails identically — and does a plain reload if there
 * isn't, so the button is never a no-op.
 */
export const reloadToCurrentBuild = (): void => {
  const waiting = registration?.waiting;
  if (waiting) {
    selfInitiated = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  window.location.reload();
};

const trackInstalling = (worker: ServiceWorker) => {
  worker.addEventListener("statechange", () => {
    // A worker reaching "installed" with no controller is a first-ever install,
    // not an update — nothing changed underneath anyone, so there is nothing
    // to offer.
    if (worker.state === "installed" && navigator.serviceWorker.controller) publish(true);
  });
};

export const registerServiceWorker = (): void => {
  if (!("serviceWorker" in navigator)) return;

  if (!import.meta.env.PROD) {
    // Never register in dev, and actively clear out whatever a previous
    // production visit left on this origin: a worker serving a cached copy of
    // the dev server's module graph is a debugging nightmare.
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()))
      .catch(() => {});
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => keys.forEach((key) => caches.delete(key)))
        .catch(() => {});
    }
    return;
  }

  hasBeenControlled = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hasBeenControlled) {
      // First claim on a first-ever visit. Reloading here would just make the
      // app flash for no reason.
      hasBeenControlled = true;
      return;
    }
    if (selfInitiated) {
      window.location.reload();
      return;
    }
    publish(true);
  });

  navigator.serviceWorker
    .register(SW_URL, { scope: "/" })
    .then((reg) => {
      registration = reg;

      if (reg.waiting && navigator.serviceWorker.controller) publish(true);

      // The browser runs its own check for newer worker bytes at navigation
      // time, and install is slow because it precaches the shell. So by the
      // time this runs, 'updatefound' has usually already fired with nobody
      // listening and `reg.waiting` is still null. Without this explicit
      // check the bar never appears for the whole session, and polling can't
      // rescue it: `update()` byte-compares against the worker that is by then
      // waiting, finds them identical, and fires nothing.
      if (reg.installing) trackInstalling(reg.installing);
      reg.addEventListener("updatefound", () => {
        if (reg.installing) trackInstalling(reg.installing);
      });

      const poll = () => {
        reg.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") poll();
      });
      window.setInterval(poll, POLL_MS);
    })
    .catch((err) => {
      // Never fatal. Without a worker the app still runs; it just doesn't
      // self-update.
      console.warn("[sw] registration failed, continuing without one:", err);
    });
};

/* ── The second door ──────────────────────────────────────────────────────
 *
 * A tab held open across a deploy breaks the moment it reaches for a lazily
 * imported chunk: the filename no longer exists. Every browser words this
 * differently and none of them mention the actual problem — Safari's
 * "'text/html' is not a valid JavaScript MIME type" reads like a bug in the
 * app rather than a page that needs reloading.
 *
 * Matching broadly is cheap insurance: even a genuinely corrupt download wants
 * reloading, so a false positive costs a page refresh.
 */
const STALE_BUILD_PATTERNS = [
  /not a valid JavaScript MIME type/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

/** Does this failure mean "this tab predates the last deploy"? */
export const isStaleBuildError = (error: unknown): boolean => {
  let name = "";
  let message = "";
  if (error && typeof error === "object") {
    name = typeof (error as Error).name === "string" ? (error as Error).name : "";
    message = typeof (error as Error).message === "string" ? (error as Error).message : "";
  }
  // Tolerate a non-Error being thrown — a bare string, or an object with a
  // useful toString and no message.
  if (!message) {
    try {
      message = String(error);
    } catch {
      return false;
    }
  }
  const subject = `${name}: ${message}`;
  return STALE_BUILD_PATTERNS.some((pattern) => pattern.test(subject));
};
