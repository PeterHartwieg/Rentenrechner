/**
 * Legacy Riester / Certified Altersvorsorgevertrag engine (#62).
 *
 * Riester (§82–§93 EStG, §10a EStG) is a Schicht-2 certified old-age product.
 * Key characteristics:
 * - State allowances during accumulation: Grundzulage (§84), Kinderzulage (§85),
 *   one-time Berufseinsteiger-Bonus (§84). Granted at full rate when the saver
 *   meets the Mindesteigenbeitrag (§86), prorated otherwise.
 * - §10a EStG Günstigerprüfung: if the income-tax saving from the §10a
 *   Sonderausgabenabzug exceeds the allowances, the difference is refunded.
 * - Certified and locked. Partial capital payout up to 30% at payout start
 *   (§93 Abs. 2 EStG); the remainder must flow into a certified lifelong payout.
 * - Payout taxed under §22 Nr. 5 EStG (fully taxable at personal marginal rate;
 *   no Besteuerungsanteil, no Versorgungsfreibetrag — same as AVD and bAV §3 Nr. 63).
 * - No new contracts from 2027 under the Altersvorsorgereformgesetz; existing
 *   contracts continue under the old law.
 *
 * KV/PV:
 *   Riester payouts are not Versorgungsbezüge under §229 SGB V (they are §22 Nr. 5
 *   EStG Einkünfte). Freiwillig §240 SGB V path applies (full healthRate, no
 *   §226 Abs. 2 KV-Freibetrag). Zero when PKV (publicHealthInsurance = false).
 *
 * Relevant income for §86 Mindesteigenbeitrag:
 *   For GRV-pflichtversicherte employees: min(grossSalary, GRV BBG).
 *   Derived from salaryResult.annualGross; capped at pensionCapYear for consistency.
 *
 * Sources:
 *   §82–§86, §10a, §93 EStG; LEGAL_REVIEW.md.
 */

import type {
  GermanRules,
  PersonalProfile,
  RiesterAssumptions,
  RiesterFundingResult,
  SalaryResult,
} from '../domain'
import {
  afterTaxCertifiedPensionLumpSum,
  netCertifiedPensionPayout,
} from './certifiedPensionPayout'
import type { RetirementHealthStatus } from './retirementPayout'
import { calculateAllowanceExcessBenefit, calculateSalaryPhaseTaxDelta } from './salaryPhaseFunding'
import { childBirthYearsUnder25InYear } from './childEligibility'

// ---------------------------------------------------------------------------
// Allowance helpers
// ---------------------------------------------------------------------------

/**
 * §85 EStG Kinderzulage: total child allowances for a year.
 *
 * Per child, the allowance is:
 *   - 185 EUR/year if the child was born before 2008 (§85 Abs. 1 Satz 1 old law)
 *   - 300 EUR/year if the child was born from 2008 onwards (§85 Abs. 1 Satz 2)
 *
 * @param eligibleChildren  - Number of children with Kindergeld attribution
 * @param childBirthYears   - Birth years from the personal profile (used for pre/post-2008 split)
 * @param rules             - Year-specific rules
 */
export function computeRiesterChildAllowance(
  eligibleChildren: number,
  childBirthYears: number[],
  rules: GermanRules,
): number {
  if (eligibleChildren <= 0) return 0
  // Sort youngest-first: post-2007 children give the higher 300 EUR allowance.
  const sorted = [...childBirthYears].sort((a, b) => b - a)
  const relevant = sorted.slice(0, eligibleChildren)
  let total = 0
  for (const year of relevant) {
    total += year >= 2008
      ? rules.riester.childAllowancePost2007
      : rules.riester.childAllowancePre2008
  }
  return total
}

/**
 * Compute full (un-prorated) annual Riester allowances.
 *
 * Returns the allowances the saver would receive if the Mindesteigenbeitrag is met.
 * The caller applies proration when the actual contribution falls short.
 *
 * Eligibility branches:
 *  - directlyEligible (§79 Satz 1 EStG): Grundzulage + Kinderzulage + Berufseinsteiger-Bonus.
 *  - indirectSpouseEligible only (§79 Satz 2 EStG): Grundzulage. Kinderzulage is granted
 *    when `profile.childBirthYears` is populated, on the assumption that attribution
 *    has been transferred to this contract via §85 Abs. 2 Satz 2 EStG (the default
 *    attribution under Satz 1 is to the mother; Satz 2 allows transfer by joint
 *    application). The ZfA Riester-Rechner makes the same assumption: kids entered on
 *    the indirect spouse's input form are paid out to that contract. No Berufseinsteiger-
 *    Bonus (§84 Satz 2 limits it to "unmittelbar Zulageberechtigte").
 *  - Neither: zero.
 */
