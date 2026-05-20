import { routeToNavId, type ChromeNavId } from './chromeRoutes'
import type { Route } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'

interface MobileNavProps {
  route: Route
  navigate: (target: Route) => void
}

interface NavEntry {
  id: ChromeNavId
  label: string
  /** Target route when the tab is clickable. `null` renders an inert placeholder. */
  target: Route | null
}

// PR 5: bottom tab bar gets the Angaben tab wired to /eingaben. "Plan" /
// "Annahmen" placeholders are removed (Annahmen folds into /eingaben § 4;
// Mein Plan ships in PR 6). "Vergleich" remains a placeholder until PR 9.
const ITEMS: readonly NavEntry[] = [
  { id: 'home', label: 'Start', target: '/' },
  { id: 'angaben', label: 'Angaben', target: '/eingaben' },
  { id: 'compare', label: 'Vergleich', target: null },
  { id: 'artikel', label: 'Artikel', target: '/artikel' },
  { id: 'method', label: 'Methode', target: '/methode' },
]

/**
 * Bottom tab bar shown only on phone. Sticky-positioned via `position: fixed`
 * + `bottom: 0`; respects iOS safe-area inset so the row clears the home
 * indicator. Page bodies reserve matching `padding-bottom` via the
 * `--rw-mobile-nav-height` token so the bar never occludes content.
 *
 * Mount decision is made by AppShell using useViewport(); this component
 * does not query matchMedia itself and assumes it is only rendered on phone.
 */
export function MobileNav({ route, navigate }: MobileNavProps) {
  const active = routeToNavId(route)
  return (
    <nav className="rw-mobile-nav" aria-label="Mobile Hauptnavigation">
      {ITEMS.map((item) => {
        const isActive = item.id === active
        const className = `rw-mobile-nav__tab${isActive ? ' rw-mobile-nav__tab--active' : ''}`
        if (item.target) {
          const target = item.target
          return (
            <a
              key={item.id}
              href={target}
              className={className}
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
            className={`${className} rw-mobile-nav__tab--placeholder`}
            aria-disabled="true"
          >
            {item.label}
          </span>
        )
      })}
    </nav>
  )
}
