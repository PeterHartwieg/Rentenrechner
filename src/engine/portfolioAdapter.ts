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
 */

import type {
  AltersvorsorgedepotAssumptions,
  AltersvorsorgedepotFundingResult,
  BasisrenteAssumptions,
  BasisrenteFundingResult,
  BavAssumptions,
  BavFundingResult,
  GermanRules,
  PersonalProfile,
  ProductResult,
  ReturnScenario,
  RiesterAssumptions,
  RiesterFundingResult,
  SalaryResult,
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
import { calculateBavFunding, calculateSalaryResult } from './salary'
import { calculateBasisrenteFunding } from './basisrente'
import { calculateAvdFunding } from './altersvorsorgedepot'
import { calculateRiesterFunding } from './riester'
import { confidenceForResult } from '../app/evidence'
import {
  NEUTRALISED_BAV,
  NEUTRALISED_ETF,
  NEUTRALISED_INSURANCE,
  NEUTRALISED_BASISRENTE,
  NEUTRALISED_ALTERSVORSORGEDEPOT,
  NEUTRALISED_RIESTER,
  stripInstanceCommonKeys,
  detectProductSlot,
  slotToProductId,
  applyPaidUpOverridesToProjection,
  projectInstanceToScenarioAssumptions,
  singletonViewOfWorkspace,
  type AnyInstance,
} from './portfolioProjection'

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
  type AnyInstance,
}

// ---------------------------------------------------------------------------
// Beitragsfrei (paid_up) helpers — Phase G M4 F1
// ---------------------------------------------------------------------------
//
// `paidUpFeeModel` and the projection overrides live in portfolioProjection.ts.
// The funding-side paid-up helpers below remain here until issue 05 extracts
// the funding apportionment module.

/**
 * Build a `BavFundingResult` for a paid-up bAV instance: zero contribution,
 * zero employer subsidy, zero tax/SV savings. We still call
 * `calculateBavFunding` with a zeroed singleton so the salary baseline
 * (`salaryWithBav`) reflects "no bAV deduction" — which is exactly what a
 * paid-up bAV looks like to payroll.
 */
function paidUpBavFunding(
  profile: PersonalProfile,
  rules: GermanRules,
  singleton: BavAssumptions,
  calc: typeof calculateBavFunding,
): BavFundingResult {
  const zeroed: BavAssumptions = {
    ...singleton,
    monthlyGrossConversion: 0,
    statutoryMinimumSubsidyEnabled: false,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
  }
  return calc(profile, rules, zeroed)
}

/** Build a paid-up Basisrente funding result. */
function paidUpBasisrenteFunding(
  rules: GermanRules,
  salary: SalaryResult,
  singleton: BasisrenteAssumptions,
  pensionSystemAnnualOverride: number | undefined,
  calc: typeof calculateBasisrenteFunding,
): BasisrenteFundingResult {
  const zeroed: BasisrenteAssumptions = { ...singleton, monthlyGrossContribution: 0 }
  return calc(rules, salary, zeroed, pensionSystemAnnualOverride)
}

/**
 * Build a paid-up AVD funding result. Zero own contribution AND eligibility,
 * so allowances stop accruing during the paid-up phase.
 */
function paidUpAvdFunding(
  rules: GermanRules,
  salary: SalaryResult,
  singleton: AltersvorsorgedepotAssumptions,
  calc: typeof calculateAvdFunding,
): AltersvorsorgedepotFundingResult {
  const zeroed: AltersvorsorgedepotAssumptions = {
    ...singleton,
    monthlyOwnContribution: 0,
    eligibility: {
      directlyEligible: false,
      indirectSpouseEligible: false,
      eligibleChildren: 0,
      ageAtContractStart: singleton.eligibility.ageAtContractStart,
      careerStarterBonusUsed: true,
    },
  }
  return calc(rules, salary, zeroed)
}

/**
 * Build a paid-up Riester funding result. Zero contribution AND eligibility
 * — no new state allowances during paid-up phase. Per spec: "Riester subsidies
 * STOP during paid-up". Existing accumulated capital continues to grow via
 * `instanceCapitalPolicy.initialCapital`. We do NOT trigger any clawback.
 */
