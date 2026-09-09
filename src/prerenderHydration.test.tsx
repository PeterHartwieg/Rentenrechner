// @vitest-environment jsdom
//
// Prerender ↔ hydration contract.
//
// `scripts/prerender.mjs` stamps `data-rentenwiki-prerendered="1"` on
// `<div id="root">` for every route in `HYDRATE_STABLE_ROUTE_IDS`, and
// `main.tsx` answers that marker with `hydrateRoot` instead of `createRoot`.
// The marker is a promise: the static HTML equals the client's FIRST render.
// Break the promise and React throws minified error #418 in the browser
// console and regenerates the whole tree, which is both a visible flash and
// a wasted prerender.
//
// Two things are pinned here.
//
//  1. Every marked route hydrates cleanly — asserted through `hydrateRoot`'s
//     `onRecoverableError`, which is where React reports a mismatch (it does
//     not go through `console.error` in every path). Saved compare state is
//     seeded in localStorage first, because a returning user is exactly the
//     case a hydration bug hides in.
//
//  2. `/vergleich` (and its `/vergleich/details` drill-in) stay OUT of the
//     marked set. Their output is a function of the saved compare selection,
//     so their prerendered HTML cannot match a returning user's first render
//     — the test demonstrates the divergence rather than asserting a list.
//
// The regression this file was written for: the prerender used to render the
// page component bare, while `App.tsx` renders every (lazy) route body inside
// `<Suspense fallback={null}>`. The client's first render therefore hit a new,
// still-loading boundary and produced `null` against page markup already in
// the DOM.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode, act, createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type Root } from 'react-dom/client'
import App from './App'
import { PrerenderShell } from './seo/prerenderShell'
import { pathToRoute } from './app/useRoute'
import { HYDRATE_STABLE_ROUTE_IDS } from './seo/publicRouteRegistry'
import { isEditorialChromeRoute } from './features/articles/articleResolver'
import { buildStateJson, STORAGE_KEY_V1 } from './storage'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { ImpressumPage } from './features/legal/ImpressumPage'
import { DatenschutzPage } from './features/legal/DatenschutzPage'
import { MethodePage } from './features/methode/MethodePage'
import { ArticleHubPage } from './features/articles/ArticleHubPage'
import { PageNotFound } from './features/publicPages/PageNotFound'
import { BavRechnerPage } from './features/publicPages/BavRechnerPage'
import { VergleichJourneyPage } from './features/vergleich/VergleichJourneyPage'

const NOOP = () => {}

/**
 * The markup the build ships: `scripts/prerender.mjs` renders this exact
 * component. Importing it (rather than re-declaring the wrapper here) is what
 * makes this a regression test and not a mirror that can drift.
 */
function prerenderMarkup(page: ReactElement, path: string): string {
  return renderToString(
    <PrerenderShell route={pathToRoute(path)} editorial={isEditorialChromeRoute(path)}>
      {page}
    </PrerenderShell>,
  )
}

/** The routes exercised below, with the props the prerender passes them. */
const HYDRATED_ROUTES: ReadonlyArray<{ path: string; page: ReactElement; marker: string }> = [
  { path: '/impressum', page: <ImpressumPage navigate={NOOP} />, marker: 'Impressum' },
  { path: '/datenschutz', page: <DatenschutzPage navigate={NOOP} />, marker: 'Datenschutz' },
  { path: '/methode', page: <MethodePage navigate={NOOP} />, marker: 'Methode' },
  { path: '/artikel', page: <ArticleHubPage navigate={NOOP} />, marker: 'Artikel' },
  { path: '/404', page: <PageNotFound />, marker: 'Seite' },
  { path: '/bav-rechner', page: <BavRechnerPage />, marker: 'bAV' },
]

let root: Root | null = null

/**
 * Hydrate `markup` at `path` with the real `App` tree, exactly as `main.tsx`
 * does for a marked route. Returns the container plus every recoverable error
 * React reported (a hydration mismatch lands here).
 */
async function hydrateApp(markup: string, path: string) {
  window.history.replaceState(null, '', path)
  const container = document.createElement('div')
  container.innerHTML = markup
  document.body.appendChild(container)

  const recoverable: string[] = []
  await act(async () => {
    root = hydrateRoot(container, createElement(StrictMode, null, createElement(App)), {
      onRecoverableError: (error) => {
        recoverable.push(error instanceof Error ? error.message : String(error))
      },
    })
  })
  // Let the lazy route chunk resolve and the boundary hydrate.
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return { container, recoverable }
}

beforeEach(() => {
  // A returning user with saved compare state — the case a hydration bug
  // hides in. None of the marked routes may read it.
  localStorage.setItem(
    STORAGE_KEY_V1,
    buildStateJson(
      { ...defaultProfile, age: 41, grossSalaryYear: 72_000, publicHealthInsurance: false },
      { ...defaultAssumptions, visibleProducts: ['etf', 'bav'], equalInputAmountEUR: 275 },
    ),
  )
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('prerendered routes hydrate without a mismatch', () => {
  for (const { path, page, marker } of HYDRATED_ROUTES) {
    it(`${path} — first client render matches the prerendered HTML`, async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(NOOP)
      const { container, recoverable } = await hydrateApp(prerenderMarkup(page, path), path)

      expect(recoverable).toEqual([])
      expect(
        consoleError.mock.calls.map((call) => String(call[0])).filter((m) => /[Hh]ydrat/.test(m)),
      ).toEqual([])
      // The route body survived hydration rather than being regenerated empty.
      expect(container.textContent).toContain(marker)
    })
  }

  it('marks only routes that ignore saved state', () => {
    // Guard against a future PR quietly adding a state-dependent route.
    expect(HYDRATE_STABLE_ROUTE_IDS).not.toContain('/')
    expect(HYDRATE_STABLE_ROUTE_IDS).not.toContain('/eingaben')
    expect(HYDRATE_STABLE_ROUTE_IDS).not.toContain('/eingaben/produkte')
    expect(HYDRATE_STABLE_ROUTE_IDS).not.toContain('/vergleich')
    expect(HYDRATE_STABLE_ROUTE_IDS).not.toContain('/vergleich/details')
  })
})

describe('/vergleich stays off the hydration path', () => {
  it('renders the saved selection on the client, not the prerendered default', async () => {
    const markup = prerenderMarkup(
      <VergleichJourneyPage navigate={NOOP} />,
      '/vergleich',
    )
    // The prerender runs with no storage, so it shows the default comparison.
    expect(markup).not.toContain('data-testid="vergleich-setup"')

    // The seeded state selects two products and a 275 € budget; the client's
    // first render therefore cannot equal `markup`. This divergence is the
    // reason `/vergleich` must never be marked hydration-stable — it is a
    // property of the page, not a bug to be fixed in the prerender.
    window.history.replaceState(null, '', '/vergleich')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { createRoot } = await import('react-dom/client')
    const clientRoot = createRoot(container)
    await act(async () => {
      clientRoot.render(<VergleichJourneyPage navigate={NOOP} />)
    })
    expect(container.innerHTML).not.toBe(markup)
    act(() => clientRoot.unmount())
  })
})
