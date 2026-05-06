// @vitest-environment jsdom

/**
 * LandingPage tests — focus on the issue #13 `?topic=<slug>` auto-fire path.
 *
 * Manual button clicks are simple wiring (no auto-fire branch), so we focus
 * the tests on the four contract decisions:
 *   1. Known slug + no saved state → auto-fire `onChoice` with mode +
 *      visibleProducts.
 *   2. Unknown slug → no auto-fire; landing renders normally.
 *   3. Missing slug → no auto-fire; landing renders normally.
 *   4. Returning user with saved state → no auto-fire regardless of slug.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LandingPage, type LandingChoice } from './LandingPage'
import { STORAGE_KEY_V2 } from '../../storage'

// `useRoute.detectSavedMode` reads localStorage + window.location.search; the
// auto-fire path also reads window.location.search via the resolver. We
// stub localStorage and window.location per test to control the inputs.

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// `useRoute.ts` reads `urlShare.readUrlState()` to decide whether a share-URL
// counts as a returning user. We mock it to return null by default so the
// `?topic=` slug branch is not pre-empted by share-URL detection.
vi.mock('../../utils/urlShare', () => ({
  readUrlState: vi.fn(() => null),
}))

function makeStore(initial: Record<string, string> = {}): Storage {
  const store = { ...initial }
  return {
    get length() { return Object.keys(store).length },
    clear() { for (const k of Object.keys(store)) delete store[k] },
    getItem: (k: string) => (k in store ? store[k] : null),
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (k: string) => { delete store[k] },
    setItem: (k: string, v: string) => { store[k] = v },
  }
}

function stubLocationSearch(search: string) {
  // jsdom's location is configurable; setting `window.location.search` requires
  // re-defining `location` because individual properties are read-only.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search },
  })
}

describe('LandingPage — ?topic= auto-fire on first-time landing', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStore())
    stubLocationSearch('')
  })

  it('auto-fires onChoice with compare mode + visibleProducts for a known slug', () => {
    stubLocationSearch('?topic=rentenluecke-rechner')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).toHaveBeenCalledTimes(1)
    expect(onChoice.mock.calls[0][0]).toEqual({
      kind: 'compare',
      visibleProducts: ['etf'],
    })
  })

  it('does not auto-fire for an unknown slug — landing renders normally', () => {
    stubLocationSearch('?topic=does-not-exist')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    const { getByRole } = render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).not.toHaveBeenCalled()
    // Sanity: the landing headline is rendered.
    expect(getByRole('heading', { level: 1 }).textContent).toMatch(/Altersvorsorge/i)
  })

  it('does not auto-fire when no ?topic= is present — landing renders normally', () => {
    stubLocationSearch('')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    const { getByRole } = render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).not.toHaveBeenCalled()
    expect(getByRole('heading', { level: 1 }).textContent).toMatch(/Altersvorsorge/i)
  })

  it('does not auto-fire when other query params are present (no ?topic=)', () => {
    stubLocationSearch('?lang=de&foo=bar')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).not.toHaveBeenCalled()
  })
})

describe('LandingPage — saved state always wins (PRD US-18)', () => {
  it('does not auto-fire when v2 saved state exists, even with a matching slug', () => {
    vi.stubGlobal('localStorage', makeStore({
      [STORAGE_KEY_V2]: JSON.stringify({ schemaVersion: 2, mode: 'compare' }),
    }))
    stubLocationSearch('?topic=rentenluecke-rechner')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    render(<LandingPage onChoice={onChoice} />)
    // Saved state always wins — the landing page does NOT auto-fire even
    // with a recognised topic slug (returning user's workspace is preserved).
    expect(onChoice).not.toHaveBeenCalled()
  })

  it('does not auto-fire when v2 saved state has mode combine, even with a slug', () => {
    vi.stubGlobal('localStorage', makeStore({
      [STORAGE_KEY_V2]: JSON.stringify({ schemaVersion: 2, mode: 'combine' }),
    }))
    stubLocationSearch('?topic=rentenluecke-rechner')
    const onChoice = vi.fn<(c: LandingChoice) => void>()
    render(<LandingPage onChoice={onChoice} />)
    expect(onChoice).not.toHaveBeenCalled()
  })
})

describe('LandingPage — combine-mode preselection (issue #13 forwards visibleProducts)', () => {
  // For combine-mode the wizard reads `initialEnabledProducts` so the brief
  // requires the LandingChoice variant to carry visibleProducts through the
  // auto-fire. The `/rentenluecke-rechner` entry uses compare mode, so to
  // test the combine branch we craft a minimal contract test.
  //
  // We assert the *shape* of the LandingChoice payload, since the actual
  // combine-mode topic page is registered by future agents (#04–#07).
  it('LandingChoice combine variant accepts optional visibleProducts (type contract)', () => {
    const choice: LandingChoice = { kind: 'combine', visibleProducts: ['etf', 'bav'] }
    expect(choice.visibleProducts).toEqual(['etf', 'bav'])
  })

  it('LandingChoice compare variant accepts optional visibleProducts (type contract)', () => {
    const choice: LandingChoice = { kind: 'compare', visibleProducts: ['etf'] }
    expect(choice.visibleProducts).toEqual(['etf'])
  })

  it('LandingChoice variants without visibleProducts are still legal (CTA buttons)', () => {
    // Manual CTA clicks (Mein Plan / Vergleich starten) never carry seeds.
    const c1: LandingChoice = { kind: 'combine' }
    const c2: LandingChoice = { kind: 'compare' }
    expect(c1.visibleProducts).toBeUndefined()
    expect(c2.visibleProducts).toBeUndefined()
  })
})
