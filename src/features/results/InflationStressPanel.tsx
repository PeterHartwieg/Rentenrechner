import '../../ui/charts.css'
import { Fragment, useMemo, useState } from 'react'
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
import { TrendingDown } from 'lucide-react'
import type { ProductResult } from '../../domain'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'
import { buildInflationStressRows } from './inflationStress'

const INFLATION_OPTIONS = [
  { label: '2 %', value: 0.02 },
  { label: '3 %', value: 0.03 },
  { label: '5 %', value: 0.05 },
]

interface Props {
  selectedResults: ProductResult[]
  productColors: Record<string, string>
  retirementAge: number
  retirementEndAge: number
  inflationRate: number
}

export function InflationStressPanel({
  selectedResults,
  productColors,
  retirementAge,
  retirementEndAge,
  inflationRate: scenarioInflationRate,
}: Props) {
  const [inflationRate, setInflationRate] = useState(scenarioInflationRate)

  const rows = useMemo(
    () =>
      buildInflationStressRows({
        products: selectedResults,
        retirementAge,
        retirementEndAge,
        inflationRate,
      }),
    [selectedResults, retirementAge, retirementEndAge, inflationRate],
  )

  return (
    <section className="chart-panel">
      <div className="section-heading">
        <TrendingDown size={18} aria-hidden="true" />
        <div>
          <h2>Inflations-Stress: reale Kaufkraft der Monatsrente</h2>
          <p>
            Nominale vs. reale Netto-Monatsrente ab Alter {retirementAge} bei{' '}
            {INFLATION_OPTIONS.find((o) => o.value === inflationRate)?.label ??
              formatPercent(inflationRate, 1)} Inflation p.a.
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
            Annahme: {formatPercent(scenarioInflationRate, 1)} p.a.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {INFLATION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setInflationRate(opt.value)}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              border: '1px solid currentColor',
              background: inflationRate === opt.value ? '#1d4ed8' : 'transparent',
              color: inflationRate === opt.value ? '#fff' : 'inherit',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis
              dataKey="age"
              tickLine={false}
              label={{ value: 'Alter', position: 'insideBottomRight', offset: -4 }}
            />
            <YAxis
              tickFormatter={(v) => `${formatNumber(Number(v) / 1_000)}k`}
              width={64}
            />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value), 0)}
              labelFormatter={(age) => `Alter ${age}`}
            />
            <Legend />
            {selectedResults.map((result) => (
              <Fragment key={result.productId}>
                <Line
                  type="monotone"
                  dataKey={`${result.label} nominal`}
                  stroke={productColors[result.productId]}
                  strokeWidth={2}
                  strokeDasharray="0"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey={`${result.label} real`}
                  stroke={productColors[result.productId]}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  name={`${result.label} real`}
                />
              </Fragment>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)', marginTop: '0.5rem' }}>
        Durchgezogene Linie = nominal, gestrichelt = real (Kaufkraft in heutigen Preisen ab Alter {retirementAge}).
        Inflationsrate {INFLATION_OPTIONS.find((o) => o.value === inflationRate)?.label} p.a.
      </p>
    </section>
  )
}
