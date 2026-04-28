export type ProductId = 'etf' | 'bav' | 'versicherung' | 'basisrente' | 'altersvorsorgedepot' | 'riester'

/**
 * Altersvorsorgedepot subtype — determines guarantee level and investment constraints.
 * Source: Altersvorsorgereformgesetz (Bundestag 2026-03-27; Bundesrat consent expected 2026-05-08).
 *
 * - depot_no_guarantee: Standard no-guarantee depot; full equity risk allowed (SRI ≤ 5).
 * - standarddepot: Standarddepot-Vertrag with mandatory two-bucket allocation and 1.0 pp RIY cap.
 * - guarantee_80: Contract guaranteeing 80% of contributions + allowances at payout start.
 * - guarantee_100: Contract guaranteeing 100% of contributions + allowances at payout start.
 */
export type AltersvorsorgedepotSubtype =
  | 'depot_no_guarantee'
  | 'standarddepot'
  | 'guarantee_80'
  | 'guarantee_100'

/**
 * Payout mode for the Altersvorsorgedepot.
 *
 * - lifelong_annuity: Full lifelong Leibrente via a certified annuity insurer. Contractual
 *   Rentenfaktor applies (EUR/Monat per 10 000 EUR Kapital).
 * - certified_payout_plan: Recalculating drawdown plan ending no earlier than age 85
 *   (§1 Abs. 1 Nr. 4a AltZertG). Monthly amount reset at intervals up to 3 years;
 *   at least 80% of remaining capital / remaining months at each reset.
 * - hybrid_80_annuity: 80% of capital → lifelong Leibrente; 20% → variable lifelong sleeve
 *   invested at user risk (§1 Abs. 1 Nr. 4c AltZertG planned variant).
 */
export type AltersvorsorgedepotPayoutMode =
  | 'lifelong_annuity'
  | 'certified_payout_plan'
  | 'hybrid_80_annuity'

/** Eligibility inputs for AVD subsidy calculation. */
export interface AltersvorsorgedepotEligibility {
  /** Direct eligibility (GRV member, civil servant, self-employed under 67, etc.) */
  directlyEligible: boolean
  /** Indirect eligibility via a directly eligible spouse. */
  indirectSpouseEligible: boolean
  /** Number of children with Kindergeld attribution for child allowance. */
  eligibleChildren: number
  /** Age at the start of the contribution year (for career-starter bonus check). */
  ageAtContractStart: number
  /** True when the one-time 200 EUR career-starter bonus has already been used. */
  careerStarterBonusUsed: boolean
}

export interface AltersvorsorgedepotAssumptions {
  subtype: AltersvorsorgedepotSubtype
  /** Monthly own contribution (before allowances). */
  monthlyOwnContribution: number
  eligibility: AltersvorsorgedepotEligibility
  // Allocation and returns for Standarddepot / no-guarantee subtypes.
  /** Fraction of capital in the high-risk sleeve (SRI 3–5), before glidepath clamps. */
  riskAllocationPct: number
  /** Expected annual return of the high-risk fund sleeve. */
  riskAnnualReturn: number
  /** Expected annual return of the low-risk fund sleeve (SRI 1–2). */
  lowRiskAnnualReturn: number
  fees: FeeModel
  payoutMode: AltersvorsorgedepotPayoutMode
  /** For certified_payout_plan: end age (must be ≥ 85 per §1 AltZertG). */
  payoutPlanEndAge: number
  /** Partial capital payout at retirement start (0.0 – 0.30). Capped at 30% by certification rules. */
  partialCapitalPct: number
  /** One-time transfer cost deducted from capital (0–300 EUR; see transfer rules). */
  transferCostEUR: number
  /** Monthly other retirement income for marginal-tax calculation in payout phase. */
  monthlyOtherRetirementIncome: number
  /** Contractual Rentenfaktor in EUR/Monat per 10 000 EUR Kapital (lifelong_annuity mode). */
  rentenfaktor: number
  /**
   * #71: Capital transferred from an existing Riester contract (EUR).
   * When > 0, the AVD accumulation starts from this initial capital (minus transferCostEUR)
   * instead of zero. Models the Riester-to-AVD transition under AltZertG — not a taxable sale.
   * Set to the existing Riester capital (e.g. from riesterFunding.existingCapital or a manual entry).
   */
  riesterTransferCapital: number
}

