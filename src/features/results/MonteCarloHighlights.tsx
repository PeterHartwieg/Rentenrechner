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

function pickLowest(
  summaries: ProductMonteCarloSummary[],
  score: (summary: ProductMonteCarloSummary) => number,
): ProductMonteCarloSummary | undefined {
  return summaries.reduce<ProductMonteCarloSummary | undefined>(
    (best, current) => (!best || score(current) < score(best) ? current : best),
    undefined,
  )
}

export function MonteCarloHighlights({ result }: Props) {
  if (!result || result.summaries.length === 0) return null

  const bestCapital = pickBest(result.summaries, (summary) => summary.bestCapitalProbability)
  const bestPension = pickBest(result.summaries, (summary) => summary.bestPensionProbability)
  const strongestFloor = pickBest(result.summaries, (summary) => summary.capital.p10)
  const lowestDownside = pickLowest(result.summaries, (summary) => summary.belowUserCostProbability)
  const maxP90 = Math.max(
    ...result.summaries.map((summary) =>
      Math.max(summary.capital.p90, summary.guaranteeFloor?.p50 ?? 0),
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
            <InfoTip icon="info" label="Risiko-Check erklaeren">
              Der Rechner testet viele moegliche Boersenverlaeufe. Die Karten
              zeigen nicht eine sichere Vorhersage, sondern wie oft ein Produkt
              in diesen Tests vorne liegt. Die Balken darunter zeigen die Spanne
              zwischen schwachen, mittleren und starken Ergebnissen.
            </InfoTip>
          </h3>
          <p>
            {formatNumber(result.runs)} Pfade | {result.scenarioLabel}{' '}
            {formatPercent(result.annualReturn)} | Schwankung {formatPercent(result.annualVolatility)}
          </p>
        </div>
      </header>

      <div className="mc-highlight-grid">
        <div className="mc-highlight-card" style={{ borderLeftColor: bestCapital?.color }}>
          <span>Wahrscheinlich bestes Kapital</span>
          <strong>
            {bestCapital?.shortLabel ?? '-'}{' '}
            {bestCapital ? formatPercent(bestCapital.bestCapitalProbability) : ''}
          </strong>
          <small>
            Median {bestCapital ? formatCurrency(bestCapital.capital.p50, 0) : '-'}
          </small>
        </div>
        <div className="mc-highlight-card" style={{ borderLeftColor: bestPension?.color }}>
          <span>Wahrscheinlich beste Rente</span>
          <strong>
            {bestPension?.shortLabel ?? '-'}{' '}
            {bestPension ? formatPercent(bestPension.bestPensionProbability) : ''}
          </strong>
          <small>
            Median {bestPension ? `${formatCurrency(bestPension.netMonthlyPayout.p50, 0)} / Mon.` : '-'}
          </small>
        </div>
        <div className="mc-highlight-card" style={{ borderLeftColor: strongestFloor?.color }}>
          <span>Staerkstes P10-Kapital</span>
          <strong>{strongestFloor?.shortLabel ?? '-'}</strong>
          <small>
            P10 {strongestFloor ? formatCurrency(strongestFloor.capital.p10, 0) : '-'}
          </small>
        </div>
        <div className="mc-highlight-card" style={{ borderLeftColor: lowestDownside?.color }}>
          <span>Niedrigstes Verlust-Risiko</span>
          <strong>
            {lowestDownside?.shortLabel ?? '-'}{' '}
            {lowestDownside ? formatPercent(lowestDownside.belowUserCostProbability) : ''}
          </strong>
          <small>Kapital unter Nettoaufwand</small>
        </div>
      </div>

      <div className="mc-mini-ranges" aria-label="Kapital-Spannen">
        {result.summaries.map((summary) => {
          const left = Math.max(0, Math.min(100, (summary.capital.p10 / maxP90) * 100))
          const width = Math.max(2, Math.min(100 - left, ((summary.capital.p90 - summary.capital.p10) / maxP90) * 100))
          const median = Math.max(0, Math.min(100, (summary.capital.p50 / maxP90) * 100))
          const guarantee = summary.guaranteeFloor
            ? Math.max(0, Math.min(100, (summary.guaranteeFloor.p50 / maxP90) * 100))
            : null
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
                    title={summary.guaranteeLabel}
                  />
                )}
              </div>
              <span className="mc-mini-range-value">
                {formatCurrency(summary.capital.p50, 0)}
                {summary.guaranteeAppliedProbability !== null && (
                  <small>Garantie {formatPercent(summary.guaranteeAppliedProbability)} greift</small>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
