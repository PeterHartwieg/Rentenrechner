export interface LumpSumDeductionBreakdown {
  /** Net lump sum after income tax + Soli + KV/PV. */
  net: number
  /** Total income tax + Soli on the lump sum. */
  incomeTax: number
  /** Total KV + PV on the lump sum. */
  kvPv: number
}
