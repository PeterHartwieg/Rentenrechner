import type { PersonalProfile, ScenarioAssumptions } from '../domain/types'

export const defaultProfile: PersonalProfile = {
  age: 28,
  retirementAge: 67,
  grossSalaryYear: 75_000,
  taxClass: 1,
  children: 0,
  churchTax: false,
  publicHealthInsurance: true,
  healthAdditionalContributionPct: 2.2,
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
    monthlyInvestment: 180,
    contributionMode: 'same-as-bav-net-cost',
    annualAssetFee: 0.002,
    equityPartialExemption: 0.3,
  },
  bav: {
    monthlyGrossConversion: 300,
    extraEmployerContributionPct: 0,
    extraEmployerContributionMonthly: 0,
    fees: {
      annualAssetFee: 0.005,
      contributionFee: 0.03,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
    },
  },
  insurance: {
    monthlyPremium: 180,
    contributionMode: 'same-as-bav-net-cost',
    taxMode: 'normal',
    fees: {
      annualAssetFee: 0.014,
      contributionFee: 0.03,
      fixedMonthlyFee: 5,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
    },
  },
}
