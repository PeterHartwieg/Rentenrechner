/**
 * PortfolioAllowance — cross-instance Sparerpauschbetrag allocation.
 *
 * Extracted from portfolioAdapter.ts (architecture-readability issue 06).
 *
 * This module owns the §20 Abs. 9 EStG saver-allowance sharing logic across
 * multiple ETF instances in a portfolio. The three steps are:
 *
 *   1. Demand calculation: collect each ETF instance's per-year taxable demand
 *      (Vorabpauschale accumulation-phase demand + payout-phase taxable gain,
 *      adjusted for equity partial exemption).
 *
 *   2. Apportionment: split the full annual allowance proportionally across
 *      instances by demand. When total demand is below the allowance, each
 *      instance gets exactly its demand. When total demand exceeds the
 *      allowance, instances are scaled down proportionally.
 *
 *   3. ETF re-run orchestration: re-simulate each ETF instance with its
 *      per-year allowance schedule and replace the result in `perInstance`.
 *      Only runs when ≥2 active ETF instances are present; length-1 workspaces
 *      are skipped (the shared schedule reduces to the full allowance every
 *      year — byte-identical oracle goldens).
 *
 * Re-simulation is INJECTED (`resimulateEtfInstance`, issue #380): the adapter
 * owns per-instance context assembly (narrow `EtfCalculationContext` — real
 * contribution, capital policy, evidence tagging), so this module re-runs ETF
 * instances without reconstructing singleton assumptions or funding inputs
 * itself. The only delta vs. the initial pass is the allowance schedule.
 *
 * Joint filing (workspace.baseline.partner !== undefined): the §20 Abs. 9 EStG
 * cap doubles to €2 000 (Zusammenveranlagung). The caller passes the resulting
 * `fullAllowance`.
 *
 * Projection helpers live in `portfolioProjection.ts`.
 * Funding apportionment lives in `portfolioFunding.ts`.
 * Transfer/capital policy lives in `portfolioTransfer.ts`.
 */

import type {
  GermanRules,
  PersonalProfile,
  ProductResult,
  ReturnScenario,
} from '../domain'
import type { EtfProductResult } from '../domain/results'
import type { WorkspaceAssumptionsV2 } from '../domain/workspace'
import type { EtfInstance } from '../domain/instances'
import { scenarioForInstance } from './portfolioProjection'

// ---------------------------------------------------------------------------
// Cross-instance Sparerpauschbetrag demand calculation
// ---------------------------------------------------------------------------

/**
 * Calculate per-year §20 Abs. 9 EStG allowance demand for a single ETF
 * instance from its ProductResult.
 *
 * Demand is the taxable amount the instance would consume of the saver
 * allowance at each 0-based contract year (covering both accumulation and
 * payout phases):
 *   - Accumulation phase: per-year Vorabpauschale increment × (1 − partial
 *     exemption). Vorabpauschale rows are delta-decoded from the cumulative
 *     field.
 *   - Payout phase: taxable gain from each ETF payout row × (1 − partial
 *     exemption), clamped to ≥ 0.
 *
 * Pure: no simulation side effects. Takes the already-computed result from
 * the initial ETF pass.
 */
export function calculateEtfAllowanceDemand(
  result: EtfProductResult,
  partialExemption: number,
  yearsToRetirement: number,
  totalYears: number,
): number[] {
  const yearly: number[] = new Array(totalYears).fill(0)

  // Accumulation phase demand: per-year VP = Δ cumulativeVorabpauschale.
  let prevCumVp = 0
  for (const row of result.rows) {
    const yearIdx = row.year - 1
    if (yearIdx < 0 || yearIdx >= totalYears) continue
    const vpThisYear = Math.max(0, row.cumulativeVorabpauschale - prevCumVp)
    prevCumVp = row.cumulativeVorabpauschale
    yearly[yearIdx] += vpThisYear * (1 - partialExemption)
  }

  // Payout phase demand: payout row index n maps to contract year
  // yearsToRetirement + (n - 1).
  for (const r of result.etfPayoutRows) {
    const yearIdx = yearsToRetirement + (r.year - 1)
    if (yearIdx < 0 || yearIdx >= totalYears) continue
    const taxableAfterExemption = r.taxableGain * (1 - partialExemption)
    yearly[yearIdx] += Math.max(0, taxableAfterExemption)
  }

  return yearly
}

// ---------------------------------------------------------------------------
// Cross-instance allowance apportionment
// ---------------------------------------------------------------------------

/**
 * Allocate the per-year saver allowance proportionally across ETF instances
 * by demand.
 *
 * For each year:
 *   - If total demand is 0: all instances get 0 (no taxable income → allowance
 *     unused).
 *   - If total demand ≤ fullAllowance: each instance gets exactly its demand
 *     (allowance is not the binding constraint; all are fully covered).
 *   - If total demand > fullAllowance: each instance gets
 *     fullAllowance × (demand_i / totalDemand) — proportional scaling.
 *
 * Returns a map from instanceId → per-year allowance schedule.
 */
