import { useEffect, useId, type MouseEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { FocusTrap } from '../FocusTrap'
import './ModalSlot.css'

interface ModalSlotProps {
  /**
   * Whether the modal is open. When `false` the component renders nothing so
   * consumers can keep the JSX mounted unconditionally; this also avoids the
   * focus-trap mounting against an empty container.
   */
  open: boolean
  /**
   * Fires on ESC keypress, backdrop click, or the close (X) button. The
   * caller owns the open/closed state and decides what "close" means.
   */
  onClose: () => void
  /** Required dialog title — rendered in the header and referenced by aria-labelledby. */
  title: string
  /**
   * Optional small uppercase mono kicker shown above the title (Sober D
   * pattern, e.g. "Schritt 1 von 2", "§ 1", "Persönliche Auskunft").
   */
  eyebrow?: string
  /**
   * Optional aria-label for the close button. Defaults to "Dialog schließen"
   * which is appropriate for the general case; consumers with a domain-
   * specific noun (e.g. "Bestandsaufnahme schließen") can override.
   */
  closeLabel?: string
  /**
   * Optional extra class on the dialog panel for per-consumer width or
   * layout overrides. The default panel width is responsive via
   * ModalSlot.css; consumers should prefer adding modifier classes there
   * over inline styles.
   */
  panelClassName?: string
  children: ReactNode
}

/**
 * ModalSlot — Sober D / Hybrid modal primitive (chrome system).
 *
 * White background, IBM Plex Sans, oxblood (--rw-accent) used sparingly,
 * thin dark Sober D rules. Designed to be the single dialog surface for
 * the tool pages so the InventoryWizard, the upcoming RecommenderCard
 * modal flow (PR 1.3), and LückeSchließenModal (PR 1.3) all share one
 * shell.
 *
 * Composition: pass a title + eyebrow; render the body (and any footer)
 * as `children`. The primitive owns:
 *   - backdrop + ESC + backdrop-click dismiss (mirrors MobileSheet)
 *   - role="dialog", aria-modal, aria-labelledby wiring
 *   - focus trap via the existing `FocusTrap` (Tab/Shift+Tab wrap, restore
 *     focus on unmount, ESC routed through `onEscape`)
 *   - mobile safe-area bottom inset so the panel never collides with the
 *     phone bottom-tab-bar (`--rw-mobile-nav-height` + env(safe-area-inset-
 *     bottom))
 *
 * The primitive does NOT own:
 *   - the title row content beyond `title` + `eyebrow` (consumers render
 *     their own H1/H2 if they want a custom hierarchy)
 *   - sticky-footer styling (consumers compose their own footer inside
 *     `children`; CSS exposes `.rw-modal-slot__panel` as the scroll
 *     container so consumers can position a sticky footer relative to it)
 */
export function ModalSlot({
  open,
  onClose,
  title,
  eyebrow,
  closeLabel = 'Dialog schließen',
  panelClassName,
  children,
}: ModalSlotProps) {
  // useId provides a stable, render-safe unique id we can pass to
  // aria-labelledby. The token is namespaced to ModalSlot so co-mounted
  // dialogs don't collide on the same DOM id.
  const headingId = `rw-modal-slot-heading-${useId()}`

  // Lock body scroll while the modal is open so the page underneath
  // doesn't scroll when the user wheels the dialog. Restore the previous
  // overflow value on close/unmount.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  function handleBackdropClick(event: MouseEvent<HTMLButtonElement>) {
    // Stop the click from bubbling to anything underneath (e.g. the page
    // body) — the backdrop's job is to dismiss the modal and nothing else.
    event.stopPropagation()
    onClose()
  }

  return (
    <FocusTrap onEscape={onClose}>
      <div className="rw-modal-slot" role="presentation">
        <button
          type="button"
          className="rw-modal-slot__backdrop"
          aria-label={closeLabel}
          onClick={handleBackdropClick}
        />
        <div
          className={
            panelClassName
              ? `rw-modal-slot__panel ${panelClassName}`
              : 'rw-modal-slot__panel'
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          <header className="rw-modal-slot__header">
            <div className="rw-modal-slot__header-text">
              {eyebrow && (
                <p className="rw-modal-slot__eyebrow">{eyebrow}</p>
              )}
              <h2 id={headingId} className="rw-modal-slot__title">
                {title}
              </h2>
            </div>
            <button
              type="button"
              className="rw-modal-slot__close"
              onClick={onClose}
              aria-label={closeLabel}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="rw-modal-slot__body">{children}</div>
        </div>
      </div>
    </FocusTrap>
  )
}
