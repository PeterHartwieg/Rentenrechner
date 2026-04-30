import './SummaryMetrics.css'
import { ResultMetric } from '../../ui/ResultMetric'
import { formatCurrency, formatNumber } from '../../utils/format'

type Props = {
  grvNetMonthlyPension: number
  grvProjectedEp: number
  grvGrossMonthlyPension: number
  bavMonthlyNetCost: number
  bavTotalMonthlyContribution: number
}

export function SummaryMetrics({
  grvNetMonthlyPension,
  grvProjectedEp,
  grvGrossMonthlyPension,
  bavMonthlyNetCost,
  bavTotalMonthlyContribution,
}: Props) {
  const showBav = bavTotalMonthlyContribution > 0
  return (
    <section className="summary-grid" aria-label="Rahmenwerte">
      <ResultMetric
        label="Gesetzliche Rente netto"
        value={formatCurrency(grvNetMonthlyPension, 0)}
        detail={`${formatNumber(grvProjectedEp, 1)} EP · brutto ${formatCurrency(grvGrossMonthlyPension, 0)}`}
      />
      {showBav && (
        <ResultMetric
          label="bAV Nettoaufwand mtl."
          value={formatCurrency(bavMonthlyNetCost, 0)}
          detail={`${formatCurrency(bavTotalMonthlyContribution, 0)} Beitrag mtl.`}
        />
      )}
    </section>
  )
}
