import type { AppView, Route } from '../../app/useRoute'
import { appViewFromUrl } from '../../app/useRoute'

/**
 * Chrome nav tab ids.
 *
 * Simplification 2D splits the old shared dashboard tab in two. `plan`
 * ("Mein Plan", `/`) and `compare` ("Vergleich", `/vergleich`) are now
 * separate, always-distinct destinations with fixed labels; the previous
 * mode-dependent relabelling of one shared tab is gone, because a single tab
 * whose destination changed with saved mode is exactly what let the two
 * surfaces overwrite each other.
 */
export type ChromeNavId = 'home' | 'angaben' | 'plan' | 'compare' | 'artikel' | 'method'

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
    case 'vertrag-bearbeiten':
    case 'vorsorge-neu':
    case 'alternativen':
    case 'kapital':
      // Plan drill-ins: the read-only contract detail, its editable sibling,
      // the add-contract picker, the saved-alternatives surface, and the
      // full-page Kapital & Auszahlungen lifecycle view. All are reached from
      // Mein Plan, so the plan tab stays lit and the chrome reads as "I'm
      // still on my plan".
      return 'plan'
    case 'vergleich':
    case 'vergleich-detail':
      // The comparison journey and its per-product drill-in.
      return 'compare'
    case 'methode':
      return 'method'
    case 'eingaben':
    case 'eingaben-produkte':
      // Schritt 2 of the two-page eingaben flow shares the same nav tab as
      // Schritt 1 so the chrome reads as "I'm still in the Angaben wizard"
      // regardless of which page the user is on.
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
 *   - `appView === 'compare'` or `'combine'` → the plan tab ('plan'). `/` is
 *     the personal plan for every saved mode; the comparison has its own
 *     route and its own tab.
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
    // `/` is the personal plan for every saved mode now — a saved-compare user
    // lands on the plan's not-started state, not on the comparison.
    if (appView === 'compare' || appView === 'combine') return 'plan'
    return 'home'
  }
  return routeToNavId(route)
}
