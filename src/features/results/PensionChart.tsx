import '../../ui/charts.css'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Coins } from 'lucide-react'
import { formatCurrency, formatNumber } from '../../utils/format'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'

type Props = {
  pensionBars: { name: string; value: number; fill: string }[]
  retirementEndAge: number
}

export function PensionChart({ pensionBars, retirementEndAge }: Props) {
  const { targetProps: containerTargetProps } = useFeedbackTarget({
    id: 'results.pensionChart.container',
    label: 'Monatliche Netto-Rente',
    precision: 'section',
  })

  return (
    <div className="chart-panel compact" {...containerTargetProps}>
      <div className="section-heading">
        <Coins size={18} aria-hidden="true" />
        <div>
          <h2>Monatliche Netto-Rente</h2>
          <p>Entnahme bis Alter {retirementEndAge}</p>
        </div>
      </div>
      <div className="chart-frame small">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pensionBars} margin={{ top: 12, right: 8, left: 0, bottom: 18 }}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="name" tickLine={false} />
            <YAxis
              tickFormatter={(value) => `${formatNumber(Number(value))}`}
              width={54}
            />
            <Tooltip formatter={(value) => formatCurrency(Number(value), 0)} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {pensionBars.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
