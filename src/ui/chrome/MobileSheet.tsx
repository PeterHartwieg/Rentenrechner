import { useEffect } from 'react'
import type { Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  navigate: (target: Route) => void
}

interface SheetItem {
  label: string
  route?: Route
  href?: string
}

const ITEMS: readonly SheetItem[] = [
  { label: 'Methode', route: ROUTES.methode },
  { label: 'Annahmen', route: ROUTES.eingaben },
  { label: 'Datenschutz', route: ROUTES.datenschutz },
  { label: 'Impressum', route: ROUTES.impressum },
  { label: 'GitHub', href: 'https://github.com/PeterHartwieg/Rentenrechner' },
  { label: 'Spenden', href: 'https://github.com/sponsors/PeterHartwieg' },
]

/**
 * Slide-up sheet from the bottom of the viewport, used as the overflow
 * destination for hamburger-menu links on phone. The five most important
 * destinations live in the bottom MobileNav; everything else (legal,
 * external) lands here.
 *
 * R1.1: Methode + Annahmen now route to `/methode` and `/eingaben`
 * respectively (Annahmen folds into Section 4 of /eingaben per PR 5).
 * External http(s) hrefs still open in a new tab.
 */
export function MobileSheet({ open, onClose, navigate }: MobileSheetProps) {
  useEffect(() => {
    if (!open) return
    function onEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null

  function handleItemClick(item: SheetItem) {
    if (item.route) {
      navigate(item.route)
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
          {ITEMS.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                className="rw-mobile-sheet__item"
                onClick={() => handleItemClick(item)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
