import type { Route } from '../../app/useRoute'
import { appViewFromUrl } from '../../app/useRoute'

/**
 * Chrome nav tab ids. PR 5 promotes the previously-placeholder "plan" tab to
 * "angaben" (= Deine Angaben at `/eingaben`); the Annahmen tab is removed
 * from the chrome (it now folds into Section 4 of /eingaben).
 *
 * `compare` remains a visual placeholder until its route ships (PR 9).
 */
export type ChromeNavId = 'home' | 'angaben' | 'compare' | 'artikel' | 'method'

/**
 * Map a current `Route` to the chrome nav tab id it should highlight.
 * Returns `null` for legal pages (no chrome tab applicable) and for the
 * not-found view.
 *
 * The PR 7 `vertrag` dynamic route is a combine-mode drill-in from Mein
 * Plan; it highlights the "Startseite" tab so the chrome reads coherently
 * with the user's sense of "I'm still on my plan".
 *
 * Note: this is the URL-only resolver. For URL + `?view=landing` override
 * awareness (R1.1) use `activeChromeNavId(route, search)` instead.
 */
export function routeToNavId(route: Route): ChromeNavId | null {
  switch (route.kind) {
    case 'home':
      return 'home'
    case 'vertrag':
    case 'kapital':
    case 'vergleich-detail':
      // Drill-ins from Mein Plan / Vergleich (per-contract Vertrag-Detail,
      // full-page Kapital & Auszahlungen, per-product Wohin geht das Geld)
      // — keep the home tab lit so the chrome reads coherently with the
      // user's sense of "I'm still on my plan / Vergleich".
      return 'home'
    case 'methode':
      return 'method'
    case 'eingaben':
      return 'angaben'
    case 'impressum':
    case 'datenschutz':
    case 'not-found':
      return null
    case 'artikel':
    case 'rentenluecke-rechner':
    case 'bav-rechner':
    case 'etf-vs-bav':
    case 'riester-rechner':
    case 'altersvorsorgedepot-rechner':
    case 'riester-vs-altersvorsorgedepot':
    case 'basisrente-rechner':
    case 'private-rentenversicherung-rechner':
    case 'rente-netto-berechnen':
    case 'altersvorsorgeprodukte-vergleichen':
      // Every topic page + the `/artikel` hub maps to the "Artikel" tab.
      return 'artikel'
    default: {
      const _exhaustive: never = route
      return _exhaustive
    }
  }
}

/**
 * Resolve the nav tab id to highlight, considering both the current `Route`
 * and the `?view=landing` URL search-param override (R1.1).
 *
 * Why this exists: `routeToNavId(ROUTES.home)` returns `'home'` for both
 * `/` and `/?view=landing`. The Vergleich tab's `clickableTarget` returns
 * `{ route: ROUTES.home, search: '?view=landing' }` (PR #296 R1 fix) so
 * clicking it routes to `/?view=landing`. Without this helper, the chrome
 * would highlight Startseite there — but the user's intent (and the
 * canvas comparison-page semantics) is the Vergleich tab.
 *
 * Rule: when the URL carries `?view=landing`, map `/` to `'compare'`.
 * For every other route the override is ignored — only the Vergleich-tab
 * entry point uses the override today (per `appViewFromUrl` allowing
 * only the `landing` value).
 *
 * Pure function: pass `search` explicitly in tests. In the browser the
 * caller reads `window.location.search` at the call site.
 */
export function activeChromeNavId(route: Route, search: string): ChromeNavId | null {
  if (route.kind === 'home' && appViewFromUrl(search) === 'landing') {
    return 'compare'
  }
  return routeToNavId(route)
}
