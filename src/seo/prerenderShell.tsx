// ---------------------------------------------------------------------------
// The single definition of the tree `scripts/prerender.mjs` renders to HTML.
//
// It used to live inline in the prerender script, which let it drift from what
// `App.tsx` actually mounts on the client. It drifted: the script rendered the
// page component bare, while `App` renders every (lazy) route body inside
// `<Suspense fallback={null}>`. On a hydration-stable route the client's first
// render then hit a brand-new, still-loading boundary, produced the `null`
// fallback against page markup already in the DOM, and React threw
// "Hydration failed because the server rendered HTML didn't match the client"
// (minified error #418) before regenerating the tree from scratch.
//
// Both the build script and `src/prerenderHydration.test.tsx` now call this,
// so the test hydrates the same markup the build ships.
// ---------------------------------------------------------------------------

import { Suspense, type ReactNode } from 'react'
import { AppShell } from '../ui/chrome/AppShell'
import type { Route } from '../app/useRoute'

interface Props {
  route: Route
  editorial: boolean
  children: ReactNode
}

/**
 * Wrap a page in the chrome + Suspense boundary the client mounts.
 *
 * `navigate` is a no-op: function props never reach the HTML, and hydration
 * replaces it with the real router callback.
 */
export function PrerenderShell({ route, editorial, children }: Props) {
  return (
    <AppShell route={route} navigate={() => {}} editorial={editorial}>
      <Suspense fallback={null}>{children}</Suspense>
    </AppShell>
  )
}
