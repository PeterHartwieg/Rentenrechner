/**
 * Sensitive-field redaction (DECISIONS §5 — minimum redaction rule).
 *
 * Walks the document for elements marked `data-qa-sensitive="true"` and
 * applies a CSS-level mask before screenshot capture. The mask is removed
 * after capture so the live UI is never permanently altered.
 *
 * Phase 1 Lane B will extend this with manual masking ("brush over this
 * region") and per-field controls. Lane A locks the mechanism only — the
 * default-on automatic redaction.
 */

const REDACT_ATTR = 'data-qa-sensitive'
const REDACT_MARKER_ATTR = 'data-qa-redacted'
const REDACT_INLINE_FILTER = 'blur(8px) saturate(0)'

export interface RedactionHandle {
  /** Number of elements that received a mask. */
  redactedCount: number
  /** Restore the original styles. Idempotent. */
  restore(): void
}

/**
 * Apply the redaction mask to every `data-qa-sensitive="true"` element
 * inside `root`. Returns a handle the caller MUST call `restore()` on
 * (typically inside a `try/finally` around the screenshot capture).
 *
 * The mask:
 *   - sets `filter: blur(8px) saturate(0)` (covers text + inputs)
 *   - tags the element with `data-qa-redacted="1"` for later restoration
 *   - preserves any pre-existing inline `filter` so we can roll back
 */
export function applySensitiveRedaction(root: ParentNode = document): RedactionHandle {
  const targets = Array.from(
    root.querySelectorAll<HTMLElement>(`[${REDACT_ATTR}="true"]`),
  )
  const previous: Array<{ el: HTMLElement; filter: string | null }> = []
  for (const el of targets) {
    previous.push({ el, filter: el.style.filter || null })
    el.style.filter = REDACT_INLINE_FILTER
    el.setAttribute(REDACT_MARKER_ATTR, '1')
  }
  let restored = false
  return {
    redactedCount: targets.length,
    restore() {
      if (restored) return
      restored = true
      for (const { el, filter } of previous) {
        if (filter === null) {
          el.style.removeProperty('filter')
        } else {
          el.style.filter = filter
        }
        el.removeAttribute(REDACT_MARKER_ATTR)
      }
    },
  }
}

/**
 * The HTML attribute used to mark a sensitive element. Exposed as a constant
 * so feature components can reference it without hard-coding the string.
 *
 * Lane B will likely add helpers (a `<SensitiveRegion>` wrapper, a hook on
 * `NumberField`) — they should all funnel through this constant.
 */
export const SENSITIVE_ATTRIBUTE = REDACT_ATTR
