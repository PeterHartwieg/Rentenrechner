/**
 * Inventory product registry (architecture-readability issue 09).
 *
 * Centralises per-product inventory metadata, default-draft construction, and
 * draft-to-instance conversion so wizard, sidebar, and workspace mutation code
 * all share one definition per product.
 *
 * Design mirrors the engine-side `PRODUCT_REGISTRY` (`src/engine/productRegistry.ts`)
 * but lives in the features layer because it depends on UI-layer draft types and
 * `defaultAssumptions` (data layer).
 *
 * This module is React-free and does not import from `workspaceIdentity.ts` or
 * `portfolioState.ts`.  ID generation is injected via the `makeId` parameter so
 * callers can provide their own `newInstanceId` without creating a cycle.
 *
 * Public surface:
 *   - InventoryProductEntry<D, I> — per-product registry shape
 *   - MultiInstanceProductId — union of supported product ids
 *   - INVENTORY_PRODUCT_REGISTRY — the registry Record
 *   - getInventoryProductEntry(productId) — safe lookup helper
 *
 * Consumers:
 *   - workspaceIdentity.ts — collapses addInstanceToWorkspace switch via
 *     entry.createDefault(year, n, makeId)
 *   - inventoryHelpers.ts — draft-to-instance converters can delegate to
 *     entry.draftToInstance(draft, makeId)
 *   - inventoryProductRegistry.test.ts — registry coverage tests
 */

import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../../domain/instances'
import type { WorkspaceAssumptionsV2 } from '../../domain/workspace'
import type {
  BavDraft,
  PavDraft,
  RiesterDraft,
  BasisrenteDraft,
  AvdDraft,
  EtfDraft,
  AnyProductDraft,
} from './types'
import { defaultAssumptions } from '../../data/defaultScenario'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Product ids that support multiple instances (GRV is singleton). */
export type MultiInstanceProductId =
  | 'bav'
  | 'versicherung'
  | 'riester'
  | 'basisrente'
  | 'altersvorsorgedepot'
  | 'etf'

/**
 * The instance-array key on `WorkspaceAssumptionsV2` for a given product.
 * 'versicherung' maps to 'insurance'; all others map directly.
 */
export type WorkspaceArrayKey<P extends MultiInstanceProductId> =
  P extends 'versicherung' ? 'insurance' : P

/** Instance type indexed by product id. */
export type InstanceTypeFor<P extends MultiInstanceProductId> =
  P extends 'bav' ? BavInstance
  : P extends 'versicherung' ? InsuranceInstance
  : P extends 'riester' ? RiesterInstance
  : P extends 'basisrente' ? BasisrenteInstance
  : P extends 'altersvorsorgedepot' ? AltersvorsorgedepotInstance
  : P extends 'etf' ? EtfInstance
  : never

/** Draft type indexed by product id. */
export type DraftTypeFor<P extends MultiInstanceProductId> =
  P extends 'bav' ? BavDraft
  : P extends 'versicherung' ? PavDraft
  : P extends 'riester' ? RiesterDraft
  : P extends 'basisrente' ? BasisrenteDraft
  : P extends 'altersvorsorgedepot' ? AvdDraft
  : P extends 'etf' ? EtfDraft
  : never

/**
 * Per-product inventory registry entry.
 *
 * @template P - product id literal
 * @template I - instance type
 * @template D - draft type (for draftToInstance converter)
 */
export interface InventoryProductEntry<
  P extends MultiInstanceProductId = MultiInstanceProductId,
  I = InstanceTypeFor<P>,
  D = DraftTypeFor<P>,
> {
  /** Product id matching `MultiInstanceProductId`. */
  readonly id: P
  /** Human-readable display name used in UI labels and "Add" buttons. */
  readonly displayName: string
  /** Workspace assumptions array key (differs for 'versicherung' → 'insurance'). */
  readonly wsKey: keyof WorkspaceAssumptionsV2
  /**
   * Derive a label fallback for an instance.  Called when no user-provided
   * label is available.  `n` is the 1-based disambiguator count.
   */
  readonly labelFallback: (n: number, anbieter?: string) => string
  /**
   * Build a default instance for the "add" flow.
   *
   * @param contractYear  The current year used as contractStartYear.
   * @param n             1-based count in the workspace array (used for label).
   * @param makeId        Instance-id factory injected to avoid import cycles.
   */
  readonly createDefault: (contractYear: number, n: number, makeId: (productId: string) => string) => I
  /**
   * Convert a wizard draft to a domain instance.  Used by `*DraftToInstance`
   * functions in `inventoryHelpers.ts` after the registry refactor.
   *
   * @param draft   The wizard/sidebar draft.
   * @param makeId  Instance-id factory injected to avoid import cycles.
   */
  readonly draftToInstance: (draft: D, makeId: (productId: string) => string) => I
}

