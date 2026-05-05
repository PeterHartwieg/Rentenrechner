import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { QaFeedbackContext } from './QaFeedbackContext'
import { resolveTarget } from './resolveTarget'

interface OutlineRect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Hover outline + click-to-pin overlay.
 *
 * Activated only when the provider has QA mode enabled. The component:
 *   1. Walks up from the pointer to the nearest ancestor carrying
 *      `data-qa-target` (PRD US-7 — nearest-target resolution).
 *   2. Draws a fixed-position outline matching the target's bounding rect.
 *   3. Pins the target on click and forwards it to the provider, which then
 *      opens the composer.
 *   4. Cancels selection on `Escape`.
 *
 * Lane C (issue 06) additions:
 *   - When armed (QA mode on, no pin yet), Tab walks DOM-order through
 *     `data-qa-target` elements and highlights the focused one with the same
 *     outline as hover.
 *   - Enter on a keyboard-focused target pins it (same as click).
 *   - Escape cancels the current draft via `cancelDraft` from the context
 *     when a pin is active; otherwise clears the hover outline.
 *
 * Nested feedback targets are handled by `closest()`: clicks deepest first,
 * so a child target outranks its container.
 */
export function QaOverlay() {
  const ctx = useContext(QaFeedbackContext)
  const [hover, setHover] = useState<{ rect: OutlineRect; el: HTMLElement } | null>(null)
  const pinnedRect = ctx.pinned?.rect ?? null
  // Track which qa-target currently has keyboard focus so we can show its
  // outline when the user Tabs through the page in armed mode.
  const keyboardFocusRef = useRef<HTMLElement | null>(null)
  const [kbFocusRect, setKbFocusRect] = useState<OutlineRect | null>(null)

  useEffect(() => {
    if (!ctx.enabled) return

    function onPointerMove(event: PointerEvent) {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-qa-target]')
      if (!target) {
        setHover(null)
        return
      }
      // Skip the overlay's own DOM (it has no data-qa-target anyway, but
      // this guards against future overlay sub-children that might).
      if (target.closest('[data-qa-overlay]')) {
        setHover(null)
        return
      }
      const rect = target.getBoundingClientRect()
      setHover({
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        el: target,
      })
    }

    function onClick(event: MouseEvent) {
      const originalTarget = event.target as HTMLElement | null
      const target = originalTarget?.closest<HTMLElement>('[data-qa-target]')
      if (!target) return
      if (target.closest('[data-qa-overlay]')) return
      // Suppress the underlying click so the calculator doesn't react to the
      // tester's selection (e.g. a button submit).
      event.preventDefault()
      event.stopPropagation()
      const resolved = resolveTarget(target, originalTarget)
      ctx.pickTarget(resolved, target.getBoundingClientRect())
    }

    function onFocusIn(event: FocusEvent) {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-qa-target]')
      // Only track focus on qa-targets outside the overlay panel itself.
      if (!target || target.closest('[data-qa-overlay]')) {
        keyboardFocusRef.current = null
        setKbFocusRect(null)
        return
      }
      keyboardFocusRef.current = target
      const rect = target.getBoundingClientRect()
      setKbFocusRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    }

    function onFocusOut() {
      // Clear keyboard-focus rect when focus leaves a qa-target. A small
      // delay lets the next focusin fire first so there's no flash.
      requestAnimationFrame(() => {
        if (
          !document.activeElement ||
          !document.activeElement.closest('[data-qa-target]')
        ) {
          keyboardFocusRef.current = null
          setKbFocusRect(null)
        }
      })
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setHover(null)
        setKbFocusRect(null)
        keyboardFocusRef.current = null
      }
      // Enter on a keyboard-focused qa-target: pin it (same as click).
      if (event.key === 'Enter' && keyboardFocusRef.current) {
        const target = keyboardFocusRef.current
        // Only pin if the composer isn't already open.
        if (!ctx.pinned) {
          event.preventDefault()
          event.stopPropagation()
          // For keyboard navigation the focused element IS the target element,
          // so originalTarget === target → precision will be 'exact' (or
          // section/nested as declared by the element's own data-qa-precision).
          const resolved = resolveTarget(target, target)
          ctx.pickTarget(resolved, target.getBoundingClientRect())
        }
      }
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [ctx])

  // Render order: pinned outline (orange) > hover outline (blue) > keyboard
  // focus outline (blue, same style as hover). All use `position: fixed`.
  const visibleRect = useMemo<{ rect: OutlineRect; pinned: boolean } | null>(() => {
    if (pinnedRect) return { rect: pinnedRect, pinned: true }
    if (hover) return { rect: hover.rect, pinned: false }
    if (kbFocusRect) return { rect: kbFocusRect, pinned: false }
    return null
  }, [pinnedRect, hover, kbFocusRect])

  if (!ctx.enabled) return null

  return (
    <div data-qa-overlay aria-hidden="true">
      {visibleRect && (
        <div
          className={
            visibleRect.pinned ? 'qa-overlay-outline qa-overlay-outline--pinned' : 'qa-overlay-outline'
          }
          data-testid={visibleRect.pinned ? 'qa-overlay-pinned' : 'qa-overlay-hover'}
          style={{
            top: `${visibleRect.rect.top}px`,
            left: `${visibleRect.rect.left}px`,
            width: `${visibleRect.rect.width}px`,
            height: `${visibleRect.rect.height}px`,
          }}
        />
      )}
    </div>
  )
}