function computeFullRiesterAllowances(
  riester: RiesterAssumptions,
  profile: PersonalProfile,
  rules: GermanRules,
  isFirstContributionYear: boolean,
  contributionYear = rules.year,
): {
  grundzulage: number
  childAllowance: number
  careerStarter: number
  total: number
} {
  const r = rules.riester
  const e = riester.eligibility
  const indirectOnly = !e.directlyEligible && e.indirectSpouseEligible === true

  const grundzulage = e.directlyEligible || indirectOnly ? r.grundzulage : 0

  const childAllowance = e.directlyEligible || indirectOnly
    ? (() => {
        const eligibleChildBirthYears = childBirthYearsUnder25InYear(
          profile.childBirthYears,
          contributionYear,
        )
        return computeRiesterChildAllowance(
          eligibleChildBirthYears.length,
          eligibleChildBirthYears,
          rules,
        )
      })()
    : 0

  const careerStarter =
    e.directlyEligible &&
    isFirstContributionYear &&
    !e.careerStarterBonusUsed &&
    e.ageAtContractStart <= r.careerStarterMaxAge
      ? r.careerStarterBonus
      : 0

  return {
    grundzulage,
    childAllowance,
    careerStarter,
    total: grundzulage + childAllowance + careerStarter,
  }
}

export interface RiesterFundingOptions {
  contributionYear?: number
  isFirstContributionYear?: boolean
}

// ---------------------------------------------------------------------------
// Full Riester funding calculation
// ---------------------------------------------------------------------------

/**
 * Computes the full Riester subsidy picture: allowances, Günstigerprüfung, and
 * net monthly cost.
 *
 * @param rules        - Year-specific German rules (Riester constants, tax rates)
 * @param salaryResult - Salary calculation result (provides salary-phase zvE)
 * @param riester      - Riester assumption block
 * @param profile      - Personal profile (child birth years for §85 EStG)
 */
export function calculateRiesterFunding(
  rules: GermanRules,
  salaryResult: SalaryResult,
  riester: RiesterAssumptions,
  profile: PersonalProfile,
  options: RiesterFundingOptions = {},
): RiesterFundingResult {
  const r = rules.riester
  const annualOwnContribution = riester.monthlyOwnContribution * 12
  const contributionYear = options.contributionYear ?? rules.year
  const isFirstContributionYear =
    options.isFirstContributionYear ?? !riester.eligibility.careerStarterBonusUsed

  // -------------------------------------------------------------------------
  // 1. Full allowances (assuming Mindesteigenbeitrag is met).
  //    Career-starter bonus: user toggles careerStarterBonusUsed in eligibility;
  //    for steady-state we treat it as used (one-time payment in first year).
  // -------------------------------------------------------------------------
  const full = computeFullRiesterAllowances(
    riester,
    profile,
    rules,
    isFirstContributionYear,
    contributionYear,
  )

  // -------------------------------------------------------------------------
  // 2. §86 EStG Mindesteigenbeitrag.
  //    Direct (§79 Satz 1):
  //      Relevant income = prior-year RV-Pflichtentgelt ≈ min(grossSalary, GRV BBG).
  //      minRequired = max(Sockelbetrag, min(4% * relevantIncome, 2100) - allowances).
  //    Mittelbar (§79 Satz 2): no income-based 4% requirement — the indirect spouse
  //      only needs to pay the Sockelbetrag (60 EUR/year) on their own contract for
  //      the Grundzulage to flow in full. (The directly eligible spouse's
  //      Mindesteigenbeitrag is the caller's responsibility — see eligibility doc.)
  // -------------------------------------------------------------------------
  const indirectOnly = !riester.eligibility.directlyEligible && riester.eligibility.indirectSpouseEligible === true
  let minRequired: number
  if (indirectOnly) {
    minRequired = r.sockelbetrag
  } else {
    const relevantIncome = Math.min(
      salaryResult.annualGross,
      rules.socialSecurity.pensionCapYear,
    )
    const requiredInclAllowances = Math.min(
      r.minEigenbeitragPct * relevantIncome,
      r.annualCapInclAllowances,
    )
    minRequired = Math.max(
      r.sockelbetrag,
      Math.max(0, requiredInclAllowances - full.total),
    )
  }

  // -------------------------------------------------------------------------
  // 3. Proration factor: if own contribution < minRequired, allowances are
  //    reduced proportionally. Below the Sockelbetrag: no allowances at all.
  // -------------------------------------------------------------------------
  let prorationFactor: number
  if (annualOwnContribution >= minRequired) {
    prorationFactor = 1
  } else if (annualOwnContribution >= r.sockelbetrag) {
    prorationFactor = annualOwnContribution / minRequired
  } else {
    prorationFactor = 0
  }

  const grundzulageAnnual = full.grundzulage * prorationFactor
  const childAllowanceAnnual = full.childAllowance * prorationFactor
  const careerStarterBonusAnnual = full.careerStarter * prorationFactor
  const totalAllowanceAnnual = grundzulageAnnual + childAllowanceAnnual + careerStarterBonusAnnual

  // -------------------------------------------------------------------------
  // 4. §10a EStG Sonderausgabenabzug: capped at 2,100 EUR including allowances.
  // -------------------------------------------------------------------------
  const specialExpenseDeductibleAnnual = Math.min(
    annualOwnContribution + totalAllowanceAnnual,
    r.annualCapInclAllowances,
  )

  // -------------------------------------------------------------------------
  // 5. Günstigerprüfung: compare income-tax saving from §10a deduction against
  //    the actual allowance value. Only the excess above the allowances is an
  //    additional cash refund to the saver (the allowances themselves fund the contract).
  //
  //    Mittelbar limitation: §10a Abs. 1 Satz 1 EStG grants the deduction to the
  //    directly eligible spouse on the joint return. We use only the user's solo
  //    zvE here, so for a mittelbar saver with zero/low salary the §10a saving
  //    will read as 0 and `guenstigerpruefungBenefitAnnual` will under-report the
  //    real household benefit. The allowance leg (the part the ZfA Riester-Rechner
  //    validates) is correct; full joint Günstigerprüfung is a separate workstream.
  // -------------------------------------------------------------------------
  const { taxSavingAnnual: totalTaxSavingAnnual } = calculateSalaryPhaseTaxDelta(
    rules,
    salaryResult.taxableIncome,
    specialExpenseDeductibleAnnual,
  )
  const guenstigerpruefungBenefitAnnual = calculateAllowanceExcessBenefit(
    totalTaxSavingAnnual,
    totalAllowanceAnnual,
  )

  // -------------------------------------------------------------------------
  // 6. Net monthly cost: the actual cash the saver pays after Günstigerprüfung.
  //    Allowances flow into the contract, not back to the saver.
  // -------------------------------------------------------------------------
  const monthlyNetCost = Math.max(0, riester.monthlyOwnContribution - guenstigerpruefungBenefitAnnual / 12)

  return {
    monthlyOwnContribution: riester.monthlyOwnContribution,
    annualOwnContribution,
    grundzulageAnnual,
    childAllowanceAnnual,
    careerStarterBonusAnnual,
    totalAllowanceAnnual,
    minEigenbeitragAnnual: minRequired,
    meetsMinContribution: annualOwnContribution >= minRequired,
    prorationFactor,
    specialExpenseDeductibleAnnual,
    guenstigerpruefungBenefitAnnual,
    monthlyNetCost,
  }
}

