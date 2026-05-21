import { useEffect, useState } from 'react'
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../storageKeys'
import { hasShareStateInUrl } from '../utils/urlShareDetect'
import { publicRouteRegistry } from '../seo/publicRouteRegistry'

// Minimal in-app router. Static routes plus the dynamic `/vertrag/:instanceId`
// drill-in introduced in PR 7. We avoid pulling in react-router because the
// route count is small and we want full control over prerender / hydration
// behaviour.
//
// Static-host SPA fallback (Cloudflare Workers / Vercel / Netlify) is required
// for direct loads of any non-root URL. Workers serves prerendered HTML for
// every static route in `publicRouteRegistry`; `/vertrag/:instanceId` is
// dynamic (depends on workspace state) and is intentionally NOT prerendered.

// ---------------------------------------------------------------------------
// Route — tagged-union form (PR 7).
//
// Previously `Route` was a string union of literal pathnames. PR 7 promotes
// it to a discriminated union so the dynamic `/vertrag/:instanceId` route
// can carry its `instanceId` payload type-safely. Conversion between routes
// and URLs goes through `pathToRoute` / `routeToPath`; callers use `ROUTES`
// helpers for ergonomic construction instead of object literals.
// ---------------------------------------------------------------------------

export type Route =
  | { kind: 'home' }
  | { kind: 'artikel' }
  | { kind: 'methode' }
  | { kind: 'eingaben' }
  | { kind: 'impressum' }
  | { kind: 'datenschutz' }
  | { kind: 'rentenluecke-rechner' }
  | { kind: 'bav-rechner' }
  | { kind: 'etf-vs-bav' }
  | { kind: 'riester-rechner' }
  | { kind: 'altersvorsorgedepot-rechner' }
  | { kind: 'riester-vs-altersvorsorgedepot' }
  | { kind: 'basisrente-rechner' }
  | { kind: 'private-rentenversicherung-rechner' }
  | { kind: 'rente-netto-berechnen' }
  | { kind: 'altersvorsorgeprodukte-vergleichen' }
  | { kind: 'vertrag'; instanceId: string }
  | { kind: 'kapital' }
  | { kind: 'vergleich-detail' }
  | { kind: 'not-found' }

export type RouteKind = Route['kind']

/**
 * Ergonomic constructors. Static routes are pre-allocated singletons; the
 * `vertrag` factory builds a fresh variant per instance id. Use these in
 * `navigate(...)` call-sites and test fixtures rather than spelling out the
 * variant literals.
 */
export const ROUTES = {
  home: { kind: 'home' } as Route,
  artikel: { kind: 'artikel' } as Route,
  methode: { kind: 'methode' } as Route,
  eingaben: { kind: 'eingaben' } as Route,
  impressum: { kind: 'impressum' } as Route,
  datenschutz: { kind: 'datenschutz' } as Route,
  rentenlueckeRechner: { kind: 'rentenluecke-rechner' } as Route,
  bavRechner: { kind: 'bav-rechner' } as Route,
  etfVsBav: { kind: 'etf-vs-bav' } as Route,
  riesterRechner: { kind: 'riester-rechner' } as Route,
  altersvorsorgedepotRechner: { kind: 'altersvorsorgedepot-rechner' } as Route,
  riesterVsAltersvorsorgedepot: { kind: 'riester-vs-altersvorsorgedepot' } as Route,
  basisrenteRechner: { kind: 'basisrente-rechner' } as Route,
  privateRentenversicherungRechner: { kind: 'private-rentenversicherung-rechner' } as Route,
  renteNettoBerechnen: { kind: 'rente-netto-berechnen' } as Route,
  altersvorsorgeprodukteVergleichen: { kind: 'altersvorsorgeprodukte-vergleichen' } as Route,
  vertrag: (instanceId: string): Route => ({ kind: 'vertrag', instanceId }),
  kapital: { kind: 'kapital' } as Route,
  vergleichDetail: { kind: 'vergleich-detail' } as Route,
  notFound: { kind: 'not-found' } as Route,
} as const

/**
 * Render a `Route` to its canonical URL pathname. The dynamic `vertrag`
 * route URL-encodes the instance id (instance ids contain colons like
 * `bav-...:1f3a` which would otherwise be ambiguous in path-segment parsing).
 */
export function routeToPath(route: Route): string {
  switch (route.kind) {
    case 'home': return '/'
    case 'artikel': return '/artikel'
    case 'methode': return '/methode'
    case 'eingaben': return '/eingaben'
    case 'impressum': return '/impressum'
    case 'datenschutz': return '/datenschutz'
    case 'rentenluecke-rechner': return '/rentenluecke-rechner'
    case 'bav-rechner': return '/bav-rechner'
    case 'etf-vs-bav': return '/etf-vs-bav'
    case 'riester-rechner': return '/riester-rechner'
    case 'altersvorsorgedepot-rechner': return '/altersvorsorgedepot-rechner'
    case 'riester-vs-altersvorsorgedepot': return '/riester-vs-altersvorsorgedepot'
    case 'basisrente-rechner': return '/basisrente-rechner'
    case 'private-rentenversicherung-rechner': return '/private-rentenversicherung-rechner'
    case 'rente-netto-berechnen': return '/rente-netto-berechnen'
    case 'altersvorsorgeprodukte-vergleichen': return '/altersvorsorgeprodukte-vergleichen'
    case 'vertrag': return `/vertrag/${encodeURIComponent(route.instanceId)}`
    case 'kapital': return '/kapital'
    case 'vergleich-detail': return '/vergleich/details'
    case 'not-found': return '/404'
    default: {
      const _exhaustive: never = route
      return _exhaustive
    }
  }
}