// ---------------------------------------------------------------------------
// Registry entries
// ---------------------------------------------------------------------------

const bavEntry: InventoryProductEntry<'bav', BavInstance, BavDraft> = {
  id: 'bav',
  displayName: 'Betriebliche Altersversorgung',
  wsKey: 'bav',
  labelFallback: (n, anbieter) => (anbieter ? `bAV – ${anbieter}` : `bAV #${n}`),
  createDefault: (contractYear, n, makeId) => ({
    instanceId: makeId('bav'),
    label: `bAV #${n}`,
    status: 'active',
    contractStartYear: contractYear,
    currentValueEUR: 0,
    evidenceMap: {},
    ownedBy: 'self',
    monthlyGrossConversion: 200,
    statutoryMinimumSubsidyEnabled: defaultAssumptions.bav.statutoryMinimumSubsidyEnabled,
    contractualMatchPercent: defaultAssumptions.bav.contractualMatchPercent,
    contractualFixedMonthly: defaultAssumptions.bav.contractualFixedMonthly,
    fees: {
      ...defaultAssumptions.bav.fees,
      wrapperAssetFee: 0.008,
      fundAssetFee: 0,
    },
    monthlyOtherRetirementIncome: defaultAssumptions.bav.monthlyOtherRetirementIncome,
    includeGrvReduction: defaultAssumptions.bav.includeGrvReduction,
    kvdrMember: defaultAssumptions.bav.kvdrMember,
    durchfuehrungsweg: 'direktversicherung_3_63',
    pre2005EligibleTaxFree: defaultAssumptions.bav.pre2005EligibleTaxFree,
    payoutMode: 'leibrente',
    rentenfaktor: 30,
    rentenfaktorConfirmed: false,
    zeitrenteYears: defaultAssumptions.bav.zeitrenteYears,
    annualContributionGrowthRate: 0,
  }),
  draftToInstance: (d, makeId) => ({
    instanceId: makeId('bav'),
    label: d.anbieter ? `bAV – ${d.anbieter}` : 'bAV',
    anbieter: d.anbieter,
    status: d.status,
    contractStartYear: d.contractStartYear,
    currentValueEUR: d.currentValueEUR ?? 0,
    evidenceMap: d.evidenceMap ?? {},
    ownedBy: 'self',
    monthlyGrossConversion: d.monthlyContribution,
    statutoryMinimumSubsidyEnabled: defaultAssumptions.bav.statutoryMinimumSubsidyEnabled,
    contractualMatchPercent: defaultAssumptions.bav.contractualMatchPercent,
    contractualFixedMonthly: defaultAssumptions.bav.contractualFixedMonthly,
    fees: {
      ...defaultAssumptions.bav.fees,
      wrapperAssetFee: d.effektivkostenPct / 100,
      fundAssetFee: 0,
      ...(d.feeDetails ?? {}),
    },
    monthlyOtherRetirementIncome: defaultAssumptions.bav.monthlyOtherRetirementIncome,
    includeGrvReduction: defaultAssumptions.bav.includeGrvReduction,
    kvdrMember: defaultAssumptions.bav.kvdrMember,
    durchfuehrungsweg: d.durchfuehrungsweg,
    pre2005EligibleTaxFree: defaultAssumptions.bav.pre2005EligibleTaxFree,
    payoutMode: d.payoutMode,
    rentenfaktor: d.rentenfaktor,
    rentenfaktorConfirmed: false,
    zeitrenteYears: defaultAssumptions.bav.zeitrenteYears,
    annualContributionGrowthRate: 0,
  }),
}

