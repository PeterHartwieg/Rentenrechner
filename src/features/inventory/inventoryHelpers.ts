/**
 * Pure helper functions for the InventoryWizard — separated from the React
 * component files to satisfy the react-refresh/only-export-components rule.
 *
 * ID generation (`newInstanceId`) and pure workspace mutations
 * (`addInstanceToWorkspace`, `removeInstanceFromWorkspace`) live in
 * `workspaceIdentity.ts` and are re-exported from here for backward compat.
 * This breaks the former circular dependency with `portfolioState.ts`.
 *
 * Draft-to-instance converters (`bavDraftToInstance` etc.) are now thin wrappers
 * over the corresponding `INVENTORY_PRODUCT_REGISTRY[id].draftToInstance` entries
 * (architecture-readability issue 09).  Each named export is kept for backward
 * compat with callers that import the specific function by name.
 *
 * Consumers:
 *  - InventoryWizard.tsx (buildWorkspaceFromDraft)
 *  - InstanceCard.tsx (estimateEpFromYears)
 *  - InventoryWizard.test.ts
 *  - portfolioState.ts (addInstanceToWorkspace, removeInstanceFromWorkspace — via workspaceIdentity)
 *  - contractDecisions.ts (avdDraftToInstance, newInstanceId)
 *  - CombineDashboardSidebar.tsx (bavOfferDraftToInstance)
 */

import type { Workspace, Scenario, WorkspaceAssumptionsV2 } from '../../domain/workspace'
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
import { INVENTORY_PRODUCT_REGISTRY } from './inventoryProductRegistry'
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
import type {
  BavInstance,
  InsuranceInstance,
  RiesterInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  EtfInstance,
} from '../../domain/instances'

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
//
// Each function is a thin named wrapper over the corresponding registry entry's
// `draftToInstance` (issue 09). Kept as named exports for backward compat with
// callers that import them by name.
// ---------------------------------------------------------------------------

export function bavDraftToInstance(d: BavDraft): BavInstance {
  return INVENTORY_PRODUCT_REGISTRY.bav.draftToInstance(d, newInstanceId)
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
  return INVENTORY_PRODUCT_REGISTRY.versicherung.draftToInstance(d, newInstanceId)
}

export function riesterDraftToInstance(d: RiesterDraft): RiesterInstance {
  return INVENTORY_PRODUCT_REGISTRY.riester.draftToInstance(d, newInstanceId)
}

export function basisrenteDraftToInstance(d: BasisrenteDraft): BasisrenteInstance {
  return INVENTORY_PRODUCT_REGISTRY.basisrente.draftToInstance(d, newInstanceId)
}

export function avdDraftToInstance(d: AvdDraft): AltersvorsorgedepotInstance {
  return INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.draftToInstance(d, newInstanceId)
}

export function etfDraftToInstance(d: EtfDraft): EtfInstance {
  return INVENTORY_PRODUCT_REGISTRY.etf.draftToInstance(d, newInstanceId)
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
