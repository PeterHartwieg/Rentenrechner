/**
 * Sensitive-field redaction (DECISIONS §5 — minimum redaction rule).
 *
 * Walks the document for elements marked `data-qa-sensitive="true"` and
 * applies a CSS-level mask before screenshot capture. The mask is removed
 * after capture so the live UI is never permanently altered.
 *
 * Phase 1 Lane B hardens the mechanism:
 *   - the mask is `filter: blur(8px)` (DECISIONS §5 — issue 03 brief);
 *   - `withSensitiveRedaction` wraps capture in a try/finally so the live UI
 *     is restored even when the rasteriser throws synchronously or rejects;
 *   - the helper handles ParentNode roots and is pure DOM (no React).
 *
 * Future waves may add per-region opt-out and a manual brush. Both should
 * funnel through `SENSITIVE_ATTRIBUTE` so the redaction surface stays a
 * single attribute name.
 */

const REDACT_ATTR = 'data-qa-sensitive'
const REDACT_MARKER_ATTR = 'data-qa-redacted'
/**
 * Inline `filter` value applied during capture. The DECISIONS §5 contract is
 * `blur(8px)`; an additional `saturate(0)` layer is appended so masked numeric
 * input glyphs lose colour as well as edge clarity (defence in depth — the
 * regression test only requires `blur(8px)` to be present).
 */
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
 *
 * Descendants of a sensitive element inherit the CSS `filter` automatically,
 * so we mask the outer element only. Querying every descendant would not
 * change the captured pixels.
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
 * Run `capture` with the sensitive-mask applied to `root`. The mask is
 * always restored — even if `capture` throws synchronously or rejects
 * asynchronously. This is the recommended call-site for Lane B and any
 * future capture step that touches sensitive DOM.
 *
 * Pure DOM-only: no React, no awaitable side effects beyond `capture`.
 */
export async function withSensitiveRedaction<T>(
  root: ParentNode,
  capture: () => Promise<T> | T,
): Promise<{ result: T; redactedCount: number }> {
  const handle = applySensitiveRedaction(root)
  try {
    const result = await capture()
    return { result, redactedCount: handle.redactedCount }
  } finally {
    handle.restore()
  }
}

/**
 * The HTML attribute used to mark a sensitive element. Exposed as a constant
 * so feature components can reference it without hard-coding the string.
 *
 * `NumberField` exposes an opt-in `feedbackSensitive` prop that emits this
 * attribute on its wrapping label; new sensitive surfaces should funnel
 * through the same constant.
 */
export const SENSITIVE_ATTRIBUTE = REDACT_ATTR
