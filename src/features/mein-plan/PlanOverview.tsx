import type { ReactNode } from 'react'
import type { PlanSummary, PlanSourceRow } from '../../app/planSummary'
import type { ReadinessReason } from '../../app/resultReadiness'
import { formatCurrency, formatPercent } from '../../utils/format'
import { formatInputStatusForExport } from '../results/provenanceHelpers'
import { PlanDurationText } from './PlanDurationSummary'
import './PlanOverview.css'

export interface PlanOverviewProps {
  summary: PlanSummary | null
  retirementAge: number
  hasStarted: boolean
  hasContracts: boolean
  savedAlternativeCount: number
  moneyBasis: 'real' | 'nominal'
  onToggleMoneyBasis: () => void
  targetMonthly?: number
  assumptions: { age: number; grossSalaryYear: number; retirementAge: number; pensionMethodLabel: string; inflationRate: number }
  notification?: { message: string; onUndo?: () => void }
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
  const hasInflation = assumptions.inflationRate > 0
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
        {!canShow && <div>
          <p>{summary?.readiness.status === 'error' ? 'Bitte prüfe deine Angaben und den Rechenweg.' : 'Für deine Gesamtrente fehlen noch Angaben.'}</p>
          <ul className="plan-overview__reasons">
            {summary?.readiness.blocking.map((reason, index) => <li key={`${reason.code}-${reason.instanceId ?? index}`}>
              <button type="button" className="plan-overview__link" onClick={() => props.onNavigateReason(reason)}>{reason.label}</button>
            </li>)}
          </ul>
        </div>}
        {!!summary?.readiness.assumptions.length && <ul className="plan-overview__assumptions" aria-label="Verwendete Annahmen">
          {summary.readiness.assumptions.map((reason, index) => <li key={`${reason.code}-${reason.instanceId ?? index}`}>{reason.label}</li>)}
        </ul>}
        {limited.length > 0 && <div className="plan-overview__notice">
          <p>{limited.length === 1 ? <>{limited[0].label}: <PlanDurationText duration={limited[0].duration} />.</> : <>{limited.length} Auszahlungen enden zeitlich.</>} Danach fällt dieser Teil weg.</p>
          <button type="button" className="plan-overview__link" onClick={props.onOpenDuration}>Dauer ansehen →</button>
        </div>}
        {!canShow && summary?.readiness.status !== 'error' && <p className="plan-overview__muted">Einzelbeträge erscheinen, sobald alle Angaben vorliegen. Steuern und Krankenversicherung hängen von allen Renten zusammen ab.</p>}
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
        <details className="plan-overview__details">
          <summary>Angaben &amp; Annahmen prüfen</summary>
          <p>{assumptions.age} Jahre · {formatCurrency(assumptions.grossSalaryYear)} Jahreseinkommen vor Steuern · Rente ab {assumptions.retirementAge}.</p>
          <p>Rentenangabe: {assumptions.pensionMethodLabel}</p>
          <p>Inflation: {formatPercent(assumptions.inflationRate)} pro Jahr</p>
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
      </>}
    </section>
  )
}
