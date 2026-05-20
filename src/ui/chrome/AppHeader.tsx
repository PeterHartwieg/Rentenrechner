import { useState } from 'react'
import { useViewport } from './useViewport'
import { MobileSheet } from './MobileSheet'
import { routeToNavId, type ChromeNavId } from './chromeRoutes'
import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'

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
  navigate: (target: Route) => void
}

// PR 5: the previously-placeholder "Mein Plan" tab is removed from the chrome
// nav and replaced with the active "Angaben" tab routing to `/eingaben`. The
// "Annahmen" tab from the pre-redesign nav also collapses here (it now folds
// into Section 4 of /eingaben). "Vergleich" remains a placeholder until PR 9.
const NAV_ITEMS: ReadonlyArray<{ id: ChromeNavId; label: string }> = [
  { id: 'home', label: 'Startseite' },
  { id: 'angaben', label: 'Angaben' },
  { id: 'compare', label: 'Vergleich' },
  { id: 'artikel', label: 'Artikel' },
  { id: 'method', label: 'Methode' },
]

/**
 * Map a nav tab id to a real `Route` target if one exists. Returns `null`
 * for placeholder tabs (`compare` until its route ships in PR 9). The
 * 'home' tab returns `/`; 'artikel' returns `/artikel' (PR 3); 'method'
 * returns `/methode` (PR 4); 'angaben' returns `/eingaben` (PR 5).
 */
function clickableTarget(id: ChromeNavId): Route | null {
  if (id === 'home') return ROUTES.home
  if (id === 'artikel') return ROUTES.artikel
  if (id === 'method') return ROUTES.methode
  if (id === 'angaben') return ROUTES.eingaben
  return null
}

/**
 * Top page chrome. Three internal viewport variants:
 *   - desktop: kicker + H1 + horizontal 5-tab nav.
 *   - tablet:  same layout, smaller type + tighter padding.
 *   - phone:   brand + hamburger row only (bottom tab bar handles the 5-way
 *              nav; hamburger opens MobileSheet for overflow links).
 *
 * Routes other than Startseite are visual placeholders until PRs 3–5 wire
 * their target routes (`/artikel`, `/methode`, ...). The label is rendered
 * as a span (not an anchor) so users don't think they're broken.
 */
export function AppHeader({ route, kicker, title, editorial, navigate }: AppHeaderProps) {
  const viewport = useViewport()
  const active = routeToNavId(route)
  const [sheetOpen, setSheetOpen] = useState(false)

  if (viewport === 'phone') {
    return (
      <>
        <header
          className={`rw-app-header rw-app-header--phone ${editorial ? 'rw-app-header--editorial' : ''}`.trim()}
        >
          <span className="rw-app-header__brand">RentenWiki</span>
          <span className="rw-app-header__brand-meta">seit 2024 · gemeinnützig</span>
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
        <MobileSheet open={sheetOpen} onClose={() => setSheetOpen(false)} navigate={navigate} />
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
            if (target) {
              return (
                <a
                  key={item.id}
                  href={routeToPath(target)}
                  className={`rw-app-header__nav-item${isActive ? ' rw-app-header__nav-item--active' : ''}`}
                  onClick={(event) => {
                    if (!shouldUseSpaNavigation(event)) return
                    event.preventDefault()
                    navigate(target)
                  }}
                >
                  {item.label}
                </a>
              )
            }
            return (
              <span
                key={item.id}
                className={`rw-app-header__nav-item rw-app-header__nav-item--placeholder${isActive ? ' rw-app-header__nav-item--active' : ''}`}
                title="Wird in einer späteren Phase aktiviert"
                aria-disabled="true"
              >
                {item.label}
              </span>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
