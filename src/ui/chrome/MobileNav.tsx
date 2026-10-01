import { activeChromeNavId, type ChromeNavId } from './chromeRoutes'
import type { AppView, Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'

interface MobileNavProps {
  route: Route
  navigate: (target: Route, search?: string) => void
  /**
   * Resolved in-app view for route `/`. Distinguishes the plan from landing;
   * landing and secondary routes leave both primary tabs inactive.
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

// Secondary destinations live in MobileSheet. These two tabs always keep
// their labels and routes, regardless of the saved mode.
const ITEMS: readonly NavEntry[] = [
  { id: 'plan', target: ROUTES.home },
  { id: 'compare', target: ROUTES.vergleich },
]

/**
 * Render-time label for a mobile bottom-tab id. All labels are static and
 * mirror the desktop AppHeader; "Start" is the phone-length form of
 * "Startseite".
 */
function navItemLabel(id: ChromeNavId): string {
  if (id === 'home') return 'Start'
  if (id === 'angaben') return 'Angaben'
  if (id === 'plan') return 'Mein Plan'
  if (id === 'compare') return 'Vergleich'
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
        const label = navItemLabel(item.id)
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
