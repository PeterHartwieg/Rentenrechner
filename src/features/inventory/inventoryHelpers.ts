/**
 * Pure helper functions for the InventoryWizard — separated from the React
 * component files to satisfy the react-refresh/only-export-components rule.
 *
 * Consumers:
 *  - InventoryWizard.tsx (buildWorkspaceFromDraft)
 *  - InstanceCard.tsx (estimateEpFromYears)
 *  - InventoryWizard.test.ts (both)
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
    evidenceMap: {},
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
    evidenceMap: {},
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
    evidenceMap: {},
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
    evidenceMap: {},
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
    evidenceMap: {},
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
    evidenceMap: {},
    ownedBy: 'self',
    annualAssetFee: d.terPct / 100,
    equityPartialExemption: defaultAssumptions.etf.equityPartialExemption,
    annualContributionGrowthRate: 0,
  }
}

// ---------------------------------------------------------------------------
// Build a v2 Workspace from wizard draft state
// ---------------------------------------------------------------------------

export interface BuildWorkspaceDraftParams {
  grvDraft: GrvDraft
  bavDraft: BavDraft | null
  pavDraft: PavDraft | null
  riesterDraft: RiesterDraft | null
  basisrenteDraft: BasisrenteDraft | null
  avdDraft: AvdDraft | null
  etfDraft: EtfDraft | null
  grossSalaryYear: number
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
  } = params

  const ep = grvDraft.useYearsEstimate
    ? estimateEpFromYears(grvDraft.yearsWorked, grossSalaryYear)
    : grvDraft.currentEntgeltpunkte

  const assumptionsV2: WorkspaceAssumptionsV2 = {
    bav: bavDraft ? [bavDraftToInstance(bavDraft)] : [],
    etf: etfDraft ? [etfDraftToInstance(etfDraft)] : [],
    insurance: pavDraft ? [pavDraftToInstance(pavDraft)] : [],
    basisrente: basisrenteDraft ? [basisrenteDraftToInstance(basisrenteDraft)] : [],
    altersvorsorgedepot: avdDraft ? [avdDraftToInstance(avdDraft)] : [],
    riester: riesterDraft ? [riesterDraftToInstance(riesterDraft)] : [],
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

  const baseline: Scenario = {
    id: newScenarioId('baseline'),
    label: 'Mein Plan',
    profile: { ...defaultProfile, grossSalaryYear },
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
