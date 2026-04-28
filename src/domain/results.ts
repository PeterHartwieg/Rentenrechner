import type { ReturnScenario, ReturnScenarioId } from './profile'
import type { ProductId } from './products/common'
import type { InsurancePaidUpScenario, InsuranceAssumptions } from './products/insurance'
import type { BavFundingResult, BavAssumptions } from './products/bav'
import type { BasisrenteFundingResult, BasisrenteAssumptions } from './products/basisrente'
import type { AltersvorsorgedepotFundingResult, AltersvorsorgedepotAssumptions } from './products/altersvorsorgedepot'
import type { RiesterFundingResult, RiesterAssumptions } from './products/riester'
import type { StatutoryPensionResult, StatutoryPensionAssumptions } from './products/grv'
import type { EtfAssumptions } from './products/etf'

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
  // #57: Effektivkosten / Reduction in Yield for the accumulation phase (pp)
  accumulationRiy: number
  // #64: nominal break-even age for Leibrente mode — age at which cumulative gross payouts equal capitalAtRetirement.
  //   grossBreakEvenAge = retirementAge + capitalAtRetirement / (grossMonthlyPayout * 12)
  //   Only set when payoutMode === 'leibrente'; undefined for other payout modes.
  leibrenteBreakEvenAge?: number
  // #65: paid-up / surrender scenario (only set for productId === 'versicherung' when paidUpAge is configured).
  paidUpScenario?: InsurancePaidUpScenario
  rows: YearlyProjection[]
  etfPayoutRows?: EtfPayoutRow[]
}

export interface ScenarioAssumptions {
  inflationRate: number
  retirementEndAge: number
  returnScenarios: ReturnScenario[]
  etf: EtfAssumptions
  bav: BavAssumptions
  insurance: InsuranceAssumptions
  statutoryPension: StatutoryPensionAssumptions
  basisrente: BasisrenteAssumptions
  altersvorsorgedepot: AltersvorsorgedepotAssumptions
  riester: RiesterAssumptions
}

export interface SimulationResult {
  bavFunding: BavFundingResult
  products: ProductResult[]
  statutoryPension: StatutoryPensionResult
  basisrenteFunding: BasisrenteFundingResult
  altersvorsorgedepotFunding: AltersvorsorgedepotFundingResult
  riesterFunding: RiesterFundingResult
}