function paidUpRiesterFunding(
  rules: GermanRules,
  salary: SalaryResult,
  singleton: RiesterAssumptions,
  calc: (rules: GermanRules, salary: SalaryResult, singleton: RiesterAssumptions) => RiesterFundingResult,
): RiesterFundingResult {
  const zeroed: RiesterAssumptions = {
    ...singleton,
    monthlyOwnContribution: 0,
    eligibility: {
      directlyEligible: false,
      indirectSpouseEligible: false,
      ageAtContractStart: singleton.eligibility.ageAtContractStart,
      careerStarterBonusUsed: true,
    },
  }
  return calc(rules, salary, zeroed)
}

// ---------------------------------------------------------------------------
// Portfolio-aware funding pre-step
// ---------------------------------------------------------------------------

/**
 * Aggregate cross-instance shared budgets BEFORE per-instance simulation.
 *
 * Caps handled:
 *   - bAV §3 Nr. 63 + §1 SvEV: single user/single employer assumption (P1).
 *     Sum monthlyGrossConversion across active bAV instances, scale each
 *     instance proportionally so the aggregate respects the cap, then call
 *     `calculateBavFunding` with the scaled gross. The statutory subsidy
 *     follows proportionally because it's derived from the scaled gross
 *     conversion inside `calculateBavFunding`.
 *   - Basisrente §10 Abs. 3: sum monthlyGrossContribution; scale; call
 *     `calculateBasisrenteFunding` with the scaled value. The §10 Abs. 3
 *     deductible cap then no longer binds inside the funding helper because
 *     the aggregate is already capped.
 *   - Riester §10a / §86: sum monthlyOwnContribution; scale; call
 *     `calculateRiesterFunding` with the scaled value. Allowance + Mindesteigen-
 *     beitrag are computed at the per-instance level by the existing helper
 *     (which takes the proper scaled value as input).
 *   - AVD §10a + AltZertG contract cap: sum monthlyOwnContribution; scale.
 *
 * Sparerpauschbetrag (ETF cross-instance allowance): apportioned downstream
 * by `applyCrossInstanceSparerpauschbetrag` in `simulatePortfolio`, after the
 * per-instance results return; this function does not surface a deferral note.
 *
 * Surrendered instances are skipped — they contribute zero to the cap and do
 * not appear in the per-instance funding map.
 */
