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
