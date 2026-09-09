// @vitest-environment node
/**
 * chromeRoutes — small pure tests pinning the chrome-nav-id mapping.
 * Most chrome behaviour is covered by AppShell integration tests; this
 * file pins the per-variant invariant the routeToNavId switch declares.
 *
 * PR 2 of the Direction D /eingaben migration adds the new
 * `eingaben-produkte` route variant. Both `eingaben` and `eingaben-produkte`
 * highlight the same `angaben` nav tab so the chrome reads as "I'm still
 * in the Angaben wizard" regardless of which page the user is on.
 */
import { describe, expect, it } from 'vitest'
import { ROUTES } from '../../app/useRoute'
import { routeToNavId } from './chromeRoutes'

describe('routeToNavId — PR 2 /eingaben/produkte mapping', () => {
  it('maps eingaben to the "angaben" nav tab', () => {
    expect(routeToNavId(ROUTES.eingaben)).toBe('angaben')
  })

  it('maps eingaben-produkte to the same "angaben" nav tab as Schritt 1', () => {
    expect(routeToNavId(ROUTES.eingabenProdukte)).toBe('angaben')
  })
})

describe('routeToNavId — simplification 2D plan/compare split', () => {
  it('sends /vergleich and its drill-in to the compare tab', () => {
    expect(routeToNavId(ROUTES.vergleich)).toBe('compare')
    expect(routeToNavId(ROUTES.vergleichDetail)).toBe('compare')
  })

  it('sends every plan surface to the plan tab', () => {
    // `/` cannot be disambiguated from the URL alone, so it stays 'home'
    // here and is resolved by `activeChromeNavId` with the saved appView.
    expect(routeToNavId(ROUTES.vorsorgeNeu)).toBe('plan')
    expect(routeToNavId(ROUTES.vertrag('etf-1'))).toBe('plan')
    expect(routeToNavId(ROUTES.vertragBearbeiten('etf-1'))).toBe('plan')
    expect(routeToNavId(ROUTES.kapital)).toBe('plan')
    expect(routeToNavId(ROUTES.alternativen)).toBe('plan')
  })

  it('never maps a plan route and a comparison route to the same tab', () => {
    expect(routeToNavId(ROUTES.vertrag('etf-1'))).not.toBe(routeToNavId(ROUTES.vergleich))
  })
})
