import { useEffect, useState } from 'react'
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../storageKeys'
import { hasShareStateInUrl } from '../utils/urlShareDetect'
import { publicRouteRegistry } from '../seo/publicRouteRegistry'

// Minimal in-app router. Two static legal pages plus the calculator at /.
// We avoid pulling in react-router because the only routes we need are these
// three and the framework dependency would be larger than the implementation.
//
// Static-host SPA fallback (Cloudflare Workers / Vercel / Netlify) is required
// for direct loads of /impressum or /datenschutz. See `public/_redirects`.

export type Route =
  | '/'
  | '/artikel'
  | '/methode'
  | '/impressum'
  | '/datenschutz'
  | '/rentenluecke-rechner'
  | '/bav-rechner'
  | '/etf-vs-bav'
  | '/riester-rechner'
  | '/altersvorsorgedepot-rechner'
  | '/riester-vs-altersvorsorgedepot'
  | '/basisrente-rechner'
  | '/private-rentenversicherung-rechner'
  | '/rente-netto-berechnen'
  | '/altersvorsorgeprodukte-vergleichen'
  | '/404'

const KNOWN_ROUTES: Route[] = [
  '/',
  '/artikel',
  '/methode',
  '/impressum',
  '/datenschutz',
  '/rentenluecke-rechner',
  '/bav-rechner',
  '/etf-vs-bav',
  '/riester-rechner',
  '/altersvorsorgedepot-rechner',
  '/riester-vs-altersvorsorgedepot',
  '/basisrente-rechner',
  '/private-rentenversicherung-rechner',
  '/rente-netto-berechnen',
  '/altersvorsorgeprodukte-vergleichen',
  '/404',
]

/**
 * Normalise a pathname to a known `Route`. Unknown paths fall through to
 * `/404` (NOT `/` as before issue #02 — the legacy `404.html = index.html`
 * copy made every unknown URL look like the calculator). The CDN's actual
 * 404 response keeps the HTTP status correct; this just renders the right
 * body when the prerendered shell is served.
 */
export function normalizeRoute(pathname: string): Route {
  // Strip a trailing slash unless the path is just "/"
  const trimmed = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname
  return (KNOWN_ROUTES as string[]).includes(trimmed) ? (trimmed as Route) : '/404'
}

// ---------------------------------------------------------------------------
// Landing vs dashboard decision (Group G issue 04 — M2.1 + M2.2)
// ---------------------------------------------------------------------------

/**
 * The in-app "view" for route `/`. Distinct from the URL Route type — this
 * controls what the Calculator renders inside `/` based on saved state.
 *
 * - 'landing': no saved state exists → show the two-CTA landing page.
 * - 'compare': returning user with mode === 'compare' (or legacy v1 state) → compare dashboard.
 * - 'combine': returning user with mode === 'combine' → combine dashboard.
 */
export type AppView = 'landing' | 'compare' | 'combine'

/**
 * Read the workspace mode from localStorage (v2 key first, then v1 key).
 * Returns null when no state is found (new user → landing).
 *
 * This is a pure function so it can be called from tests and from the hook
 * without triggering React renders.
 *
 * Does NOT call loadSavedWorkspace() (which runs the full migration pipeline)
 * to keep the initial-render fast; we only need the `mode` field, not the full
 * validated workspace.
 */
export function detectSavedMode(): 'compare' | 'combine' | null {
  try {
    // Share-URL carries state: if present, treat as returning user in compare mode
    // (share-URLs today are always compare-mode singleton exports). We only
    // check for the presence of `?s=...` here — the full
    // parse/validate path lives in `urlShare.readUrlState` and stays inside
    // the lazy Calculator chunk.
    if (hasShareStateInUrl()) return 'compare'

    // V2 key: check mode field directly (fast path, no full migration).
    const rawV2 = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY_V2)
      : null
    if (rawV2) {
      try {
        const parsed = JSON.parse(rawV2) as Record<string, unknown>
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const mode = parsed.mode
          if (mode === 'combine' || mode === 'compare') return mode
          // v2 key present but no valid mode: treat as returning compare user.
          return 'compare'
        }
      } catch {
        // corrupt JSON — fall through
      }
    }

    // V1 key: if present, it's a legacy singleton save → compare mode.
    const rawV1 = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY_V1)
      : null
    if (rawV1) return 'compare'

    return null
  } catch {
    return null
  }
}

/**
 * Derive the AppView for route `/` from a saved mode (or absence of one).
 * Pure function — easy to unit-test without mocking hooks.
 */
export function appViewFromMode(mode: 'compare' | 'combine' | null): AppView {
  if (mode === null) return 'landing'
  if (mode === 'combine') return 'combine'
  return 'compare'
}

export function useRoute(): { route: Route; navigate: (target: Route) => void } {
  const [route, setRoute] = useState<Route>(() => {
    if (typeof window === 'undefined') return '/'
    return normalizeRoute(window.location.pathname)
  })

  useEffect(() => {
    function onPopState() {
      setRoute(normalizeRoute(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const entry = (publicRouteRegistry as Record<string, { title?: string }>)[route]
    if (entry?.title) document.title = entry.title
  }, [route])

  function navigate(target: Route): void {
    if (typeof window === 'undefined') return
    if (window.location.pathname !== target) {
      window.history.pushState(null, '', target)
    }
    setRoute(target)
    window.scrollTo(0, 0)
  }

  return { route, navigate }
}
