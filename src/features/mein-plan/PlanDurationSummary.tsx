import type { DurationDescriptor, PlanSourceRow } from '../../app/planSummary'
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
}

export function PlanDurationSummary({ rows, onEditSharedHorizon, onOpenKapital }: PlanDurationSummaryProps) {
  const sharedRows = rows.filter((row) => row.duration.kind === 'drawdown-shared-horizon')
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
      {sharedRows.length > 0 && <div className="plan-overview__notice">
        <p>Die gemeinsame Entnahmedauer gilt für {sharedRows.map((row) => row.label).join(', ')}.</p>
        <button type="button" className="plan-overview__link" onClick={onEditSharedHorizon}>Gemeinsame Entnahmedauer ändern</button>
      </div>}
      <button type="button" className="plan-overview__link" onClick={onOpenKapital}>Kapital im Verlauf ansehen →</button>
    </section>
  )
}
