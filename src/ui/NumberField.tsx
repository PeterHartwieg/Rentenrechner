import './forms.css'
import { useState, type ReactNode } from 'react'
import { formatNumber } from '../utils/format'

/**
 * Number of decimal places implied by a step value.
 *   1, 10, 1000     → 0
 *   0.5, 0.1        → 1
 *   0.05, 0.01      → 2
 * Float epsilon is ignored — we trust callers to supply round step values.
 */
function decimalsFromStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  if (step >= 1) return 0
  // Count decimals via string representation to avoid log-rounding pitfalls.
  const s = step.toString()
  const dotIdx = s.indexOf('.')
  return dotIdx === -1 ? 0 : s.length - dotIdx - 1
}

export function NumberField({
  label,
  labelSuffix,
  value,
  min,
  max,
  step = 1,
  decimals,
  suffix,
  onChange,
  onCommit,
}: {
  label: string
  /** Optional inline content rendered next to the label (e.g. <InfoTip />). */
  labelSuffix?: ReactNode
  value: number
  min?: number
  max?: number
  step?: number
  /**
   * Decimals shown when the field is not being edited. Default: derived from
   * `step` (e.g. step=10 → 0, step=0.5 → 1, step=0.05 → 2). Override when the
   * bound value's natural precision differs from the step (e.g. show currency
   * to 2 decimals while stepping by 1 EUR).
   *
   * Engine-derived values (funding nets, RIY, projected pensions etc.) MUST
   * pass through this field — never render raw floats in JSX. See "UI rounding"
   * in CLAUDE.md.
   */
  decimals?: number
  suffix?: string
  /** Fires on every keystroke. Use for live preview of unconstrained inputs. */
  onChange?: (value: string) => void
  /** Fires on blur or Enter. Use for clamped/validated inputs so partial keystrokes don't trigger range corrections. */
  onCommit?: (value: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const effectiveDecimals = decimals ?? decimalsFromStep(step)
  // toFixed gives us bounded precision; Number(...) drops trailing zeros so
  // integer-step fields render as "110" rather than "110.00".
  const canonical = Number.isFinite(value)
    ? Number(value.toFixed(effectiveDecimals)).toString()
    : '0'
  const displayValue = draft ?? canonical

  const commit = () => {
    if (draft === null) return
    const raw = draft
    setDraft(null)
    // Empty string is not a valid number — discard without calling onCommit so
    // the engine value is preserved (the field will revert to `canonical`).
    if (raw.trim() === '' || !Number.isFinite(Number(raw))) return
    onCommit?.(raw)
  }

  // Show a recovery hint while the user is typing a value that lies outside
  // the allowed range. Without this, callers' clampNumber would silently
  // overwrite the value on commit and the user would not understand why.
  const draftNum = draft !== null ? Number(draft) : null
  const outOfRange =
    draftNum !== null && Number.isFinite(draftNum)
      ? (min !== undefined && draftNum < min) ||
        (max !== undefined && draftNum > max)
      : false

  const formatBound = (v: number) =>
    Number.isInteger(v) ? String(v) : formatNumber(v, 2)

  let recovery: string | null = null
  if (outOfRange && draftNum !== null) {
    if (min !== undefined && draftNum < min) {
      recovery = `Wert wird auf ${formatBound(min)}${suffix ? ' ' + suffix : ''} angehoben (Minimum).`
    } else if (max !== undefined && draftNum > max) {
      recovery = `Wert wird auf ${formatBound(max)}${suffix ? ' ' + suffix : ''} begrenzt (Maximum).`
    }
  }

  return (
    <label className="field">
      <span>{label}{labelSuffix}</span>
      <div className="input-shell">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={displayValue}
          onChange={(event) => {
            setDraft(event.target.value)
            onChange?.(event.target.value)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit()
              event.currentTarget.blur()
            }
          }}
        />
        {suffix ? <em>{suffix}</em> : null}
      </div>
      {recovery && <p className="field-warning">{recovery}</p>}
    </label>
  )
}
