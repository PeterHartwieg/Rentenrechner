import './forms.css'
import './RangeNumberField.css'
import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { NumberField } from './NumberField'
import { useFeedbackTarget } from '../features/qa-feedback'

export interface RangeQuickChoice {
  /** Value written when the card is chosen. */
  value: number
  /** Short card headline. */
  label: string
  /** Optional second line explaining the choice. */
  hint?: string
}

interface RangeNumberFieldProps {
  /** Group label. Rendered as a `<legend>`, not a `<label>` — see note below. */
  label: string
  value: number
  min: number
  max: number
  step?: number
  decimals?: number
  /** Unit shown after the numeric field and spoken in `aria-valuetext`. */
  suffix?: string
  disabled?: boolean
  /** Optional quick-choice cards rendered above the slider. */
  choices?: readonly RangeQuickChoice[]
  /**
   * Fires when the user settles on a value: pointer release, keyboard release,
   * card click, or numeric-field commit. Deliberately **not** per slider frame.
   */
  onCommit: (value: number) => void
  /** QA-feedback target id for the group. */
  feedbackTargetId?: string
}

/** Snap to the step grid and clamp into range. */
function quantise(raw: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(raw)) return min
  const clamped = Math.min(max, Math.max(min, raw))
  if (!(step > 0)) return clamped
  const snapped = min + Math.round((clamped - min) / step) * step
  return Math.min(max, Math.max(min, snapped))
}

/**
 * `RangeNumberField` — bounded numeric input: optional quick-choice cards, a
 * native range slider for fast exploration, and a `NumberField` for precision
 * and keyboard entry. Composes `NumberField` rather than replacing it, so the
 * draft/commit semantics of the numeric input are untouched.
 *
 * Only for genuinely bounded values (contribution under a statutory ceiling,
 * age, allocation percentage). Salary, contract value and other open-ended or
 * document-derived numbers keep a plain `NumberField`.
 *
 * ## Three things here are deliberate, not incidental
 *
 * **The slider commits on release, not per frame.** Every commit in compare
 * mode triggers a full `simulateRetirementComparison` plus a 1 000-run Monte
 * Carlo. Dragging would fire one of those per pointer move. The slider drags on
 * local state and calls `onCommit` on `pointerup` / `pointercancel` / `keyup` /
 * blur. Pointer capture is set on `pointerdown` so a release outside the
 * element still lands.
 *
 * **The group is a `fieldset` + `legend`, not a `<label>`.** A single
 * `<label htmlFor>` cannot address two controls, and `NumberField` already
 * renders its own wrapping `<label>` — nesting one inside another is invalid.
 *
 * **Card selection uses a tolerance, never `===`.** The bound value is often an
 * engine-derived float that lands a hair off the nominal level; strict equality
 * would leave a visibly-chosen card rendering as unselected.
 */
export function RangeNumberField({
  label,
  value,
  min,
  max,
  step = 1,
  decimals,
  suffix,
  disabled,
  choices,
  onCommit,
  feedbackTargetId,
}: RangeNumberFieldProps) {
  const groupId = useId()
  const sliderId = `${groupId}-slider`
  const [dragValue, setDragValue] = useState<number | null>(null)
  const dragValueRef = useRef<number | null>(null)
  const { targetProps } = useFeedbackTarget({
    id: feedbackTargetId ?? '',
    label,
    precision: 'section',
  })

  const shown = dragValue ?? value
  const selectionTolerance = step > 0 ? step / 2 : 0.005

  const setDrag = (next: number | null) => {
    dragValueRef.current = next
    setDragValue(next)
  }

  const commitDrag = () => {
    const pending = dragValueRef.current
    setDrag(null)
    if (pending !== null && pending !== value) onCommit(pending)
  }

  const qaProps: Record<string, unknown> = feedbackTargetId ? { ...targetProps } : {}
  // The slider position, the selected card and aria-valuetext all disclose the
  // contribution just as plainly as the numeric field does, so the whole group
  // is redacted rather than only the inner NumberField.
  qaProps['data-qa-sensitive'] = 'true'

  return (
    <fieldset className="range-number-field" disabled={disabled} {...qaProps}>
      <legend>{label}</legend>

      {choices && choices.length > 0 && (
        <div className="range-number-field__choices" role="radiogroup" aria-label={label}>
          {choices.map((choice, index) => {
            const selected = Math.abs(shown - choice.value) < selectionTolerance
            return (
              <button
                key={choice.label}
                type="button"
                role="radio"
                aria-checked={selected}
                // Roving tabindex: only the selected card (or the first, when
                // none matches) is in the tab order, as radio groups require.
                tabIndex={selected || (index === 0 && !choices.some((c) => Math.abs(shown - c.value) < selectionTolerance)) ? 0 : -1}
                className={
                  selected
                    ? 'range-number-field__choice range-number-field__choice--selected'
                    : 'range-number-field__choice'
                }
                // Index, never the amount — QA target ids are exported to the
                // report unredacted, so encoding the value would leak it.
                data-qa-target={feedbackTargetId ? `${feedbackTargetId}.choice.${index}` : undefined}
                onClick={() => {
                  setDrag(null)
                  onCommit(quantise(choice.value, min, max, step))
                }}
              >
                <span className="range-number-field__choice-value">
                  {choice.value.toLocaleString('de-DE', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                  {suffix ? ` ${suffix}` : ''}
                </span>
                <span className="range-number-field__choice-label">{choice.label}</span>
                {choice.hint && (
                  <span className="range-number-field__choice-hint">{choice.hint}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="range-number-field__row">
        <div className="range-number-field__slider">
          <input
            id={sliderId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={shown}
            aria-label={label}
            aria-valuetext={`${shown.toLocaleString('de-DE', {
              minimumFractionDigits: 0,
              maximumFractionDigits: decimals ?? 0,
            })}${suffix ? ` ${suffix}` : ''}`}
            onPointerDown={(event: ReactPointerEvent<HTMLInputElement>) => {
              // Capture so a release outside the track still reaches us.
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onChange={(event) => setDrag(quantise(Number(event.target.value), min, max, step))}
            onPointerUp={commitDrag}
            onPointerCancel={commitDrag}
            onKeyUp={commitDrag}
            onBlur={commitDrag}
          />
          <div className="range-number-field__bounds" aria-hidden="true">
            <span>
              {min.toLocaleString('de-DE')}
              {suffix ? ` ${suffix}` : ''}
            </span>
            <span>
              {max.toLocaleString('de-DE', { maximumFractionDigits: 0 })}
              {suffix ? ` ${suffix}` : ''}
            </span>
          </div>
        </div>

        <NumberField
          label={label}
          value={shown}
          min={min}
          max={max}
          step={step}
          decimals={decimals}
          suffix={suffix}
          disabled={disabled}
          onCommit={(raw) => {
            setDrag(null)
            onCommit(quantise(Number(raw), min, max, step))
          }}
        />
      </div>
    </fieldset>
  )
}
