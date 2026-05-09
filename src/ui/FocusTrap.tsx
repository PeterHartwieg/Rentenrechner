/**
 * FocusTrap — keyboard focus trap for modal dialogs.
 *
 * On mount:
 *   - Saves the currently focused element so it can be restored on unmount.
 *   - Moves focus into the trap container (first focusable element, or the
 *     container itself if none are found).
 *
 * While mounted:
 *   - Tab and Shift+Tab cycle only among focusable elements inside the
 *     container.
 *   - Escape key fires the supplied `onEscape` callback (caller closes the
 *     dialog).
 *
 * On unmount:
 *   - Returns focus to the element that was active when the trap mounted.
 *
 * Usage:
 *   <FocusTrap onEscape={onClose}>
 *     <div role="dialog" aria-modal="true" ...>...</div>
 *   </FocusTrap>
 */

import { useEffect, useRef, type ReactNode } from 'react'

/** CSS selector for elements that can receive keyboard focus. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface FocusTrapProps {
  /** Called when the user presses Escape inside the trap. */
  onEscape: () => void
  children: ReactNode
}

export function FocusTrap({ onEscape, children }: FocusTrapProps) {
  const trapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move focus into the trap on mount.
    const container = trapRef.current
    if (container) {
      const first = container.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
      if (first) {
        first.focus()
      } else {
        container.focus()
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!trapRef.current) return

      if (event.key === 'Escape') {
        event.stopPropagation()
        onEscape()
        return
      }

      if (event.key === 'Tab') {
        const focusable = Array.from(
          trapRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        )
        if (focusable.length === 0) {
          event.preventDefault()
          return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement

        if (event.shiftKey) {
          // Shift+Tab: if focus is on the first element, wrap to last.
          if (active === first) {
            event.preventDefault()
            last.focus()
          }
        } else {
          // Tab: if focus is on the last element, wrap to first.
          if (active === last) {
            event.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the element that opened the dialog, but only if
      // it is still attached to the DOM (guards against test teardown races
      // where cleanup() removes the element before the effect runs).
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [onEscape])

  return (
    <div ref={trapRef} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
