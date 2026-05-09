import '../../ui/charts.css'
import { useState } from 'react'
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

const MOBILE_BREAKPOINT = 480

type PensionBar = { name: string; shortName: string; value: number; fill: string }

type Props = {
  pensionBars: PensionBar[]
  retirementEndAge: number
}

/**
 * Custom X-axis tick that switches to `shortName` at narrow container widths
 * so long product labels (e.g. "Betriebliche Altersvorsorge (bAV)") never clip.
 */
function PensionXAxisTick({
  x,
  y,
  payload,
  bars,
  isMobile,
}: {
  x?: string | number
  y?: string | number
  payload?: { value: string }
  bars: PensionBar[]
  isMobile: boolean
}) {
  if (!payload) return null
  const bar = bars.find((b) => b.name === payload.value)
  const label = isMobile && bar?.shortName ? bar.shortName : payload.value
  const yPos = typeof y === 'number' ? y : Number(y ?? 0)
  return (
    <text x={x} y={yPos + 12} textAnchor="middle" fill="#6b7280" fontSize={12}>
      {label}
    </text>
  )
}

export function PensionChart({ pensionBars, retirementEndAge }: Props) {
  const [containerWidth, setContainerWidth] = useState(0)
  const isMobile = containerWidth > 0 && containerWidth <= MOBILE_BREAKPOINT

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
        <ResponsiveContainer width="100%" height="100%" onResize={(w) => setContainerWidth(w)}>
          <BarChart data={pensionBars} margin={{ top: 12, right: 8, left: 0, bottom: 18 }}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              tick={(props) => (
                <PensionXAxisTick {...props} bars={pensionBars} isMobile={isMobile} />
              )}
            />
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
