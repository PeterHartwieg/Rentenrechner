/**
 * Statutory pension (GRV) projection (#72).
 *
 * Two modes:
 * - Manual: user enters the projected gross monthly pension from their official
 *   Renteninformation letter. All estimation is bypassed.
 * - EP-based: remaining years earn EP at current salary / Durchschnittsentgelt.
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
 * - Assumes constant salary until retirement (no salary growth).
 * - Assumes constant Rentenwert and Durchschnittsentgelt (no indexation).
 * - GRV reduction from bAV is the estimate already in BavFundingResult.
 */

import type {
  GermanRules,
  PersonalProfile,
  StatutoryPensionAssumptions,
  StatutoryPensionResult,
} from '../domain/types'
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
  const { manualMonthlyGross, currentEntgeltpunkte, includeGrvReduction } = assumptions

  // -------------------------------------------------------------------------
  // 1. Gross monthly pension
  // -------------------------------------------------------------------------
  let projectedEntgeltpunkte: number
  let grossMonthlyPension: number

  if (manualMonthlyGross !== null) {
    grossMonthlyPension = Math.max(0, manualMonthlyGross)
    // Reverse-engineer EP from gross for display purposes only
    projectedEntgeltpunkte = rules.socialSecurity.aktuellerRentenwert > 0
      ? grossMonthlyPension / rules.socialSecurity.aktuellerRentenwert
      : 0
  } else {
    const remainingYears = Math.max(0, profile.retirementAge - profile.age)
    // Cap pensionable salary at Beitragsbemessungsgrenze
    const cappedSalary = Math.min(profile.grossSalaryYear, rules.socialSecurity.pensionCapYear)
    const epPerYear = rules.socialSecurity.durchschnittsentgelt > 0
      ? cappedSalary / rules.socialSecurity.durchschnittsentgelt
      : 0
    projectedEntgeltpunkte = currentEntgeltpunkte + remainingYears * epPerYear
    grossMonthlyPension = projectedEntgeltpunkte * rules.socialSecurity.aktuellerRentenwert
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
