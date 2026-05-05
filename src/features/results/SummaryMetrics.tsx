import './SummaryMetrics.css'
import { ResultMetric } from '../../ui/ResultMetric'
import { formatCurrency, formatNumber } from '../../utils/format'

type Props = {
  grvNetMonthlyPension: number
  grvProjectedEp: number
  grvGrossMonthlyPension: number
  bavMonthlyNetCost: number
  bavTotalMonthlyContribution: number
  showBav?: boolean
}

export function SummaryMetrics({
  grvNetMonthlyPension,
  grvProjectedEp,
  grvGrossMonthlyPension,
  bavMonthlyNetCost,
  bavTotalMonthlyContribution,
  showBav = true,
}: Props) {
  const shouldShowBav = showBav && bavTotalMonthlyContribution > 0
  return (
    <section className="summary-grid" aria-label="Rahmenwerte">
      <ResultMetric
        label="Gesetzliche Rente netto"
        feedbackTargetId="results.summary.grvNetPension"
        value={formatCurrency(grvNetMonthlyPension, 0)}
        detail={`${formatNumber(grvProjectedEp, 1)} EP · brutto ${formatCurrency(grvGrossMonthlyPension, 0)}`}
      />
      {shouldShowBav && (
        <ResultMetric
          label="Nettoaufwand mtl."
          feedbackTargetId="results.summary.bavMonthlyNetCost"
          value={formatCurrency(bavMonthlyNetCost, 0)}
          detail={`${formatCurrency(bavTotalMonthlyContribution, 0)} Beitrag mtl.`}
        />
      )}
    </section>
  )
}
