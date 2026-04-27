export type ProductId = 'etf' | 'bav' | 'versicherung'

export type InsuranceTaxMode = 'steuerfrei' | 'normal'


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
}

export interface InsuranceAssumptions {
  taxMode: InsuranceTaxMode
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
    careEmployeeBaseRate: number
    careEmployeeChildlessRate: number
    careEmployerRate: number
    careRetirementChildlessRate: number
    kvFreibetragVersorgungMonthly: number
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
}

export interface SimulationResult {
  bavFunding: BavFundingResult
  products: ProductResult[]
}
