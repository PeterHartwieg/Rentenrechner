/**
 * PortfolioAdapter (Group G issue 03 — milestone M1.3 + M1.4).
 *
 * Orchestration layer that lets combine-mode iterate over per-product instance
 * arrays without modifying per-product simulators or the registry.
 *
 * Design (Plan §1 A1, A2, A2a):
 *  - The legacy engine `ScenarioAssumptions` (`src/domain/results.ts`) stays
 *    singleton-shaped. Per-product simulators (`src/engine/products/*.ts`)
 *    stay untouched.
 *  - For each per-product instance, this adapter projects the instance into a
 *    singleton-shaped `ScenarioAssumptions`, runs a workspace-level funding
 *    pre-step (cross-instance bAV / Basisrente / Riester cap aggregation),
 *    builds a per-call `SimulationContext` with the instance's funding share
 *    via `BuildContextOverrides`, and calls the relevant per-product simulator
 *    DIRECTLY (NOT `simulateRetirementComparison`, which would loop the entire
 *    `PRODUCT_REGISTRY` × `returnScenarios` for every instance).
 *  - `ProductResult` entries get tagged with `instanceId` after the simulator
 *    returns (Decision B). Existing oracle-golden snapshots stay byte-identical
 *    because the projection of a length-1 array reproduces the legacy singleton
 *    1:1.
 *
 * What this module is NOT:
 *  - It does not aggregate per-instance retirement-tax + KV/PV (issue 08
 *    `portfolioCombine`).
 *  - It does not handle `transferEvents` engine support (issue 15).
 *  - It does not implement compare-mode equal-input sub-mode (issue 16).
 *
 * Projection helpers (neutralised defaults, slot detection, key stripping,
 * paid-up overrides, projectInstanceToScenarioAssumptions, singletonViewOfWorkspace)
 * live in `portfolioProjection.ts` (architecture-readability issue 03).
 *
 * Funding apportionment (paid-up funding helpers, cross-instance bAV /
 * Basisrente / AVD / Riester cap aggregation, buildPortfolioFunding) lives in
 * `portfolioFunding.ts` (architecture-readability issue 05).
 *
 * Sparerpauschbetrag allocation (demand calculation, per-year apportionment,
 * ETF re-run orchestration) lives in `portfolioAllowance.ts` (architecture-
 * readability issue 06).
 */