const versicherungEntry: InventoryProductEntry<'versicherung', InsuranceInstance, PavDraft> = {
  id: 'versicherung',
  displayName: 'Private Rentenversicherung',
  wsKey: 'insurance',
  labelFallback: (n, anbieter) => (anbieter ? `pAV – ${anbieter}` : `pAV #${n}`),
  createDefault: (contractYear, n, makeId) => ({
    instanceId: makeId('versicherung'),
    label: `pAV #${n}`,
    status: 'active',
    contractStartYear: contractYear,
    currentValueEUR: 0,
    evidenceMap: {},
    ownedBy: 'self',
    monthlyContribution: 100,
    oldContractTaxFreeEligible: false,
    monthlyOtherRetirementIncome: 0,
    capitalGuarantee: defaultAssumptions.insurance.capitalGuarantee,
    fees: {
      ...defaultAssumptions.insurance.fees,
      wrapperAssetFee: 0.008,
      fundAssetFee: 0,
    },
    payoutMode: 'leibrente',
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    zeitrenteYears: defaultAssumptions.insurance.zeitrenteYears,
    surrenderHaircutPct: 0,
    annualContributionGrowthRate: 0,
  }),
  draftToInstance: (d, makeId) => ({
    instanceId: makeId('versicherung'),
    label: d.anbieter ? `pAV – ${d.anbieter}` : 'Private Rentenversicherung',
    anbieter: d.anbieter,
    status: d.status,
    contractStartYear: d.contractStartYear,
    currentValueEUR: d.currentValueEUR ?? 0,
    evidenceMap: d.evidenceMap ?? {},
    ownedBy: 'self',
    monthlyContribution: d.monthlyContribution,
    oldContractTaxFreeEligible: d.contractStartYear <= 2004,
    monthlyOtherRetirementIncome: 0,
    capitalGuarantee: defaultAssumptions.insurance.capitalGuarantee,
    fees: {
      ...defaultAssumptions.insurance.fees,
      wrapperAssetFee: d.effektivkostenPct / 100,
      fundAssetFee: 0,
      ...(d.feeDetails ?? {}),
    },
    payoutMode: d.payoutMode,
    rentenfaktor: d.rentenfaktor,
    rentenfaktorConfirmed: false,
    zeitrenteYears: defaultAssumptions.insurance.zeitrenteYears,
    surrenderHaircutPct: 0,
    annualContributionGrowthRate: 0,
  }),
}

const riesterEntry: InventoryProductEntry<'riester', RiesterInstance, RiesterDraft> = {
  id: 'riester',
  displayName: 'Riester-Rente',
  wsKey: 'riester',
  labelFallback: (n, anbieter) => (anbieter ? `Riester – ${anbieter}` : `Riester #${n}`),
  createDefault: (contractYear, n, makeId) => ({
    instanceId: makeId('riester'),
    label: `Riester #${n}`,
    status: 'active',
    contractStartYear: contractYear,
    currentValueEUR: 0,
    evidenceMap: {},
    ownedBy: 'self',
    monthlyOwnContribution: 100,
    existingCapital: 0,
    eligibility: {
      directlyEligible: true,
      ageAtContractStart: 28,
      careerStarterBonusUsed: false,
    },
    capitalGuarantee: defaultAssumptions.riester.capitalGuarantee,
    fees: defaultAssumptions.riester.fees,
    payoutMode: 'leibrente',
    rentenfaktor: defaultAssumptions.riester.rentenfaktor,
    rentenfaktorConfirmed: false,
    zeitrenteYears: defaultAssumptions.riester.zeitrenteYears,
    partialCapitalPct: 0,
    monthlyOtherRetirementIncome: 0,
  }),
  draftToInstance: (d, makeId) => ({
    instanceId: makeId('riester'),
    label: d.anbieter ? `Riester – ${d.anbieter}` : 'Riester-Rente',
    anbieter: d.anbieter,
    status: d.status,
    contractStartYear: d.contractStartYear,
    currentValueEUR: d.currentValueEUR ?? 0,
    evidenceMap: d.evidenceMap ?? {},
    ownedBy: 'self',
    monthlyOwnContribution: d.monthlyContribution,
    existingCapital: d.currentValueEUR ?? 0,
    eligibility: {
      directlyEligible: true,
      ageAtContractStart: 28,
      careerStarterBonusUsed: false,
    },
    capitalGuarantee: defaultAssumptions.riester.capitalGuarantee,
    fees: defaultAssumptions.riester.fees,
    payoutMode: d.payoutMode,
    rentenfaktor: defaultAssumptions.riester.rentenfaktor,
    rentenfaktorConfirmed: false,
    zeitrenteYears: defaultAssumptions.riester.zeitrenteYears,
    partialCapitalPct: 0,
    monthlyOtherRetirementIncome: 0,
  }),
}

