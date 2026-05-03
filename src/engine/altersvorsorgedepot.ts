/**
 * Altersvorsorgedepot 2027 engine (#66–#71).
 *
 * The Altersvorsorgedepot is a certified, locked, tax-subsidized old-age product
 * introduced by the Altersvorsorgereformgesetz (Bundestag 2026-03-27; Bundesrat consent
 * expected 2026-05-08). It replaces the old Riester scheme for new contracts from 2027.
 *
 * Key characteristics:
 * - State allowances during accumulation (tiered basic + child + career-starter).
 * - §10a EStG Günstigerprüfung: additional tax refund when marginal tax exceeds allowances.
 * - Certified and locked — no free withdrawal; certified payout rules apply.
 * - Payout taxed under §22 Nr. 5 EStG (fully taxable at personal marginal rate;
 *   no Besteuerungsanteil, no Versorgungsfreibetrag).
 * - No ETF Vorabpauschale / partial exemption during accumulation (deferred-tax regime).
 * - Standarddepot subtype has a 1.0 pp Effektivkosten cap and mandatory glidepath de-risking.
 *
 * KV/PV simplification (documented):
 *   AVD payouts are not Versorgungsbezüge under §229 SGB V. Official health-insurance
 *   guidance for the new product does not yet exist. This engine uses the freiwillig
 *   §240 SGB V path (full healthRate, no §226 Abs. 2 KV-Freibetrag) — the same
 *   documented choice as Basisrente. See ALTERSVORSORGEDEPOT_2027_RESEARCH.md.
 *
 * Sources:
 *   Altersvorsorgereformgesetz; Bundesrat Drucksache 206/26; ALTERSVORSORGEDEPOT_2027_RESEARCH.md.
 */

import type {
  AltersvorsorgedepotAssumptions,
  AltersvorsorgedepotFundingResult,
  GermanRules,
  PersonalProfile,
  SalaryResult,
} from '../domain'
import {
  afterTaxCertifiedPensionLumpSum,
  netCertifiedPensionPayout,
} from './certifiedPensionPayout'
import { calculateAllowanceExcessBenefit, calculateSalaryPhaseTaxDelta } from './salaryPhaseFunding'
import type { RetirementHealthStatus } from './retirementPayout'

// ---------------------------------------------------------------------------
// Allowance formulas
// ---------------------------------------------------------------------------

/**
 * Basic allowance (Grundzulage) for a directly eligible saver.
 *
 * Tier 1: 50% of own contributions up to 360 EUR/year → max 180 EUR.
 * Tier 2: 25% of own contributions from 360 EUR to 1 800 EUR/year → max 360 EUR.
 * Maximum: 540 EUR/year at 1 800 EUR own contribution.
 * Below 120 EUR minimum own contribution: zero.
 *
 * §10a EStG i.d.F. Altersvorsorgereformgesetz; Bundesrat Drucksache 206/26.
 */
export function computeBasicAllowance(ownContributionAnnual: number, rules: GermanRules): number {
  const avd = rules.altersvorsorgedepot
  if (ownContributionAnnual < avd.minimumOwnContributionAnnual) return 0
  const tier1 = avd.basicAllowanceTier1Rate * Math.min(ownContributionAnnual, avd.basicAllowanceTier1MaxContribution)
  const tier2 =
    avd.basicAllowanceTier2Rate *
    Math.max(0, Math.min(ownContributionAnnual, avd.basicAllowanceTier2MaxContribution) - avd.basicAllowanceTier1MaxContribution)
  return Math.min(tier1 + tier2, avd.basicAllowanceMax)
}

/**
 * Child allowance (Kinderzulage) per year.
 *
 * 100% of own contribution per eligible child, capped at 300 EUR/child/year.
 * Requires own contribution ≥ 120 EUR (minimum). See research file for Kindergeld attribution.
 */
