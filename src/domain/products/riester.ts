import type { FeeModel } from '../fees'
import type { PayoutMode } from './common'

// ---------------------------------------------------------------------------
// Legacy Riester / Certified Altersvorsorgevertrag (#62)
// ---------------------------------------------------------------------------

/**
 * Eligibility inputs for Riester allowance calculation (§84–§86 EStG old law).
 */
export interface RiesterEligibility {
  /** True when directly eligible (GRV member, civil servant, self-employed in GRV, etc.). */
  directlyEligible: boolean
  /** Age at the start of the first contribution year (for career-starter bonus check). */
  ageAtContractStart: number
  /** True when the one-time 200 EUR Berufseinsteiger-Bonus (§84 EStG) has already been paid. */
  careerStarterBonusUsed: boolean
}

/**
 * Inputs for modeling a legacy Riester Altersvorsorgevertrag (§10a / §82 EStG).
 *
 * Old-law Riester contracts continue under the 2026 rules. No new contracts are
 * available from 2027 under the reform law. Payout is taxed under §22 Nr. 5 EStG
 * (fully taxable at personal marginal rate — same as §10a-certified products).
 */
export interface RiesterAssumptions {
  /** Monthly own contribution (before state allowances). */
  monthlyOwnContribution: number
  /** Capital already accumulated in the existing contract (0 for new contracts). */
  existingCapital: number
  eligibility: RiesterEligibility
  fees: FeeModel
  /**
   * Payout mode. Capital lump-sum is partially available (up to 30% at payout start
   * per §93 Abs. 2 EStG). The remainder must be paid out as lifelong annuity or
   * certified payout plan. Only 'leibrente' and 'zeitrente' are modeled here.
   */
  payoutMode: Extract<PayoutMode, 'leibrente' | 'zeitrente'>
  rentenfaktor: number
  /** True when the user has confirmed the Rentenfaktor matches their contract; suppresses
   *  the "Schätzwert"/"Modellwert" badge even when the value still equals the default. */
  rentenfaktorConfirmed: boolean
  zeitrenteYears: number
  /** Partial capital payout at payout start (0.0 – 0.30; §93 Abs. 2 EStG). */
  partialCapitalPct: number
  /** Monthly other retirement income for marginal-tax calculation in payout phase. */
  monthlyOtherRetirementIncome: number
}

export interface RiesterFundingResult {
  monthlyOwnContribution: number
  annualOwnContribution: number
  /** §84 EStG Grundzulage (175 EUR/year, prorated when contribution insufficient). */
  grundzulageAnnual: number
  /** §85 EStG Kinderzulage per year (185/300 EUR per child, prorated). */
  childAllowanceAnnual: number
  /** §84 EStG Berufseinsteiger-Bonus: one-time 200 EUR in first contribution year. */
  careerStarterBonusAnnual: number
  /** Total state allowances per year (Grundzulage + Kinderzulage + Berufseinsteiger). */
  totalAllowanceAnnual: number
  /**
   * §86 EStG Mindesteigenbeitrag: required own contribution for full allowances.
   * = max(Sockelbetrag, 4% × relevant income − full allowance claim).
   */
  minEigenbeitragAnnual: number
  /** Whether the own contribution meets the Mindesteigenbeitrag (no proration). */
  meetsMinContribution: boolean
  /** Proration factor (0–1) applied to allowances when contribution < minimum. */
  prorationFactor: number
  /** §10a EStG special expense deductible = min(ownContrib + allowances, 2,100 EUR). */
  specialExpenseDeductibleAnnual: number
  /** Additional income-tax saving from §10a Günstigerprüfung above the allowance value. */
  guenstigerpruefungBenefitAnnual: number
  /** Net monthly cost = own contribution minus Günstigerprüfung extra refund / 12. */
  monthlyNetCost: number
}
