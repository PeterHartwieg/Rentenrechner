import type { Route } from '../../app/useRoute'

/**
 * Chrome nav tab ids. PR 5 promotes the previously-placeholder "plan" tab to
 * "angaben" (= Deine Angaben at `/eingaben`); the Annahmen tab is removed
 * from the chrome (it now folds into Section 4 of /eingaben).
 *
 * `compare` remains a visual placeholder until its route ships (PR 9).
 */
export type ChromeNavId = 'home' | 'angaben' | 'compare' | 'artikel' | 'method'

export function routeToNavId(route: Route): ChromeNavId | null {
  if (route === '/') return 'home'
  if (route === '/methode') return 'method'
  if (route === '/eingaben') return 'angaben'
  if (route === '/impressum' || route === '/datenschutz') return null
  // Every topic page + the `/artikel` hub itself maps to the "Artikel" tab
  // (PR 3). PR 4 added `/methode` and maps it to "method"; PR 5 added
  // `/eingaben` and maps it to "angaben". The remaining nav tab
  // ('compare') is a visual placeholder rendered as a non-clickable span
  // in `AppHeader`.
  return 'artikel'
}
