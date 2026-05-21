// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  pathToRoute,
  routeToPath,
  detectSavedMode,
  appViewFromMode,
  appViewFromUrl,
  useRoute,
  ROUTES,
  type Route,
} from './useRoute'
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../storage'

describe('pathToRoute', () => {
  it('returns the home variant for the root path', () => {
    expect(pathToRoute('/')).toEqual({ kind: 'home' })
  })

  it('recognises /impressum and /datenschutz', () => {
    expect(pathToRoute('/impressum')).toEqual({ kind: 'impressum' })
    expect(pathToRoute('/datenschutz')).toEqual({ kind: 'datenschutz' })
  })

  it('recognises /rentenluecke-rechner and /404 (issue #02)', () => {
    expect(pathToRoute('/rentenluecke-rechner')).toEqual({ kind: 'rentenluecke-rechner' })
    expect(pathToRoute('/404')).toEqual({ kind: 'not-found' })
  })

  it('strips a trailing slash on legal routes', () => {
    expect(pathToRoute('/impressum/')).toEqual({ kind: 'impressum' })
    expect(pathToRoute('/datenschutz/')).toEqual({ kind: 'datenschutz' })
  })

  it('strips a trailing slash on /rentenluecke-rechner', () => {
    expect(pathToRoute('/rentenluecke-rechner/')).toEqual({ kind: 'rentenluecke-rechner' })
  })

  it('falls back to "not-found" for unknown paths (was "/" before issue #02)', () => {
    // Previously the legacy `404.html = index.html` copy made unknown URLs look
    // like the calculator. Issue #02 introduces a real /404 page so unknown
    // URLs render the not-found body instead of silently substituting `/`.
    expect(pathToRoute('/something-else')).toEqual({ kind: 'not-found' })
    expect(pathToRoute('/admin')).toEqual({ kind: 'not-found' })
    expect(pathToRoute('')).toEqual({ kind: 'not-found' })
  })

  it('parses dynamic /vertrag/:instanceId with a plain id', () => {
    expect(pathToRoute('/vertrag/etf-tr-msci')).toEqual({
      kind: 'vertrag',
      instanceId: 'etf-tr-msci',
    })
  })

  it('URL-decodes the :instanceId segment so colon-bearing ids round-trip', () => {
    // Instance ids in this codebase contain colons (e.g. `bav-...:1f3a-...`)
    // which encode to %3A in a URL. Round-tripping through routeToPath +
    // pathToRoute must preserve the original id literally.
    const original = 'bav-direktversicherung:1f3a-9b'
    const url = routeToPath({ kind: 'vertrag', instanceId: original })
    expect(url).toBe('/vertrag/bav-direktversicherung%3A1f3a-9b')
    expect(pathToRoute(url)).toEqual({ kind: 'vertrag', instanceId: original })
  })

  it('strips a trailing slash on /vertrag/:instanceId', () => {
    expect(pathToRoute('/vertrag/etf-tr-msci/')).toEqual({
      kind: 'vertrag',
      instanceId: 'etf-tr-msci',
    })
  })

  it('falls back to not-found on a malformed percent-encoded :instanceId', () => {
    // `decodeURIComponent('%E0%A4%A')` throws `URIError: URI malformed`. The
    // route parser must catch that and surface the not-found empty state
    // rather than letting the throw escape and crash initial render /
    // popstate handling.
    expect(pathToRoute('/vertrag/%E0%A4%A')).toEqual({ kind: 'not-found' })
    expect(pathToRoute('/vertrag/%E0')).toEqual({ kind: 'not-found' })
  })
})

