/**
 * Pure helper functions for the InventoryWizard — separated from the React
 * component files to satisfy the react-refresh/only-export-components rule.
 *
 * Consumers:
 *  - InventoryWizard.tsx (buildWorkspaceFromDraft, addInstanceDraft, removeInstanceDraft)
 *  - InstanceCard.tsx (estimateEpFromYears)
 *  - InventoryWizard.test.ts (both)
 *  - portfolioState addInstance/removeInstance (uses domain types)
 */

import type { Workspace, Scenario, WorkspaceAssumptionsV2 } from '../../domain/workspace'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../../domain/instances'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { defaultWorkspace } from '../../storage'
import { newScenarioId } from '../../app/portfolioState'
import type {
  GrvDraft,
  BavDraft,
  PavDraft,
  RiesterDraft,
  BasisrenteDraft,
  AvdDraft,
  EtfDraft,
  PersonalDetailsDraft,
} from './types'

// ---------------------------------------------------------------------------
// EP estimation (same formula as GuidedSetup + engine)
// ---------------------------------------------------------------------------

/**
 * Estimate Entgeltpunkte from years worked × current gross salary.
 * EP/year = min(salary, BBG) / Durchschnittsentgelt
 * Uses 2026 statutory values (de2026.ts: pensionCapYear = 101_400,
 * durchschnittsentgelt = 47_079). Consistent with GuidedSetup.tsx.
 */
export function estimateEpFromYears(years: number, grossSalaryYear: number): number {
  if (!Number.isFinite(years) || years <= 0) return 0
  if (!Number.isFinite(grossSalaryYear) || grossSalaryYear <= 0) return 0
  const BBG = 101_400
  const DURCHSCHNITTSENTGELT = 47_079
  const cappedSalary = Math.min(grossSalaryYear, BBG)
  return DURCHSCHNITTSENTGELT > 0
    ? Math.max(0, years * (cappedSalary / DURCHSCHNITTSENTGELT))
    : 0
}

// ---------------------------------------------------------------------------
// Draft → domain instance converters
// ---------------------------------------------------------------------------

export function bavDraftToInstance(d: BavDraft): BavInstance {
  return {
    instanceId: `bav-${Math.random().toString(36).slice(2, 10)}`,
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
      // Layer 1 captures Effektivkosten as a single "all-in" rate stored as
      // wrapperAssetFee; fundAssetFee stays 0. The engine sums both for drag.
      wrapperAssetFee: d.effektivkostenPct / 100,
      fundAssetFee: 0,
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
  }
}

export function pavDraftToInstance(d: PavDraft): InsuranceInstance {
  return {
    instanceId: `versicherung-${Math.random().toString(36).slice(2, 10)}`,
    label: d.anbieter ? `pAV – ${d.anbieter}` : 'Private Rentenversicherung',
    anbieter: d.anbieter,
    status: d.status,
    contractStartYear: d.contractStartYear,
    currentValueEUR: d.currentValueEUR ?? 0,
    evidenceMap: d.evidenceMap ?? {},
    ownedBy: 'self',
    // InsuranceAssumptions (contractStartYear is also on InstanceCommon)
    oldContractTaxFreeEligible: d.contractStartYear <= 2004,
    monthlyOtherRetirementIncome: 0,
    capitalGuarantee: defaultAssumptions.insurance.capitalGuarantee,
    fees: {
      ...defaultAssumptions.insurance.fees,
      wrapperAssetFee: d.effektivkostenPct / 100,
      fundAssetFee: 0,
    },
    payoutMode: d.payoutMode,
    rentenfaktor: d.rentenfaktor,
    rentenfaktorConfirmed: false,
    zeitrenteYears: defaultAssumptions.insurance.zeitrenteYears,
    surrenderHaircutPct: 0,
    annualContributionGrowthRate: 0,
  }
}

export function riesterDraftToInstance(d: RiesterDraft): RiesterInstance {
  return {
    instanceId: `riester-${Math.random().toString(36).slice(2, 10)}`,
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
  }
}

