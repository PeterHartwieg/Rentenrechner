import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react'
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
   * Fires on ESC keypress, backdrop click, the close (X) button, or a phone
   * swipe-down past the dismiss threshold. The caller owns the open/closed
   * state and decides what "close" means.
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
 * R4.2 swipe-to-dismiss threshold: a touch-drag must exceed this many CSS
 * pixels before release for the panel to dismiss. We additionally cap at
 * 25 % of viewport height so the affordance still feels right on tall
 * phones (~900 px → 80 px threshold; short ones default to 80 px). Mirrors
 * the iOS sheet-dismiss feel without trying to match its rubber-banding.
 */
const SWIPE_DISMISS_PX = 80
const SWIPE_DISMISS_VH_RATIO = 0.25

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
 *   - R4.2 phone: drag-handle + swipe-down dismiss on the header region;
 *     CSS-only on tablet (panel narrows). Snap-back transition respects
 *     `prefers-reduced-motion`.
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

  // R4.2: phone swipe-to-dismiss. The in-progress drag state lives in a
  // ref (not React state) so per-frame touchmove updates do not re-render
  // the whole subtree; we only flip an `isDragging` React flag on
  // start/end so CSS can swap the snap-back transition on or off.
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{ startY: number; deltaY: number; active: boolean }>({
    startY: 0,
    deltaY: 0,
    active: false,
  })
  const [isDragging, setIsDragging] = useState(false)

  // Resetting the transform is the same job in three places (early-out
  // during touchstart on a stale ref, touchend below-threshold snap-back,
  // and post-dismiss unmount belt-and-braces). Centralising avoids drift.
  const resetPanelTransform = useCallback(() => {
    if (panelRef.current) {
      panelRef.current.style.transform = ''
    }
  }, [])

  function handleTouchStart(event: ReactTouchEvent<HTMLElement>) {
    // Gate swipe-dismiss to phone-width viewports only. The drag handle is
    // CSS-hidden on tablet/desktop, so allowing the touch handlers to fire
    // there creates an undiscoverable dismiss gesture and risks accidental
    // dismissals when users drag the header area. Checking at touch-start
    // time (rather than at mount) handles viewport changes mid-session
    // (e.g. orientation flip, devtools resize) without needing a matchMedia
    // listener.
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 639px)').matches) {
      return
    }
    const touch = event.touches[0]
    if (!touch) return
    dragStateRef.current = { startY: touch.clientY, deltaY: 0, active: true }
    setIsDragging(true)
  }

  function handleTouchMove(event: ReactTouchEvent<HTMLElement>) {
    if (!dragStateRef.current.active) return
    const touch = event.touches[0]
    if (!touch) return
    const deltaY = touch.clientY - dragStateRef.current.startY
    dragStateRef.current.deltaY = deltaY
    // Drag-up is ignored: the panel can only be dismissed downward. This
    // keeps scroll-inside-the-body interactions (which start on the body,
    // not the header) feeling normal — the header itself stays put when a
    // user accidentally swipes up on it.
    if (panelRef.current && deltaY > 0) {
      panelRef.current.style.transform = `translateY(${deltaY}px)`
    }
  }

  function handleTouchEnd() {
    if (!dragStateRef.current.active) return
    const { deltaY } = dragStateRef.current
    dragStateRef.current.active = false
    setIsDragging(false)

    // Dismiss threshold: the smaller of 80px and 25vh. On a 320px-tall
    // viewport (rare but possible in landscape phones), 25% = 80px so
    // the bound coincides; on a 900px tall portrait phone, 80px wins
    // and the user does not need to drag nearly to the middle of the
    // screen to dismiss.
    const viewportHeight =
      typeof window !== 'undefined' && typeof window.innerHeight === 'number'
        ? window.innerHeight
        : 0
    const threshold =
      viewportHeight > 0
        ? Math.min(SWIPE_DISMISS_PX, viewportHeight * SWIPE_DISMISS_VH_RATIO)
        : SWIPE_DISMISS_PX

    if (deltaY > threshold) {
      onClose()
      // Belt-and-braces: if the consumer keeps the modal mounted (e.g.
      // ignores onClose), clear the transform so we don't strand the
      // panel halfway off-screen. When the consumer DOES unmount, the
      // DOM node is gone and the reset is a no-op.
      resetPanelTransform()
      return
    }
    // Below the threshold — snap back to origin. With isDragging now
    // false, the CSS transition (`transform 200ms ease-out`) re-engages,
    // so resetting the inline transform animates the snap-back unless
    // prefers-reduced-motion is set (handled in CSS).
    resetPanelTransform()
  }

  if (!open) return null

  function handleBackdropClick(event: MouseEvent<HTMLButtonElement>) {
    // Stop the click from bubbling to anything underneath (e.g. the page
    // body) — the backdrop's job is to dismiss the modal and nothing else.
    event.stopPropagation()
    onClose()
  }

  const panelClassNames = ['rw-modal-slot__panel']
  if (panelClassName) panelClassNames.push(panelClassName)
  if (isDragging) panelClassNames.push('is-dragging')

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
          ref={panelRef}
          className={panelClassNames.join(' ')}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          {/*
            Drag-region wraps the drag handle + header. Touch events bind
            here (not on the panel) so a user scrolling inside the body
            still scrolls normally — only header / handle drags dismiss.
            The handle itself is purely visual: no role, no aria — keyboard
            and non-touch users dismiss via the X button or ESC.
          */}
          <div
            className="rw-modal-slot__drag-region"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div className="rw-modal-slot__drag-handle" aria-hidden="true" />
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
          </div>
          <div className="rw-modal-slot__body">{children}</div>
        </div>
      </div>
    </FocusTrap>
  )
}