export function apportionSparerpauschbetrag(
  demandByInstance: Map<string, number[]>,
  fullAllowance: number,
  totalYears: number,
): Map<string, number[]> {
  const allowanceByInstance = new Map<string, number[]>()
  for (const [id] of demandByInstance) {
    allowanceByInstance.set(id, new Array(totalYears).fill(0))
  }

  for (let y = 0; y < totalYears; y++) {
    let totalDemand = 0
    for (const [, dem] of demandByInstance) totalDemand += dem[y]
    if (totalDemand <= 0) continue

    if (totalDemand <= fullAllowance) {
      // Every instance gets its full demand; allowance not exhausted.
      for (const [id, dem] of demandByInstance) {
        allowanceByInstance.get(id)![y] = dem[y]
      }
    } else {
      // Allowance is the binding constraint — scale proportionally.
      for (const [id, dem] of demandByInstance) {
        allowanceByInstance.get(id)![y] = fullAllowance * (dem[y] / totalDemand)
      }
    }
  }

  return allowanceByInstance
}

// ---------------------------------------------------------------------------
// ETF re-run orchestration
// ---------------------------------------------------------------------------

/**
 * Re-run one ETF instance for one scenario under a shared per-year allowance.
 * Injected by `simulatePortfolio` so the re-run converges on the adapter's
 * narrow per-instance ETF context assembly (see `buildEtfInstanceContext`
 * there). Must return the result already tagged with `instanceId` and
 * `inputConfidence`.
 */
export type ResimulateEtfInstanceFn = (
  inst: EtfInstance,
  scenario: ReturnScenario,
  saverAllowanceOverride: (yearIndex: number) => number,
) => ProductResult

export interface CrossInstanceAllowanceParams {
  /** Workspace product assumptions (return scenarios + per-instance ETF slots). */
  wsa: WorkspaceAssumptionsV2
  /** Per-instance results map — mutated in place. */
  perInstance: Record<string, ProductResult[]>
  rules: GermanRules
  profile: PersonalProfile
  /**
   * Household §20 Abs. 9 EStG cap for one calendar year — already doubled for
   * Zusammenveranlagung by the caller.
   */
  fullAllowance: number
  /** Injected re-run path (see `ResimulateEtfInstanceFn`). */
  resimulateEtfInstance: ResimulateEtfInstanceFn
}

/**
 * Re-run active ETF instances with a shared per-year §20 Abs. 9 EStG allowance.
 *
 * Mutates `perInstance` in place so the returned `simulatePortfolio` map carries
 * the corrected ETF results. Idempotent for length-1 ETF workspaces (the
 * shared schedule reduces to the full allowance every year — byte-identical
 * oracle goldens).
 *
 * Only runs when ≥2 active (non-surrendered, non-offered) ETF instances are
 * present. Length-1 workspaces skip the re-run entirely.
 *
 * Per scenario:
 *   1. Collect per-instance per-year demand from the initial pass.
 *   2. Apportion the allowance proportionally across instances.
 *   3. Re-run each ETF instance with its per-year schedule.
 */
export function applyCrossInstanceSparerpauschbetrag(
  params: CrossInstanceAllowanceParams,
): void {
  const { wsa, perInstance, rules, profile, fullAllowance, resimulateEtfInstance } = params
  const activeEtf = wsa.etf.filter((e) => e.status !== 'surrendered' && e.status !== 'offered')
  if (activeEtf.length < 2) return

  const yearsToRetirement = profile.retirementAge - profile.age
  const retirementYears = wsa.retirementEndAge - profile.retirementAge
  const totalYears = Math.max(0, yearsToRetirement + retirementYears)

  for (const scenario of wsa.returnScenarios) {
    // Step 1: collect per-instance per-year demand from the initial pass.
    const demandByInstance = new Map<string, number[]>()

    for (const inst of activeEtf) {
      const results = perInstance[inst.instanceId]
      if (!results) continue
      const result = results.find((r) => r.scenarioId === scenario.id)
      if (!result || result.productId !== 'etf') continue
      const etfResult = result as EtfProductResult
      const partialExemption = wsa.etf.find((e) => e.instanceId === inst.instanceId)?.equityPartialExemption
        ?? 0.3
      demandByInstance.set(
        inst.instanceId,
        calculateEtfAllowanceDemand(etfResult, partialExemption, yearsToRetirement, totalYears),
      )
    }

    if (demandByInstance.size === 0) continue

    // Step 2: apportion the allowance proportionally.
    const allowanceByInstance = apportionSparerpauschbetrag(demandByInstance, fullAllowance, totalYears)

    // Step 3: re-run each ETF instance with its per-year allowance schedule.
    for (const inst of activeEtf) {
      const schedule = allowanceByInstance.get(inst.instanceId)
      if (!schedule) continue
      const tagged = resimulateEtfInstance(inst, scenarioForInstance(scenario, inst), (yearIdx: number) =>
        schedule[yearIdx] ?? rules.capitalGains.saverAllowance,
      )

      const arr = perInstance[inst.instanceId]
      if (!arr) continue
      const idx = arr.findIndex((r) => r.scenarioId === scenario.id)
      if (idx >= 0) arr[idx] = tagged
    }
  }
}
