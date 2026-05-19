import { routeToNavId, type ChromeNavId } from './chromeRoutes'
import type { Route } from '../../app/useRoute'

interface MobileNavProps {
  route: Route
  navigate: (target: Route) => void
}

interface NavEntry {
  id: ChromeNavId
  label: string
  clickable: boolean
}

const ITEMS: readonly NavEntry[] = [
  { id: 'home', label: 'Start', clickable: true },
  { id: 'plan', label: 'Plan', clickable: false },
  { id: 'compare', label: 'Vergleich', clickable: false },
  { id: 'artikel', label: 'Artikel', clickable: false },
  { id: 'method', label: 'Methode', clickable: false },
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
        if (item.clickable) {
          return (
            <a
              key={item.id}
              href="/"
              className={className}
              onClick={(event) => {
                event.preventDefault()
                navigate('/')
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
