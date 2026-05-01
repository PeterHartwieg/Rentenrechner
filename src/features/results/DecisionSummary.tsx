import './DecisionSummary.css'
import type { ProductResult } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import { formatCurrency } from '../../utils/format'
import { productReason } from './decisionLogic'

interface Props {
  results: ProductResult[]
  bestCapital?: ProductResult
  bestPension?: ProductResult
}

export function DecisionSummary({
  results,
  bestCapital,
  bestPension,
}: Props) {
  if (results.length === 0) return null

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
          <span className="decision-headline-label">Bestes Kapital nach Steuern</span>
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
