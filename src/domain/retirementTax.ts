import type { InsuranceTaxMode } from './products/insurance'

// ---------------------------------------------------------------------------
// Retirement tax pipeline (#46)
// ---------------------------------------------------------------------------

/**
 * All annual income components entering the retirement-phase tax calculation.
 * Amounts are EUR/year.
 *
 * Convention: each source is passed gross (before deductions). The pipeline
 * applies cohort-based allowances, Pauschbeträge, and routing rules internally.
 *
 * For callers that do not yet model GRV separately, set `statutoryPensionAnnual = 0`
 * and route everything else through `otherTaxableAnnual`. TODO #47: split
 * otherTaxableAnnual into statutory pension + other when the GRV module is added.
 */
export interface RetirementIncomeComponents {
  /** Gross GRV statutory pension (annual EUR). Besteuerungsanteil applied inside pipeline. */
  statutoryPensionAnnual: number
  /**
   * Gross bAV pension (annual EUR). Versorgungsfreibetrag + Zuschlag applied inside pipeline.
   * Set `bavIsLumpSum = true` to suppress the Versorgungsfreibetrag for one-time capital payouts
   * (only laufende Versorgungsbezüge qualify — §19 Abs. 2 EStG Satz 1 requires "laufende Bezüge").
   */
  bavPensionAnnual: number
  /**
   * When true, the bAV amount is a one-time capital payout (e.g. Fünftelregelung context) rather
   * than a recurring pension. Versorgungsfreibetrag is suppressed in that case.
   */
  bavIsLumpSum: boolean
  /**
   * Gain portion of private-insurance payout that enters the tax routing.
   * - halbeinkuenfte: half the gain → personal tax base
   * - abgeltungsteuer: full gain → flat 25 % Abgeltungsteuer separately, NOT in personal base
   * - pre2005: entirely tax-free (do not add to this component)
   *
   * Ignored when `privateInsuranceContributions` is set (combine-mode multi-instance path).
   */
  privateInsuranceTaxableAnnual: number
  privateInsuranceTaxMode: InsuranceTaxMode
  /**
   * Multi-instance private-insurance contributions (Group G issue 08).
   *
   * When set, the retirement-tax pipeline iterates this list and applies each
   * entry's tax mode independently, summing per-mode results into the personal
   * base (halbeinkuenfte / ertragsanteil / pre2005) or into the separate
   * Abgeltungsteuer line (abgeltungsteuer). The singleton fields
   * `privateInsuranceTaxableAnnual` + `privateInsuranceTaxMode` are ignored.
   *
   * Single-instance callers should leave this `undefined` so the legacy
   * singleton path is taken (preserves byte-identity with oracle goldens).
   */
  privateInsuranceContributions?: ReadonlyArray<{
    amount: number
    mode: InsuranceTaxMode
  }>
  /** Other ordinary taxable income (rental, part-time job, etc.) — enters personal base directly. */
  otherTaxableAnnual: number
  /**
   * Calendar year the pension/payout first begins — used for cohort-based table lookups.
   * For accumulation scenarios this equals the profile.retirementAge's calendar year.
   */
  retirementYear: number
}

/**
 * Detailed breakdown produced by `calculateRetirementTax`.
 * All amounts are EUR/year unless otherwise noted.
 */
export interface RetirementTaxBreakdown {
  // --- Taxable amounts after source-specific allowances ---
  /** GRV pension after Rentenfreibetrag (= gross × Besteuerungsanteil). */
  statutoryPensionTaxable: number
  /**
   * bAV pension after Versorgungsfreibetrag and Zuschlag.
   * Zero when bavIsLumpSum = true (Versorgungsfreibetrag suppressed).
   */
  bavPensionTaxable: number
  /**
   * Private-insurance component in the personal-tax base.
   * = privateInsuranceTaxableAnnual / 2  when mode === 'halbeinkuenfte'
   * = 0                                  when mode === 'abgeltungsteuer' (taxed separately)
   * = 0                                  when mode === 'pre2005' (tax-free)
   */
  privateInsuranceTaxable: number
  /** Other taxable income — passes through unchanged. */
  otherTaxable: number

