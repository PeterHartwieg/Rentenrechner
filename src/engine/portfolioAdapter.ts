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
  PersonalProfile,
  ProductResult,
  ReturnScenario,
} from '../domain'
import type { PortfolioFunding, Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type {
  BavInstance,
  InsuranceInstance,
  TransferEvent,
} from '../domain/instances'
import { buildContext, type BuildContextOverrides, type InstanceCapitalPolicy } from './simulationContext'
import { afterTaxInsuranceLumpSum, deriveInsuranceTaxMode } from './insurancePayout'
import { afterTaxBavLumpSum, deriveBavLumpSumTaxMode } from './bavPayout'
import { afterTaxRiesterLumpSum } from './riester'
import { afterTaxAvdLumpSum } from './altersvorsorgedepot'
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

/**
 * Convert a calendar-year `TransferEvent.year` into the 1-based contract year
 * used by `AccumulationPolicy.capitalInjections / capitalWithdrawals`.
 *
 * Contract year 1 = `rules.year` (today). An event scheduled for `rules.year`
 * applies at the start of the first projection year (functionally additive to
 * `initialCapital`); an event scheduled for `rules.year + 5` applies at the
 * start of contract year 6.
 *
 * Years before `rules.year` clamp to year 1; years after the projection horizon
 * are returned as-is (the accumulation loop simply will not encounter that year
 * and the entry has no effect — no error needed).
 */
function eventCalendarYearToContractYear(eventYear: number, rulesYear: number): number {
  return Math.max(1, eventYear - rulesYear + 1)
}

/**
 * Walk every instance in the workspace and collect transfer events that target
 * `targetInstanceId` (inbound) or originate from `sourceInstanceId` (outbound).
 *
 * The discriminated union is preserved so the caller can branch on type when
 * computing surrender tax (only relevant for `surrender_reinvest`).
 *
 * Routing convention: events are dual-stored under both source and target
 * instances (see `applyContractDecision` in `src/app/contractDecisions.ts` —
 * the source carries the "capital left" record and the target carries the
 * "capital received" record). To avoid double-counting we route by
 * **which instance the event was found in**, not by event metadata:
 *   - found in source's array  → push only to outbound bucket.
 *   - found in target's array  → push only to inbound bucket.
 *   - neither (legacy/malformed) → warn and skip.
 *
 * Dual-storage invariant: `backfillWorkspaceTransferEvents` in `storage.ts`
 * ensures every event is present on both sides at load time, so single-sided
 * legacy data is repaired before reaching this function. A malformed event
 * (instanceId matches neither source nor target) is warned and skipped.
 */
function collectTransferEvents(
  wsa: WorkspaceAssumptionsV2,
): {
  outboundBy: Map<string, TransferEvent[]>
  inboundBy: Map<string, TransferEvent[]>
} {
  const outboundBy = new Map<string, TransferEvent[]>()
  const inboundBy = new Map<string, TransferEvent[]>()
  const allInstances: AnyInstance[] = [
    ...wsa.bav, ...wsa.etf, ...wsa.insurance,
    ...wsa.basisrente, ...wsa.altersvorsorgedepot, ...wsa.riester,
  ]
  for (const inst of allInstances) {
    for (const ev of inst.transferEvents ?? []) {
      if (inst.instanceId === ev.sourceInstanceId) {
        const outArr = outboundBy.get(ev.sourceInstanceId) ?? []
        outArr.push(ev)
        outboundBy.set(ev.sourceInstanceId, outArr)
      } else if (inst.instanceId === ev.targetInstanceId) {
        const inArr = inboundBy.get(ev.targetInstanceId) ?? []
        inArr.push(ev)
        inboundBy.set(ev.targetInstanceId, inArr)
      } else {
        // Event metadata refers to neither this instance's source nor target —
        // legacy or malformed data. Warn and skip.
        console.warn(
          `[portfolioAdapter] transferEvent on ${inst.instanceId} references ` +
          `source=${ev.sourceInstanceId} target=${ev.targetInstanceId} — skipped.`,
        )
      }
    }
  }
  return { outboundBy, inboundBy }
}

/**
 * Compute source-side surrender tax for a `surrender_reinvest` event.
 *
 * Approach: do a preflight projection of the source instance from year 1 up to
 * the transfer year (no withdrawals applied — passive growth + ongoing
 * contributions). The resulting capital + cumulative contributions feed the
 * existing per-channel surrender helper to derive a tax that matches the
 * helper's normal payout-year math.
 *
 * Pre-2005 insurance: helper short-circuits to zero tax. Other modes use the
 * standard gain-ratio × marginal-rate cascade. Riester surrender clawback is
 * applied via `afterTaxRiesterLumpSum` (§22 Nr. 5 EStG; subsidy clawback math
 * is already inside the helper).
 *
 * Returns 0 when the source product class has no recognised surrender path
 * (e.g. ETF — those should be rejected by the validator anyway).
 */
function computeSurrenderTax(
  sourceInstance: AnyInstance,
  surrenderProceeds: number,
  workspace: Workspace,
  rules: GermanRules,
  eventCalendarYear: number,
): number {
  if (surrenderProceeds <= 0) return 0
  const profile = workspace.baseline.profile
  const slot = detectProductSlot(sourceInstance)
  // ETF is rejected by the validator for surrender_reinvest; treat as 0 anyway.
  if (slot === 'etf') return 0

  // Otherwise, route through per-channel surrender helpers. We don't need a
  // capital projection because the helper computes tax on the surrender
  // proceeds directly (gain-ratio uses surrenderProceeds vs. cost basis when
  // we pass the proceeds as both `capital` and the post-haircut amount;
  // approximation: cost basis equals contributions paid up to event year).

  if (slot === 'insurance') {
    const ins = sourceInstance as InsuranceInstance
    // Conservative cost-basis approximation: zero monthly contribution, so the
    // entire surrender amount is treated as gain unless the helper short-
    // circuits (pre-2005 contracts). Scope-limited per spec: "Subsidy clawback
    // for Riester surrender — already in engine; just ensure existing helper
    // runs at user-set transfer year." Other surrender modes follow the same
    // direct-helper invocation pattern.
    const totalContributedToDate = 0
    const taxMode = deriveInsuranceTaxMode(
      ins.contractStartYear,
      Math.max(1, eventCalendarYear - ins.contractStartYear),
      profile.retirementAge,
      ins.oldContractTaxFreeEligible,
    )
    const kvdrMember =
      workspace.baseline.assumptions.statutoryPension.retirementHealthStatus !== 'freiwillig_gkv'
    const grossNet = afterTaxInsuranceLumpSum(
      surrenderProceeds,
      Math.min(totalContributedToDate, surrenderProceeds),
      taxMode,
      rules,
      0,
      eventCalendarYear,
      profile,
      kvdrMember,
      0,
    )
    return Math.max(0, surrenderProceeds - grossNet)
  }

  if (slot === 'bav') {
    const bav = sourceInstance as BavInstance
    const taxMode = deriveBavLumpSumTaxMode(bav.durchfuehrungsweg, bav.pre2005EligibleTaxFree)
    const grossNet = afterTaxBavLumpSum(
      surrenderProceeds,
      profile,
      rules,
      0,
      bav.kvdrMember !== false,
      eventCalendarYear,
      taxMode,
      0,
    )
    return Math.max(0, surrenderProceeds - grossNet)
  }

  if (slot === 'riester') {
    const grossNet = afterTaxRiesterLumpSum(surrenderProceeds, profile, rules, 0, eventCalendarYear, 0)
    return Math.max(0, surrenderProceeds - grossNet)
  }

  if (slot === 'altersvorsorgedepot') {
    const grossNet = afterTaxAvdLumpSum(surrenderProceeds, profile, rules, 0, eventCalendarYear, 0)
    return Math.max(0, surrenderProceeds - grossNet)
  }

  if (slot === 'basisrente') {
    // Basisrente is non-surrenderable in practice (capital payout legally
    // prohibited). The validator rejects surrender_reinvest with a Basisrente
    // source; this branch is defensive only.
    return 0
  }

  return 0
}

/**
 * Build the per-instance `InstanceCapitalPolicy` from `currentValueEUR` and
 * any inbound / outbound transfer events. Both compare-mode (singleton-shape,
 * length-1 arrays) and combine-mode call this; for compare-mode without any
 * transfer events the resulting policy carries only `initialCapital`, which
 * is the M2 zero-capital fix.
 */
export function buildInstanceCapitalPolicy(
  instance: AnyInstance,
  workspace: Workspace,
  rules: GermanRules,
  outbound: TransferEvent[],
  inbound: TransferEvent[],
): InstanceCapitalPolicy | undefined {
  const hasCurrentValue =
    instance.currentValueEUR !== undefined && instance.currentValueEUR > 0
  if (!hasCurrentValue && outbound.length === 0 && inbound.length === 0) return undefined

  const policy: InstanceCapitalPolicy = {}

  // Starting capital from currentValueEUR. Legacy `existingCapital` (Riester) and
  // `riesterTransferCapital` (AVD) paths in the per-product simulators handle their
  // starting capital before the M2 fix. Setting initialCapital here would double-apply.
  // Issue 15 P2 may unify these once the legacy compare-mode fields are deleted.
  const slot = detectProductSlot(instance)
  if (hasCurrentValue && slot !== 'altersvorsorgedepot' && slot !== 'riester') {
    policy.initialCapital = instance.currentValueEUR
  }

  const capitalInjections: { year: number; amount: number }[] = []
  const capitalWithdrawals: { year: number; amount: number }[] = []
  const costBasisInjections: { year: number; amount: number }[] = []

  // Outbound: this instance is the source of every event in `outbound`.
  for (const ev of outbound) {
    const contractYear = eventCalendarYearToContractYear(ev.year, rules.year)
    if (ev.type === 'certified') {
      // Source loses gross amountEUR — tax-neutral on source side.
      capitalWithdrawals.push({ year: contractYear, amount: ev.amountEUR })
    } else {
      // surrender_reinvest: source loses post-haircut proceeds. Per spec the
      // capital removed from the contract = amountEUR × (1 - haircut).
      const currentValue = instance.currentValueEUR ?? 0
      if (import.meta.env?.DEV && ev.amountEUR > currentValue) {
        console.warn(
          `[portfolioAdapter] surrender_reinvest amountEUR (${ev.amountEUR}) exceeds ` +
          `currentValueEUR (${currentValue}) on instance "${instance.instanceId}". ` +
          `Accumulation will clamp the withdrawal to actual capital at event year.`,
        )
      }
      const proceeds = ev.amountEUR * (1 - ev.surrenderHaircutPct)
      capitalWithdrawals.push({ year: contractYear, amount: proceeds })
    }
  }

  // Inbound: this instance is the target.
  for (const ev of inbound) {
    const contractYear = eventCalendarYearToContractYear(ev.year, rules.year)
    if (ev.type === 'certified') {
      // Tax-neutral; cost basis on target unchanged.
      capitalInjections.push({ year: contractYear, amount: ev.amountEUR })
    } else {
      // surrender_reinvest: target receives after-tax + post-haircut proceeds.
      // Need the source instance to compute surrender tax.
      const sourceInst = findInstanceById(workspace, ev.sourceInstanceId)
      if (!sourceInst) continue // Will fail validation; guard.
      const proceeds = ev.amountEUR * (1 - ev.surrenderHaircutPct)
      const surrenderTax = computeSurrenderTax(sourceInst, proceeds, workspace, rules, ev.year)
      const afterTaxInjection = Math.max(0, proceeds - surrenderTax)
      capitalInjections.push({ year: contractYear, amount: afterTaxInjection })
      // Cost basis on target = the after-tax injection (so future gain on
      // target capital is taxed only on subsequent appreciation, not on the
      // already-taxed surrender proceeds — §19 InvStG / §20 EStG).
      costBasisInjections.push({ year: contractYear, amount: afterTaxInjection })
    }
  }

  if (capitalInjections.length > 0) policy.capitalInjections = capitalInjections
  if (capitalWithdrawals.length > 0) policy.capitalWithdrawals = capitalWithdrawals
  if (costBasisInjections.length > 0) policy.costBasisInjections = costBasisInjections
  // Empty policy → no-op.
  if (
    policy.initialCapital === undefined &&
    !policy.capitalInjections &&
    !policy.capitalWithdrawals &&
    !policy.costBasisInjections
  ) {
    return undefined
  }
  return policy
}

function findInstanceById(workspace: Workspace, id: string): AnyInstance | undefined {
  const wsa = workspace.baseline.assumptions
  const lists: readonly AnyInstance[][] = [
    wsa.bav, wsa.etf, wsa.insurance,
    wsa.basisrente, wsa.altersvorsorgedepot, wsa.riester,
  ]
  for (const arr of lists) {
    const m = arr.find(i => i.instanceId === id)
    if (m) return m
  }
  return undefined
}

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
  applyCrossInstanceSparerpauschbetrag(wsa, perInstance, profile, rules, outboundBy, inboundBy, workspace)

  return { perInstance, portfolioFunding }
}

