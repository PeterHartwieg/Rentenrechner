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
 */

import type {
  AltersvorsorgedepotAssumptions,
  AltersvorsorgedepotFundingResult,
  BasisrenteAssumptions,
  BasisrenteFundingResult,
  BavAssumptions,
  BavFundingResult,
  EtfAssumptions,
  GermanRules,
  InsuranceAssumptions,
  ProductResult,
  ReturnScenario,
  RiesterAssumptions,
  RiesterFundingResult,
  ScenarioAssumptions,
} from '../domain'
import type { PortfolioFunding, Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type {
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  BavInstance,
  EtfInstance,
  InstanceCommon,
  InsuranceInstance,
  RiesterInstance,
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
import { calculateBavFunding, calculateSalaryResult } from './salary'
import { calculateBasisrenteFunding } from './basisrente'
import { calculateAvdFunding } from './altersvorsorgedepot'
import { calculateRiesterFunding } from './riester'
import { confidenceForResult } from '../app/evidence'
import type { ProductId } from './productRegistry'

// ---------------------------------------------------------------------------
// Neutralised defaults
// ---------------------------------------------------------------------------
//
// When the adapter projects a single instance into a singleton-shaped
// `ScenarioAssumptions`, the OTHER product slots must be populated with
// neutral values that do not contribute to:
//   - cross-product funding (bavFunding sets the fair-comparison anchor for
//     ETF / pAV; if a neutralised bAV slot has a non-zero monthlyGrossConversion,
//     it would falsely bump ETF / pAV monthlyUserCost),
//   - cap utilisation (a neutralised Basisrente that consumed Schicht-1 cap
//     would shrink the Riester / Basisrente headroom for the active instance),
//   - employer subsidy estimation (a neutralised bAV with an employer match
//     would inflate salary deductions),
//   - allowance computation (a neutralised Riester contribution would burn
//     state allowances that should accrue elsewhere).
//
// The constants below are exported so tests and downstream callers can rely
// on the exact shape. Do NOT mutate; treat as immutable.

export const NEUTRALISED_BAV: BavAssumptions = {
  monthlyGrossConversion: 0,
  statutoryMinimumSubsidyEnabled: false,
  contractualMatchPercent: 0,
  contractualFixedMonthly: 0,
  monthlyOtherRetirementIncome: 0,
  includeGrvReduction: false,
  kvdrMember: true,
  durchfuehrungsweg: 'direktversicherung_3_63',
  pre2005EligibleTaxFree: false,
  payoutMode: 'leibrente',
  rentenfaktor: 30,
  rentenfaktorConfirmed: false,
  zeitrenteYears: 20,
  annualContributionGrowthRate: 0,
  fees: {
    wrapperAssetFee: 0,
    fundAssetFee: 0,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 1,
    pensionPayoutFeePct: 0,
  },
}

export const NEUTRALISED_ETF: EtfAssumptions = {
  annualAssetFee: 0,
  equityPartialExemption: 0.3,
  annualContributionGrowthRate: 0,
}

export const NEUTRALISED_INSURANCE: InsuranceAssumptions = {
  contractStartYear: 2024,
  oldContractTaxFreeEligible: false,
  monthlyOtherRetirementIncome: 0,
  capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
  fees: {
    wrapperAssetFee: 0,
    fundAssetFee: 0,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 1,
    pensionPayoutFeePct: 0,
  },
  payoutMode: 'leibrente',
  rentenfaktor: 28,
  rentenfaktorConfirmed: false,
  zeitrenteYears: 20,
  surrenderHaircutPct: 0,
  annualContributionGrowthRate: 0,
}

export const NEUTRALISED_BASISRENTE: BasisrenteAssumptions = {
  monthlyGrossContribution: 0,
  fees: {
    wrapperAssetFee: 0,
    fundAssetFee: 0,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 1,
    pensionPayoutFeePct: 0,
  },
  payoutMode: 'leibrente',
  rentenfaktor: 28,
  rentenfaktorConfirmed: false,
  monthlyOtherRetirementIncome: 0,
}

export const NEUTRALISED_ALTERSVORSORGEDEPOT: AltersvorsorgedepotAssumptions = {
  subtype: 'depot_no_guarantee',
  monthlyOwnContribution: 0,
  eligibility: {
    directlyEligible: false,
    indirectSpouseEligible: false,
    eligibleChildren: 0,
    ageAtContractStart: 30,
    careerStarterBonusUsed: true,
  },
  riskAllocationPct: 0,
  riskAnnualReturn: 0,
  lowRiskAnnualReturn: 0,
  fees: {
    wrapperAssetFee: 0,
    fundAssetFee: 0,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 1,
    pensionPayoutFeePct: 0,
  },
  payoutMode: 'certified_payout_plan',
  payoutPlanEndAge: 85,
  partialCapitalPct: 0,
  transferCostEUR: 0,
  monthlyOtherRetirementIncome: 0,
  rentenfaktor: 28,
  riesterTransferCapital: 0,
}

export const NEUTRALISED_RIESTER: RiesterAssumptions = {
  monthlyOwnContribution: 0,
  existingCapital: 0,
  eligibility: {
    directlyEligible: false,
    indirectSpouseEligible: false,
    ageAtContractStart: 30,
    careerStarterBonusUsed: true,
  },
  capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
  fees: {
    wrapperAssetFee: 0,
    fundAssetFee: 0,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 1,
    pensionPayoutFeePct: 0,
  },
  payoutMode: 'leibrente',
  rentenfaktor: 28,
  rentenfaktorConfirmed: false,
  zeitrenteYears: 20,
  partialCapitalPct: 0,
  monthlyOtherRetirementIncome: 0,
}

// ---------------------------------------------------------------------------
// InstanceCommon strip helper
// ---------------------------------------------------------------------------

/**
 * The fields added by `InstanceCommon` that the engine does not read. They
 * still get spread onto the projected singleton (the engine ignores unknown
 * fields), but tests / consumers that compare the projection to the original
 * singleton can use this list to drop them.
 */
const INSTANCE_COMMON_KEYS = [
  'instanceId',
  'label',
  'anbieter',
  'status',
  'contractStartYear',
  'currentValueEUR',
  'evidenceMap',
  'ownedBy',
  'transferEvents',
] as const

function stripInstanceCommonKeys<T extends Record<string, unknown>>(
  instance: T,
  keysToKeep: readonly (keyof T)[] = [],
): Omit<T, typeof INSTANCE_COMMON_KEYS[number]> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(instance)) {
    const isCommon = (INSTANCE_COMMON_KEYS as readonly string[]).includes(k)
    if (!isCommon || (keysToKeep as readonly string[]).includes(k)) {
      out[k] = v
    }
  }
  return out as Omit<T, typeof INSTANCE_COMMON_KEYS[number]>
}

