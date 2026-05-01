import './ResultWaterfall.css'
import type { ProductResult } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import { formatCurrency } from '../../utils/format'

interface Props {
  result: ProductResult
  grvNetMonthlyPension?: number
}

/**
 * "Where does the money go?" view for a single product. Two sections:
 * 1. Monthly contribution: own cost → tax/SV relief → employer share → total invested.
 * 2. Monthly payout: gross → tax+KV/PV → net.
 *
 * Plus a header line showing capital at retirement (after fees, after accumulation).
 */
export function ResultWaterfall({ result, grvNetMonthlyPension }: Props) {
  const color = getProductMeta(result.productId)?.color ?? '#94a3b8'

  // monthlyProductContribution is the total cash flowing into the account each
  // month (it already includes the employer share for bAV and Zulagen for
  // Riester/AVD). Relief = total − user out-of-pocket − employer share, i.e.
  // the residual is the tax/SV refund (bAV) or Günstigerprüfung-/Zulagen-benefit
  // (Riester, AVD). For ETF/insurance both subtraction terms collapse to 0.
  const monthlyRelief = Math.max(
    0,
    result.monthlyProductContribution -
      result.monthlyUserCost -
      result.monthlyEmployerContribution,
  )
  const monthlyTotal = result.monthlyProductContribution

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
            {grvNetMonthlyPension !== undefined && grvNetMonthlyPension > 0.5 && (
              <>
                <div className="rwf-row plus">
                  <dt>+ GRV-Netto</dt>
                  <dd>{formatCurrency(grvNetMonthlyPension, 0)}</dd>
                </div>
                <div className="rwf-row total">
                  <dt>= Gesamt mtl.</dt>
                  <dd>
                    {formatCurrency(result.netMonthlyPayout + grvNetMonthlyPension, 0)}
                  </dd>
                </div>
              </>
            )}
          </dl>
        ) : (
          <dl>
            <p className="rwf-empty">Keine Rentenauszahlung — nur Kapital.</p>
            {grvNetMonthlyPension !== undefined && grvNetMonthlyPension > 0.5 && (
              <div className="rwf-row total">
                <dt>= GRV-Netto mtl.</dt>
                <dd>{formatCurrency(grvNetMonthlyPension, 0)}</dd>
              </div>
            )}
          </dl>
        )}
      </section>
    </article>
  )
}

interface GridProps {
  results: ProductResult[]
  grvNetMonthlyPension?: number
}

export function ResultWaterfalls({ results, grvNetMonthlyPension }: GridProps) {
  if (results.length === 0) return null
  return (
    <section className="result-waterfalls" aria-label="Wohin geht das Geld?">
      <h3>Wohin geht das Geld?</h3>
      <div className="result-waterfalls-grid">
        {results.map((r) => (
          <ResultWaterfall
            key={r.productId}
            result={r}
            grvNetMonthlyPension={grvNetMonthlyPension}
          />
        ))}
      </div>
    </section>
  )
}
