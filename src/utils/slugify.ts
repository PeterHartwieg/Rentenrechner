// ---------------------------------------------------------------------------
// slugify — share one heading-/label-to-anchor-id implementation across the
// editorial article surfaces. Handles German umlauts (ä/ö/ü/ß) so headings
// like "Beiträge der Arbeitnehmer:innen" produce stable, predictable
// anchor ids that look reasonable both in URLs and in screen-reader
// announcements.
// ---------------------------------------------------------------------------

/**
 * Slugify a heading or label for use as a DOM/anchor id. Lowercases the
 * input, transliterates the four German umlauts to ASCII, then collapses
 * non-alphanumeric runs to single dashes. Empty / dash-only results return
 * `''`; call sites typically fall back to `'section'` in that case so the
 * generated id is never empty.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
