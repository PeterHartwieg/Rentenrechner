import './DecisionSummary.css'
import type { ProductResult } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import { formatCurrency, formatPercent } from '../../utils/format'
import {
  biggestCostDriver,
  personalSensitivityCaveat,
  productReason,
  rankingsDisagree,
  sensitivityHint,
} from './decisionLogic'
import type { SensitivityRunResult } from './sensitivity'

interface Props {
  results: ProductResult[]
  bestCapital?: ProductResult
  bestPension?: ProductResult
  /** Sensitivity simulation result, lifted from App.tsx so the caveat can be personalised. */
  sensitivity?: SensitivityRunResult
  /** GRV (or other mandatory) net pension in EUR/month — needed for the Wunschnetto gap. */
  grvNetMonthlyPension?: number
  /** User's desired monthly net pension; renders the Lücke card when set. */
  desiredNetMonthlyPension?: number
}

interface GapFill {
  productId: ProductResult['productId']
  label: string
  color: string
  netMonthly: number
  fillPct: number
}

function computeGapFills(
  results: ProductResult[],
  gap: number,
): GapFill[] {
  if (gap <= 0) return []
  return results
    .map((r) => ({
      productId: r.productId,
      label: r.label,
      color: getProductMeta(r.productId)?.color ?? '#94a3b8',
      netMonthly: r.netMonthlyPayout,
      fillPct: r.netMonthlyPayout / gap,
    }))
    .sort((a, b) => b.fillPct - a.fillPct)
}

export function DecisionSummary({
  results,
  bestCapital,
  bestPension,
  sensitivity,
  grvNetMonthlyPension,
  desiredNetMonthlyPension,
}: Props) {
  if (results.length === 0) return null

  const driver = biggestCostDriver(results)
  const personal = personalSensitivityCaveat(sensitivity, results)
  const fallbackHint = sensitivityHint(results)
  const disagree = rankingsDisagree(bestCapital, bestPension)
  const bestCapitalColor = bestCapital
    ? getProductMeta(bestCapital.productId)?.color ?? '#94a3b8'
    : '#94a3b8'
  const bestPensionColor = bestPension
    ? getProductMeta(bestPension.productId)?.color ?? '#94a3b8'
    : '#94a3b8'

  const showGap =
    desiredNetMonthlyPension !== undefined &&
    desiredNetMonthlyPension > 0 &&
    grvNetMonthlyPension !== undefined
  const gapEUR = showGap
    ? Math.max(0, (desiredNetMonthlyPension ?? 0) - (grvNetMonthlyPension ?? 0))
    : 0
  const gapFills = showGap ? computeGapFills(results, gapEUR) : []

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

      {showGap && (
        <div className="decision-callout gap">
          <div className="gap-headline">
            <span>
              <strong>Wunsch:</strong>{' '}
              {formatCurrency(desiredNetMonthlyPension ?? 0, 0)} / Mon.
            </span>
            <span>
              <strong>GRV-Netto:</strong>{' '}
              {formatCurrency(grvNetMonthlyPension ?? 0, 0)} / Mon.
            </span>
            <span>
              <strong>Lücke:</strong> {formatCurrency(gapEUR, 0)} / Mon.
            </span>
          </div>
          {gapEUR > 0 ? (
            <ul className="gap-fill-list">
              {gapFills.map((g) => (
                <li key={g.productId}>
                  <span className="gap-fill-dot" style={{ background: g.color }} aria-hidden />
                  <span>
                    <strong>{g.label}:</strong> {formatCurrency(g.netMonthly, 0)} / Mon.
                    {' — '}
                    {g.fillPct >= 1
                      ? `deckt die Lücke (${formatPercent(g.fillPct, 0)})`
                      : `füllt ${formatPercent(g.fillPct, 0)} der Lücke`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <span>Die GRV deckt deinen Wunsch bereits ab — keine zusätzliche Vorsorge nötig.</span>
          )}
        </div>
      )}

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

      {personal.kind === 'robust' ? (
        <div className="decision-callout sensitivity robust">
          <strong>Stabil:</strong> Keiner der getesteten Hebel (Rendite, Gebühren,
          AG-Match, Renteneintritt, KVdR) ändert den Sieger.
        </div>
      ) : personal.kind === 'flips' || personal.kind === 'volatile' ? (
        <div className="decision-callout sensitivity">
          <strong>
            {personal.kind === 'volatile'
              ? `Annahmenabhängig — ${personal.flips.length === 1 ? 'ein Hebel' : 'mehrere Hebel'} kippen den Sieger:`
              : personal.flips.length === 1
                ? 'Ein Hebel kippt den Sieger:'
                : 'Diese Hebel kippen den Sieger:'}
          </strong>
          <ul className="sensitivity-flips">
            {personal.flips.map((flip) => (
              <li key={flip.perturbationId}>
                <span>
                  {flip.ifClause} → gewinnt „{flip.newWinnerLabel}".
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="decision-callout sensitivity">
          <strong>Hinweis:</strong> {fallbackHint.text}
        </div>
      )}

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
