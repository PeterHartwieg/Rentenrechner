import './ResultWaterfall.css'
import type { ProductResult } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import { formatCurrency } from '../../utils/format'

interface Props {
  result: ProductResult
}

/**
 * "Where does the money go?" view for a single product. Two sections:
 * 1. Monthly contribution: own cost → tax/SV relief → employer share → total invested.
 * 2. Monthly payout: gross → tax+KV/PV → net.
 *
 * Plus a header line showing capital at retirement (after fees, after accumulation).
 */
export function ResultWaterfall({ result }: Props) {
  const color = getProductMeta(result.productId)?.color ?? '#94a3b8'

  // Pre-investment relief = "what fills the gap" between user out-of-pocket
  // and the gross going into the product. Mostly bAV tax/SV relief; ~0 elsewhere.
  // Riester allowances flow through `monthlyEmployerContribution` (Zulagen counted
  // as a non-employer subsidy on that field) so this stays close to 0 there too.
  const monthlyRelief = Math.max(
    0,
    result.monthlyProductContribution - result.monthlyUserCost,
  )
  const monthlyTotal =
    result.monthlyProductContribution + result.monthlyEmployerContribution

  const payoutDeduction = Math.max(
    0,
    result.grossMonthlyPayout - result.netMonthlyPayout,
  )

  // Show two figures so the number matches both the chart (pre-tax balance over
  // time) and the DecisionSummary card (after-tax lump). When `afterTaxLumpSum`
  // is null (Basisrente — capital payout legally prohibited), only the gross
  // figure is shown.
  const afterTaxLump = result.afterTaxLumpSum
  return (
    <article className="result-waterfall" style={{ borderLeftColor: color }}>
      <div className="rwf-header">
        <strong>{result.label}</strong>
        <small>
          Kapital brutto {formatCurrency(result.capitalAtRetirement, 0)}
          {afterTaxLump !== null && (
            <>
              {' · '}
              <span className="rwf-net">
                nach Steuer-Lump {formatCurrency(afterTaxLump, 0)}
              </span>
            </>
          )}
        </small>
      </div>

      <section>
        <h4>Monatlicher Beitrag</h4>
        <dl>
          <div className="rwf-row">
            <dt>Du selbst</dt>
            <dd>{formatCurrency(result.monthlyUserCost, 0)}</dd>
          </div>
          {monthlyRelief > 0.5 && (
            <div className="rwf-row plus">
              <dt>+ Steuer-/SV-Vorteil</dt>
              <dd>{formatCurrency(monthlyRelief, 0)}</dd>
            </div>
          )}
          {result.monthlyEmployerContribution > 0.5 && (
            <div className="rwf-row plus">
              <dt>+ Arbeitgeber / Zulagen</dt>
              <dd>{formatCurrency(result.monthlyEmployerContribution, 0)}</dd>
            </div>
          )}
          <div className="rwf-row total">
            <dt>= Investiert mtl.</dt>
            <dd>{formatCurrency(monthlyTotal, 0)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h4>Auszahlung mtl.</h4>
        {result.grossMonthlyPayout > 0.5 ? (
          <dl>
            <div className="rwf-row">
              <dt>Brutto-Rente</dt>
              <dd>{formatCurrency(result.grossMonthlyPayout, 0)}</dd>
            </div>
            {payoutDeduction > 0.5 && (
              <div className="rwf-row minus">
                <dt>− Steuer & KV/PV</dt>
                <dd>{formatCurrency(payoutDeduction, 0)}</dd>
              </div>
            )}
            <div className="rwf-row total">
              <dt>= Netto-Rente</dt>
              <dd>{formatCurrency(result.netMonthlyPayout, 0)}</dd>
            </div>
          </dl>
        ) : (
          <p className="rwf-empty">Keine Rentenauszahlung — nur Kapital.</p>
        )}
      </section>
    </article>
  )
}

interface GridProps {
  results: ProductResult[]
}

export function ResultWaterfalls({ results }: GridProps) {
  if (results.length === 0) return null
  return (
    <section className="result-waterfalls" aria-label="Wohin geht das Geld?">
      <h3>Wohin geht das Geld?</h3>
      <div className="result-waterfalls-grid">
        {results.map((r) => (
          <ResultWaterfall key={r.productId} result={r} />
        ))}
      </div>
    </section>
  )
}