  // --- Pauschbeträge deducted from the personal-tax base ---
  /** §9a Nr. 1b EStG: 102 EUR if bavPensionAnnual > 0, capped at bavPensionAnnual. */
  werbungskostenVersorgung: number
  /** §9a Nr. 3 EStG: 102 EUR if statutoryPensionAnnual > 0, capped at statutoryPensionTaxable. */
  werbungskostenRenten: number
  /** §10c EStG: 36 EUR (single) or 72 EUR (married). */
  sonderausgaben: number

  // --- Income-tax result ---
  /** Sum of all components minus all Pauschbeträge, floored at 0. */
  zuVersteuerndesEinkommen: number
  /** Income tax on zvE (personal rate). */
  einkommensteuer: number
  /** Solidaritätszuschlag on Einkommensteuer. */
  solidaritaetszuschlag: number
  /**
   * Flat 25 % + Soli on privateInsuranceTaxableAnnual when mode === 'abgeltungsteuer'.
   * Zero for all other modes.
   */
  abgeltungsteuerOnPrivateInsurance: number
  /** einkommensteuer + solidaritaetszuschlag + abgeltungsteuerOnPrivateInsurance */
  totalTaxAnnual: number
  /**
   * Net after-tax retirement income:
   * = (statutoryPensionAnnual + bavPensionAnnual + otherTaxableAnnual
   *    + privateInsuranceTaxableAnnual [gross, before any routing])
   *   − totalTaxAnnual
   *
   * Note: for abgeltungsteuer mode, privateInsuranceTaxableAnnual is the gain only.
   * The contributions portion is already implicitly included by callers (they compute
   * gain separately). This field reflects only what the pipeline received.
   */
  netRetirementIncomeAnnual: number
}

// ---------------------------------------------------------------------------
// Retirement KV/PV BBG-aware calculation (#47)
// ---------------------------------------------------------------------------

/**
 * All inputs needed to compute BBG-capped KV/PV deductions across multiple
 * retirement income sources for a single month.
 */
export interface RetirementKvPvContext {
  /** bAV Versorgungsbezüge before any caps, monthly EUR */
  bavMonthlyVersorgungsbezuege: number
  /** Other Versorgungsbezüge (§229 SGB V — e.g. occupational pension, direct insurance) monthly EUR */
  otherMonthlyVersorgungsbezuege: number
  /** GRV statutory pension monthly EUR */
  monthlyStatutoryPension: number
  /**
   * Only for freiwillig Versicherte (§240 SGB V): other monthly income (rental, dividends, etc.).
   * Ignored for KVdR members.
   */
  freiwilligOtherMonthlyIncome: number
  /** false = KVdR (§226 SGB V); true = freiwillig versichert (§240 SGB V) */
  isFreiwilligVersichert: boolean
  /**
   * §226(2) SGB V KV-Freibetrag — granted ONCE per month on the AGGREGATE
   * of all Versorgungsbezüge (not per source).
   */
  kvFreibetragVersorgungMonthly: number
  /**
   * §57(1) SGB XI PV-Freigrenze — all-or-nothing threshold on aggregate Versorgungsbezüge.
   * Below: zero PV on Versorgungsbezüge. Above: full amount at careRate.
   */
  pvFreigrenzeVersorgungMonthly: number
  /** §6 Abs. 7 SGB V monthly BBG ceiling (same value for both KV and PV) */
  monthlyKvPvBbg: number
  /** Total KV rate (healthGeneralRate + Zusatzbeitrag) */
  healthRate: number
  /** Total PV rate applicable to retirees (employee share + employer/Versorgungsträger share) */
  careRate: number
}

/**
 * Per-source KV/PV deductions after the aggregate BBG cap, all monthly EUR.
 */
export interface RetirementKvPvBreakdown {
  bavKvMonthly: number
  bavPvMonthly: number
  otherVersorgungsbezuegeKvMonthly: number
  otherVersorgungsbezuegePvMonthly: number
  /** Employee share of KV on statutory pension (half rate per §249a SGB V) */
  statutoryPensionKvMonthly: number
  statutoryPensionPvMonthly: number
  /** Only nonzero for freiwillig Versicherte */
  freiwilligOtherKvMonthly: number
  freiwilligOtherPvMonthly: number
  totalKvMonthly: number
  totalPvMonthly: number
  /** Diagnostic: what total KV would have been without the BBG cap */
  uncappedKvMonthly: number
  /** Diagnostic: what total PV would have been without the BBG cap */
  uncappedPvMonthly: number
}