export function computeChildAllowance(
  ownContributionAnnual: number,
  eligibleChildren: number,
  rules: GermanRules,
): number {
  if (ownContributionAnnual < rules.altersvorsorgedepot.minimumOwnContributionAnnual) return 0
  const perChild = Math.min(ownContributionAnnual, rules.altersvorsorgedepot.childAllowanceMax)
  return perChild * eligibleChildren
}

/**
 * All annual allowances for one saver.
 *
 * Returns: basic, child, career-starter bonus (one-time → capped to first year only
 * when `isFirstContributionYear = true`), indirect spouse allowance.
 */
export function computeAvdAllowances(
  ownContributionAnnual: number,
  eligibility: AltersvorsorgedepotAssumptions['eligibility'],
  rules: GermanRules,
  isFirstContributionYear = false,
): {
  basicAllowanceAnnual: number
  childAllowanceAnnual: number
  careerStarterBonusAnnual: number
  indirectSpouseAllowanceAnnual: number
  totalAllowanceAnnual: number
} {
  const avd = rules.altersvorsorgedepot

  const basic = eligibility.directlyEligible
    ? computeBasicAllowance(ownContributionAnnual, rules)
    : 0

  const child = eligibility.directlyEligible
    ? computeChildAllowance(ownContributionAnnual, eligibility.eligibleChildren, rules)
    : 0

  // Career-starter bonus: one-time, only in first contribution year, age ≤ careerStarterMaxAge.
  const careerStarter =
    eligibility.directlyEligible &&
    isFirstContributionYear &&
    !eligibility.careerStarterBonusUsed &&
    eligibility.ageAtContractStart <= avd.careerStarterMaxAge &&
    ownContributionAnnual >= avd.minimumOwnContributionAnnual
      ? avd.careerStarterBonus
      : 0

  // Indirect spouse gets a separate capped basic allowance (does NOT get child allowance).
  const indirectSpouse =
    eligibility.indirectSpouseEligible &&
    ownContributionAnnual >= avd.minimumOwnContributionAnnual
      ? Math.min(computeBasicAllowance(ownContributionAnnual, rules), avd.indirectSpouseBasicAllowanceMax)
      : 0

  const total = basic + child + careerStarter + indirectSpouse
  return {
    basicAllowanceAnnual: basic,
    childAllowanceAnnual: child,
    careerStarterBonusAnnual: careerStarter,
    indirectSpouseAllowanceAnnual: indirectSpouse,
    totalAllowanceAnnual: total,
  }
}

/**
 * Maximum monthly own contribution before the AltZertG contract cap
 * (`contractContributionCapAnnual`, 6 840 EUR/year for 2026) is breached.
 *
 * The cap limits own + allowances. Allowances saturate at own ≥ 1 800 EUR/year
 * (the basic allowance is fully claimed there; child/spouse/career-bonus
 * allowances also saturate or are constants). For any own ≥ 1 800 the allowance
 * sum is fixed at the saturated value, so the maximum permitted own is
 * `(cap − allowanceSaturated) / 12`.
 *
 * Used by the input-sync layer to clamp AVD's value when another product's
 * monthly net cost would push AVD over the contract ceiling, and by UI warnings.
 */
export function maxAvdMonthlyOwnContribution(
  eligibility: AltersvorsorgedepotAssumptions['eligibility'],
  rules: GermanRules,
  isFirstContributionYear = false,
): number {
  const avdRules = rules.altersvorsorgedepot
  // Evaluate allowances at the saturation point — any own contribution above this
  // produces the same allowance sum.
  const saturated = computeAvdAllowances(
    avdRules.basicAllowanceTier2MaxContribution,
    eligibility,
    rules,
    isFirstContributionYear,
  )
  return Math.max(0, (avdRules.contractContributionCapAnnual - saturated.totalAllowanceAnnual) / 12)
}

// ---------------------------------------------------------------------------
// Full AVD funding calculation (§10a Günstigerprüfung)
// ---------------------------------------------------------------------------

