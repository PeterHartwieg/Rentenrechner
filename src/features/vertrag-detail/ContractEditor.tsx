import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { ContractEditorHostProps } from './VertragBearbeitenPage'
import { draftFieldValue } from '../inventory/contractDraft'
import { ContractEditorField } from './ContractEditorField'
import './ContractEditor.css'

export interface ContractEditorProps extends Pick<ContractEditorHostProps,
  'draft' | 'fieldSpecs' | 'patchField' | 'setFieldUnknown' | 'errors' | 'save'> {
  mode: 'new' | 'edit'
  productLabel: string
  retirementEndAge: number
  cancel: () => void
  back: () => void
  onEditSharedHorizon: () => void
  onOpenFurtherInputs: () => void
  remove?: () => void
  productHint?: string
}

export function ContractEditor(props: ContractEditorProps) {
  const { draft, fieldSpecs, errors } = props
  const id = useId()
  const summary = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const details = useRef<HTMLDetailsElement>(null)
  const [attempt, setAttempt] = useState(0)
  useLayoutEffect(() => { if (attempt > 0) summary.current?.focus() }, [attempt])
  const minimum = fieldSpecs.filter((spec) => spec.section === 'minimum' || spec.id === 'oldContractTaxFreeEligible')
  const extra = fieldSpecs.filter((spec) => !minimum.includes(spec))
  const costs = extra.filter((spec) => spec.section === 'fees' || spec.id === 'annualAssetFee')
  const sharedHorizon = draft.productId === 'etf' || draftFieldValue(draft, 'payoutMode') === 'kapitalverzehr'
  const renderField = (spec: (typeof fieldSpecs)[number]) => (
    <ContractEditorField key={spec.id} draft={draft} spec={spec}
      patchField={props.patchField} setFieldUnknown={props.setFieldUnknown}
      error={attempt > 0 ? errors[spec.id] : undefined} />
  )

  return (
    <section className="contract-editor" data-testid="contract-editor" aria-labelledby={`${id}-title`}>
      <button type="button" className="contract-editor__link" onClick={props.back}>
        ← {props.mode === 'new' ? 'Andere Sparform' : 'Zurück zum Plan'}
      </button>
      <header>
        <p className="contract-editor__kicker">{props.mode === 'new' ? 'Vorsorge ergänzen' : 'Vorsorge bearbeiten'}</p>
        <h1 id={`${id}-title`}>{props.productLabel}</h1>
        <p>Trage ein, was du weißt. Unbekannte Werte bleiben offen.</p>
        {props.productHint && <p className="contract-editor__note">{props.productHint}</p>}
      </header>
      <form ref={form} noValidate onSubmit={(event) => {
        event.preventDefault()
        if (!props.save()) {
          if (details.current && extra.some((spec) => errors[spec.id])) details.current.open = true
          setAttempt((current) => current + 1)
        }
      }}>
        {attempt > 0 && Object.keys(errors).length > 0 && (
          <div ref={summary} tabIndex={-1} role="alert" className="contract-editor__errors">
            <strong>Bitte prüfe deine Angaben.</strong>
            <ul>{fieldSpecs.filter((spec) => errors[spec.id]).map((spec) => (
              <li key={spec.id}><button type="button" className="contract-editor__link" onClick={() => {
                if (details.current && extra.includes(spec)) details.current.open = true
                const field = Array.from(form.current?.querySelectorAll<HTMLElement>('[data-contract-field]') ?? [])
                  .find((element) => element.dataset.contractField === spec.id)
                field?.querySelector<HTMLElement>('input, select')?.focus()
              }}>{spec.label}: {errors[spec.id]}</button></li>
            ))}</ul>
          </div>
        )}
        <fieldset>
          <legend>Dein Vertrag</legend>
          <div className="contract-editor__grid">{minimum.map(renderField)}</div>
        </fieldset>
        <details ref={details} className="contract-editor__details">
          <summary>Kosten & Auszahlung</summary>
          <fieldset>
            <legend>Vertragsdetails</legend>
            <div className="contract-editor__grid">{extra.filter((spec) => !costs.includes(spec)).map(renderField)}</div>
          </fieldset>
          <fieldset>
            <legend>Kosten</legend>
            <p className="contract-editor__note">Unbekannt ist nicht kostenlos. Der Wert bleibt als offen markiert.</p>
            <p className="contract-editor__note">Nicht bestätigte Kosten sind Annahmen. Die angezeigten Werte werden vorläufig für die Berechnung verwendet.</p>
            <details className="contract-editor__help">
              <summary>Wo finde ich die Kosten?</summary>
              <p>Im Kostenblatt deines Depots oder Vertrags. Bei Versicherungen können mehrere Kostenarten genannt sein. Übernimm die einzelnen Angaben aus deinen Unterlagen; bestätige nur Werte, die du kennst.</p>
            </details>
            <div className="contract-editor__grid">{costs.map(renderField)}</div>
          </fieldset>
          {sharedHorizon && <p className="contract-editor__note">
            Die gemeinsame Entnahmedauer bis Alter {props.retirementEndAge} gilt für alle Depots und Kapitalverzehr-Verträge.{' '}
            <a href="/eingaben" onClick={(event) => { event.preventDefault(); props.onEditSharedHorizon() }}>Gemeinsame Entnahmedauer ändern</a>
          </p>}
          <button type="button" className="contract-editor__link" onClick={props.onOpenFurtherInputs}>Weitere Angaben & Produktdetails</button>
        </details>
        <div className="contract-editor__actions">
          <button className="contract-editor__primary" type="submit">{props.mode === 'new' ? 'Zum Plan hinzufügen' : 'Änderungen übernehmen'}</button>
          <button className="contract-editor__secondary" type="button" onClick={props.cancel}>Abbrechen</button>
        </div>
        {props.mode === 'edit' && props.remove && <button type="button" className="contract-editor__link" onClick={props.remove}>Vorsorge entfernen</button>}
      </form>
    </section>
  )
}
