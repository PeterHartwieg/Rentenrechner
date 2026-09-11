import type { DurationDescriptor, PlanSourceRow } from '../../app/planSummary'
import { formatCurrency } from '../../utils/format'
import { checkpointAges, isPayingAt } from './durationCheckpoints'
import './PlanOverview.css'

/** Shared copy component: duration is supplied by state, never inferred from product. */
export function PlanDurationText({ duration }: { duration: DurationDescriptor }) {
  switch (duration.kind) {
    case 'lifelong': return <>Lebenslang</>
    case 'fixed-term': return <>Für {duration.years} Jahre · bis Alter {duration.endAge}</>
    case 'drawdown-shared-horizon': return <>Entnahme geplant bis Alter {duration.endAge} · gemeinsame Annahme</>
    case 'avd-plan': return <>Auszahlplan bis Alter {duration.endAge}</>
  }
}

export interface PlanDurationSummaryProps {
  rows: readonly PlanSourceRow[]
  onEditSharedHorizon: () => void
  onOpenKapital: () => void
  /** Adds the retirement age as the first checkpoint column. */
  retirementAge?: number
  /** Wunschrente in heutigen Euro, shown next to the checkpoints for orientation. */
  targetMonthly?: number
  /**
   * Whether per-source euro amounts may appear at all. The caller derives this
   * from the household readiness (`canShowHouseholdTotal` and no error /
   * incomplete state), the same guard `PlanOverview` uses. Row nets are the
   * output of one household-level tax + KV/PV run, so they are meaningless
   * while that run is blocked, even when individual rows carry a number.
   */
  canShowAmounts: boolean
}

/**
 * Which money keeps coming, and until when.
 *
 * The checkpoint table deliberately shows no summed income per age. The
 * household total is one aggregate tax + KV/PV run (`planSummary.ts`
 * invariant 1); the income left after a source ends is not the total minus
 * that source's row, and this surface must not pretend otherwise. It names
 * the sources still paying at each age and the row amounts at retirement.
 *
 * Amounts are gated by `canShowAmounts` only; the duration text and the
 * paying / ended markers stay useful without them.
 */
export function PlanDurationSummary({ rows, onEditSharedHorizon, onOpenKapital, retirementAge, targetMonthly, canShowAmounts }: PlanDurationSummaryProps) {
  const sharedRows = rows.filter((row) => row.duration.kind === 'drawdown-shared-horizon')
  const ages = checkpointAges(retirementAge)
  const ending = rows
    .filter((row) => row.duration.kind !== 'lifelong')
    .map((row) => ({ row, endAge: (row.duration as Exclude<DurationDescriptor, { kind: 'lifelong' }>).endAge }))
    .sort((a, b) => a.endAge - b.endAge)
  const firstEnding = ending[0]
  const rowAmount = (row: PlanSourceRow): number | null =>
    canShowAmounts && row.status !== 'unknown' && Number.isFinite(row.netMonthlyReal) ? row.netMonthlyReal : null
  const firstEndingAmount = firstEnding ? rowAmount(firstEnding.row) : null
  return (
    <section className="plan-overview plan-duration-summary">
      <h1>Wie lange kommt welches Geld?</h1>
      <p>Der Gesamtbetrag gilt nicht automatisch ein Leben lang.</p>
      <ul className="plan-overview__sources">
        {rows.map((row) => <li key={row.key} className="plan-duration-summary__row">
          <strong>{row.label}</strong>
          <span><PlanDurationText duration={row.duration} /></span>
          <small>{row.duration.kind === 'lifelong'
            ? 'Eine lebenslange Auszahlung ist hier angenommen.'
            : 'Danach endet diese Auszahlung.'}</small>
        </li>)}
      </ul>
      {firstEnding && <div className="plan-overview__notice" role="note" data-testid="plan-duration-cutoff">
        <p><strong>Ab Alter {firstEnding.endAge} fällt {firstEnding.row.label} weg</strong>
          {firstEndingAmount !== null
            ? <> ({formatCurrency(firstEndingAmount)} pro Monat in heutigen Euro, Stand Rentenbeginn)</>
            : null}.
          {' '}Was danach netto bleibt, hängt von Steuer und Krankenversicherung auf die übrigen Einkünfte ab. Diese Summe rechnen wir hier nicht aus; die Tabelle zeigt, welche Quellen dann noch zahlen.</p>
      </div>}
      {rows.length > 0 && <div className="plan-duration-summary__scroll" role="region" aria-label="Quellen je Alter" tabIndex={0}>
        <table className="plan-duration-summary__table" data-testid="plan-duration-checkpoints">
          <caption>Welche Quelle zahlt noch? Beträge pro Monat in heutigen Euro, Stand Rentenbeginn.</caption>
          <thead>
            <tr>
              <th scope="col">Quelle</th>
              <th scope="col" className="plan-duration-summary__num">Ab Rentenbeginn</th>
              {ages.map((age) => <th key={age} scope="col" className="plan-duration-summary__num">Mit {age}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const amount = rowAmount(row)
              return <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td className="plan-duration-summary__num">{amount !== null ? formatCurrency(amount) : '—'}</td>
              {ages.map((age) => {
                const paying = isPayingAt(row.duration, age)
                return <td key={age} className="plan-duration-summary__num" data-paying={paying ? 'true' : 'false'}>
                  <span aria-hidden="true">{paying ? '●' : '–'}</span>
                  <span className="plan-duration-summary__sr">{paying ? 'zahlt' : 'endet vorher'}</span>
                </td>
              })}
              </tr>
            })}
          </tbody>
          {targetMonthly !== undefined && targetMonthly > 0 && <tfoot>
            <tr>
              <th scope="row">Dein Wunsch</th>
              <td className="plan-duration-summary__num">{formatCurrency(targetMonthly)}</td>
              {ages.map((age) => <td key={age} className="plan-duration-summary__num"><span aria-hidden="true">●</span><span className="plan-duration-summary__sr">gilt weiter</span></td>)}
            </tr>
          </tfoot>}
        </table>
      </div>}
      {sharedRows.length > 0 && <div className="plan-overview__notice">
        <p>Die gemeinsame Entnahmedauer gilt für {sharedRows.map((row) => row.label).join(', ')}.</p>
        <button type="button" className="plan-overview__link" onClick={onEditSharedHorizon}>Gemeinsame Entnahmedauer ändern</button>
      </div>}
      <button type="button" className="plan-overview__link" onClick={onOpenKapital}>Kapital im Verlauf ansehen →</button>
    </section>
  )
}
