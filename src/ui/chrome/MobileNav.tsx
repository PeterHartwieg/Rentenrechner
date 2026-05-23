import { activeChromeNavId, type ChromeNavId } from './chromeRoutes'
import type { AppView, Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'

interface MobileNavProps {
  route: Route
  navigate: (target: Route, search?: string) => void
  /**
   * Resolved in-app view for route `/`. Drives the "Vergleich" / "Mein Plan"
   * label swap and active-tab disambiguation on `/`. Optional so existing
   * tests / SSR that don't yet thread it through still render — defaults
   * to the "Vergleich" label and the Startseite-highlighted baseline.
   */
  appView?: AppView | null
}

interface NavEntry {
  id: ChromeNavId
  /** Target route when the tab is clickable. `null` renders an inert placeholder. */
  target: Route | null
  /** Optional search string (must begin with `?`) appended to the href / passed to navigate. */
  search?: string
}

// 'home' (Start) carries `?view=landing` so the label keeps its promise:
// tapping Start always opens the landing/mode-picker, even for returning
// users with a saved compare/combine workspace. The 'compare' entry stays
// an inert placeholder on phone — the bottom-tab Vergleich tab does not yet
// ship as a functional control (desktop AppHeader's Vergleich is the live
// path). Its label still flips between "Vergleich" / "Mein Plan" based on
// saved mode so the chrome reads coherently.
const ITEMS: readonly NavEntry[] = [
  { id: 'home', target: ROUTES.home, search: '?view=landing' },
  { id: 'angaben', target: ROUTES.eingaben },
  { id: 'compare', target: null },
  { id: 'artikel', target: ROUTES.artikel },
  { id: 'method', target: ROUTES.methode },
]

/**
 * Render-time label for a mobile bottom-tab id. The `compare` tab swaps
 * between "Vergleich" (compare-mode) and "Mein Plan" (combine-mode)
 * mirroring the desktop AppHeader. Other labels are static.
 */
function navItemLabel(id: ChromeNavId, appView: AppView | null | undefined): string {
  if (id === 'home') return 'Start'
  if (id === 'angaben') return 'Angaben'
  if (id === 'compare') return appView === 'combine' ? 'Mein Plan' : 'Vergleich'
  if (id === 'artikel') return 'Artikel'
  return 'Methode'
}

/**
 * Bottom tab bar shown only on phone. Sticky-positioned via `position: fixed`
 * + `bottom: 0`; respects iOS safe-area inset so the row clears the home
 * indicator. Page bodies reserve matching `padding-bottom` via the
 * `--rw-mobile-nav-height` token so the bar never occludes content.
 *
 * Mount decision is made by AppShell using useViewport(); this component
 * does not query matchMedia itself and assumes it is only rendered on phone.
 */
export function MobileNav({ route, navigate, appView }: MobileNavProps) {
  // Read `window.location.search` synchronously each render so the
  // bottom-tab bar lights up the right tab when the URL carries
  // `?view=landing`. The earlier `useState`+`rentenwiki:navigated`
  // subscription went stale when App.tsx's `handleLandingChoice` cleared
  // the override via `history.replaceState` without dispatching the event
  // (Codex P2 on PR #298).
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const active = activeChromeNavId(route, search, appView)
  return (
    <nav className="rw-mobile-nav" aria-label="Mobile Hauptnavigation">
      {ITEMS.map((item) => {
        const isActive = item.id === active
        const className = `rw-mobile-nav__tab${isActive ? ' rw-mobile-nav__tab--active' : ''}`
        const label = navItemLabel(item.id, appView)
        if (item.target) {
          const target = item.target
          const search = item.search
          return (
            <a
              key={item.id}
              href={routeToPath(target) + (search ?? '')}
              aria-current={isActive ? 'page' : undefined}
              className={className}
              onClick={(event) => {
                if (!shouldUseSpaNavigation(event)) return
                event.preventDefault()
                if (search !== undefined) {
                  navigate(target, search)
                } else {
                  navigate(target)
                }
              }}
            >
              {label}
            </a>
          )
        }
        return (
          <span
            key={item.id}
            className={`${className} rw-mobile-nav__tab--placeholder`}
            aria-disabled="true"
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </span>
        )
      })}
    </nav>
  )
}
