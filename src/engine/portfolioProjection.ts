/**
 * PortfolioProjection — instance-to-singleton projection helpers.
 *
 * Extracted from portfolioAdapter.ts (architecture-readability issue 03).
 *
 * This module owns the mapping from portfolio instances to singleton-shaped
 * `ScenarioAssumptions`, including:
 *  - Neutralised product defaults (zero-contribution baselines for all six
 *    product slots so inactive slots cannot pollute funding pre-passes).
 *  - Product-slot detection (prefix-based + structural fallback).
 *  - `InstanceCommon` key stripping (engine ignores unknown fields; stripping
 *    keeps oracle-golden round-trips stable).
 *  - Paid-up projection overrides and phase-2 fee model construction.
 *  - `projectInstanceToScenarioAssumptions` — the core projection primitive.
 *  - `singletonViewOfWorkspace` — compare-mode bridge used by storage.ts.
 *
 * Funding aggregation (cross-instance bAV / Basisrente / Riester / AVD caps)
 * lives in `portfolioFunding.ts`.
 * Transfer / capital policy lives in `portfolioTransfer.ts`.
 */

import type {
  AltersvorsorgedepotAssumptions,
  BasisrenteAssumptions,
  BavAssumptions,
  EtfAssumptions,
  FeeModel,
  InsuranceAssumptions,
  RiesterAssumptions,
  ScenarioAssumptions,
} from '../domain'
import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type {
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  BavInstance,
  EtfInstance,
  InstanceCommon,
  InsuranceInstance,
  RiesterInstance,
} from '../domain/instances'
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
// Paid-up fee model (projection-time phase-2 fee stripping)
// ---------------------------------------------------------------------------
//
// When an instance has `status === 'paid_up'`, contributions stop and the
// contract switches to a "phase-2" fee model: only ongoing wrapper / fund /
// pension-payout fees continue; acquisition costs, contribution fees, and
// fixed monthly admin fees are zeroed. This mirrors the existing
// `paidUpScenario` precedent inside `src/engine/products/insurance.ts` —
// applied here uniformly across the other 4 simulators (bAV, Basisrente,
// AVD, Riester) at the adapter layer so per-product simulators stay
// untouched.
//
// Schema decision: there is no `paidUpSince` field on `InstanceCommon` today.
// We treat `status === 'paid_up'` as start-from-year-0 (the entire
// accumulation phase is paid-up). The instance's `currentValueEUR` is then
// injected as `initialCapital` via `instanceCapitalPolicy`, so the contract
// continues to grow the existing balance under phase-2 fees with zero
// contributions.
//
// Out of scope (per spec): per-month paid-up date precision; Riester subsidy
// clawback. State allowances simply stop accruing (no new Zulage); existing
// capital continues to grow.

/** Strip acquisition / contribution / fixed-admin fees for paid-up phase 2. */
export function paidUpFeeModel(fees: FeeModel): FeeModel {
  return {
    wrapperAssetFee: fees.wrapperAssetFee,
    fundAssetFee: fees.fundAssetFee,
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 1,
    pensionPayoutFeePct: fees.pensionPayoutFeePct,
  }
}

// ---------------------------------------------------------------------------
// `InstanceCommon` strip helper
// ---------------------------------------------------------------------------

/**
 * The fields added by `InstanceCommon` that the engine does not read. They
 * still get spread onto the projected singleton (the engine ignores unknown
 * fields), but tests / consumers that compare the projection to the original
 * singleton can use this list to drop them.
 */
export const INSTANCE_COMMON_KEYS = [
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

export function stripInstanceCommonKeys<T extends Record<string, unknown>>(
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
// Product slot type and helpers
// ---------------------------------------------------------------------------

export type ProductSlot = 'bav' | 'etf' | 'insurance' | 'basisrente' | 'altersvorsorgedepot' | 'riester'

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
export function detectProductSlot(instance: AnyInstance): ProductSlot {
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
  throw new Error(`portfolioProjection: cannot detect product slot for instance ${id}`)
}

export function slotToProductId(slot: ProductSlot): ProductId {
  switch (slot) {
    case 'etf': return 'etf'
    case 'bav': return 'bav'
    case 'insurance': return 'versicherung'
    case 'basisrente': return 'basisrente'
    case 'altersvorsorgedepot': return 'altersvorsorgedepot'
    case 'riester': return 'riester'
  }
}

// ---------------------------------------------------------------------------
// Paid-up projection overrides
// ---------------------------------------------------------------------------

/**
 * For paid-up instances: rewrite the active product slot in a projected
 * `ScenarioAssumptions` so it uses the phase-2 fee model and cannot resume
 * contributions through a simulator-level yearly contribution policy.
 */
export function applyPaidUpOverridesToProjection(
  projected: ScenarioAssumptions,
  slot: ProductSlot,
): ScenarioAssumptions {
  switch (slot) {
    case 'bav':
      return {
        ...projected,
        bav: {
          ...projected.bav,
          monthlyGrossConversion: 0,
          statutoryMinimumSubsidyEnabled: false,
          contractualMatchPercent: 0,
          contractualFixedMonthly: 0,
          annualContributionGrowthRate: 0,
          fees: paidUpFeeModel(projected.bav.fees),
        },
      }
    case 'insurance':
      return {
        ...projected,
        insurance: {
          ...projected.insurance,
          annualContributionGrowthRate: 0,
          fees: paidUpFeeModel(projected.insurance.fees),
        },
      }
    case 'basisrente':
      return {
        ...projected,
        basisrente: {
          ...projected.basisrente,
          monthlyGrossContribution: 0,
          fees: paidUpFeeModel(projected.basisrente.fees),
        },
      }
    case 'altersvorsorgedepot':
      return {
        ...projected,
        altersvorsorgedepot: {
          ...projected.altersvorsorgedepot,
          monthlyOwnContribution: 0,
          eligibility: {
            ...projected.altersvorsorgedepot.eligibility,
            directlyEligible: false,
            indirectSpouseEligible: false,
            eligibleChildren: 0,
            careerStarterBonusUsed: true,
          },
          fees: paidUpFeeModel(projected.altersvorsorgedepot.fees),
        },
      }
    case 'riester':
      return {
        ...projected,
        riester: {
          ...projected.riester,
          monthlyOwnContribution: 0,
          eligibility: {
            ...projected.riester.eligibility,
            directlyEligible: false,
            indirectSpouseEligible: false,
            careerStarterBonusUsed: true,
          },
          fees: paidUpFeeModel(projected.riester.fees),
        },
      }
    default:
      return projected
  }
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
 * `currentValueEUR` mapping:
 *   - Riester: maps to `existingCapital` on the projected singleton.
 *   - AVD: maps to `riesterTransferCapital` on the projected singleton.
 *   - ETF, bAV, pAV, Basisrente: not mapped here; injected as `initialCapital`
 *     via `buildInstanceCapitalPolicy` in `portfolioTransfer.ts` instead.
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
// `singletonViewOfWorkspace`
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
    arr.find(i => i.status === 'active' || i.status === 'paid_up')

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
    // Issue 16 — round-trip the compare-mode sub-mode through the singleton
    // projection. Undefined → callers get today's `equal_cash` behaviour.
    compareSubMode: wsa.compareSubMode,
    equalInputAmountEUR: wsa.equalInputAmountEUR,
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
