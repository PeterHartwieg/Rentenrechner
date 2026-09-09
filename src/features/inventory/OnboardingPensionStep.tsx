import { useEffect, useId, useRef } from 'react'
import type { UseOnboardingDraftApi } from './useOnboardingDraft'
import { pensionMethodsForSystem, type PensionDraftErrors, type PensionSystem, type RetirementHealthStatusValue } from './onboardingDraft'
import { formatCurrency, formatNumber } from '../../utils/format'
import { OnboardingDisclosure, OnboardingNumberField } from './OnboardingFields'

export function OnboardingPensionStep({ draft, errors, mode }: {
  mode: 'onboarding' | 'edit'
  draft: UseOnboardingDraftApi
  errors: PensionDraftErrors
}) {
  const id = useId()
  const { pension, profile, patchPension, setPensionValue, setFieldUnknown, estimate } = draft
  const { system, method } = pension
  const stepRef = useRef<HTMLDivElement>(null)
  const previousView = useRef(`${system}:${method}`)
  useEffect(() => {
    // Method buttons can disappear after activation. Keep the next Tab inside
    // the dialog by focusing the newly revealed field only when focus was lost.
    const view = `${system}:${method}`
    const changed = previousView.current !== view
    previousView.current = view
    if (changed && document.activeElement === document.body) {
      stepRef.current?.querySelector<HTMLElement>('input[type="number"], select, input')?.focus()
    }
  }, [method, system])
  const estimating = method === 'career' || method === 'years' || method === 'points'
  const numberField = (
    key: 'monthlyGrossEUR' | 'careerStartAge' | 'pauseYears' | 'contributionYears' | 'entgeltpunkte' | 'versorgungswerkMonthlyContribution' | 'versorgungswerkEmployerMonthly',
    label: string, hint?: string, step = key === 'monthlyGrossEUR' || key === 'versorgungswerkMonthlyContribution' || key === 'versorgungswerkEmployerMonthly' ? 0.01 : 1,
  ) => <OnboardingNumberField key={key} label={label} field={pension[key]} error={errors[key]}
      hideAssumed={mode === 'onboarding'} placeholder={key === 'careerStartAge' ? 'z. B. 22' : undefined} hint={hint} step={step}
    onValue={(value) => setPensionValue(key, value)} onUnknown={() => setFieldUnknown('pension', key)} />

  const systemSelect = <label className="onboarding-select" htmlFor={`${id}-system`}>Deine Altersversorgung
    <select id={`${id}-system`} value={system} onChange={(event) => {
      const next = event.target.value as PensionSystem
      patchPension('system', next)
      if (next !== 'none' && !pensionMethodsForSystem(next).includes(method)) {
        patchPension('method', next === 'grv' ? 'career' : 'projected-gross')
      }
    }}>
      <option value="grv">Gesetzliche Rentenversicherung</option>
      <option value="versorgungswerk">Versorgungswerk</option>
      <option value="beamtenpension">Beamtenversorgung</option>
      <option value="none">Keine Pflichtversorgung</option>
    </select>
  </label>

  return (
    <div ref={stepRef} className="onboarding-step" data-testid="onboarding-pension-step">
      {profile.employment.value !== 'employee' || system !== 'grv' ? systemSelect
        : <OnboardingDisclosure title="Andere Altersversorgung">{systemSelect}</OnboardingDisclosure>}
      {system === 'grv' && <>
        <fieldset className="onboarding-methods" aria-describedby={errors.method ? `${id}-method-error` : undefined}>
          <legend>Gesetzliche Rente</legend>
          <label className="onboarding-choice"><input type="radio" name={`${id}-method`} checked={method === 'document' || method === 'projected-gross'}
            onChange={() => patchPension('method', 'document')} />Renteninformation liegt vor</label>
          <label className="onboarding-choice"><input type="radio" name={`${id}-method`} checked={estimating}
            onClick={() => patchPension('method', 'career')} onChange={() => patchPension('method', 'career')} />Ohne Unterlagen grob schätzen</label>
          <label className="onboarding-choice"><input type="radio" name={`${id}-method`} checked={method === 'skipped'}
            onChange={() => patchPension('method', 'skipped')} />Später ergänzen</label>
        </fieldset>
        {(method === 'document' || method === 'projected-gross') && <>
          {numberField('monthlyGrossEUR', 'Monatsrente aus deiner Renteninformation (€ brutto)')}
          <OnboardingDisclosure title="Welche Zahl ist gemeint?">
            {/* Checked against the DRV annotated Renteninformation (2025), page 1:
                https://www.deutsche-rentenversicherung.de/SharedDocs/Downloads/DE/Presse/Pressemappen/welche_info_enthaelt_meine_renteninfo.pdf?__blob=publicationFile&v=4 */}
            <p>Die hochgerechnete Regelaltersrente, wenn du weiter Beiträge wie bisher zahlst. Nimm den Betrag ohne künftige Rentenanpassungen.</p>
            <p>Du findest ihn unter „Höhe Ihrer künftigen Regelaltersrente“ als zweiten Betrag. Er setzt Beiträge wie im Durchschnitt der letzten fünf Kalenderjahre voraus.</p>
            <p className="onboarding-hint">Brutto heißt: Steuern und Krankenversicherung sind noch nicht abgezogen.</p>
          </OnboardingDisclosure>
        </>}
        {estimating && <>
          {method === 'career' && <>
            {numberField('careerStartAge', 'Mit welchem Alter hast du angefangen zu arbeiten?', 'Ungefähr reicht. Eine bezahlte Ausbildung kannst du als Start nehmen.')}
            <OnboardingDisclosure title="Pausen berücksichtigen">
              {numberField('pauseYears', 'Jahre ohne Arbeit (grob)', 'Nur eine Arbeitshilfe. Die tatsächlich angerechneten Zeiten können abweichen.', 0.5)}
            </OnboardingDisclosure>
          </>}
          {method === 'years' && numberField('contributionYears', 'Bisherige Beitragsjahre', 'Falls du die Zahl kennst, etwa aus deinem Versicherungsverlauf.', 0.5)}
          {method === 'points' && numberField('entgeltpunkte', 'Bisherige Entgeltpunkte', 'Die bisher gesammelten Entgeltpunkte stehen auf der Rückseite deiner Renteninformation.', 0.0001)}
          {method !== 'career' && <button type="button" className="onboarding-text-button" onClick={() => patchPension('method', 'career')}>Berufsstart verwenden</button>}
          {method !== 'years' && <OnboardingDisclosure title="Ich kenne meine Beitragsjahre">
            <button type="button" className="onboarding-text-button" onClick={() => patchPension('method', 'years')}>Beitragsjahre direkt eingeben</button>
          </OnboardingDisclosure>}
          {method !== 'points' && <OnboardingDisclosure title="Entgeltpunkte direkt eingeben">
            <button type="button" className="onboarding-text-button" onClick={() => patchPension('method', 'points')}>Entgeltpunkte verwenden</button>
          </OnboardingDisclosure>}
        </>}
      </>}
      {(system === 'versorgungswerk' || system === 'beamtenpension') && <>
        <fieldset className="onboarding-methods">
          <legend>{system === 'beamtenpension' ? 'Deine Beamtenversorgung' : 'Deine Versorgung'}</legend>
          <label className="onboarding-choice"><input type="radio" name={`${id}-method`} checked={method !== 'skipped'}
            onChange={() => patchPension('method', 'projected-gross')} />Voraussichtliche Monatsversorgung angeben</label>
          <label className="onboarding-choice"><input type="radio" name={`${id}-method`} checked={method === 'skipped'}
            onChange={() => patchPension('method', 'skipped')} />Später ergänzen</label>
        </fieldset>
        {method !== 'skipped' && numberField('monthlyGrossEUR', 'Voraussichtliche Monatsversorgung (€ brutto)', 'Zum Beispiel aus deiner Versorgungsauskunft.')}
        {system === 'versorgungswerk' && <div className="onboarding-grid">
          {numberField('versorgungswerkMonthlyContribution', 'Eigener Beitrag zum Versorgungswerk (€/Monat)')}
          {numberField('versorgungswerkEmployerMonthly', 'Arbeitgeberbeitrag zum Versorgungswerk (€/Monat)')}
        </div>}
      </>}
      {errors.method && <p id={`${id}-method-error`} className="inventory-field-error">{errors.method}</p>}
      {system !== 'none' && method === 'skipped' && <p className="onboarding-hint">Das ist okay. Ergänze zuerst, was du schon weißt. Die Gesamtrente bleibt offen.</p>}
      {system === 'none' && <p className="onboarding-hint">Du hast keine Pflichtversorgung angegeben. Weitere Vorsorge kannst du in deinem Plan ergänzen.</p>}
      {system !== 'none' && method !== 'skipped' && Object.keys(errors).length === 0 && (
        estimate.ok ? <section className="onboarding-estimate" aria-label="Deine Rentenangabe">
          <dl>
            {estimate.contributionYears !== null && <div><dt>Bisherige Beitragsjahre · geschätzt</dt><dd>{formatNumber(estimate.contributionYears, 1)}</dd></div>}
            {estimate.entgeltpunkte !== null && <div><dt>Entgeltpunkte{method !== 'points' ? ' · geschätzt' : ''}</dt><dd>{formatNumber(estimate.entgeltpunkte, 2)}</dd></div>}
            <div><dt>{estimating ? 'Bisher erworbene Monatsrente · brutto' : 'Voraussichtliche Monatsrente · brutto'}</dt><dd>{formatCurrency(estimate.monthlyGrossEUR)}</dd></div>
          </dl>
          {method === 'career' && <p>Grob aus Berufsstart und Pausen geschätzt.</p>}
          {method === 'years' && <p>Grob aus Beitragsjahren und heutigem Einkommen geschätzt.</p>}
          <OnboardingDisclosure title="Wie entsteht diese Zahl?">
            {(method === 'career' || method === 'years') && <p>Wir verwenden dein heutiges Einkommen als Näherung. Tatsächlich angerechnete Zeiten und frühere Einkommen können abweichen.</p>}
            <p className="onboarding-hint">{estimate.note}</p>
            {estimating && <p className="onboarding-hint">Das ist der bisher erworbene Anspruch, keine Hochrechnung bis zum Rentenbeginn.</p>}
          </OnboardingDisclosure>
        </section> : <p className="onboarding-hint">{estimate.message}</p>
      )}
      <OnboardingDisclosure title="Weitere Rentenangaben">
        <label className="onboarding-select" htmlFor={`${id}-retirement-health`}>Krankenversicherung im Ruhestand
          <select id={`${id}-retirement-health`} value={pension.retirementHealthStatus.value ?? ''}
            onChange={(event) => setPensionValue('retirementHealthStatus', event.target.value as RetirementHealthStatusValue)}>
            <option value="" disabled>Bitte auswählen</option>
            <option value="kvdr">Gesetzlich pflichtversichert (KVdR)</option>
            <option value="freiwillig_gkv">Freiwillig gesetzlich versichert</option>
            <option value="pkv">Privat versichert</option>
          </select>
        </label>
      </OnboardingDisclosure>
    </div>
  )
}
