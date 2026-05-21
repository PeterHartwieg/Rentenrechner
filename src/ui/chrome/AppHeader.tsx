import { useState } from 'react'
import { useViewport } from './useViewport'
import { MobileSheet } from './MobileSheet'
import { activeChromeNavId, type ChromeNavId } from './chromeRoutes'
import type { Route } from '../../app/useRoute'
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
  /** Navigate to a route (passed in from useRoute). */
  navigate: (target: Route, search?: string) => void
}

// PR 5: the previously-placeholder "Mein Plan" tab is removed from the chrome
// nav and replaced with the active "Angaben" tab routing to `/eingaben`. The
// "Annahmen" tab from the pre-redesign nav also collapses here (it now folds
// into Section 4 of /eingaben). R1.1: the "Vergleich" tab now routes to the
// `/` Calculator view (which renders VergleichPage when saved mode = compare);
// this is the canvas intent and avoids inventing a `/mein-plan` route.
const NAV_ITEMS: ReadonlyArray<{ id: ChromeNavId; label: string }> = [
  { id: 'home', label: 'Startseite' },
  { id: 'angaben', label: 'Angaben' },
  { id: 'compare', label: 'Vergleich' },
  { id: 'artikel', label: 'Artikel' },
  { id: 'method', label: 'Methode' },
]

/**
 * Map a nav tab id to a `NavTarget` (route + optional search override).
 * The 'home' tab returns `/`; 'artikel' returns `/artikel` (PR 3);
 * 'method' returns `/methode` (PR 4); 'angaben' returns `/eingaben` (PR 5).
 * 'compare' returns `{ route: ROUTES.home, search: '?view=landing' }` so
 * that clicking the Vergleich tab always opens the landing/mode-picker,
 * regardless of any saved mode — fixes the non-deterministic destination
 * flagged by Codex P1 + P2 in PR #296. The `?view=landing` param is read
 * by `appViewFromUrl` in `App.tsx` and wins over `detectSavedMode()`.
 */
function clickableTarget(id: ChromeNavId): NavTarget {
  if (id === 'home') return { route: ROUTES.home }
  if (id === 'artikel') return { route: ROUTES.artikel }
  if (id === 'method') return { route: ROUTES.methode }
  if (id === 'angaben') return { route: ROUTES.eingaben }
  // 'compare' — forces landing/mode-picker via URL override (PR #296 R1 fix).
  return { route: ROUTES.home, search: '?view=landing' }
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
export function AppHeader({ route, kicker, title, editorial, navigate }: AppHeaderProps) {
  const viewport = useViewport()
  const [sheetOpen, setSheetOpen] = useState(false)
  // Read `window.location.search` synchronously each render so the Vergleich
  // tab lights up when the URL carries `?view=landing` (PR #296 R1 override).
  // Caching the search string in `useState` + subscribing to
  // `rentenwiki:navigated` went stale when `handleLandingChoice` in
  // `App.tsx` cleared the override via `history.replaceState` without
  // dispatching the event (Codex P2 on PR #298). The synchronisation point
  // is the parent re-render triggered by `setAppView` — by the time React
  // re-renders AppShell → AppHeader, `window.location.search` already
  // reflects the new URL. No event subscription needed.
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const active = activeChromeNavId(route, search)

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
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === active
            const target = clickableTarget(item.id)
            const href = routeToPath(target.route) + (target.search ?? '')
            return (
              <a
                key={item.id}
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
                {item.label}
              </a>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
