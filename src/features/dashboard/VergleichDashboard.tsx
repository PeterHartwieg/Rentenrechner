import './VergleichDashboard.css'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronRight } from 'lucide-react'
import type { ProductResult } from '../../domain'
import type { MonteCarloResult } from '../../engine/monteCarlo'
import type { VergleichPaneSlug } from '../results/vergleichPanes'
import { buildFeeDragChartData } from '../results/feeDragChartData'
import { formatCurrency, formatPercent } from '../../utils/format'

type PensionBar = { name: string; shortName: string; value: number; fill: string }

interface Props {
  selectedResults: ProductResult[]
  capitalChartData: Record<string, string | number>[] | undefined
  selectedScenario: { label: string; annualReturn: number } | undefined
  pensionBars: PensionBar[]
  monteCarloResult: MonteCarloResult | null
  productColors: Record<string, string>
  bestCapital: ProductResult | undefined
  bestPension: ProductResult | undefined
  grvNetMonthlyPension: number
  retirementAge: number
  retirementEndAge: number
  onNavigate: (pane: VergleichPaneSlug) => void
}

export function VergleichDashboard({
  selectedResults,
  capitalChartData,
  selectedScenario,
  pensionBars,
  monteCarloResult,
  productColors,
  bestCapital,
  bestPension,
  grvNetMonthlyPension,
  retirementAge,
  retirementEndAge,
  onNavigate,
}: Props) {
  const mcBestSummary = monteCarloResult?.summaries.reduce((best, s) =>
    s.netMonthlyPayout.p10 > (best?.netMonthlyPayout.p10 ?? -Infinity) ? s : best,
    undefined as (typeof monteCarloResult.summaries)[0] | undefined,
  )

  const feeDragRows = buildFeeDragChartData(selectedResults, retirementAge, retirementEndAge)
  const totalFees = feeDragRows.reduce((sum, r) => sum + r['Gebühren gesamt'], 0)

  const productLineKeys = selectedResults
    .filter((r) => r.productId in productColors)
    .map((r) => r.productId)

  return (
    <section className="vergleich-dashboard" aria-label="Überblick">
      <header className="vergleich-dashboard__header">
        <h2>Überblick</h2>
        <p className="vergleich-dashboard__subtitle">
          Auf einen Blick — Kennzahlen und Vorschau-Charts für alle Vergleichsansichten.
        </p>
      </header>

      <div className="vergleich-dashboard__kpis">
        <div className="vergleich-dashboard__kpi">
          <span className="vergleich-dashboard__kpi-label">GRV netto (mtl.)</span>
          <strong className="vergleich-dashboard__kpi-value">
            {formatCurrency(grvNetMonthlyPension, 0)}
          </strong>
        </div>
        <div className="vergleich-dashboard__kpi">
          <span className="vergleich-dashboard__kpi-label">Bestes Kapital</span>
          <strong className="vergleich-dashboard__kpi-value">
            {bestCapital ? formatCurrency(bestCapital.afterTaxLumpSum ?? 0, 0) : '—'}
          </strong>
          {bestCapital && (
            <span className="vergleich-dashboard__kpi-sub">{bestCapital.label}</span>
          )}
        </div>
        <div className="vergleich-dashboard__kpi">
          <span className="vergleich-dashboard__kpi-label">Beste Rente (mtl.)</span>
          <strong className="vergleich-dashboard__kpi-value">
            {bestPension ? formatCurrency(bestPension.netMonthlyPayout, 0) : '—'}
          </strong>
          {bestPension && (
            <span className="vergleich-dashboard__kpi-sub">{bestPension.label}</span>
          )}
        </div>
        {mcBestSummary && (
          <div className="vergleich-dashboard__kpi">
            <span className="vergleich-dashboard__kpi-label">MC P10-Rente</span>
            <strong className="vergleich-dashboard__kpi-value">
              {formatCurrency(mcBestSummary.netMonthlyPayout.p10, 0)}
            </strong>
            <span className="vergleich-dashboard__kpi-sub">{mcBestSummary.shortLabel}</span>
          </div>
        )}
      </div>

      <div className="vergleich-dashboard__tiles">
        {/* Kapital tile */}
        <div className="vergleich-dashboard__tile">
          <div className="vergleich-dashboard__tile-header">
            <span className="vergleich-dashboard__tile-title">Kapital bis Rentenbeginn</span>
            {selectedScenario && (
              <span className="vergleich-dashboard__tile-meta">
                {formatPercent(selectedScenario.annualReturn, 1)} p.a.
              </span>
            )}
          </div>
          <div className="vergleich-dashboard__tile-chart">
            {capitalChartData && capitalChartData.length > 0 && productLineKeys.length > 0 ? (
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={capitalChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="age" hide />
                  <YAxis hide />
                  {productLineKeys.map((pid) => (
                    <Line
                      key={pid}
                      type="monotone"
                      dataKey={pid}
                      stroke={productColors[pid] ?? '#94a3b8'}
                      dot={false}
                      strokeWidth={1.5}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="vergleich-dashboard__tile-empty">Keine Daten</div>
            )}
          </div>
          <div className="vergleich-dashboard__tile-footer">
            <span className="vergleich-dashboard__tile-number">
              {bestCapital ? formatCurrency(bestCapital.afterTaxLumpSum ?? 0, 0) : '—'}
            </span>
            <button
              type="button"
              className="vergleich-dashboard__tile-link"
              onClick={() => onNavigate('kapital')}
            >
              Kapital öffnen <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Monatliche Rente tile */}
        <div className="vergleich-dashboard__tile">
          <div className="vergleich-dashboard__tile-header">
            <span className="vergleich-dashboard__tile-title">Monatliche Rente</span>
            <span className="vergleich-dashboard__tile-meta">nach Steuern + KV/PV</span>
          </div>
          <div className="vergleich-dashboard__tile-chart">
            {pensionBars.length > 0 ? (
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={pensionBars} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="shortName" hide />
                  <YAxis hide />
                  <Bar dataKey="value" isAnimationActive={false}>
                    {pensionBars.map((bar, i) => (
                      <rect key={i} fill={bar.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="vergleich-dashboard__tile-empty">Keine Daten</div>
            )}
          </div>
          <div className="vergleich-dashboard__tile-footer">
            <span className="vergleich-dashboard__tile-number">
              {bestPension ? `${formatCurrency(bestPension.netMonthlyPayout, 0)} / Mon.` : '—'}
            </span>
            <button
              type="button"
              className="vergleich-dashboard__tile-link"
              onClick={() => onNavigate('rente')}
            >
              Rente öffnen <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Fee Drag tile */}
        <div className="vergleich-dashboard__tile">
          <div className="vergleich-dashboard__tile-header">
            <span className="vergleich-dashboard__tile-title">Fee Drag</span>
            <span className="vergleich-dashboard__tile-meta">Gebühren vs. Rendite</span>
          </div>
          <div className="vergleich-dashboard__tile-chart">
            {feeDragRows.length > 0 ? (
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={feeDragRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" hide />
                  <YAxis hide />
                  <Bar dataKey="Nettoaufwand gesamt" stackId="a" fill="#0ea5e9" isAnimationActive={false} />
                  <Bar dataKey="Netto-Rendite" stackId="a" fill="#22c55e" isAnimationActive={false} />
                  <Bar dataKey="Gebühren gesamt" fill="#ef4444" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="vergleich-dashboard__tile-empty">Keine Daten</div>
            )}
          </div>
          <div className="vergleich-dashboard__tile-footer">
            <span className="vergleich-dashboard__tile-number">
              {formatCurrency(totalFees, 0)} Gebühren gesamt
            </span>
            <button
              type="button"
              className="vergleich-dashboard__tile-link"
              onClick={() => onNavigate('fee-drag')}
            >
              Fee Drag öffnen <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Monte-Carlo tile */}
        <div className="vergleich-dashboard__tile">
          <div className="vergleich-dashboard__tile-header">
            <span className="vergleich-dashboard__tile-title">Monte-Carlo</span>
            <span className="vergleich-dashboard__tile-meta">P10 / P50 / P90</span>
          </div>
          <div className="vergleich-dashboard__tile-chart">
            {monteCarloResult && monteCarloResult.summaries.length > 0 ? (
              <ResponsiveContainer width="100%" height={100}>
                <BarChart
                  data={monteCarloResult.summaries.map((s) => ({
                    name: s.shortLabel,
                    p10: s.netMonthlyPayout.p10,
                    p50: s.netMonthlyPayout.p50,
                    p90: s.netMonthlyPayout.p90,
                    color: s.color,
                  }))}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" hide />
                  <YAxis hide />
                  <Bar dataKey="p10" fill="#94a3b8" isAnimationActive={false} />
                  <Bar dataKey="p50" fill="#60a5fa" isAnimationActive={false} />
                  <Bar dataKey="p90" fill="#34d399" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="vergleich-dashboard__tile-empty">Keine MC-Daten</div>
            )}
          </div>
          <div className="vergleich-dashboard__tile-footer">
            <span className="vergleich-dashboard__tile-number">
              {mcBestSummary
                ? `P50: ${formatCurrency(mcBestSummary.netMonthlyPayout.p50, 0)} / Mon.`
                : '—'}
            </span>
            <button
              type="button"
              className="vergleich-dashboard__tile-link"
              onClick={() => onNavigate('monte-carlo')}
            >
              Monte-Carlo öffnen <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
