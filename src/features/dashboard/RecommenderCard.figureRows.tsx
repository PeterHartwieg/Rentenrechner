/**
 * Money rows for one recommender candidate, rendered inside the card and again
 * on the "Plan gespeichert" confirmation so both surfaces show identical
 * figures and labels (UI audit 2026-09-11, F02 / F16 / F20).
 *
 * Figures come from `RecommenderCard.figures.ts`; this file only renders.
 */

import type { ReactNode } from 'react'
import { PlanDurationText } from '../mein-plan/PlanDurationSummary'
import { InfoTip } from '../../ui/InfoTip'
import { formatCurrency, formatPercent } from '../../utils/format'
import type { CandidateFigures, ScenarioTag } from './RecommenderCard.figures'

function signed(value: number): string {
  const rounded = Math.round(value)
  if (rounded === 0) return formatCurrency(0)
  return `${rounded > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`
}

/** One line naming the money basis and the return scenario behind the figures. */
export function FiguresBasisNote({ scenario, className }: { scenario: ScenarioTag; className?: string }) {
  return (
    <p className={className}>
      Alle Beträge in heutigen Euro (Kaufkraft), berechnet mit dem Rendite-Szenario{' '}
      <strong>{scenario.label}</strong> ({formatPercent(scenario.annualReturn, 1)} p.a.).
      Die Vorschläge sind Modellrechnungen, keine Beratung und keine Garantie.
    </p>
  )
}

/**
 * `candidateLabel` makes each help control's accessible name unique
 * (audit F20): "… für Zusatz auf bestehendes ETF-Depot erklären".
 */
export function CandidateFigureRows({
  figures,
  candidateLabel,
  children,
}: {
  figures: CandidateFigures
  candidateLabel: string
  children?: ReactNode
}) {
  const f = figures
  const budgetDiffers = Math.abs(f.extraBudgetGross - f.extraBudgetNet) >= 0.5
  return (
    <dl className="recommender-figures">
      <div className="recommender-figures__row recommender-figures__row--lead">
        <dt>
          Zusätzliche Netto-Rente durch diese Änderung
          <InfoTip
            label={`Zusätzliche Netto-Rente für ${candidateLabel} erklären`}
            text={`Unterschied zwischen deinem Plan ohne und mit dieser Änderung: ${formatCurrency(f.baselineReal)} → ${formatCurrency(f.wholePlanReal)} netto im Monat, beides in heutigen Euro.`}
          />
        </dt>
        <dd>{signed(f.additionalReal)} / Mon.</dd>
      </div>
      <div className="recommender-figures__row">
        <dt>Zusätzliches Nettobudget</dt>
        <dd>
          {formatCurrency(f.extraBudgetNet)} / Mon.
          {budgetDiffers && (
            <span className="recommender-figures__note">
              {' '}entspricht {formatCurrency(f.extraBudgetGross)} brutto
            </span>
          )}
        </dd>
      </div>
      <div className="recommender-figures__row">
        <dt>
          Netto-Rente gesamt (ganzer Plan)
          <InfoTip
            label={`Netto-Rente gesamt für ${candidateLabel} erklären`}
            text="Gesamtes monatliches Netto-Einkommen im Ruhestand aus allen Verträgen und der gesetzlichen Rente, mit dieser Änderung, vollständig simuliert und in heutige Euro umgerechnet."
          />
        </dt>
        <dd>{formatCurrency(f.wholePlanReal)} / Mon.</dd>
      </div>
      {f.targetMonthly !== null && f.remainingGapReal !== null && (
        <div className="recommender-figures__row">
          <dt>Wunschrente {formatCurrency(f.targetMonthly)}</dt>
          <dd>
            {f.remainingGapReal > 0.5
              ? <>Verbleibende Lücke {formatCurrency(f.remainingGapReal)} / Mon.</>
              : <>Erreicht, {formatCurrency(Math.abs(f.remainingGapReal))} / Mon. darüber</>}
          </dd>
        </div>
      )}
      {f.duration && (
        <div className="recommender-figures__row">
          <dt>Auszahlung</dt>
          <dd><PlanDurationText duration={f.duration} /></dd>
        </div>
      )}
      <div className="recommender-figures__row">
        <dt>
          Zusätzliches Kapital bei Renteneintritt
          <InfoTip
            label={`Zusätzliches Kapital für ${candidateLabel} erklären`}
            text={f.payoutOnly
              ? 'Vertraglicher Wert bei Renteneintritt, den das Modell für laufende Auszahlungen vorsieht, nicht als Einmalbetrag. Nur der Zuwachs durch diese Änderung, in heutigen Euro.'
              : 'Nur der Zuwachs durch diese Änderung, netto nach Steuern und ggf. KV/PV, in heutigen Euro. Nicht das gesamte Kapital deines Plans.'}
          />
        </dt>
        <dd>
          {formatCurrency(f.extraCapitalReal)}
          {/* Neutral wording on purpose: payoutOnly covers lifelong annuities
              (Basisrente, Leibrente-bAV) as well as finite payout plans (AVD,
              Riester), so "annuitisiert" would misdescribe the latter. */}
          {f.payoutOnly && (
            <span className="recommender-figures__note"> (im Modell für laufende Auszahlungen vorgesehen)</span>
          )}
        </dd>
      </div>
      <div className="recommender-figures__row">
        <dt>
          Vereinfachtes Risikoszenario
          <InfoTip
            label={`Vereinfachtes Risikoszenario für ${candidateLabel} erklären`}
            text={`Grobe Schätzung: Nur die zusätzliche Sparrate wurde in ${f.safetyPaths} vereinfachten Zufallspfaden simuliert, das übrige Einkommen bleibt unverändert. In 9 von 10 dieser Pfade lag die Netto-Rente gesamt über diesem Wert. Kein Monte-Carlo-Ergebnis für den ganzen Plan und keine Garantie.`}
          />
        </dt>
        <dd>{formatCurrency(f.safetyReal)} / Mon.</dd>
      </div>
      {children}
    </dl>
  )
}
