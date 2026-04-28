/**
 * Statutory pension (GRV) projection (#72, salary-growth + Rentenwert-indexation Group E).
 *
 * Two modes:
 * - Manual: user enters the projected gross monthly pension from their official
 *   Renteninformation letter. Rentenwert growth is applied on top.
 * - EP-based: remaining years earn EP at salary / Durchschnittsentgelt.
 *   Salary can grow at `annualSalaryGrowthRate` p.a. (decimal); BBG cap applies each year.
 *   `currentEntgeltpunkte` (from the Renteninformation letter) seeds the projection.
 *
 * After computing the gross pension:
 * - Income tax is applied via calculateRetirementTax (§22 Nr. 1 Satz 3 a aa EStG
 *   Besteuerungsanteil — cohort-based, handled inside the pipeline).
 * - KV/PV is applied via calculateRetirementKvPv (§249a SGB V half-rate for GRV
 *   pensioners in KVdR; full careRate because DRV has no employer PV share).
 *
 * Modeled simplifications (see LEGAL_REVIEW.md):
 * - Assumes KVdR membership (§5 Abs. 1 Nr. 11 SGB V) — no freiwillig-versichert path.
 * - Durchschnittsentgelt held constant at rules.year value (national average wage growth
 *   is embedded in `rentenwertGrowthRate`; personal outperformance shows up in EP/year).
 * - BBG held constant at rules.year value (conservative for high earners near the cap).
 * - GRV reduction from bAV is the estimate already in BavFundingResult.
 */

import type {
  GermanRules,
  PersonalProfile,
  StatutoryPensionAssumptions,
  StatutoryPensionResult,
} from '../domain'
import { careEmployeeRateForChildren } from './salary'
import { calculateRetirementKvPv, calculateRetirementTax } from './retirementTax'

export function projectStatutoryPension(
  profile: PersonalProfile,
  rules: GermanRules,
  assumptions: StatutoryPensionAssumptions,
  /** Monthly GRV reduction from bAV salary conversion — from BavFundingResult.estimatedMonthlyGrvReduction. */
  grvReductionMonthly: number,
  /** Calendar year pension payments begin (rules.year + retirementAge − age). */
  retirementYear: number,
): StatutoryPensionResult {
  const {
    manualMonthlyGross,
    currentEntgeltpunkte,
    includeGrvReduction,
    annualSalaryGrowthRate = 0,
    rentenwertGrowthRate = 0,
  } = assumptions

  // -------------------------------------------------------------------------
  // 1. Gross monthly pension
  // -------------------------------------------------------------------------
  const remainingYears = Math.max(0, profile.retirementAge - profile.age)

  // Rentenwert at retirement — applies in both modes.
  const rentenwertAtRetirement =
    rules.socialSecurity.aktuellerRentenwert * Math.pow(1 + rentenwertGrowthRate, remainingYears)

  let projectedEntgeltpunkte: number
  let grossMonthlyPension: number

  if (manualMonthlyGross !== null) {
    // Renteninformation already captures EP accumulation at today's salary.
    // Scale the letter value by expected Rentenwert growth to arrive at retirement value.
    grossMonthlyPension = Math.max(0, manualMonthlyGross) *
      Math.pow(1 + rentenwertGrowthRate, remainingYears)
    // Reverse-engineer EP from gross for display (uses the projected Rentenwert for consistency)
    projectedEntgeltpunkte = rentenwertAtRetirement > 0
      ? grossMonthlyPension / rentenwertAtRetirement
      : 0
  } else {
    // EP-based accumulation.
    // When salary grows, iterate year-by-year so the BBG cap applies each year independently.
    let futureEP = 0
    if (annualSalaryGrowthRate === 0) {
      // Fast path: constant salary → constant EP per year (original behaviour).
      const cappedSalary = Math.min(profile.grossSalaryYear, rules.socialSecurity.pensionCapYear)
      const epPerYear = rules.socialSecurity.durchschnittsentgelt > 0
        ? cappedSalary / rules.socialSecurity.durchschnittsentgelt
        : 0
      futureEP = remainingYears * epPerYear
    } else {
      for (let t = 0; t < remainingYears; t++) {
        const salaryT = profile.grossSalaryYear * Math.pow(1 + annualSalaryGrowthRate, t)
        const cappedT = Math.min(salaryT, rules.socialSecurity.pensionCapYear)
        futureEP += rules.socialSecurity.durchschnittsentgelt > 0
          ? cappedT / rules.socialSecurity.durchschnittsentgelt
          : 0
      }
    }
    projectedEntgeltpunkte = currentEntgeltpunkte + futureEP
    grossMonthlyPension = projectedEntgeltpunkte * rentenwertAtRetirement
  }

  // Subtract bAV-induced GRV loss if requested
  const grvReductionApplied = includeGrvReduction ? Math.max(0, grvReductionMonthly) : 0
  grossMonthlyPension = Math.max(0, grossMonthlyPension - grvReductionApplied)

  // -------------------------------------------------------------------------
  // 2. Income tax via retirement tax pipeline
  //    §22 Nr. 1 Satz 3 a aa EStG: Besteuerungsanteil applied inside calculateRetirementTax.
  // -------------------------------------------------------------------------
  const taxResult = calculateRetirementTax(
    {
      statutoryPensionAnnual: grossMonthlyPension * 12,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer', // irrelevant (no insurance income)
      otherTaxableAnnual: 0,
      retirementYear,
    },
    rules,
    'single',
  )
  const taxMonthly = taxResult.totalTaxAnnual / 12

  // -------------------------------------------------------------------------
  // 3. KV/PV: KVdR default (§5 Abs. 1 Nr. 11 SGB V)
  //    §249a SGB V: pensioner pays half healthRate; DRV pays the other half.
  //    PV: full careRate (DRV has no employer PV share).
  // -------------------------------------------------------------------------
  const additionalHealthRate = (profile.healthAdditionalContributionPct ?? 0) / 100
  const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
  const careRate =
    careEmployeeRateForChildren(profile.childBirthYears, retirementYear, rules) +
    rules.socialSecurity.careEmployerRate

  const kvPvResult = calculateRetirementKvPv({
    bavMonthlyVersorgungsbezuege: 0,
    otherMonthlyVersorgungsbezuege: 0,
    monthlyStatutoryPension: grossMonthlyPension,
    freiwilligOtherMonthlyIncome: 0,
    isFreiwilligVersichert: false,
    kvFreibetragVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    pvFreigrenzeVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    monthlyKvPvBbg: rules.socialSecurity.healthAndCareCapMonth,
    healthRate,
    careRate,
  })
  const kvPvMonthly = kvPvResult.totalKvMonthly + kvPvResult.totalPvMonthly

  const netMonthlyPension = Math.max(0, grossMonthlyPension - taxMonthly - kvPvMonthly)

  return {
    grossMonthlyPension,
    netMonthlyPension,
    taxMonthly,
    kvPvMonthly,
    projectedEntgeltpunkte,
    grvReductionApplied,
  }
}
