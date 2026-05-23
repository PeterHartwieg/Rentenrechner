import { useState } from 'react'
import { useViewport } from './useViewport'
import { MobileSheet } from './MobileSheet'
import { activeChromeNavId, type ChromeNavId } from './chromeRoutes'
import type { AppView, Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'

interface NavTarget {
  route: Route
  search?: string
}

interface AppHeaderProps {
  /** Current route — drives which top-nav tab is highlighted. */
  route: Route
  /** Optional kicker (mono uppercase, above the H1). */
  kicker?: string
  /** Optional page H1 override. If omitted, no H1 is rendered (chrome only). */
  title?: string
  /** Editorial mode: cream background + serif H1. Default sober: white + sans. */
  editorial?: boolean
  /**
   * The resolved in-app view for route `/` (passed down from App.tsx's
   * `calculatorView` state). Drives the "Vergleich" / "Mein Plan" label
   * swap and disambiguates which tab lights up on `/` (dashboard vs
   * landing). Optional so the component renders for tests / SSR that
   * don't yet thread it through — defaults to Startseite-highlighted.
   */
  appView?: AppView | null
  /** Navigate to a route (passed in from useRoute). */
  navigate: (target: Route, search?: string) => void
}

const NAV_ITEM_IDS: ReadonlyArray<ChromeNavId> = [
  'home',
  'angaben',
  'compare',
  'artikel',
  'method',
]

/**
 * Render-time label for a nav tab id. The `compare` tab swaps between
 * "Vergleich" (compare-mode dashboard) and "Mein Plan" (combine-mode
 * dashboard) so the label always describes the destination the user is
 * about to land on. For a fresh user (`appView === 'landing'` or
 * undefined) it defaults to "Vergleich", since that is the more familiar
 * entry point and combine-mode users haven't picked their plan yet.
 */
function navItemLabel(id: ChromeNavId, appView: AppView | null | undefined): string {
  if (id === 'home') return 'Startseite'
  if (id === 'angaben') return 'Angaben'
  if (id === 'compare') return appView === 'combine' ? 'Mein Plan' : 'Vergleich'
  if (id === 'artikel') return 'Artikel'
  return 'Methode'
}

/**
 * Map a nav tab id to a `NavTarget` (route + optional search override).
 *
 *   - `home` (Startseite) carries `?view=landing` so it always opens the
 *     landing/mode-picker, even for returning users with a saved
 *     dashboard. Without the override App.tsx would fall through to
 *     `appViewFromMode(detectSavedMode())` and show the saved dashboard —
 *     which contradicts the label.
 *   - `compare` (Vergleich / Mein Plan) routes to bare `/` with no
 *     override so App.tsx's saved-mode logic chooses between the compare
 *     dashboard, the combine dashboard, or the landing page for fresh
 *     users.
 *   - 'angaben', 'method', 'artikel' route to their dedicated paths.
 */
function clickableTarget(id: ChromeNavId): NavTarget {
  if (id === 'home') return { route: ROUTES.home, search: '?view=landing' }
  if (id === 'angaben') return { route: ROUTES.eingaben }
  if (id === 'method') return { route: ROUTES.methode }
  if (id === 'artikel') return { route: ROUTES.artikel }
  // 'compare' — defer to saved-mode resolution in App.tsx.
  return { route: ROUTES.home }
}

/**
 * Top page chrome. Three internal viewport variants:
 *   - desktop: kicker + H1 + horizontal 5-tab nav.
 *   - tablet:  same layout, smaller type + tighter padding.
 *   - phone:   brand + hamburger row only (bottom tab bar handles the 5-way
 *              nav; hamburger opens MobileSheet for overflow links).
 *
 * R1.1: every nav tab now routes to a real target. The active-tab visual
 * treatment (which distinguishes compare from home, both rooted at `/`)
 * is the PR 2.1 concern; this file only owns the route plumbing.
 */
export function AppHeader({ route, kicker, title, editorial, appView, navigate }: AppHeaderProps) {
  const viewport = useViewport()
  const [sheetOpen, setSheetOpen] = useState(false)
  // Read `window.location.search` synchronously each render so the
  // Startseite tab lights up when the URL carries `?view=landing`. The
  // earlier `useState`+`rentenwiki:navigated` subscription went stale when
  // `handleLandingChoice` in App.tsx cleared the override via
  // `history.replaceState` without dispatching the event (Codex P2 on
  // PR #298). The synchronisation point is the parent re-render triggered
  // by `setAppView` — by the time React re-renders AppShell → AppHeader,
  // `window.location.search` already reflects the new URL. No event
  // subscription needed.
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const active = activeChromeNavId(route, search, appView)

  if (viewport === 'phone') {
    return (
      <>
        <header
          className={`rw-app-header rw-app-header--phone ${editorial ? 'rw-app-header--editorial' : ''}`.trim()}
        >
          <span className="rw-app-header__brand">RentenWiki</span>
          <button
            type="button"
            className="rw-app-header__menu-btn"
            aria-label="Menü öffnen"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(true)}
          >
            ≡
          </button>
        </header>
        {(kicker || title) && (
          <div
            className={`rw-app-header-body rw-app-header-body--phone ${editorial ? 'rw-app-header-body--editorial' : ''}`.trim()}
          >
            {kicker && <div className="rw-app-header__kicker">{kicker}</div>}
            {title && <h1 className="rw-app-header__title">{title}</h1>}
          </div>
        )}
        <MobileSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          navigate={navigate}
          route={route}
        />
      </>
    )
  }

  const isTablet = viewport === 'tablet'

  return (
    <header
      className={`rw-app-header rw-app-header--${isTablet ? 'tablet' : 'desktop'} ${editorial ? 'rw-app-header--editorial' : ''}`.trim()}
    >
      <div className="rw-app-header__top">
        <div className="rw-app-header__title-row">
          {kicker && <div className="rw-app-header__kicker">{kicker}</div>}
          {title && <h1 className="rw-app-header__title">{title}</h1>}
        </div>
        <nav className="rw-app-header__nav" aria-label="Hauptnavigation">
          {NAV_ITEM_IDS.map((id) => {
            const isActive = id === active
            const target = clickableTarget(id)
            const href = routeToPath(target.route) + (target.search ?? '')
            return (
              <a
                key={id}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`rw-app-header__nav-item${isActive ? ' rw-app-header__nav-item--active' : ''}`}
                onClick={(event) => {
                  if (!shouldUseSpaNavigation(event)) return
                  event.preventDefault()
                  if (target.search !== undefined) {
                    navigate(target.route, target.search)
                  } else {
                    navigate(target.route)
                  }
                }}
              >
                {navItemLabel(id, appView)}
              </a>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