/**
 * Parse a `pathname` into a `Route`. Unknown paths fall through to
 * `{ kind: 'not-found' }` (NOT 'home' as before issue #02 — the legacy
 * `404.html = index.html` copy made every unknown URL look like the calculator).
 * The CDN's actual 404 response keeps the HTTP status correct; this just
 * renders the right body when the prerendered shell is served.
 *
 * The dynamic `/vertrag/:instanceId` segment is URL-decoded so colon-bearing
 * instance ids round-trip cleanly through `routeToPath` → `pathToRoute`.
 */
export function pathToRoute(pathname: string): Route {
  const trimmed = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname

  // Dynamic match first — `/vertrag/<instanceId>` with any non-empty payload.
  // `decodeURIComponent` throws `URIError` on malformed percent-encoded
  // sequences (e.g. `/vertrag/%E0%A4%A`). Without the guard the throw would
  // bubble out of `pathToRoute`, crashing the initial render or `popstate`
  // listener before the 404 fallback could fire. The empty state is the
  // correct surface for an unparseable id, same as for a well-formed id
  // that simply does not exist in the workspace.
  const vertragMatch = trimmed.match(/^\/vertrag\/(.+)$/)
  if (vertragMatch) {
    try {
      return { kind: 'vertrag', instanceId: decodeURIComponent(vertragMatch[1]) }
    } catch {
      return ROUTES.notFound
    }
  }

  switch (trimmed) {
    case '/': return ROUTES.home
    case '/artikel': return ROUTES.artikel
    case '/methode': return ROUTES.methode
    case '/eingaben': return ROUTES.eingaben
    case '/impressum': return ROUTES.impressum
    case '/datenschutz': return ROUTES.datenschutz
    case '/rentenluecke-rechner': return ROUTES.rentenlueckeRechner
    case '/bav-rechner': return ROUTES.bavRechner
    case '/etf-vs-bav': return ROUTES.etfVsBav
    case '/riester-rechner': return ROUTES.riesterRechner
    case '/altersvorsorgedepot-rechner': return ROUTES.altersvorsorgedepotRechner
    case '/riester-vs-altersvorsorgedepot': return ROUTES.riesterVsAltersvorsorgedepot
    case '/basisrente-rechner': return ROUTES.basisrenteRechner
    case '/private-rentenversicherung-rechner': return ROUTES.privateRentenversicherungRechner
    case '/rente-netto-berechnen': return ROUTES.renteNettoBerechnen
    case '/altersvorsorgeprodukte-vergleichen': return ROUTES.altersvorsorgeprodukteVergleichen
    case '/kapital': return ROUTES.kapital
    case '/vergleich/details': return ROUTES.vergleichDetail
    case '/404': return ROUTES.notFound
    default: return ROUTES.notFound
  }
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

/**
 * Read an explicit `?view=` override from a URL search string. Returns
 * the requested `AppView` when the parameter is present and valid,
 * otherwise `null`. Used so that the Vergleich tab in the chrome can
 * deterministically open the landing/mode-picker view regardless of
 * any saved mode — addresses the "non-deterministic destination"
 * concern raised by the Codex review of PR #296.
 *
 * Today the only supported override is `?view=landing` (force the
 * picker). `?view=compare` / `?view=combine` are intentionally NOT
 * supported — the in-app dashboard surfaces own those transitions.
 */
export function appViewFromUrl(search: string): AppView | null {
  // Accept both raw query strings and full URL strings. `URLSearchParams`
  // treats a leading "?" as part of the first key on some platforms;
  // strip it defensively.
  const trimmed = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(trimmed)
  const view = params.get('view')
  if (view === 'landing') return 'landing'
  return null
}

export function useRoute(): { route: Route; navigate: (target: Route, search?: string) => void } {
  const [route, setRoute] = useState<Route>(() => {
    if (typeof window === 'undefined') return ROUTES.home
    return pathToRoute(window.location.pathname)
  })

  useEffect(() => {
    function onPopState() {
      setRoute(pathToRoute(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    // `publicRouteRegistry` is keyed by canonical pathname; convert the
    // active tagged variant to its URL before lookup. Dynamic routes such
    // as `/vertrag/:instanceId` are not registered (no SEO surface) and
    // simply do not update the document title — the page itself sets a
    // sensible title once the instance is resolved.
    const path = routeToPath(route)
    const entry = (publicRouteRegistry as Record<string, { title?: string }>)[path]
    if (entry?.title) document.title = entry.title
  }, [route])

  /**
   * SPA navigation primitive. `target` is the destination route; the optional
   * `search` is a query string that begins with `?` (e.g. `?scenario=basis`)
   * — the caller composes it (typically via `URLSearchParams` or a template
   * literal) and this helper stays agnostic about which params are present.
   *
   * PR 290 R4 Codex P2 fix: the previous signature ignored search params,
   * which dropped `?scenario=<id>` on SPA navigation from `VergleichPage` to
   * `/vergleich/details`. The drill-in `href` carries the scenario id but the
   * primary-click handler used to call `navigate(target)` without it, pushing
   * a URL with no query — so a reload/bookmark/share after SPA navigation
   * silently fell back to `basis` instead of the selected scenario. Accepting
   * the search arg keeps the URL the source of truth for shareable state in
   * every navigation path (hard reload, new tab, AND SPA navigate).
   *
   * The comparison guard inspects `pathname + search` so identical URLs are
   * not re-pushed (matches the prior pathname-only intent).
   */
  function navigate(target: Route, search?: string): void {
    if (typeof window === 'undefined') return
    const path = routeToPath(target)
    const url = search ? `${path}${search}` : path
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, '', url)
    }
    setRoute(target)
    window.scrollTo(0, 0)
  }

  return { route, navigate }
}
