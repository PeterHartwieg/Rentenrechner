// Lightweight share-URL detection used by the initial-paint code path
// (`useRoute.detectSavedMode`, `seo/dynamicRobots.applyShareStateNoindex`).
//
// The full `urlShare.readUrlState` validates and parses the encoded scenario,
// which forces an import of `src/storage.ts` (and its engine + scenario-schema
// deps). For mode detection and the noindex flag we only need to know whether
// a `?s=...` parameter is present — never its contents — so this module
// stays free of those dependencies and ships in the initial bundle for every
// route. Calculator and friends still import the full `urlShare` module.

const URL_PARAM = 's'

/**
 * Returns true when the current URL carries a `?s=...` share-state parameter.
 * Treats any non-empty value as present; full validation lives in
 * `readUrlState`. SSR / no-window environments return false.
 */
export function hasShareStateInUrl(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const value = new URLSearchParams(window.location.search).get(URL_PARAM)
    return typeof value === 'string' && value.length > 0
  } catch {
    return false
  }
}
