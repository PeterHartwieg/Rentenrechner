import type { ReturnScenario, ReturnScenarioId } from './profile'
import type { ProductId } from './products/common'
import type { InsurancePaidUpScenario, InsuranceAssumptions } from './products/insurance'
import type { BavFundingResult, BavAssumptions } from './products/bav'
import type { BasisrenteFundingResult, BasisrenteAssumptions } from './products/basisrente'
import type { AltersvorsorgedepotFundingResult, AltersvorsorgedepotAssumptions } from './products/altersvorsorgedepot'
import type { RiesterFundingResult, RiesterAssumptions } from './products/riester'
import type { StatutoryPensionResult, StatutoryPensionAssumptions } from './products/grv'
import type { EtfAssumptions } from './products/etf'
import type { MonteCarloAssumptions } from './monteCarlo'
import type { EvidenceState } from './instances'

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

// Shared fields present on every product result.
export interface BaseProductResult {
  label: string
  scenarioId: ReturnScenarioId
  scenarioLabel: string
  /**
   * Optional instance id for combine-mode portfolio runs (Group G issue 03).
   *
   * Set by `simulatePortfolio` after the per-product simulator returns; the
   * legacy `simulateRetirementComparison` path leaves it `undefined`. UI code
   * that needs to disambiguate two ProductResult entries of the same productId
   * (multi-instance portfolios) keys off this field.
   */
  instanceId?: string
  annualReturn: number
  monthlyUserCost: number
  monthlyProductContribution: number
  monthlyEmployerContribution: number
  totalUserCost: number
  totalProductContributions: number
  /** Full accumulation cost basis: regular contributions + injected transfer principal.
   *  Equal to `totalProductContributions` when no transfer has injected capital. */
  totalContributionsBeforeFees: number
  totalEmployerContributions: number
  totalFees: number
  capitalAtRetirement: number
  /**
   * Unfloored market capital before a contractual guarantee is applied. Present
   * only when a product has a modeled capital guarantee.
   */
  rawCapitalAtRetirement?: number
  /** Contractual minimum capital at retirement, before payout taxes. */
  guaranteeFloorAtRetirement?: number
  /** Human-readable guarantee label shown in risk views. */
  guaranteeLabel?: string
  /** True when the guarantee raised the simulated retirement capital. */
  guaranteeApplied?: boolean
  realCapitalAtRetirement: number
  afterTaxLumpSum: number | null
  /** Income-tax + KV/PV components that make up `capitalAtRetirement − afterTaxLumpSum`.
   *  Set for products with a non-trivial marginal-rate computation (bAV, private insurance).
   *  Optional because ETF/AVD/Riester use simple capital-gains tax which is fully captured by
   *  the `afterTaxLumpSum` figure alone. */
  lumpSumDeductions?: { incomeTax: number; kvPv: number }
  grossMonthlyPayout: number
  netMonthlyPayout: number
  taxAndSvSavings: number
  valueMultipleOnUserCost: number | null
  capitalMultipleAnnualized: number
  // #57: Effektivkosten / Reduction in Yield for the accumulation phase — decimal (0.012 = 1.2 pp p.a.)
  accumulationRiy: number
  // #64: nominal break-even age for Leibrente mode
  leibrenteBreakEvenAge?: number
  /**
   * Age at which monthly payouts stop. `undefined` means lifelong (Leibrente / hybrid annuity).
   * For Kapitalverzehr / ETF: `retirementEndAge`. For Zeitrente: `retirementAge + zeitrenteYears`.
   * For AVD `certified_payout_plan`: the certified end age (≥ 85). Drives the break-even chart.
   */
  payoutEndAge?: number
  /**
   * Lowest confidence tier across all input fields consumed by the simulator for this
   * product instance. Set by `simulatePortfolio` after the simulator returns; `undefined`
   * on the legacy compare-mode path (no instance metadata available there).
   */
  inputConfidence?: EvidenceState
  rows: YearlyProjection[]
}

export interface EtfProductResult extends BaseProductResult {
  productId: 'etf'
  afterTaxLumpSum: number       // ETF always has an after-tax value (never locked)
  etfPayoutRows: EtfPayoutRow[] // required; only ETF produces a payout schedule
}

export interface BavProductResult extends BaseProductResult {
  productId: 'bav'
  afterTaxLumpSum: number       // bAV always has an after-tax lump-sum value
}

export interface InsuranceProductResult extends BaseProductResult {
  productId: 'versicherung'
  afterTaxLumpSum: number       // private insurance always has an after-tax value
  paidUpScenario?: InsurancePaidUpScenario // only set when paidUpAge is configured
}

export interface BasisrenteProductResult extends BaseProductResult {
  productId: 'basisrente'
  afterTaxLumpSum: null          // capital payout legally prohibited (§10 Abs. 1 Nr. 2 EStG)
}

export interface AltersvorsorgedepotProductResult extends BaseProductResult {
  productId: 'altersvorsorgedepot'
  // afterTaxLumpSum: number | null — null when partialCapitalPct === 0
}

export interface RiesterProductResult extends BaseProductResult {
  productId: 'riester'
  // afterTaxLumpSum: number | null — null when partialCapitalPct === 0
}

export type ProductResult =
  | EtfProductResult
  | BavProductResult
  | InsuranceProductResult
  | BasisrenteProductResult
  | AltersvorsorgedepotProductResult
  | RiesterProductResult

export interface ScenarioAssumptions {
  inflationRate: number
  retirementEndAge: number
  returnScenarios: ReturnScenario[]
  monteCarlo: MonteCarloAssumptions
  etf: EtfAssumptions
  bav: BavAssumptions
  insurance: InsuranceAssumptions
  statutoryPension: StatutoryPensionAssumptions
  basisrente: BasisrenteAssumptions
  altersvorsorgedepot: AltersvorsorgedepotAssumptions
  riester: RiesterAssumptions
  /**
   * Subset of products to render in charts, comparison tables, and CSV/print exports.
   * Empty array = no comparison; `simulateRetirementComparison` filters by this list
   * and the UI surfaces an empty-state. Legacy persisted states without the field
   * fall back to the default (all six products) via mergeDeep; an explicit empty
   * array set by the user is preserved on round-trip.
   */
  visibleProducts: ProductId[]
  /**
   * Legacy compare-mode sub-mode field. The only public model is now
   * Netto-Belastung equality (all products sized from `equalInputAmountEUR`).
   * Kept in the type for safe round-trip of old saved/share-URL state; the
   * value `'equal_cash'` from old saves is preserved on load by
   * `applyPostMergeMigrations` but has no UI surface.
   * @deprecated Use `equalInputAmountEUR` as the single public anchor.
   */
  compareSubMode?: 'equal_cash' | 'equal_input'
  /**
   * Monthly net out-of-pocket comparison anchor (EUR/month). All six products
   * are sized so the user's bank-account burden equals this target where
   * statutory caps allow. Default 200 EUR/month.
   */
  equalInputAmountEUR?: number
}

export interface SimulationResult {
  bavFunding: BavFundingResult
  products: ProductResult[]
  statutoryPension: StatutoryPensionResult
  basisrenteFunding: BasisrenteFundingResult
  altersvorsorgedepotFunding: AltersvorsorgedepotFundingResult
  riesterFunding: RiesterFundingResult
}
