/**
 * Workspace identity and mutation Module (architecture-readability issue 01).
 *
 * Owns all workspace ID generation and pure workspace add/remove mutations so
 * that `portfolioState.ts` (React hook) and `inventoryHelpers.ts` (wizard
 * helpers) can each import from here rather than from each other.  Removing
 * that circular dependency was the primary goal.
 *
 * Nothing in this module imports React, DOM APIs, or any other src/app or
 * src/features file.  It only imports from src/domain and src/data.
 *
 * Public surface:
 *  - newScenarioId   — scenario ID (UUID-prefixed)
 *  - newInstanceId   — instance ID (${productId}-${random8})
 *  - deepCloneScenario — structural clone helper
 *  - addInstanceToWorkspace    — pure workspace mutation
 *  - removeInstanceFromWorkspace — pure workspace mutation
 */

import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../domain/instances'
import { defaultAssumptions } from '../data/defaultScenario'

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a UUID-style id for new scenarios.  Uses `crypto.randomUUID` when
 * available (browsers + Node 19+), with a fallback for older environments.
 *
 * Exported so tests and spawn flows can produce deterministic-shape ids
 * without pulling in the React hook.
 */
export function newScenarioId(prefix: 'whatif' | 'baseline' = 'whatif'): string {
  // crypto.randomUUID is widely available in modern browsers and Node 19+;
  // fall back to a Math.random-based string for very old environments.
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined
  const uuid = cryptoObj?.randomUUID
    ? cryptoObj.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${uuid}`
}

/**
 * Generate a new stable instance id matching the documented format
 * `${productId}-${random8}` (e.g. `bav-7f2a91c4`).
 */
export function newInstanceId(productId: string): string {
  return `${productId}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------------------------------------------------------------------------
// Deep clone utility
// ---------------------------------------------------------------------------

/**
 * Structural clone for workspace objects.  Uses `structuredClone` when
 * available, falls back to JSON round-trip for older environments.
 */
export function deepCloneScenario<T>(v: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(v)
  }
  return JSON.parse(JSON.stringify(v)) as T
}

// ---------------------------------------------------------------------------
// Pure workspace mutations
// ---------------------------------------------------------------------------

/**
 * Add a new default instance of the given product type to the baseline
 * assumptions of the supplied workspace.  Returns a new workspace without
 * mutating the original.
 *
 * `productId` must be one of the per-product instance array keys on
 * `WorkspaceAssumptionsV2`.  GRV stays singleton and is not in scope.
 *
 * The new instance is built from canonical defaults with a disambiguating
 * label suffix "#N" where N is the count after adding.
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
      const newInst: BavInstance = {
        instanceId: newInstanceId('bav'),
        label: `bAV #${n}`,
        status: 'active',
        contractStartYear: CURRENT_YEAR,
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
      }
      updated = { ...wsa, bav: [...wsa.bav, newInst] }
      break
    }
    case 'versicherung': {
      const n = wsa.insurance.length + 1
      const newInst: InsuranceInstance = {
        instanceId: newInstanceId('versicherung'),
        label: `pAV #${n}`,
        status: 'active',
        contractStartYear: CURRENT_YEAR,
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
      }
      updated = { ...wsa, insurance: [...wsa.insurance, newInst] }
      break
    }
    case 'riester': {
      const n = wsa.riester.length + 1
      const newInst: RiesterInstance = {
        instanceId: newInstanceId('riester'),
        label: `Riester #${n}`,
        status: 'active',
        contractStartYear: CURRENT_YEAR,
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
      }
      updated = { ...wsa, riester: [...wsa.riester, newInst] }
      break
    }
    case 'basisrente': {
      const n = wsa.basisrente.length + 1
      const newInst: BasisrenteInstance = {
        instanceId: newInstanceId('basisrente'),
        label: `Basisrente #${n}`,
        status: 'active',
        contractStartYear: CURRENT_YEAR,
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
      }
      updated = { ...wsa, basisrente: [...wsa.basisrente, newInst] }
      break
    }
    case 'altersvorsorgedepot': {
      const n = wsa.altersvorsorgedepot.length + 1
      const newInst: AltersvorsorgedepotInstance = {
        instanceId: newInstanceId('altersvorsorgedepot'),
        label: `AVD #${n}`,
        status: 'active',
        contractStartYear: CURRENT_YEAR,
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
      }
      updated = { ...wsa, altersvorsorgedepot: [...wsa.altersvorsorgedepot, newInst] }
      break
    }
    case 'etf': {
      const n = wsa.etf.length + 1
      const newInst: EtfInstance = {
        instanceId: newInstanceId('etf'),
        label: `ETF #${n}`,
        status: 'active',
        contractStartYear: CURRENT_YEAR,
        currentValueEUR: 0,
        evidenceMap: {},
        ownedBy: 'self',
        monthlyContribution: 200,
        annualAssetFee: 0.002,
        equityPartialExemption: defaultAssumptions.etf.equityPartialExemption,
        annualContributionGrowthRate: 0,
      }
      updated = { ...wsa, etf: [...wsa.etf, newInst] }
      break
    }
  }

  return {
    ...workspace,
    baseline: { ...workspace.baseline, assumptions: updated },
  }
}

/**
 * Remove an instance from the baseline by productId + instanceId.  Returns a
 * new workspace without mutating the original.  A no-op if the id is not
 * found.
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
