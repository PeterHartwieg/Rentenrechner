/**
 * Next-€X recommender orchestrator (architecture-readability issue 11).
 *
 * Pure module — no React imports, no DOM access.
 *
 * Given a baseline workspace + a marginal monthly NET out-of-pocket budget,
 * generates ranked candidate allocations with trade-off labels.
 *
 * Math contract:
 *   The user's `marginalMonthlyEUR` is the additional after-tax cash they are
 *   willing to commit each month. Each candidate is sized so the user's net
 *   cash outflow equals `marginalMonthlyEUR`:
 *
 *   - ETF / AVD: gross = marginalMonthlyEUR (no accumulation tax leverage).
 *   - bAV: marginal gross conversion solved via local bisection on
 *     `forward(used + delta).monthlyNetCost - forward(used).monthlyNetCost`,
 *     so users with existing bAV get a delta sized to their actual marginal
 *     net cost (not the cost of an isolated standalone bAV).
 *   - Basisrente: gross sized so (gross - §10 Abs. 3 EStG marginal saving) ≈
 *     marginalMonthlyEUR. Bisection inside `solveBasisrenteGrossFromNet`.
 *   - Riester: ownContribution sized so (own - allowance/12 - Günstigerprüfung
 *     refund) ≈ marginalMonthlyEUR. Bisection inside `solveRiesterOwnFromNet`.
 *
 * Cap clamping:
 *   When the sized gross exceeds the relevant statutory cap (bAV §3 Nr. 63,
 *   Riester €2,100/yr, Basisrente Schicht-1, AVD per-contract cap), the
 *   candidate's gross is clamped to the cap remainder and a `cap_full_warning`
 *   atom is attached. Candidates that would be statutorily impossible (zero
 *   remaining cap) are skipped.
 *
 * Median Netto-Rente:
 *   The candidate's after-tax monthly retirement income is computed by
 *   simulating its accumulation at the basis scenario's expected return,
 *   projecting a ProductResult, then folding it into a cloned per-instance
 *   bundle and re-running `combinePortfolio` on the candidate workspace.
 *
 * Risk score (P10):
 *   `riskScoreP10` is the 10th-percentile of total nominal capital at
 *   retirement across N stochastic paths sampled from the basis scenario's
 *   expected return + `assumptions.monteCarlo.annualVolatility`. The MC sim
 *   used here is a lightweight FV simulator over the candidate's marginal
 *   monthly contribution and fees — consistent with the deterministic FV
 *   used for `medianNettoRente`. We do not run the full per-instance engine
 *   per path: budget is under 500ms total for 4 candidates × 200 paths.
 *
 *   The deterministic basis-scenario capital remains as `riskScore` for
 *   back-compat (still used by the UI's "Endkapital" sort key); P10 is
 *   exposed via `riskScoreP10` and is the primary worst-case figure shown.
 *
 * Module structure:
 *   Per-product candidate generation lives in `recommenderCandidates/`:
 *     - `etf.ts`               makeEtfCandidate
 *     - `bav.ts`               makeBavCandidate
 *     - `basisrente.ts`        makeBasisrenteCandidate
 *     - `altersvorsorgedepot.ts` makeAvdCandidate
 *     - `insurance.ts`         makeInsuranceCandidate
 *     - `riester.ts`           makeRiesterTopUpCandidate
 *     - `index.ts`             CANDIDATE_GENERATORS registry
 *   This file is the thin orchestrator: build context → call registry →
 *   score / rank candidates → materialise what-ifs.
 */

