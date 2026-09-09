import type { PersonalProfile, ScenarioAssumptions } from '../../domain'
import { durationOfInstance, type DurationDescriptor } from '../../app/planSummary'
import type { AnyWorkspaceInstance } from '../../app/resultReadiness'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { formatCurrency, formatPercent } from '../../utils/format'
import type { VergleichTableRow } from './vergleichRows'

interface Props {
  row: VergleichTableRow
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  ownMoneyMonthly: number
  effectiveNetCost: number
  scenarioId: string
}

function durationLabel(duration: DurationDescriptor): string {
  switch (duration.kind) {
    case 'lifelong': return 'Lebenslang'
    case 'fixed-term': return `Für ${duration.years} Jahre · bis Alter ${duration.endAge}`
    case 'drawdown-shared-horizon': return `Entnahme geplant bis Alter ${duration.endAge} · gemeinsame Annahme`
    case 'avd-plan': return `Auszahlplan bis Alter ${duration.endAge}`
  }
}

export function VergleichResultCard({ row, profile, assumptions, ownMoneyMonthly, effectiveNetCost, scenarioId }: Props) {
  const entry = PRODUCT_REGISTRY.find((entry) => entry.metadata.id === row.productId)!
  const product = assumptions[entry.assumptionsKey]
  // The selector only reads payout fields. Compare assumptions have these same
  // fields, but deliberately have no workspace identity/status/evidence envelope.
  const duration = durationOfInstance(row.productId, product as unknown as AnyWorkspaceInstance,
    profile.retirementAge, assumptions.retirementEndAge)
  const fees = 'fees' in product ? product.fees : null
  const scenario = assumptions.returnScenarios.find((candidate) => candidate.id === scenarioId)
  const payoutMode = 'payoutMode' in product ? product.payoutMode : 'kapitalverzehr'
  const payoutLabel = payoutMode === 'zeitrente' ? 'Zeitrente'
    : payoutMode === 'kapitalverzehr' ? 'Kapitalverzehr'
      : payoutMode === 'certified_payout_plan' ? 'Zertifizierter Auszahlplan'
        : payoutMode === 'hybrid_80_annuity' ? 'Leibrente mit variablem Anteil' : 'Leibrente'

  return (
    <article className="vergleich-result-card" data-testid={`vergleich-result-${row.productId}`}
      aria-labelledby={`vergleich-result-title-${row.productId}`}>
      <h2 id={`vergleich-result-title-${row.productId}`}>{row.label}</h2>
      <div className="vergleich-result-number" data-qa-sensitive="true">{formatCurrency(row.netMonthlyPayout)}</div>
      <p className="vergleich-muted">Geschätzt · netto pro Monat</p>
      <p className="vergleich-result-duration"><strong>{durationLabel(duration)}</strong><br />
        <small>{duration.kind === 'lifelong' ? 'Auch wenn du älter wirst.' : 'Danach endet diese Auszahlung.'}</small>
      </p>
      <details className="vergleich-disclosure">
        <summary>Annahmen ansehen</summary>
        <dl className="vergleich-assumptions">
          <div><dt>Eigenes Geld pro Monat</dt><dd>{formatCurrency(ownMoneyMonthly, 2)}</dd></div>
          <div><dt>Effektiver Nettoaufwand im fairen Vergleich</dt><dd>{formatCurrency(effectiveNetCost, 2)} / Monat</dd></div>
          <div><dt>Kostenannahmen</dt><dd>{fees ? <>
            Mantel {formatPercent(fees.wrapperAssetFee, 2)} und Fonds {formatPercent(fees.fundAssetFee, 2)} p. a.;
            {' '}Beitragskosten {formatPercent(fees.contributionFee, 2)};
            {' '}fix {formatCurrency(fees.fixedMonthlyFee, 2)} / Monat;
            {' '}Abschluss {formatPercent(fees.acquisitionCostPct, 2)} über {fees.acquisitionCostSpreadYears} Jahre;
            {' '}Auszahlungskosten {formatPercent(fees.pensionPayoutFeePct, 2)}.
          </> : 'annualAssetFee' in product ? <>Fondskosten {formatPercent(product.annualAssetFee, 2)} p. a.</> : null}</dd></div>
          <div><dt>Auszahlung ab {profile.retirementAge}</dt><dd>{payoutLabel}</dd></div>
          {'rentenfaktor' in product && duration.kind === 'lifelong' && (
            <div><dt>Rentenfaktor je 10.000 € Kapital</dt><dd>{formatCurrency(product.rentenfaktor, 2)}</dd></div>
          )}
          <div><dt>Renditeszenario</dt><dd>{scenario?.label} · {formatPercent(scenario?.annualReturn ?? 0, 2)} p. a. vor Kosten</dd></div>
          <div><dt>Angaben für die Berechnung</dt><dd>{profile.age} Jahre · {formatCurrency(profile.grossSalaryYear)} brutto im Jahr · {profile.publicHealthInsurance ? 'GKV' : 'PKV'}</dd></div>
          {'monthlyOtherRetirementIncome' in product && (
            <div><dt>Weitere Einkünfte im Ruhestand</dt><dd>{formatCurrency(product.monthlyOtherRetirementIncome)} / Monat</dd></div>
          )}
        </dl>
        <p className="vergleich-muted">Hinterlegte Vergleichsannahmen, keine bestätigten Vertragsangebote.</p>
      </details>
    </article>
  )
}
