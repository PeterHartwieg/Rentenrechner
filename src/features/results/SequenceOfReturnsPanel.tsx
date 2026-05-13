import '../../ui/charts.css'
import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrendingDown } from 'lucide-react'
import type { ProductResult } from '../../domain'
import type { ReturnScenario } from '../../domain/profile'
import { getProductMeta } from '../../engine/productRegistry'
import { buildSequenceOfReturnsPaths } from '../../engine/marketReturns'
import { formatCurrency, formatPercent } from '../../utils/format'

interface Props {
  selectedResults: ProductResult[]
  payoutYears: number
  retirementAge: number
  selectedScenario: ReturnScenario
  productColors: Record<string, string>
}

type ChartRow = {
  age: number
  goodEarly: number
  badEarly: number
  baseline: number
}

// Returns a year-by-year capital trajectory during the decumulation phase.
// Bad-early sequences (low returns when capital is large) exhaust funds sooner.
function buildDecumulationTrajectory(
  capitalAtRetirement: number,
  annualWithdrawal: number,
  returns: readonly number[],
): number[] {
  const points: number[] = [capitalAtRetirement]
  let capital = capitalAtRetirement
  for (const r of returns) {
    capital = Math.max(0, capital * (1 + r) - annualWithdrawal)
    points.push(capital)
  }
  return points
}

export function SequenceOfReturnsPanel({
  selectedResults,
  payoutYears,
  retirementAge,
  selectedScenario,
  productColors,
}: Props) {
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null)

  const activeResult = useMemo(() => {
    if (selectedResults.length === 0) return null
    return (
      selectedResults.find((r) => (r.instanceId ?? r.productId) === selectedProductKey) ??
      selectedResults[0]
    )
  }, [selectedResults, selectedProductKey])

  const paths = useMemo(
    () =>
      buildSequenceOfReturnsPaths({
        annualReturn: selectedScenario.annualReturn,
        years: payoutYears,
      }),
    [selectedScenario.annualReturn, payoutYears],
  )

  const chartData = useMemo((): ChartRow[] => {
    if (!activeResult) return []
    const annualWithdrawal = activeResult.netMonthlyPayout * 12

    const goodEarlyReturns = paths.find((p) => p.id === 'good-early')?.returns ?? []
    const badEarlyReturns = paths.find((p) => p.id === 'bad-early')?.returns ?? []
    const baselineReturns = paths.find((p) => p.id === 'shuffled-baseline')?.returns ?? []

    const goodEarly = buildDecumulationTrajectory(
      activeResult.capitalAtRetirement,
      annualWithdrawal,
      goodEarlyReturns,
    )
    const badEarly = buildDecumulationTrajectory(
      activeResult.capitalAtRetirement,
      annualWithdrawal,
      badEarlyReturns,
    )
    const baseline = buildDecumulationTrajectory(
      activeResult.capitalAtRetirement,
      annualWithdrawal,
      baselineReturns,
    )

    return goodEarly.map((_, i) => ({
      age: retirementAge + i,
      goodEarly: goodEarly[i],
      badEarly: badEarly[i],
      baseline: baseline[i],
    }))
  }, [activeResult, paths, retirementAge])

  if (selectedResults.length === 0) {
    return (
      <div className="assumption-panel">
        <h2>Sequence-of-Returns-Risiko</h2>
        <p>Keine Produkte ausgewählt.</p>
      </div>
    )
  }

  return (
    <div className="assumption-panel">
      <h2>
        <TrendingDown size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Sequence-of-Returns-Risiko
      </h2>
      <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.875rem' }}>
        Gleiche Durchschnittsrendite ({formatPercent(selectedScenario.annualReturn, 1)} p.a.), andere Reihenfolge —
        schlechte Renditen früh in der Rente erschöpfen das Kapital deutlich schneller als gute Frührenditen.
      </p>

      {selectedResults.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {selectedResults.map((r) => {
            const meta = getProductMeta(r.productId)
            const key = r.instanceId ?? r.productId
            const isActive =
              activeResult && (activeResult.instanceId ?? activeResult.productId) === key
            return (
              <button
                key={key}
                onClick={() => setSelectedProductKey(key)}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: 4,
                  border: isActive
                    ? '2px solid var(--color-primary, #2563eb)'
                    : '1px solid var(--color-border, #e5e7eb)',
                  background: isActive ? 'var(--color-primary-light, #eff6ff)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: productColors[r.productId] ?? '#888',
                    marginRight: 4,
                  }}
                />
                {meta?.label ?? r.productId}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={(v: number) => formatCurrency(v, 0)}
              tick={{ fontSize: 10 }}
              width={72}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null
                return (
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: '8px 12px',
                      fontSize: 13,
                    }}
                  >
                    <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Alter {label}</p>
                    {payload.map((entry) => (
                      <p key={String(entry.dataKey)} style={{ margin: '2px 0', color: entry.stroke as string }}>
                        {entry.name}: {formatCurrency(Number(entry.value), 0)}
                      </p>
                    ))}
                  </div>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="goodEarly"
              name="Günstige Reihenfolge"
              stroke="#16a34a"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="badEarly"
              name="Ungünstige Reihenfolge"
              stroke="#dc2626"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              name="Gleichmäßige Rendite"
              stroke="#6b7280"
              strokeWidth={1.5}
              strokeDasharray="2 2"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p
        style={{ marginTop: '0.75rem', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.75rem' }}
      >
        Vereinfachte Projektion (konstante Nettorente, ohne Anpassung von Steuern und Sozialversicherung) zur
        Illustration des Reihenfolgeeffekts im Ruhestand.
      </p>
    </div>
  )
}
