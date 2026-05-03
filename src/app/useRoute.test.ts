import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { normalizeRoute, detectSavedMode, appViewFromMode } from './useRoute'
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../storage'

describe('normalizeRoute', () => {
  it('returns "/" for the root path', () => {
    expect(normalizeRoute('/')).toBe('/')
  })

  it('recognises /impressum and /datenschutz', () => {
    expect(normalizeRoute('/impressum')).toBe('/impressum')
    expect(normalizeRoute('/datenschutz')).toBe('/datenschutz')
  })

  it('strips a trailing slash on legal routes', () => {
    expect(normalizeRoute('/impressum/')).toBe('/impressum')
    expect(normalizeRoute('/datenschutz/')).toBe('/datenschutz')
  })

  it('falls back to "/" for unknown paths', () => {
    expect(normalizeRoute('/something-else')).toBe('/')
    expect(normalizeRoute('/admin')).toBe('/')
    expect(normalizeRoute('')).toBe('/')
  })
})

// ---------------------------------------------------------------------------
// Landing-page routing decision (Group G issue 04)
// appViewFromMode is a pure helper; detectSavedMode reads localStorage.
// ---------------------------------------------------------------------------

describe('appViewFromMode', () => {
  it('returns "landing" when no saved mode exists', () => {
    expect(appViewFromMode(null)).toBe('landing')
  })

  it('returns "compare" for saved compare mode', () => {
    expect(appViewFromMode('compare')).toBe('compare')
  })

  it('returns "combine" for saved combine mode', () => {
    expect(appViewFromMode('combine')).toBe('combine')
  })
})

describe('detectSavedMode — localStorage integration', () => {
  // Use a local in-memory store so tests don't touch the real localStorage.
  const store: Record<string, string> = {}

  beforeEach(() => {
    Object.keys(store).forEach(k => { delete store[k] })
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
    })
    // Ensure no URL params bleed in from other tests.
    vi.stubGlobal('window', {
      ...globalThis.window,
      location: { search: '' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when no state is saved (new user → landing page)', () => {
    expect(detectSavedMode()).toBeNull()
  })

  it('returns "compare" for a v2 workspace with mode compare', () => {
    store[STORAGE_KEY_V2] = JSON.stringify({ schemaVersion: 2, mode: 'compare' })
    expect(detectSavedMode()).toBe('compare')
  })

  it('returns "combine" for a v2 workspace with mode combine', () => {
    store[STORAGE_KEY_V2] = JSON.stringify({ schemaVersion: 2, mode: 'combine' })
    expect(detectSavedMode()).toBe('combine')
  })

  it('returns "compare" for a legacy v1 state (no schemaVersion)', () => {
    store[STORAGE_KEY_V1] = JSON.stringify({ version: 1, profile: {}, assumptions: {} })
    expect(detectSavedMode()).toBe('compare')
  })
})

describe('/ route landing decision — end-to-end via appViewFromMode + detectSavedMode', () => {
  // Simulates the full flow: App reads detectSavedMode() → appViewFromMode() → AppView.
  const store: Record<string, string> = {}

  beforeEach(() => {
    Object.keys(store).forEach(k => { delete store[k] })
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
    })
    vi.stubGlobal('window', {
      ...globalThis.window,
      location: { search: '' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('no saved state → landing page', () => {
    expect(appViewFromMode(detectSavedMode())).toBe('landing')
  })

  it('saved combine state → combine dashboard', () => {
    store[STORAGE_KEY_V2] = JSON.stringify({ schemaVersion: 2, mode: 'combine' })
    expect(appViewFromMode(detectSavedMode())).toBe('combine')
  })

  it('saved compare state → compare dashboard', () => {
    store[STORAGE_KEY_V2] = JSON.stringify({ schemaVersion: 2, mode: 'compare' })
    expect(appViewFromMode(detectSavedMode())).toBe('compare')
  })
})
