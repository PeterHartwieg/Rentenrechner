import type { AppView, Route } from '../../app/useRoute'
import { appViewFromUrl } from '../../app/useRoute'

/**
 * Chrome nav tab ids. PR 5 promotes the previously-placeholder "plan" tab to
 * "angaben" (= Deine Angaben at `/eingaben`); the Annahmen tab is removed
 * from the chrome (it now folds into Section 4 of /eingaben).
 *
 * The `compare` id covers both the "Vergleich" and "Mein Plan" labels — the
 * label is chosen at render-time based on saved mode (see AppHeader).
 */
export type ChromeNavId = 'home' | 'angaben' | 'compare' | 'artikel' | 'method'

/**
 * Map a current `Route` to the chrome nav tab id it should highlight.
 * Returns `null` for legal pages (no chrome tab applicable) and for the
 * not-found view.
 *
 * Drill-ins from the calculator (`vertrag`, `kapital`, `vergleich-detail`)
 * highlight the `compare` tab — they live inside the user's saved-mode
 * dashboard, so the chrome reads as "I'm still on my work".
 *
 * Note: this is the URL-only resolver. For URL `?view=landing` + saved-mode
 * awareness use `activeChromeNavId(route, search, appView)` instead.
 */
export function routeToNavId(route: Route): ChromeNavId | null {
  switch (route.kind) {
    case 'home':
      // Bare `/` can be either landing or dashboard; the URL alone cannot
      // disambiguate. Defer to `activeChromeNavId` which knows the
      // resolved `appView`. Fall back to Startseite when called directly.
      return 'home'
    case 'vertrag':
    case 'kapital':
    case 'vergleich-detail':
      // Drill-ins from the saved-mode dashboard (per-contract Vertrag-Detail,
      // full-page Kapital & Auszahlungen, per-product Wohin geht das Geld).
      // The `compare` tab owns the dashboard — its label flips to "Mein Plan"
      // in combine mode — so highlighting it keeps the chrome coherent.
      return 'compare'
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
 * Resolve the nav tab id to highlight, considering the current `Route`, the
 * `?view=landing` URL search-param override, and the resolved `appView`
 * (which is `'landing' | 'compare' | 'combine'` once App.tsx has consulted
 * saved mode + URL override).
 *
 * Rules for the `/` route:
 *   - `?view=landing` in the URL → Startseite ('home'). The override always
 *     forces the landing page; the chrome reflects that destination.
 *   - `appView === 'compare'` or `'combine'` → the dashboard tab ('compare'),
 *     which renders as "Vergleich" / "Mein Plan" respectively.
 *   - `appView === 'landing'` (fresh user with no saved state) → Startseite.
 *   - `appView === undefined` (legacy callers / tests without the prop) →
 *     Startseite, preserving the pre-thread default.
 *
 * Pure function: pass `search` and `appView` explicitly in tests. In the
 * browser the caller reads `window.location.search` + the App.tsx state.
 */
export function activeChromeNavId(
  route: Route,
  search: string,
  appView?: AppView | null,
): ChromeNavId | null {
  if (route.kind === 'home') {
    if (appViewFromUrl(search) === 'landing') return 'home'
    if (appView === 'compare' || appView === 'combine') return 'compare'
    return 'home'
  }
  return routeToNavId(route)
}
