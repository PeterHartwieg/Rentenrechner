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
 * Joint filing (workspace.baseline.partner !== undefined): the §20 Abs. 9 EStG
 * cap doubles to €2 000 (Zusammenveranlagung).
 *
 * Projection helpers live in `portfolioProjection.ts`.
 * Funding apportionment lives in `portfolioFunding.ts`.
 * Transfer/capital policy lives in `portfolioTransfer.ts`.
 */

import type {
  GermanRules,
  PersonalProfile,
  ProductResult,
} from '../domain'
import type { EtfProductResult } from '../domain/results'
import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type { TransferEvent } from '../domain/instances'
import { buildContext, type BuildContextOverrides, type InstanceCapitalPolicy } from './simulationContext'
import { simulate as simulateEtf } from './products/etf'
import { confidenceForResult } from '../app/evidence'
import {
  detectProductSlot,
  slotToProductId,
  applyPaidUpOverridesToProjection,
  projectInstanceToScenarioAssumptions,
  type AnyInstance,
} from './portfolioProjection'

/** Function type matching `buildInstanceCapitalPolicy` in portfolioAdapter.ts. */
type InstanceCapitalPolicyFn = (
  instance: AnyInstance,
  workspace: Workspace,
  rules: GermanRules,
  outbound: TransferEvent[],
  inbound: TransferEvent[],
) => InstanceCapitalPolicy | undefined

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
 *   3. Re-simulate each ETF instance with its per-year schedule.
 */
export function applyCrossInstanceSparerpauschbetrag(
  wsa: WorkspaceAssumptionsV2,
  perInstance: Record<string, ProductResult[]>,
  profile: PersonalProfile,
  rules: GermanRules,
  outboundBy: Map<string, TransferEvent[]>,
  inboundBy: Map<string, TransferEvent[]>,
  workspace: Workspace,
  buildCapitalPolicy: InstanceCapitalPolicyFn,
): void {
  const activeEtf = wsa.etf.filter((e) => e.status !== 'surrendered' && e.status !== 'offered')
  if (activeEtf.length < 2) return

  const married = workspace.baseline.partner !== undefined
  const fullAllowance = rules.capitalGains.saverAllowance * (married ? 2 : 1)
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
      const projectedRaw = projectInstanceToScenarioAssumptions(inst, wsa)
      const projected = inst.status === 'paid_up'
        ? applyPaidUpOverridesToProjection(projectedRaw, detectProductSlot(inst))
        : projectedRaw
      const outbound = outboundBy.get(inst.instanceId) ?? []
      const inbound = inboundBy.get(inst.instanceId) ?? []
      const instanceCapitalPolicy = buildCapitalPolicy(inst, workspace, rules, outbound, inbound)
      const overrides: BuildContextOverrides = {
        etfMonthlyUserCostOverride: inst.status === 'paid_up' ? 0 : inst.monthlyContribution,
        etfSaverAllowanceOverride: (yearIdx: number) =>
          schedule[yearIdx] ?? rules.capitalGains.saverAllowance,
        ...(instanceCapitalPolicy ? { instanceCapitalPolicy } : {}),
      }
      const ctx = buildContext(profile, projected, rules, overrides)
      const slotName = detectProductSlot(inst)
      const inputConfidence = confidenceForResult(
        { productId: slotToProductId(slotName) },
        inst.evidenceMap ?? {},
      )
      const targetScenarioResult = simulateEtf(ctx, scenario)
      const tagged = { ...targetScenarioResult, instanceId: inst.instanceId, inputConfidence }

      const arr = perInstance[inst.instanceId]
      if (!arr) continue
      const idx = arr.findIndex((r) => r.scenarioId === scenario.id)
      if (idx >= 0) arr[idx] = tagged
    }
  }
}
