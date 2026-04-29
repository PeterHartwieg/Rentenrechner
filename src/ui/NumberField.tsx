import './forms.css'
import { useState } from 'react'
import { formatNumber } from '../utils/format'

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  /** Fires on every keystroke. Use for live preview of unconstrained inputs. */
  onChange?: (value: string) => void
  /** Fires on blur or Enter. Use for clamped/validated inputs so partial keystrokes don't trigger range corrections. */
  onCommit?: (value: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const canonical = Number.isFinite(value) ? Number(value.toFixed(6)).toString() : '0'
  const displayValue = draft ?? canonical

  const commit = () => {
    if (draft === null) return
    const raw = draft
    setDraft(null)
    if (!Number.isFinite(Number(raw))) return
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
      <span>{label}</span>
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
