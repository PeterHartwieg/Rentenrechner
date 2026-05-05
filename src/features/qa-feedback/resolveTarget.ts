/**
 * Target resolution logic for QaOverlay — split into its own file so
 * QaOverlay.tsx can remain a pure-component file (react-refresh/only-export-components).
 *
 * Lane D (issue 05) added `nested` and `section` precision resolution.
 */

import type { ResolvedTarget, TargetPrecision } from './report'

/**
 * Read the target's data-* attributes into a `ResolvedTarget`. Visible text
 * is the trimmed text content of the target element (PRD US-12).
 *
 * Precision rules (Lane D):
 *   exact   — the resolved element IS the original click/focus target.
 *   nested  — resolved via closest(); the matched element is an ancestor.
 *   section — the matched element carries data-qa-section="true" (section
 *             fallback: no exact target, only a container was found).
 *   unknown — no data-qa-target found (handled upstream; el won't be null).
 *
 * The `data-qa-precision` attribute on the element can override the
 * auto-detected value for elements that are always section-level (e.g.
 * workspace.main.section).
 */
export function resolveTarget(el: HTMLElement, originalTarget?: EventTarget | null): ResolvedTarget {
  const id = el.getAttribute('data-qa-target') ?? ''
  const label = el.getAttribute('data-qa-label') ?? undefined
  const isSection = el.getAttribute('data-qa-section') === 'true'
  const precisionAttr = el.getAttribute('data-qa-precision')

  let precision: TargetPrecision
  if (precisionAttr === 'unknown') {
    precision = 'unknown'
  } else if (isSection || precisionAttr === 'section') {
    // Section fallback: either the element is deliberately marked as a
    // section container (data-qa-section="true") or the hook emitted
    // data-qa-precision="section" without the marker (defensive — hand-rolled
    // markup that uses precision="section" on `useFeedbackTarget` should still
    // resolve as section regardless of whether the marker was applied).
    precision = 'section'
  } else if (precisionAttr === 'nested') {
    precision = 'nested'
  } else if (precisionAttr === 'exact') {
    precision = 'exact'
  } else if (originalTarget && originalTarget !== el) {
    // Click/focus arrived on a child element; closest() walked up to this
    // ancestor → nested resolution.
    precision = 'nested'
  } else {
    precision = 'exact'
  }

  const visibleText = (el.textContent ?? '').trim() || undefined
  return { id, label, precision, visibleText }
}
