import { useId, useState, type ReactNode } from 'react'
import { UnknownNumberField } from '../../ui/UnknownNumberField'
import { NumberField } from '../../ui/NumberField'
import { previousFieldValue, type Field } from './onboardingDraft'

/** Closed disclosures have no hidden tab stops; the hook retains their values. */
export function OnboardingDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="onboarding-disclosure" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary tabIndex={0}>{title}</summary>
      {open && <div className="onboarding-disclosure__body">{children}</div>}
    </details>
  )
}

export function OnboardingNumberField({
  label, field, onValue, onUnknown, error, showErrors, hint, step = 1, hideAssumed = false, placeholder,
}: {
  label: string
  field: Field<number>
  onValue: (value: number) => void
  onUnknown: () => void
  error?: string
  showErrors: boolean
  hint?: string
  step?: number
  hideAssumed?: boolean
  placeholder?: string
}) {
  const id = useId()
  const [blurredWithValue, setBlurredWithValue] = useState(false)
  const shownError = showErrors || blurredWithValue ? error : undefined
  const unknown = field.status === 'unknown'
  const value = previousFieldValue(field)
  const onboardingValue = field.status === 'assumed' || unknown || !Number.isFinite(value) ? null : value ?? null
  const provenance = unknown ? 'Unbekannt' : onboardingValue !== null
    ? field.status === 'document' ? 'lt. Beleg' : 'Von dir angegeben'
    : undefined
  const description = [shownError && `${id}-error`, hideAssumed && provenance && `${id}-provenance`].filter(Boolean).join(' ') || undefined
  return (
    <div className="onboarding-field" role="group" aria-label={`Angabe: ${label}`}
      onBlur={(event) => {
        // Unknown toggles and empty inputs do not reveal a pristine field's errors.
        if (event.target instanceof HTMLInputElement && event.target.type === 'number' && event.target.value.trim() !== '') {
          setBlurredWithValue(true)
        }
      }}
      aria-invalid={!!shownError || undefined} aria-describedby={description}>
      {hideAssumed ? <div className="unknown-number-field" data-qa-sensitive="true">
        <NumberField label={label} value={onboardingValue} allowEmpty step={step} placeholder={placeholder}
          onChange={(next) => onValue(next ?? Number.NaN)} />
        <label className="unknown-number-field__unknown" htmlFor={`${id}-unknown`}>
          <input id={`${id}-unknown`} type="checkbox" checked={unknown}
            aria-label={`${label}: Weiß ich nicht`} aria-describedby={provenance ? `${id}-provenance` : undefined}
            onChange={(event) => {
              if (event.target.checked) onUnknown()
              else onValue(value ?? Number.NaN)
            }} />
          Weiß ich nicht
        </label>
        {provenance && <small id={`${id}-provenance`} className={`unknown-number-field__hint${unknown ? ' pec-prov--unknown' : ''}`}>{provenance}</small>}
      </div> : <UnknownNumberField
        label={label}
        value={hideAssumed && field.status === 'assumed' ? null : previousFieldValue(field) ?? null}
        placeholder={placeholder}
        status={field.status}
        step={step}
        onChange={(value, status) => {
          if (status === 'unknown') onUnknown()
          // An empty input stays invalid and editable. It is never confirmed as zero.
          else onValue(value ?? Number.NaN)
        }}
      />}
      {hint && <p className="onboarding-hint">{hint}</p>}
      {shownError && <p id={`${id}-error`} className="inventory-field-error">{shownError}</p>}
    </div>
  )
}
