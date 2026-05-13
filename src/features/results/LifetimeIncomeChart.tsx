import '../../ui/charts.css'
import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts/types/component/Tooltip'
import { TrendingUp } from 'lucide-react'
import { getProductMeta } from '../../app/productPresentation'
import { formatCurrency } from '../../utils/format'
import { buildLifetimeIncomeSeries } from './lifetimeIncomeSeries'
import type { ProductResult } from '../../domain'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'

interface Props {
  selectedResults: ProductResult[]
  productColors: Record<string, string>
  retirementAge: number
  retirementEndAge: number
}

interface LifetimeTooltipProps extends TooltipContentProps {
  labelToName: Record<string, string>
}

function LifetimeTooltip({ active, payload, label, labelToName }: LifetimeTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="break-even-tooltip">
      <div className="break-even-tooltip__label">Alter {label}</div>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="break-even-tooltip__row">
          <span className="break-even-tooltip__name" style={{ color: entry.color }}>
            {labelToName[String(entry.dataKey)] ?? String(entry.dataKey)}
          </span>
          <span className="break-even-tooltip__value">
            {formatCurrency(Number(entry.value ?? 0), 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function LifetimeIncomeChart({
  selectedResults,
  productColors,
  retirementAge,
  retirementEndAge,
}: Props) {
  const { targetProps: containerTargetProps } = useFeedbackTarget({
    id: 'results.lifetimeIncomeChart.container',
    label: 'Lifetime-Einkommen-Chart',
    precision: 'section',
  })

  const horizonAge = Math.max(retirementEndAge, retirementAge + 1)
  const data = useMemo(
    () => buildLifetimeIncomeSeries(selectedResults, { retirementAge, horizonAge }),
    [selectedResults, retirementAge, horizonAge],
  )

  const labelToName = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of selectedResults) {
      map[r.productId] = getProductMeta(r.productId)?.shortLabel ?? r.label
    }
    return map
  }, [selectedResults])

  return (
    <section
      className="chart-panel"
      {...containerTargetProps}
    >
      <div className="section-heading">
        <TrendingUp size={18} aria-hidden="true" />
        <div>
          <h2>Lifetime-Einkommen</h2>
          <p>
            Kumulierte Netto-Auszahlungen von Rentenbeginn bis Alter {horizonAge}. Einmalauszahlungen sind im ersten Rentenjahr enthalten.
          </p>
        </div>
      </div>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="age"
              tickFormatter={(v: number) => `${v}`}
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              width={48}
            />
            <Tooltip
              content={(props) => <LifetimeTooltip {...props} labelToName={labelToName} />}
            />
            {selectedResults.map((r) => (
              <Line
                key={r.productId}
                type="monotone"
                dataKey={r.productId}
                stroke={productColors[r.productId] ?? '#888'}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