export function basisrenteDraftToInstance(d: BasisrenteDraft): BasisrenteInstance {
  return {
    instanceId: `basisrente-${Math.random().toString(36).slice(2, 10)}`,
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
    },
    payoutMode: 'leibrente',
    rentenfaktor: d.rentenfaktor,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
  }
}

export function avdDraftToInstance(d: AvdDraft): AltersvorsorgedepotInstance {
  return {
    instanceId: `altersvorsorgedepot-${Math.random().toString(36).slice(2, 10)}`,
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
    // When glidepath is disabled, use 100% risk allocation (user override).
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
  }
}

export function etfDraftToInstance(d: EtfDraft): EtfInstance {
  return {
    instanceId: `etf-${Math.random().toString(36).slice(2, 10)}`,
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
    annualContributionGrowthRate: 0,
  }
}

// ---------------------------------------------------------------------------
// Build a v2 Workspace from wizard draft state
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Instance-id generation (format: ${productId}-${random8})
// ---------------------------------------------------------------------------

/**
 * Generate a new stable instance id matching the documented format
 * `${productId}-${random8}` (e.g. `bav-7f2a91c4`).
 *
 * Issue 05 used the same Math.random().toString(36) approach inline in each
 * converter. This helper centralises the pattern so the format is easy to
 * audit and update.
 */
export function newInstanceId(productId: string): string {
  return `${productId}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------------------------------------------------------------------------
// Pure workspace mutations for addInstance / removeInstance
// (consumed by portfolioState + wizard draft state)
// ---------------------------------------------------------------------------

/**
 * Add a new default instance of the given product type to the baseline
 * assumptions of the supplied workspace. Returns a new workspace without
 * mutating the original.
 *
 * productId must be one of the per-product instance array keys on
 * WorkspaceAssumptionsV2. GRV stays singleton and is not in scope.
 *
 * The new instance is built from the same defaults as the wizard's first
 * instance, with a disambiguating label suffix "#N" where N is the count
 * after adding.
 */
export function addInstanceToWorkspace(
  workspace: Workspace,
  productId: 'bav' | 'versicherung' | 'riester' | 'basisrente' | 'altersvorsorgedepot' | 'etf',
): Workspace {
  const wsa = workspace.baseline.assumptions
  const CURRENT_YEAR = new Date().getFullYear()

  let updated: WorkspaceAssumptionsV2

  switch (productId) {
    case 'bav': {
      const n = wsa.bav.length + 1
      const newInst = bavDraftToInstance({
        productId: 'bav',
        status: 'active',
        contractStartYear: CURRENT_YEAR,
        currentValueEUR: 0,
        monthlyContribution: 200,
        anbieter: undefined,
        durchfuehrungsweg: 'direktversicherung_3_63',
        effektivkostenPct: 0.8, // default to typical all-in cost
        rentenfaktor: 30,
        payoutMode: 'leibrente',
      })
      updated = { ...wsa, bav: [...wsa.bav, { ...newInst, label: `bAV #${n}`, instanceId: newInstanceId('bav') }] }
      break
    }
    case 'versicherung': {
      const n = wsa.insurance.length + 1
      const newInst = pavDraftToInstance({
        productId: 'versicherung',
        status: 'active',
        contractStartYear: CURRENT_YEAR,
        currentValueEUR: 0,
        monthlyContribution: 100,
        anbieter: undefined,
        effektivkostenPct: 0.8, // default to typical all-in cost
        rentenfaktor: 28,
        payoutMode: 'leibrente',
      })
      updated = { ...wsa, insurance: [...wsa.insurance, { ...newInst, label: `pAV #${n}`, instanceId: newInstanceId('versicherung') }] }
      break
    }
    case 'riester': {
      const n = wsa.riester.length + 1
      const newInst = riesterDraftToInstance({
        productId: 'riester',
        status: 'active',
        contractStartYear: CURRENT_YEAR,
        currentValueEUR: 0,
        monthlyContribution: 100,
        anbieter: undefined,
        payoutMode: 'leibrente',
        zulageStatus: '',
      })
      updated = { ...wsa, riester: [...wsa.riester, { ...newInst, label: `Riester #${n}`, instanceId: newInstanceId('riester') }] }
      break
    }
    case 'basisrente': {
      const n = wsa.basisrente.length + 1
      const newInst = basisrenteDraftToInstance({
        productId: 'basisrente',
        status: 'active',
        contractStartYear: CURRENT_YEAR,
        currentValueEUR: 0,
        monthlyContribution: 200,
        anbieter: undefined,
        effektivkostenPct: 0.8, // default to typical all-in cost
        rentenfaktor: 28,
      })
      updated = { ...wsa, basisrente: [...wsa.basisrente, { ...newInst, label: `Basisrente #${n}`, instanceId: newInstanceId('basisrente') }] }
      break
    }
    case 'altersvorsorgedepot': {
      const n = wsa.altersvorsorgedepot.length + 1
      const newInst = avdDraftToInstance({
        productId: 'altersvorsorgedepot',
        status: 'active',
        contractStartYear: CURRENT_YEAR,
        currentValueEUR: 0,
        monthlyContribution: 200,
        anbieter: undefined,
        subtype: 'standarddepot',
        useGlidepath: true,
      })
      updated = { ...wsa, altersvorsorgedepot: [...wsa.altersvorsorgedepot, { ...newInst, label: `AVD #${n}`, instanceId: newInstanceId('altersvorsorgedepot') }] }
      break
    }
    case 'etf': {
      const n = wsa.etf.length + 1
      const newInst = etfDraftToInstance({
        productId: 'etf',
        status: 'active',
        contractStartYear: CURRENT_YEAR,
        currentValueEUR: 0,
        monthlyContribution: 200,
        anbieter: undefined,
        terPct: 0.2,
      })
      updated = { ...wsa, etf: [...wsa.etf, { ...newInst, label: `ETF #${n}`, instanceId: newInstanceId('etf') }] }
      break
    }
  }

  return {
    ...workspace,
    baseline: { ...workspace.baseline, assumptions: updated },
  }
}

