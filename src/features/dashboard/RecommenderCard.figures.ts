/**
 * Candidate figures shared by the recommender card and the "Plan gespeichert"
 * confirmation step (UI audit 2026-09-11, F02 / F16).
 *
 * One place turns a `RecommendedCandidate` into the numbers a user sees, so
 * the card and the confirmation cannot drift apart. Every monetary figure is
 * deflated with the plan's own `realDeflator` and labelled by scope:
 *
 *  - `wholePlanReal`: total household net income with the candidate applied.
 *    `medianNettoRente` is the exact full simulation of the saved plan (nominal
 *    at retirement), so this is the same figure the saved alternative shows.
 *  - `additionalReal`: what the extra budget buys on top of the baseline.
 *  - `extraCapitalReal`: additional net capital from the change, not the
 *    whole-plan capital.
 *  - `safetyReal`: a rough floor from a candidate-only stochastic run. It is
 *    not a Monte-Carlo percentile of the whole plan and never a guarantee.
 *
 * Pure and React-free; the rows that render these live in
 * `RecommenderCard.figureRows.tsx`.
 */

import type { GermanRules } from '../../domain'
import type { Workspace } from '../../domain/workspace'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { RecommendedCandidate } from '../../app/recommender'
import {
  durationOfInstance,
  realDeflator,
  type DurationDescriptor,
} from '../../app/planSummary'
import { listWorkspaceInstances } from '../../app/resultReadiness'
import { getProductMeta } from '../../engine/productRegistry'

export interface FiguresContext {
  workspace: Workspace
  baselineCombined: CombinedResult
  rules: GermanRules
  selectedScenarioId?: string
}

export interface ScenarioTag {
  id: string
  label: string
  annualReturn: number
}

export interface CandidateFigures {
  /** Whole-plan net income per month with the candidate, today's euros. */
  wholePlanReal: number
  /** Whole-plan net income per month without the candidate, today's euros. */
  baselineReal: number
  /** Income bought by the extra budget, today's euros per month. */
  additionalReal: number
  /** Extra net budget the user pays per month (nominal, paid today). */
  extraBudgetNet: number
  /** Extra gross contribution per month; differs from net for bAV & co. */
  extraBudgetGross: number
  /** Additional net capital at retirement from this change, today's euros. */
  extraCapitalReal: number
  /** Annuitised value, no lump sum available. */
  payoutOnly: boolean
  /** Rough floor from the candidate-only stochastic run, today's euros. */
  safetyReal: number
  safetyPaths: number
  /** User's Wunschrente in today's euros; `null` when none is set. */
  targetMonthly: number | null
  /** Remaining gap after the candidate, today's euros; negative = above target. */
  remainingGapReal: number | null
  scenario: ScenarioTag
  /** Payout duration read from the real instance / offer, when known. */
  duration: DurationDescriptor | null
  /** Registry label of the product ("Altersvorsorgedepot (ab 2027)"). */
  productLabel: string
  /** First year the product can be started, when the rules restrict it. */
  productStartYear: number | null
}

/** Pick the scenario the card is showing; falls back to 'basis', then the first. */
export function selectedScenario(workspace: Workspace, selectedScenarioId?: string): ScenarioTag {
  const scenarios = workspace.baseline.assumptions.returnScenarios
  const chosen =
    (selectedScenarioId ? scenarios.find((s) => s.id === selectedScenarioId) : undefined) ??
    scenarios.find((s) => s.id === 'basis') ??
    scenarios[0]
  return { id: chosen.id, label: chosen.label, annualReturn: chosen.annualReturn }
}

function candidateDuration(
  cand: RecommendedCandidate,
  ctx: FiguresContext,
): DurationDescriptor | null {
  const wsa = ctx.workspace.baseline.assumptions
  const profile = ctx.workspace.baseline.profile
  const existing = cand.targetInstanceId
    ? listWorkspaceInstances(wsa).find((e) => e.instance.instanceId === cand.targetInstanceId)
    : undefined
  const instance = cand.newInstance ?? existing?.instance
  if (instance) {
    return durationOfInstance(cand.productId, instance, profile.retirementAge, wsa.retirementEndAge, ctx.rules)
  }
  // A new ETF candidate carries no instance draft; the engine models ETF as a
  // drawdown on the shared horizon, which is what `durationOfInstance` returns.
  if (cand.productId === 'etf') {
    return { kind: 'drawdown-shared-horizon', endAge: wsa.retirementEndAge, sharedWith: [] }
  }
  return null
}

export function candidateFigures(cand: RecommendedCandidate, ctx: FiguresContext): CandidateFigures {
  const wsa = ctx.workspace.baseline.assumptions
  const profile = ctx.workspace.baseline.profile
  const deflator = realDeflator(wsa.inflationRate, profile.retirementAge - profile.age)
  const baselineNominal = ctx.baselineCombined.monthlyNetIncome
  const wholePlanReal = cand.medianNettoRente * deflator
  const baselineReal = baselineNominal * deflator
  const targetMonthly = (profile.desiredNetMonthlyPension ?? 0) > 0
    ? (profile.desiredNetMonthlyPension as number)
    : null
  const productStartYear =
    cand.isNewInstance && cand.productId === 'altersvorsorgedepot'
      ? ctx.rules.altersvorsorgedepot.productStartYear
      : null
  return {
    wholePlanReal,
    baselineReal,
    additionalReal: wholePlanReal - baselineReal,
    extraBudgetNet: cand.netCashOutEUR,
    extraBudgetGross: cand.grossMonthlyEUR,
    extraCapitalReal: cand.netCapitalAtRetirement * deflator,
    payoutOnly: cand.payoutOnly,
    safetyReal: cand.safetyNettoRenteP10 * deflator,
    safetyPaths: cand.riskScoreMcPaths,
    targetMonthly,
    remainingGapReal: targetMonthly === null ? null : targetMonthly - wholePlanReal,
    scenario: selectedScenario(ctx.workspace, ctx.selectedScenarioId),
    duration: candidateDuration(cand, ctx),
    productLabel: getProductMeta(cand.productId)?.label ?? cand.productId,
    productStartYear,
  }
}
