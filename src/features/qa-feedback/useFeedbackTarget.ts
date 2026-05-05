import { useContext, useMemo, useRef } from 'react'
import type { HTMLAttributes, RefObject } from 'react'
import { QaFeedbackContext } from './QaFeedbackContext'
import type { TargetPrecision } from './report'

/**
 * Declarative spec a component supplies to register itself as a feedback
 * target. Names match the report payload (`target.id`, `target.label`,
 * `target.precision`) so Lanes B/C/D can populate them through the same hook.
 */
export interface FeedbackTargetSpec {
  /** Stable, dot-separated English id (DECISIONS §3). */
  id: string
  /** Optional human-readable label for the report. */
  label?: string
  /** True if this region contains user-entered values that must be redacted. */
  sensitive?: boolean
  /** Coverage classification reported in the ticket. Defaults to `'exact'`. */
  precision?: TargetPrecision
}

/**
 * Props returned by `useFeedbackTarget`. Spread these onto the host element
 * (typically a `<label>` or wrapping `<div>`).
 *
 * - `data-qa-target` — the stable id, used by the overlay's hit-testing.
 * - `data-qa-label` / `data-qa-precision` — picked up at click time so the
 *   composer doesn't need a side channel.
 * - `data-qa-sensitive` — opt-in redaction flag (Lane B will extend usage).
 *
 * When QA mode is disabled the hook returns an empty `targetProps` object so
 * the host element renders identically to today (PRD US-33 / "inert when
 * disabled").
 */
export interface FeedbackTargetProps {
  ref: RefObject<HTMLElement | null>
  targetProps: HTMLAttributes<HTMLElement> & {
    'data-qa-target'?: string
    'data-qa-label'?: string
    'data-qa-precision'?: TargetPrecision
    'data-qa-sensitive'?: 'true'
  }
}

/**
 * Register a component as a QA-feedback target.
 *
 * Returns a `ref` to attach to the host element and a `targetProps` bag
 * to spread onto it. When QA mode is disabled, `targetProps` is empty —
 * mounting the hook in normal user sessions has no observable side effect.
 */
export function useFeedbackTarget(spec: FeedbackTargetSpec): FeedbackTargetProps {
  const ctx = useContext(QaFeedbackContext)
  const ref = useRef<HTMLElement | null>(null)

  const targetProps = useMemo<FeedbackTargetProps['targetProps']>(() => {
    if (!ctx.enabled) return {}
    const props: FeedbackTargetProps['targetProps'] = {
      'data-qa-target': spec.id,
      'data-qa-precision': spec.precision ?? 'exact',
    }
    if (spec.label) props['data-qa-label'] = spec.label
    if (spec.sensitive) props['data-qa-sensitive'] = 'true'
    return props
  }, [ctx.enabled, spec.id, spec.label, spec.sensitive, spec.precision])

  return { ref, targetProps }
}
