import type { PersonalProfile, ScenarioAssumptions } from '../domain/types'

export const defaultProfile: PersonalProfile = {
  age: 28,
  retirementAge: 67,
  grossSalaryYear: 75_000,
  taxClass: 1,
  childBirthYears: [],
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
    // #51: §1a Abs. 1a BetrAVG default — statutory subsidy on, no contractual extras.
    statutoryMinimumSubsidyEnabled: true,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
    monthlyOtherRetirementIncome: 0,
    includeGrvReduction: false,
    kvdrMember: true,
    // #48: default to modern §3 Nr. 63 EStG Direktversicherung
    durchfuehrungsweg: 'direktversicherung_3_63' as const,
    // #48: pre-2005 eligibility flag — only relevant for direktversicherung_40b_alt
    pre2005EligibleTaxFree: false,
    // #54: bAV-Renten typically Leibrente. 30 EUR/10k/Monat is a market-typical 2026
    // unisex Rentenfaktor for age-67 starts (range 25–35 across providers); see LEGAL_REVIEW.md.
    payoutMode: 'leibrente' as const,
    rentenfaktor: 30,
    zeitrenteYears: 20,
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
    // #54: pAV defaults — Leibrente is the typical contractual form. Private contracts often
    // quote slightly lower Rentenfaktoren than bAV (higher costs and unisex pricing); 28 EUR/10k
    // chosen as a 2026 market-typical default. See LEGAL_REVIEW.md.
    payoutMode: 'leibrente' as const,
    rentenfaktor: 28,
    zeitrenteYears: 20,
    fees: {
      annualAssetFee: 0.014,
      contributionFee: 0.03,
      fixedMonthlyFee: 5,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
    },
  },
}
