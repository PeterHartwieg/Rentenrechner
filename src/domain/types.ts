export type ProductId = 'etf' | 'bav' | 'versicherung'

// pre2005: old-law contract (§52 Abs. 28 EStG) — tax-free payout
// halbeinkuenfte: post-2004, ≥12 years, payout ≥ age 62 — half the gain at personal income tax rate (§20 Abs. 1 Nr. 6 EStG)
// abgeltungsteuer: post-2004, all other cases — full gain at 25% Abgeltungsteuer (§20 Abs. 2 EStG)
export type InsuranceTaxMode = 'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer'


export type ReturnScenarioId = 'konservativ' | 'basis' | 'optimistisch'

export interface PersonalProfile {
  age: number
  retirementAge: number
  grossSalaryYear: number
  taxClass: 1
  children: number
  churchTax: boolean
  publicHealthInsurance: boolean
  healthAdditionalContributionPct: number
}

export interface ReturnScenario {
  id: ReturnScenarioId
  label: string
  annualReturn: number
}

export interface FeeModel {
  annualAssetFee: number
  contributionFee: number
  fixedMonthlyFee: number
  acquisitionCostPct: number
  acquisitionCostSpreadYears: number
}

export interface EtfAssumptions {
  annualAssetFee: number
  equityPartialExemption: number
}

export interface BavAssumptions {
  monthlyGrossConversion: number
  extraEmployerContributionPct: number
  extraEmployerContributionMonthly: number
  fees: FeeModel
  // #6: other monthly retirement income (GRV + other) for marginal-tax calculation
  monthlyOtherRetirementIncome: number
  // #5: when true, subtract estimatedMonthlyGrvReduction from bAV net payout
  includeGrvReduction: boolean
  // #6: true = KVdR (KV Freibetrag §226(2) SGB V, combined AN+AG PV); false = freiwillig versichert (no Freibetrag)
  kvdrMember: boolean
}

export interface InsuranceAssumptions {
  // Year the contract was signed. Pre-2005 → eligible for tax-free payout; post-2004 → tax mode derived from runtime + retirementAge.
  contractStartYear: number
  // User-confirmable: true when the pre-2005 contract meets §52 Abs. 28 EStG a.F. eligibility
  // conditions (≥12-year runtime, ≥5 annual premium payments, capital payout not annuity).
  // Defaults to true for pre-2005 contracts. Ignored for post-2004 contracts.
  oldContractTaxFreeEligible: boolean
  // Monthly other retirement income for marginal-tax calculation (Halbeinkünfteverfahren only)
  monthlyOtherRetirementIncome: number
  fees: FeeModel
}

export interface ScenarioAssumptions {
  inflationRate: number
  retirementEndAge: number
  returnScenarios: ReturnScenario[]
  etf: EtfAssumptions
  bav: BavAssumptions
  insurance: InsuranceAssumptions
}

export interface GermanRules {
  year: number
  employeeAllowance: number
  specialExpensesAllowance: number
  incomeTax: {
    basicAllowance: number
    firstProgressionEnd: number
    secondProgressionEnd: number
    topTaxStart: number
    solidarityFreeTax: number
  }
  socialSecurity: {
    pensionCapYear: number
    healthCareCapYear: number
    pensionEmployeeRate: number
    pensionEmployerRate: number
    unemploymentEmployeeRate: number
    unemploymentEmployerRate: number
    healthGeneralRate: number
    // ermäßigter Beitragssatz (without Krankengeld) — used for Vorsorgepauschale §39b EStG
    healthReducedRate: number
    careEmployeeBaseRate: number
    careEmployeeChildlessRate: number
    careEmployerRate: number
    careRetirementChildlessRate: number
    kvFreibetragVersorgungMonthly: number
    // §18 SGB IV Bezugsgröße West — used for bAV minimum entitlement (§1a BetrAVG)
    bezugsgroesseMonthly: number
    // SGB VI Anlage 1 vorläufiges Durchschnittsentgelt — denominator for Entgeltpunkte
    durchschnittsentgelt: number
    // Aktueller Rentenwert West (monthly EUR per Entgeltpunkt) — for GRV pension estimation
    aktuellerRentenwert: number
  }
  bav: {
    taxFreePctOfPensionCap: number
    socialSecurityFreePctOfPensionCap: number
    statutoryEmployerSubsidyPct: number
  }
  capitalGains: {
    taxRate: number
    solidarityRate: number
    saverAllowance: number
    // Basiszins nach §203 BewG — published by BMF each January, used for InvStG §18 Vorabpauschale
    basiszins: number
  }
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
}

export interface SocialContributionBreakdown {
  pension: number
  unemployment: number
  health: number
  care: number
  total: number
}

export interface BavFundingResult {
  monthlyGrossConversion: number
  annualGrossConversion: number
  monthlyNetCost: number
  annualNetCost: number
  monthlyTaxAndSvSavings: number
  annualTaxAndSvSavings: number
  monthlyMandatoryEmployerSubsidy: number
  monthlyExtraEmployerSubsidy: number
  monthlyEmployerContribution: number
  annualEmployerContribution: number
  employerSocialSecuritySavingAnnual: number
  salaryWithoutBav: SalaryResult
  salaryWithBav: SalaryResult
  // §3 Nr. 63 EStG (8% BBG) and §1 SvEV (4% BBG) limits applied to total bAV
  totalBavContributionAnnual: number
  taxFreePortionAnnual: number
  svFreePortionAnnual: number
  taxableOverflowAnnual: number
  svLiableOverflowAnnual: number
  // #5: estimated monthly GRV pension loss from salary conversion (see BACKLOG #5)
  estimatedMonthlyGrvReduction: number
}

export interface YearlyProjection {
  year: number
  age: number
  productId: ProductId
  scenarioId: ReturnScenarioId
  balance: number
  realBalance: number
  yearlyUserCost: number
  yearlyProductContribution: number
  yearlyEmployerContribution: number
  yearlyFees: number
  cumulativeFees: number
  cumulativeProductContributions: number
  // Gross Vorabpauschale accumulated so far (0 for bAV/insurance); reduces exit taxable gain
  cumulativeVorabpauschale: number
}

// Year-by-year ETF payout schedule tracking cost basis depletion (#37)
export interface EtfPayoutRow {
  year: number              // 1-based retirement year
  age: number               // age at start of this retirement year
  capitalAtStart: number    // capital before withdrawal
  grossAnnualPayout: number
  taxableGain: number       // gain portion of withdrawal subject to tax
  saverAllowanceUsed: number // Sparerpauschbetrag consumed this year
  taxDue: number
  netAnnualPayout: number
  netMonthlyPayout: number
  capitalAtEnd: number      // capital after withdrawal and annual growth
  remainingCostBasis: number
}

export interface ProductResult {
  productId: ProductId
  label: string
  scenarioId: ReturnScenarioId
  scenarioLabel: string
  annualReturn: number
  monthlyUserCost: number
  monthlyProductContribution: number
  monthlyEmployerContribution: number
  totalUserCost: number
  totalProductContributions: number
  totalEmployerContributions: number
  totalFees: number
  capitalAtRetirement: number
  realCapitalAtRetirement: number
  afterTaxLumpSum: number | null
  grossMonthlyPayout: number
  netMonthlyPayout: number
  taxAndSvSavings: number
  valueMultipleOnUserCost: number | null
  capitalMultipleAnnualized: number
  rows: YearlyProjection[]
  etfPayoutRows?: EtfPayoutRow[]
}

export interface SimulationResult {
  bavFunding: BavFundingResult
  products: ProductResult[]
}
