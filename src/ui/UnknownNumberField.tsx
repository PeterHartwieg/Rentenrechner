import { useId, useState } from 'react'
import type { InputStatus } from '../domain'
import { formatNumber } from '../utils/format'
import './UnknownNumberField.css'

export interface UnknownNumberFieldProps {
  label: string
  value: number | null
  status: InputStatus
  onChange: (next: number | null, status: 'entered' | 'unknown') => void
  decimals?: number
  step?: number
  min?: number
  max?: number
  unit?: string
  disabled?: boolean
}

/** The parent retains the previous numeric value when status becomes unknown. */
export function UnknownNumberField({
  label, value, status, onChange, decimals, step = 1, min, max, unit, disabled,
}: UnknownNumberFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const unknown = status === 'unknown'
  // Match NumberField's bounded display precision; never round the emitted value.
  const [mantissa, exponent = '0'] = step.toString().split('e')
  const precision = decimals ?? (step > 0 && step < 1
    ? Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent))
    : 0)
  const canonical = value !== null && Number.isFinite(value)
    ? Number(value.toFixed(Math.min(100, Math.max(0, precision)))).toString()
    : ''
  const text = unknown ? '' : draft ?? canonical
  const number = text.trim() === '' ? null : Number(text)
  const outOfRange = number !== null && Number.isFinite(number) && (
    (min !== undefined && number < min) || (max !== undefined && number > max)
  )
  const hint = status === 'assumed' ? 'Angenommen'
    : status === 'unknown' ? 'Unbekannt'
      : status === 'document' ? 'lt. Beleg' : 'Von dir angegeben'
  const description = `${id}-hint${outOfRange ? ` ${id}-range` : ''}`

  return (
    <div className="unknown-number-field" data-qa-sensitive="true">
      <label htmlFor={id}>{label}</label>
      <div className="unknown-number-field__input">
        <input
          id={id} type="number" inputMode="decimal" value={text}
          step={step} min={min} max={max} disabled={disabled}
          aria-describedby={description} aria-invalid={outOfRange || undefined}
          onChange={(event) => {
            const raw = event.target.value
            setDraft(raw)
            onChange(raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null, 'entered')
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
        />
        {unit && <span>{unit}</span>}
      </div>
      <label className="unknown-number-field__unknown" htmlFor={`${id}-unknown`}>
        <input
          id={`${id}-unknown`} type="checkbox" checked={unknown} disabled={disabled}
          aria-label={`${label}: Weiß ich nicht`} aria-describedby={description}
          onChange={(event) => {
            setDraft(null)
            onChange(event.target.checked ? null : value, event.target.checked ? 'unknown' : 'entered')
          }}
        />
        Weiß ich nicht
      </label>
      <small id={`${id}-hint`} className={`unknown-number-field__hint${unknown ? ' pec-prov--unknown' : ''}`}>{hint}</small>
      {outOfRange && <small id={`${id}-range`} className="unknown-number-field__range">
        {min !== undefined && number! < min
          ? `Bitte mindestens ${formatNumber(min, precision)}${unit ? ` ${unit}` : ''} eingeben.`
          : `Bitte höchstens ${formatNumber(max!, precision)}${unit ? ` ${unit}` : ''} eingeben.`}
      </small>}
    </div>
  )
}