export function buildPortfolioFunding(
  workspace: Workspace,
  rules: GermanRules,
): PortfolioFunding {
  const profile = workspace.baseline.profile
  const wsa = workspace.baseline.assumptions
  const notes: string[] = []

  // -------------------------------------------------------------------------
  // bAV cap aggregation
  // -------------------------------------------------------------------------
  // Paid-up instances do NOT consume cap headroom (no contributions flowing).
  // We still emit a funding entry for them via `paidUpBavFunding` so the
  // simulator runs against a zero-contribution baseline.
  const allBav = wsa.bav.filter(b => b.status !== 'surrendered' && b.status !== 'offered')
  const activeBav = allBav.filter(b => b.status === 'active')
  const paidUpBav = allBav.filter(b => b.status === 'paid_up')
  const totalBavGrossMonthly = activeBav.reduce(
    (s, b) => s + (b.monthlyGrossConversion ?? 0),
    0,
  )
  const bavTaxFreeLimitAnnual =
    rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap
  const bavTaxFreeLimitMonthly = bavTaxFreeLimitAnnual / 12

  // Scale factor: 1 if aggregate is under the cap, else cap / aggregate.
  // Note: this only scales the EMPLOYEE conversion. Statutory subsidy follows
  // because it's a function of the scaled gross conversion inside
  // calculateBavFunding. Contractual subsidies stay attached to each instance.
  const bavScale =
    totalBavGrossMonthly > bavTaxFreeLimitMonthly && totalBavGrossMonthly > 0
      ? bavTaxFreeLimitMonthly / totalBavGrossMonthly
      : 1

  const bavByInstanceId: Record<string, BavFundingResult> = {}
  for (const inst of activeBav) {
    // Build the singleton bAV assumptions used by calculateBavFunding.
    // Strip InstanceCommon keys; bavFunding does not read them.
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BavAssumptions
    const scaledSingleton: BavAssumptions = bavScale === 1
      ? singleton
      : { ...singleton, monthlyGrossConversion: singleton.monthlyGrossConversion * bavScale }
    bavByInstanceId[inst.instanceId] = calculateBavFunding(profile, rules, scaledSingleton)
  }
  for (const inst of paidUpBav) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BavAssumptions
    bavByInstanceId[inst.instanceId] = paidUpBavFunding(profile, rules, singleton, calculateBavFunding)
  }

  // -------------------------------------------------------------------------
  // Basisrente cap aggregation
  // -------------------------------------------------------------------------
  // We need a salary baseline for the Basisrente / AVD / Riester funding
  // helpers. Use the FIRST active bAV instance's salaryWithBav when present;
  // otherwise compute a pristine salary (no bAV).
  const firstBavFunding = activeBav.length > 0
    ? bavByInstanceId[activeBav[0].instanceId]
    : undefined
  const salaryForOtherFunding =
    firstBavFunding?.salaryWithBav ?? calculateSalaryResult(profile, rules, 0)

  // Versorgungswerk override (mirrors buildContext logic).
  const { pensionBaselineType, versorgungswerkMonthlyContribution, versorgungswerkEmployerMonthly } =
    wsa.statutoryPension
  let pensionSystemAnnualContributionOverride: number | undefined
  if (pensionBaselineType === 'versorgungswerk') {
    pensionSystemAnnualContributionOverride =
      ((versorgungswerkMonthlyContribution ?? 0) + (versorgungswerkEmployerMonthly ?? 0)) * 12
  } else if (pensionBaselineType === 'beamtenpension' || pensionBaselineType === 'none') {
    pensionSystemAnnualContributionOverride = 0
  }

  const allBasisrente = wsa.basisrente.filter(b => b.status !== 'surrendered' && b.status !== 'offered')
  const activeBasisrente = allBasisrente.filter(b => b.status === 'active')
  const paidUpBasisrente = allBasisrente.filter(b => b.status === 'paid_up')
  const totalBasisrenteGrossMonthly = activeBasisrente.reduce(
    (s, b) => s + (b.monthlyGrossContribution ?? 0),
    0,
  )
  // The Schicht-1 cap is shared. We compute the remaining cap once at the
  // workspace level (after subtracting the GRV / VW pension-system contributions
  // that count toward the cap), then proportionally scale Basisrente
  // contributions if the aggregate exceeds it.
  let annualPensionContributionsTowardsCap: number
  if (pensionSystemAnnualContributionOverride !== undefined) {
    annualPensionContributionsTowardsCap = pensionSystemAnnualContributionOverride
  } else {
    const annualGrvEmployee = salaryForOtherFunding.social.pension
    const annualGrvEmployer =
      rules.socialSecurity.pensionEmployeeRate > 0
        ? (annualGrvEmployee / rules.socialSecurity.pensionEmployeeRate) *
          rules.socialSecurity.pensionEmployerRate
        : annualGrvEmployee
    annualPensionContributionsTowardsCap = annualGrvEmployee + annualGrvEmployer
  }
  const remainingSchicht1CapAnnual = Math.max(
    0,
    rules.basisrente.schicht1CapSingle - annualPensionContributionsTowardsCap,
  )
  const remainingSchicht1CapMonthly = remainingSchicht1CapAnnual / 12
  const totalBasisrenteAnnual = totalBasisrenteGrossMonthly * 12

  // Scale: only when the aggregate exceeds the remaining Schicht-1 headroom.
  // Each instance's funding helper would normally apply the same cap inside;
  // we scale here so two instances at, say, 1500 EUR/month each don't both
  // see the full cap headroom and double-count the deduction.
  const basisrenteScale =
    totalBasisrenteAnnual > remainingSchicht1CapAnnual && totalBasisrenteAnnual > 0
      ? remainingSchicht1CapMonthly / totalBasisrenteGrossMonthly
      : 1

  const basisrenteByInstanceId: Record<string, BasisrenteFundingResult> = {}
  for (const inst of activeBasisrente) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BasisrenteAssumptions
    const scaledSingleton: BasisrenteAssumptions = basisrenteScale === 1
      ? singleton
      : { ...singleton, monthlyGrossContribution: singleton.monthlyGrossContribution * basisrenteScale }
    basisrenteByInstanceId[inst.instanceId] = calculateBasisrenteFunding(
      rules,
      salaryForOtherFunding,
      scaledSingleton,
      pensionSystemAnnualContributionOverride,
    )
  }
  for (const inst of paidUpBasisrente) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BasisrenteAssumptions
    basisrenteByInstanceId[inst.instanceId] = paidUpBasisrenteFunding(
      rules,
      salaryForOtherFunding,
      singleton,
      pensionSystemAnnualContributionOverride,
      calculateBasisrenteFunding,
    )
  }

  // -------------------------------------------------------------------------
  // AVD aggregation (AltZertG contract cap + §10a)
  // -------------------------------------------------------------------------
  const allAvd = wsa.altersvorsorgedepot.filter(a => a.status !== 'surrendered' && a.status !== 'offered')
  const activeAvd = allAvd.filter(a => a.status === 'active')
  const paidUpAvd = allAvd.filter(a => a.status === 'paid_up')
  // AVD has a per-contract contributionCap (6840 EUR/year for 2026). The cap is
  // per-contract, not per-portfolio, so we don't scale across instances.
  // §10a deduction is handled inside the funding helper. The Sparerpauschbetrag
  // sharing across AVD payouts is deferred to issue 15.
  const altersvorsorgedepotByInstanceId: Record<string, AltersvorsorgedepotFundingResult> = {}
  for (const inst of activeAvd) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as AltersvorsorgedepotAssumptions
    altersvorsorgedepotByInstanceId[inst.instanceId] = calculateAvdFunding(
      rules,
      salaryForOtherFunding,
      singleton,
      { profile },
    )
  }
  for (const inst of paidUpAvd) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as AltersvorsorgedepotAssumptions
    altersvorsorgedepotByInstanceId[inst.instanceId] = paidUpAvdFunding(
      rules,
      salaryForOtherFunding,
      singleton,
      calculateAvdFunding,
    )
  }

  // -------------------------------------------------------------------------
  // Riester aggregation (§10a / §86 + allowances)
  // -------------------------------------------------------------------------
  const allRiester = wsa.riester.filter(r => r.status !== 'surrendered' && r.status !== 'offered')
  const activeRiester = allRiester.filter(r => r.status === 'active')
  const paidUpRiester = allRiester.filter(r => r.status === 'paid_up')
  const totalRiesterGrossMonthly = activeRiester.reduce(
    (s, r) => s + (r.monthlyOwnContribution ?? 0),
    0,
  )
  // §10a EStG cap is 2,100 EUR/year incl. allowances. Each instance helper applies
  // the cap inside; we scale here so two instances at the cap each don't both claim
  // the full deduction. Use a coarse aggregate scaling: when total annual own
  // contributions exceed the cap, scale each instance proportionally.
  const riesterCapAnnual = rules.riester.annualCapInclAllowances
  const totalRiesterAnnual = totalRiesterGrossMonthly * 12
  const riesterScale =
    totalRiesterAnnual > riesterCapAnnual && totalRiesterAnnual > 0
      ? riesterCapAnnual / totalRiesterAnnual
      : 1

  const riesterByInstanceId: Record<string, RiesterFundingResult> = {}
  for (const inst of activeRiester) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as RiesterAssumptions
    const scaledSingleton: RiesterAssumptions = riesterScale === 1
      ? singleton
      : { ...singleton, monthlyOwnContribution: singleton.monthlyOwnContribution * riesterScale }
    riesterByInstanceId[inst.instanceId] = calculateRiesterFunding(
      rules,
      salaryForOtherFunding,
      scaledSingleton,
      profile,
    )
  }
  for (const inst of paidUpRiester) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as RiesterAssumptions
    riesterByInstanceId[inst.instanceId] = paidUpRiesterFunding(
      rules,
      salaryForOtherFunding,
      singleton,
      (r, s, si) => calculateRiesterFunding(r, s, si, profile),
    )
  }

  return {
    bavByInstanceId,
    basisrenteByInstanceId,
    altersvorsorgedepotByInstanceId,
    riesterByInstanceId,
    notes,
  }
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