import type {
  GermanRules,
  ProductId,
  ProductResult,
} from '../domain'
import type { Scenario, Workspace, WhatIfScenario } from '../domain/workspace'
import type {
  BavInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../domain/instances'
import { combinePortfolio, type CombinedResult } from '../engine/portfolioCombine'
import { buildCombineContext, type CombineContext } from '../engine/combineContext'
import { runRules, type Atom } from './recommendations'
import { SeededNormal, generateMarketReturnPath } from '../engine/monteCarlo'
import {
  forkBaselineScenario,
  deepCloneScenario,
  newScenarioId,
} from './portfolioState'
import { newInstanceId } from './workspaceIdentity'
import { defaultAssumptions } from '../data/defaultScenario'
import {
  CANDIDATE_GENERATORS,
  basisInstanceResults,
  type CandidateDraft,
  type GeneratorContext,
  type BasisScenarioInfo,
  type BavEmployerOfferInput,
  type ResolvedBavOffer,
  MAX_LIFETIME_YEARS,
  MC_PATHS,
  MAX_CANDIDATES,
  monthlyEmployerContributionForOffer,
} from './recommenderCandidates'

// Re-export for consumers that import BavEmployerOfferInput / ResolvedBavOffer
// from this module directly (back-compat with the pre-refactor surface).
export type { BavEmployerOfferInput, ResolvedBavOffer }

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FlexibilityScore = 'high' | 'medium' | 'low'
export type FlexibilityCriterionScore = 'easy' | 'restricted' | 'hard'
export type EffortLevel = 'low' | 'medium' | 'high'

export type RecommenderRankingCriterion =
  | 'median_net_pension'
  | 'capital_at_retirement'
  | 'safety'
  | 'flexibility'
  | 'low_effort'

export const RECOMMENDER_RANKING_LABELS: Record<RecommenderRankingCriterion, string> = {
  median_net_pension: 'höchste mittlere Netto-Rente',
  capital_at_retirement: 'höchstes Kapital bei Renteneinstieg',
  safety: 'Sicherheit',
  flexibility: 'Flexibilität',
  low_effort: 'wenig Aufwand',
}

export interface FlexibilityDetails {
  overall: FlexibilityScore
  criteria: {
    cancel: FlexibilityCriterionScore
    switchAsset: FlexibilityCriterionScore
    switchProduct: FlexibilityCriterionScore
    adjustContribution: FlexibilityCriterionScore
  }
}

export interface EffortDetails {
  /** Higher means less next-action friction. */
  score: number
  level: EffortLevel
  details: string[]
}

export interface RecommendedCandidate {
  /** Stable id used by the UI as a React key and by tests for ordering assertions. */
  id: string
  /** German display label. */
  label: string
  /** Product class the candidate routes the marginal contribution into. */
  productId: ProductId
  /** True for "Start new …" candidates; false when the candidate adds to an existing instance. */
  isNewInstance: boolean
  /** Set when adding to an existing instance. */
  targetInstanceId?: string
  /**
   * Gross monthly contribution (EUR/month) sized so net cash out-of-pocket ≈
   * marginalMonthlyEUR (or clamped to the statutory cap remainder).
   */
  grossMonthlyEUR: number
  /**
   * Actual net cash out-of-pocket (EUR/month). Equal to marginalMonthlyEUR within
   * solver tolerance unless the candidate was clamped to a cap.
   */
  netCashOutEUR: number
  /** Combined monthly net retirement income (EUR/month) with the candidate added. */
  medianNettoRente: number
  /** Estimated lifetime cash payouts (EUR) — net monthly × 12 × longevity assumption. */
  lifetimeCash: number
  /** Ordinal flexibility class (capital availability before retirement). */
  flexibilityScore: FlexibilityScore
  flexibilityDetails: FlexibilityDetails
  effort: EffortDetails
  /** Expected capital at retirement (EUR) under the basis scenario (deterministic).
   *  Retained for back-compat with the existing "Endkapital" sort. */
  riskScore: number
  /** Alias for the deterministic retirement capital used by ranking filters. */
  capitalAtRetirement: number
  /**
   * Issue 67: net (after-tax) capital available to the user at retirement. Uses
   * `afterTaxLumpSum` when the product allows a capital payout (ETF, AVD, bAV
   * Direktversicherung, private insurance Halbeinkünfte/Abgeltungsteuer, Riester
   * 30 % teilauszahlung). For products where capital payout is legally
   * prohibited (Basisrente — only Leibrente/Zeitrente per §10 Abs. 1 Nr. 2 b
   * EStG) this falls back to `capitalAtRetirement` so the UI can still show a
   * comparable contractual value at retirement; the recommender card flags
   * those candidates with a `payoutOnly` indicator so the user understands the
   * value is annuitised, not a usable lump sum.
   */
  netCapitalAtRetirement: number
  /**
   * True when the product's "capital at retirement" is contractually
   * annuitised (Leibrente only) and not available as a lump sum. Used by the
   * UI to label the displayed net-capital figure as "Wert bei Renteneinstieg
   * (annuitisiert)" instead of "Kapital bei Renteneinstieg".
   */
  payoutOnly: boolean
  /**
   * Monte Carlo P10 of total nominal capital at retirement (EUR) — the
   * "bad-outcome floor": 10 of 100 simulated paths fall below this. Higher
   * is better. Computed from `MC_PATHS` paths sampled at the basis scenario's
   * expected return and `assumptions.monteCarlo.annualVolatility`.
   */
  riskScoreP10: number
  /**
   * Approximate 90%-floor monthly net pension with the candidate included.
   * This is the safety filter's primary metric; `riskScoreP10` remains capital.
   */
  safetyNettoRenteP10: number
  /** Number of MC paths used to compute riskScoreP10 (for transparency / tests). */
  riskScoreMcPaths: number
  /** Trade-off labels emitted by the rules engine. */
  atoms: Atom[]
  /** False when `profile.desiredNetMonthlyPension > 0` and the candidate's median falls below it. */
  wunschnettoFloorMet: boolean
  /** Set when the candidate hit a statutory cap and was clamped. */
  cappedToRemaining: boolean
  /** True when the bAV candidate uses standard assumptions instead of an employer offer. */
  usesStandardAssumptions?: boolean
  bavOffer?: ResolvedBavOffer
  /** Marginal employer contribution added by this bAV candidate, EUR/month. */
  monthlyEmployerContributionEUR?: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLEXIBILITY_BY_PRODUCT: Record<ProductId, FlexibilityDetails> = {
  etf: {
    overall: 'high',
    criteria: {
      cancel: 'easy',
      switchAsset: 'easy',
      switchProduct: 'easy',
      adjustContribution: 'easy',
    },
  },
  versicherung: {
    overall: 'medium',
    criteria: {
      cancel: 'restricted',
      switchAsset: 'restricted',
      switchProduct: 'restricted',
      adjustContribution: 'easy',
    },
  },
  altersvorsorgedepot: {
    overall: 'medium',
    criteria: {
      cancel: 'restricted',
      switchAsset: 'easy',
      switchProduct: 'restricted',
      adjustContribution: 'easy',
    },
  },
  riester: {
    overall: 'medium',
    criteria: {
      cancel: 'restricted',
      switchAsset: 'restricted',
      switchProduct: 'restricted',
      adjustContribution: 'easy',
    },
  },
  bav: {
    overall: 'low',
    criteria: {
      cancel: 'hard',
      switchAsset: 'restricted',
      switchProduct: 'hard',
      adjustContribution: 'restricted',
    },
  },
  basisrente: {
    overall: 'low',
    criteria: {
      cancel: 'hard',
      switchAsset: 'restricted',
      switchProduct: 'hard',
      adjustContribution: 'restricted',
    },
  },
}

const FLEX_RANK: Record<FlexibilityScore, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const DEFAULT_BAV_RECOMMENDER_OFFER: ResolvedBavOffer = {
  hasOffer: false,
  standardAssumption: true,
  employerMatchPercent: 0.15,
  fixedMonthlyEUR: 0,
  monthlyCapEUR: undefined,
  effectiveCostAnnual: 0.012,
  durchfuehrungsweg: 'direktversicherung_3_63',
  payoutMode: 'leibrente',
  rentenfaktor: 30,
}

// ---------------------------------------------------------------------------
// Orchestration helpers
// ---------------------------------------------------------------------------

/**
 * Issue 51: context-aware flexibility adjustment. Starting from the per-
 * product baseline (`FLEXIBILITY_BY_PRODUCT`) we lower individual sub-criteria
 * when the candidate's product data indicates a more restrictive shape:
 *
 * - Forced Leibrente lowers `cancel` and `switchProduct` (capital is annuitised
 *   and cannot be lifted out without a transfer process; switching products
 *   means surrender at a haircut).
 * - High surrender haircut lowers `cancel`.
 * - Capital option (kapitalverzehr / zeitrente / pre-2005 capital) RAISES
 *   private-insurance flexibility to "medium-high" via the per-product
 *   `mediumHighEligible` lookup — implemented by promoting `cancel` and
 *   `switchProduct` to `restricted` rather than `hard`.
 */
function adjustFlexibilityForContext(
  base: FlexibilityDetails,
  context: { forcedLeibrente?: boolean; capitalOption?: boolean; surrenderHaircutPct?: number },
): FlexibilityDetails {
  const cancel: FlexibilityCriterionScore = (() => {
    let value = base.criteria.cancel
    if (context.forcedLeibrente) value = lowerCriterion(value)
    if ((context.surrenderHaircutPct ?? 0) > 0.05) value = lowerCriterion(value)
    return value
  })()
  const switchProduct: FlexibilityCriterionScore = (() => {
    let value = base.criteria.switchProduct
    if (context.forcedLeibrente) value = lowerCriterion(value)
    return value
  })()
  // Capital option promotes the overall badge to "medium-high" (encoded as
  // `medium` overall + `restricted` instead of `hard`) for products whose
  // baseline marks cancel/switchProduct as `hard`.
  if (context.capitalOption && base.overall === 'medium') {
    return {
      overall: 'medium',
      criteria: { ...base.criteria, cancel, switchProduct },
    }
  }
  return {
    overall: base.overall,
    criteria: { ...base.criteria, cancel, switchProduct },
  }
}

function lowerCriterion(c: FlexibilityCriterionScore): FlexibilityCriterionScore {
  if (c === 'easy') return 'restricted'
  if (c === 'restricted') return 'hard'
  return 'hard'
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function pickBasisScenario(workspace: Workspace, selectedScenarioId?: string): BasisScenarioInfo {
  const wsa = workspace.baseline.assumptions
  // When the caller provides a selected scenario id (e.g. 'pessimistisch'), use
  // that scenario's return so the panel reacts to the user's scenario picker.
  // Fall back to 'basis' when the id is absent or no longer exists in the list.
  const selected = selectedScenarioId
    ? wsa.returnScenarios.find((s) => s.id === selectedScenarioId)
    : undefined
  const basis =
    selected ??
    wsa.returnScenarios.find((s) => s.id === 'basis') ??
    wsa.returnScenarios[0]
  if (!basis) {
    return { scenarioId: 'basis', annualReturn: 0.05 }
  }
  return { scenarioId: basis.id, annualReturn: basis.annualReturn }
}

function resolveBavOffer(input?: BavEmployerOfferInput): ResolvedBavOffer {
  if (!input || !input.hasOffer) return { ...DEFAULT_BAV_RECOMMENDER_OFFER }
  const cap =
    input.monthlyCapEUR !== undefined && input.monthlyCapEUR > 0
      ? input.monthlyCapEUR
      : undefined
  return {
    hasOffer: true,
    standardAssumption: false,
    employerMatchPercent: clampFinite(input.employerMatchPercent, 0, 5),
    fixedMonthlyEUR: clampFinite(input.fixedMonthlyEUR, 0, 100_000),
    monthlyCapEUR: cap,
    effectiveCostAnnual: clampFinite(input.effectiveCostAnnual, 0, 0.1),
    durchfuehrungsweg: input.durchfuehrungsweg ?? 'direktversicherung_3_63',
    payoutMode: input.payoutMode ?? 'leibrente',
    rentenfaktor: input.rentenfaktor ?? 30,
  }
}

// ---------------------------------------------------------------------------
// Combine a candidate's ProductResult into a candidate workspace
// ---------------------------------------------------------------------------

/**
 * Clone the workspace and add the candidate's instance metadata so
 * `combinePortfolio` can resolve `instanceId → instance` lookups consistently.
 *
 * For "add to existing" candidates the existing instance metadata is reused —
 * we only need to inject the candidate's *delta* contribution into the
 * synthesized ProductResult bundle (the workspace itself doesn't change because
 * combinePortfolio's instance metadata only carries fee + payout-mode shape,
 * not the contribution amount). The dashboard-mode bundle reflects the user's
 * existing contributions; the candidate's gross is layered on top via the
 * synthesized ProductResult that combinePortfolio sees alongside the baseline
 * results.
 */
function workspaceWithCandidateInstance(
  workspace: Workspace,
  draft: CandidateDraft,
): Workspace {
  if (!draft.isNewInstance || !draft.newInstance) return workspace
  const wsa = workspace.baseline.assumptions
  const newAsm = (() => {
    if (draft.productId === 'basisrente') {
      return { ...wsa, basisrente: [...wsa.basisrente, draft.newInstance as BasisrenteInstance] }
    }
    if (draft.productId === 'altersvorsorgedepot') {
      return {
        ...wsa,
        altersvorsorgedepot: [...wsa.altersvorsorgedepot, draft.newInstance as AltersvorsorgedepotInstance],
      }
    }
    if (draft.productId === 'riester') {
      return { ...wsa, riester: [...wsa.riester, draft.newInstance as RiesterInstance] }
    }
    if (draft.productId === 'bav') {
      return { ...wsa, bav: [...wsa.bav, draft.newInstance as BavInstance] }
    }
    return wsa
  })()
  return {
    ...workspace,
    baseline: { ...workspace.baseline, assumptions: newAsm },
  }
}

/**
 * Compute the candidate's combined retirement income by:
 *   1. Cloning the workspace with the candidate's new instance (when
 *      isNewInstance) so combinePortfolio's instance lookup map resolves.
 *   2. Producing a per-instance bundle: baseline basis-scenario results PLUS
 *      the candidate's synthesized ProductResult.
 *   3. Calling combinePortfolio over the merged bundle.
 *
 * For "add to existing instance" candidates: the candidateResult shares the
 * existing instance's id, but it represents the OPTIMIZED instance with extra
 * contribution layered on top. The simplest preservation of "marginal
 * benefit" is to ADD the candidate's gross monthly payout to the baseline
 * instance's gross, and re-combine. We do this by replacing the baseline
 * instance's result with a sum.
 */
function combinedForCandidate(
  workspace: Workspace,
  draft: CandidateDraft,
  baselinePerInstance: Record<string, ProductResult[]>,
  basisScenarioId: string,
  combineCtx: CombineContext,
): CombinedResult {
  const baselineResults = basisInstanceResults(baselinePerInstance, basisScenarioId)
  let merged: ProductResult[]
  if (draft.isNewInstance) {
    merged = [...baselineResults, draft.candidateResult]
  } else {
    let matchedExistingResult = false
    merged = baselineResults.map((r) => {
      if (r.instanceId !== draft.targetInstanceId) return r
      matchedExistingResult = true
      return {
        ...r,
        grossMonthlyPayout: r.grossMonthlyPayout + draft.candidateResult.grossMonthlyPayout,
        netMonthlyPayout: r.netMonthlyPayout + draft.candidateResult.netMonthlyPayout,
        capitalAtRetirement: r.capitalAtRetirement + draft.candidateResult.capitalAtRetirement,
        totalProductContributions: r.totalProductContributions + draft.candidateResult.totalProductContributions,
        totalContributionsBeforeFees:
          r.totalContributionsBeforeFees + draft.candidateResult.totalContributionsBeforeFees,
      }
    })
    if (!matchedExistingResult) {
      merged = [...merged, draft.candidateResult]
    }
  }
  const candidateWorkspace = workspaceWithCandidateInstance(workspace, draft)
  return combinePortfolio(candidateWorkspace, merged, combineCtx)
}

function effortForCandidate(
  workspace: Workspace,
  draft: CandidateDraft,
  bavOffer?: ResolvedBavOffer,
): EffortDetails {
  const wsa = workspace.baseline.assumptions
  const hasExisting = !draft.isNewInstance
  let score = hasExisting ? 70 : 45
  const details: string[] = []

  if (hasExisting) {
    details.push('Bestehenden Vertrag erhöhen')
    score += 10
  } else {
    details.push('Neuen Vertrag eröffnen')
  }

  if (draft.productId === 'etf') {
    const hasDepot = wsa.etf.some((e) => e.status !== 'surrendered')
    if (hasDepot) {
      score = 92
      details.push('Depot ist bereits vorhanden')
    }
  } else if (draft.productId === 'bav') {
    if (bavOffer?.hasOffer) {
      score += 10
      details.push('Arbeitgeberangebot liegt vor')
    } else if (bavOffer?.standardAssumption) {
      score -= 20
      details.push('Standardannahmen statt konkretem Arbeitgeberangebot')
    }
  } else if (draft.productId === 'riester') {
    const target = draft.targetInstanceId
      ? wsa.riester.find((r) => r.instanceId === draft.targetInstanceId)
      : undefined
    if (!target?.eligibility?.directlyEligible && !target?.eligibility?.indirectSpouseEligible) {
      score -= 15
      details.push('Förderberechtigung muss geprüft werden')
    }
  } else if (draft.productId === 'altersvorsorgedepot') {
    score -= 8
    details.push('Förder- und Depotangebot prüfen')
  } else if (draft.productId === 'basisrente') {
    score -= 12
    details.push('Neues steuerlich gebundenes Vertragsangebot nötig')
  } else if (draft.productId === 'versicherung') {
    score -= 12
    details.push('Versicherungsangebot nötig')
  }

  score = clampFinite(score, 0, 100)
  const level: EffortLevel = score >= 75 ? 'low' : score >= 50 ? 'medium' : 'high'
  return { score, level, details }
}

/**
 * Issue 51: derive flexibility context for a candidate. Leibrente payouts
 * force annuitisation; capital options (Kapitalverzehr / Zeitrente /
 * pre-2005 capital eligible) keep capital available; surrender haircuts
 * make cancellation costly.
 */
function flexibilityContextForDraft(
  workspace: Workspace,
  draft: CandidateDraft,
  bavOffer: ResolvedBavOffer,
): { forcedLeibrente?: boolean; capitalOption?: boolean; surrenderHaircutPct?: number } {
  const wsa = workspace.baseline.assumptions
  if (draft.productId === 'bav') {
    const target = draft.targetInstanceId
      ? wsa.bav.find((b) => b.instanceId === draft.targetInstanceId)
      : undefined
    const payoutMode = target?.payoutMode ?? bavOffer.payoutMode
    return {
      forcedLeibrente: payoutMode === 'leibrente',
      capitalOption: payoutMode === 'kapitalverzehr' || payoutMode === 'zeitrente',
    }
  }
  if (draft.productId === 'versicherung') {
    const target = draft.targetInstanceId
      ? wsa.insurance.find((i) => i.instanceId === draft.targetInstanceId)
      : undefined
    return {
      forcedLeibrente: target?.payoutMode === 'leibrente',
      capitalOption: target?.payoutMode === 'kapitalverzehr' || target?.payoutMode === 'zeitrente',
      surrenderHaircutPct: target?.surrenderHaircutPct,
    }
  }
  if (draft.productId === 'basisrente') {
    return { forcedLeibrente: true } // Basisrente can never pay out as capital
  }
  return {}
}

function safetyMonthlyP10(
  baselineMonthlyNet: number,
  medianMonthlyNet: number,
  deterministicCapital: number,
  p10Capital: number,
): number {
  const marginalMedian = Math.max(0, medianMonthlyNet - baselineMonthlyNet)
  if (marginalMedian <= 0 || deterministicCapital <= 0) return medianMonthlyNet
  const p10Ratio = Math.min(1, Math.max(0, p10Capital / deterministicCapital))
  return baselineMonthlyNet + marginalMedian * p10Ratio
}

// ---------------------------------------------------------------------------
// Monte Carlo helpers (kept here — not product-specific)
// ---------------------------------------------------------------------------

/**
 * 10th-percentile from a sample. Uses linear interpolation on the sorted
 * array — same convention as `monteCarlo.ts`'s `percentileFromSorted`. Inlined
 * here (not imported) so the recommender stays a pure module without pulling
 * the full MC engine surface.
 */
function p10FromSorted(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const index = (sorted.length - 1) * 0.1
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  if (lo === hi) return sorted[lo]
  const weight = index - lo
  return sorted[lo] * (1 - weight) + sorted[hi] * weight
}

/**
 * Hash a string to a 32-bit unsigned integer. Used to derive a deterministic
 * per-candidate MC seed from the workspace seed + candidate id, so two
 * candidates in the same recommender run draw uncorrelated paths but a repeat
 * call with identical inputs reproduces the ranking exactly.
 */
function hashStringToU32(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * Compute P10 of total nominal capital at retirement for a candidate.
 *
 * Per path:
 *   1. Sample `years` annual gross returns via `generateMarketReturnPath`
 *      (lognormal around `expectedReturn` + `volatility`, identical to the
 *      dashboard MC panel's market path).
 *   2. Subtract the candidate's combined accumulation fee from each year's
 *      return (mirrors the deterministic FV's `netReturn = annualReturn - fees`).
 *   3. Compound month-by-month using the geometric monthly rate of that year.
 *
 * Cost: ~years×12 multiplications per path; for 30 yr × 200 paths × 4
 * candidates ≈ 290k ops — negligible vs. the 500 ms budget.
 */
function monteCarloP10Capital(
  monthlyContribution: number,
  totalFeeDecimal: number,
  expectedReturn: number,
  volatility: number,
  years: number,
  paths: number,
  seed: number,
): number {
  if (monthlyContribution <= 0 || years <= 0 || paths <= 0) return 0
  const rng = new SeededNormal(seed)
  const finals: number[] = new Array(paths)
  for (let p = 0; p < paths; p++) {
    const path = generateMarketReturnPath({
      years,
      expectedAnnualReturn: expectedReturn,
      annualVolatility: volatility,
      rng,
    })
    let balance = 0
    for (let y = 0; y < path.length; y++) {
      const netAnnual = Math.max(-0.99, path[y] - totalFeeDecimal)
      const monthlyRate = Math.pow(1 + netAnnual, 1 / 12) - 1
      // Apply ordinary-annuity FV for the year, compounding existing balance.
      // balance_{end} = balance_{start} × (1+r)^12 + c × ((1+r)^12 − 1) / r
      const growth = Math.pow(1 + monthlyRate, 12)
      balance = balance * growth +
        (Math.abs(monthlyRate) < 1e-9
          ? monthlyContribution * 12
          : monthlyContribution * (growth - 1) / monthlyRate)
    }
    finals[p] = balance
  }
  finals.sort((a, b) => a - b)
  return p10FromSorted(finals)
}

// ---------------------------------------------------------------------------
// Public ranking API
// ---------------------------------------------------------------------------

export function rankRecommendedCandidates(
  candidates: readonly RecommendedCandidate[],
  criterion: RecommenderRankingCriterion = 'median_net_pension',
): RecommendedCandidate[] {
  return [...candidates].sort((a, b) => compareCandidates(a, b, criterion))
}

function compareCandidates(
  a: RecommendedCandidate,
  b: RecommendedCandidate,
  criterion: RecommenderRankingCriterion,
): number {
  if (criterion === 'median_net_pension') {
    return desc(a.medianNettoRente, b.medianNettoRente)
  }
  if (criterion === 'capital_at_retirement') {
    // Issue #67: rank by NET capital at retirement, not gross. For
    // products that legally cannot pay out as capital (Basisrente)
    // `netCapitalAtRetirement` falls back to the contractual value at
    // retirement so the ordering still reflects accumulated value.
    return desc(a.netCapitalAtRetirement, b.netCapitalAtRetirement)
  }
  if (criterion === 'safety') {
    return (
      desc(a.safetyNettoRenteP10, b.safetyNettoRenteP10) ||
      desc(a.medianNettoRente, b.medianNettoRente)
    )
  }
  if (criterion === 'flexibility') {
    return (
      desc(FLEX_RANK[a.flexibilityDetails.overall], FLEX_RANK[b.flexibilityDetails.overall]) ||
      desc(a.medianNettoRente, b.medianNettoRente)
    )
  }
  return (
    desc(a.effort.score, b.effort.score) ||
    desc(a.medianNettoRente, b.medianNettoRente)
  )
}

function desc(a: number, b: number): number {
  return b - a
}

// ---------------------------------------------------------------------------
// Public API — recommendNextEuro
// ---------------------------------------------------------------------------

export interface RecommendNextEuroInput {
  workspace: Workspace
  rules: GermanRules
  marginalMonthlyEUR: number
  /**
   * Per-instance basis-scenario ProductResults indexed by instanceId. Caller
   * passes the bundle from `useCombineSimulation`.
   */
  baselinePerInstance: Record<string, ProductResult[]>
  /** Combined baseline (for the selected scenario). */
  baselineCombined: CombinedResult
  /** Statutory pension monthly gross (selected scenario). */
  grvGrossMonthlyPension: number
  /**
   * The user's currently selected return scenario id (e.g. 'basis',
   * 'pessimistisch', 'optimistisch'). When provided, the recommender uses
   * this scenario's `annualReturn` for candidate projections so the panel
   * stays in sync with the scenario picker.
   *
   * Falls back to the 'basis' scenario when absent or not found.
   */
  selectedScenarioId?: string
  /** Answers from the Lücke-schließen modal's bAV employer-offer step. */
  bavOffer?: BavEmployerOfferInput
}

export function recommendNextEuro(input: RecommendNextEuroInput): RecommendedCandidate[] {
  const { workspace, rules, marginalMonthlyEUR } = input
  if (marginalMonthlyEUR <= 0) return []

  const profile = workspace.baseline.profile
  const yearsToRetirement = Math.max(1, profile.retirementAge - profile.age)
  const basis = pickBasisScenario(workspace, input.selectedScenarioId)
  const combineCtx = buildCombineContext({
    profile,
    rules,
    statutoryPension: workspace.baseline.assumptions.statutoryPension,
    grvGrossMonthlyPension: input.grvGrossMonthlyPension,
    hasPartner: workspace.baseline.partner !== undefined,
  })
  const wsa = workspace.baseline.assumptions
  const mcSeedBase = wsa.monteCarlo?.seed ?? 2026
  const mcVolatility = wsa.monteCarlo?.annualVolatility ?? 0.15
  const bavOffer = resolveBavOffer(input.bavOffer)

  const g: GeneratorContext = {
    workspace,
    rules,
    marginalMonthlyEUR,
    basis,
    yearsToRetirement,
    baselinePerInstance: input.baselinePerInstance,
    baselineCombined: input.baselineCombined,
    combineCtx,
    bavOffer,
  }

  // Generate raw candidates via the product registry (one per product class).
  const drafts: CandidateDraft[] = []
  for (const gen of CANDIDATE_GENERATORS) {
    const d = gen(g)
    if (d) drafts.push(d)
  }

  // Wunschnetto floor (defaults to 0 = no target set; treated as "not enforced").
  const wunschnetto = profile.desiredNetMonthlyPension ?? 0

  // Materialise each draft into a RecommendedCandidate via combinePortfolio.
  const candidates: RecommendedCandidate[] = drafts.map((d) => {
    const combined = combinedForCandidate(
      workspace,
      d,
      input.baselinePerInstance,
      basis.scenarioId,
      combineCtx,
    )
    const median = combined.monthlyNetIncome
    const lifetimeYears = Math.max(
      1,
      Math.min(
        MAX_LIFETIME_YEARS,
        workspace.baseline.assumptions.retirementEndAge - profile.retirementAge,
      ),
    )
    const lifetimeCash = median * 12 * lifetimeYears
    const wunschnettoFloorMet = wunschnetto > 0 ? median >= wunschnetto : true
    const atoms: Atom[] = runRules({
      workspace,
      simulationResult: { products: basisInstanceResults(input.baselinePerInstance, basis.scenarioId) },
      combinedResult: combined,
      marginalBudgetEUR: marginalMonthlyEUR,
    }).filter((a) => isCandidateRelevantAtom(a, d))
    if (d.cappedToRemaining) {
      // Atoms emitted by the rules engine describe the BASELINE context (e.g.
      // "you currently use 80 % of the bAV cap"). This atom describes a
      // CANDIDATE-EFFECT — the chosen candidate hit its product's statutory
      // cap and was clamped. `capFullForCandidate: true` discriminates this
      // shape from baseline-context atoms with the same id (N6).
      const capAtomId = capRemainingAtomIdFor(d.productId)
      if (capAtomId) {
        atoms.push({
          id: capAtomId,
          priority: 'high',
          context: { usedPct: 1, remainingMonthly: 0, capFullForCandidate: true },
        })
      }
    }
    // P10 risk score: re-run the candidate's marginal accumulation under
    // `MC_PATHS` stochastic paths to estimate the bad-outcome floor.
    // Seed is derived from (workspace MC seed) ⊕ hash(candidate id) so the
    // same workspace+budget produces an identical ranking every call, while
    // distinct candidates draw uncorrelated paths.
    const candidateSeed = (mcSeedBase ^ hashStringToU32(d.id)) >>> 0
    const riskScoreP10 = monteCarloP10Capital(
      d.mcInputs.monthlyContribution,
      d.mcInputs.totalFeeDecimal,
      basis.annualReturn,
      mcVolatility,
      yearsToRetirement,
      MC_PATHS,
      candidateSeed,
    )
    const safetyNettoRenteP10 = safetyMonthlyP10(
      input.baselineCombined.monthlyNetIncome,
      median,
      d.candidateResult.capitalAtRetirement,
      riskScoreP10,
    )
    // Issue 51: context-aware flexibility. `flexCtx` is sourced from the
    // candidate's underlying instance/offer payload (Leibrente forced, capital
    // option available, surrender haircut). The per-product baseline is taken
    // from `FLEXIBILITY_BY_PRODUCT` and then lowered/raised in place.
    const flexCtx = flexibilityContextForDraft(workspace, d, bavOffer)
    const flexibilityDetails = adjustFlexibilityForContext(
      FLEXIBILITY_BY_PRODUCT[d.productId],
      flexCtx,
    )
    // Issue 67: net capital at retirement. afterTaxLumpSum is null for products
    // with a forced annuity payout (Basisrente). Fall back to gross capital so
    // the UI still has a value to render — accompanied by `payoutOnly: true`.
    const netCapitalAtRetirement = d.candidateResult.afterTaxLumpSum
      ?? d.candidateResult.capitalAtRetirement
    const payoutOnly = d.candidateResult.afterTaxLumpSum === null
    return {
      id: d.id,
      label: d.label,
      productId: d.productId,
      isNewInstance: d.isNewInstance,
      targetInstanceId: d.targetInstanceId,
      grossMonthlyEUR: d.grossMonthlyEUR,
      netCashOutEUR: d.netCashOutEUR,
      medianNettoRente: median,
      lifetimeCash,
      flexibilityScore: flexibilityDetails.overall,
      flexibilityDetails,
      effort: effortForCandidate(workspace, d, d.productId === 'bav' ? d.bavOffer : bavOffer),
      riskScore: d.candidateResult.capitalAtRetirement,
      capitalAtRetirement: d.candidateResult.capitalAtRetirement,
      netCapitalAtRetirement,
      payoutOnly,
      riskScoreP10,
      safetyNettoRenteP10,
      riskScoreMcPaths: MC_PATHS,
      atoms,
      wunschnettoFloorMet,
      cappedToRemaining: d.cappedToRemaining,
      usesStandardAssumptions: d.usesStandardAssumptions,
      bavOffer: d.bavOffer,
      monthlyEmployerContributionEUR: d.monthlyEmployerContributionEUR,
    }
  })

  // Default ranking: median Netto-Rente desc. The dashboard exposes a "Risiko
  // (P10)" sort that reorders by `riskScoreP10` desc; we keep the list
  // ordering here stable on median so the existing UI tests pass.
  candidates.sort((a, b) => compareCandidates(a, b, 'median_net_pension'))
  return candidates.slice(0, MAX_CANDIDATES)
}

// ---------------------------------------------------------------------------
// Atom relevance filter
// ---------------------------------------------------------------------------

function isCandidateRelevantAtom(atom: Atom, draft: CandidateDraft): boolean {
  const productMatches: Record<ProductId, string[]> = {
    etf: ['sparerpauschbetrag_remaining'],
    bav: ['bav_cap_remaining'],
    versicherung: [],
    basisrente: ['basisrente_cap_remaining'],
    altersvorsorgedepot: ['avd_cap_remaining'],
    riester: ['riester_cap_remaining'],
  }
  const allowed = productMatches[draft.productId]
  return allowed.includes(atom.id)
}

/**
 * Map a candidate's productId to the cap-clamp atom id the rules engine
 * emits for that product. Returns null when the product has no cap (ETF) —
 * cap-clamp candidates with `cappedToRemaining: true` should never reach this
 * for ETF (no cap on the recommender's ETF candidate).
 */
function capRemainingAtomIdFor(productId: ProductId): Atom['id'] | null {
  switch (productId) {
    case 'bav':
      return 'bav_cap_remaining'
    case 'basisrente':
      return 'basisrente_cap_remaining'
    case 'riester':
      return 'riester_cap_remaining'
    case 'altersvorsorgedepot':
      return 'avd_cap_remaining'
    case 'etf':
    case 'versicherung':
      return null
  }
}

// ---------------------------------------------------------------------------
// "Save as plan" helper — materialise a candidate as a what-if scenario
// ---------------------------------------------------------------------------

/**
 * Build a what-if scenario representing a chosen candidate. Caller is expected
 * to push it into `usePortfolioState.addWhatIf` (or call `forkBaselineScenario`
 * directly when the recommender is wired into a UI that already manages
 * portfolio state).
 *
 * The returned scenario carries `origin: 'recommender'` so the scenario
 * library can identify recommender-originated plans.
 */
export function buildWhatIfFromCandidate(
  baseline: Scenario,
  candidate: RecommendedCandidate,
): WhatIfScenario {
  const label = candidate.label
  const fork = forkBaselineScenario(baseline, label, 'recommender')
  // Apply the candidate's contribution change to the cloned assumptions.
  const wsa = deepCloneScenario(fork.assumptions)
  applyCandidateToAssumptions(wsa, candidate)
  return {
    ...fork,
    id: newScenarioId('whatif'),
    assumptions: wsa,
  }
}

function applyCandidateToAssumptions(
  wsa: Scenario['assumptions'],
  candidate: RecommendedCandidate,
): void {
  if (!candidate.isNewInstance && candidate.targetInstanceId) {
    if (candidate.productId === 'bav') {
      const idx = wsa.bav.findIndex((b) => b.instanceId === candidate.targetInstanceId)
      if (idx >= 0) {
        const current = wsa.bav[idx]
        const offerPatch = bavOfferPatchForSavedPlan(candidate, current.monthlyGrossConversion + candidate.grossMonthlyEUR)
        wsa.bav[idx] = {
          ...current,
          status: current.status === 'offered' ? 'active' : current.status,
          monthlyGrossConversion: (current.monthlyGrossConversion ?? 0) + candidate.grossMonthlyEUR,
          ...offerPatch,
        }
      }
    } else if (candidate.productId === 'riester') {
      const idx = wsa.riester.findIndex((r) => r.instanceId === candidate.targetInstanceId)
      if (idx >= 0) {
        const current = wsa.riester[idx]
        wsa.riester[idx] = {
          ...current,
          monthlyOwnContribution: (current.monthlyOwnContribution ?? 0) + candidate.grossMonthlyEUR,
        }
      }
    } else if (candidate.productId === 'etf') {
      const idx = wsa.etf.findIndex((e) => e.instanceId === candidate.targetInstanceId)
      if (idx >= 0) {
        const current = wsa.etf[idx]
        wsa.etf[idx] = {
          ...current,
          monthlyContribution: (current.monthlyContribution ?? 0) + candidate.grossMonthlyEUR,
        }
      }
    } else if (candidate.productId === 'versicherung') {
      // Issue 66: insurance candidate top-up. Activates an offered contract
      // and bumps the per-instance monthlyContribution that combine-mode
      // honors via `BuildContextOverrides.insuranceMonthlyUserCostOverride`.
      const idx = wsa.insurance.findIndex((i) => i.instanceId === candidate.targetInstanceId)
      if (idx >= 0) {
        const current = wsa.insurance[idx]
        wsa.insurance[idx] = {
          ...current,
          status: current.status === 'offered' ? 'active' : current.status,
          monthlyContribution:
            (current.monthlyContribution ?? 0) + candidate.grossMonthlyEUR,
        }
      }
    }
    return
  }
  // New-instance candidates: append a fresh instance with the sized contribution.
  if (candidate.productId === 'basisrente') {
    wsa.basisrente.push({
      instanceId: newInstanceId('basisrente'),
      label: candidate.label,
      status: 'active',
      contractStartYear: new Date().getFullYear(),
      evidenceMap: {},
      monthlyGrossContribution: candidate.grossMonthlyEUR,
      payoutMode: 'leibrente',
      rentenfaktor: defaultAssumptions.basisrente.rentenfaktor,
      rentenfaktorConfirmed: false,
      monthlyOtherRetirementIncome: 0,
      fees: { ...defaultAssumptions.basisrente.fees },
    } as BasisrenteInstance)
  } else if (candidate.productId === 'altersvorsorgedepot') {
    wsa.altersvorsorgedepot.push({
      instanceId: newInstanceId('altersvorsorgedepot'),
      label: candidate.label,
      status: 'active',
      contractStartYear: new Date().getFullYear(),
      evidenceMap: {},
      ...defaultAssumptions.altersvorsorgedepot,
      monthlyOwnContribution: candidate.grossMonthlyEUR,
    } as AltersvorsorgedepotInstance)
  } else if (candidate.productId === 'bav') {
    const offerPatch = bavOfferPatchForSavedPlan(candidate, candidate.grossMonthlyEUR)
    wsa.bav.push({
      instanceId: newInstanceId('bav'),
      label: candidate.label,
      status: 'active',
      contractStartYear: new Date().getFullYear(),
      evidenceMap: {},
      ...defaultAssumptions.bav,
      ...offerPatch,
      monthlyGrossConversion: candidate.grossMonthlyEUR,
    } as BavInstance)
  }
}

function bavOfferPatchForSavedPlan(
  candidate: RecommendedCandidate,
  totalMonthlyGrossConversion: number,
): Partial<BavInstance> {
  const offer = candidate.bavOffer
  if (!offer) return {}
  const cappedEmployerMonthly = monthlyEmployerContributionForOffer(
    totalMonthlyGrossConversion,
    offer,
  )
  const capWouldBind =
    offer.monthlyCapEUR !== undefined &&
    totalMonthlyGrossConversion * offer.employerMatchPercent + offer.fixedMonthlyEUR > offer.monthlyCapEUR
  return {
    statutoryMinimumSubsidyEnabled: false,
    contractualMatchPercent: capWouldBind ? 0 : offer.employerMatchPercent,
    contractualFixedMonthly: capWouldBind ? cappedEmployerMonthly : offer.fixedMonthlyEUR,
    durchfuehrungsweg: offer.durchfuehrungsweg,
    payoutMode: offer.payoutMode,
    rentenfaktor: offer.rentenfaktor,
    rentenfaktorConfirmed: offer.hasOffer,
    fees: {
      ...defaultAssumptions.bav.fees,
      wrapperAssetFee: offer.effectiveCostAnnual,
      fundAssetFee: 0,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
    },
  }
}
