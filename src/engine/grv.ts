/**
 * Statutory/occupational pension projection (handles Versorgungswerk + Beamtenpension).
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
 *   No mandatory pension system. Private insurance expense still applies.
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
import { legalConstants } from '../rules/legalConstants'
import { careEmployeeRateForChildren } from './salary'
import { calculateRetirementKvPv, calculateRetirementTax } from './retirementTax'

/**
 * Projects the employee-side GRV contribution per year from the user's current
 * age up to (but not including) retirement age.
 *
 * Returns an empty array when `pensionBaselineType` is not `'grv'` (i.e. for
 * Versorgungswerk, Beamtenpension, and none — the caller should skip rendering
 * in those cases).
 *
 * @param bavGrvReductionAnnual - Optional bAV Entgeltumwandlung reduction (annual EUR)
 *   from `BavFundingResult.estimatedMonthlyGrvReduction × 12`. Mirrors how
 *   `projectStatutoryPension` applies `includeGrvReduction`.
 */
export function projectGrvContributionTimeline(
  profile: PersonalProfile,
  rules: GermanRules,
  assumptions: StatutoryPensionAssumptions,
  bavGrvReductionAnnual?: number,
): Array<{ ageYears: number; employeeAnnualEUR: number }> {
  const { pensionBaselineType = 'grv', annualSalaryGrowthRate = 0 } = assumptions

  // Only GRV has employee contributions tracked here; VW / Beamte / none → empty.
  if (pensionBaselineType !== 'grv') return []

  const remainingYears = Math.max(0, profile.retirementAge - profile.age)
  if (remainingYears === 0) return []

  const result: Array<{ ageYears: number; employeeAnnualEUR: number }> = []
  const bavReduction = bavGrvReductionAnnual ?? 0

  for (let t = 0; t < remainingYears; t++) {
    const salaryT = profile.grossSalaryYear * Math.pow(1 + annualSalaryGrowthRate, t)
    const cappedSalaryT = Math.min(salaryT, rules.socialSecurity.pensionCapYear)
    const bavReducedSalaryT = Math.max(0, cappedSalaryT - bavReduction)
    const employeeAnnual = bavReducedSalaryT * rules.socialSecurity.pensionEmployeeRate
    result.push({ ageYears: profile.age + t, employeeAnnualEUR: employeeAnnual })
  }

  return result
}

/** Current private premiums held constant; §106 applies only to a GRV pension.
 * Source: https://www.gesetze-im-internet.de/sgb_6/__106.html
 * No subsidy on private Pflegeversicherung; no employer subsidy in retirement.
 */
export function calculatePkvRetirementMonthlyCost(
  profile: PersonalProfile,
  rules: GermanRules,
  pensionType: StatutoryPensionAssumptions['pensionBaselineType'],
  grossMonthlyPension: number,
): number {
  if (profile.publicHealthInsurance) return 0
  const kv = Math.max(0, profile.pkvMonthlyPremium ?? 0)
  const pv = Math.max(0, profile.pPVMonthlyPremium ?? 0)
  const share = legalConstants.retirementPkv.subsidyShare
  const subsidy = pensionType === 'grv' || pensionType === undefined
    ? Math.min(Math.max(0, grossMonthlyPension) *
      (rules.socialSecurity.healthGeneralRate + rules.socialSecurity.healthAverageAdditionalRate) * share, kv * share)
    : 0
  return kv + pv - subsidy
}

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

  // No pension income, but private insurance remains a household expense.
  if (pensionBaselineType === 'none') {
    return {
      grossMonthlyPension: 0,
      netMonthlyPension: 0 - calculatePkvRetirementMonthlyCost(profile, rules, pensionBaselineType, 0),
      pkvRetirementMonthlyCost: calculatePkvRetirementMonthlyCost(profile, rules, pensionBaselineType, 0),
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

  if (!profile.publicHealthInsurance) {
    // Private membership excludes statutory KV/PV on every baseline type.
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

  const pkvRetirementMonthlyCost = calculatePkvRetirementMonthlyCost(profile, rules, pensionBaselineType, grossMonthlyPension)
  const netMonthlyPension = Math.max(0, grossMonthlyPension - taxMonthly - kvPvMonthly) - pkvRetirementMonthlyCost

  return {
    grossMonthlyPension,
    netMonthlyPension,
    pkvRetirementMonthlyCost,
    taxMonthly,
    kvPvMonthly,
    projectedEntgeltpunkte,
    grvReductionApplied,
  }
}