// ---------------------------------------------------------------------------
// Active-instance helpers — used by `projectInstanceToScenarioAssumptions`
// ---------------------------------------------------------------------------

type ProductSlot = 'bav' | 'etf' | 'insurance' | 'basisrente' | 'altersvorsorgedepot' | 'riester'

function slotToProductId(slot: ProductSlot): ProductId {
  switch (slot) {
    case 'etf': return 'etf'
    case 'bav': return 'bav'
    case 'insurance': return 'versicherung'
    case 'basisrente': return 'basisrente'
    case 'altersvorsorgedepot': return 'altersvorsorgedepot'
    case 'riester': return 'riester'
  }
}

/** All instance-shaped types accepted by the projection helper. */
export type AnyInstance =
  | BavInstance
  | EtfInstance
  | InsuranceInstance
  | BasisrenteInstance
  | AltersvorsorgedepotInstance
  | RiesterInstance

/**
 * Determine which `ScenarioAssumptions` slot an instance belongs to.
 * Uses the deterministic `instanceId` prefix produced by issue 02's migration
 * (`${productId}-${suffix}`) when present; otherwise falls back to structural
 * detection from the instance fields.
 *
 * Insurance instances carry productId 'versicherung'; the singleton slot key
 * is 'insurance' (legacy ScenarioAssumptions name), so we map accordingly.
 */