/**
 * Computes the full AVD subsidy picture: allowances, §10a deductible base,
 * Günstigerprüfung extra tax refund, and net monthly cost.
 *
 * The net monthly cost is what actually leaves the user's pocket each month:
 *   ownContribution − guenstigerpruefungBenefit / 12
 *
 * The allowances flow directly into the contract (not reducing net cost here);
 * the Günstigerprüfung is the only cash flow that reduces the user's tax bill.
 *
 * @param rules        - Year-specific rules (must include altersvorsorgedepot block)
 * @param salaryResult - Salary calculation result (provides salary-phase zvE for Günstigerprüfung)
 * @param avd          - Altersvorsorgedepot assumption block
 */
export function calculateAvdFunding(
  rules: GermanRules,
  salaryResult: SalaryResult,
  avd: AltersvorsorgedepotAssumptions,
): AltersvorsorgedepotFundingResult {
  const avdRules = rules.altersvorsorgedepot
  const annualOwnContribution = avd.monthlyOwnContribution * 12

  // -------------------------------------------------------------------------
  // 1. Allowances (using first-year logic: career bonus only in year 1).
  //    For steady-state projection, we assume the bonus was used in year 1
  //    and careerStarterBonusUsed = true for subsequent years. The UI should
  //    let the user toggle this.
  // -------------------------------------------------------------------------
  const {
    basicAllowanceAnnual,
    childAllowanceAnnual,
    careerStarterBonusAnnual,
    indirectSpouseAllowanceAnnual,
    totalAllowanceAnnual,
  } = computeAvdAllowances(annualOwnContribution, avd.eligibility, rules, !avd.eligibility.careerStarterBonusUsed)

  // -------------------------------------------------------------------------
  // 2. Contract contribution = own + allowances, capped at annual contract limit
  //    (AltZertG / Altersvorsorgereformgesetz: 6 840 EUR/year for 2026).
  // -------------------------------------------------------------------------
  const uncappedContractContributionAnnual = annualOwnContribution + totalAllowanceAnnual
  const totalContractContributionAnnual = Math.min(
    uncappedContractContributionAnnual,
    avdRules.contractContributionCapAnnual,
  )
  const cappedAtContractMax = uncappedContractContributionAnnual > avdRules.contractContributionCapAnnual

  // -------------------------------------------------------------------------
  // 3. §10a EStG special-expense deductible base.
  //    = min(ownContribution, 1 800) + allowanceEntitlement
  //    Contributions above 1 800 EUR increase neither allowance nor §10a.
  // -------------------------------------------------------------------------
  const specialExpenseBaseAnnual =
    Math.min(annualOwnContribution, avdRules.specialExpenseOwnContributionCap) + totalAllowanceAnnual

  // -------------------------------------------------------------------------
  // 4. Günstigerprüfung: compare the income-tax saving from §10a deduction
  //    against the allowance value. Only the excess above the allowance is
  //    an additional tax refund (the allowance itself already funds the contract).
  // -------------------------------------------------------------------------
  const { taxSavingAnnual: totalTaxSavingAnnual } = calculateSalaryPhaseTaxDelta(
    rules,
    salaryResult.taxableIncome,
    specialExpenseBaseAnnual,
  )
  // Extra refund above the allowance = Günstigerprüfung benefit.
  const guenstigerpruefungBenefitAnnual = calculateAllowanceExcessBenefit(
    totalTaxSavingAnnual,
    totalAllowanceAnnual,
  )

  // -------------------------------------------------------------------------
  // 5. Net monthly cost: the actual net cash the user pays after the
  //    Günstigerprüfung refund. Allowances go to the contract, not the user.
  // -------------------------------------------------------------------------
  const monthlyNetCost = Math.max(0, avd.monthlyOwnContribution - guenstigerpruefungBenefitAnnual / 12)

  return {
    monthlyOwnContribution: avd.monthlyOwnContribution,
    annualOwnContribution,
    basicAllowanceAnnual,
    childAllowanceAnnual,
    careerStarterBonusAnnual,
    indirectSpouseAllowanceAnnual,
    totalAllowanceAnnual,
    totalContractContributionAnnual,
    cappedAtContractMax,
    specialExpenseBaseAnnual,
    guenstigerpruefungBenefitAnnual,
    monthlyNetCost,
  }
}

