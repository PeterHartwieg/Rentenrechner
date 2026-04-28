import type { FeeModel } from '../fees'
import type { PayoutMode } from './common'

// ---------------------------------------------------------------------------
// Basisrente / Rürup-Rente (#61)
// ---------------------------------------------------------------------------

/**
 * Inputs for modeling a Basisrente (§10 Abs. 1 Nr. 2 EStG / §22 Nr. 1 Satz 3 a aa EStG).
 *
 * Basisrente (Rürup) is a Schicht-1 pension product. Contributions are deductible
 * as Sonderausgaben up to the Schicht-1 cap (shared with GRV contributions).
 * Payouts are taxed by the same §22 Besteuerungsanteil cohort table as GRV.
 * Lump-sum payouts are not permitted; only lifelong annuity or Zeitrente.
 */
export interface BasisrenteAssumptions {
  /** Monthly premium paid into the contract (before tax saving). */
  monthlyGrossContribution: number
  fees: FeeModel
  // Only 'leibrente' and 'zeitrente' are legally available for Basisrente.
  // 'kapitalverzehr' (full capital payout) is not permitted.
  payoutMode: Extract<PayoutMode, 'leibrente' | 'zeitrente'>
  rentenfaktor: number
  zeitrenteYears: number
  /** Monthly GRV + other retirement income for marginal-tax calculation in payout phase. */
  monthlyOtherRetirementIncome: number
}

export interface BasisrenteFundingResult {
  monthlyGrossContribution: number
  annualGrossContribution: number
  annualGrvCountedTowardsCap: number
  remainingSchicht1Cap: number
  annualDeductible: number
  annualTaxSaving: number
  monthlyTaxSaving: number
  monthlyNetCost: number
}
