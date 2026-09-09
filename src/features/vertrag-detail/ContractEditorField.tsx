import { useId, useLayoutEffect, useRef, useState } from 'react'
import { UnknownNumberField } from '../../ui/UnknownNumberField'
import { ProvLabel } from '../results/provenance'
import {
  contributionFieldId, draftFieldState, draftFieldValue,
  type ContractFieldSpec,
} from '../inventory/contractDraft'
import type { UseContractDraftApi } from '../inventory/useContractDraft'

interface Props extends Pick<UseContractDraftApi, 'draft' | 'patchField' | 'setFieldUnknown'> {
  spec: ContractFieldSpec
  error?: string
}

export function ContractEditorField({ draft, spec, patchField, setFieldUnknown, error }: Props) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const state = draftFieldState(draft, spec.id)
  const value = draftFieldValue(draft, spec.id)
  const field = draft.fields[spec.id]
  const previous = field?.status === 'unknown' ? field.previousValue : undefined
  const scale = spec.unit === 'ratio' ? 100 : 1
  const numericValue = typeof value === 'number' ? value : null
  const label = spec.id === 'currentValueEUR' ? 'Aktueller Wert (€)'
    : spec.id === contributionFieldId(draft.productId)
      ? draft.productId === 'bav' ? 'Dein monatlicher Bruttobeitrag (€)' : `${spec.label} (€)`
      : spec.id === 'contractStartYear' ? 'Jahr des Vertragsbeginns'
        : spec.id === 'contractualFixedMonthly' ? 'Zusätzlicher fester Arbeitgeberbeitrag (€/Monat)'
          : `${spec.label}${spec.unit === 'ratio' ? ' (%)' : spec.unit === 'EUR/Monat' ? ' (€/Monat)' : spec.unit === 'years' ? ' (Jahre)' : ''}`
  const hint = spec.id === 'monthlyGrossConversion'
    ? 'Deine Entgeltumwandlung vor Steuern und Sozialabgaben; ohne Arbeitgeberzuschuss.'
    : spec.id === 'contractualFixedMonthly' ? '0 bedeutet: kein zusätzlicher fester Arbeitgeberbeitrag.'
      : spec.unknownMode === 'assumed-default'
        ? 'Wenn du es nicht weißt, bleibt die hinterlegte Art als angenommen markiert.' : undefined
  const description = `${id}-status${hint ? ` ${id}-hint` : ''}${error ? ` ${id}-error` : ''}`
  const pending = state === 'empty'
  const unknownNumber = spec.kind === 'number' && spec.supportsUnknown

  // The shared primitive owns its IDs and has no required / description props.
  // Extend only the rendered input's accessibility attributes in this adapter.
  useLayoutEffect(() => {
    if (!unknownNumber) return
    const input = root.current?.querySelector<HTMLInputElement>('input[type="number"]')
    if (!input) return
    input.required = Boolean(spec.core && state !== 'unknown')
    input.setAttribute('aria-describedby', description)
    input.setAttribute('aria-invalid', String(Boolean(error)))
    root.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')
      ?.setAttribute('aria-describedby', description)
  }, [unknownNumber, spec.core, state, description, error])

  const statusText = pending ? 'Bitte eintragen oder „Weiß ich nicht“ wählen.'
    : state === 'assumed' ? 'Angenommen' : state === 'document' ? 'lt. Beleg'
      : state === 'unknown' ? 'Unbekannt' : 'Von dir angegeben'
  const step = (spec.step ?? 1) * scale
  const decimals = spec.unit === 'EUR' || spec.unit === 'EUR/Monat' ? 2
    : spec.unit === 'ratio' ? 3 : step < 1 ? 2 : 0
  const displayNumber = numericValue !== null && Number.isFinite(numericValue)
    ? Number((numericValue * scale).toFixed(decimals)).toString() : ''

  return (
    <div className="contract-editor__field" ref={root} data-contract-field={spec.id}>
      {unknownNumber ? (
        <UnknownNumberField
          label={label}
          value={state === 'unknown' && typeof previous === 'number' ? previous * scale : numericValue === null ? null : numericValue * scale}
          status={pending ? 'entered' : state}
          min={spec.min === undefined ? undefined : spec.min * scale}
          max={spec.max === undefined ? undefined : spec.max * scale}
          step={step} decimals={decimals}
          onChange={(next, status) => status === 'unknown'
            ? setFieldUnknown(spec.id)
            : patchField(spec.id, next === null ? Number.NaN : next / scale)}
        />
      ) : spec.kind === 'boolean' ? (
        <label className="contract-editor__check" htmlFor={id}>
          <input id={id} type="checkbox" checked={value === true} aria-describedby={description}
            onChange={(event) => patchField(spec.id, event.target.checked)} />
          <span>{label}</span>
        </label>
      ) : (
        <>
          <label htmlFor={id}>{label}</label>
          {spec.kind === 'select' ? (
            <select id={id} value={String(value ?? '')} aria-describedby={description} aria-invalid={Boolean(error)}
              onChange={(event) => event.target.value === '' ? setFieldUnknown(spec.id) : patchField(spec.id, event.target.value)}>
              {spec.supportsUnknown && <option value="">Weiß ich nicht</option>}
              {spec.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : spec.kind === 'number' ? (
            // Spec-only draft inputs: bounded display precision, full-precision
            // changes, and a blank stays invalid instead of becoming zero.
            <input id={id} type="number" inputMode="decimal" value={editingText ?? displayNumber}
              min={spec.min === undefined ? undefined : spec.min * scale}
              max={spec.max === undefined ? undefined : spec.max * scale} step={step}
              aria-describedby={description} aria-invalid={Boolean(error)} data-qa-sensitive="true"
              onChange={(event) => {
                setEditingText(event.target.value)
                patchField(spec.id, event.target.value.trim() === '' ? Number.NaN : Number(event.target.value) / scale)
              }} onBlur={() => setEditingText(null)} />
          ) : (
            <input id={id} type="text" value={String(value ?? '')} aria-describedby={description}
              aria-invalid={Boolean(error)} data-qa-sensitive="true"
              onChange={(event) => patchField(spec.id, event.target.value)} />
          )}
        </>
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      <small id={`${id}-status`}>
        {state === 'entered' && !pending ? <ProvLabel isModified /> : statusText}
      </small>
      {error && <p id={`${id}-error`} className="contract-editor__error">{error}</p>}
    </div>
  )
}

export function ContractEditorEvidence({ draft, spec, patchField }: Pick<Props, 'draft' | 'spec' | 'patchField'>) {
  const id = useId()
  const state = draftFieldState(draft, spec.id)
  const value = draftFieldValue(draft, spec.id)
  if (spec.kind !== 'number' || typeof value !== 'number' || !Number.isFinite(value) || state === 'unknown') return null

  return (
    <div className="contract-editor__evidence" role="group" aria-labelledby={`${id}-field`}>
      <span id={`${id}-field`}>{spec.label}</span>
      <label className="contract-editor__check" htmlFor={id}>
        <input id={id} type="checkbox" checked={state === 'document'} aria-describedby={`${id}-field`}
          onChange={(event) => patchField(spec.id, value, event.target.checked ? 'document' : 'entered')} />
        <span>Ich habe diesen Wert aus einem Beleg (z. B. Kontoauszug, Vertragsunterlagen) übernommen</span>
      </label>
    </div>
  )
}