const basisrenteEntry: InventoryProductEntry<'basisrente', BasisrenteInstance, BasisrenteDraft> = {
  id: 'basisrente',
  displayName: 'Basisrente',
  wsKey: 'basisrente',
  labelFallback: (n, anbieter) => (anbieter ? `Basisrente – ${anbieter}` : `Basisrente #${n}`),
  createDefault: (contractYear, n, makeId) => ({
    instanceId: makeId('basisrente'),
    label: `Basisrente #${n}`,
    status: 'active',
    contractStartYear: contractYear,
    currentValueEUR: 0,
    evidenceMap: {},
    ownedBy: 'self',
    monthlyGrossContribution: 200,
    fees: {
      ...defaultAssumptions.basisrente.fees,
      wrapperAssetFee: 0.008,
      fundAssetFee: 0,
    },
    payoutMode: 'leibrente',
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
  }),
  draftToInstance: (d, makeId) => ({
    instanceId: makeId('basisrente'),
    label: d.anbieter ? `Basisrente – ${d.anbieter}` : 'Basisrente',
    anbieter: d.anbieter,
    status: d.status,
    contractStartYear: d.contractStartYear,
    currentValueEUR: d.currentValueEUR ?? 0,
    evidenceMap: d.evidenceMap ?? {},
    ownedBy: 'self',
    monthlyGrossContribution: d.monthlyContribution,
    fees: {
      ...defaultAssumptions.basisrente.fees,
      wrapperAssetFee: d.effektivkostenPct / 100,
      fundAssetFee: 0,
      ...(d.feeDetails ?? {}),
    },
    // Basisrente capital payout is legally prohibited: only leibrente.
    payoutMode: 'leibrente',
    rentenfaktor: d.rentenfaktor,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
  }),
}

const altersvorsorgedepotEntry: InventoryProductEntry<
  'altersvorsorgedepot',
  AltersvorsorgedepotInstance,
  AvdDraft
> = {
  id: 'altersvorsorgedepot',
  displayName: 'Altersvorsorgedepot',
  wsKey: 'altersvorsorgedepot',
  labelFallback: (n, anbieter) => (anbieter ? `AVD – ${anbieter}` : `AVD #${n}`),
  createDefault: (contractYear, n, makeId) => ({
    instanceId: makeId('altersvorsorgedepot'),
    label: `AVD #${n}`,
    status: 'active',
    contractStartYear: contractYear,
    currentValueEUR: 0,
    evidenceMap: {},
    ownedBy: 'self',
    subtype: 'standarddepot',
    monthlyOwnContribution: 200,
    eligibility: defaultAssumptions.altersvorsorgedepot.eligibility,
    riskAllocationPct: defaultAssumptions.altersvorsorgedepot.riskAllocationPct,
    riskAnnualReturn: defaultAssumptions.altersvorsorgedepot.riskAnnualReturn,
    lowRiskAnnualReturn: defaultAssumptions.altersvorsorgedepot.lowRiskAnnualReturn,
    fees: defaultAssumptions.altersvorsorgedepot.fees,
    payoutMode: defaultAssumptions.altersvorsorgedepot.payoutMode,
    payoutPlanEndAge: defaultAssumptions.altersvorsorgedepot.payoutPlanEndAge,
    partialCapitalPct: 0,
    transferCostEUR: 0,
    riesterTransferCapital: 0,
    monthlyOtherRetirementIncome: 0,
    rentenfaktor: defaultAssumptions.altersvorsorgedepot.rentenfaktor,
  }),
  draftToInstance: (d, makeId) => ({
    instanceId: makeId('altersvorsorgedepot'),
    label: d.anbieter ? `AVD – ${d.anbieter}` : 'Altersvorsorgedepot',
    anbieter: d.anbieter,
    status: d.status,
    contractStartYear: d.contractStartYear,
    currentValueEUR: d.currentValueEUR ?? 0,
    evidenceMap: d.evidenceMap ?? {},
    ownedBy: 'self',
    subtype: d.subtype,
    monthlyOwnContribution: d.monthlyContribution,
    eligibility: defaultAssumptions.altersvorsorgedepot.eligibility,
    // When glidepath is disabled, use 100 % risk allocation (user override).
    riskAllocationPct: d.useGlidepath
      ? defaultAssumptions.altersvorsorgedepot.riskAllocationPct
      : 1.0,
    riskAnnualReturn: defaultAssumptions.altersvorsorgedepot.riskAnnualReturn,
    lowRiskAnnualReturn: defaultAssumptions.altersvorsorgedepot.lowRiskAnnualReturn,
    fees: defaultAssumptions.altersvorsorgedepot.fees,
    payoutMode: defaultAssumptions.altersvorsorgedepot.payoutMode,
    payoutPlanEndAge: defaultAssumptions.altersvorsorgedepot.payoutPlanEndAge,
    partialCapitalPct: 0,
    transferCostEUR: 0,
    riesterTransferCapital: 0,
    monthlyOtherRetirementIncome: 0,
    rentenfaktor: defaultAssumptions.altersvorsorgedepot.rentenfaktor,
  }),
}

