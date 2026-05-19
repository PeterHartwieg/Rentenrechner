import type { Route } from '../../app/useRoute'

export type ChromeNavId = 'home' | 'plan' | 'compare' | 'artikel' | 'method'

export function routeToNavId(route: Route): ChromeNavId | null {
  if (route === '/') return 'home'
  if (route === '/impressum' || route === '/datenschutz') return null
  // PR 3+ will introduce dedicated /artikel, /methode etc. routes; for now
  // the SEO topic pages are the de-facto articles section.
  return 'artikel'
}
