/**
 * Target resolution logic for QaOverlay — split into its own file so
 * QaOverlay.tsx can remain a pure-component file (react-refresh/only-export-components).
 *
 * Lane D (issue 05) added `nested` and `section` precision resolution.
 */

import type { ResolvedTarget, TargetPrecision } from './report'

/**
 * Selector matched by the QA overlay's catch-all fallback. When a hovered/
 * clicked element has no `data-qa-target` ancestor, we still want to make
 * any interactive element or semantic landmark pinnable so testers can
 * leave feedback on every visible UI item without per-component
 * instrumentation. Declared `[data-qa-target]` always wins because
 * `closest()` returns the deepest match — explicit targets that sit
 * deeper than this catch-all still resolve first.
 */
export const QA_INTERACTIVE_SELECTOR =
  '[data-qa-target], button, [role="button"], a[href], input, select, textarea, summary, label, h1, h2, h3, h4, h5, h6'

/**
 * Derive a fallback target id when no explicit `data-qa-target` is set.
 * Form: `auto.<tag>.<short text slug>`. German umlauts are kept; everything
 * else non-alphanumeric becomes a dash; truncated at 40 chars.
 */
export function deriveAutoTargetId(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const text = (el.textContent ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]+/gi, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
  return text ? `auto.${tag}.${text}` : `auto.${tag}`
}

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
 *
 * When the matched element has no `data-qa-target` (i.e. it was matched
 * via the catch-all interactive selector) we synthesise an `auto.<tag>.<slug>`
 * id so every interactive element gets a stable-ish identifier in the
 * report. The slug is derived from `textContent` so a developer reading
 * the ticket can place the element without an explicit instrumentation pass.
 */
export function resolveTarget(el: HTMLElement, originalTarget?: EventTarget | null): ResolvedTarget {
  const explicitId = el.getAttribute('data-qa-target')
  const id = explicitId ?? deriveAutoTargetId(el)
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
