/**
 * Statutory/occupational pension projection (Wave 15: Versorgungswerk + Beamtenpension).
 *
 * Handles four pension baseline types (PensionBaselineType):
 *
 * 'grv' (default):
 *   Deutsche Rentenversicherung. EP-based or manual estimate.
 *   Tax: §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil cohort table.
 *   KV/PV: §249a SGB V half-rate for KVdR members.
 *   bAV GRV reduction applied when includeGrvReduction = true.
 *
 * 'versorgungswerk':
 *   Berufsständisches Versorgungswerk (lawyers, doctors, engineers, etc.).
 *   Same EP-based or manual projection logic as GRV.
 *   Tax: §22 Nr. 1 Satz 3 a aa EStG — VW pensions are taxed identically to GRV.
 *   KV/PV: §229 Abs. 1 Nr. 3 SGB V Versorgungsbezüge — full health rate, §226 Abs. 2 KV-Freibetrag.
 *   (No §249a SGB V half-rate — VW is not statutory GRV.)
 *   bAV GRV reduction NOT applied (bAV does not reduce VW pension entitlement).
 *
 * 'beamtenpension':
 *   Beamtenversorgungsgesetz pension (civil servants).
 *   Manual-only mode (Ruhegehaltssatz depends on plan; user enters Versorgungsauskunft amount).
 *   Tax: §19 EStG Versorgungsbezug — Versorgungsfreibetrag §19 Abs. 2 and Werbungskosten-
 *   Pauschbetrag §9a Nr. 1b apply (same routing as bAV in the retirement tax pipeline).
 *   KV/PV: §229 Abs. 1 Nr. 1 SGB V — full health rate, §226 Abs. 2 KV-Freibetrag.
 *   Zero KV/PV for PKV holders (Beamte typically have Beihilfe + supplemental PKV).
 *   bAV GRV reduction NOT applied.
 *
 * 'none':
 *   No mandatory pension system. Returns zeros for all fields.
 *
 * Modeled simplifications (see LEGAL_REVIEW.md):
 * - GRV assumes KVdR membership (§5 Abs. 1 Nr. 11 SGB V).
 * - VW assumes GKV (freiwillig) or PKV; KV/PV zeroed when publicHealthInsurance = false.
 * - Beamtenpension assumes PKV (Beihilfe) zeroes KV/PV when publicHealthInsurance = false.
 * - Durchschnittsentgelt and BBG held constant (conservative, see #72 comment).
 * - GRV EP-based mode: salary growth iterates year-by-year; constant-salary fast path at 0 %.
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
    pensionBaselineType = 'grv',
    manualMonthlyGross,
    currentEntgeltpunkte,
    includeGrvReduction,
    annualSalaryGrowthRate = 0,
    rentenwertGrowthRate = 0,
  } = assumptions

  // 'none': all zeros — user has no mandatory pension system.
  if (pensionBaselineType === 'none') {
    return {
      grossMonthlyPension: 0,
      netMonthlyPension: 0,
      taxMonthly: 0,
      kvPvMonthly: 0,
      projectedEntgeltpunkte: 0,
      grvReductionApplied: 0,
    }
  }

  const remainingYears = Math.max(0, profile.retirementAge - profile.age)

  // -------------------------------------------------------------------------
  // 1. Gross monthly pension
  // -------------------------------------------------------------------------
  let grossMonthlyPension: number
  let projectedEntgeltpunkte: number

  if (pensionBaselineType === 'beamtenpension') {
    // Manual-only: user enters the Bruttopension from their Versorgungsauskunft.
    // Apply pension value growth (analogous to Rentenwert growth) up to retirement.
    const manual = Math.max(0, manualMonthlyGross ?? 0)
    grossMonthlyPension = manual * Math.pow(1 + rentenwertGrowthRate, remainingYears)
    projectedEntgeltpunkte = 0 // N/A for Beamtenpension
  } else {
    // GRV or Versorgungswerk: identical EP-based or manual projection logic.
    const rentenwertAtRetirement =
      rules.socialSecurity.aktuellerRentenwert * Math.pow(1 + rentenwertGrowthRate, remainingYears)

    if (manualMonthlyGross !== null) {
      grossMonthlyPension =
        Math.max(0, manualMonthlyGross) * Math.pow(1 + rentenwertGrowthRate, remainingYears)
      projectedEntgeltpunkte =
        rentenwertAtRetirement > 0 ? grossMonthlyPension / rentenwertAtRetirement : 0
    } else {
      let futureEP = 0
      if (annualSalaryGrowthRate === 0) {
        const cappedSalary = Math.min(profile.grossSalaryYear, rules.socialSecurity.pensionCapYear)
        const epPerYear =
          rules.socialSecurity.durchschnittsentgelt > 0
            ? cappedSalary / rules.socialSecurity.durchschnittsentgelt
            : 0
        futureEP = remainingYears * epPerYear
      } else {
        for (let t = 0; t < remainingYears; t++) {
          const salaryT = profile.grossSalaryYear * Math.pow(1 + annualSalaryGrowthRate, t)
          const cappedT = Math.min(salaryT, rules.socialSecurity.pensionCapYear)
          futureEP +=
            rules.socialSecurity.durchschnittsentgelt > 0
              ? cappedT / rules.socialSecurity.durchschnittsentgelt
              : 0
        }
      }
      projectedEntgeltpunkte = currentEntgeltpunkte + futureEP
      grossMonthlyPension = projectedEntgeltpunkte * rentenwertAtRetirement
    }
  }

  // GRV reduction from bAV applies only to GRV, not VW or Beamtenpension.
  const grvReductionApplied =
    pensionBaselineType === 'grv' && includeGrvReduction
      ? Math.max(0, grvReductionMonthly)
      : 0
  grossMonthlyPension = Math.max(0, grossMonthlyPension - grvReductionApplied)

  // -------------------------------------------------------------------------
  // 2. Income tax
  // -------------------------------------------------------------------------
  const additionalHealthRate = (profile.healthAdditionalContributionPct ?? 0) / 100
  const healthRate = rules.socialSecurity.healthGeneralRate + additionalHealthRate
  const careRate =
    careEmployeeRateForChildren(profile.childBirthYears, retirementYear, rules) +
    rules.socialSecurity.careEmployerRate

  let taxMonthly: number

  if (pensionBaselineType === 'beamtenpension') {
    // §19 EStG: Versorgungsbezug — Versorgungsfreibetrag §19 Abs. 2 applies.
    // Route through bavPensionAnnual (same channel as bAV Versorgungsbezüge in the pipeline).
    const taxResult = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: grossMonthlyPension * 12,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear,
      },
      rules,
      'single',
    )
    taxMonthly = taxResult.totalTaxAnnual / 12
  } else {
    // GRV and Versorgungswerk: §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil.
    const taxResult = calculateRetirementTax(
      {
        statutoryPensionAnnual: grossMonthlyPension * 12,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear,
      },
      rules,
      'single',
    )
    taxMonthly = taxResult.totalTaxAnnual / 12
  }

  // -------------------------------------------------------------------------
  // 3. KV/PV
  // -------------------------------------------------------------------------
  let kvPvMonthly: number

  if (!profile.publicHealthInsurance && pensionBaselineType !== 'grv') {
    // PKV holders: no GKV contributions on VW or Beamtenpension income.
    // (GRV stays as-is: KVdR is independent of PKV for GRV pensioners — documented simplification.)
    kvPvMonthly = 0
  } else if (pensionBaselineType === 'grv') {
    // §249a SGB V: KVdR members pay half healthRate on GRV pension; DRV pays the other half.
    // PV: full careRate (DRV has no employer PV share).
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
    kvPvMonthly = kvPvResult.totalKvMonthly + kvPvResult.totalPvMonthly
  } else {
    // Versorgungswerk (§229 Abs. 1 Nr. 3 SGB V) and Beamtenpension (§229 Abs. 1 Nr. 1 SGB V):
    // both are Versorgungsbezüge — full health rate, §226 Abs. 2 KV-Freibetrag applies.
    // Route through otherMonthlyVersorgungsbezuege (not monthlyStatutoryPension).
    const kvPvResult = calculateRetirementKvPv({
      bavMonthlyVersorgungsbezuege: 0,
      otherMonthlyVersorgungsbezuege: grossMonthlyPension,
      monthlyStatutoryPension: 0,
      freiwilligOtherMonthlyIncome: 0,
      isFreiwilligVersichert: false,
      kvFreibetragVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
      pvFreigrenzeVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
      monthlyKvPvBbg: rules.socialSecurity.healthAndCareCapMonth,
      healthRate,
      careRate,
    })
    kvPvMonthly = kvPvResult.totalKvMonthly + kvPvResult.totalPvMonthly
  }

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
