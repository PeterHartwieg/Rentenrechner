import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useViewport } from './useViewport'

interface RightRailAccordionProps {
  /** Aside label, e.g. "Deine Angaben". */
  label: string
  /** Count shown next to label on phone strip, e.g. number of input fields. */
  count?: number
  /** Aside content. Same children render on desktop (aside) and phone (drawer). */
  children: ReactNode
  /** Desktop aside width in px (defaults to 320). Tablet uses 220–240 internally. */
  desktopWidth?: number
}

/**
 * Two-shape container that powers the right-hand side area on each
 * redesigned page. Reused across PRs 5/6/7/8 — get the API right here.
 *
 * - Desktop / tablet: fixed-width aside, always visible.
 * - Phone: collapses to a sticky bottom strip ("▸ Deine Angaben (N Werte) ▾")
 *   that expands to a full-height drawer when tapped. Strip sits ABOVE the
 *   MobileNav tab bar; drawer occupies the area above the tab bar too.
 */
export function RightRailAccordion({ label, count, children, desktopWidth = 320 }: RightRailAccordionProps) {
  const viewport = useViewport()
  const [open, setOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const stripButtonRef = useRef<HTMLButtonElement>(null)
  const isFirstRender = useRef(true)

  // Focus management for the phone drawer. The drawer is rendered as
  // `role="region"` (not a modal dialog) — no focus trap or scroll lock —
  // but keyboard users still need a one-keystroke dismiss (Esc) and a
  // continuous focus path: opening sends focus to the close button, and
  // closing returns focus to the strip trigger that opened it.
  // The first-render guard prevents the closed→closed mount from stealing
  // focus when the component first renders.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      if (!open) return
    }
    if (open) {
      closeButtonRef.current?.focus()
      function onKey(event: KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false)
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }
    stripButtonRef.current?.focus()
  }, [open])

  if (viewport === 'phone') {
    return (
      <>
        <button
          ref={stripButtonRef}
          type="button"
          className="rw-right-rail__strip"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="rw-right-rail-drawer"
        >
          <span>
            <span className="rw-right-rail__strip-caret" aria-hidden="true">▸</span> {label}
            {typeof count === 'number' && <span className="rw-right-rail__strip-count"> ({count} Werte)</span>}
          </span>
          <span aria-hidden="true">▾</span>
        </button>
        {open && (
          <section
            id="rw-right-rail-drawer"
            className="rw-right-rail__drawer"
            role="region"
            aria-label={label}
          >
            <div className="rw-right-rail__drawer-header">
              <span className="rw-right-rail__drawer-title">{label}</span>
              <button
                ref={closeButtonRef}
                type="button"
                className="rw-right-rail__drawer-close"
                onClick={() => setOpen(false)}
                aria-label={`${label} schließen`}
              >
                ✕
              </button>
            </div>
            <div className="rw-right-rail__drawer-body">{children}</div>
          </section>
        )}
      </>
    )
  }

  const isTablet = viewport === 'tablet'
  const width = isTablet ? Math.min(desktopWidth, 240) : desktopWidth

  return (
    <aside
      className={`rw-right-rail rw-right-rail--${isTablet ? 'tablet' : 'desktop'}`}
      style={{ width: `${width}px`, flexBasis: `${width}px` }}
      aria-label={label}
    >
      <div className="rw-right-rail__label">{label}</div>
      <div className="rw-right-rail__body">{children}</div>
    </aside>
  )
}
