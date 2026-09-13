# Design — how the app looks and sounds

The app follows the church's own identity at lithiaspringsmethodist.org,
adapted to a working tool: the people using it are entering and reading
prayer requests, not visiting a website. Tokens live in `src/index.css`;
the Tailwind names for them are in `tailwind.config.ts`. This file is the
short version.

## Type

| Face | Files | Weights | Where |
|---|---|---|---|
| **Libre Caslon Text** | `public/fonts/libre-caslon-{400,700}.woff2` | 400 (700 available, unused so far) | Page titles, the app's name, the names on the list — `.font-display` |
| **National Park** | `public/fonts/np-{400,600,700}.woff2` | 400 body · 600 hierarchy and primary actions · 700 unused | Everything else: body, controls, labels, inputs, status |

Fallbacks: `"Libre Caslon Text", Georgia, serif` and `"National Park",
system-ui, sans-serif`. The `@font-face` rules declare the weights the files
actually contain, so `font-medium` (500) resolves to 400 — use `font-semibold`
when something needs to be heavier. The files are the church website's own
builds; `public/fonts/OFL.txt` carries their license. Base size stays 18px
with the in-app text-size control scaling everything from `html`.

Not touched by any of this: the printed Wednesday sheet (`print/`, its own
frozen typography) and anything users type.

## Color roles

| Role | Hex | Token | Use |
|---|---|---|---|
| Page | `#ffffff` | `bg-background` | Every page |
| White surface | `#ffffff` | `bg-surface`, `.panel` | Inputs, panels, dialogs |
| Quiet panel | `#f4f2ee` | `bg-surface-sunken` | Secondary panel inside a dialog |
| Ledger band | `#f8f9f9` | `bg-row-band` | Alternating rows in the long lists |
| Row hover | `#e7ecec` | `bg-row-hover` | Hovered row |

The page is white because the church site's own `<body>` is white; the
`#faf9f6` in the brand palette is its `theme-color` (browser chrome), which
this app still uses for exactly that. Warmth comes from `#f4f2ee`, the site's
quiet tone. Surface and page are the same value today — the two tokens stay
separate so the page can be re-tinted later without touching panels, which
are read by their borders rather than their fill.
| Ink | `#1a1c1a` | `text-foreground` | Text |
| Secondary text | `#6b665e` | `text-muted-foreground` | Metadata, hints (5.4:1 on the page) |
| Separator | `#eeeae4` | `border-separator` | Lines between rows |
| Hairline | `#dcd7cf` | `border-hairline` | Panel and dialog edges (the default border color) |
| Control edge | `#948e83` | `border-border` | Inputs and outlined buttons — 3:1 on white |
| Deep green — identity | `#0b3f3c` | `text-brand`, `border-brand` | The app's name, the rule at the top of the page. Nothing else. |
| Teal — selected | `#007672` | `accent`, `bg-accent-surface`, `border-accent-border` | The current nav item, the selected tab or size, "already on the list" hints |
| Blue — the action | `#006db6` / hover `#005a97` | `primary`, `primary-hover` | One solid button per task, links, keyboard focus |

Meaning colors are separate from the brand and stay distinct from each other:

| Meaning | Hex | Token |
|---|---|---|
| Active (live on the list) | teal `#007672` | `bg-active` |
| Ongoing (long-running) | plum `#7c1d6f` | `bg-ongoing` |
| Resolved (answered, closed) | sage `#43614b` | `bg-resolved` |
| Archived | gray on `#eeeae4` | `bg-muted text-muted-foreground` |
| Something needs attention (a request six months old) | `#7f5a08` text, `#f8efd9` surface | `text-warning`, `bg-warning-surface` |
| Destructive / error | `#a92316` | `destructive` |

Don't recolor a status to match the brand, and don't use deep green or blue
to mean anything other than identity and action. There is no dark mode.

## Controls

- `.btn-primary` (solid blue, semibold) — the one thing to do on a screen.
  `.btn-secondary` (white, outlined) for the rest. `.btn-quiet` for
  tertiary actions like Refresh or Cancel. `.btn-danger` only for deletes
  and merges, next to a plain "This cannot be undone."
- `.field` / `.field-textarea` for inputs, selects, textareas.
- `.panel` for a white box on the page; `.dialog-backdrop` + `.dialog` for
  modals (a sheet from the bottom on phones). Give dialogs `role="dialog"`,
  `aria-modal`, and a labelled title.
- `.eyebrow` for field and section labels, `.meta-caps` for compact
  metadata like the category.
- Radii: 8px on controls and panels, 12px on dialogs, 4px on badges.
- `.row-link` is a row in one of the long lists (Current, Archive, and the
  records under a person). The flat lists band alternating rows like green-bar
  ledger paper — `bg-row-band` from the row index, squared off, bleeding
  slightly past the text column. People doesn't band: its rows are nested
  under person groups of very different heights, and banding those reads as a
  bug.
- Both row tones are dilutions of the brand green into white (5% and 9%), so
  re-hueing the ledger means changing `--row-band` and `--row-hover` and
  nothing else. How dark hover can go is capped by blue link text, which
  lands at 4.56:1 on it — the tones were picked so the hover step reads on a
  banded row (1.13) and not only on a white one (1.19).
- Focus is one thing everywhere: a 2px blue outline, offset 2px (global
  `:focus-visible`). Rows go band → `row-hover` → a faint teal when pressed
  (chroma, not a third lightness step, since a phone never hovers); the name
  turns blue because the row is a link.
- 48px minimum touch targets, as before.

## Identity

The church's wordmark (`public/lsmc-logo-ink.svg`, straight from the site)
appears once, on the sign-in screen, where it has room. It deliberately does
**not** ride in the masthead: the wordmark is itself a lockup of letterforms,
and next to a Caslon title it reads as two competing headlines rather than
one. Working screens name the church in small caps under the title instead.
The app icon is the church's own favicon (`public/icon-512.png`, plus a
padded maskable copy). Don't invent a mark, and don't recolor other
organizations' logos to match any of this.

## Voice

Working screens name the action ("Post update", "Add to the list", "Yes,
delete"), say what happens next ("Replaces the current request and goes in
the next bulletin."), and make errors specific with a way out ("Could not
load the list." + the reason + "Try again"). Established words stay:
request, active, ongoing, resolved, archive, post an update, the list.
Sign-in and empty states can be warmer ("Nothing on the list right now."),
but no slogans from the website, no urgency, and no church facts, contact
details, or promises that aren't already true.
