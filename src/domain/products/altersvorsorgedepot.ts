import type { FeeModel } from '../fees'

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
  /** True when own + allowances exceeded the contractContributionCapAnnual ceiling
   *  and `totalContractContributionAnnual` was clamped. Drives UI warnings and the
   *  comparison-card cap badge. */
  cappedAtContractMax: boolean
  /** §10a EStG deductible base = min(ownContribution, 1 800) + allowanceEntitlement. */
  specialExpenseBaseAnnual: number
  /** Additional income-tax saving from §10a Günstigerprüfung above the allowance value. */
  guenstigerpruefungBenefitAnnual: number
  /** Net monthly cost = own contribution minus Günstigerprüfung extra tax refund / 12. */
  monthlyNetCost: number
}
