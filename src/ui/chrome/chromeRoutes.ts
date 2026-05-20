import type { Route } from '../../app/useRoute'

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
 */
export function routeToNavId(route: Route): ChromeNavId | null {
  switch (route.kind) {
    case 'home':
      return 'home'
    case 'vertrag':
    case 'kapital':
      // Drill-ins from Mein Plan (per-contract Vertrag-Detail, full-page
      // Kapital & Auszahlungen) — keep the home tab lit so the chrome reads
      // coherently with the user's sense of "I'm still on my plan".
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
