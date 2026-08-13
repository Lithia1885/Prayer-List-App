// The Wednesday print-out — a 1:1 clone of the production sheet.
//
// FORMAT FREEZE (OPERATIONS.md §2): the prayer team's sheet is a known
// quantity and its look is frozen. This file reproduces the SharePoint
// template (Shared Documents/Templates/prayer_list_template.html) and the
// real converter output (reference: prayer_list_20260812.pdf) measurement
// for measurement:
//   - Letter, margins 0.85in top/bottom, 1in left/right
//   - Calibri 11pt, line-height 1.30 — vendored as Carlito (fonts/, OFL),
//     the metric-compatible open twin, since Calibri is not redistributable
//   - page-1-only banner: "LSMC Prayer List" bold 16pt gray left, bold
//     italic 13pt date right, hairline rule
//   - section headers: bold 13pt #6b3d2e, letterspaced, hairline rule,
//     numbering restarts per section
//   - entries: "N." in a 24pt hanging gutter (#666), bold name,
//     (relationship), " – " request, "(Updated M/d/yy)" — all body-black,
//     8pt after each entry
//
// The ONE addition: the footer. The template already designs it —
//   @page @bottom-right { content: counter(page) " | P a g e"; }
// — but OneDrive's converter ignores @page margin boxes, so it has never
// printed. Rendered here exactly as authored: 9pt italic gray, hairline
// above, bottom-right. That is the page-number request, fulfilled with the
// template's own styling rather than a new design.
//
// Data arrives at /.build/data.json (compile with --root print/), written by
// render.mjs from the live SharePoint list or fixtures/sample-data.json.

#let data = json("/.build/data.json")

#let banner-gray = rgb("#8c8c8c")
#let rule-gray = rgb("#c8c8c8")
#let section-brown = rgb("#6b3d2e")
#let number-gray = rgb("#666666")
#let empty-gray = rgb("#888888")

#set page(
  paper: "us-letter",
  margin: (top: 0.85in, bottom: 0.85in, left: 1in, right: 1in),
  footer: [
    // Rule above, number below, with honest positive spacing — a negative
    // nudge here once collided the rule with the digits on real output.
    #line(length: 100%, stroke: 0.5pt + rule-gray)
    #v(3pt, weak: true)
    #align(right)[
      #text(size: 9pt, style: "italic", fill: banner-gray)[#context counter(page).display() | P a g e]
    ]
  ],
)
#set text(font: "Carlito", size: 11pt)
// Calibri @ line-height 1.30 puts baselines 14.3pt apart (the production
// sheet's measured pitch). These values are PROBE-DERIVED, not theoretical:
// Carlito's natural line extent in Typst measures 7.06pt at 11pt, so
// 14.30 − 7.06 = 7.24pt of leading reproduces the sheet's rhythm. Don't
// re-tune by eye — re-run the position probe if the font or size changes.
#set par(leading: 7.24pt, spacing: 7.24pt)

// ---------- Top banner (first page only — it's flowed content) ----------
#block(below: 14pt)[
  #text(size: 16pt, weight: "bold", fill: banner-gray)[LSMC Prayer List]
  #h(1fr)
  #text(size: 13pt, weight: "bold", style: "italic", fill: banner-gray)[#data.dateDisplay]
  #v(6pt)
  #line(length: 100%, stroke: 0.5pt + rule-gray)
]

// ---------- Entries ----------
// "N." hangs in a 24pt gutter (matches the CSS counter gutter); wrapped
// lines align under the text, not the number.
// below: cross-entry baseline pitch must be 22.30pt (sheet's 14.3 line box
// + its 8pt margin). Typst's cross-block gap excludes leading, so the gap is
// 22.30 − 7.06 (extent) = 15.24pt — probe-derived, same warning as above.
#let entry(n, e) = block(below: 15.24pt, grid(
  columns: (24pt, 1fr),
  text(fill: number-gray)[#n.],
  par[
    #text(weight: "bold")[#e.name]#if e.at("relationship", default: none) != none [
      (#e.relationship)]#if e.at("request", default: none) != none [
      #h(0.06em)–#h(0.06em) #e.request]#if e.at("address", default: none) != none [
      #h(0.06em)–#h(0.06em) #e.address]#if e.at("updated", default: none) != none [
      (Updated #e.updated)]
  ],
))

#for section in data.sections {
  // sticky: the header travels with the first entry across page breaks
  // (the CSS says page-break-after: avoid).
  block(sticky: true, above: 16pt, below: 8pt)[
    #text(size: 13pt, weight: "bold", fill: section-brown, tracking: 0.3pt)[#section.title]
    #v(4pt)
    #line(length: 100%, stroke: 0.75pt + rule-gray)
  ]
  if section.entries.len() == 0 {
    block(below: 8pt, text(style: "italic", fill: empty-gray)[No active entries this week.])
  } else {
    for (i, e) in section.entries.enumerate() { entry(i + 1, e) }
  }
}