function detectProductSlot(instance: AnyInstance): ProductSlot {
  const id = instance.instanceId
  // Insurance is "versicherung" in product-id space but "insurance" as the
  // ScenarioAssumptions slot key. Map first, then check generic prefixes.
  if (id.startsWith('versicherung-')) return 'insurance'
  if (id.startsWith('bav-')) return 'bav'
  if (id.startsWith('etf-')) return 'etf'
  if (id.startsWith('basisrente-')) return 'basisrente'
  if (id.startsWith('altersvorsorgedepot-')) return 'altersvorsorgedepot'
  if (id.startsWith('riester-')) return 'riester'
  // Structural fallback — match on a discriminating field.
  const r = instance as unknown as Record<string, unknown>
  if (typeof r.monthlyGrossConversion === 'number') return 'bav'
  if (typeof r.annualAssetFee === 'number' && typeof r.equityPartialExemption === 'number') return 'etf'
  if (typeof r.monthlyGrossContribution === 'number') return 'basisrente'
  if (typeof r.subtype === 'string') return 'altersvorsorgedepot'
  if (typeof r.monthlyOwnContribution === 'number' && 'existingCapital' in r) return 'riester'
  if (typeof r.contractStartYear === 'number') return 'insurance'
  throw new Error(`portfolioAdapter: cannot detect product slot for instance ${id}`)
}

// ---------------------------------------------------------------------------
// `projectInstanceToScenarioAssumptions`
// ---------------------------------------------------------------------------

/**
 * Project a single per-product instance into a singleton-shaped
 * `ScenarioAssumptions` (the legacy engine type).
 *
 * - The instance's product slot is populated from instance fields (with
 *   `InstanceCommon` keys dropped; the engine ignores unknown fields anyway,
 *   but stripping keeps oracle-golden round-trip stable).
 * - Other product slots get NEUTRALISED defaults — zero contributions and
 *   neutral fees so they cannot pollute funding pre-passes or the
 *   fair-comparison invariant.
 * - Scenario-level fields (`returnScenarios`, `monteCarlo`, `inflationRate`,
 *   `retirementEndAge`, `visibleProducts`, `statutoryPension`) copy from the
 *   workspace assumptions verbatim.
 *
 * `currentValueEUR` mapping (per design Decision A in issue 03 spec):
 *   - Riester: maps to `existingCapital`.
 *   - AVD: maps to `riesterTransferCapital`.
 *   - ETF, bAV, pAV, Basisrente: TODO(issue 15) — `AccumulationInput.initialCapital`
 *     extension lands there; for now we drop the value and the projection silently
 *     ignores it. (The instance schema preserves `currentValueEUR` for issue 15.)
 *
 * Pure: no DOM, no I/O. Round-trip stable when called twice with identical inputs.
 */
