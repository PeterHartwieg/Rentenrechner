/**
 * Pure helper functions for the InventoryWizard — separated from the React
 * component files to satisfy the react-refresh/only-export-components rule.
 *
 * ID generation (`newInstanceId`) and pure workspace mutations
 * (`addInstanceToWorkspace`, `removeInstanceFromWorkspace`) live in
 * `workspaceIdentity.ts` and are re-exported from here for backward compat.
 * This breaks the former circular dependency with `portfolioState.ts`.
 *
 * Consumers:
 *  - InventoryWizard.tsx (buildWorkspaceFromDraft)
 *  - InstanceCard.tsx (estimateEpFromYears)
 *  - InventoryWizard.test.ts
 *  - portfolioState.ts (addInstanceToWorkspace, removeInstanceFromWorkspace — via workspaceIdentity)
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
import {
  newScenarioId,
  newInstanceId,
  addInstanceToWorkspace,
  removeInstanceFromWorkspace,
} from '../../app/workspaceIdentity'
// Re-export so existing callers (contractDecisions, tests, portfolioState) keep working.
export { newInstanceId, addInstanceToWorkspace, removeInstanceFromWorkspace }
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
// EP estimation
// ---------------------------------------------------------------------------

/**
 * Estimate Entgeltpunkte from years worked × current gross salary.
 * EP/year = min(salary, BBG) / Durchschnittsentgelt
 * Uses 2026 statutory values (de2026.ts: pensionCapYear = 101_400,
 * durchschnittsentgelt = 47_079).
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
    instanceId: newInstanceId('bav'),
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
  }
}

export interface BavOfferDraft {
  anbieter?: string
  contractStartYear: number
  contractualMatchPercent: number
  contractualFixedMonthly: number
  effektivkostenPct: number
  rentenfaktor: number
  durchfuehrungsweg: BavInstance['durchfuehrungsweg']
  payoutMode: BavInstance['payoutMode']
}

export function bavOfferDraftToInstance(d: BavOfferDraft): BavInstance {
  return {
    instanceId: newInstanceId('bav'),
    label: d.anbieter ? `bAV-Angebot ${d.anbieter}` : 'bAV-Angebot',
    anbieter: d.anbieter,
    status: 'offered',
    contractStartYear: d.contractStartYear,
    currentValueEUR: 0,
    evidenceMap: {},
    ownedBy: 'self',
    monthlyGrossConversion: 0,
    statutoryMinimumSubsidyEnabled: defaultAssumptions.bav.statutoryMinimumSubsidyEnabled,
    contractualMatchPercent: d.contractualMatchPercent,
    contractualFixedMonthly: d.contractualFixedMonthly,
    fees: {
      ...defaultAssumptions.bav.fees,
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
    instanceId: newInstanceId('versicherung'),
    label: d.anbieter ? `pAV – ${d.anbieter}` : 'Private Rentenversicherung',
    anbieter: d.anbieter,
    status: d.status,
    contractStartYear: d.contractStartYear,
    currentValueEUR: d.currentValueEUR ?? 0,
    evidenceMap: d.evidenceMap ?? {},
    ownedBy: 'self',
    monthlyContribution: d.monthlyContribution,
    // InsuranceAssumptions (contractStartYear is also on InstanceCommon)
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
  }
}

export function riesterDraftToInstance(d: RiesterDraft): RiesterInstance {
  return {
    instanceId: newInstanceId('riester'),
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
    instanceId: newInstanceId('basisrente'),
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
    payoutMode: 'leibrente',
    rentenfaktor: d.rentenfaktor,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
  }
}

export function avdDraftToInstance(d: AvdDraft): AltersvorsorgedepotInstance {
  return {
    instanceId: newInstanceId('altersvorsorgedepot'),
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
    instanceId: newInstanceId('etf'),
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
  const effectiveKv = personalDetails?.publicHealthInsurance ?? defaultProfile.publicHealthInsurance
  const effectiveChildren = personalDetails?.childBirthYears ?? defaultProfile.childBirthYears
  const pensionBaseline = personalDetails?.pensionBaseline ?? 'grv'

  // For non-GRV baselines we skip EP estimation entirely and use the user's
  // manual Versorgungsauskunft figure (Beamtenpension has no EP equivalent;
  // Versorgungswerk EP is plan-specific and not modelled). GRV uses years/EP.
  const ep =
    pensionBaseline === 'grv'
      ? grvDraft.useYearsEstimate
        ? estimateEpFromYears(grvDraft.yearsWorked, effectiveSalary)
        : grvDraft.currentEntgeltpunkte
      : 0
  const manualMonthlyGross =
    pensionBaseline === 'grv'
      ? null
      : personalDetails && personalDetails.manualMonthlyGrossPension > 0
        ? personalDetails.manualMonthlyGrossPension
        : null

  const assumptionsV2: WorkspaceAssumptionsV2 = {
    bav: toArray(bavDraft).map(bavDraftToInstance),
    etf: toArray(etfDraft).map(etfDraftToInstance),
    insurance: toArray(pavDraft).map(pavDraftToInstance),
    basisrente: toArray(basisrenteDraft).map(basisrenteDraftToInstance),
    altersvorsorgedepot: toArray(avdDraft).map(avdDraftToInstance),
    riester: toArray(riesterDraft).map(riesterDraftToInstance),
    statutoryPension: {
      ...defaultAssumptions.statutoryPension,
      pensionBaselineType: pensionBaseline,
      currentEntgeltpunkte: ep,
      manualMonthlyGross,
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
    publicHealthInsurance: effectiveKv,
    childBirthYears: [...effectiveChildren],
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
