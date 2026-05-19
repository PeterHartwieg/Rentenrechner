import type { Route } from '../../app/useRoute'

export type ChromeNavId = 'home' | 'plan' | 'compare' | 'artikel' | 'method'

export function routeToNavId(route: Route): ChromeNavId | null {
  if (route === '/') return 'home'
  if (route === '/impressum' || route === '/datenschutz') return null
  // Every topic page + the `/artikel` hub itself maps to the "Artikel" tab
  // (PR 3). PR 4 will introduce `/methode` and map it to "method"; until
  // then the remaining nav tabs ('plan' / 'compare' / 'method') are visual
  // placeholders rendered as non-clickable spans in `AppHeader`.
  return 'artikel'
}
