/**
 * RecommenderCard — Group G issue 12 / milestone M3.7.
 *
 * Top-of-dashboard card surfacing 3-4 ranked candidate "next-€X" allocations.
 * Renders only in combine-mode; compare-mode does not show this card.
 *
 * The marginal-budget input is in **net cash out-of-pocket per month** — the
 * additional after-tax cash the user can commit. Each candidate is sized by
 * `recommendNextEuro` so the user's monthly cash outflow equals the input.
 */

import { useMemo, useState } from 'react'
import './RecommenderCard.css'
import type { Workspace } from '../../domain/workspace'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { ProductResult } from '../../domain/results'
import { recommendNextEuro, type RecommendedCandidate } from '../../app/recommender'
import { confidenceLanguage } from '../../app/evidence'
import { confidenceForResult } from '../../app/evidence'
import { de2026Rules } from '../../rules/de2026'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency } from '../../utils/format'
import { renderAtom } from '../../app/recommendations'
import { productIdFromInstanceId } from '../../utils/scenarioSchema'
import type { ProductId } from '../../engine/productRegistry'

type SortKey = 'median' | 'flexibility' | 'risk' | 'lifetime'

const FLEX_RANK: Record<RecommendedCandidate['flexibilityScore'], number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const SORT_LABELS: Record<SortKey, string> = {
  median: 'mittlerer Netto-Rente',
  flexibility: 'Flexibilität',
  risk: 'Endkapital',
  lifetime: 'Lifetime Cash',
}

const SORT_TOOLTIPS: Record<SortKey, string> = {
  median: 'Erwartete monatliche Netto-Rente im Basisszenario',
  flexibility: 'Flexibilität (Kapitalverfügbarkeit vor Rentenbeginn)',
  risk: 'Erwartetes Endkapital im Basisszenario',
  lifetime: 'Geschätzte Lebenszeit-Auszahlungen',
}

const FLEX_LABEL: Record<RecommendedCandidate['flexibilityScore'], string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
}

interface Props {
  workspace: Workspace
  baselineCombined: CombinedResult
  baselinePerInstance: Record<string, ProductResult[]>
  grvGrossMonthlyPension: number
  /** Called when the user clicks "Als Plan speichern" on a candidate. */
  onSaveAsPlan: (candidate: RecommendedCandidate) => void
}

