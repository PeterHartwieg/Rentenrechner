import type { GermanRules, PersonalProfile } from '../domain'
import {
  calculateMarginalRetirementTax,
  calculateMonthlyRetirementPayout,
  retirementIncomeBase,
  type RetirementHealthStatus,
} from './retirementPayout'

/**
 * Net monthly payout for certified §22 Nr. 5 EStG products such as Riester
 * and Altersvorsorgedepot.
 *
 * These payouts are fully taxable as sonstige Einkünfte, with no GRV
 * Besteuerungsanteil and no bAV Versorgungsfreibetrag. They are also not
 * Versorgungsbezüge under §229 SGB V, so KV/PV applies only for freiwillig
 * gesetzlich Versicherte via the broad §240 SGB V assessment base.
 *
 * Bug-fix vs. pre-Wave-3 behaviour: `otherMonthlyIncome` now occupies BBG
 * headroom in the §240 SGB V freiwillig path (previously it only entered the
 * marginal-tax base). This unifies the certified-pension and Basisrente paths.
 */
export function netCertifiedPensionPayout(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
  /** Gross GRV monthly pension. Stacked into the marginal-tax base via
   *  statutoryPensionAnnual and into the §240 KV/PV freiwillig assessment base. */
  grvBaselineMonthly = 0,
  retirementHealthStatus: RetirementHealthStatus = 'freiwillig_gkv',
): number {
  return calculateMonthlyRetirementPayout({
    rules,
    retirementYear,
    grvBaselineMonthly,
    otherMonthlyIncome,
    grossMonthlyPayout,
    taxChannel: 'other',
    kvPvChannel: 'freiwillig_other',
    profile,
    healthStatus: retirementHealthStatus,
  }).netMonthly
}

/**
 * After-tax value of a certified §22 Nr. 5 partial capital payout.
 *
 * AVD and Riester both tax these lump sums as ordinary income in the payout
 * year. No Fünftelregelung and no §229 1/120 spreading is applied.
 */
export function afterTaxCertifiedPensionLumpSum(
  partialCapital: number,
  rules: GermanRules,
  otherAnnualIncome: number,
  retirementYear = rules.year,
  /** Gross GRV monthly pension stacked into the marginal-tax base. */
  grvBaselineMonthly = 0,
): number {
  if (partialCapital <= 0) return 0

  const lumpSumTax = calculateMarginalRetirementTax(
    rules,
    retirementIncomeBase(retirementYear, {
      grvBaselineMonthly,
      otherTaxableAnnual: otherAnnualIncome,
    }),
    {
      otherTaxableAnnual: partialCapital,
    },
  )
  return Math.max(0, partialCapital - lumpSumTax)
}
