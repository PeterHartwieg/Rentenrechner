import { useEffect, useId, useRef } from 'react'
import type { ResolvedTarget } from './report'
import { useFocusReturn } from './useFocusReturn'

interface QaInterceptProps {
  target: ResolvedTarget
  onDismiss(): void
  onProceed(): void
  onExitAndNavigate(): void
}

/** Fallback selector: the QA indicator chip. */
const INDICATOR_SELECTOR = '.qa-indicator'

/**
 * Intercept dialog — shown when a tester clicks the same interactive element
 * twice in a row within one QA session.
 *
 * Teaches: "QA mode intercepts clicks. If you just want to navigate, exit QA mode."
 *
 * Primary button: deactivates QA mode + re-fires the original click.
 * Secondary button: opens the composer for the same target.
 * × / Escape: closes the dialog without changing state (same element clicked
 * again re-opens the dialog until the per-id suppression kicks in after the
 * first dialog show).
 */
export function QaIntercept({ target, onDismiss, onProceed, onExitAndNavigate }: QaInterceptProps) {
  const titleId = useId()
  const descId = useId()
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null)

  // Return focus to the previously-focused element (or indicator chip) on unmount.
  useFocusReturn(INDICATOR_SELECTOR)

  // Focus the primary button on mount so keyboard users can act immediately.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      primaryBtnRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  // Close on Escape without changing intercept state.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onDismiss()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onDismiss])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="qa-panel qa-intercept"
      data-qa-overlay
      data-testid="qa-intercept"
    >
      <div className="qa-panel__header">
        <span id={titleId} className="qa-panel__title">
          Wolltest du nur navigieren?
        </span>
        <button
          type="button"
          className="qa-panel__close"
          aria-label="Schließen"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>

      <div className="qa-panel__body">
        <p id={descId} className="qa-intercept__body">
          Du hast diesen Punkt gerade schon einmal angeklickt. Im Feedback Modus werden alle Klicks
          abgefangen, damit du Feedback dazu geben kannst. Wenn du normal interagieren willst,
          beende den Feedback Modus.
        </p>
        {target.label && (
          <p className="qa-intercept__target-label">
            Element: <strong>{target.label}</strong>
          </p>
        )}
      </div>

      <div className="qa-panel__footer">
        <button
          type="button"
          className="qa-panel__btn"
          onClick={onProceed}
          data-testid="qa-intercept-feedback"
        >
          Feedback geben
        </button>
        <button
          ref={primaryBtnRef}
          type="button"
          className="qa-panel__btn qa-panel__btn--primary"
          onClick={onExitAndNavigate}
          data-testid="qa-intercept-exit"
        >
          Feedback Modus beenden
        </button>
      </div>
    </div>
  )
}
