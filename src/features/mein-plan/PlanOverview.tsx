import { useRef, type ReactNode } from 'react'
import type { PlanSummary, PlanSourceRow } from '../../app/planSummary'
import type { ReadinessReason } from '../../app/resultReadiness'
import { formatCurrency, formatPercent } from '../../utils/format'
import { formatInputStatusForExport } from '../results/provenanceHelpers'
import { PlanDurationText } from './PlanDurationSummary'
import './PlanOverview.css'

/**
 * An unsigned offer in the workspace (`status: 'offered'`). Offers never count
 * towards the household total, so they are listed apart from the source rows.
 */
export interface PlanOfferRow {
  instanceId: string
  label: string
  productLabel: string
  /** Quoted monthly contribution; `null` when unset. */
  contributionMonthly: number | null
  contributionLabel: string
}

/**
 * A `?topic=<slug>` arrival on an existing plan. Returning users keep their
 * data, so the intent is shown as a banner with the two useful next steps.
 */
export interface PlanTopicIntent {
  /** Product the topic page was about, e.g. "Private Rentenversicherung". */
  productLabel?: string
  /** Add a contract or offer of that product. Absent when the topic has no product. */
  onAddProduct?: () => void
  /** Open the generic example comparison for the topic's products. */
  onCompareExample: () => void
  onDismiss: () => void
}

export interface PlanOverviewAssumptions {
  age: number
  grossSalaryYear: number
  retirementAge: number
  pensionMethodLabel: string
  inflationRate: number
  /** Expected annual return of the scenario the total is computed on. */
  returnRate?: number
  returnScenarioLabel?: string
  /** Shared drawdown horizon for depots and Kapitalverzehr contracts. */
  retirementEndAge?: number
  /** Salary growth until retirement (EP-based statutory pension). */
  salaryGrowthRate?: number
  /** Growth of the Rentenwert until retirement. */
  pensionValueGrowthRate?: number
  /** Gross statutory pension in the retirement year, before tax and KV/PV. */
  statutoryGrossMonthly?: number
}

export interface PlanOverviewProps {
  summary: PlanSummary | null
  retirementAge: number
  hasStarted: boolean
  hasContracts: boolean
  savedAlternativeCount: number
  moneyBasis: 'real' | 'nominal'
  onToggleMoneyBasis: () => void
  targetMonthly?: number
  assumptions: PlanOverviewAssumptions
  notification?: { message: string; onUndo?: () => void }
  /** Unsigned offers, listed apart from the counted sources. */
  offers?: readonly PlanOfferRow[]
  onEditOffer?: (offer: PlanOfferRow) => void
  /** Opens the flow that evaluates the offer against the plan; hidden when absent. */
  onReviewOffer?: (offer: PlanOfferRow) => void
  topicIntent?: PlanTopicIntent
  onStart: () => void
  onAddContract: () => void
  onTryAlternative: () => void
  onOpenSavedAlternatives: () => void
  onEditProfile: () => void
  onEditPension: () => void
  onEditTarget: () => void
  onEditSource: (row: PlanSourceRow) => void
  onNavigateReason: (reason: ReadinessReason) => void
  onOpenDuration: () => void
  onOpenKapital: () => void
  onOpenMethode: () => void
  onOpenEingaben: () => void
  targetEditor?: ReactNode
  analysisOpen?: boolean
  onAnalysisToggle?: (open: boolean) => void
  children?: ReactNode
}

