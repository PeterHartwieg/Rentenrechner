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
import type { PortfolioFunding, Workspace } from '../../domain/workspace'
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
import { candidateFigures, selectedScenario } from './RecommenderCard.figures'
import { CandidateFigureRows, FiguresBasisNote } from './RecommenderCard.figureRows'

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
  preferredEtfInstanceId?: string
  workspace: Workspace
  baselineCombined: CombinedResult
  baselinePerInstance: Record<string, ProductResult[]>
  portfolioFunding?: PortfolioFunding
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
  portfolioFunding,
  grvGrossMonthlyPension,
  marginalMonthlyEUR,
  bavOffer,
  preferredEtfInstanceId,
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
      portfolioFunding,
      grvGrossMonthlyPension,
      selectedScenarioId,
      bavOffer,
  preferredEtfInstanceId,
    })
  }, [
    workspace,
    marginalMonthlyEUR,
    baselinePerInstance,
    baselineCombined,
    portfolioFunding,
    grvGrossMonthlyPension,
    selectedScenarioId,
    bavOffer,
  preferredEtfInstanceId,
  ])

  const sorted = useMemo(() => {
    return rankRecommendedCandidates(candidates, ranking)
  }, [candidates, ranking])

  const baselineNominal = baselineCombined.monthlyNetIncome
  const rankingMax = useMemo(() => {
    return Math.max(0, ...sorted.map((cand) => rankingValue(cand, ranking, baselineNominal)))
  }, [sorted, ranking, baselineNominal])

  const figuresContext = useMemo(
    () => ({ workspace, baselineCombined, rules: de2026Rules, selectedScenarioId }),
    [workspace, baselineCombined, selectedScenarioId],
  )
  const scenario = selectedScenario(workspace, selectedScenarioId)

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
    <section className="recommender-card" aria-label="Beiträge je Vertrag vergleichen" {...sectionTargetProps}>
      {/* PR 6: heading + per-candidate "winner badge" neutralised — the card
          now answers a question instead of crowning a winner. The sort row
          below still lets the user re-rank by criterion; the row order
          stays informational. */}
      <h3>
        Welcher Vertrag profitiert am stärksten von{' '}
        {formatCurrency(marginalMonthlyEUR, 0)} zusätzlich im Monat?
      </h3>

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
          <FiguresBasisNote scenario={scenario} className="recommender-basis-note" />

          <div className="recommender-sort-row">
            {/* PR 6: dropped the "Beste Option für …" indicator span. The
                sort buttons below stay informational — they re-rank the
                list by criterion without crowning a winner. */}
            <span className="recommender-sort-indicator" id="recommender-sort-label">
              Sortieren nach
            </span>
            <div
              className="recommender-sort-buttons"
              role="group"
              aria-labelledby="recommender-sort-label"
            >
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
            {sorted.map((cand) => {
              const scorePct = relativeRankingPct(cand, ranking, rankingMax, baselineNominal)
              const figures = candidateFigures(cand, figuresContext)
              // Per-product color (PRODUCT_REGISTRY single source of truth);
              // Sober D ink as the neutral fallback if the registry lookup
              // misses, so we never reach for the legacy blue palette.
              const productColor = getProductMeta(cand.productId)?.color ?? 'var(--rw-ink)'
              const atomDetailsId = `recommender-${cand.id}-atom-details`
              const atomsExpanded = expandedAtomIds.has(cand.id)
              return (
              <li key={cand.id} className="recommender-candidate" {...qaTarget(qaEnabled, `dashboard.recommenderCard.candidate.${cand.productId}`, { label: cand.label })}>
                {/* PR 6: per-candidate winner badge removed. The relative
                    ranking meter below still surfaces how each candidate
                    scores against the criterion, without crowning a winner. */}
                <div className="recommender-candidate-header">
                  <div className="recommender-candidate-title">
                    <strong>{cand.label}</strong>
                    {cand.isNewInstance && (
                      <span className="recommender-candidate-product">
                        Neue Sparform: {figures.productLabel}
                      </span>
                    )}
                  </div>
                  <span className="recommender-candidate-budget">
                    {formatCurrency(cand.netCashOutEUR, 0)} netto zusätzlich / Mon.
                    {Math.abs(cand.grossMonthlyEUR - cand.netCashOutEUR) >= 0.5 && (
                      <> · {formatCurrency(cand.grossMonthlyEUR, 0)} brutto</>
                    )}
                  </span>
                </div>
                {figures.productStartYear !== null && (
                  <span className="recommender-candidate-tag recommender-candidate-tag--info">
                    Abschluss erst ab {figures.productStartYear} möglich
                  </span>
                )}
                <div className="recommender-ranking">
                  <div className="recommender-ranking-copy">
                    <span>
                      Vergleichswert · {RECOMMENDER_RANKING_LABELS[ranking]}
                      <InfoTip
                        label={`Vergleichswert für ${cand.label} erklären`}
                        text={rankingExplanation(ranking)}
                      />
                    </span>
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
                {/* Audit F02 / F16: every money figure comes from the shared
                    figures module (today's euros, scope-labelled). The saved
                    confirmation renders the same rows. */}
                <CandidateFigureRows figures={figures} candidateLabel={cand.label}>
                  <div className="recommender-figures__row">
                    <dt>Flexibilität</dt>
                    <dd>{FLEX_LABEL[cand.flexibilityScore]}</dd>
                  </div>
                  <div className="recommender-figures__row">
                    <dt>Aufwand</dt>
                    <dd>{EFFORT_LABEL[cand.effort.level]}</dd>
                  </div>
                </CandidateFigureRows>
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

// PR 6: `winningMetric` helper removed — its single caller (the per-candidate
// "Beste Option für …" badge) is gone. The relative ranking meter still
// surfaces score-versus-best as a percentage so users see how the candidates
// compare without crowning a winner.

function detectProductId(inst: { instanceId: string }): ProductId {
  return productIdFromInstanceId(inst.instanceId) ?? 'etf'
}

/**
 * Value behind the comparison meter. Whole-plan metrics are measured as the
 * *gain over the baseline* (audit F16): comparing 4 055 € against 4 065 € for
 * the whole plan reads as "96 % vs 100 %" and hides that one option buys
 * twice the extra income of the other. The sort order is unchanged because the
 * baseline is the same for every candidate.
 */
function rankingValue(
  cand: RecommendedCandidate,
  criterion: RecommenderRankingCriterion,
  baselineNominal: number,
): number {
  if (criterion === 'median_net_pension') return Math.max(0, cand.medianNettoRente - baselineNominal)
  // Issue #67: meter normalisation tracks the net-capital metric to keep the
  // visual ranking consistent with the displayed figure.
  if (criterion === 'capital_at_retirement') return cand.netCapitalAtRetirement
  if (criterion === 'safety') return Math.max(0, cand.safetyNettoRenteP10 - baselineNominal)
  if (criterion === 'flexibility') return FLEX_RANK[cand.flexibilityScore]
  return cand.effort.score
}

function relativeRankingPct(
  cand: RecommendedCandidate,
  criterion: RecommenderRankingCriterion,
  rankingMax: number,
  baselineNominal: number,
): number {
  if (rankingMax <= 0) return 0
  const raw = rankingValue(cand, criterion, baselineNominal)
  const pct = Math.max(0, Math.min(100, (raw / rankingMax) * 100))
  return Math.round(pct)
}

function rankingExplanation(criterion: RecommenderRankingCriterion): string {
  const shared = '100 % ist der beste Vorschlag in dieser Liste, die anderen werden daran gemessen. Der Wert vergleicht nur die Vorschläge untereinander und sagt nichts über die Qualität deines Plans.'
  if (criterion === 'median_net_pension') {
    return `Gemessen wird die zusätzliche Netto-Rente, die das Budget kauft, nicht die Gesamtrente. ${shared}`
  }
  if (criterion === 'safety') {
    return `Gemessen wird der Zuwachs im vereinfachten Risikoszenario. ${shared}`
  }
  if (criterion === 'capital_at_retirement') {
    return `Gemessen wird das zusätzliche Kapital bei Renteneintritt. ${shared}`
  }
  return shared
}

// `buildWhatIfFromCandidate` is re-exported by the orchestration consumer
// (App.tsx) by importing directly from `src/app/recommender.ts`. The
// recommender engine remains the single source of truth.
