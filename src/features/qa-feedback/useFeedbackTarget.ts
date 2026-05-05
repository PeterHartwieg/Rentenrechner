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
 * - `data-qa-section` — emitted automatically when `precision === 'section'`
 *   so resolveTarget classifies the site as a section fallback.
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
    'data-qa-section'?: 'true'
    'data-qa-sensitive'?: 'true'
  }
}

/**
 * Build the `data-qa-*` attribute bag for a feedback target. Pure synchronous
 * function; safe to call from inside `.map()` callbacks where calling
 * `useFeedbackTarget` per row would violate `react-hooks/rules-of-hooks`.
 *
 * Returns an empty object when `enabled` is false, preserving the inert
 * contract for non-QA sessions. Callers must read `enabled` from
 * `useQaMode()` once at component scope, then call this helper per item.
 */
export function qaTargetAttrs(
  enabled: boolean,
  spec: FeedbackTargetSpec,
): FeedbackTargetProps['targetProps'] {
  if (!enabled) return {}
  const props: FeedbackTargetProps['targetProps'] = {
    'data-qa-target': spec.id,
    'data-qa-precision': spec.precision ?? 'exact',
  }
  if (spec.precision === 'section') props['data-qa-section'] = 'true'
  if (spec.label) props['data-qa-label'] = spec.label
  if (spec.sensitive) props['data-qa-sensitive'] = 'true'
  return props
}

/**
 * Convenience helper: spread the return value directly onto a JSX element.
 *
 * Usage (inside a component that already called `useQaMode()`):
 *   <button {...qaTarget(enabled, 'inputs.bav.contribution')}>…</button>
 *
 * This is the one-liner form of `qaTargetAttrs` for call sites that don't
 * need the full `FeedbackTargetSpec` flexibility. Under the hood it delegates
 * to `qaTargetAttrs` so all inert / section / sensitive rules apply uniformly.
 */
export function qaTarget(
  enabled: boolean,
  id: string,
  opts?: Omit<FeedbackTargetSpec, 'id'>,
): FeedbackTargetProps['targetProps'] {
  return qaTargetAttrs(enabled, { id, ...opts })
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

  const targetProps = useMemo<FeedbackTargetProps['targetProps']>(
    () => qaTargetAttrs(ctx.enabled, spec),
    [ctx.enabled, spec.id, spec.label, spec.sensitive, spec.precision],
  )

  return { ref, targetProps }
}
