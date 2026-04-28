import './SummaryMetrics.css'
import { ResultMetric } from '../../ui/ResultMetric'
import { formatCurrency, formatNumber } from '../../utils/format'

type Props = {
  grvNetMonthlyPension: number
  grvProjectedEp: number
  grvGrossMonthlyPension: number
  bavMonthlyNetCost: number
  bavTotalMonthlyContribution: number
  bestCapital?: { afterTaxLumpSum: number; label: string }
  bestPension?: { netMonthlyPayout: number; label: string }
}

export function SummaryMetrics({
  grvNetMonthlyPension,
  grvProjectedEp,
  grvGrossMonthlyPension,
  bavMonthlyNetCost,
  bavTotalMonthlyContribution,
  bestCapital,
  bestPension,
}: Props) {
  return (
    <section className="summary-grid" aria-label="Kennzahlen">
      <ResultMetric
        label="GRV Nettorente"
        value={formatCurrency(grvNetMonthlyPension, 0)}
        detail={`${formatNumber(grvProjectedEp, 1)} EP · brutto ${formatCurrency(grvGrossMonthlyPension, 0)}`}
      />
      <ResultMetric
        label="bAV Nettoaufwand"
        value={formatCurrency(bavMonthlyNetCost, 0)}
        detail={`${formatCurrency(bavTotalMonthlyContribution, 0)} Beitrag mtl.`}
      />
      <ResultMetric
        label="Bestes Kapital"
        value={bestCapital ? formatCurrency(bestCapital.afterTaxLumpSum, 0) : '-'}
        detail={bestCapital?.label}
      />
      <ResultMetric
        label="Beste Netto-Rente"
        value={bestPension ? formatCurrency(bestPension.netMonthlyPayout, 0) : '-'}
        detail={bestPension?.label}
      />
    </section>
  )
}
