import './forms.css'
import './RangeNumberField.css'
import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { NumberField } from './NumberField'
import { useFeedbackTarget } from '../features/qa-feedback'
import { formatNumber } from '../utils/format'

export interface RangeQuickChoice {
  /** Value written when the card is chosen. */
  value: number
  /** Short card headline. */
  label: string
  /** Optional second line explaining the choice. */
  hint?: string
}

export interface RangeNumberFieldProps {
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

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0
  const [coefficient, exponentPart] = value.toString().toLowerCase().split('e')
  const fractionDigits = coefficient.split('.')[1]?.length ?? 0
  const exponent = Number(exponentPart ?? 0)
  return Math.max(0, fractionDigits - exponent)
}

/** Snap to the step grid and clamp into range. */
function quantise(
  raw: number,
  min: number,
  max: number,
  step: number,
  decimals?: number,
): number {
  if (!Number.isFinite(raw)) return min
  const clamped = Math.min(max, Math.max(min, raw))
  if (!(step > 0)) return clamped
  const precision = Math.min(
    12,
    Math.max(
      0,
      Math.trunc(decimals ?? 0),
      decimalPlaces(min),
      decimalPlaces(max),
      decimalPlaces(step),
    ),
  )
  const snapped = Number(
    (min + Math.round((clamped - min) / step) * step).toFixed(precision),
  )
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
  const choiceRefs = useRef<(HTMLButtonElement | null)[]>([])
  const { targetProps } = useFeedbackTarget({
    id: feedbackTargetId ?? '',
    label,
    precision: 'section',
  })

  const shown = dragValue ?? value
  const selectionTolerance = step > 0 ? step / 2 : 0.005
  const displayDecimals = decimals ?? decimalPlaces(step)
  const selectedIndex = choices
    ? choices.findIndex((choice) => Math.abs(shown - choice.value) < selectionTolerance)
    : -1

  const setDrag = (next: number | null) => {
    dragValueRef.current = next
    setDragValue(next)
  }

  const commitDrag = () => {
    const pending = dragValueRef.current
    setDrag(null)
    if (pending !== null && pending !== value) onCommit(pending)
  }

  const selectChoice = (index: number, focus = false) => {
    const choice = choices?.[index]
    if (!choice) return
    setDrag(null)
    if (focus) choiceRefs.current[index]?.focus()
    // Choices are rule-derived thresholds, so their exact values carry domain
    // meaning even when they do not land on the slider/input step grid.
    onCommit(Math.min(max, Math.max(min, choice.value)))
  }

  const moveChoiceFocus = (from: number, key: string) => {
    if (!choices || choices.length === 0) return
    let next: number | null = null
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      next = (from + 1) % choices.length
    } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
      next = (from - 1 + choices.length) % choices.length
    } else if (key === 'Home') {
      next = 0
    } else if (key === 'End') {
      next = choices.length - 1
    }
    if (next !== null) selectChoice(next, true)
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
            const selected = index === selectedIndex
            return (
              <button
                key={choice.label}
                type="button"
                role="radio"
                ref={(element) => {
                  choiceRefs.current[index] = element
                }}
                aria-checked={selected}
                // Roving tabindex: only the selected card (or the first, when
                // none matches) is in the tab order, as radio groups require.
                tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
                className={
                  selected
                    ? 'range-number-field__choice range-number-field__choice--selected'
                    : 'range-number-field__choice'
                }
                // Index, never the amount — QA target ids are exported to the
                // report unredacted, so encoding the value would leak it.
                data-qa-target={feedbackTargetId ? `${feedbackTargetId}.choice.${index}` : undefined}
                onClick={() => selectChoice(index)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'ArrowRight'
                    || event.key === 'ArrowDown'
                    || event.key === 'ArrowLeft'
                    || event.key === 'ArrowUp'
                    || event.key === 'Home'
                    || event.key === 'End'
                  ) {
                    event.preventDefault()
                    moveChoiceFocus(index, event.key)
                  }
                }}
              >
                <span className="range-number-field__choice-value">
                  {formatNumber(choice.value, displayDecimals)}
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
            aria-label={`${label} (Schieberegler)`}
            aria-valuetext={`${formatNumber(shown, displayDecimals)}${suffix ? ` ${suffix}` : ''}`}
            onPointerDown={(event: ReactPointerEvent<HTMLInputElement>) => {
              // Capture so a release outside the track still reaches us.
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onChange={(event) => {
              setDrag(quantise(Number(event.target.value), min, max, step, decimals))
            }}
            onPointerUp={commitDrag}
            onPointerCancel={commitDrag}
            onKeyUp={commitDrag}
            onBlur={commitDrag}
          />
          <div className="range-number-field__bounds" aria-hidden="true">
            <span>
              {formatNumber(min, displayDecimals)}
              {suffix ? ` ${suffix}` : ''}
            </span>
            <span>
              {formatNumber(max, displayDecimals)}
              {suffix ? ` ${suffix}` : ''}
            </span>
          </div>
        </div>

        <NumberField
          label={`${label} (genauer Wert)`}
          value={shown}
          min={min}
          max={max}
          step={step}
          decimals={decimals}
          suffix={suffix}
          disabled={disabled}
          onCommit={(raw) => {
            setDrag(null)
            onCommit(quantise(Number(raw), min, max, step, decimals))
          }}
        />
      </div>
    </fieldset>
  )
}
