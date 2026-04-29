import type { FeeModel } from '../fees'

// ---------------------------------------------------------------------------
// Basisrente / Rürup-Rente (#61)
// ---------------------------------------------------------------------------

/**
 * Inputs for modeling a Basisrente (§10 Abs. 1 Nr. 2 EStG / §22 Nr. 1 Satz 3 a aa EStG).
 *
 * Basisrente (Rürup) is a Schicht-1 pension product. Contributions are deductible
 * as Sonderausgaben up to the Schicht-1 cap (shared with GRV contributions).
 * Payouts are taxed by the same §22 Besteuerungsanteil cohort table as GRV.
 * Lump-sum payouts are not permitted; only lifelong Leibrente (§10 Abs. 1 Nr. 2
 * EStG / AltZertG §2 requires a monthly lifelong annuity for old-age Basisrente).
 */
export interface BasisrenteAssumptions {
  /** Monthly premium paid into the contract (before tax saving). */
  monthlyGrossContribution: number
  fees: FeeModel
  /** Always 'leibrente' — Basisrente old-age payout must be a monthly lifelong annuity. */
  payoutMode: 'leibrente'
  rentenfaktor: number
  /** Monthly GRV + other retirement income for marginal-tax calculation in payout phase. */
  monthlyOtherRetirementIncome: number
  /**
   * Retirement health-insurance status — determines KV/PV treatment on Basisrente payouts.
   * - 'kvdr': compulsory statutory pensioner (KVdR). Basisrente is not a Versorgungsbezug
   *   (§229 SGB V), so no KV/PV is deducted.
   * - 'freiwillig_gkv': voluntary statutory member. Full §240 SGB V broad-income rate applies.
   * - 'pkv': private health insurance in retirement. No statutory KV/PV deducted.
   */
  retirementHealthStatus: 'kvdr' | 'freiwillig_gkv' | 'pkv'
}

export interface BasisrenteFundingResult {
  monthlyGrossContribution: number
  annualGrossContribution: number
  /** Annual pension-system contributions counted toward the §10 Abs. 3 Schicht-1 cap
   *  (GRV employee + employer, or Versorgungswerk contributions). */
  annualPensionContributionsTowardsCap: number
  remainingSchicht1Cap: number
  annualDeductible: number
  annualTaxSaving: number
  monthlyTaxSaving: number
  monthlyNetCost: number
}
