import './ResultWaterfall.css'
import type { ProductResult } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import { formatCurrency, formatPercent } from '../../utils/format'
import { InfoTip } from '../../ui/InfoTip'

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
  const lumpDeductions = result.lumpSumDeductions
  const totalDeduction = afterTaxLump !== null
    ? Math.max(0, result.capitalAtRetirement - afterTaxLump)
    : 0
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
              {totalDeduction > 0.5 && (
                <InfoTip label="Aufschlüsselung der Abzüge anzeigen">
                  <span className="rwf-breakdown">
                    <span className="rwf-breakdown-row">
                      <span>Brutto-Kapital</span>
                      <span>{formatCurrency(result.capitalAtRetirement, 0)}</span>
                    </span>
                    {lumpDeductions ? (
                      <>
                        <span className="rwf-breakdown-row minus">
                          <span>− Einkommensteuer + Soli</span>
                          <span>{formatCurrency(lumpDeductions.incomeTax, 0)}</span>
                        </span>
                        <span className="rwf-breakdown-row minus">
                          <span>− KV/PV{result.productId === 'bav' ? ' (1/120 × 120 Mon.)' : ''}</span>
                          <span>{formatCurrency(lumpDeductions.kvPv, 0)}</span>
                        </span>
                      </>
                    ) : (
                      <span className="rwf-breakdown-row minus">
                        <span>− Kapitalertragsteuer</span>
                        <span>{formatCurrency(totalDeduction, 0)}</span>
                      </span>
                    )}
                    <span className="rwf-breakdown-row total">
                      <span>= Netto-Kapital</span>
                      <span>{formatCurrency(afterTaxLump, 0)}</span>
                    </span>
                    <span className="rwf-breakdown-foot">
                      Abzugsquote {formatPercent(totalDeduction / result.capitalAtRetirement)}
                      {result.productId === 'bav' && lumpDeductions && (
                        <> · §22 Nr. 5 EStG / §229 SGB V</>
                      )}
                    </span>
                  </span>
                </InfoTip>
              )}
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
          <div className={`rwf-row plus${monthlyRelief <= 0.5 ? ' inactive' : ''}`}>
            <dt>+ Steuer-/SV-Vorteil</dt>
            <dd>{monthlyRelief > 0.5 ? formatCurrency(monthlyRelief, 0) : '—'}</dd>
          </div>
          <div className={`rwf-row plus${result.monthlyEmployerContribution <= 0.5 ? ' inactive' : ''}`}>
            <dt>+ Arbeitgeber / Zulagen</dt>
            <dd>{result.monthlyEmployerContribution > 0.5 ? formatCurrency(result.monthlyEmployerContribution, 0) : '—'}</dd>
          </div>
          <div className="rwf-row total">
            <dt>= Investiert mtl.</dt>
            <dd>{formatCurrency(monthlyTotal, 0)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h4>Auszahlung mtl.</h4>
        <dl>
          <div className={`rwf-row${result.grossMonthlyPayout <= 0.5 ? ' inactive' : ''}`}>
            <dt>Brutto-Rente</dt>
            <dd>{result.grossMonthlyPayout > 0.5 ? formatCurrency(result.grossMonthlyPayout, 0) : '—'}</dd>
          </div>
          <div className={`rwf-row minus${payoutDeduction <= 0.5 ? ' inactive' : ''}`}>
            <dt>− Steuer & KV/PV</dt>
            <dd>{payoutDeduction > 0.5 ? formatCurrency(payoutDeduction, 0) : '—'}</dd>
          </div>
          <div className="rwf-row total">
            <dt>= Netto-Rente</dt>
            <dd>{formatCurrency(result.netMonthlyPayout, 0)}</dd>
          </div>
          {grvNetMonthlyPension !== undefined && (
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
