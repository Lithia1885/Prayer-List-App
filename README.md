# Prayer List

A signed-in web app for the prayer team at Lithia Springs Methodist. Reads
and writes the SharePoint "Prayer Requests" list via Microsoft Graph; logs
every change to a paired "PrayerEvents" list for the per-request history.

Hosted as a PWA on Azure Static Web Apps. The Wednesday print-out is owned
by a Power Automate flow on the SharePoint side, not the app.

Looks and sounds like the church: fonts, colors, controls, and voice are in
`DESIGN.md`; the tokens themselves live in `src/index.css`.

## Run

```sh
npm install
npm run dev      # http://localhost:8080
npm run build
npm run test
```

## Updates

An installed copy must never sit on stale code. `public/sw.js` is a hand-rolled
service worker (no workbox, no `autoUpdate`) stamped at build time by
`scripts/stamp-sw.mjs`, which runs as `postbuild`:

- **Build id** — SHA-256 of every built file's path and contents, 16 hex chars.
  A browser installs a new worker only if `sw.js` differs byte-for-byte, so the
  id has to change when the build does. Hashing the *output* also means a
  redeploy of identical output keeps the same id and doesn't churn an update
  through every device. Note `__BUILD_DATE__` is part of the bundle, so a
  rebuild of unchanged source on a **later day** is a genuine content change and
  will offer an update.
- **Precache** — read out of the built `index.html`: the shell, the entry
  bundle and stylesheet, the manifest, one icon, and the two preloaded fonts.
  Seven files. The other fonts and the maskable icon fill on demand. The
  stamper throws if a placeholder is missing or if `index.html` references a
  file that isn't in the build.
- **Caching** — navigations are network-first and only an `ok` response is
  cached, so a mid-deploy 5xx can never become the shell. Content-hashed
  `/assets/*` are cache-first with one retry. Graph, Entra, `/api/*` and
  `/auth-popup.html` are never touched.
- **The handshake** — the worker never calls `skipWaiting()` on install.
  `src/lib/sw-update.ts` registers at the entry point (before the UI mounts and
  outside the auth gate) and publishes to `UpdateBar`, a persistent bar with
  *Reload now* and *Later*. Dismissing only hides it; the update still applies
  next time the app is fully closed and reopened. With two tabs open, the tab
  that clicks is the only one that reloads — the others get the offer.
- **Stale-build errors** — `isStaleBuildError()` recognises the wording each
  browser uses when a tab reaches for code a deploy removed, and the error
  boundary turns it into a worded screen with a working reload button. There
  are no lazy routes today, so this is a latent path; it becomes live the
  moment anything is dynamically imported.

Run `npm run build` and serve `dist/` to exercise any of this — the worker is
never registered in dev, and a dev visit unregisters anything a previous
production visit left on the origin.

## Configuration

Tenant, client, site, and list IDs are in `src/lib/msal.ts` and
`src/lib/graph.ts`. Client IDs for public SPAs aren't secrets, so they
live in source. SharePoint internal column names: `Title`, `Request`,
`Category`, `Status`, `Relationship`, `DateSubmitted`, `Address`, `Notes`.
