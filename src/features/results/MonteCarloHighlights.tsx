import './MonteCarloPanel.css'
import { Activity } from 'lucide-react'
import type { MonteCarloResult, ProductMonteCarloSummary } from '../../engine/monteCarlo'
import { InfoTip } from '../../ui/InfoTip'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'

interface Props {
  result: MonteCarloResult | null
}

function pickBest(
  summaries: ProductMonteCarloSummary[],
  score: (summary: ProductMonteCarloSummary) => number,
): ProductMonteCarloSummary | undefined {
  return summaries.reduce<ProductMonteCarloSummary | undefined>(
    (best, current) => (!best || score(current) > score(best) ? current : best),
    undefined,
  )
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function guaranteeLine(summary: ProductMonteCarloSummary): string | null {
  if (!summary.guaranteeDisplay) return null

  const value = formatCurrency(summary.guaranteeDisplay.values.p50, 0)
  if (summary.guaranteeDisplay.kind === 'monthlyPension') {
    return `Garantierte Rente: mind. ${value} / Monat`
  }

  return `Garantie: mind. ${value} Kapital zum Rentenbeginn`
}

export function MonteCarloHighlights({ result }: Props) {
  if (!result || result.summaries.length === 0) return null

  const bestMedianPension = pickBest(result.summaries, (summary) => summary.netMonthlyPayout.p50)
  const bestPension = pickBest(result.summaries, (summary) => summary.bestPensionProbability)
  const strongestSafetyLine = pickBest(result.summaries, (summary) => summary.netMonthlyPayout.p10)
  const maxP90 = Math.max(
    ...result.summaries.map((summary) =>
      Math.max(
        summary.netMonthlyPayout.p90,
        summary.guaranteeDisplay?.kind === 'monthlyPension'
          ? summary.guaranteeDisplay.values.p50
          : 0,
      ),
    ),
    1,
  )

  return (
    <section className="mc-highlight-panel" aria-label="Monte-Carlo-Risiko-Check">
      <header className="mc-highlight-heading">
        <Activity size={18} aria-hidden="true" />
        <div>
          <h3 className="mc-heading-title">
            Risiko-Check
            <InfoTip icon="info" label="Risiko-Check erklären">
              Der Rechner testet viele mögliche Börsenverläufe. Die Karten
              zeigen nicht eine sichere Vorhersage, sondern wie oft ein Produkt
              in diesen Tests vorne liegt. Die Balken darunter zeigen schwache,
              mittlere und starke Ergebnisse für die monatliche Netto-Rente.
            </InfoTip>
          </h3>
          <p>
            {formatNumber(result.runs)} Simulationen | {result.scenarioLabel}{' '}
            {formatPercent(result.annualReturn)} | Schwankung {formatPercent(result.annualVolatility)}
          </p>
        </div>
      </header>

      <div className="mc-highlight-grid">
        <div className="mc-highlight-card" style={{ borderLeftColor: bestMedianPension?.color }}>
          <span>Höchste mittlere Netto-Rente</span>
          <strong>
            {bestMedianPension?.shortLabel ?? '-'}{' '}
            {bestMedianPension ? `${formatCurrency(bestMedianPension.netMonthlyPayout.p50, 0)} / Mon.` : ''}
          </strong>
          <small>Mitte aller Simulationen</small>
        </div>
        <div className="mc-highlight-card" style={{ borderLeftColor: bestPension?.color }}>
          <span>Am häufigsten vorne</span>
          <strong>
            {bestPension?.shortLabel ?? '-'}{' '}
            {bestPension ? formatPercent(bestPension.bestPensionProbability) : ''}
          </strong>
          <small>Höchste Netto-Rente im direkten Vergleich</small>
        </div>
        <div className="mc-highlight-card" style={{ borderLeftColor: strongestSafetyLine?.color }}>
          <span>Stärkste Sicherheitslinie</span>
          <strong>{strongestSafetyLine?.shortLabel ?? '-'}</strong>
          <small>
            {strongestSafetyLine
              ? `90 % der Simulationen lagen über ${formatCurrency(strongestSafetyLine.netMonthlyPayout.p10, 0)} / Mon.`
              : '-'}
          </small>
        </div>
      </div>

      <div className="mc-mini-ranges" aria-label="Netto-Renten-Spannen">
        {result.summaries.map((summary) => {
          const left = clampPct((summary.netMonthlyPayout.p10 / maxP90) * 100)
          const width = Math.max(
            2,
            Math.min(
              100 - left,
              ((summary.netMonthlyPayout.p90 - summary.netMonthlyPayout.p10) / maxP90) * 100,
            ),
          )
          const median = clampPct((summary.netMonthlyPayout.p50 / maxP90) * 100)
          const guarantee = summary.guaranteeDisplay?.kind === 'monthlyPension'
            ? clampPct((summary.guaranteeDisplay.values.p50 / maxP90) * 100)
            : null
          const guaranteeText = guaranteeLine(summary)
          return (
            <div key={summary.productId} className="mc-mini-range-row">
              <span className="mc-mini-range-label">
                <i style={{ background: summary.color }} aria-hidden />
                {summary.shortLabel}
              </span>
              <div className="mc-mini-range-track">
                <span
                  className="mc-mini-range-band"
                  style={{ left: `${left}%`, width: `${width}%`, background: summary.color }}
                  aria-hidden
                />
                <span
                  className="mc-mini-range-median"
                  style={{ left: `${median}%`, background: summary.color }}
                  aria-hidden
                />
                {guarantee !== null && (
                  <span
                    className="mc-mini-range-guarantee"
                    style={{ left: `${guarantee}%` }}
                    aria-hidden
                    title={guaranteeText ?? summary.guaranteeLabel}
                  />
                )}
              </div>
              <span className="mc-mini-range-value">
                <strong>{formatCurrency(summary.netMonthlyPayout.p50, 0)} / Mon.</strong>
                <small>
                  90 % der Simulationen lagen über {formatCurrency(summary.netMonthlyPayout.p10, 0)} / Mon.
                </small>
                {guaranteeText && <small>{guaranteeText}</small>}
                {summary.guaranteeAppliedProbability !== null && (
                  <small>
                    Garantie greift in {formatPercent(summary.guaranteeAppliedProbability)} der Simulationen
                  </small>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
