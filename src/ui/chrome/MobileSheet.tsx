import { useEffect } from 'react'
import type { AppView, Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'
import { SUPPORT_PAGE_URL } from '../../content/support'
import { activeChromeNavId, type ChromeNavId } from './chromeRoutes'

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  navigate: (target: Route, search?: string) => void
  appView?: AppView | null
  /**
   * Current route. Used to mark the matching sheet item as active so the
   * overflow menu communicates "you are here" — matches the Sober D
   * canvas left-border accent pattern (responsive-views.jsx article TOC).
   * Optional so direct tests that don't care about the active state can
   * omit it; in that case no item is highlighted.
   */
  route?: Route
}

interface SheetItem {
  label: string
  route?: Route
  navId?: ChromeNavId
  search?: string
  href?: string
}

const ITEMS: readonly SheetItem[] = [
  { label: 'Start', route: ROUTES.home, search: '?view=landing', navId: 'home' },
  { label: 'Angaben', route: ROUTES.eingaben, navId: 'angaben' },
  { label: 'Artikel', route: ROUTES.artikel, navId: 'artikel' },
  { label: 'Methode', route: ROUTES.methode, navId: 'method' },
  { label: 'Datenschutz', route: ROUTES.datenschutz },
  { label: 'Impressum', route: ROUTES.impressum },
  { label: 'GitHub', href: 'https://github.com/PeterHartwieg/Rentenrechner' },
  { label: 'Projekt unterstützen', href: SUPPORT_PAGE_URL },
]

/**
 * Slide-up sheet from the bottom of the viewport, used as the overflow
 * destination for hamburger-menu links on phone. Mein Plan and Vergleich
 * live in the bottom MobileNav; all secondary destinations land here.
 * External http(s) hrefs still open in a new tab.
 */
export function MobileSheet({ open, onClose, navigate, route, appView }: MobileSheetProps) {
  useEffect(() => {
    if (!open) return
    function onEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null

  const search = typeof window !== 'undefined' ? window.location.search : ''
  const active = route ? activeChromeNavId(route, search, appView) : null

  function handleItemClick(item: SheetItem) {
    if (item.route) {
      if (item.search !== undefined) navigate(item.route, item.search)
      else navigate(item.route)
      onClose()
      return
    }
    if (item.href && item.href.startsWith('http')) {
      window.open(item.href, '_blank', 'noopener,noreferrer')
    }
    onClose()
  }

  return (
    <div className="rw-mobile-sheet" role="dialog" aria-modal="true" aria-label="Weitere Menüpunkte">
      <button
        type="button"
        className="rw-mobile-sheet__backdrop"
        aria-label="Menü schließen"
        onClick={onClose}
      />
      <div className="rw-mobile-sheet__panel">
        <div className="rw-mobile-sheet__handle" aria-hidden="true" />
        <ul className="rw-mobile-sheet__list">
          {ITEMS.map((item) => {
            const isActive =
              route !== undefined &&
              item.route !== undefined &&
              (item.navId ? item.navId === active : item.route.kind === route.kind)
            const className = `rw-mobile-sheet__item${
              isActive ? ' rw-mobile-sheet__item--active' : ''
            }`
            return (
              <li key={item.label}>
                <button
                  type="button"
                  className={className}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleItemClick(item)}
                >
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
