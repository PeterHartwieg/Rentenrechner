import { useEffect, useRef } from 'react'

/**
 * Captures the currently-focused element when the hook mounts and returns
 * focus to it when the component unmounts (cancel / submit path).
 *
 * Falls back to the element matched by `fallbackSelector` if the originally
 * focused element has been removed from the DOM by the time the host component
 * unmounts. A common fallback is the QA indicator chip.
 *
 * Lane C (issue 06) — focus restoration on composer cancel/submit.
 */
export function useFocusReturn(fallbackSelector?: string): void {
  const savedRef = useRef<HTMLElement | null>(null)

  // Capture the active element at mount time so we know where to return.
  useEffect(() => {
    savedRef.current = document.activeElement as HTMLElement | null
  }, [])

  // Return focus on unmount.
  useEffect(() => {
    return () => {
      const el = savedRef.current
      if (el && document.contains(el) && typeof el.focus === 'function') {
        el.focus()
      } else if (fallbackSelector) {
        const fallback = document.querySelector<HTMLElement>(fallbackSelector)
        fallback?.focus()
      }
    }
  }, [fallbackSelector])
}
