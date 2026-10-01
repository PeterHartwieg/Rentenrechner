/**
 * PortfolioAdapter — thin orchestration layer for combine-mode simulation.
 *
 * Iterates over per-product instance arrays and drives per-instance simulation
 * without modifying per-product simulators or the registry. The legacy engine
 * `ScenarioAssumptions` stays singleton-shaped; per-instance projection adapts
 * each instance into that shape before simulation, then tags the result with
 * `instanceId`.
 *
 * Focused sub-modules handle the heavy lifting:
 *  - `portfolioProjection.ts` — neutralised defaults, slot detection, key
 *    stripping, paid-up overrides, `projectInstanceToScenarioAssumptions`,
 *    and `singletonViewOfWorkspace`.
 *  - `portfolioFunding.ts` — paid-up funding helpers, cross-instance bAV /
 *    Basisrente / AVD / Riester cap aggregation, `buildPortfolioFunding`.
 *  - `portfolioTransfer.ts` — transfer event collection, calendar-year to
 *    contract-year conversion, surrender-tax computation,
 *    `buildInstanceCapitalPolicy`.
 *  - `portfolioAllowance.ts` — §20 Abs. 9 EStG demand calculation, per-year
 *    apportionment, ETF re-run orchestration.
 *
 * Per-instance retirement-tax + KV/PV aggregation lives in
 * `portfolioCombine.ts`, which consumes the `perInstance` map produced here.
 */

import type {
  GermanRules,
  ProductResult,
  ReturnScenario,
} from '../domain'
import type { PortfolioFunding, Workspace } from '../domain/workspace'
import type { EtfInstance } from '../domain/instances'
import {
  buildContext,
  buildEtfCalculationContext,
  type BuildContextOverrides,
  type EtfCalculationContext,
} from './simulationContext'
import {
  buildInstanceCapitalPolicy,
  collectTransferEvents,
} from './portfolioTransfer'
import { simulate as simulateBav } from './products/bav'
import { simulateEtf } from './products/etf'
import { simulate as simulateInsurance } from './products/insurance'
import { simulate as simulateBasisrente } from './products/basisrente'
import { simulate as simulateAvd } from './products/altersvorsorgedepot'
import { simulate as simulateRiester } from './products/riester'
import { confidenceForResult } from '../utils/evidence'
import {
  NEUTRALISED_BAV,
  NEUTRALISED_ETF,
  NEUTRALISED_INSURANCE,
  NEUTRALISED_BASISRENTE,
  NEUTRALISED_ALTERSVORSORGEDEPOT,
  NEUTRALISED_RIESTER,
  detectProductSlot,
  slotToProductId,
  applyPaidUpOverridesToProjection,
  projectEtfInstanceToAssumptions,
  projectInstanceToScenarioAssumptions,
  singletonViewOfWorkspace,
  scenarioForInstance,
  type AnyInstance,
} from './portfolioProjection'
import { buildPortfolioFunding } from './portfolioFunding'
import { applyCrossInstanceSparerpauschbetrag } from './portfolioAllowance'

// Re-export the public API that callers currently import from this module.
export {
  NEUTRALISED_BAV,
  NEUTRALISED_ETF,
  NEUTRALISED_INSURANCE,
  NEUTRALISED_BASISRENTE,
  NEUTRALISED_ALTERSVORSORGEDEPOT,
  NEUTRALISED_RIESTER,
  projectInstanceToScenarioAssumptions,
  singletonViewOfWorkspace,
  buildPortfolioFunding,
  type AnyInstance,
}

// Transfer event collection, surrender-tax computation, and instance
// capital-policy construction live in `portfolioTransfer.ts`.
// Re-exported here for back-compat with callers that imported from this module.
export { buildInstanceCapitalPolicy } from './portfolioTransfer'

// ---------------------------------------------------------------------------
// `simulatePortfolio`
// ---------------------------------------------------------------------------

/**
 * Run the full per-instance portfolio simulation for a v2 workspace.
 *
 * For each active instance:
 *  1. Look up its portfolio-funding share.
 *  2. Project to a singleton-shaped `ScenarioAssumptions` via
 *     `projectInstanceToScenarioAssumptions`.
 *  3. Build a per-call `SimulationContext` with the funding share via
 *     `BuildContextOverrides` (additive — see `simulationContext.ts`).
 *  4. Call the relevant per-product simulator DIRECTLY (NOT the registry loop).
 *  5. Tag the resulting `ProductResult` with `instanceId`.
 *
 * Surrendered instances are skipped entirely.
 *
 * Returns:
 *   - `perInstance`: keyed by instance id, value is the array of
 *     `ProductResult` entries (one per `returnScenario`) for that instance.
 *   - `portfolioFunding`: the cross-instance funding aggregates (consumed by
 *     the dashboard view-model).
 */
