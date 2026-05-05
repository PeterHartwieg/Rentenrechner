// ---------------------------------------------------------------------------
// Statutory pension (Versorgungswerk + Beamtenpension)
// ---------------------------------------------------------------------------

/**
 * Which mandatory pension system the user belongs to.
 *
 * - 'grv': Deutsche Rentenversicherung (default for most employees)
 * - 'versorgungswerk': berufsständisches Versorgungswerk (lawyers, doctors, engineers, etc.)
 *   — replaces GRV; contributions count toward §10 Abs. 3 EStG Schicht-1 cap like GRV.
 *   — payouts taxed via §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil (same as GRV).
 *   — KV/PV via §229 Abs. 1 Nr. 3 SGB V (Versorgungsbezug; full health rate, §226 Abs. 2 Freibetrag).
 * - 'beamtenpension': Beamtenversorgungsgesetz pension (civil servants)
 *   — no GRV; manual-only input for pension amount.
 *   — taxed via §19 EStG as Versorgungsbezug (Versorgungsfreibetrag §19 Abs. 2 applies).
 *   — KV/PV via §229 Abs. 1 Nr. 1 SGB V (full rate, Freibetrag); typically zero for PKV holders.
 * - 'none': no mandatory pension system (e.g. permanently exempt self-employed).
 */
export type PensionBaselineType = 'grv' | 'versorgungswerk' | 'beamtenpension' | 'none'

/**
 * Inputs for estimating or overriding the statutory/occupational pension baseline.
 *
 * Two estimation modes (GRV and Versorgungswerk):
 * - Manual override: user enters the projected gross monthly pension from their
 *   official Renteninformation / Versorgungsauskunft letter.
 * - EP-based estimate: user enters accumulated Entgeltpunkte; remaining years earn
 *   EP at current salary / Durchschnittsentgelt. (GRV / VW EP-equivalent only.)
 *
 * Beamtenpension always uses manual-only mode (salary-percentage rules are plan-specific).
 */
export interface StatutoryPensionAssumptions {
  /** Which mandatory pension system applies. Default 'grv'. */
  pensionBaselineType?: PensionBaselineType
  /** Projected gross monthly pension from official letter.
   *  null → use EP-based estimation (currentEntgeltpunkte below).
   *  Always used for 'beamtenpension'. */
  manualMonthlyGross: number | null
  /** Accumulated Entgeltpunkte from the last Renteninformation (used when manualMonthlyGross is null). */
  currentEntgeltpunkte: number
  /** When true, subtracts the estimated monthly GRV reduction from bAV salary conversion from the gross pension.
   *  Only relevant for pensionBaselineType 'grv'. */
  includeGrvReduction: boolean
  /**
   * Assumed annual growth rate of gross salary (as decimal, e.g. 0.02 = 2 % p.a.).
   * Used only in EP-based mode. Default 0 (constant salary).
   */
  annualSalaryGrowthRate?: number
  /**
   * Assumed annual growth rate of the pension value (Rentenwert / Pensionswert) until retirement
   * (as decimal, e.g. 0.01 = 1 % p.a.).
   * Applied in both modes. Default 0.
   */
  rentenwertGrowthRate?: number
  /**
   * Monthly employee contribution to a Versorgungswerk.
   * Used when pensionBaselineType = 'versorgungswerk' for the §10 Abs. 3 Schicht-1 cap calculation.
   * (Employee share only; employer share entered separately if applicable.)
   */
  versorgungswerkMonthlyContribution?: number
  /**
   * Monthly employer contribution to a Versorgungswerk (for employed Versorgungswerk members).
   * Together with versorgungswerkMonthlyContribution, counts toward §10 Abs. 3 Schicht-1 cap.
   * Typically equal to the employee share (50/50 split like GRV). Default 0 (self-employed).
   */
  versorgungswerkEmployerMonthly?: number
  /**
   * Health-insurance status in retirement — drives KV/PV for retirement-phase products.
   *
   * - 'kvdr': Pflichtversichert in der KVdR (§5 Abs. 1 Nr. 11 SGB V). Assessment base
   *   limited to GRV (§237) + Versorgungsbezüge (§229) + Arbeitseinkommen. AVD, Riester,
   *   Basisrente payouts are sonstige Einkünfte → 0 GKV/PV.
   * - 'freiwillig_gkv': freiwillig versichert (§240 SGB V) — broad-base contributions on
   *   all income up to BBG; AVD, Riester, Basisrente payouts subject to full rate.
   * - 'pkv': private health insurance — no statutory KV/PV in any case.
   *
   * Default 'kvdr'. Shared toggle across all products that depend on retirement KV/PV
   * status. (bAV uses its own `kvdrMember` flag because the relevant distinction there
   * is half-rate vs full-rate Freibetrag, not whether the income is in the base at all.)
   */
  retirementHealthStatus?: 'kvdr' | 'freiwillig_gkv' | 'pkv'
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
