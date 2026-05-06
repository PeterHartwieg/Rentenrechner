import { readUrlState } from '../utils/urlShare'

/**
 * Client-side robots-meta injector.
 *
 * Public discovery pages are prerendered with `<meta name="robots"
 * content="index,follow">`. When a user opens a *share-URL* (`?s=<base64>`)
 * the URL carries personal modelling assumptions — that variant of the page
 * must NOT enter the search index, but the static HTML can't vary by query
 * string on a CDN that lacks edge functions (Cloudflare Pages today).
 *
 * Mitigation pinned in issue #02 acceptance criteria + PRD line 103:
 *   1. Canonical strips `?s=` so even if Google indexes the URL it folds into
 *      the canonical (`buildCanonicalUrl` + `stripShareStateFromUrl`).
 *   2. On hydration this function checks `readUrlState()` — if the URL carries
 *      a parsable share payload, it overwrites the existing `<meta
 *      name="robots">` with `noindex,follow`.
 *
 * The function is a no-op when:
 *   - `window` / `document` is undefined (SSR pass).
 *   - No share state is present.
 *   - The URL is not a registered public route (defensive — share URLs only
 *     ever target the calculator at `/`, but this avoids false positives if
 *     query strings appear elsewhere later).
 *
 * Returns `true` when an injection happened, `false` otherwise — exposed for
 * tests; runtime callers can ignore the return value.
 */
export function applyShareStateNoindex(): boolean {
  if (typeof document === 'undefined') return false
  if (typeof window === 'undefined') return false

  let hasShareState: boolean
  try {
    hasShareState = readUrlState() !== null
  } catch {
    // readUrlState already swallows parse errors; the catch here is defensive
    // for environments where window.location is unavailable.
    return false
  }
  if (!hasShareState) return false

  // Replace any existing robots meta (the prerender writes `index,follow`).
  let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', 'noindex,follow')
  return true
}
