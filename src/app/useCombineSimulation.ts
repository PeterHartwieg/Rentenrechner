/**
 * Combine-mode simulation hook (Group G issue 08, milestone M2.6).
 *
 * Drives the combine-mode dashboard: runs `simulatePortfolio` over a
 * v2 `Workspace`, then folds the per-instance ProductResults through
 * `combinePortfolio` to produce a single combined retirement income (per
 * scenario).
 *
 * Coexists with `useSimulationResult` (compare-mode singleton API). Combine
 * mode wires up here; compare mode keeps today's path. The `mode` tag on the
 * workspace tells the orchestration layer which hook to call.
 *
 * Contract:
 *   - One `simulatePortfolio` run per workspace+rules change.
 *   - `combinePortfolio` is invoked PER scenario; results indexed by scenarioId.
 *   - Pure: no DOM access; safe to call from any React tree (the only
 *     dependency is `useMemo`).
 */

import { useMemo } from 'react'
import type { GermanRules } from '../domain'
import type { Workspace } from '../domain/workspace'
import { simulatePortfolio } from '../engine/portfolioAdapter'
import {
  combinePortfolio,
  type CombineContext,
  type CombinedResult,
} from '../engine/portfolioCombine'
import { projectStatutoryPension } from '../engine/grv'
import { de2026Rules } from '../rules/de2026'

export interface CombineSimulationBundle {
  /** Per-instance ProductResults (one entry per active instance, all scenarios). */
  perInstance: Record<string, ReturnType<typeof simulatePortfolio>['perInstance'][string]>
  /** Cross-instance funding aggregates (bAV cap apportionment, notes). */
  portfolioFunding: ReturnType<typeof simulatePortfolio>['portfolioFunding']
  /** Combined retirement income, keyed by scenarioId. */
  combinedByScenarioId: Record<string, CombinedResult>
  /** GRV / VW / Beamten projection result (statutory baseline). */
  statutoryPension: ReturnType<typeof projectStatutoryPension>
}

/**
 * Pure factory that produces the same bundle the hook returns. Exposed so
 * tests can exercise the orchestration without pulling in
 * `@testing-library/react` (consistent with `portfolioState.test.ts`).
 */
export function runCombineSimulation(
  workspace: Workspace,
  rules: GermanRules,
): CombineSimulationBundle {
  const profile = workspace.baseline.profile
  const wsa = workspace.baseline.assumptions

  // 1. Per-instance simulation (returns flat ProductResult[] keyed by id).
  const { perInstance, portfolioFunding } = simulatePortfolio(workspace, rules)

  // 2. Statutory baseline — runs separately because GRV is not an instance.
  //    Mirrors `buildContext`'s logic so combine-mode and compare-mode see
  //    the same baseline routing for the active profile.
  const retirementYear = rules.year + (profile.retirementAge - profile.age)

  // The bAV grvReduction is a property of EACH bAV instance (different per
  // instance based on conversion amount). For the statutory baseline we use
  // the FIRST active bAV instance's funding to mirror the singleton path.
  // Multi-bAV callers needing a per-instance reduction should re-derive at
  // the dashboard layer.
  const firstBavInstanceId = wsa.bav.find((b) => b.status !== 'surrendered')?.instanceId
  const firstBavFunding = firstBavInstanceId
    ? portfolioFunding.bavByInstanceId[firstBavInstanceId]
    : undefined
  const grvReductionMonthly = firstBavFunding?.estimatedMonthlyGrvReduction ?? 0

  const statutoryPension = projectStatutoryPension(
    profile,
    rules,
    wsa.statutoryPension,
    grvReductionMonthly,
    retirementYear,
  )

  // 3. Determine statutory routing for combine.
  const pensionType = wsa.statutoryPension.pensionBaselineType ?? 'grv'
  const statutoryGrossMonthly = statutoryPension.grossMonthlyPension
  let statutoryPensionTaxChannel: CombineContext['statutoryPensionTaxChannel']
  let statutoryPensionKvChannel: CombineContext['statutoryPensionKvChannel']
  if (pensionType === 'none' || statutoryGrossMonthly <= 0) {
    statutoryPensionTaxChannel = 'none'
    statutoryPensionKvChannel = 'none'
  } else if (pensionType === 'beamtenpension') {
    statutoryPensionTaxChannel = 'beamten_versorgungsbezug'
    statutoryPensionKvChannel = profile.publicHealthInsurance
      ? 'versorgungsbezug_full_rate'
      : 'none'
  } else if (pensionType === 'versorgungswerk') {
    statutoryPensionTaxChannel = 'statutory_pension'
    // VW: §229 Abs. 1 Nr. 3 SGB V Versorgungsbezug for KV — full rate.
    statutoryPensionKvChannel = profile.publicHealthInsurance
      ? 'versorgungsbezug_full_rate'
      : 'none'
  } else {
    // 'grv': default. Half-rate via §249a SGB V for KVdR.
    statutoryPensionTaxChannel = 'statutory_pension'
    statutoryPensionKvChannel = profile.publicHealthInsurance ? 'kvdr_half_rate' : 'none'
  }

  // KVdR / freiwillig flag — drives the combine KV/PV cascade.
  const kvdrMember = wsa.bav[0]?.kvdrMember ?? true
  const retirementHealthStatus: CombineContext['retirementHealthStatus'] =
    !profile.publicHealthInsurance ? 'pkv' : kvdrMember ? 'kvdr' : 'freiwillig_gkv'

  const ctx: CombineContext = {
    profile,
    rules,
    retirementYear,
    grvGrossMonthlyPension: statutoryGrossMonthly,
    statutoryPensionTaxChannel,
    statutoryPensionKvChannel,
    retirementHealthStatus,
  }

  // 4. Combine per scenario.
  const combinedByScenarioId: Record<string, CombinedResult> = {}
  for (const scenario of wsa.returnScenarios) {
    const scenarioResults = Object.values(perInstance)
      .map((arr) => arr.find((r) => r.scenarioId === scenario.id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
    combinedByScenarioId[scenario.id] = combinePortfolio(workspace, scenarioResults, ctx)
  }

  return {
    perInstance,
    portfolioFunding,
    combinedByScenarioId,
    statutoryPension,
  }
}

/**
 * Run the portfolio adapter and combine pipeline for a v2 Workspace.
 *
 * `rules` is configurable for tests; production callers should pass
 * `de2026Rules`. The default is wired so non-test callers can omit it.
 */
export function useCombineSimulation(
  workspace: Workspace,
  rules: GermanRules = de2026Rules,
): CombineSimulationBundle {
  return useMemo(() => runCombineSimulation(workspace, rules), [workspace, rules])
}
