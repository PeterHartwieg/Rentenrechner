export interface SocialContributionBreakdown {
  pension: number
  unemployment: number
  health: number
  care: number
  total: number
}

export interface SalaryResult {
  annualGross: number
  annualNet: number
  taxableIncome: number
  incomeTax: number
  solidarityTax: number
  social: SocialContributionBreakdown
  // BMF PAP §3: RV + GKV + PV only (no unemployment)
  vorsorgepauschale: number
  // #50: PKV cost fields (0 when publicHealthInsurance = true)
  pkv257SubsidyMonthly: number  // §257 SGB V employer subsidy (tax-free, §3 Nr. 62 EStG)
  pkvNetMonthlyCost: number     // net PKV cost = premium + pPV premium − §257 subsidy
}
