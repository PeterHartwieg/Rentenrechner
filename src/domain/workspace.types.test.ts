import { describe, it } from 'vitest'
import type {
  Workspace,
  WorkspaceAssumptionsV2,
  WhatIfScenario,
  Scenario,
} from './workspace'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
  TransferEvent,
} from './instances'
import type { BavAssumptions } from './products/bav'
import type { EtfAssumptions } from './products/etf'
import type { InsuranceAssumptions } from './products/insurance'
import type { BasisrenteAssumptions } from './products/basisrente'
import type { AltersvorsorgedepotAssumptions } from './products/altersvorsorgedepot'
import type { RiesterAssumptions } from './products/riester'

// ---------------------------------------------------------------------------
// Minimal valid literals for required instance fields
// ---------------------------------------------------------------------------

const minFees = {
  wrapperAssetFee: 0,
  fundAssetFee: 0.0015,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 0,
  pensionPayoutFeePct: 0,
}

const minBavInstance: BavInstance = {
  instanceId: 'bav-singleton',
  label: 'bAV Direktversicherung',
  status: 'active',
  contractStartYear: 2015,
  evidenceMap: {},
  monthlyGrossConversion: 200,
  statutoryMinimumSubsidyEnabled: true,
  contractualMatchPercent: 0,
  contractualFixedMonthly: 0,
  fees: minFees,
  monthlyOtherRetirementIncome: 1500,
  includeGrvReduction: false,
  kvdrMember: true,
  durchfuehrungsweg: 'direktversicherung_3_63',
  pre2005EligibleTaxFree: false,
  payoutMode: 'leibrente',
  rentenfaktor: 30,
  rentenfaktorConfirmed: false,
  zeitrenteYears: 20,
  annualContributionGrowthRate: 0,
}

const minEtfInstance: EtfInstance = {
  instanceId: 'etf-singleton',
  label: 'ETF-Depot',
  status: 'active',
  contractStartYear: 2020,
  evidenceMap: {},
  annualAssetFee: 0.0015,
  equityPartialExemption: 0.3,
  annualContributionGrowthRate: 0,
}

const minInsuranceInstance: InsuranceInstance = {
  instanceId: 'versicherung-singleton',
  label: 'Private Rentenversicherung',
  status: 'active',
  contractStartYear: 2010,
  evidenceMap: {},
  oldContractTaxFreeEligible: false,
  monthlyOtherRetirementIncome: 1500,
  capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
  fees: { ...minFees, wrapperAssetFee: 0.01 },
  payoutMode: 'leibrente',
  rentenfaktor: 28,
  rentenfaktorConfirmed: false,
  zeitrenteYears: 20,
  surrenderHaircutPct: 0,
  annualContributionGrowthRate: 0,
}

const minBasisrenteInstance: BasisrenteInstance = {
  instanceId: 'basisrente-singleton',
  label: 'Basisrente',
  status: 'active',
  contractStartYear: 2018,
  evidenceMap: {},
  monthlyGrossContribution: 300,
  fees: { ...minFees, fundAssetFee: 0.002 },
  payoutMode: 'leibrente',
  rentenfaktor: 25,
  rentenfaktorConfirmed: false,
  monthlyOtherRetirementIncome: 1500,
}

const minAltersvorsorgedepotInstance: AltersvorsorgedepotInstance = {
  instanceId: 'altersvorsorgedepot-singleton',
  label: 'Altersvorsorgedepot',
  status: 'active',
  contractStartYear: 2026,
  evidenceMap: {},
  subtype: 'depot_no_guarantee',
  monthlyOwnContribution: 100,
  eligibility: {
    directlyEligible: true,
    indirectSpouseEligible: false,
    eligibleChildren: 0,
    ageAtContractStart: 35,
    careerStarterBonusUsed: false,
  },
  riskAllocationPct: 1,
  riskAnnualReturn: 0.07,
  lowRiskAnnualReturn: 0.02,
  fees: { ...minFees, fundAssetFee: 0.002 },
  payoutMode: 'certified_payout_plan',
  payoutPlanEndAge: 85,
  partialCapitalPct: 0,
  transferCostEUR: 0,
  monthlyOtherRetirementIncome: 1500,
  rentenfaktor: 25,
  riesterTransferCapital: 0,
}

const minRiesterInstance: RiesterInstance = {
  instanceId: 'riester-singleton',
  label: 'Riester-Rente',
  status: 'active',
  contractStartYear: 2005,
  evidenceMap: {},
  monthlyOwnContribution: 100,
  existingCapital: 0,
  eligibility: {
    directlyEligible: true,
    ageAtContractStart: 25,
    careerStarterBonusUsed: false,
  },
  capitalGuarantee: { enabled: true, floorPctOfContributions: 1 },
  fees: { ...minFees, wrapperAssetFee: 0.005, fundAssetFee: 0.002 },
  payoutMode: 'leibrente',
  rentenfaktor: 22,
  rentenfaktorConfirmed: false,
  zeitrenteYears: 20,
  partialCapitalPct: 0,
  monthlyOtherRetirementIncome: 1500,
}

