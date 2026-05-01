import type {
  BavDurchfuehrungsweg,
  BavLumpSumTaxMode,
  GermanRules,
  PersonalProfile,
} from '../domain'
import { legalConstants } from '../rules/legalConstants'
import type { LumpSumDeductionBreakdown } from './lumpSumBreakdown'
import {
  calculateMarginalRetirementTax,
  calculateProfileRetirementKvPv,
  retirementIncomeBase,
} from './retirementPayout'

/**
 * Derives the income-tax mode for a bAV capital payout (Kapitalabfindung) from the
 * Durchführungsweg and (where relevant) the pre-2005 eligibility flag. (#48)
 */
export function deriveBavLumpSumTaxMode(
  durchfuehrungsweg: BavDurchfuehrungsweg,
  pre2005EligibleTaxFree: boolean,
): BavLumpSumTaxMode {
  if (durchfuehrungsweg === 'direktversicherung_40b_alt') {
    return pre2005EligibleTaxFree ? 'pre2005_steuerfrei' : 'voll_versorgungsbezug'
  }
  if (durchfuehrungsweg === 'direktzusage' || durchfuehrungsweg === 'unterstuetzungskasse') {
    return 'fuenftelregelung'
  }
  // All *_3_63 Durchführungswege → full marginal rate (no Fünftelregelung).
  return 'voll_versorgungsbezug'
}

/**
 * §229 SGB V 1/120: after-tax bAV capital payout (Kapitalabfindung). (#6, #19, #46, #47, #48)
 *
 * Income tax routing is determined by `taxMode` (derived via `deriveBavLumpSumTaxMode`):
 * - pre2005_steuerfrei: income tax = 0, KV/PV via §229 still applies.
 * - fuenftelregelung: 5 × (tax(other + lumpSum/5) − tax(other)).
 * - voll_versorgungsbezug: full marginal-rate computation in the payout year.
 */
export function afterTaxBavLumpSum(
  lumpSum: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherAnnualIncome = 0,
  kvdrMember = true,
  retirementYear = rules.year,
  taxMode: BavLumpSumTaxMode = 'fuenftelregelung',
  grvBaselineMonthly = 0,
): number {
  return bavLumpSumBreakdown(
    lumpSum,
    profile,
    rules,
    otherAnnualIncome,
    kvdrMember,
    retirementYear,
    taxMode,
    grvBaselineMonthly,
  ).net
}

export function bavLumpSumBreakdown(
  lumpSum: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherAnnualIncome = 0,
  kvdrMember = true,
  retirementYear = rules.year,
  taxMode: BavLumpSumTaxMode = 'fuenftelregelung',
  /** Gross GRV monthly pension. Stacked into both income-tax and KV/PV bases. */
  grvBaselineMonthly = 0,
): LumpSumDeductionBreakdown {
  if (lumpSum <= 0) return { net: 0, incomeTax: 0, kvPv: 0 }

  let incomeTax: number

  if (taxMode === 'pre2005_steuerfrei') {
    incomeTax = 0
  } else if (taxMode === 'fuenftelregelung') {
    const fuenftel = legalConstants.bav.fuenftelregelungDivisor
    incomeTax = Math.max(0, fuenftel * calculateMarginalRetirementTax(
      rules,
      retirementIncomeBase(retirementYear, {
        grvBaselineMonthly,
        otherTaxableAnnual: otherAnnualIncome,
      }),
      {
        bavPensionAnnual: lumpSum / fuenftel,
        bavIsLumpSum: true,
      },
    ))
  } else {
    // Preserve the existing routing for §22 Nr. 5 full-rate bAV lump sums:
    // user-entered other income is treated as bavPensionAnnual context, while GRV
    // remains in the statutory-pension channel.
    incomeTax = Math.max(0, calculateMarginalRetirementTax(
      rules,
      {
        bavPensionAnnual: otherAnnualIncome,
        bavIsLumpSum: true,
        statutoryPensionAnnual: grvBaselineMonthly * 12,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear,
      },
      {
        bavPensionAnnual: lumpSum,
        bavIsLumpSum: true,
      },
    ))
  }

  if (!profile.publicHealthInsurance) {
    return { net: Math.max(0, lumpSum - incomeTax), incomeTax, kvPv: 0 }
  }

  const spreadingMonths = legalConstants.bav.versorgungsbezugSpreadingMonths
  const monthlyBase = lumpSum / spreadingMonths
  const monthlyOtherIncome = otherAnnualIncome / 12

  const kvPv = calculateProfileRetirementKvPv(
    profile,
    rules,
    retirementYear,
    {
      bavMonthlyVersorgungsbezuege: monthlyBase,
      otherMonthlyVersorgungsbezuege: 0,
      monthlyStatutoryPension: monthlyOtherIncome + grvBaselineMonthly,
      freiwilligOtherMonthlyIncome: 0,
      isFreiwilligVersichert: !kvdrMember,
    },
  )

  const kvPvTotal =
    (kvPv.bavKvMonthly + kvPv.bavPvMonthly) * spreadingMonths

  return {
    net: Math.max(0, lumpSum - incomeTax - kvPvTotal),
    incomeTax,
    kvPv: kvPvTotal,
  }
}

// #6/#47: marginal-tax approach — income tax on (bAV + other) minus tax on (other alone).
// kvdrMember: true = KVdR (KV Freibetrag §226(2) SGB V); false = freiwillig versichert (no Freibetrag, §240 SGB V).
export function netBavPayout(
  grossMonthlyPayout: number,
  profile: PersonalProfile,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  kvdrMember = true,
  retirementYear = rules.year,
  /** Gross GRV monthly pension. Stacked into the marginal-tax base via
   *  statutoryPensionAnnual (Besteuerungsanteil applied) and into KV/PV. */
  grvBaselineMonthly = 0,
): number {
  const bavAnnual = grossMonthlyPayout * 12
  const otherAnnual = otherMonthlyIncome * 12

  const marginalAnnualTax = calculateMarginalRetirementTax(
    rules,
    retirementIncomeBase(retirementYear, {
      grvBaselineMonthly,
      otherTaxableAnnual: otherAnnual,
    }),
    {
      bavPensionAnnual: bavAnnual,
    },
  )

  if (!profile.publicHealthInsurance) {
    return Math.max(0, grossMonthlyPayout - marginalAnnualTax / 12)
  }

  const kvPv = calculateProfileRetirementKvPv(
    profile,
    rules,
    retirementYear,
    {
      bavMonthlyVersorgungsbezuege: grossMonthlyPayout,
      otherMonthlyVersorgungsbezuege: 0,
      monthlyStatutoryPension: otherMonthlyIncome + grvBaselineMonthly,
      freiwilligOtherMonthlyIncome: 0,
      isFreiwilligVersichert: !kvdrMember,
    },
  )

  return Math.max(0, grossMonthlyPayout - marginalAnnualTax / 12 - kvPv.bavKvMonthly - kvPv.bavPvMonthly)
}
