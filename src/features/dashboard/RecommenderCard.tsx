/**
 * RecommenderCard — Group G issue 12 / milestone M3.7.
 *
 * Result-only recommender surface for the Lücke-schließen modal.
 *
 * The modal owns budget and bAV-offer input state; this component only renders
 * ranked candidates and the active ranking filter.
 */

import { useMemo, useState, type CSSProperties } from 'react'
import './RecommenderCard.css'
import { useFeedbackTarget, qaTarget, useQaMode } from '../../features/qa-feedback'
import type { Workspace } from '../../domain/workspace'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { ProductResult } from '../../domain/results'
import {
  RECOMMENDER_RANKING_LABELS,
  rankRecommendedCandidates,
  recommendNextEuro,
  type BavEmployerOfferInput,
  type RecommendedCandidate,
  type RecommenderRankingCriterion,
} from '../../app/recommender'
import { confidenceLanguage } from '../../app/evidence'
import { confidenceForResult } from '../../app/evidence'
import { de2026Rules } from '../../rules/de2026'
import { InfoTip } from '../../ui/InfoTip'
import { formatCurrency } from '../../utils/format'
import { renderAtom } from '../../content/recommendationCopy'
import { productIdFromInstanceId } from '../../utils/scenarioSchema'
import { getProductMeta, type ProductId } from '../../engine/productRegistry'

const FLEX_LABEL: Record<RecommendedCandidate['flexibilityScore'], string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
}

const FLEX_RANK: Record<RecommendedCandidate['flexibilityScore'], number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const FLEX_DETAIL_LABEL: Record<string, string> = {
  easy: 'einfach',
  restricted: 'eingeschränkt',
  hard: 'schwer / nicht vorgesehen',
}

const EFFORT_LABEL: Record<RecommendedCandidate['effort']['level'], string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
}

const RANKING_KEYS: RecommenderRankingCriterion[] = [
  'median_net_pension',
  'capital_at_retirement',
  'safety',
  'flexibility',
  'low_effort',
]

interface Props {
  workspace: Workspace
  baselineCombined: CombinedResult
  baselinePerInstance: Record<string, ProductResult[]>
  grvGrossMonthlyPension: number
  marginalMonthlyEUR: number
  bavOffer?: BavEmployerOfferInput
  /**
   * The user's currently selected return scenario id. When provided, the
   * recommender uses this scenario's return assumptions so the panel stays in
   * sync with the scenario picker. Falls back to 'basis' when absent.
   */
  selectedScenarioId?: string
  /** Called when the user clicks "Als Plan speichern" on a candidate. */
  onSaveAsPlan: (candidate: RecommendedCandidate) => void
}