/**
 * Remove an instance from the baseline by productId + instanceId. Returns a
 * new workspace without mutating the original. A no-op if the id is not found.
 *
 * Pinned comparison ids that referenced the removed instance are cleaned up.
 */
export function removeInstanceFromWorkspace(
  workspace: Workspace,
  productId: 'bav' | 'versicherung' | 'riester' | 'basisrente' | 'altersvorsorgedepot' | 'etf',
  instanceId: string,
): Workspace {
  const wsa = workspace.baseline.assumptions
  let updated: WorkspaceAssumptionsV2

  switch (productId) {
    case 'bav':
      updated = { ...wsa, bav: wsa.bav.filter((i: BavInstance) => i.instanceId !== instanceId) }
      break
    case 'versicherung':
      updated = { ...wsa, insurance: wsa.insurance.filter((i: InsuranceInstance) => i.instanceId !== instanceId) }
      break
    case 'riester':
      updated = { ...wsa, riester: wsa.riester.filter((i: RiesterInstance) => i.instanceId !== instanceId) }
      break
    case 'basisrente':
      updated = { ...wsa, basisrente: wsa.basisrente.filter((i: BasisrenteInstance) => i.instanceId !== instanceId) }
      break
    case 'altersvorsorgedepot':
      updated = { ...wsa, altersvorsorgedepot: wsa.altersvorsorgedepot.filter((i: AltersvorsorgedepotInstance) => i.instanceId !== instanceId) }
      break
    case 'etf':
      updated = { ...wsa, etf: wsa.etf.filter((i: EtfInstance) => i.instanceId !== instanceId) }
      break
  }

  return {
    ...workspace,
    baseline: { ...workspace.baseline, assumptions: updated },
    pinnedComparisonIds: workspace.pinnedComparisonIds.filter((id) => id !== instanceId),
  }
}

// ---------------------------------------------------------------------------
// Build a v2 Workspace from wizard draft state
// ---------------------------------------------------------------------------