export function PlanOverview(props: PlanOverviewProps) {
  const { summary, retirementAge, hasStarted, hasContracts, moneyBasis, assumptions, notification } = props
  const offers = props.offers ?? []
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const hasInflation = assumptions.inflationRate > 0
  const statutoryRow = summary?.rows.find((row) => row.key === 'statutory')
  const openAssumptions = () => {
    const details = detailsRef.current
    if (!details) return
    details.open = true
    details.scrollIntoView?.({ block: 'start' })
    details.querySelector('summary')?.focus()
  }
  const canShow = !!summary?.readiness.canShowHouseholdTotal
    && summary.readiness.status !== 'error' && summary.readiness.status !== 'incomplete'
  const total = summary && (moneyBasis === 'real' ? summary.netMonthlyTotalReal : summary.netMonthlyTotalNominal)
  const limited = summary?.rows.filter((row) => row.duration.kind !== 'lifelong') ?? []
  const gap = canShow ? summary?.gap : undefined
  const targetMonthly = gap
    ? moneyBasis === 'real' ? gap.targetMonthly
      : summary && summary.deflator > 0 ? gap.targetMonthly / summary.deflator : null
    : null
  const targetGap = gap && (moneyBasis === 'real' ? gap.gapReal : gap.gapNominal)
  const targetBasis = moneyBasis === 'real' ? 'in heutigen Euro' : 'zum Rentenbeginn (nominal)'
  return (
    <section className="plan-overview">
      {notification && <div className="plan-overview__notice" role="status">
        <span>{notification.message}</span>
        {notification.onUndo && <button type="button" className="plan-overview__link" onClick={notification.onUndo}>Rückgängig</button>}
      </div>}
      {hasStarted && props.topicIntent && <div className="plan-overview__notice plan-overview__topic" role="status" data-testid="plan-topic-intent">
        <p><strong>Du hast schon einen Plan.</strong>{' '}
          {props.topicIntent.productLabel
            ? `${props.topicIntent.productLabel}: ergänze ein Angebot oder einen Vertrag in deinem Plan, oder vergleiche ein Beispiel ohne deine Daten.`
            : 'Ergänze deine Vorsorge in deinem Plan, oder vergleiche ein Beispiel ohne deine Daten.'}
        </p>
        <div className="plan-overview__actions">
          {props.topicIntent.onAddProduct && props.topicIntent.productLabel && <button type="button" className="plan-overview__secondary" onClick={props.topicIntent.onAddProduct}>{props.topicIntent.productLabel} ergänzen</button>}
          <button type="button" className="plan-overview__secondary" onClick={props.topicIntent.onCompareExample}>Beispiel vergleichen</button>
          <button type="button" className="plan-overview__link" onClick={props.topicIntent.onDismiss}>Ausblenden</button>
        </div>
      </div>}
      {!hasStarted ? <>
        <h1>Dein Plan beginnt hier.</h1>
        <p>Zwei kurze Schritte. Bestehende Verträge sind optional.</p>
        <button type="button" className="plan-overview__primary" onClick={props.onStart}>Meine Rente einschätzen</button>
      </> : <>
        <h1>Deine Rente im Überblick</h1>
        <div className="plan-overview__hero">
          <div className="plan-overview__figure">
            <p className="plan-overview__kicker">{canShow ? 'Geschätzt aus deinen Angaben' : summary?.readiness.status === 'error' ? 'Berechnung nicht möglich' : 'Noch offen'}</p>
            {canShow && total !== null && Number.isFinite(total) && <p className="plan-overview__number">{formatCurrency(total)}</p>}
            <p>Gesamt · netto pro Monat ab {retirementAge}</p>
            <p className="plan-overview__muted">{!hasInflation ? 'Ohne Inflationsannahme (nominal)' : moneyBasis === 'real' ? 'In heutigen Euro' : 'Zum Rentenbeginn (nominal)'}</p>
            <p className="plan-overview__muted">Deine erfassten Renten nach Steuern und Krankenversicherung</p>
          </div>
          {gap && <aside className="plan-overview__target">
            <p>Dein Wunsch: {targetMonthly !== null ? formatCurrency(targetMonthly) : '—'} · {targetBasis}</p>
            <p><strong>{targetGap !== undefined && targetGap > 0
              ? `Zur Wunschrente fehlen rechnerisch ${formatCurrency(targetGap)} pro Monat.`
              : 'Dein Wunsch ist in dieser Schätzung erreicht.'}</strong></p>
            <button type="button" className="plan-overview__link" onClick={props.onEditTarget}>Wunsch ändern</button>
          </aside>}
        </div>
        {canShow && <p className="plan-overview__assumption-line" data-testid="plan-assumption-line">
          <span>Annahmen dahinter:</span>
          {assumptions.returnRate !== undefined && <span>Rendite {formatPercent(assumptions.returnRate, 1)} p. a.{assumptions.returnScenarioLabel ? ` (${assumptions.returnScenarioLabel})` : ''}</span>}
          <span>Inflation {formatPercent(assumptions.inflationRate, 1)}</span>
          <span>Rente ab {assumptions.retirementAge}</span>
          {assumptions.retirementEndAge !== undefined && <span>Entnahme bis {assumptions.retirementEndAge}</span>}
          <span>Einkommen {formatPercent(assumptions.salaryGrowthRate ?? 0, 1)} p. a.</span>
          <span>Rentenwert {formatPercent(assumptions.pensionValueGrowthRate ?? 0, 1)} p. a.</span>
          <button type="button" className="plan-overview__link" onClick={openAssumptions}>Alle Annahmen</button>
        </p>}
        {!canShow && <div>
          <p>{summary?.readiness.status === 'error' ? 'Bitte prüfe deine Angaben und den Rechenweg.' : 'Für deine Gesamtrente fehlen noch Angaben.'}</p>
          <ul className="plan-overview__reasons">
            {summary?.readiness.blocking.map((reason, index) => <li key={`${reason.code}-${reason.instanceId ?? index}`}>
              <button type="button" className="plan-overview__link" onClick={() => props.onNavigateReason(reason)}>{reason.label}</button>
            </li>)}
          </ul>
        </div>}
        {!!summary?.readiness.assumptions.length && <ul className="plan-overview__assumptions" aria-label="Verwendete Annahmen">
          {summary.readiness.assumptions.map((reason, index) => <li key={`${reason.code}-${reason.instanceId ?? index}`}>
            <button type="button" className="plan-overview__link" onClick={() => props.onNavigateReason(reason)}>{reason.label}</button>
          </li>)}
        </ul>}
        {limited.length > 0 && <div className="plan-overview__notice">
          <p>{limited.length === 1 ? <>{limited[0].label}: <PlanDurationText duration={limited[0].duration} />.</> : <>{limited.length} Auszahlungen enden zeitlich.</>} Danach fällt dieser Teil weg.</p>
          <button type="button" className="plan-overview__link" onClick={props.onOpenDuration}>Dauer ansehen →</button>
        </div>}
        {!canShow && summary?.readiness.status !== 'error' && <p className="plan-overview__muted">Einzelbeträge erscheinen, sobald alle Angaben vorliegen. Steuern und Krankenversicherung hängen von allen Renten zusammen ab.</p>}
        {summary && summary.pkvRetirementMonthlyCost > 0 && <p className="plan-overview__notice">
          Private Kranken- und Pflegeversicherung, abzgl. Zuschuss § 106 SGB VI:
          {' '}{canShow ? `−${formatCurrency(summary.pkvRetirementMonthlyCost * (moneyBasis === 'real' ? summary.deflator : 1))} / Monat` : '—'}
          {' '}Bereits im Gesamtbetrag abgezogen. Heutige Beiträge ohne künftige Erhöhungen fortgeschrieben.
        </p>}
        <ul className="plan-overview__sources" aria-label="Deine Rentenquellen">
          {summary?.rows.map((row) => {
            const amount = moneyBasis === 'real' ? row.netMonthlyReal : row.netMonthlyNominal
            return <li key={row.key}>
              <button type="button" className="plan-overview__source" aria-label={`${row.label} bearbeiten`} onClick={() => props.onEditSource(row)}>
                <span>
                  <strong>{row.label}</strong>
                  <small><PlanDurationText duration={row.duration} /></small>
                  {row.contributionStatus === 'unknown'
                    ? <small>{row.contributionLabel}: unbekannt</small>
                    : row.contributionMonthly != null && <small>{row.contributionLabel}: {formatCurrency(row.contributionMonthly)} / Monat</small>}
                  <small>{row.provenanceLabel ?? (row.status === 'assumed' ? 'Angenommen' : formatInputStatusForExport(row.status))}</small>
                </span>
                <span className="plan-overview__amount">{canShow && row.status !== 'unknown' && Number.isFinite(amount) ? formatCurrency(amount) : '—'}</span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          })}
        </ul>
        {offers.length > 0 && <section className="plan-overview__offers" aria-labelledby="plan-overview-offers-title" data-testid="plan-offers">
          <h2 id="plan-overview-offers-title">Angebote, noch nicht abgeschlossen</h2>
          <p className="plan-overview__muted">Angebote zählen nicht zu deiner Rente oben. Prüfe, was sich ändern würde, bevor du unterschreibst.</p>
          <ul className="plan-overview__sources">
            {offers.map((offer) => <li key={offer.instanceId}>
              <div className="plan-overview__offer">
                <span>
                  <strong>{offer.label}</strong>
                  <small>{offer.productLabel} · Angebot</small>
                  {offer.contributionMonthly !== null && <small>{offer.contributionLabel} lt. Angebot: {formatCurrency(offer.contributionMonthly)} / Monat</small>}
                </span>
                <span className="plan-overview__actions">
                  {props.onReviewOffer && <button type="button" className="plan-overview__secondary" aria-label={`Angebot prüfen: ${offer.label}`} onClick={() => props.onReviewOffer?.(offer)}>Angebot prüfen</button>}
                  <button type="button" className="plan-overview__link" aria-label={`Angebot bearbeiten: ${offer.label}`} onClick={() => props.onEditOffer?.(offer)}>Bearbeiten</button>
                </span>
              </div>
            </li>)}
          </ul>
        </section>}
        <div className="plan-overview__actions">
          <button type="button" className="plan-overview__primary" onClick={props.onAddContract}>Vorsorge ergänzen</button>
          {hasContracts && <button type="button" className="plan-overview__secondary" onClick={props.onTryAlternative}>Änderung ausprobieren</button>}
          {props.savedAlternativeCount > 0 && <button type="button" className="plan-overview__secondary" onClick={props.onOpenSavedAlternatives}>Gespeicherte Alternativen ({props.savedAlternativeCount})</button>}
        </div>
        <div className="plan-overview__actions">
          <button type="button" className="plan-overview__link" onClick={props.onEditProfile}>Persönliche Angaben</button>
          <button type="button" className="plan-overview__link" onClick={props.onEditPension}>Rentenangabe</button>
          <button type="button" className="plan-overview__link" onClick={props.onEditTarget}>{props.targetMonthly !== undefined || summary?.gap ? 'Wunschrente' : 'Wunschrente ergänzen (optional)'}</button>
        </div>
        {props.targetEditor}
        <div className="plan-overview__disclosures">
        <details className="plan-overview__details" ref={detailsRef}>
          <summary>Angaben &amp; Annahmen prüfen</summary>
          <p>{assumptions.age} Jahre · {formatCurrency(assumptions.grossSalaryYear)} Jahreseinkommen vor Steuern · Rente ab {assumptions.retirementAge}.</p>
          <p>Rentenangabe: {assumptions.pensionMethodLabel}</p>
          <p>Inflation: {formatPercent(assumptions.inflationRate)} pro Jahr</p>
          {assumptions.returnRate !== undefined && <p>Rendite: {formatPercent(assumptions.returnRate)} pro Jahr{assumptions.returnScenarioLabel ? ` (Szenario „${assumptions.returnScenarioLabel}“)` : ''}</p>}
          <p>Einkommen bis zur Rente: {formatPercent(assumptions.salaryGrowthRate ?? 0)} pro Jahr · Rentenwert: {formatPercent(assumptions.pensionValueGrowthRate ?? 0)} pro Jahr{(assumptions.salaryGrowthRate ?? 0) === 0 && (assumptions.pensionValueGrowthRate ?? 0) === 0 ? ' (beides ohne Wachstum angesetzt)' : ''}</p>
          {assumptions.retirementEndAge !== undefined && <p>Entnahme aus Depots und Kapitalverzehr geplant bis Alter {assumptions.retirementEndAge}.</p>}
          {canShow && statutoryRow && assumptions.statutoryGrossMonthly !== undefined && assumptions.statutoryGrossMonthly > 0 && summary && <p className="plan-overview__muted" data-testid="plan-statutory-bridge">
            {statutoryRow.label} zum Rentenbeginn: {formatCurrency(assumptions.statutoryGrossMonthly)} brutto
            {' → '}{formatCurrency(statutoryRow.netMonthlyNominal)} netto nach Steuern und Kranken-/Pflegeversicherung
            {hasInflation && <>{' → '}{formatCurrency(statutoryRow.netMonthlyReal)} in heutigen Euro</>}.
            {' '}Deine Renteninformation nennt Bruttobeträge in Euro des Rentenbeginns; deshalb ist der Wert oben kleiner.
          </p>}
          {hasInflation && <button type="button" className="plan-overview__link" onClick={props.onToggleMoneyBasis} aria-pressed={moneyBasis === 'nominal'}>Beträge zum Rentenbeginn (nominal) anzeigen</button>}
          <div className="plan-overview__actions">
            <button type="button" className="plan-overview__secondary" onClick={props.onOpenMethode}>Weitere Annahmen &amp; Rechenweg</button>
            <button type="button" className="plan-overview__secondary" onClick={props.onOpenDuration}>Auszahlungen im Alter</button>
            <button type="button" className="plan-overview__secondary" onClick={props.onOpenEingaben}>Alle Eingaben</button>
          </div>
          <button type="button" className="plan-overview__link" onClick={props.onOpenKapital}>Kapital im Verlauf ansehen →</button>
        </details>
        {props.children != null && <details className="plan-overview__details" open={props.analysisOpen}
          onToggle={(event) => props.onAnalysisToggle?.(event.currentTarget.open)}><summary>Weitere Auswertungen</summary>{props.children}</details>}
        </div>
      </>}
    </section>
  )
}
