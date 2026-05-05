import '../../ui/charts.css'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'

type Props = {
  capitalChartData: Record<string, string | number>[] | undefined
  selectedScenario: { label: string; annualReturn: number } | undefined
  selectedResults: { productId: string; label: string }[]
  productColors: Record<string, string>
}

export function CapitalChart({
  capitalChartData,
  selectedScenario,
  selectedResults,
  productColors,
}: Props) {
  const { targetProps: containerTargetProps } = useFeedbackTarget({
    id: 'results.capitalChart.container',
    label: 'Vermögen bis Rentenbeginn',
    precision: 'section',
  })

  return (
    <section className="chart-panel" {...containerTargetProps} data-qa-section="true">
      <div className="section-heading">
        <TrendingUp size={18} aria-hidden="true" />
        <div>
          <h2>Vermögen bis Rentenbeginn</h2>
          <p>
            {selectedScenario?.label} mit {selectedScenario
              ? formatPercent(selectedScenario.annualReturn)
              : ''}{' '}
            Rendite p.a.
          </p>
        </div>
      </div>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={capitalChartData}>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis dataKey="age" tickLine={false} />
            <YAxis
              tickFormatter={(value) => `${formatNumber(Number(value) / 1_000)}k`}
              width={64}
            />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value), 0)}
              labelFormatter={(age) => `Alter ${age}`}
              itemSorter={(item) => -Number(item.value)}
            />
            <Legend />
            {selectedResults.map((result) => (
              <Line
                key={result.productId}
                type="monotone"
                dataKey={result.label}
                stroke={productColors[result.productId]}
                strokeWidth={3}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
