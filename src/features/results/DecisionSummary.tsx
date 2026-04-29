import './DecisionSummary.css'
import type { ProductResult } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import { formatCurrency, formatPercent } from '../../utils/format'
import {
  biggestCostDriver,
  productReason,
  rankingsDisagree,
  sensitivityHint,
} from './decisionLogic'

interface Props {
  results: ProductResult[]
  bestCapital?: ProductResult
  bestPension?: ProductResult
}

export function DecisionSummary({ results, bestCapital, bestPension }: Props) {
  if (results.length === 0) return null

  const driver = biggestCostDriver(results)
  const sensitivity = sensitivityHint(results)
  const disagree = rankingsDisagree(bestCapital, bestPension)
  const bestCapitalColor = bestCapital
    ? getProductMeta(bestCapital.productId)?.color ?? '#94a3b8'
    : '#94a3b8'
  const bestPensionColor = bestPension
    ? getProductMeta(bestPension.productId)?.color ?? '#94a3b8'
    : '#94a3b8'

  return (
    <section className="decision-summary" aria-label="Entscheidungs-Übersicht">
      <h3>Was sagt das Ergebnis?</h3>

      <div className="decision-headline">
        <div
          className="decision-headline-card"
          style={{ borderLeftColor: bestCapitalColor }}
        >
          <span className="decision-headline-label">Bestes Ergebnis für Kapital</span>
          <span className="decision-headline-value">
            {bestCapital ? formatCurrency(bestCapital.afterTaxLumpSum ?? 0, 0) : '—'}
          </span>
          <span className="decision-headline-product">
            {bestCapital?.label ?? 'Keine Kapitalauszahlung in Auswahl'}
          </span>
        </div>
        <div
          className="decision-headline-card"
          style={{ borderLeftColor: bestPensionColor }}
        >
          <span className="decision-headline-label">Beste monatliche Rente</span>
          <span className="decision-headline-value">
            {bestPension ? `${formatCurrency(bestPension.netMonthlyPayout, 0)} / Mon.` : '—'}
          </span>
          <span className="decision-headline-product">
            {bestPension?.label ?? '—'}
          </span>
        </div>
      </div>

      {disagree && (
        <div className="decision-callout disagree">
          <strong>Kapital- und Renten-Sieger sind unterschiedlich.</strong>{' '}
          „{bestCapital?.label}" ist beim Endkapital vorn, „{bestPension?.label}" bei der
          monatlichen Netto-Rente. Welches Ziel ist dir wichtiger?
        </div>
      )}

      {driver && (
        <div className="decision-callout driver">
          <strong>Größter Kostentreiber:</strong> „{driver.label}" mit{' '}
          {formatPercent(driver.riyDecimal, 2)} p. a. Effektivkosten. Bei langer Laufzeit
          zehrt jeder Prozentpunkt deutlich am Endkapital.
        </div>
      )}

      <div className="decision-callout sensitivity">
        <strong>Achtung — Ergebnis kippt wahrscheinlich, wenn:</strong> {sensitivity.text}
      </div>

      <div className="decision-reasons">
        {results.map((result) => {
          const reason = productReason(result)
          const color = getProductMeta(result.productId)?.color ?? '#94a3b8'
          return (
            <div key={result.productId} className="decision-reason-card">
              <span className="reason-dot" style={{ background: color }} aria-hidden />
              <div className="reason-body">
                <strong>{result.label}</strong>
                <span>{reason.text}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