export function projectInstanceToScenarioAssumptions(
  instance: AnyInstance,
  workspaceAssumptions: WorkspaceAssumptionsV2,
): ScenarioAssumptions {
  const slot = detectProductSlot(instance)

  // Build neutralised baseline for all six product slots.
  let bav: BavAssumptions = NEUTRALISED_BAV
  let etf: EtfAssumptions = NEUTRALISED_ETF
  let insurance: InsuranceAssumptions = NEUTRALISED_INSURANCE
  let basisrente: BasisrenteAssumptions = NEUTRALISED_BASISRENTE
  let altersvorsorgedepot: AltersvorsorgedepotAssumptions = NEUTRALISED_ALTERSVORSORGEDEPOT
  let riester: RiesterAssumptions = NEUTRALISED_RIESTER

  // Slot the instance into its product. We strip InstanceCommon keys so the
  // returned ScenarioAssumptions matches the singleton shape exactly (no
  // instance-only fields leak into engine state).
  switch (slot) {
    case 'bav':
      bav = stripInstanceCommonKeys(instance as unknown as Record<string, unknown>) as unknown as BavAssumptions
      break
    case 'etf': {
      const stripped = stripInstanceCommonKeys(instance as unknown as Record<string, unknown>) as unknown as EtfAssumptions
      etf = stripped
      break
    }
    case 'insurance': {
      // Insurance uses contractStartYear from BOTH InstanceCommon and InsuranceAssumptions.
      // The InstanceCommon contractStartYear is authoritative (vintage drives tax routing).
      const stripped = stripInstanceCommonKeys(
        instance as unknown as Record<string, unknown>,
        ['contractStartYear'],
      ) as unknown as InsuranceAssumptions
      insurance = stripped
      break
    }
    case 'basisrente':
      basisrente = stripInstanceCommonKeys(instance as unknown as Record<string, unknown>) as unknown as BasisrenteAssumptions
      break
    case 'altersvorsorgedepot': {
      const baseAvd = stripInstanceCommonKeys(instance as unknown as Record<string, unknown>) as unknown as AltersvorsorgedepotAssumptions
      // Map currentValueEUR → riesterTransferCapital for AVD (per spec).
      const cv = (instance as InstanceCommon).currentValueEUR
      altersvorsorgedepot = cv !== undefined && cv > 0 && baseAvd.riesterTransferCapital === 0
        ? { ...baseAvd, riesterTransferCapital: cv }
        : baseAvd
      break
    }
    case 'riester': {
      const baseRiester = stripInstanceCommonKeys(instance as unknown as Record<string, unknown>) as unknown as RiesterAssumptions
      // Map currentValueEUR → existingCapital for Riester (per spec).
      const cv = (instance as InstanceCommon).currentValueEUR
      riester = cv !== undefined && cv > 0 && baseRiester.existingCapital === 0
        ? { ...baseRiester, existingCapital: cv }
        : baseRiester
      break
    }
  }

  return {
    inflationRate: workspaceAssumptions.inflationRate,
    retirementEndAge: workspaceAssumptions.retirementEndAge,
    returnScenarios: workspaceAssumptions.returnScenarios,
    monteCarlo: workspaceAssumptions.monteCarlo,
    visibleProducts: workspaceAssumptions.visibleProducts,
    statutoryPension: workspaceAssumptions.statutoryPension,
    bav,
    etf,
    insurance,
    basisrente,
    altersvorsorgedepot,
    riester,
  }
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
 * Sparerpauschbetrag: deferred (issue 15). Surfaced in `notes`.
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
  const activeBav = wsa.bav.filter(b => b.status !== 'surrendered')
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

  const activeBasisrente = wsa.basisrente.filter(b => b.status !== 'surrendered')
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

  // -------------------------------------------------------------------------
  // AVD aggregation (AltZertG contract cap + §10a)
  // -------------------------------------------------------------------------
  const activeAvd = wsa.altersvorsorgedepot.filter(a => a.status !== 'surrendered')
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
    )
  }

  // -------------------------------------------------------------------------
  // Riester aggregation (§10a / §86 + allowances)
  // -------------------------------------------------------------------------
  const activeRiester = wsa.riester.filter(r => r.status !== 'surrendered')
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

  // -------------------------------------------------------------------------
  // Sparerpauschbetrag note (deferred per Decision C)
  // -------------------------------------------------------------------------
  if (wsa.etf.length >= 2) {
    notes.push(
      'Cross-instance Sparerpauschbetrag sharing is deferred to issue 15. '
      + `Each of the ${wsa.etf.length} ETF instances currently consumes the full €${rules.capitalGains.saverAllowance} allowance independently.`,
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
// Compare-mode singleton view (replaces legacy `extractSingletonAssumptions`)
// ---------------------------------------------------------------------------

/**
 * Build a singleton-shaped `ScenarioAssumptions` for compare-mode rendering.
 *
 * Compare-mode workspaces use length-1 instance arrays per product. This helper
 * produces the singleton view by projecting the FIRST active instance per
 * product slot (using `projectInstanceToScenarioAssumptions` for each), then
 * merging the per-slot results into a single `ScenarioAssumptions` object.
 *
 * For length-0 product arrays, the slot keeps its `defaultAssumptions` value.
 *
 * Replaces the M1 stop-gap `extractSingletonAssumptions` (storage.ts). The
 * critical invariant — oracle goldens stay byte-identical for a length-1
 * workspace — holds because each per-slot projection produces the same shape
 * the legacy helper produced.
 */
export function singletonViewOfWorkspace(
  workspace: Workspace,
  defaultsForEmptySlots: Pick<
    ScenarioAssumptions,
    'bav' | 'etf' | 'insurance' | 'basisrente' | 'altersvorsorgedepot' | 'riester'
  >,
): ScenarioAssumptions {
  const wsa = workspace.baseline.assumptions

  // Read the first active instance per product; fall back to the defaults
  // when the array is empty.
  const firstActive = <T extends AnyInstance>(arr: readonly T[]): T | undefined =>
    arr.find(i => i.status !== 'surrendered') ?? arr[0]

  const bavInst = firstActive(wsa.bav)
  const etfInst = firstActive(wsa.etf)
  const insuranceInst = firstActive(wsa.insurance)
  const basisrenteInst = firstActive(wsa.basisrente)
  const avdInst = firstActive(wsa.altersvorsorgedepot)
  const riesterInst = firstActive(wsa.riester)

  // For each populated slot, project. For empty slots, use the supplied default.
  // We compose by projecting one instance, then overwriting the other slots.
  const slotProjection = (
    inst: AnyInstance | undefined,
  ): Partial<ScenarioAssumptions> => {
    if (!inst) return {}
    const projected = projectInstanceToScenarioAssumptions(inst, wsa)
    // Pick only the active slot from the projection; the others were neutralised.
    const slot = detectProductSlot(inst)
    return { [slot]: projected[slot] } as Partial<ScenarioAssumptions>
  }

  return {
    inflationRate: wsa.inflationRate,
    retirementEndAge: wsa.retirementEndAge,
    returnScenarios: wsa.returnScenarios,
    monteCarlo: wsa.monteCarlo,
    visibleProducts: wsa.visibleProducts,
    statutoryPension: wsa.statutoryPension,
    bav: defaultsForEmptySlots.bav,
    etf: defaultsForEmptySlots.etf,
    insurance: defaultsForEmptySlots.insurance,
    basisrente: defaultsForEmptySlots.basisrente,
    altersvorsorgedepot: defaultsForEmptySlots.altersvorsorgedepot,
    riester: defaultsForEmptySlots.riester,
    ...slotProjection(bavInst),
    ...slotProjection(etfInst),
    ...slotProjection(insuranceInst),
    ...slotProjection(basisrenteInst),
    ...slotProjection(avdInst),
    ...slotProjection(riesterInst),
  }
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
      const outArr = outboundBy.get(ev.sourceInstanceId) ?? []
      outArr.push(ev)
      outboundBy.set(ev.sourceInstanceId, outArr)
      const inArr = inboundBy.get(ev.targetInstanceId) ?? []
      inArr.push(ev)
      inboundBy.set(ev.targetInstanceId, inArr)
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

  // Issue 15 — collect all transfer events once so per-instance lookup is O(1).
  const { outboundBy, inboundBy } = collectTransferEvents(wsa)

  const runFor = <T extends AnyInstance>(
    instances: readonly T[],
    productSimulate: (ctx: ReturnType<typeof buildContext>, scenario: ReturnScenario) => ProductResult,
    fundingOverrideFor: (instance: T) => BuildContextOverrides,
  ) => {
    for (const inst of instances) {
      if (inst.status === 'surrendered') continue
      const projected = projectInstanceToScenarioAssumptions(inst, wsa)
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
  runFor(wsa.etf, simulateEtf, (inst) => ({
    etfMonthlyUserCostOverride: inst.monthlyContribution,
  }))
  runFor(wsa.insurance, simulateInsurance, () => ({}))
  runFor(wsa.basisrente, simulateBasisrente, (inst) => ({
    basisrenteFundingOverride: portfolioFunding.basisrenteByInstanceId[inst.instanceId],
  }))
  runFor(wsa.altersvorsorgedepot, simulateAvd, (inst) => ({
    altersvorsorgedepotFundingOverride: portfolioFunding.altersvorsorgedepotByInstanceId[inst.instanceId],
  }))
  runFor(wsa.riester, simulateRiester, (inst) => ({
    riesterFundingOverride: portfolioFunding.riesterByInstanceId[inst.instanceId],
  }))

  return { perInstance, portfolioFunding }
}