export function RecommenderCard({
  workspace,
  baselineCombined,
  baselinePerInstance,
  grvGrossMonthlyPension,
  marginalMonthlyEUR,
  bavOffer,
  selectedScenarioId,
  onSaveAsPlan,
}: Props) {
  const [ranking, setRanking] = useState<RecommenderRankingCriterion>('median_net_pension')
  const [expandedAtomIds, setExpandedAtomIds] = useState<Set<string>>(() => new Set<string>())
  const { enabled: qaEnabled } = useQaMode()
  const { targetProps: sectionTargetProps } = useFeedbackTarget({
    id: 'dashboard.recommenderCard.section',
    label: 'Empfehlungen',
    precision: 'section',
  })

  const candidates = useMemo(() => {
    if (marginalMonthlyEUR <= 0) return []
    return recommendNextEuro({
      workspace,
      rules: de2026Rules,
      marginalMonthlyEUR,
      baselinePerInstance,
      baselineCombined,
      grvGrossMonthlyPension,
      selectedScenarioId,
      bavOffer,
    })
  }, [
    workspace,
    marginalMonthlyEUR,
    baselinePerInstance,
    baselineCombined,
    grvGrossMonthlyPension,
    selectedScenarioId,
    bavOffer,
  ])

  const sorted = useMemo(() => {
    return rankRecommendedCandidates(candidates, ranking)
  }, [candidates, ranking])

  const rankingMax = useMemo(() => {
    return Math.max(0, ...sorted.map((cand) => rankingValue(cand, ranking)))
  }, [sorted, ranking])

  function toggleAtomDetails(candidateId: string) {
    setExpandedAtomIds((prev) => {
      const next = new Set(prev)
      if (next.has(candidateId)) next.delete(candidateId)
      else next.add(candidateId)
      return next
    })
  }

  // Confidence-language prefix: when ANY baseline instance has a model_estimate
  // evidence on relevant inputs, hedge the card's intro text.
  const confidence = useMemo(() => {
    const wsa = workspace.baseline.assumptions
    const allInstances = [
      ...wsa.bav,
      ...wsa.etf,
      ...wsa.insurance,
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
    <section className="recommender-card" aria-label="Empfehlungen für deinen nächsten Beitrag" {...sectionTargetProps}>
      <h3>Beste Optionen für {formatCurrency(marginalMonthlyEUR, 0)} zusätzlich im Monat</h3>

      {marginalMonthlyEUR > 0 && sorted.length === 0 && (
        <p className="recommender-empty">
          Für dieses Budget gibt es derzeit keine passenden Vorschläge.
        </p>
      )}

      {marginalMonthlyEUR > 0 && sorted.length > 0 && (
        <>
          <p className="recommender-intro">
            {confidence.prefix} diese Rangliste für deine zusätzliche Sparrate:
          </p>

          <div className="recommender-sort-row">
            <span className="recommender-sort-indicator">
              Beste Option für {RECOMMENDER_RANKING_LABELS[ranking]}
            </span>
            <div className="recommender-sort-buttons">
              {RANKING_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`recommender-sort-button ${ranking === key ? 'is-active' : ''}`}
                  onClick={() => setRanking(key)}
                  aria-pressed={ranking === key}
                >
                  {RECOMMENDER_RANKING_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          <ol className="recommender-list">
            {sorted.map((cand, index) => {
              const scorePct = relativeRankingPct(cand, ranking, rankingMax)
              const productColor = getProductMeta(cand.productId)?.color ?? '#2563eb'
              const atomDetailsId = `recommender-${cand.id}-atom-details`
              const atomsExpanded = expandedAtomIds.has(cand.id)
              return (
              <li key={cand.id} className="recommender-candidate" {...qaTarget(qaEnabled, `dashboard.recommenderCard.candidate.${cand.productId}`, { label: cand.label })}>
                {index === 0 && (
                  <span className="recommender-candidate-winner">
                    Beste Option für {RECOMMENDER_RANKING_LABELS[ranking]}: {winningMetric(cand, ranking)}
                  </span>
                )}
                <div className="recommender-candidate-header">
                  <strong>{cand.label}</strong>
                  <span className="recommender-candidate-budget">
                    {formatCurrency(cand.grossMonthlyEUR, 0)} brutto / Mon.
                    {cand.grossMonthlyEUR !== cand.netCashOutEUR && (
                      <> · {formatCurrency(cand.netCashOutEUR, 0)} netto</>
                    )}
                  </span>
                </div>
                <div className="recommender-ranking">
                  <div className="recommender-ranking-copy">
                    <span>Relative Bewertung</span>
                    <strong>{scorePct} %</strong>
                  </div>
                  <div
                    className="recommender-ranking-meter"
                    role="meter"
                    aria-label={`Relative Bewertung nach ${RECOMMENDER_RANKING_LABELS[ranking]} für ${cand.label}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={scorePct}
                    aria-valuetext={`${scorePct} Prozent der besten ${RECOMMENDER_RANKING_LABELS[ranking]}-Bewertung`}
                    style={{
                      '--recommender-meter-value': `${scorePct}%`,
                      '--recommender-meter-color': productColor,
                    } as CSSProperties}
                  >
                    <span className="recommender-ranking-meter-fill" />
                  </div>
                </div>
                <div className="recommender-candidate-metrics">
                  <span>
                    Netto-Rente <strong>{formatCurrency(cand.medianNettoRente, 0)} / Mon.</strong>
                  </span>
                  <span>Flexibilität <strong>{FLEX_LABEL[cand.flexibilityScore]}</strong></span>
                  <span>
                    Sicherheit <strong>{formatCurrency(cand.safetyNettoRenteP10, 0)} / Mon.</strong>
                    <InfoTip text={`90 % der simulierten Verläufe lagen über diesem monatlichen Netto-Wert (${cand.riskScoreMcPaths} Pfade).`} />
                  </span>
                  {/*
                    Issue #67: show NET capital at retirement, not gross. For
                    products with a forced annuity (Basisrente) we fall back to
                    the contractual value at retirement and label it as
                    annuitised so the user does not misread it as a usable
                    lump sum.
                   */}
                  <span>
                    Kapital bei Renteneinstieg{' '}
                    <strong>{formatCurrency(cand.netCapitalAtRetirement, 0)}</strong>
                    {cand.payoutOnly ? (
                      <>
                        {' '}
                        <em className="recommender-candidate-metric-note">
                          (annuitisiert, keine Kapitalauszahlung)
                        </em>
                      </>
                    ) : (
                      <InfoTip text="Netto verfügbar nach Steuern und ggf. KV/PV — Schätzwert auf Basis der aktuellen Annahmen." />
                    )}
                  </span>
                  <span>Aufwand <strong>{EFFORT_LABEL[cand.effort.level]}</strong></span>
                </div>
                <details className="recommender-candidate-details">
                  <summary>Flexibilität und Aufwand</summary>
                  <dl>
                    <div>
                      <dt>Kündigen</dt>
                      <dd>{FLEX_DETAIL_LABEL[cand.flexibilityDetails.criteria.cancel]}</dd>
                    </div>
                    <div>
                      <dt>Anlage wechseln</dt>
                      <dd>{FLEX_DETAIL_LABEL[cand.flexibilityDetails.criteria.switchAsset]}</dd>
                    </div>
                    <div>
                      <dt>Produkt wechseln</dt>
                      <dd>{FLEX_DETAIL_LABEL[cand.flexibilityDetails.criteria.switchProduct]}</dd>
                    </div>
                    <div>
                      <dt>Beitrag ändern</dt>
                      <dd>{FLEX_DETAIL_LABEL[cand.flexibilityDetails.criteria.adjustContribution]}</dd>
                    </div>
                    <div>
                      <dt>Nächster Schritt</dt>
                      <dd>{cand.effort.details.join(', ')}</dd>
                    </div>
                  </dl>
                </details>
                {cand.atoms.length > 0 && (
                  <div className="recommender-candidate-atom-disclosure">
                    <button
                      type="button"
                      className="recommender-candidate-atom-toggle"
                      aria-expanded={atomsExpanded}
                      aria-controls={atomDetailsId}
                      onClick={() => toggleAtomDetails(cand.id)}
                    >
                      {atomsExpanded ? 'Hinweise ausblenden' : 'Hinweise anzeigen'}
                    </button>
                    {atomsExpanded && (
                      <ul className="recommender-candidate-atoms" id={atomDetailsId}>
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
                  </div>
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
                {cand.usesStandardAssumptions && (
                  <span className="recommender-candidate-tag recommender-candidate-tag--info">
                    bAV mit Standardannahmen, geringere Eingabesicherheit
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
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

function winningMetric(
  candidate: RecommendedCandidate,
  criterion: RecommenderRankingCriterion,
): string {
  if (criterion === 'median_net_pension') {
    return `${formatCurrency(candidate.medianNettoRente, 0)} / Mon.`
  }
  if (criterion === 'capital_at_retirement') {
    // Issue #67: capital filter uses net capital at retirement, not gross.
    return formatCurrency(candidate.netCapitalAtRetirement, 0)
  }
  if (criterion === 'safety') {
    return `${formatCurrency(candidate.safetyNettoRenteP10, 0)} / Mon.`
  }
  if (criterion === 'flexibility') {
    return FLEX_LABEL[candidate.flexibilityScore]
  }
  return `Aufwand ${EFFORT_LABEL[candidate.effort.level]}`
}

function detectProductId(inst: { instanceId: string }): ProductId {
  return productIdFromInstanceId(inst.instanceId) ?? 'etf'
}

function rankingValue(
  cand: RecommendedCandidate,
  criterion: RecommenderRankingCriterion,
): number {
  if (criterion === 'median_net_pension') return cand.medianNettoRente
  // Issue #67: meter normalisation tracks the net-capital metric to keep the
  // visual ranking consistent with the displayed figure.
  if (criterion === 'capital_at_retirement') return cand.netCapitalAtRetirement
  if (criterion === 'safety') return cand.safetyNettoRenteP10
  if (criterion === 'flexibility') return FLEX_RANK[cand.flexibilityScore]
  return cand.effort.score
}

function relativeRankingPct(
  cand: RecommendedCandidate,
  criterion: RecommenderRankingCriterion,
  rankingMax: number,
): number {
  if (rankingMax <= 0) return 0
  const raw = rankingValue(cand, criterion)
  const pct = Math.max(0, Math.min(100, (raw / rankingMax) * 100))
  return Math.round(pct)
}

// `buildWhatIfFromCandidate` is re-exported by the orchestration consumer
// (App.tsx) by importing directly from `src/app/recommender.ts`. The
// recommender engine remains the single source of truth.
