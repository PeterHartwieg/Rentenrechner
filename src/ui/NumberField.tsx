import { useState } from 'react'

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
    </label>
  )
}