export function simulatePortfolio(
  workspace: Workspace,
  rules: GermanRules,
): {
  perInstance: Record<string, ProductResult[]>
  portfolioFunding: PortfolioFunding
} {
  const profile = workspace.baseline.profile
  const wsa = workspace.baseline.assumptions
  const portfolioFunding = buildPortfolioFunding(workspace, rules)
  const perInstance: Record<string, ProductResult[]> = {}
  const firstActiveBav = wsa.bav.find(b => b.status !== 'surrendered' && b.status !== 'paid_up')
  const bavFundingAnchor = firstActiveBav
    ? portfolioFunding.bavByInstanceId[firstActiveBav.instanceId]
    : undefined
  const withBavFundingAnchor = (overrides: BuildContextOverrides): BuildContextOverrides =>
    ({
      ...(bavFundingAnchor ? { bavFundingOverride: bavFundingAnchor } : {}),
      salaryForOtherFundingOverride: portfolioFunding.salaryForOtherFunding,
      ...overrides,
    })

  // Collect all transfer events once so per-instance lookup is O(1).
  const { outboundBy, inboundBy } = collectTransferEvents(wsa)

  const runFor = <T extends AnyInstance>(
    instances: readonly T[],
    productSimulate: (ctx: ReturnType<typeof buildContext>, scenario: ReturnScenario) => ProductResult,
    fundingOverrideFor: (instance: T) => BuildContextOverrides,
  ) => {
    for (const inst of instances) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      const projectedRaw = projectInstanceToScenarioAssumptions(inst, wsa)
      // Paid-up: switch the active product slot to phase-2 fees (no acquisition /
      // contribution / fixed-admin fees; wrapper / fund / pension-payout fees
      // continue). ETF has no `fees` field; the simulator ignores paid-up status
      // (no contributions are honored anyway; the user just stops contributing).
      const projected = inst.status === 'paid_up'
        ? applyPaidUpOverridesToProjection(projectedRaw, detectProductSlot(inst))
        : projectedRaw
      const baseOverrides = fundingOverrideFor(inst)
      const outbound = outboundBy.get(inst.instanceId) ?? []
      const inbound = inboundBy.get(inst.instanceId) ?? []
      const instanceCapitalPolicy = buildInstanceCapitalPolicy(inst, workspace, rules, outbound, inbound)
      const overrides: BuildContextOverrides = instanceCapitalPolicy
        ? { ...baseOverrides, instanceCapitalPolicy }
        : baseOverrides
      const ctx = buildContext(profile, projected, rules, overrides)
      const results: ProductResult[] = []
      // Map the slot name to the ProductId used in evidenceMap keying.
      const slotName = detectProductSlot(inst)
      const inputConfidence = confidenceForResult(
        { productId: slotToProductId(slotName) },
        inst.evidenceMap ?? {},
      )
      for (const scenario of projected.returnScenarios) {
        const r = productSimulate(ctx, scenarioForInstance(scenario, inst))
        // Tag with instanceId after the simulator returns so the simulator code
        // stays untouched. Attach inputConfidence from the instance's evidenceMap.
        results.push({ ...r, instanceId: inst.instanceId, inputConfidence })
      }
      perInstance[inst.instanceId] = results
    }
  }

  // ---------------------------------------------------------------------------
  // ETF instances — narrow per-instance path (issue #380)
  //
  // ETF is the first product simulated WITHOUT the six-product singleton
  // reconstruction: the per-instance context carries only the fields the ETF
  // math reads (profile, rules, ETF assumption slice, payout horizon, explicit
  // monthly cost, capital policy, optional shared allowance). No
  // `projectInstanceToScenarioAssumptions`, no `buildContext` funding
  // pre-pass, therefore no neutralised bAV / Basisrente / AVD / Riester
  // inputs. Numbers are pinned against the pre-change engine freeze by
  // `etfContextParity.test.ts` (full precision, last-digit drift only).
  // ---------------------------------------------------------------------------
  const buildEtfInstanceContext = (
    inst: EtfInstance,
    saverAllowanceOverride?: (yearIndex: number) => number,
  ): EtfCalculationContext => {
    const outbound = outboundBy.get(inst.instanceId) ?? []
    const inbound = inboundBy.get(inst.instanceId) ?? []
    return buildEtfCalculationContext({
      profile,
      rules,
      assumptions: {
        etf: projectEtfInstanceToAssumptions(inst),
        inflationRate: wsa.inflationRate,
        retirementEndAge: wsa.retirementEndAge,
      },
      // Paid-up stops contributions. An instance without `monthlyContribution`
      // gets 0 — byte-identical to the previous path, where the override stayed
      // undefined and the ETF fell back to `bavFunding.monthlyNetCost` of the
      // neutralised bAV projection, which is 0.
      monthlyUserCost: inst.status === 'paid_up' ? 0 : inst.monthlyContribution ?? 0,
      instanceCapitalPolicy: buildInstanceCapitalPolicy(inst, workspace, rules, outbound, inbound),
      saverAllowanceOverride,
    })
  }
  const simulateEtfInstance = (
    inst: EtfInstance,
    scenario: ReturnScenario,
    saverAllowanceOverride?: (yearIndex: number) => number,
  ): ProductResult => {
    const ctx = buildEtfInstanceContext(inst, saverAllowanceOverride)
    const inputConfidence = confidenceForResult(
      { productId: slotToProductId(detectProductSlot(inst)) },
      inst.evidenceMap ?? {},
    )
    return { ...simulateEtf(ctx, scenarioForInstance(scenario, inst)), instanceId: inst.instanceId, inputConfidence }
  }

  runFor(wsa.bav, simulateBav, (inst) => ({
    bavFundingOverride: portfolioFunding.bavByInstanceId[inst.instanceId],
  }))
  for (const inst of wsa.etf) {
    if (inst.status === 'surrendered' || inst.status === 'offered') continue
    // Initial pass uses the full per-instance Sparerpauschbetrag.
    // `applyCrossInstanceSparerpauschbetrag` below re-runs when ≥2 ETF instances
    // are present so they share the §20 Abs. 9 EStG allowance per year.
    perInstance[inst.instanceId] = wsa.returnScenarios.map((scenario) =>
      simulateEtfInstance(inst, scenario),
    )
  }
  // Combine-mode honors per-instance insurance `monthlyContribution` via the
  // override. Compare-mode falls back to `bavFunding.monthlyNetCost` — see
  // insurance simulator and CLAUDE.md.
  runFor(wsa.insurance, simulateInsurance, (inst) => ({
    insuranceMonthlyUserCostOverride: inst.status === 'paid_up' ? 0 : inst.monthlyContribution,
  }))
  runFor(wsa.basisrente, simulateBasisrente, (inst) => withBavFundingAnchor({
    basisrenteFundingOverride: portfolioFunding.basisrenteByInstanceId[inst.instanceId],
  }))
  runFor(wsa.altersvorsorgedepot, simulateAvd, (inst) => withBavFundingAnchor({
    altersvorsorgedepotFundingOverride: portfolioFunding.altersvorsorgedepotByInstanceId[inst.instanceId],
    altersvorsorgedepotFundingScheduleOverride:
      portfolioFunding.altersvorsorgedepotYearlyByInstanceId[inst.instanceId],
  }))
  runFor(wsa.riester, simulateRiester, (inst) => withBavFundingAnchor({
    riesterFundingOverride: portfolioFunding.riesterByInstanceId[inst.instanceId],
    riesterFundingScheduleOverride:
      portfolioFunding.riesterYearlyByInstanceId[inst.instanceId],
  }))

  // §20 Abs. 9 EStG grants ONE saver allowance per taxpayer per year (€1 000
  // single / €2 000 joint), not one per account. Re-run ETF instances with a
  // shared per-year schedule when ≥2 are active. Length-1 workspaces skip the
  // re-run (schedule reduces to the full allowance — byte-identical results).
  // The re-run reuses `simulateEtfInstance`, so it goes through the exact same
  // narrow per-instance context assembly as the initial pass — the allowance
  // schedule is the only delta.
  const married = workspace.baseline.partner !== undefined
  applyCrossInstanceSparerpauschbetrag({
    wsa,
    perInstance,
    rules,
    profile,
    fullAllowance: rules.capitalGains.saverAllowance * (married ? 2 : 1),
    resimulateEtfInstance: simulateEtfInstance,
  })

  return { perInstance, portfolioFunding }
}

// Cross-instance Sparerpauschbetrag re-run lives in portfolioAllowance.ts.