export interface BuildWorkspaceDraftParams {
  grvDraft: GrvDraft
  /** Single draft (backward-compat) or array of drafts for multi-instance. */
  bavDraft: BavDraft | BavDraft[] | null
  pavDraft: PavDraft | PavDraft[] | null
  riesterDraft: RiesterDraft | RiesterDraft[] | null
  basisrenteDraft: BasisrenteDraft | BasisrenteDraft[] | null
  avdDraft: AvdDraft | AvdDraft[] | null
  etfDraft: EtfDraft | EtfDraft[] | null
  /** @deprecated Use `personalDetails` instead. Kept for backward-compat. */
  grossSalaryYear: number
  /**
   * Personal details from wizard step 0 (issue #06).
   * When provided, populates profile.age, retirementAge, grossSalaryYear, and
   * (when ehegattensplitting=true) a minimal partner profile on the scenario.
   * When absent, grossSalaryYear is used as before (backward-compat).
   */
  personalDetails?: PersonalDetailsDraft
}

/** Normalise a possibly-null singleton or array draft to a non-null array. */
function toArray<T>(v: T | T[] | null): T[] {
  if (v === null) return []
  return Array.isArray(v) ? v : [v]
}

export function buildWorkspaceFromDraft(params: BuildWorkspaceDraftParams): Workspace {
  const {
    grvDraft,
    bavDraft,
    pavDraft,
    riesterDraft,
    basisrenteDraft,
    avdDraft,
    etfDraft,
    grossSalaryYear,
    personalDetails,
  } = params

  // Resolve effective profile values: prefer personalDetails when present.
  const CURRENT_YEAR = new Date().getFullYear()
  const effectiveSalary = personalDetails?.grossSalaryYear ?? grossSalaryYear
  const effectiveAge = personalDetails
    ? Math.max(0, CURRENT_YEAR - personalDetails.birthYear)
    : defaultProfile.age
  const effectiveRetirementAge = personalDetails?.retirementAge ?? defaultProfile.retirementAge

  const ep = grvDraft.useYearsEstimate
    ? estimateEpFromYears(grvDraft.yearsWorked, effectiveSalary)
    : grvDraft.currentEntgeltpunkte

  const assumptionsV2: WorkspaceAssumptionsV2 = {
    bav: toArray(bavDraft).map(bavDraftToInstance),
    etf: toArray(etfDraft).map(etfDraftToInstance),
    insurance: toArray(pavDraft).map(pavDraftToInstance),
    basisrente: toArray(basisrenteDraft).map(basisrenteDraftToInstance),
    altersvorsorgedepot: toArray(avdDraft).map(avdDraftToInstance),
    riester: toArray(riesterDraft).map(riesterDraftToInstance),
    statutoryPension: {
      ...defaultAssumptions.statutoryPension,
      currentEntgeltpunkte: ep,
    },
    inflationRate: defaultAssumptions.inflationRate,
    retirementEndAge: defaultAssumptions.retirementEndAge,
    returnScenarios: defaultAssumptions.returnScenarios,
    monteCarlo: defaultAssumptions.monteCarlo,
    visibleProducts: [],
  }

  const profile = {
    ...defaultProfile,
    grossSalaryYear: effectiveSalary,
    age: effectiveAge,
    retirementAge: effectiveRetirementAge,
    taxClass: 1 as const,
  }

  // Ehegattensplitting: add a minimal partner profile (age = profile age,
  // zero income — the engine uses this to enable Zusammenveranlagung).
  const partner: import('../../domain/profile').PersonalProfile | undefined =
    personalDetails?.ehegattensplitting
      ? { ...defaultProfile, age: effectiveAge, grossSalaryYear: 0 }
      : undefined

  const baseline: Scenario = {
    id: newScenarioId('baseline'),
    label: 'Mein Plan',
    profile,
    ...(partner ? { partner } : {}),
    assumptions: assumptionsV2,
    createdAt: new Date().toISOString(),
    origin: 'baseline',
  }

  return {
    ...defaultWorkspace,
    schemaVersion: 2,
    mode: 'combine',
    baseline,
    whatIfs: [],
    pinnedComparisonIds: [],
  }
}