export function RecommenderCard({
  workspace,
  baselineCombined,
  baselinePerInstance,
  grvGrossMonthlyPension,
  onSaveAsPlan,
}: Props) {
  const [marginalEUR, setMarginalEUR] = useState<number>(0)
  const [sortKey, setSortKey] = useState<SortKey>('median')

  const candidates = useMemo(() => {
    if (marginalEUR <= 0) return []
    return recommendNextEuro({
      workspace,
      rules: de2026Rules,
      marginalMonthlyEUR: marginalEUR,
      baselinePerInstance,
      baselineCombined,
      grvGrossMonthlyPension,
    })
  }, [workspace, marginalEUR, baselinePerInstance, baselineCombined, grvGrossMonthlyPension])

  const sorted = useMemo(() => {
    const out = [...candidates]
    if (sortKey === 'median') out.sort((a, b) => b.medianNettoRente - a.medianNettoRente)
    else if (sortKey === 'flexibility')
      out.sort((a, b) => FLEX_RANK[b.flexibilityScore] - FLEX_RANK[a.flexibilityScore])
    else if (sortKey === 'risk') out.sort((a, b) => b.riskScore - a.riskScore)
    else if (sortKey === 'lifetime') out.sort((a, b) => b.lifetimeCash - a.lifetimeCash)
    return out
  }, [candidates, sortKey])

  // Confidence-language prefix: when ANY baseline instance has a model_estimate
  // evidence on relevant inputs, hedge the card's intro text.
  const confidence = useMemo(() => {
    const wsa = workspace.baseline.assumptions
    const allInstances = [
      ...wsa.bav,
      ...wsa.etf,
      ...wsa.basisrente,
      ...wsa.altersvorsorgedepot,
      ...wsa.riester,
    ]
    let lowest: 'user_confirmed' | 'model_estimate' | 'statement' = 'statement'
    for (const inst of allInstances) {
      const c = confidenceForResult({ productId: detectProductId(inst) }, inst.evidenceMap ?? {})
      if (c === 'model_estimate') {
        lowest = 'model_estimate'
        break
      }
      if (c === 'user_confirmed') lowest = 'user_confirmed'
    }
    return confidenceLanguage(lowest)
  }, [workspace.baseline.assumptions])

  return (
    <section className="recommender-card" aria-label="Empfehlungen für deinen nächsten Beitrag">
      <h3>Was passiert mit deinem nächsten Euro?</h3>

      <div className="recommender-budget">
        <NumberField
          label="Monatliches Budget netto"
          value={marginalEUR}
          onCommit={(raw) => setMarginalEUR(Math.max(0, Number(raw) || 0))}
          step={10}
          suffix="€/Mon."
          decimals={0}
          min={0}
        />
        <div className="recommender-presets" role="group" aria-label="Voreingestellte Budgets">
          {[100, 200, 400].map((preset) => (
            <button
              key={preset}
              type="button"
              className="recommender-preset"
              onClick={() => setMarginalEUR(preset)}
            >
              {preset} €
            </button>
          ))}
        </div>
      </div>

      {marginalEUR > 0 && sorted.length === 0 && (
        <p className="recommender-empty">
          Für dieses Budget gibt es derzeit keine passenden Vorschläge.
        </p>
      )}

      {marginalEUR > 0 && sorted.length > 0 && (
        <>
          <p className="recommender-intro">
            {confidence.prefix} folgende Allokation deines nächsten Euros:
          </p>

          <div className="recommender-sort-row">
            <span className="recommender-sort-indicator">
              Rangliste: nach {SORT_LABELS[sortKey]}
            </span>
            <div className="recommender-sort-buttons">
              {(['median', 'flexibility', 'risk', 'lifetime'] as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`recommender-sort-button ${sortKey === key ? 'is-active' : ''}`}
                  onClick={() => setSortKey(key)}
                  aria-pressed={sortKey === key}
                  title={SORT_TOOLTIPS[key]}
                >
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          <ol className="recommender-list">
            {sorted.map((cand) => (
              <li key={cand.id} className="recommender-candidate">
                <div className="recommender-candidate-header">
                  <strong>{cand.label}</strong>
                  <span className="recommender-candidate-budget">
                    {formatCurrency(cand.grossMonthlyEUR, 0)} brutto / Mon.
                    {cand.grossMonthlyEUR !== cand.netCashOutEUR && (
                      <> · {formatCurrency(cand.netCashOutEUR, 0)} netto</>
                    )}
                  </span>
                </div>
                <div className="recommender-candidate-metrics">
                  <span>
                    Netto-Rente <strong>{formatCurrency(cand.medianNettoRente, 0)} / Mon.</strong>
                  </span>
                  <span>Flexibilität <strong>{FLEX_LABEL[cand.flexibilityScore]}</strong></span>
                  <span>Lifetime Cash <strong>{formatCurrency(cand.lifetimeCash, 0)}</strong></span>
                </div>
                {cand.atoms.length > 0 && (
                  <ul className="recommender-candidate-atoms">
                    {cand.atoms.map((atom, idx) => {
                      const tpl = renderAtom(atom)
                      if (!tpl.headline) return null
                      return (
                        <li key={`${atom.id}-${idx}`} className="recommender-candidate-atom">
                          <strong>{tpl.headline}</strong>
                          <span>{tpl.body}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {!cand.wunschnettoFloorMet && (
                  <span className="recommender-candidate-tag recommender-candidate-tag--warn">
                    Wunschnetto nicht erreicht
                  </span>
                )}
                {cand.cappedToRemaining && (
                  <span className="recommender-candidate-tag recommender-candidate-tag--info">
                    Beitrag wurde auf den verbleibenden Rahmen gekürzt
                  </span>
                )}
                <button
                  type="button"
                  className="recommender-candidate-save"
                  onClick={() => onSaveAsPlan(cand)}
                >
                  Als Plan speichern
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

function detectProductId(inst: { instanceId: string }): ProductId {
  return productIdFromInstanceId(inst.instanceId) ?? 'etf'
}

// `buildWhatIfFromCandidate` is re-exported by the orchestration consumer
// (App.tsx) by importing directly from `src/app/recommender.ts`. The
// recommender engine remains the single source of truth.
