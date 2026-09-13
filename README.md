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

## Configuration

Tenant, client, site, and list IDs are in `src/lib/msal.ts` and
`src/lib/graph.ts`. Client IDs for public SPAs aren't secrets, so they
live in source. SharePoint internal column names: `Title`, `Request`,
`Category`, `Status`, `Relationship`, `DateSubmitted`, `Address`, `Notes`.