describe('routeToPath', () => {
  it('renders every static variant to its canonical pathname', () => {
    const expectations: ReadonlyArray<readonly [Route, string]> = [
      [ROUTES.home, '/'],
      [ROUTES.artikel, '/artikel'],
      [ROUTES.methode, '/methode'],
      [ROUTES.eingaben, '/eingaben'],
      [ROUTES.impressum, '/impressum'],
      [ROUTES.datenschutz, '/datenschutz'],
      [ROUTES.rentenlueckeRechner, '/rentenluecke-rechner'],
      [ROUTES.bavRechner, '/bav-rechner'],
      [ROUTES.etfVsBav, '/etf-vs-bav'],
      [ROUTES.riesterRechner, '/riester-rechner'],
      [ROUTES.altersvorsorgedepotRechner, '/altersvorsorgedepot-rechner'],
      [ROUTES.riesterVsAltersvorsorgedepot, '/riester-vs-altersvorsorgedepot'],
      [ROUTES.basisrenteRechner, '/basisrente-rechner'],
      [ROUTES.privateRentenversicherungRechner, '/private-rentenversicherung-rechner'],
      [ROUTES.renteNettoBerechnen, '/rente-netto-berechnen'],
      [ROUTES.altersvorsorgeprodukteVergleichen, '/altersvorsorgeprodukte-vergleichen'],
      [ROUTES.kapital, '/kapital'],
      [ROUTES.notFound, '/404'],
    ]
    for (const [route, expected] of expectations) {
      expect(routeToPath(route)).toBe(expected)
    }
  })

  it('URL-encodes the :instanceId segment for /vertrag', () => {
    expect(routeToPath(ROUTES.vertrag('bav-x:42'))).toBe('/vertrag/bav-x%3A42')
  })

  it('round-trips /kapital cleanly (no trailing slash, no query)', () => {
    // Kapital is a static route, no payload — same shape as /methode and /eingaben.
    // The round-trip guards against accidental drift between routeToPath and
    // pathToRoute when extending the tagged union (PR 8 adds this variant).
    expect(routeToPath(ROUTES.kapital)).toBe('/kapital')
    expect(pathToRoute('/kapital')).toEqual({ kind: 'kapital' })
    expect(pathToRoute('/kapital/')).toEqual({ kind: 'kapital' })
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

// ---------------------------------------------------------------------------
// appViewFromUrl — URL override helper (PR #296 R1 fix).
//
// `appViewFromUrl(search)` reads `?view=` from a URL search string and
// returns the matching `AppView`, or `null` if the param is absent or
// unsupported. Only `?view=landing` is honoured — `?view=compare` and
// `?view=combine` are intentionally NOT supported so the in-app dashboard
// surfaces own those transitions.
// ---------------------------------------------------------------------------

describe('appViewFromUrl', () => {
  it('?view=landing returns "landing"', () => {
    expect(appViewFromUrl('?view=landing')).toBe('landing')
  })

  it('empty string returns null', () => {
    expect(appViewFromUrl('')).toBeNull()
  })

  it('?view=compare returns null (intentionally not honoured)', () => {
    expect(appViewFromUrl('?view=compare')).toBeNull()
  })

  it('?view=combine returns null (intentionally not honoured)', () => {
    expect(appViewFromUrl('?view=combine')).toBeNull()
  })

  it('"?" alone returns null', () => {
    expect(appViewFromUrl('?')).toBeNull()
  })

  it('?view=landing&extra=1 returns "landing" (extra params ignored)', () => {
    expect(appViewFromUrl('?view=landing&extra=1')).toBe('landing')
  })
})

// ---------------------------------------------------------------------------
// useRoute.navigate — SPA navigation (PR 290 R4 Codex P2).
//
// `navigate(target, search?)` must:
//   1. Push `routeToPath(target)` (no query) when `search` is omitted.
//      Backward compat with every existing call site (`AppHeader`,
//      `MobileNav`, `LegalLayout`, `KapitalPage`, `AngabenPage`, etc. all
//      pass only `target`).
//   2. Push `routeToPath(target) + search` when `search` is provided. This
//      is the new branch added for the `VergleichPage → /vergleich/details`
//      drill-in so the scenario id survives SPA navigation in addition to
//      Cmd-click / hard-reload (those carry the query via `href` already).
//
// The duplicate-URL guard inspects `pathname + search` so identical URLs
// don't trigger a redundant `pushState` (matches the prior pathname-only
// intent — we just have to look at the full URL now, not just the path).
// ---------------------------------------------------------------------------

describe('useRoute.navigate — SPA push semantics (PR 290 R4 Codex P2)', () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>
  let scrollToSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Start each test from `/` with no query so `pushState` is always
    // exercised (the duplicate-URL guard inside `navigate` would skip the
    // push otherwise). Using jsdom's real `window.history.replaceState`
    // keeps `window.location.pathname` and `window.location.search` in sync.
    window.history.replaceState(null, '', '/')
    pushStateSpy = vi.spyOn(window.history, 'pushState')
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    pushStateSpy.mockRestore()
    scrollToSpy.mockRestore()
    window.history.replaceState(null, '', '/')
  })

  it('navigate(target) — no search arg pushes pathname only (backward compat)', () => {
    const { result } = renderHook(() => useRoute())
    act(() => {
      result.current.navigate(ROUTES.vergleichDetail)
    })
    expect(pushStateSpy).toHaveBeenCalledTimes(1)
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/vergleich/details')
  })

  it('navigate(target, "?scenario=optimistisch") forwards the query on SPA push', () => {
    // This is the bug Codex called out: previously `navigate(target)` dropped
    // the query, so a primary-click drill-in landed on `/vergleich/details`
    // even though the `href` carried `?scenario=optimistisch`. The fix makes
    // SPA navigation preserve the scenario id alongside hard-reload / new-tab
    // paths.
    const { result } = renderHook(() => useRoute())
    act(() => {
      result.current.navigate(ROUTES.vergleichDetail, '?scenario=optimistisch')
    })
    expect(pushStateSpy).toHaveBeenCalledTimes(1)
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/vergleich/details?scenario=optimistisch')
  })

  it('navigate(target) does NOT push when the destination URL matches the current pathname + search', () => {
    // Duplicate-URL guard: if we are already at the target URL, no push.
    window.history.replaceState(null, '', '/vergleich/details?scenario=basis')
    const { result } = renderHook(() => useRoute())
    act(() => {
      result.current.navigate(ROUTES.vergleichDetail, '?scenario=basis')
    })
    expect(pushStateSpy).not.toHaveBeenCalled()
  })

  it('navigate(target, newSearch) pushes when only the search differs', () => {
    // If pathname matches but search differs, the URL is different — push.
    window.history.replaceState(null, '', '/vergleich/details?scenario=basis')
    const { result } = renderHook(() => useRoute())
    act(() => {
      result.current.navigate(ROUTES.vergleichDetail, '?scenario=optimistisch')
    })
    expect(pushStateSpy).toHaveBeenCalledTimes(1)
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/vergleich/details?scenario=optimistisch')
  })
})