const etfEntry: InventoryProductEntry<'etf', EtfInstance, EtfDraft> = {
  id: 'etf',
  displayName: 'ETF-Depot',
  wsKey: 'etf',
  labelFallback: (n, anbieter) => (anbieter ? `ETF – ${anbieter}` : `ETF #${n}`),
  createDefault: (contractYear, n, makeId) => ({
    instanceId: makeId('etf'),
    label: `ETF #${n}`,
    status: 'active',
    contractStartYear: contractYear,
    currentValueEUR: 0,
    evidenceMap: {},
    ownedBy: 'self',
    monthlyContribution: 200,
    annualAssetFee: 0.002,
    equityPartialExemption: defaultAssumptions.etf.equityPartialExemption,
    annualContributionGrowthRate: 0,
  }),
  draftToInstance: (d, makeId) => ({
    instanceId: makeId('etf'),
    label: d.anbieter ? `ETF – ${d.anbieter}` : 'ETF-Depot',
    anbieter: d.anbieter,
    status: d.status,
    contractStartYear: d.contractStartYear,
    currentValueEUR: d.currentValueEUR ?? 0,
    evidenceMap: d.evidenceMap ?? {},
    ownedBy: 'self',
    monthlyContribution: d.monthlyContribution,
    annualAssetFee: d.terPct / 100,
    equityPartialExemption: defaultAssumptions.etf.equityPartialExemption,
    annualContributionGrowthRate: Math.max(0, d.annualContributionGrowthRate ?? 0),
  }),
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Registry of all multi-instance inventory products keyed by product id.
 *
 * Use this to centralise product-level routing: add/remove, draft conversion,
 * label fallback, and display name.  Do not add product switches elsewhere.
 */
export const INVENTORY_PRODUCT_REGISTRY: {
  [P in MultiInstanceProductId]: InventoryProductEntry<P>
} = {
  bav: bavEntry as InventoryProductEntry<'bav'>,
  versicherung: versicherungEntry as InventoryProductEntry<'versicherung'>,
  riester: riesterEntry as InventoryProductEntry<'riester'>,
  basisrente: basisrenteEntry as InventoryProductEntry<'basisrente'>,
  altersvorsorgedepot: altersvorsorgedepotEntry as InventoryProductEntry<'altersvorsorgedepot'>,
  etf: etfEntry as InventoryProductEntry<'etf'>,
} as const

/**
 * Safe lookup helper.  Returns the registry entry for `productId`, or
 * `undefined` if the id is not registered.
 */
export function getInventoryProductEntry(
  productId: string,
): InventoryProductEntry | undefined {
  return (INVENTORY_PRODUCT_REGISTRY as Record<string, InventoryProductEntry>)[productId]
}

/**
 * Convert any product draft to its domain instance using the registry.
 *
 * @param draft   A wizard/sidebar draft (must have a `productId` field matching
 *                a registered `MultiInstanceProductId`).
 * @param makeId  Instance-id factory (typically `newInstanceId` from
 *                `workspaceIdentity.ts`).
 */
export function draftToInstance(
  draft: AnyProductDraft,
  makeId: (productId: string) => string,
): BavInstance | InsuranceInstance | RiesterInstance | BasisrenteInstance | AltersvorsorgedepotInstance | EtfInstance {
  const entry = getInventoryProductEntry(draft.productId)
  if (!entry) {
    throw new Error(`inventoryProductRegistry: unknown productId "${draft.productId}"`)
  }
  // The cast is safe: each entry's draftToInstance only accepts its own draft
  // type, and we key the lookup by productId which is set on the draft.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return entry.draftToInstance(draft as any, makeId)
}
