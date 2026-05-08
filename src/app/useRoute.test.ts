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

  it('recognises /rentenluecke-rechner and /404 (issue #02)', () => {
    expect(normalizeRoute('/rentenluecke-rechner')).toBe('/rentenluecke-rechner')
    expect(normalizeRoute('/404')).toBe('/404')
  })

  it('strips a trailing slash on legal routes', () => {
    expect(normalizeRoute('/impressum/')).toBe('/impressum')
    expect(normalizeRoute('/datenschutz/')).toBe('/datenschutz')
  })

  it('strips a trailing slash on /rentenluecke-rechner', () => {
    expect(normalizeRoute('/rentenluecke-rechner/')).toBe('/rentenluecke-rechner')
  })

  it('falls back to "/404" for unknown paths (was "/" before issue #02)', () => {
    // Previously the legacy `404.html = index.html` copy made unknown URLs look
    // like the calculator. Issue #02 introduces a real /404 page so unknown
    // URLs render the not-found body instead of silently substituting `/`.
    expect(normalizeRoute('/something-else')).toBe('/404')
    expect(normalizeRoute('/admin')).toBe('/404')
    expect(normalizeRoute('')).toBe('/404')
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

  it('returns "compare" when a share-URL is present (share-URLs predate v2 mode field)', () => {
    // Share-URLs carry v1 singleton state (profile + assumptions) with no mode field.
    // detectSavedMode treats any `?s=` parameter as a returning compare-mode user
    // because share-URLs predate the v2 workspace schema and therefore have no mode tag.
    // The full parse/validate path lives in `urlShare.readUrlState`; here we only
    // exercise the lightweight presence check `hasShareStateInUrl` reads from
    // `window.location.search`.
    vi.stubGlobal('window', {
      ...globalThis.window,
      location: { search: '?s=eyJmb28iOjF9' },
    })
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
