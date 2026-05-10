import { hasShareStateInUrl } from '../utils/urlShareDetect'

/**
 * Client-side robots-meta injector.
 *
 * Public discovery pages are prerendered with `<meta name="robots"
 * content="index,follow">`. When a user opens a *share-URL* (`?s=<base64>`)
 * the URL carries personal modelling assumptions — that variant of the page
 * must NOT enter the search index, but the static HTML can't vary by query
 * string via static assets alone (Cloudflare Workers serves static HTML; the Worker script handles this client-side).
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

  // Only the presence of `?s=...` matters for the noindex decision: any
  // share-URL variant of the page must not enter the search index, even if
  // the encoded payload is malformed. `hasShareStateInUrl` keeps this code
  // path independent of `src/storage.ts` so the heavy parse/validate path
  // stays inside the lazy Calculator chunk.
  if (!hasShareStateInUrl()) return false

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
