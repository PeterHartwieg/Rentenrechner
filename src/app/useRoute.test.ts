/**
 * Tests for `appViewFromUrl`, `appViewFromMode`, and `detectSavedMode` --
 * the three pure helpers that together implement the
 * `rederiveFromUrl` callback in `App.tsx`.
 *
 * The back-button regression (Codex R2 P1, PR 296 R3) is exercised by
 * the "back-button scenario" test: prior to the R3 fix the `rederiveFromUrl`
 * listener only called `setCalculatorView` when the override was non-null,
 * so navigating back from `/?view=landing` to `/` left `calculatorView`
 * stuck at `'landing'`. The fix adds an `else` branch that calls
 * `appViewFromMode(detectSavedMode())`. This file pins that contract so
 * a future regression makes the test fail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../storageKeys'
import { appViewFromUrl, appViewFromMode, detectSavedMode } from './useRoute'

// ---------------------------------------------------------------------------
// appViewFromUrl
// ---------------------------------------------------------------------------

describe('appViewFromUrl', () => {
  it('returns landing for ?view=landing', () => {
    expect(appViewFromUrl('?view=landing')).toBe('landing')
  })

  it('returns landing for view=landing (no leading ?)', () => {
    expect(appViewFromUrl('view=landing')).toBe('landing')
  })

  it('returns null for empty search', () => {
    expect(appViewFromUrl('')).toBeNull()
  })

  it('returns null for unknown view values', () => {
    expect(appViewFromUrl('?view=compare')).toBeNull()
    expect(appViewFromUrl('?view=combine')).toBeNull()
    expect(appViewFromUrl('?view=unknown')).toBeNull()
  })

  it('returns null when view param is absent', () => {
    expect(appViewFromUrl('?foo=bar')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// appViewFromMode
// ---------------------------------------------------------------------------

describe('appViewFromMode', () => {
  it('returns landing for null (no saved state)', () => {
    expect(appViewFromMode(null)).toBe('landing')
  })

  it('returns combine for combine mode', () => {
    expect(appViewFromMode('combine')).toBe('combine')
  })

  it('returns compare for compare mode', () => {
    expect(appViewFromMode('compare')).toBe('compare')
  })
})

// ---------------------------------------------------------------------------
// detectSavedMode + back-button regression scenario
// ---------------------------------------------------------------------------

describe('detectSavedMode', () => {
  // Use a manual store to avoid dependency on jsdom localStorage availability.
  const store: Record<string, string> = {}

  beforeEach(() => {
    Object.keys(store).forEach((k) => { delete store[k] })
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
    })
    // Ensure no share-URL state bleeds in (hasShareStateInUrl reads window.location.search).
    vi.stubGlobal('window', {
      ...globalThis.window,
      location: { search: '' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when no saved state exists (first-time user)', () => {
    expect(detectSavedMode()).toBeNull()
  })

  it('returns compare when only the v1 key is present', () => {
    store[STORAGE_KEY_V1] = JSON.stringify({ returnScenarios: [] })
    expect(detectSavedMode()).toBe('compare')
  })

  it('returns combine when the v2 key carries mode=combine', () => {
    store[STORAGE_KEY_V2] = JSON.stringify({ mode: 'combine' })
    expect(detectSavedMode()).toBe('combine')
  })

  it('returns compare when the v2 key carries mode=compare', () => {
    store[STORAGE_KEY_V2] = JSON.stringify({ mode: 'compare' })
    expect(detectSavedMode()).toBe('compare')
  })

  it('returns compare when the v2 key is present but has no valid mode field', () => {
    store[STORAGE_KEY_V2] = JSON.stringify({ schemaVersion: 2 })
    expect(detectSavedMode()).toBe('compare')
  })

  // -------------------------------------------------------------------------
  // Back-button regression (PR 296 R3 - Codex R2 P1)
  //
  // Scenario: returning combine-mode user clicks the "Vergleich" chrome tab
  // which navigates to /?view=landing. App mounts with view='landing'.
  // User presses back -- URL returns to / (no ?view param). The
  // rederiveFromUrl listener fires. With the R3 fix the else branch calls
  // appViewFromMode(detectSavedMode()) and view becomes 'combine'.
  //
  // This test pins that the two pure helpers, composed exactly as the else
  // branch does, produce 'combine' -- i.e. when the override disappears
  // the saved mode wins.
  // -------------------------------------------------------------------------

  it('back-button scenario: override absent => appViewFromMode(detectSavedMode()) returns saved mode', () => {
    // Saved state: combine mode.
    store[STORAGE_KEY_V2] = JSON.stringify({ mode: 'combine' })

    // Simulate arrival at /?view=landing: override is present.
    const withOverride = appViewFromUrl('?view=landing')
    expect(withOverride).toBe('landing')

    // Simulate browser back to /: override disappears.
    const afterBack = appViewFromUrl('')
    expect(afterBack).toBeNull()

    // The R3 else branch: appViewFromMode(detectSavedMode()) must restore 'combine'.
    const restored = appViewFromMode(detectSavedMode())
    expect(restored).toBe('combine')
  })

  it('first-time user scenario: no saved state => appViewFromMode(detectSavedMode()) returns landing', () => {
    // Empty store -- first-time user.
    const afterBack = appViewFromUrl('')
    expect(afterBack).toBeNull()

    // Else branch must not crash and must return 'landing'.
    const restored = appViewFromMode(detectSavedMode())
    expect(restored).toBe('landing')
  })

  it('back-button scenario: compare-mode user returns to compare dashboard', () => {
    store[STORAGE_KEY_V2] = JSON.stringify({ mode: 'compare' })

    const afterBack = appViewFromUrl('')
    expect(afterBack).toBeNull()

    const restored = appViewFromMode(detectSavedMode())
    expect(restored).toBe('compare')
  })
})