const minProfile = {
  age: 35,
  retirementAge: 67,
  grossSalaryYear: 60000,
  taxClass: 1 as const,
  childBirthYears: [],
  churchTax: false,
  publicHealthInsurance: true,
  healthAdditionalContributionPct: 0.018,
  pkvMonthlyPremium: 0,
  pPVMonthlyPremium: 0,
}

const minAssumptions: WorkspaceAssumptionsV2 = {
  bav: [minBavInstance],
  etf: [minEtfInstance],
  insurance: [minInsuranceInstance],
  basisrente: [minBasisrenteInstance],
  altersvorsorgedepot: [minAltersvorsorgedepotInstance],
  riester: [minRiesterInstance],
  statutoryPension: {
    manualMonthlyGross: null,
    currentEntgeltpunkte: 20,
    includeGrvReduction: false,
  },
  inflationRate: 0.02,
  retirementEndAge: 90,
  returnScenarios: [{ id: 'basis', label: 'Basis', annualReturn: 0.06 }],
  monteCarlo: { enabled: false, runs: 500, annualVolatility: 0.15, seed: 42 },
  visibleProducts: ['bav', 'etf'],
}

const minBaseline: Scenario = {
  id: 'scenario-abc',
  label: 'Mein Plan',
  profile: minProfile,
  assumptions: minAssumptions,
  createdAt: '2026-01-01T00:00:00.000Z',
  origin: 'baseline',
}

// ---------------------------------------------------------------------------
// Type-level smoke tests — void() prevents unused-variable lint errors while
// the typed literal assignment still forces a compile error on shape mismatch.
// ---------------------------------------------------------------------------

describe('workspace v2 type smoke tests', () => {
  it('Workspace with mode combine, bAV carrying currentValueEUR/anbieter/evidenceMap, whatIfs empty', () => {
    const bavWithDetails: BavInstance = {
      ...minBavInstance,
      currentValueEUR: 25000,
      anbieter: 'Allianz Direktversicherung',
      evidenceMap: {
        currentValueEUR: 'statement',
        monthlyGrossConversion: 'user_confirmed',
        rentenfaktor: 'model_estimate',
      },
    }
    void ({
      schemaVersion: 2,
      mode: 'combine',
      baseline: {
        ...minBaseline,
        assumptions: { ...minAssumptions, bav: [bavWithDetails] },
      },
      whatIfs: [],
      pinnedComparisonIds: [],
    } satisfies Workspace)
  })

  it('Workspace with mode compare and length-1 instance arrays', () => {
    void ({
      schemaVersion: 2,
      mode: 'compare',
      baseline: minBaseline,
      whatIfs: [],
      pinnedComparisonIds: ['bav-singleton'],
    } satisfies Workspace)
  })

  it('WhatIfScenario with both derivedFromBaselineId and derivedFromBaselineSnapshot', () => {
    void ({
      ...minBaseline,
      origin: 'manual' as const,
      derivedFromBaselineId: 'scenario-abc',
      derivedFromBaselineSnapshot: minBaseline,
    } satisfies WhatIfScenario)
  })

  it('TransferEvent certified typechecks', () => {
    void ({
      type: 'certified',
      year: 2030,
      sourceInstanceId: 'riester-singleton',
      targetInstanceId: 'altersvorsorgedepot-singleton',
      amountEUR: 15000,
    } satisfies TransferEvent)
  })

  it('TransferEvent surrender_reinvest typechecks', () => {
    void ({
      type: 'surrender_reinvest',
      year: 2032,
      sourceInstanceId: 'versicherung-singleton',
      targetInstanceId: 'etf-singleton',
      amountEUR: 40000,
      surrenderHaircutPct: 0.03,
    } satisfies TransferEvent)
  })

  it('BavInstance is assignable wherever BavAssumptions is expected', () => {
    void (minBavInstance satisfies BavAssumptions)
  })

  it('EtfInstance is assignable wherever EtfAssumptions is expected', () => {
    void (minEtfInstance satisfies EtfAssumptions)
  })

  it('InsuranceInstance is assignable wherever InsuranceAssumptions is expected', () => {
    void (minInsuranceInstance satisfies InsuranceAssumptions)
  })

  it('BasisrenteInstance is assignable wherever BasisrenteAssumptions is expected', () => {
    void (minBasisrenteInstance satisfies BasisrenteAssumptions)
  })

  it('AltersvorsorgedepotInstance is assignable wherever AltersvorsorgedepotAssumptions is expected', () => {
    void (minAltersvorsorgedepotInstance satisfies AltersvorsorgedepotAssumptions)
  })

  it('RiesterInstance is assignable wherever RiesterAssumptions is expected', () => {
    void (minRiesterInstance satisfies RiesterAssumptions)
  })

  it('WorkspaceAssumptionsV2 accepts length-1 arrays for every product', () => {
    void (minAssumptions satisfies WorkspaceAssumptionsV2)
  })
})
