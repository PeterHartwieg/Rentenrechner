import '../../ui/charts.css'
import './MonteCarloPanel.css'
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
import { Activity } from 'lucide-react'
import type { ProductId } from '../../domain'
import type { MonteCarloResult, ProductMonteCarloSummary } from '../../engine/monteCarlo'
import { InfoTip } from '../../ui/InfoTip'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'
import { useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'

interface Props {
  result: MonteCarloResult | null
}

function bestByProbability(
  summaries: ProductMonteCarloSummary[],
  key: 'bestCapitalProbability' | 'bestPensionProbability',
): ProductMonteCarloSummary | undefined {
  return summaries.reduce<ProductMonteCarloSummary | undefined>(
    (best, current) => (!best || current[key] > best[key] ? current : best),
    undefined,
  )
}

function percentileTriple(values: { p10: number; p50: number; p90: number }, suffix = '') {
  return `${formatCurrency(values.p10, 0)} / ${formatCurrency(values.p50, 0)} / ${formatCurrency(values.p90, 0)}${suffix}`
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function MonteCarloPanel({ result }: Props) {
  const [selectedProductId, setSelectedProductId] = useState<ProductId | null>(null)

  const selectedSummary =
    result?.summaries.find((summary) => summary.productId === selectedProductId) ??
    result?.summaries.reduce<ProductMonteCarloSummary | undefined>(
      (best, current) => (!best || current.capital.p50 > best.capital.p50 ? current : best),
      undefined,
    )

  const chartData = useMemo(() => {
    if (!result || !selectedSummary) return []
    return result.yearlyBands
      .filter((row) => row.productId === selectedSummary.productId)
      .map((row) => ({
        age: row.age,
        p10: row.p10,
        p50: row.p50,
        p90: row.p90,
      }))
  }, [result, selectedSummary])

  const { targetProps: containerTargetProps } = useFeedbackTarget({
    id: 'results.monteCarloPanel.container',
    label: 'Monte-Carlo-Simulation',
    precision: 'section',
  })

  if (!result || result.summaries.length === 0) return null

  const bestCapital = bestByProbability(result.summaries, 'bestCapitalProbability')
  const bestPension = bestByProbability(result.summaries, 'bestPensionProbability')
  const showTarget = result.summaries.some((summary) => summary.targetNetPensionProbability !== null)
  const showGuarantees = result.summaries.some((summary) => summary.guaranteeFloor !== null)
  const maxCapitalP90 = Math.max(
    ...result.summaries.map((summary) =>
      Math.max(summary.capital.p90, summary.guaranteeFloor?.p50 ?? 0),
    ),
    1,
  )

  return (
    <section
      className="chart-panel monte-carlo-panel"
      aria-label="Monte-Carlo-Simulation"
      {...containerTargetProps}
      data-qa-section="true"
    >
      <div className="section-heading">
        <Activity size={18} aria-hidden="true" />
        <div>
          <h2 className="mc-heading-title">
            Monte-Carlo-Simulation
            <InfoTip icon="info" label="Monte-Carlo-Grafik erklären">
              Diese Grafik ist keine Vorhersage für ein einzelnes Jahr. Der Rechner
              testet viele mögliche Börsenverläufe. P50 ist der mittlere Verlauf,
              P10 ein schwaches Ergebnis und P90 ein starkes Ergebnis. Der Bereich
              dazwischen zeigt, wie stark das Ergebnis schwanken kann.
            </InfoTip>
          </h2>
          <p>
            {formatNumber(result.runs)} Simulationen | {result.scenarioLabel}{' '}
            {formatPercent(result.annualReturn)} Rendite | {formatPercent(result.annualVolatility)} Schwankung p.a.
          </p>
        </div>
      </div>

      <div className="mc-stat-strip">
        <div>
          <span>Bestes Kapital</span>
          <strong>
            {bestCapital?.shortLabel ?? '-'}{' '}
            {bestCapital ? formatPercent(bestCapital.bestCapitalProbability) : ''}
          </strong>
        </div>
        <div>
          <span>Beste Rente</span>
          <strong>
            {bestPension?.shortLabel ?? '-'}{' '}
            {bestPension ? formatPercent(bestPension.bestPensionProbability) : ''}
          </strong>
        </div>
        <div>
          <span>Marktrendite P10/P50/P90</span>
          <strong>
            {formatPercent(result.marketAnnualReturn.p10)} / {formatPercent(result.marketAnnualReturn.p50)} /{' '}
            {formatPercent(result.marketAnnualReturn.p90)}
          </strong>
        </div>
      </div>

      <div className="mc-range-list" aria-label="Kapital-Spannen pro Produkt">
        {result.summaries.map((summary) => {
          const left = clampPct((summary.capital.p10 / maxCapitalP90) * 100)
          const width = Math.max(
            2,
            Math.min(100 - left, ((summary.capital.p90 - summary.capital.p10) / maxCapitalP90) * 100),
          )
          const median = clampPct((summary.capital.p50 / maxCapitalP90) * 100)
          const guarantee = summary.guaranteeFloor
            ? clampPct((summary.guaranteeFloor.p50 / maxCapitalP90) * 100)
            : null
          return (
            <button
              key={summary.productId}
              type="button"
              className={`mc-range-row${summary.productId === selectedSummary?.productId ? ' active' : ''}`}
              onClick={() => setSelectedProductId(summary.productId)}
            >
              <span className="mc-range-product">
                <i style={{ background: summary.color }} aria-hidden />
                {summary.shortLabel}
              </span>
              <span className="mc-range-track">
                <i
                  className="mc-range-band"
                  style={{ left: `${left}%`, width: `${width}%`, background: summary.color }}
                  aria-hidden
                />
                <i
                  className="mc-range-median"
                  style={{ left: `${median}%`, background: summary.color }}
                  aria-hidden
                />
                {guarantee !== null && (
                  <i
                    className="mc-range-guarantee"
                    style={{ left: `${guarantee}%` }}
                    aria-hidden
                    title={summary.guaranteeLabel}
                  />
                )}
              </span>
              <span className="mc-range-values">
                {formatCurrency(summary.capital.p10, 0)} - {formatCurrency(summary.capital.p90, 0)}
                {summary.guaranteeAppliedProbability !== null && (
                  <small>Garantie greift {formatPercent(summary.guaranteeAppliedProbability)}</small>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mc-product-tabs" aria-label="Produkt für Monte-Carlo-Verlauf">
        {result.summaries.map((summary) => {
          const active = summary.productId === selectedSummary?.productId
          return (
            <button
              key={summary.productId}
              type="button"
              className={active ? 'active' : ''}
              onClick={() => setSelectedProductId(summary.productId)}
              title={`${summary.label} anzeigen`}
            >
              <span style={{ background: summary.color }} aria-hidden />
              {summary.shortLabel}
            </button>
          )
        })}
      </div>

      <div className="chart-frame small">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis dataKey="age" tickLine={false} />
            <YAxis
              tickFormatter={(value) => `${formatNumber(Number(value) / 1_000)}k`}
              width={64}
            />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value), 0)}
              labelFormatter={(age) => `Alter ${age}`}
            />
            <Line
              type="monotone"
              dataKey="p90"
              name="P90"
              stroke={selectedSummary?.color ?? '#64748b'}
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="p50"
              name="Median"
              stroke={selectedSummary?.color ?? '#64748b'}
              strokeWidth={3}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="p10"
              name="P10"
              stroke={selectedSummary?.color ?? '#64748b'}
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mc-table-note">
        P10/P50/P90: Bei P10 lagen 90 % der Simulationen über diesem Wert, P50 ist
        der mittlere Wert, P90 ein starkes Ergebnis.
      </p>

      <div className="table-scroll mc-table-wrap">
        <table className="mc-table">
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Kapital P10 / P50 / P90</th>
              <th>Chance bestes Kapital</th>
              <th>Netto-Rente P10 / P50 / P90</th>
              <th>Chance beste Rente</th>
              <th>Unter Einzahlungen</th>
              {showGuarantees && <th>Garantie</th>}
              {showGuarantees && <th>Greift</th>}
              {showTarget && <th>Wunschnetto erreicht</th>}
            </tr>
          </thead>
          <tbody>
            {result.summaries.map((summary) => (
              <tr key={summary.productId}>
                <td>
                  <span className="mc-product-name">
                    <span style={{ background: summary.color }} aria-hidden />
                    {summary.shortLabel}
                  </span>
                </td>
                <td>{percentileTriple(summary.capital)}</td>
                <td>{formatPercent(summary.bestCapitalProbability)}</td>
                <td>{percentileTriple(summary.netMonthlyPayout, ' / Mon.')}</td>
                <td>{formatPercent(summary.bestPensionProbability)}</td>
                <td>{formatPercent(summary.belowUserCostProbability)}</td>
                {showGuarantees && (
                  <td>
                    {summary.guaranteeFloor
                      ? `${summary.guaranteeLabel ?? 'Garantie'} - ${formatCurrency(summary.guaranteeFloor.p50, 0)}`
                      : '-'}
                  </td>
                )}
                {showGuarantees && (
                  <td>
                    {summary.guaranteeAppliedProbability === null
                      ? '-'
                      : formatPercent(summary.guaranteeAppliedProbability)}
                  </td>
                )}
                {showTarget && (
                  <td>
                    {summary.targetNetPensionProbability === null
                      ? '-'
                      : formatPercent(summary.targetNetPensionProbability)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
