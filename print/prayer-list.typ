// The Wednesday print-out, rendered by Typst instead of OneDrive's HTML→PDF
// conversion. This template exists for one headline reason — page numbers,
// which the office asked for and the old converter could not produce.
//
// ⚠ LAYOUT STATUS: PLACEHOLDER. The prayer team's printed sheet is a known
// quantity and its look is FROZEN — the maintainer's words: change the format
// and "those old ladies will revolt." Before this renderer replaces the flow's
// converter, this file must be re-skinned as a 1:1 clone of the production
// sheet (masthead wording, section heading text and casing, font, sizes,
// spacing, date format) from a recent archive PDF + the SharePoint
// prayer_list_template.html. Only the page-number footer is new. The entry
// SEMANTICS below (bold name, (relationship), " – " request, "(Updated
// M/d/yy)", homebound address fallback) are already faithful — they were
// derived from the flow's own row markup, not invented.
//
// Print contract (see OPERATIONS.md §1): US Letter, two-sided long edge,
// stapled top-left, GRAYSCALE. Design rules that follow from it:
//   - No color anywhere. Grays carry the hierarchy.
//   - Body type is large (11pt) — this is read aloud at prayer meeting,
//     often by readers who use the app's "largest text" setting.
//   - "Page N of M" in the footer: the "of M" is what lets someone confirm
//     a stapled set is complete before handing it out.
//
// Data arrives at /.build/data.json (compile with --root print/), written by
// render.mjs from either the live SharePoint list or fixtures/sample-data.json.

#let data = json("/.build/data.json")

#let ink = black
#let soft = luma(35%)   // secondary text — dates, provenance
#let faint = luma(55%)  // hairline rules

#set page(
  paper: "us-letter",
  // Extra headroom top-left is deliberate: the staple lands there.
  margin: (top: 0.9in, bottom: 0.9in, left: 1.0in, right: 0.9in),
  footer: context {
    set text(size: 9pt, fill: soft)
    line(length: 100%, stroke: 0.4pt + faint)
    v(-0.4em)
    grid(
      columns: (1fr, auto, 1fr),
      align: (left, center, right),
      [#data.church],
      [Page #counter(page).display() of #context counter(page).final().first()],
      [#data.dateDisplay],
    )
  },
)
#set text(size: 11pt, fill: ink)
#set par(leading: 0.62em, spacing: 1.05em)

// ---------- Masthead (first page only) ----------
#align(center)[
  #text(size: 9pt, tracking: 1.8pt, fill: soft)[#upper(data.church)]
  #v(0.1em)
  #text(size: 26pt, weight: "semibold")[The Prayer List]
  #v(0.2em)
  #text(size: 10.5pt, fill: soft)[#data.dateDisplay]
]
#v(0.4em)
#line(length: 100%, stroke: 0.6pt + ink)

// ---------- Sections ----------
#let entry(e) = {
  // Hanging indent so wrapped request lines tuck under the text, keeping the
  // bold names on a clean left edge for scanning down the list.
  par(hanging-indent: 14pt)[
    #text(weight: "bold")[#e.name]#if e.at("relationship", default: none) != none [
      #text(fill: soft)[ (#e.relationship)]]#if e.at("request", default: none) != none [
      #sym.space.med– #e.request]#if e.at("address", default: none) != none [
      #sym.space.med– #e.address]#if e.at("updated", default: none) != none [
      #text(size: 9pt, fill: soft)[ (Updated #e.updated)]]
  ]
}

#for section in data.sections {
  // Keep the section heading welded to its first entry — a heading orphaned
  // at the bottom of a page reads terribly on a two-sided stapled document.
  block(breakable: false, above: 1.5em, below: 0.9em)[
    #text(size: 10pt, tracking: 1.6pt, weight: "medium")[#upper(section.title)]
    #v(-0.5em)
    #line(length: 100%, stroke: 0.4pt + faint)
  ]
  if section.entries.len() == 0 {
    text(fill: soft, style: "italic")[No active entries this week.]
  } else {
    for e in section.entries { entry(e) }
  }
}
