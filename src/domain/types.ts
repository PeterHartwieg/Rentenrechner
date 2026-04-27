export type ProductId = 'etf' | 'bav' | 'versicherung'

// pre2005: old-law contract (§52 Abs. 28 EStG) — tax-free payout
// halbeinkuenfte: post-2004, ≥12 years, payout ≥ age 62 — half the gain at personal income tax rate (§20 Abs. 1 Nr. 6 EStG)
// abgeltungsteuer: post-2004, all other cases — full gain at 25% Abgeltungsteuer (§20 Abs. 2 EStG)
export type InsuranceTaxMode = 'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer'

/**
 * bAV Durchführungsweg — determines income-tax treatment of a capital payout (Kapitalabfindung). (#48)
 *
 * - direktversicherung_3_63:  Modern Direktversicherung funded via §3 Nr. 63 EStG salary conversion.
 *   Capital payout is taxable as Versorgungsbezug per §22 Nr. 5 Satz 1 EStG. Fünftelregelung §34
 *   does NOT apply (the payment is not "Vergütung für mehrjährige Tätigkeit" under current case law).
 * - pensionskasse_3_63: Pensionskasse or Pensionsfonds funded via §3 Nr. 63 EStG.
 *   Same tax treatment as direktversicherung_3_63.
 * - pensionsfonds_3_63: see pensionskasse_3_63.
 * - direktversicherung_40b_alt: Pre-2005 Direktversicherung taxed under §40b EStG a.F.
 *   (pauschalbesteuert). Capital payout may be steuerfrei per §52 Abs. 28 EStG a.F. if
 *   all eligibility conditions are met. KV/PV as Versorgungsbezug still applies (§229 Abs. 1
 *   Satz 1 Nr. 5 SGB V) even when EStG treatment is steuerfrei.
 * - direktzusage: Direct commitment by the employer (§19 EStG). Capital payout is a
 *   Versorgungsbezug under §19 EStG. Fünftelregelung (§34 Abs. 2 Nr. 4 EStG) typically
 *   applies because the capital payment qualifies as "Vergütung für mehrjährige Tätigkeit".
 * - unterstuetzungskasse: Unterstützungskasse (§19 EStG). Same as direktzusage.
 */
export type BavDurchfuehrungsweg =
  | 'direktversicherung_3_63'    // §3 Nr. 63 EStG — modern, default
  | 'pensionskasse_3_63'         // §3 Nr. 63 EStG
  | 'pensionsfonds_3_63'         // §3 Nr. 63 EStG
  | 'direktversicherung_40b_alt' // §40b EStG a.F. — pauschalbesteuert, pre-2005 contracts
  | 'direktzusage'               // §19 EStG (Versorgungsbezug, Fünftelregelung available)
  | 'unterstuetzungskasse'       // §19 EStG (Versorgungsbezug, Fünftelregelung available)

/**
 * Income-tax mode for a bAV capital payout (Kapitalabfindung). Derived by deriveBavLumpSumTaxMode.
 *
 * - pre2005_steuerfrei: §40b EStG a.F. + eligibility confirmed → lump sum is income-tax-free.
 *   KV/PV as Versorgungsbezug still applies under §229 Abs. 1 Satz 1 Nr. 5 SGB V.
 * - fuenftelregelung: §34 Abs. 2 Nr. 4 EStG — extraordinary-income averaging over 5 years.
 *   Applicable for Direktzusage / Unterstützungskasse where the payment qualifies as
 *   "Vergütung für mehrjährige Tätigkeit".
 * - voll_versorgungsbezug: Full marginal rate in the payout year. No Fünftelregelung.
 *   Applied to all §3 Nr. 63 EStG Durchführungswege per §22 Nr. 5 EStG.
 */
export type BavLumpSumTaxMode =
  | 'pre2005_steuerfrei'   // §40b a.F. + eligible → income-tax-free
  | 'fuenftelregelung'     // §34 EStG (Direktzusage / Unterstützungskasse)
  | 'voll_versorgungsbezug' // §22 Nr. 5 EStG — full marginal rate, no Fünftelregelung


export type ReturnScenarioId = 'konservativ' | 'basis' | 'optimistisch'

export interface PersonalProfile {
  age: number
  retirementAge: number
  grossSalaryYear: number
  taxClass: 1
  children: number
  churchTax: boolean
  publicHealthInsurance: boolean
  healthAdditionalContributionPct: number
}

export interface ReturnScenario {
  id: ReturnScenarioId
  label: string
  annualReturn: number
}

export interface FeeModel {
  annualAssetFee: number
  contributionFee: number
  fixedMonthlyFee: number
  acquisitionCostPct: number
  acquisitionCostSpreadYears: number
}

export interface EtfAssumptions {
  annualAssetFee: number
  equityPartialExemption: number
}