/**
 * Inverse of calculateAvdFunding: given a target monthly net cost (out-of-pocket
 * after the Günstigerprüfung refund), return the monthlyOwnContribution that
 * produces that net. Used by the input-sync layer to keep AVD's true netto
 * aligned with the harmonization anchor across products.
 *
 * Clamped at maxAvdMonthlyOwnContribution: above that, the AltZertG contract
 * cap binds and any extra Eigenbeitrag would be refused by the provider.
 */
export function solveAvdOwnFromNet(
  targetMonthlyNet: number,
  rules: GermanRules,
  salaryResult: SalaryResult,
  avd: AltersvorsorgedepotAssumptions,
): number {
  if (targetMonthlyNet <= 0) return 0

  const avdMax = maxAvdMonthlyOwnContribution(
    avd.eligibility,
    rules,
    !avd.eligibility.careerStarterBonusUsed,
  )

  const forward = (monthlyOwn: number) =>
    calculateAvdFunding(rules, salaryResult, { ...avd, monthlyOwnContribution: monthlyOwn }).monthlyNetCost

  // Net never exceeds gross (Günstigerprüfung ≥ 0), so own ≥ net at minimum.
  let lo = 0
  let hi = Math.min(avdMax, Math.max(100, targetMonthlyNet * 4))
  for (let i = 0; i < 10 && hi < avdMax && forward(hi) < targetMonthlyNet; i++) {
    hi = Math.min(avdMax, hi * 2)
  }
  if (forward(hi) < targetMonthlyNet) return avdMax

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const net = forward(mid)
    if (Math.abs(net - targetMonthlyNet) < 0.01) return mid
    if (net < targetMonthlyNet) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// ---------------------------------------------------------------------------
// Standarddepot glidepath
// ---------------------------------------------------------------------------

/**
 * Returns the effective blended annual return for a given accumulation year,
 * applying Standarddepot glidepath constraints.
 *
 * Five years before payout: high-risk allocation clamped to 50%.
 * Two years before payout (and at payout start): high-risk allocation clamped to 30%.
 *
 * @param yearIndex        - 0-based year within accumulation (0 = first year)
 * @param yearsToRetirement - Total years to retirement (= accumulation horizon)
 * @param riskReturn       - Expected annual return of the high-risk sleeve
 * @param lowRiskReturn    - Expected annual return of the low-risk sleeve
 * @param defaultRiskAlloc - User-configured high-risk allocation before glidepath clamps
 * @param rules            - Rules with altersvorsorgedepot glidepath constants
 */
export function computeAvdGlidepathReturn(
  yearIndex: number,
  yearsToRetirement: number,
  riskReturn: number,
  lowRiskReturn: number,
  defaultRiskAlloc: number,
  rules: GermanRules,
): number {
  const avd = rules.altersvorsorgedepot
  const yearsToGo = yearsToRetirement - yearIndex
  let riskAlloc = defaultRiskAlloc
  if (yearsToGo <= 2) {
    riskAlloc = Math.min(riskAlloc, avd.glidepathHighRiskMax2YearsBefore)
  } else if (yearsToGo <= 5) {
    riskAlloc = Math.min(riskAlloc, avd.glidepathHighRiskMax5YearsBefore)
  }
  return riskAlloc * riskReturn + (1 - riskAlloc) * lowRiskReturn
}

// ---------------------------------------------------------------------------
// Payout helpers
// ---------------------------------------------------------------------------

/**
 * Net monthly payout from an Altersvorsorgedepot after §22 Nr. 5 EStG income tax
 * and KV/PV (freiwillig §240 SGB V path).
 *
 * §22 Nr. 5 EStG: benefits from certified Altersvorsorgeverträge are fully taxable
 * at the personal marginal rate. No Besteuerungsanteil (that applies only to §22 Nr. 1
 * Satz 3 a aa — GRV / Basisrente). No Versorgungsfreibetrag (§19 Abs. 2 EStG applies
 * only to §19 Versorgungsbezüge, not to §22 Nr. 5 income).
 * The payout enters the income-tax pipeline as fully taxable sonstige Einkünfte.
 *
 * KV/PV: not a Versorgungsbezug per §229 SGB V → freiwillig §240 SGB V path,
 * full rate, no §226 Abs. 2 KV-Freibetrag. Zero when PKV (publicHealthInsurance = false).
 *
 * @param grossMonthlyPayout      - Gross monthly AVD payout (before tax and KV/PV)
 * @param profile                 - Personal profile (health insurance, children, etc.)
 * @param rules                   - Year-specific rules
 * @param otherMonthlyIncome      - Other monthly retirement income for marginal-tax context
 * @param retirementYear          - Calendar year payout starts (for cohort tables elsewhere)
 */
export function netAvdPayout(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
  /** Gross GRV monthly pension. Stacked into the marginal-tax base via
   *  statutoryPensionAnnual and into the §240 KV/PV freiwillig assessment base. */
  grvBaselineMonthly = 0,
  /** Retirement health-insurance status. AVD payout is sonstige Einkünfte
   *  (§22 Nr. 5 EStG) — not a Versorgungsbezug under §229 SGB V — so KVdR
   *  Pflichtversicherte owe 0 KV/PV; only freiwillig versicherte pay
   *  the full §240 SGB V rate. PKV: also no statutory KV/PV. */
  retirementHealthStatus: RetirementHealthStatus = 'freiwillig_gkv',
): number {
  return netCertifiedPensionPayout(
    grossMonthlyPayout,
    profile,
    rules,
    otherMonthlyIncome,
    retirementYear,
    grvBaselineMonthly,
    retirementHealthStatus,
  )
}

/**
 * After-tax value of the partial capital lump sum (up to 30% of capital at payout start).
 * Taxed under §22 Nr. 5 EStG as a one-time extraordinary sonstige Einkünfte payment.
 * No Fünftelregelung (§34 EStG) applies to §22 Nr. 5 EStG payouts.
 *
 * KV/PV: §229 Abs. 1 Satz 3 SGB V 1/120 spreading applies if the lump sum is
 * a Versorgungsbezug — but AVD is not classified as such (see KV/PV note above).
 * This engine treats the partial capital as ordinary income in the payout year.
 */
export function afterTaxAvdLumpSum(
  partialCapital: number,
  _profile: PersonalProfile,
  rules: GermanRules,
  otherAnnualIncome: number,
  retirementYear = rules.year,
  /** Gross GRV monthly pension stacked into the marginal-tax base. */
  grvBaselineMonthly = 0,
): number {
  return afterTaxCertifiedPensionLumpSum(
    partialCapital,
    rules,
    otherAnnualIncome,
    retirementYear,
    grvBaselineMonthly,
  )
}

/**
 * Validate payout start age against the certified AVD rules.
 * Returns a warning string when the retirement age falls outside the 65–70 window,
 * or null when it is valid.
 */
export function validateAvdPayoutAge(retirementAge: number, rules: GermanRules): string | null {
  const avd = rules.altersvorsorgedepot
  if (retirementAge < avd.payoutMinAge) {
    return `Auszahlungsbeginn Alter ${retirementAge} liegt unter dem Mindestbeginn (${avd.payoutMinAge}). Nur bei vorgezogener gesetzlicher Rente möglich.`
  }
  if (retirementAge > avd.payoutMaxFirstAge) {
    return `Auszahlungsbeginn Alter ${retirementAge} überschreitet das maximale Erstbezugsalter (${avd.payoutMaxFirstAge}).`
  }
  return null
}