// ---------------------------------------------------------------------------
// Phase G M4 F3 — cross-instance Sparerpauschbetrag re-run
// ---------------------------------------------------------------------------

/**
 * Re-run active ETF instances with a shared per-year §20 Abs. 9 EStG allowance.
 *
 * Mutates `perInstance` in place so the returned `simulatePortfolio` map carries
 * the corrected ETF results. Idempotent for length-1 ETF workspaces (the
 * shared schedule reduces to the full allowance every year).
 *
 * Allocation: per scenario, per year, the allowance is split across instances
 * proportionally to each instance's `taxableAfterExemption` demand from the
 * initial pass. The accumulation phase (Vorabpauschale) and payout phase share
 * one combined yearly schedule indexed by 0-based contract year.
 *
 * Joint filing (workspace.baseline.partner !== undefined): the §20 Abs. 9 EStG
 * cap doubles to €2 000 (Zusammenveranlagung), mirroring the recommender logic.
 */
function applyCrossInstanceSparerpauschbetrag(
  wsa: WorkspaceAssumptionsV2,
  perInstance: Record<string, ProductResult[]>,
  profile: PersonalProfile,
  rules: GermanRules,
  outboundBy: Map<string, TransferEvent[]>,
  inboundBy: Map<string, TransferEvent[]>,
  workspace: Workspace,
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
    // demand[i][y] is the EUR amount the instance would consume of the
    // allowance at year y (0-based contract year covering both phases).
    const demandByInstance = new Map<string, number[]>()

    for (const inst of activeEtf) {
      const results = perInstance[inst.instanceId]
      if (!results) continue
      const result = results.find((r) => r.scenarioId === scenario.id)
      if (!result || result.productId !== 'etf') continue
      const partialExemption = wsa.etf.find((e) => e.instanceId === inst.instanceId)?.equityPartialExemption
        ?? 0.3
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
      // yearsToRetirement + (n).
      for (const r of result.etfPayoutRows) {
        const yearIdx = yearsToRetirement + (r.year - 1)
        if (yearIdx < 0 || yearIdx >= totalYears) continue
        const taxableAfterExemption = r.taxableGain * (1 - partialExemption)
        yearly[yearIdx] += Math.max(0, taxableAfterExemption)
      }
      demandByInstance.set(inst.instanceId, yearly)
    }

    if (demandByInstance.size === 0) continue

    // Step 2: allocate the per-year allowance proportionally by demand. When
    // total demand for a year is 0, every instance gets 0 (no taxable income →
    // allowance unused). When total demand exceeds the allowance, scale down.
    // When total demand is below the allowance, each instance gets exactly
    // its demand (everyone is fully covered, equivalent to today's behaviour
    // for low-gain years).
    const allowanceByInstance = new Map<string, number[]>()
    for (const [id] of demandByInstance) {
      allowanceByInstance.set(id, new Array(totalYears).fill(0))
    }
    for (let y = 0; y < totalYears; y++) {
      let totalDemand = 0
      for (const [, dem] of demandByInstance) totalDemand += dem[y]
      if (totalDemand <= 0) continue
      if (totalDemand <= fullAllowance) {
        // Every instance gets its full demand (allowance not the binding
        // constraint). Equivalent to the legacy per-instance allowance
        // behaviour for low-gain years.
        for (const [id, dem] of demandByInstance) {
          allowanceByInstance.get(id)![y] = dem[y]
        }
      } else {
        // Allowance is the binding constraint — scale each instance's share
        // proportionally to its demand.
        for (const [id, dem] of demandByInstance) {
          allowanceByInstance.get(id)![y] = fullAllowance * (dem[y] / totalDemand)
        }
      }
    }

    // Step 3: re-run each ETF instance with its per-year allowance schedule
    // and replace the corresponding ProductResult in `perInstance`.
    for (const inst of activeEtf) {
      const schedule = allowanceByInstance.get(inst.instanceId)
      if (!schedule) continue
      const projectedRaw = projectInstanceToScenarioAssumptions(inst, wsa)
      const projected = inst.status === 'paid_up'
        ? applyPaidUpOverridesToProjection(projectedRaw, detectProductSlot(inst))
        : projectedRaw
      const outbound = outboundBy.get(inst.instanceId) ?? []
      const inbound = inboundBy.get(inst.instanceId) ?? []
      const instanceCapitalPolicy = buildInstanceCapitalPolicy(inst, workspace, rules, outbound, inbound)
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