import type {
  GermanRules,
  ProductResult,
  ReturnScenario,
} from '../domain'
import type { PortfolioFunding, Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type {
  BavInstance,
  InsuranceInstance,
  TransferEvent,
} from '../domain/instances'
import { buildContext, type BuildContextOverrides } from './simulationContext'
import {
  buildInstanceCapitalPolicy,
  collectTransferEvents,
} from './portfolioTransfer'
import { simulate as simulateBav } from './products/bav'
import { simulate as simulateEtf } from './products/etf'
import { simulate as simulateInsurance } from './products/insurance'
import { simulate as simulateBasisrente } from './products/basisrente'
import { simulate as simulateAvd } from './products/altersvorsorgedepot'
import { simulate as simulateRiester } from './products/riester'
import { confidenceForResult } from '../app/evidence'
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
  projectInstanceToScenarioAssumptions,
  singletonViewOfWorkspace,
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

// ---------------------------------------------------------------------------
// Issue 15 — TransferEvents → instanceCapitalPolicy
// ---------------------------------------------------------------------------
//
// Transfer event collection, surrender-tax computation, and instance
// capital-policy construction live in `portfolioTransfer.ts` (issue 04).
// They are imported at the top of this file and used in `simulatePortfolio`
// below. The public `buildInstanceCapitalPolicy` entry point is re-exported
// from this module for back-compat with callers that imported it here before
// the split.
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
    bavFundingAnchor
      ? { bavFundingOverride: bavFundingAnchor, ...overrides }
      : overrides

  // Issue 15 — collect all transfer events once so per-instance lookup is O(1).
  const { outboundBy, inboundBy } = collectTransferEvents(wsa)

  const runFor = <T extends AnyInstance>(
    instances: readonly T[],
    productSimulate: (ctx: ReturnType<typeof buildContext>, scenario: ReturnScenario) => ProductResult,
    fundingOverrideFor: (instance: T) => BuildContextOverrides,
  ) => {
    for (const inst of instances) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      const projectedRaw = projectInstanceToScenarioAssumptions(inst, wsa)
      // Phase G M4 F1 — paid-up: switch the active product slot to phase-2 fees
      // (no acquisition / contribution / fixed-admin fees; wrapper / fund /
      // pension-payout fees continue). ETF has no `fees` field; the simulator
      // ignores paid-up status (no contributions are honored anyway and ETF
      // paid_up is conceptually a no-op — the user just stops contributing).
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
        const r = productSimulate(ctx, scenario)
        // Decision B — tag with instanceId after the simulator returns so the
        // simulator code stays untouched. Also attach inputConfidence derived
        // from the instance's evidenceMap (issue 09).
        results.push({ ...r, instanceId: inst.instanceId, inputConfidence })
      }
      perInstance[inst.instanceId] = results
    }
  }

  runFor(wsa.bav, simulateBav, (inst) => ({
    bavFundingOverride: portfolioFunding.bavByInstanceId[inst.instanceId],
  }))
  // Combine-mode honors per-instance ETF `monthlyContribution` via the override
  // (issue 12). Compare-mode (`simulateRetirementComparison`) never sets this
  // and falls back to `bavFunding.monthlyNetCost` — see ETF simulator + CLAUDE.md.
  //
  // Initial pass uses the full per-instance Sparerpauschbetrag. Phase G M4 F3
  // re-runs the active ETF instances cooperatively below when ≥2 are present so
  // they share the §20 Abs. 9 EStG allowance per year.
  runFor(wsa.etf, simulateEtf, (inst) => ({
    etfMonthlyUserCostOverride: inst.status === 'paid_up' ? 0 : inst.monthlyContribution,
  }))
  // Combine-mode honors per-instance insurance `monthlyContribution` via the override
  // (issue F2). Compare-mode (`simulateRetirementComparison`) never sets this
  // and falls back to `bavFunding.monthlyNetCost` — see insurance simulator + CLAUDE.md.
  runFor(wsa.insurance, simulateInsurance, (inst) => ({
    insuranceMonthlyUserCostOverride: inst.status === 'paid_up' ? 0 : inst.monthlyContribution,
  }))
  runFor(wsa.basisrente, simulateBasisrente, (inst) => withBavFundingAnchor({
    basisrenteFundingOverride: portfolioFunding.basisrenteByInstanceId[inst.instanceId],
  }))
  runFor(wsa.altersvorsorgedepot, simulateAvd, (inst) => withBavFundingAnchor({
    altersvorsorgedepotFundingOverride: portfolioFunding.altersvorsorgedepotByInstanceId[inst.instanceId],
  }))
  runFor(wsa.riester, simulateRiester, (inst) => withBavFundingAnchor({
    riesterFundingOverride: portfolioFunding.riesterByInstanceId[inst.instanceId],
  }))

  // Phase G M4 F3 — cross-instance Sparerpauschbetrag.
  //
  // §20 Abs. 9 EStG grants ONE saver allowance per taxpayer per year (€1 000
  // single / €2 000 joint), not one per account. The initial ETF pass above
  // ran each instance with the full allowance; with ≥2 active ETF instances
  // that over-credits the allowance. We re-run the ETF instances with a
  // shared per-year schedule that allocates the allowance proportionally to
  // each instance's per-year demand from the initial pass.
  //
  // Compare-mode (`simulateRetirementComparison`) never reaches here; length-1
  // workspaces skip the re-run because the cooperative schedule equals the
  // full allowance every year (byte-identical oracle goldens).
  applyCrossInstanceSparerpauschbetrag(wsa, perInstance, profile, rules, outboundBy, inboundBy, workspace, buildInstanceCapitalPolicy)

  return { perInstance, portfolioFunding }
}

// Cross-instance Sparerpauschbetrag re-run lives in portfolioAllowance.ts
// (architecture-readability issue 06).