// pre2005: old-law contract (§52 Abs. 28 EStG) — tax-free capital payout; Leibrente still uses Ertragsanteil.
// halbeinkuenfte: post-2004, ≥12 years, payout ≥ age 62 — half the gain at personal income tax rate (§20 Abs. 1 Nr. 6 EStG). Capital payouts only.
// abgeltungsteuer: post-2004, all other cases — full gain at 25% Abgeltungsteuer (§20 Abs. 2 EStG). Capital payouts only.
// ertragsanteil: lifelong Leibrente (payoutMode === 'leibrente') — §22 Nr. 1 Satz 3 a aa EStG Anlage 1.
//   The taxable fraction is age-based (ertragsanteilByAge), independent of the contract year.
//   Applies to ALL private Leibrenten regardless of contract era; set by netInsurancePayout, not deriveInsuranceTaxMode.
export type InsuranceTaxMode = 'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer' | 'ertragsanteil'

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

/**
 * Retirement-phase payout mode for bAV and private-insurance contracts. (#54)
 *
 * - leibrente: Lifelong annuity priced via the contractual Rentenfaktor (EUR/Monat per
 *   10 000 EUR Kapital). Payments continue past `retirementEndAge`; the calculator does
 *   not model actuarial death timing. Capital is consumed by the insurer; the policyholder
 *   does not bear longevity risk. Basis: §1 Abs. 1 Satz 1 BetrAVG (Versorgungsleistungen
 *   "auf das Leben"). The Rentenfaktor lives in the Versicherungsbedingungen of each
 *   contract; a Garantierter Mindestrentenfaktor is typically named alongside the planned
 *   value.
 * - zeitrente: Fixed-term annuity over `zeitrenteYears`. Capital depletes over that
 *   contractual horizon, independent of the user's chosen `retirementEndAge`.
 * - kapitalverzehr: Drawdown plan — capital depletes over `retirementEndAge - retirementAge`.
 *   Models a self-managed withdrawal (the ETF default), not a contractual annuity.
 */
export type PayoutMode = 'leibrente' | 'zeitrente' | 'kapitalverzehr'

export interface PersonalProfile {
  age: number
  retirementAge: number
  grossSalaryYear: number
  taxClass: 1
  // §55 Abs. 3 / Abs. 3a SGB XI: birth year of each child.
  // Kinderlosenzuschlag (+0.6 %) applies when empty. Discounts (−0.25 % per child
  // starting from the 2nd) apply only to children under 25 in the contribution year.
  childBirthYears: number[]
  churchTax: boolean
  publicHealthInsurance: boolean
  healthAdditionalContributionPct: number
  // #50: PKV premium inputs (used only when publicHealthInsurance = false).
  // pkvMonthlyPremium: gross monthly PKV premium paid by the employee.
  // pPVMonthlyPremium: monthly private Pflegeversicherung premium.
  // Employer pays §257 SGB V subsidy (half the premium, capped at GKV employer equivalent).
  pkvMonthlyPremium: number
  pPVMonthlyPremium: number
}

export interface ReturnScenario {
  id: ReturnScenarioId
  label: string
  annualReturn: number
}

export interface FeeModel {
  // #55: split from combined annualAssetFee — sum is the total ongoing capital drag
  wrapperAssetFee: number      // Versicherungsmantel / policy-value fee (% of capital p.a.)
  fundAssetFee: number         // Fonds / ETF OGC or TER (% of capital p.a.)
  contributionFee: number
  fixedMonthlyFee: number
  acquisitionCostPct: number
  acquisitionCostSpreadYears: number
  // #56: pension-phase administration fee (% of gross monthly payout, applied before income tax / KV/PV)
  pensionPayoutFeePct: number
}

export interface EtfAssumptions {
  annualAssetFee: number
  equityPartialExemption: number
}