/**
 * Inverse of calculateRiesterFunding: given a target monthly net cost
 * (out-of-pocket after the Günstigerprüfung refund), return the
 * monthlyOwnContribution that produces that net. Used by the input-sync layer
 * to keep Riester's true netto aligned with the harmonization anchor.
 *
 * Bisection over the funding forward pass — Mindesteigenbeitrag proration
 * makes an analytic inverse messy, but the function is monotonic for typical
 * contribution levels above the Sockelbetrag.
 */
export function solveRiesterOwnFromNet(
  targetMonthlyNet: number,
  rules: GermanRules,
  salaryResult: SalaryResult,
  riester: RiesterAssumptions,
  profile: PersonalProfile,
): number {
  if (targetMonthlyNet <= 0) return 0

  const forward = (monthlyOwn: number) =>
    calculateRiesterFunding(
      rules,
      salaryResult,
      { ...riester, monthlyOwnContribution: monthlyOwn },
      profile,
    ).monthlyNetCost

  let lo = 0
  let hi = Math.max(100, targetMonthlyNet * 4)
  for (let i = 0; i < 10 && forward(hi) < targetMonthlyNet; i++) {
    hi *= 2
  }

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
// Payout helpers
// ---------------------------------------------------------------------------

/**
 * Net monthly Riester payout after §22 Nr. 5 EStG income tax and KV/PV.
 *
 * §22 Nr. 5 EStG: payouts from certified Altersvorsorgeverträge are fully taxable
 * at the personal marginal rate. No Besteuerungsanteil, no Versorgungsfreibetrag.
 * Routes through otherTaxableAnnual in calculateRetirementTax (same as AVD).
 *
 * KV/PV: freiwillig §240 SGB V path (not a Versorgungsbezug).
 * Full healthRate, no §226 Abs. 2 KV-Freibetrag. Zero when PKV.
 */
export function netRiesterPayout(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
  /** Gross GRV monthly pension. Stacked into the marginal-tax base via
   *  statutoryPensionAnnual and into the §240 KV/PV freiwillig assessment base. */
  grvBaselineMonthly = 0,
  /** Retirement health-insurance status. Riester payout is sonstige Einkünfte
   *  (§22 Nr. 5 EStG) — not a Versorgungsbezug (BSG, Urteil 25.04.2007,
   *  B 12 KR 26/05 R) — so KVdR Pflichtversicherte owe 0 KV/PV; only
   *  freiwillig versicherte pay the full §240 SGB V rate. */
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
 * After-tax value of the Riester partial capital lump sum (up to 30% at payout start).
 *
 * §93 Abs. 2 EStG: partial capital payout (Einmalzahlung zu Beginn der Auszahlungsphase)
 * is taxed under §22 Nr. 5 EStG as ordinary income in the payout year.
 * No Fünftelregelung, no §34 EStG — same as §22 Nr. 5 payout from AVD.
 *
 * KV/PV: not a Versorgungsbezug (§229 SGB V). Treated as ordinary income
 * in the payout year; not subject to 1/120 spreading.
 */
export function afterTaxRiesterLumpSum(
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
