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
} from '../domain/types'
import { careEmployeeRateForChildren } from './salary'
import { calculateRetirementKvPv, calculateRetirementTax } from './retirementTax'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'

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
 */
function computeFullRiesterAllowances(
  riester: RiesterAssumptions,
  profile: PersonalProfile,
  rules: GermanRules,
  isFirstContributionYear: boolean,
): {
  grundzulage: number
  childAllowance: number
  careerStarter: number
  total: number
} {
  const r = rules.riester

  const grundzulage = riester.eligibility.directlyEligible ? r.grundzulage : 0

  const childAllowance = riester.eligibility.directlyEligible
    ? computeRiesterChildAllowance(
        profile.childBirthYears.length,
        profile.childBirthYears,
        rules,
      )
    : 0

  const careerStarter =
    riester.eligibility.directlyEligible &&
    isFirstContributionYear &&
    !riester.eligibility.careerStarterBonusUsed &&
    riester.eligibility.ageAtContractStart <= r.careerStarterMaxAge
      ? r.careerStarterBonus
      : 0

  return {
    grundzulage,
    childAllowance,
    careerStarter,
    total: grundzulage + childAllowance + careerStarter,
  }
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
): RiesterFundingResult {
  const r = rules.riester
  const annualOwnContribution = riester.monthlyOwnContribution * 12

  // -------------------------------------------------------------------------
  // 1. Full allowances (assuming Mindesteigenbeitrag is met).
  //    Career-starter bonus: user toggles careerStarterBonusUsed in eligibility;
  //    for steady-state we treat it as used (one-time payment in first year).
  // -------------------------------------------------------------------------
  const full = computeFullRiesterAllowances(
    riester,
    profile,
    rules,
    !riester.eligibility.careerStarterBonusUsed,
  )

  // -------------------------------------------------------------------------
  // 2. §86 EStG Mindesteigenbeitrag.
  //    Relevant income = prior-year RV-Pflichtentgelt ≈ min(grossSalary, GRV BBG).
  //    minRequired = max(Sockelbetrag, 4% × relevantIncome − totalFullAllowances).
  // -------------------------------------------------------------------------
  const relevantIncome = Math.min(
    salaryResult.annualGross,
    rules.socialSecurity.pensionCapYear,
  )
  const minRequired = Math.max(
    r.sockelbetrag,
    Math.max(0, r.minEigenbeitragPct * relevantIncome - full.total),
  )

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
  // -------------------------------------------------------------------------
  const zvEWithout = salaryResult.taxableIncome
  const zvEWith = Math.max(0, zvEWithout - specialExpenseDeductibleAnnual)

  const taxWithout =
    calculateIncomeTax2026(zvEWithout, rules) +
    calculateSolidarityTax(calculateIncomeTax2026(zvEWithout, rules), rules)
  const taxWith =
    calculateIncomeTax2026(zvEWith, rules) +
    calculateSolidarityTax(calculateIncomeTax2026(zvEWith, rules), rules)

  const totalTaxSavingAnnual = Math.max(0, taxWithout - taxWith)
  const guenstigerpruefungBenefitAnnual = Math.max(0, totalTaxSavingAnnual - totalAllowanceAnnual)

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
): number {
  const riesterAnnual = grossMonthlyPayout * 12
  const otherAnnual = otherMonthlyIncome * 12

  const taxWith = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: riesterAnnual + otherAnnual,
      retirementYear,
    },
    rules,
    'single',
  )
  const taxWithout = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: otherAnnual,
      retirementYear,
    },
    rules,
    'single',
  )
  const marginalTaxAnnual = taxWith.totalTaxAnnual - taxWithout.totalTaxAnnual

  if (!profile.publicHealthInsurance) {
    return Math.max(0, grossMonthlyPayout - marginalTaxAnnual / 12)
  }

  const additionalHealthRate = (profile.healthAdditionalContributionPct ?? 0) / 100
  const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
  const careRate =
    careEmployeeRateForChildren(profile.childBirthYears, retirementYear, rules) +
    rules.socialSecurity.careEmployerRate

  const kvPv = calculateRetirementKvPv({
    bavMonthlyVersorgungsbezuege: 0,
    otherMonthlyVersorgungsbezuege: 0,
    monthlyStatutoryPension: 0,
    freiwilligOtherMonthlyIncome: grossMonthlyPayout,
    isFreiwilligVersichert: true,
    kvFreibetragVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    pvFreigrenzeVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    monthlyKvPvBbg: rules.socialSecurity.healthAndCareCapMonth,
    healthRate,
    careRate,
  })

  const kvPvMonthly = kvPv.freiwilligOtherKvMonthly + kvPv.freiwilligOtherPvMonthly
  return Math.max(0, grossMonthlyPayout - marginalTaxAnnual / 12 - kvPvMonthly)
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
  profile: PersonalProfile,
  rules: GermanRules,
  otherAnnualIncome: number,
  retirementYear = rules.year,
): number {
  if (partialCapital <= 0) return 0

  const taxWith = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: partialCapital + otherAnnualIncome,
      retirementYear,
    },
    rules,
    'single',
  )
  const taxWithout = calculateRetirementTax(
    {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: otherAnnualIncome,
      retirementYear,
    },
    rules,
    'single',
  )
  const lumpSumTax = taxWith.totalTaxAnnual - taxWithout.totalTaxAnnual
  return Math.max(0, partialCapital - lumpSumTax)
}