export interface BavAssumptions {
  monthlyGrossConversion: number
  // #51: §1a Abs. 1a BetrAVG statutory minimum subsidy (15 % capped by employer SV savings).
  // Disable when the employer is fully waived under a collective agreement.
  statutoryMinimumSubsidyEnabled: boolean
  // #51: contractual employer match (fraction of monthlyGrossConversion); uncapped, stacks on top of statutory.
  contractualMatchPercent: number
  // #51: contractual fixed monthly employer contribution (EUR/month); uncapped, stacks on top of statutory.
  contractualFixedMonthly: number
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
  // #54: retirement-phase payout mode — see PayoutMode docstring.
  payoutMode: PayoutMode
  // #54: contractual Rentenfaktor in EUR/Monat per 10 000 EUR Kapital (used when payoutMode === 'leibrente').
  rentenfaktor: number
  // #54: fixed-term horizon in years (used when payoutMode === 'zeitrente').
  zeitrenteYears: number
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

export interface AltersvorsorgedepotFundingResult {
  monthlyOwnContribution: number
  annualOwnContribution: number
  /** Basic allowance (Grundzulage) per year — tiered formula, max 540 EUR. */
  basicAllowanceAnnual: number
  /** Child allowance (Kinderzulage) per year — 100% of own contribution, max 300 EUR/child. */
  childAllowanceAnnual: number
  /** One-time career-starter bonus (200 EUR) if eligible and not yet used. */
  careerStarterBonusAnnual: number
  /** Indirect spouse basic allowance (max 175 EUR) if indirectly eligible. */
  indirectSpouseAllowanceAnnual: number
  /** Total of all annual allowances. */
  totalAllowanceAnnual: number
  /** Total contract contribution = own + allowances (capped at 6 840 EUR/year limit). */
  totalContractContributionAnnual: number
  /** §10a EStG deductible base = min(ownContribution, 1 800) + allowanceEntitlement. */
  specialExpenseBaseAnnual: number
  /** Additional income-tax saving from §10a Günstigerprüfung above the allowance value. */
  guenstigerpruefungBenefitAnnual: number
  /** Net monthly cost = own contribution minus Günstigerprüfung extra tax refund / 12. */
  monthlyNetCost: number
}

export interface ScenarioAssumptions {
  inflationRate: number
  retirementEndAge: number
  returnScenarios: ReturnScenario[]
  etf: EtfAssumptions
  bav: BavAssumptions
  insurance: InsuranceAssumptions
  statutoryPension: StatutoryPensionAssumptions
  basisrente: BasisrenteAssumptions
  altersvorsorgedepot: AltersvorsorgedepotAssumptions
  riester: RiesterAssumptions
}

export interface GermanRules {
  year: number
  employeeAllowance: number
  specialExpensesAllowance: number
  /**
   * Altersvorsorgedepot 2027 constants.
   * Source: Altersvorsorgereformgesetz (Bundestag 2026-03-27; Bundesrat consent expected 2026-05-08).
   * Values are from the Bundestag-adopted text (Bundesrat Drucksache 206/26).
   */
  altersvorsorgedepot: {
    /** First year new AVD contracts are available (2027). */
    productStartYear: number
    /** §10a EStG: own contributions deductible up to this amount per year. */
    specialExpenseOwnContributionCap: number
    /** Maximum annual contract own contribution (no extra allowance above subsidy band). */
    contractContributionCapAnnual: number
    /** Minimum own contribution required for any allowances (120 EUR/year). */
    minimumOwnContributionAnnual: number
    /** Tier-1 basic allowance: 50% of own contributions up to this amount (360 EUR). */
    basicAllowanceTier1MaxContribution: number
    basicAllowanceTier1Rate: number
    /** Tier-2 basic allowance: 25% of own contributions from tier-1 max up to 1 800 EUR. */
    basicAllowanceTier2MaxContribution: number
    basicAllowanceTier2Rate: number
    /** Maximum direct basic allowance per year (540 EUR). */
    basicAllowanceMax: number
    /** Maximum indirect spouse basic allowance per year (175 EUR). */
    indirectSpouseBasicAllowanceMax: number
    /** One-time career-starter bonus in EUR (200 EUR). */
    careerStarterBonus: number
    /** Maximum age (inclusive) for career-starter bonus (under 25 = age ≤ 24). */
    careerStarterMaxAge: number
    /** Child allowance rate: 100% of own contribution per eligible child. */
    childAllowanceRate: number
    /** Maximum child allowance per eligible child per year (300 EUR). */
    childAllowanceMax: number
    /** Standarddepot Effektivkosten cap in decimal (1.0 pp = 0.01). */
    standarddepotEffektivkostenCap: number
    /** High-risk allocation max 5 years before payout start (Standarddepot glidepath). */
    glidepathHighRiskMax5YearsBefore: number
    /** High-risk allocation max 2 years before and at payout start (Standarddepot glidepath). */
    glidepathHighRiskMax2YearsBefore: number
    /** Minimum payout start age (65). */
    payoutMinAge: number
    /** Maximum first payout age (70). */
    payoutMaxFirstAge: number
    /** Maximum partial capital payout fraction at payout start (30%). */
    partialCapitalMaxPct: number
    /** Minimum payout plan end age (85). */
    payoutPlanMinEndAge: number
    /** Max transfer cost from old provider within first 5 years (150 EUR). */
    transferCostOldProviderWithin5YearsEUR: number
    /** Max one-time admin fee from new provider (150 EUR). */
    transferCostNewProviderEUR: number
  }
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
  basisrente: {
    /** §10 Abs. 3 EStG Höchstbetrag for single filers (Einzelveranlagung). */
    schicht1CapSingle: number
    /** Deductible fraction of contributions (§10 Abs. 3 EStG: 100% from 2023). */
    deductibleFraction: number
  }
  /**
   * Legacy Riester / Altersvorsorgevertrag constants (§84–§86, §10a EStG old law).
   * Applies to existing contracts in 2026. No new contracts from 2027 under the reform.
   */
  riester: {
    /** §84 EStG Grundzulage per year (175 EUR in 2026). */
    grundzulage: number
    /** §85 EStG Kinderzulage for children born before 2008 (185 EUR/year). */
    childAllowancePre2008: number
    /** §85 EStG Kinderzulage for children born from 2008 onwards (300 EUR/year). */
    childAllowancePost2007: number
    /** §84 EStG Berufseinsteiger-Bonus: one-time 200 EUR for new savers under 25. */
    careerStarterBonus: number
    /** Maximum age (inclusive) for career-starter bonus (under 25 = age ≤ 24). */
    careerStarterMaxAge: number
    /** §86 EStG Mindesteigenbeitragssatz: 4% of prior-year relevant income. */
    minEigenbeitragPct: number
    /** §86 EStG Sockelbetrag: minimum own contribution regardless of income (60 EUR/year). */
    sockelbetrag: number
    /** §10a EStG annual deductible cap including own contributions + allowances (2,100 EUR). */
    annualCapInclAllowances: number
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
  // #50: PKV cost fields (0 when publicHealthInsurance = true)
  pkv257SubsidyMonthly: number  // §257 SGB V employer subsidy (tax-free, §3 Nr. 62 EStG)
  pkvNetMonthlyCost: number     // net PKV cost = premium + pPV premium − §257 subsidy
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
  // #51: §1a Abs. 1a BetrAVG statutory minimum subsidy (15 % conversion, capped by employer SV savings).
  monthlyStatutoryEmployerSubsidy: number
  // #51: contractual employer match + fixed contribution (uncapped).
  monthlyContractualEmployerContribution: number
  // #51: effective employer contribution actually paid into the bAV (= statutory + contractual).
  monthlyEffectiveEmployerContribution: number
  // Same as monthlyEffectiveEmployerContribution; retained as the canonical field consumed downstream.
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
  // #57: Effektivkosten / Reduction in Yield for the accumulation phase (pp)
  accumulationRiy: number
  // #64: nominal break-even age for Leibrente mode — age at which cumulative gross payouts equal capitalAtRetirement.
  //   grossBreakEvenAge = retirementAge + capitalAtRetirement / (grossMonthlyPayout * 12)
  //   Only set when payoutMode === 'leibrente'; undefined for other payout modes.
  leibrenteBreakEvenAge?: number
  // #65: paid-up / surrender scenario (only set for productId === 'versicherung' when paidUpAge is configured).
  paidUpScenario?: InsurancePaidUpScenario
  rows: YearlyProjection[]
  etfPayoutRows?: EtfPayoutRow[]
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

export interface SimulationResult {
  bavFunding: BavFundingResult
  products: ProductResult[]
  statutoryPension: StatutoryPensionResult
  basisrenteFunding: BasisrenteFundingResult
  altersvorsorgedepotFunding: AltersvorsorgedepotFundingResult
  riesterFunding: RiesterFundingResult
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
