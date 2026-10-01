import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ROUTES } from '../../app/useRoute'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency } from '../../utils/format'
import type { AlternativenHostProps } from './AlternativenPage'
import { ALTERNATIVEN_COPY } from './useAlternativenFlow'
import { AlternativeComparison } from './AlternativeComparison'
import { alternativeDate, alternativeTotal, STORAGE_NOTE } from './alternativePresentation'
import { describeBaselineDrift } from './alternativeDrift'
import './AlternativenSurface.css'

/** What moved in the plan since this alternative was saved; empty for a current one. */
function DriftList({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  return <ul className="alternativen__drift" aria-label="Seit dem Speichern geändert">
    {lines.map((line) => <li key={line}>{line}</li>)}
  </ul>
}

export function AlternativenSurface(props: AlternativenHostProps) {
  const { contracts, draft, preview, saved, openWhatIfId, selectContract } = props
  const open = saved.find((item) => item.id === openWhatIfId)
  const contract = contracts.find((item) => item.instanceId === draft.instanceId)
  const [error, setError] = useState<string | null>(null)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const errorHeading = useRef<HTMLDivElement>(null)
  const focusRequested = useRef(false)

  // Selecting the sole contract is draft-only; it never confirms plan inputs.
  useEffect(() => {
    if (!openWhatIfId && !contract && contracts.length === 1) {
      selectContract(contracts[0].instanceId)
    }
  }, [contract, contracts, openWhatIfId, selectContract])

  useEffect(() => {
    if (!focusRequested.current) return
    const target = error || props.previewError ? errorHeading.current : resultHeading.current
    if (target) {
      target.focus()
      focusRequested.current = false
    }
  }, [preview, props.previewError, error, open, reviewId])

  function edit(change: () => void) {
    setError(null)
    props.invalidatePreview()
    change()
  }
  function runPreview() {
    setError(null)
    focusRequested.current = true
    props.runPreview()
  }
  function apply(id: string) {
    const result = props.apply(id)
    if (!result.ok) {
      focusRequested.current = true
      setError(result.message)
    } else {
      props.onReturnToPlan()
    }
  }
  function applyPreview() {
    // addWhatIf uses a React updater, while apply reads the committed workspace.
    // Flush the explicit save before applying so both operations see the same id.
    let id: string | null = null
    flushSync(() => { id = props.saveAlternative() })
    if (id !== null) apply(id)
  }
  function openSavedView(id: string) {
    setError(null)
    props.invalidatePreview()
    props.openSaved(id)
  }
  function startNew() {
    setError(null)
    setReviewId(null)
    props.invalidatePreview()
    props.selectContract(null)
    props.openSaved(null)
  }
  // Audit F03: name the action the user is about to apply. Only a plain
  // contribution change is a "Beitrag"; an offer is taken into the plan, and
  // anything else (paid-up, new contract, undescribed) is a generic change.
  const applyLabel = (decision: string) => decision === 'contribution'
    ? 'Beitrag in meinen Plan übernehmen'
    : decision === 'activate_offer'
      ? 'Angebot in meinen Plan aufnehmen'
      : 'Änderung in meinen Plan übernehmen'
  const failure = error ?? props.previewError
  const savedScenario = props.whatIfs.find((item) => item.id === open?.id)
  const driftFor = (id: string): string[] => {
    const scenario = props.whatIfs.find((item) => item.id === id)
    return scenario ? describeBaselineDrift(scenario.derivedFromBaselineSnapshot, props.workspace.baseline) : []
  }
  function rebase(id: string) {
    const result = props.rebase(id)
    focusRequested.current = true
    if (result.ok) { setError(null); setReviewId(id) }
    else setError(result.message)
  }

  return <section className="alternativen-page" data-testid="alternativen">
    <header>
      <p className="alternativen__kicker">{open ? 'Gespeicherte Alternative' : 'Änderung ausprobieren'}</p>
      <h1 data-testid={open ? 'alternativen-open' : undefined}>{open ? open.label : contracts.length ? 'Was wäre, wenn …?' : 'Welche Vorsorge möchtest du verändern?'}</h1>
      {open ? <p className="alternativen__muted">Stand beim Speichern: {alternativeDate(open.savedAt)}</p>
        : <p className="alternativen__lead">{contracts.length ? 'Du kannst Änderungen erst ansehen und dann übernehmen.' : 'Ergänze zuerst eine Sparform in deinem Plan.'}</p>}
    </header>

    {props.notification && <div role="status" className="alternativen__notice">
      <span>{props.notification.message}</span>{props.notification.canUndo && <button type="button" className="alternativen__link" onClick={props.undo}>Rückgängig</button>}
    </div>}

    {open ? <>
      {open.status === 'stale' && <div role="alert" className="alternativen__notice">
        <p>Dein Plan hat sich seit dem Speichern geändert. Die Beträge unten gelten für den gespeicherten Stand.</p>
        <DriftList lines={driftFor(open.id)} />
        <p className="alternativen__muted">Neu berechnen rechnet die Alternative mit deinen heutigen Angaben. Der gespeicherte Stand bleibt sonst so, wie er war.</p>
        <div className="alternativen__actions">
          <button type="button" className="alternativen__secondary" onClick={() => rebase(open.id)}>Mit aktuellem Plan neu berechnen</button>
          <button type="button" className="alternativen__link" onClick={() => resultHeading.current?.focus()}>Gespeicherten Stand ansehen</button>
        </div>
      </div>}
      {(open.status === 'shape-drift' || open.status === 'missing-source') && <p role="alert" className="alternativen__notice">{open.blockReason ?? (open.status === 'shape-drift' ? ALTERNATIVEN_COPY.shapeDrift : ALTERNATIVEN_COPY.missingSource)}</p>}
      <div aria-live="polite" aria-atomic="true">
        <AlternativeComparison before={open.before} after={open.after} description={open.description}
          showApplyNote={open.status === 'current'}
          retirementAge={savedScenario?.derivedFromBaselineSnapshot.profile.retirementAge}
          heading={reviewId === open.id && open.status === 'current' ? 'Änderung prüfen' : 'Vorher und nachher'} headingRef={resultHeading} />
      </div>
      <div className="alternativen__actions">
        {open.status === 'current' && open.canApply && <button type="button" className="alternativen__primary" onClick={() => apply(open.id)}>{applyLabel(open.description.decision)}</button>}
        <button type="button" className="alternativen__secondary" onClick={startNew}>Neue Änderung ausprobieren</button>
        <button type="button" className="alternativen__link" onClick={() => { setError(null); props.remove(open.id) }}>Entfernen</button>
      </div>
      <p className="alternativen__muted">{STORAGE_NOTE}</p>
    </> : <>
      {!contracts.length ? <div className="alternativen__actions"><button type="button" className="alternativen__primary" onClick={() => props.navigate(ROUTES.vorsorgeNeu)}>Sparform ergänzen</button></div> : <form className="alternativen__form" onSubmit={(event) => { event.preventDefault(); runPreview() }}>
        {contracts.length === 1 ? <p><strong>{contracts[0].label}</strong></p> : <label className="alternativen__field">Sparform
          <select value={draft.instanceId ?? ''} onChange={(event) => edit(() => props.selectContract(event.target.value || null))}>
            <option value="">Sparform auswählen</option>
            {contracts.map((item) => <option key={item.instanceId} value={item.instanceId}>{item.label}</option>)}
          </select>
        </label>}
        {contract && <>
          <label className="alternativen__field">Änderung
            <select value={draft.decision} disabled={!contract.allowedDecisions.length} onChange={(event) => edit(() => props.setDecision(event.target.value === 'paid_up' ? 'paid_up' : 'contribution'))}>
              {contract.allowedDecisions.includes('contribution') && <option value="contribution">Monatlichen Beitrag ändern</option>}
              {contract.allowedDecisions.includes('paid_up') && <option value="paid_up">Keine weiteren Beiträge zahlen</option>}
            </select>
          </label>
          {!contract.allowedDecisions.length ? <p>Für diese Sparform ist keine weitere Beitragsänderung verfügbar.</p> : draft.decision === 'paid_up'
            ? <p>Das vorhandene Guthaben bleibt bestehen.</p>
            : <>
              <NumberField key={contract.instanceId}
                label={contract.contributionKind === 'grossConversion' ? 'Neuer monatlicher Bruttobeitrag zur bAV in €' : 'Neuer monatlicher Beitrag in €'}
                value={draft.newContribution} min={0} step={1} decimals={2} allowEmpty required
                onChange={(value) => edit(() => props.setContribution(value))} />
              <p className="alternativen__muted">Bisher: {contract.contributionStatus === 'unknown' || contract.contributionMonthly === null ? 'unbekannt' : `${formatCurrency(contract.contributionMonthly)} / Monat`}</p>
            </>}
        </>}
        <button type="submit" className="alternativen__primary" disabled={!!contract && !contract.allowedDecisions.length}>Vorher und nachher ansehen</button>
      </form>}
      <div aria-live="polite" aria-atomic="true">
        {preview && <>
          <AlternativeComparison before={preview.before} after={preview.after} delta={preview.delta} description={preview.description}
            retirementAge={preview.whatIf.derivedFromBaselineSnapshot.profile.retirementAge} headingRef={resultHeading} />
          <div className="alternativen__actions">
            <button type="button" className="alternativen__secondary" onClick={() => { const id = props.saveAlternative(); if (id !== null) openSavedView(id) }}>Alternative speichern</button>
            <button type="button" className="alternativen__primary" onClick={applyPreview}>{applyLabel(preview.description.decision)}</button>
          </div>
          <p className="alternativen__muted">{STORAGE_NOTE}</p>
        </>}
      </div>
      <section className="alternativen__saved" aria-label="Deine gespeicherten Alternativen">
        <h2>Deine gespeicherten Alternativen</h2>
        {!saved.length ? <p data-testid="alternativen-empty">Noch keine Alternative gespeichert.</p> : <ul>
          {saved.map((item) => <li key={item.id} data-status={item.status}>
            <h3>{item.label}</h3>
            {item.status === 'stale' && <span className="alternativen__badge">Plan seit dem Speichern geändert</span>}
            <p className="alternativen__list-total">{item.before?.readiness.canShowHouseholdTotal && item.after?.readiness.canShowHouseholdTotal
              ? `${alternativeTotal(item.before)} → ${alternativeTotal(item.after)} netto / Monat` : 'Noch offen'}
              {' '}<small>in heutigen Euro · Stand beim Speichern</small></p>
            <p className="alternativen__muted">Stand beim Speichern: {alternativeDate(item.savedAt)}</p>
            {item.status === 'stale' && <>
              <p className="alternativen__muted">Diese Beträge beruhen auf älteren Angaben und sind mit neueren Alternativen nicht direkt vergleichbar.</p>
              <DriftList lines={driftFor(item.id)} />
            </>}
            <div className="alternativen__actions">
              <button type="button" className="alternativen__secondary" onClick={() => openSavedView(item.id)}>Vorher und nachher öffnen</button>
              {item.status === 'stale' && <button type="button" className="alternativen__secondary" onClick={() => rebase(item.id)}>Mit aktuellem Plan neu berechnen</button>}
              <button type="button" className="alternativen__link" onClick={() => props.remove(item.id)}>Entfernen</button>
            </div>
          </li>)}
        </ul>}
      </section>
    </>}
    {failure && <div role="alert" tabIndex={-1} ref={errorHeading} className="alternativen__notice">
      <p>{failure}</p>
      {!open && props.previewError && <button type="button" className="alternativen__secondary" onClick={runPreview}>Erneut versuchen</button>}
    </div>}
    <div className="alternativen__actions"><button type="button" className="alternativen__link" onClick={props.onReturnToPlan}>Zurück zum Plan</button></div>
  </section>
}
