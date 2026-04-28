// ---------------------------------------------------------------------------
// Statutory pension (#72)
// ---------------------------------------------------------------------------

/**
 * Inputs for estimating or overriding the GRV statutory pension.
 *
 * Two modes:
 * - Manual override: user enters the projected gross monthly pension from their
 *   official Renteninformation letter. All estimation is bypassed.
 * - EP-based estimate: user enters their accumulated Entgeltpunkte from the letter.
 *   The remaining years are assumed to earn EP at the current salary / Durchschnittsentgelt ratio.
 */
export interface StatutoryPensionAssumptions {
  /** Projected gross monthly pension from the official Renteninformation letter.
   *  null → use EP-based estimation (currentEntgeltpunkte below). */
  manualMonthlyGross: number | null
  /** Accumulated Entgeltpunkte from the last Renteninformation (used when manualMonthlyGross is null). */
  currentEntgeltpunkte: number
  /** When true, subtracts the estimated monthly GRV reduction from bAV salary conversion from the gross pension. */
  includeGrvReduction: boolean
  /**
   * Assumed annual growth rate of gross salary (as decimal, e.g. 0.02 = 2 % p.a.).
   * Used only in EP-based mode: each future year's pensionable salary is scaled by this factor
   * before being divided by Durchschnittsentgelt to compute EP. Default 0 (constant salary).
   */
  annualSalaryGrowthRate?: number
  /**
   * Assumed annual growth rate of the Rentenwert until retirement (as decimal, e.g. 0.01 = 1 % p.a.).
   * Applied in both modes: EP-based → scales rentenwertAtRetirement; manual → scales manualMonthlyGross.
   * Default 0 (constant Rentenwert, current behaviour).
   */
  rentenwertGrowthRate?: number
}

export interface StatutoryPensionResult {
  /** Gross monthly GRV pension (before income tax and KV/PV). */
  grossMonthlyPension: number
  /** Net monthly pension after income tax and KV/PV. */
  netMonthlyPension: number
  /** Income tax + Soli per month. */
  taxMonthly: number
  /** KV + PV per month (§249a SGB V half-rate on GRV). */
  kvPvMonthly: number
  /** Total projected Entgeltpunkte at retirement (earned + remaining years at current salary). */
  projectedEntgeltpunkte: number
  /** Monthly GRV reduction applied due to bAV salary conversion (0 when includeGrvReduction = false). */
  grvReductionApplied: number
}
