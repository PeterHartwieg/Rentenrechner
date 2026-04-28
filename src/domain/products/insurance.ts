import type { FeeModel } from '../fees'
import type { PayoutMode } from './common'

// pre2005: old-law contract (§52 Abs. 28 EStG) — tax-free capital payout; Leibrente still uses Ertragsanteil.
// halbeinkuenfte: post-2004, ≥12 years, payout ≥ age 62 — half the gain at personal income tax rate (§20 Abs. 1 Nr. 6 EStG). Capital payouts only.
// abgeltungsteuer: post-2004, all other cases — full gain at 25% Abgeltungsteuer (§20 Abs. 2 EStG). Capital payouts only.
// ertragsanteil: lifelong Leibrente (payoutMode === 'leibrente') — §22 Nr. 1 Satz 3 a aa EStG Anlage 1.
//   The taxable fraction is age-based (ertragsanteilByAge), independent of the contract year.
//   Applies to ALL private Leibrenten regardless of contract era; set by netInsurancePayout, not deriveInsuranceTaxMode.
export type InsuranceTaxMode = 'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer' | 'ertragsanteil'

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
  // #54: retirement-phase payout mode — see PayoutMode docstring. Private annuity contracts
  // typically have their own Rentenfaktor distinct from the bAV contract's value.
  payoutMode: PayoutMode
  rentenfaktor: number
  zeitrenteYears: number
  // #65: Optional paid-up / surrender scenario.
  // paidUpAge: age at which contributions stop (undefined = contributions continue to retirement).
  // surrenderHaircutPct: fraction of capital deducted on immediate surrender (0 = no penalty).
  paidUpAge?: number
  surrenderHaircutPct: number
}

/**
 * Paid-up / early surrender scenario for private insurance (#65).
 *
 * Computed when InsuranceAssumptions.paidUpAge is set and lies strictly between
 * the user's current age and retirementAge. Models two outcomes branching from paidUpAge:
 *
 * 1. Immediate surrender: policyholder receives surrenderValue = capitalAtPaidUp × (1 − haircut).
 * 2. Paid-up continuation: no more contributions; contract grows under asset fees until retirement.
 */
export interface InsurancePaidUpScenario {
  paidUpAge: number
  /** Capital accumulated at paidUpAge (before any surrender haircut). */
  capitalAtPaidUp: number
  /** Total fees paid during the contribution phase (up to paidUpAge). */
  feesAtPaidUp: number
  /** Immediate surrender value = capitalAtPaidUp × (1 − surrenderHaircutPct). */
  surrenderValue: number
  /** Capital at retirement under paid-up continuation (no contributions after paidUpAge). */
  retirementCapital: number
  /** Gross monthly payout from retirementCapital under the configured payoutMode. */
  grossMonthlyPayout: number
  /** Net monthly payout after income tax and KV/PV. */
  netMonthlyPayout: number
  /** After-tax lump sum from retirementCapital (null for pre-2005 Leibrente — Ertragsanteil path). */
  afterTaxLumpSum: number | null
}
