import type { PersonalProfile, ScenarioAssumptions } from '../domain/types'

export const defaultProfile: PersonalProfile = {
  age: 28,
  retirementAge: 67,
  grossSalaryYear: 75_000,
  taxClass: 1,
  children: 0,
  churchTax: false,
  publicHealthInsurance: true,
  healthAdditionalContributionPct: 2.9,
}

export const defaultAssumptions: ScenarioAssumptions = {
  inflationRate: 0.02,
  retirementEndAge: 90,
  returnScenarios: [
    { id: 'konservativ', label: 'Konservativ', annualReturn: 0.03 },
    { id: 'basis', label: 'Basis', annualReturn: 0.05 },
    { id: 'optimistisch', label: 'Optimistisch', annualReturn: 0.07 },
  ],
  etf: {
    annualAssetFee: 0.002,
    equityPartialExemption: 0.3,
  },
  bav: {
    monthlyGrossConversion: 300,
    extraEmployerContributionPct: 0,
    extraEmployerContributionMonthly: 0,
    monthlyOtherRetirementIncome: 0,
    includeGrvReduction: false,
    kvdrMember: true,
    // #48: default to modern §3 Nr. 63 EStG Direktversicherung
    durchfuehrungsweg: 'direktversicherung_3_63' as const,
    // #48: pre-2005 eligibility flag — only relevant for direktversicherung_40b_alt
    pre2005EligibleTaxFree: false,
    fees: {
      annualAssetFee: 0.005,
      contributionFee: 0.03,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
    },
  },
  insurance: {
    contractStartYear: 2024,
    oldContractTaxFreeEligible: false,
    monthlyOtherRetirementIncome: 0,
    fees: {
      annualAssetFee: 0.014,
      contributionFee: 0.03,
      fixedMonthlyFee: 5,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
    },
  },
}