export interface BavAssumptions {
  monthlyGrossConversion: number
  extraEmployerContributionPct: number
  extraEmployerContributionMonthly: number
  fees: FeeModel
  // #6: other monthly retirement income (GRV + other) for marginal-tax calculation
  monthlyOtherRetirementIncome: number
  // #5: when true, subtract estimatedMonthlyGrvReduction from bAV net payout
  includeGrvReduction: boolean
  // #6: true = KVdR (KV Freibetrag §226(2) SGB V, combined AN+AG PV); false = freiwillig versichert (no Freibetrag)
  kvdrMember: boolean
  // #48: bAV Durchführungsweg — determines income-tax treatment of capital payout
  durchfuehrungsweg: BavDurchfuehrungsweg
  // #48: for direktversicherung_40b_alt only — true when §52 Abs. 28 EStG a.F. conditions met
  // (≥12-year runtime, ≥5 annual premium payments, capital payout not annuity)
  pre2005EligibleTaxFree: boolean
}

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
}

export interface ScenarioAssumptions {
  inflationRate: number
  retirementEndAge: number
  returnScenarios: ReturnScenario[]
  etf: EtfAssumptions
  bav: BavAssumptions
  insurance: InsuranceAssumptions
}

export interface GermanRules {
  year: number
  employeeAllowance: number
  specialExpensesAllowance: number
  incomeTax: {
    basicAllowance: number
    firstProgressionEnd: number
    secondProgressionEnd: number
    topTaxStart: number
    solidarityFreeTax: number
  }
  socialSecurity: {
    pensionCapYear: number
    healthCareCapYear: number
    pensionEmployeeRate: number
    pensionEmployerRate: number
    unemploymentEmployeeRate: number
    unemploymentEmployerRate: number
    healthGeneralRate: number
    // ermäßigter Beitragssatz (without Krankengeld) — used for Vorsorgepauschale §39b EStG
    healthReducedRate: number
    careEmployeeBaseRate: number
    careEmployeeChildlessRate: number
    careEmployerRate: number
    careRetirementChildlessRate: number
    kvFreibetragVersorgungMonthly: number
    // §6 Abs. 7 SGB V / §55 Abs. 2 SGB XI: KV/PV Beitragsbemessungsgrenze monthly ceiling
    // (= healthCareCapYear / 12; same ceiling applies to both KV and PV in retirement)
    healthAndCareCapMonth: number
    // §18 SGB IV Bezugsgröße West — used for bAV minimum entitlement (§1a BetrAVG)
    bezugsgroesseMonthly: number
    // SGB VI Anlage 1 vorläufiges Durchschnittsentgelt — denominator for Entgeltpunkte
    durchschnittsentgelt: number
    // Aktueller Rentenwert West (monthly EUR per Entgeltpunkt) — for GRV pension estimation
    aktuellerRentenwert: number
  }
  bav: {
    taxFreePctOfPensionCap: number
    socialSecurityFreePctOfPensionCap: number
    statutoryEmployerSubsidyPct: number
  }
  capitalGains: {
    taxRate: number
    solidarityRate: number
    saverAllowance: number
    // Basiszins nach §203 BewG — published by BMF each January, used for InvStG §18 Vorabpauschale
    basiszins: number
  }
}

export interface SalaryResult {
  annualGross: number
  annualNet: number
  taxableIncome: number
  incomeTax: number
  solidarityTax: number
  social: SocialContributionBreakdown
  // BMF PAP §3: RV + GKV + PV only (no unemployment)
  vorsorgepauschale: number
}

export interface SocialContributionBreakdown {
  pension: number
  unemployment: number
  health: number
  care: number
  total: number
}

export interface BavFundingResult {
  monthlyGrossConversion: number
  annualGrossConversion: number
  monthlyNetCost: number
  annualNetCost: number
  monthlyTaxAndSvSavings: number
  annualTaxAndSvSavings: number
  monthlyMandatoryEmployerSubsidy: number
  monthlyExtraEmployerSubsidy: number
  monthlyEmployerContribution: number
  annualEmployerContribution: number
  employerSocialSecuritySavingAnnual: number
  salaryWithoutBav: SalaryResult
  salaryWithBav: SalaryResult
  // §3 Nr. 63 EStG (8% BBG) and §1 SvEV (4% BBG) limits applied to total bAV
  totalBavContributionAnnual: number
  taxFreePortionAnnual: number
  svFreePortionAnnual: number
  taxableOverflowAnnual: number
  svLiableOverflowAnnual: number
  // #5: estimated monthly GRV pension loss from salary conversion (see BACKLOG #5)
  estimatedMonthlyGrvReduction: number
}

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
  rows: YearlyProjection[]
  etfPayoutRows?: EtfPayoutRow[]
}

export interface SimulationResult {
  bavFunding: BavFundingResult
  products: ProductResult[]
}

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
   */
  privateInsuranceTaxableAnnual: number
  privateInsuranceTaxMode: InsuranceTaxMode
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
