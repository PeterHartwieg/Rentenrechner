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
  // #50: PKV premiums — zero when GKV (publicHealthInsurance = true).
  // 500 EUR/month KV + 50 EUR/month pPV are market-typical 2026 values for a healthy
  // 28-year-old; users should enter their actual premium from their PKV offer.
  pkvMonthlyPremium: 0,
  pPVMonthlyPremium: 0,
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
      wrapperAssetFee: 0.003,   // 0.30 % Versicherungsmantel
      fundAssetFee: 0.002,      // 0.20 % ETF-Fondskosten — total 0.50 % p.a.
      contributionFee: 0.03,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
  basisrente: {
    // Typical Rürup/Basisrente monthly premium for an employed single filer.
    // Most Rürup contracts start around 100–300 EUR/month; 200 EUR is a reasonable default.
    monthlyGrossContribution: 200,
    // #54: Basisrente contracts typically quote Leibrente as the default payout form.
    // 28 EUR/10k/Monat chosen as a 2026 market-typical value (similar to private insurance,
    // as Basisrente insurers price annuities similarly to Schicht-3 providers).
    payoutMode: 'leibrente' as const,
    rentenfaktor: 28,
    zeitrenteYears: 20,
    monthlyOtherRetirementIncome: 0,
    fees: {
      wrapperAssetFee: 0.012,   // 1.20 % — typical Basisrente insurance wrapper
      fundAssetFee: 0.002,      // 0.20 % ETF-Fondskosten — total 1.40 % p.a.
      contributionFee: 0.03,
      fixedMonthlyFee: 5,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
  statutoryPension: {
    // null = use EP-based estimation; set to a specific number to use a Renteninformation override
    manualMonthlyGross: null,
    // Seed with a realistic EP count for the default 28-year-old profile (~6 years at avg salary).
    // Users should replace this with the value from their last Renteninformation letter.
    currentEntgeltpunkte: 8,
    includeGrvReduction: false,
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
      wrapperAssetFee: 0.012,   // 1.20 % Versicherungsmantel
      fundAssetFee: 0.002,      // 0.20 % ETF-Fondskosten — total 1.40 % p.a.
      contributionFee: 0.03,
      fixedMonthlyFee: 5,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
}
