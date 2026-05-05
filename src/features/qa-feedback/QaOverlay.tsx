import { useContext, useEffect, useMemo, useState } from 'react'
import { QaFeedbackContext } from './QaFeedbackContext'
import type { ResolvedTarget, TargetPrecision } from './report'

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
 * Nested feedback targets are handled by `closest()`: clicks deepest first,
 * so a child target outranks its container.
 */
export function QaOverlay() {
  const ctx = useContext(QaFeedbackContext)
  const [hover, setHover] = useState<{ rect: OutlineRect; el: HTMLElement } | null>(null)
  const pinnedRect = ctx.pinned?.rect ?? null

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
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-qa-target]')
      if (!target) return
      if (target.closest('[data-qa-overlay]')) return
      // Suppress the underlying click so the calculator doesn't react to the
      // tester's selection (e.g. a button submit).
      event.preventDefault()
      event.stopPropagation()
      const resolved = resolveTarget(target)
      ctx.pickTarget(resolved, target.getBoundingClientRect())
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // Always clear the hover outline. The composer/preview own their own
        // Escape handling for cancelling a pinned draft (Lane C will harden
        // focus management). Escape on the bare overlay is a no-op for the
        // pinned state — the tester closes the panel via Cancel/Back.
        setHover(null)
      }
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [ctx])

  // Render order: pinned outline (orange) takes precedence; if nothing is
  // pinned we draw the hover outline (blue). Both use `position: fixed` so
  // scrolling does not shift them — the rect is recomputed each pointer move.
  const visibleRect = useMemo<{ rect: OutlineRect; pinned: boolean } | null>(() => {
    if (pinnedRect) return { rect: pinnedRect, pinned: true }
    if (hover) return { rect: hover.rect, pinned: false }
    return null
  }, [pinnedRect, hover])

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

/**
 * Read the target's data-* attributes into a `ResolvedTarget`. Visible text
 * is the trimmed text content of the target element (PRD US-12).
 */
function resolveTarget(el: HTMLElement): ResolvedTarget {
  const id = el.getAttribute('data-qa-target') ?? ''
  const label = el.getAttribute('data-qa-label') ?? undefined
  const precisionAttr = el.getAttribute('data-qa-precision')
  const precision: TargetPrecision =
    precisionAttr === 'section' || precisionAttr === 'unknown' ? precisionAttr : 'exact'
  const visibleText = (el.textContent ?? '').trim() || undefined
  return { id, label, precision, visibleText }
}
