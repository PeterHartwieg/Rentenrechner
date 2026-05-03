import type {
  GermanRules,
  InsuranceTaxMode,
  PayoutMode,
  PersonalProfile,
} from '../domain'
import { ertragsanteilByAge, legalConstants } from '../rules/legalConstants'
import type { LumpSumDeductionBreakdown } from './lumpSumBreakdown'
import {
  calculateMarginalRetirementTax,
  calculateMonthlyRetirementPayout,
  calculateProfileRetirementKvPv,
  retirementIncomeBase,
} from './retirementPayout'

/**
 * Calendar years from `contractStartYear` to the payout year.
 * Mirrors simulationContext.ts: payoutYear = currentYear + (retirementAge - currentAge).
 * Used by both the simulation context and the rules engine — single source so they
 * can never drift.
 */
export function computeRuntimeYearsAtRetirement(
  contractStartYear: number,
  currentYear: number,
  currentAge: number,
  retirementAge: number,
): number {
  const payoutYear = currentYear + (retirementAge - currentAge)
  return payoutYear - contractStartYear
}

// Derives the private-insurance tax treatment from the contract year, accumulation period, and retirement age.
// pre2005: §52 Abs. 28 EStG a.F. — payout is tax-free. Requires contractStartYear < 2005,
//   oldContractTaxFreeEligible = true (user-confirmed: ≥5 annual premiums, capital payout),
//   AND contractRuntimeYears ≥ 12.
// halbeinkuenfte: §20 Abs. 1 Nr. 6 EStG — ≥12-year contract, payout at age ≥62: only half the gain taxable at personal income tax rate.
// abgeltungsteuer: §20 Abs. 2 EStG — all other post-2004 contracts: full gain at 25% Abgeltungsteuer.
export function deriveInsuranceTaxMode(
  contractStartYear: number,
  contractRuntimeYears: number,
  retirementAge: number,
  oldContractTaxFreeEligible = true,
): 'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer' {
  const { pre2005YearBoundary, halbeinkuenfteMinRuntimeYears, halbeinkuenfteMinAge } = legalConstants.insurance
  if (
    contractStartYear < pre2005YearBoundary &&
    oldContractTaxFreeEligible &&
    contractRuntimeYears >= halbeinkuenfteMinRuntimeYears
  ) {
    return 'pre2005'
  }
  if (contractRuntimeYears >= halbeinkuenfteMinRuntimeYears && retirementAge >= halbeinkuenfteMinAge) {
    return 'halbeinkuenfte'
  }
  return 'abgeltungsteuer'
}

// Net monthly insurance payout after tax and KV/PV where applicable. (#46, #47, #59)
// For payoutMode === 'leibrente' (#59): §22 Nr. 1 Satz 3 a aa EStG Ertragsanteil method.
// For other payout modes: gain-ratio method — capital-payout tax modes (halbeinkuenfte / abgeltungsteuer / pre2005).
// Routed through calculateRetirementTax so retirement deductions are applied before computing the marginal rate. (#46)
export function netInsurancePayout(
  grossMonthlyPayout: number,
  capital: number,
  totalContributions: number,
  taxMode: InsuranceTaxMode,
  rules: GermanRules,
  otherMonthlyIncome = 0,
  retirementYear = rules.year,
  profile?: PersonalProfile,
  kvdrMember = true,
  payoutMode?: PayoutMode,
  retirementAge?: number,
  /** Gross GRV monthly pension. Stacked into the marginal-tax base via
   *  statutoryPensionAnnual and into KV/PV (freiwillig path). */
  grvBaselineMonthly = 0,
): number {
  // #59: Leibrente → Ertragsanteil method (§22 EStG), ignoring capital-payout tax mode.
  let effectiveTaxMode: InsuranceTaxMode = taxMode
  let annualGain: number
  if (payoutMode === 'leibrente' && retirementAge !== undefined) {
    const ertragsanteil = ertragsanteilByAge(retirementAge)
    annualGain = grossMonthlyPayout * 12 * ertragsanteil
    effectiveTaxMode = 'ertragsanteil'
  } else {
    const gainRatio = capital > 0 ? Math.max(0, capital - totalContributions) / capital : 0
    annualGain = grossMonthlyPayout * 12 * gainRatio
  }

  // pre2005 + KVdR (or PKV / no profile) → entirely pass-through.
  // pre2005 + freiwillig versichert still owes KV/PV via §240 SGB V — fall through
  // to the shared primitive, which short-circuits the income-tax calc on pre2005.
  if (
    effectiveTaxMode === 'pre2005' &&
    (!profile?.publicHealthInsurance || kvdrMember || !profile)
  ) {
    return grossMonthlyPayout
  }

  // No profile → no KV/PV (legacy contract for direct callers without retiree
  // context). Compute marginal tax only and skip the shared primitive (it requires
  // a real profile for the children-adjusted PV rate).
  if (!profile) {
    const marginalTax = calculateMarginalRetirementTax(
      rules,
      retirementIncomeBase(retirementYear, {
        grvBaselineMonthly,
        otherTaxableAnnual: otherMonthlyIncome * 12,
        privateInsuranceTaxMode: effectiveTaxMode,
      }),
      { privateInsuranceTaxableAnnual: annualGain },
    )
    return Math.max(0, grossMonthlyPayout - marginalTax / 12)
  }

  const kvPvChannel = profile.publicHealthInsurance && !kvdrMember
    ? 'freiwillig_other'
    : 'none'

  return calculateMonthlyRetirementPayout({
    rules,
    retirementYear,
    grvBaselineMonthly,
    otherMonthlyIncome,
    grossMonthlyPayout,
    // Tax base uses the gain (pre-multiplied by Ertragsanteil for Leibrente, gain ratio otherwise).
    taxableAnnualOverride: annualGain,
    taxChannel: 'private_insurance',
    privateInsuranceTaxMode: effectiveTaxMode,
    kvPvChannel,
    profile,
    healthStatus: kvdrMember ? 'kvdr' : 'freiwillig_gkv',
  }).netMonthly
}

// After-tax lump-sum insurance capital. (#46, #47)
// otherAnnualIncome is only used for the Halbeinkünfteverfahren marginal-tax calculation.
export function afterTaxInsuranceLumpSum(
  capital: number,
  totalContributions: number,
  taxMode: InsuranceTaxMode,
  rules: GermanRules,
  otherAnnualIncome = 0,
  retirementYear = rules.year,
  profile?: PersonalProfile,
  kvdrMember = true,
  grvBaselineMonthly = 0,
): number {
  return insuranceLumpSumBreakdown(
    capital,
    totalContributions,
    taxMode,
    rules,
    otherAnnualIncome,
    retirementYear,
    profile,
    kvdrMember,
    grvBaselineMonthly,
  ).net
}

export function insuranceLumpSumBreakdown(
  capital: number,
  totalContributions: number,
  taxMode: InsuranceTaxMode,
  rules: GermanRules,
  otherAnnualIncome = 0,
  retirementYear = rules.year,
  profile?: PersonalProfile,
  kvdrMember = true,
  /** Gross GRV monthly pension. Stacked into both income-tax and KV/PV bases. */
  grvBaselineMonthly = 0,
): LumpSumDeductionBreakdown {
  const gain = Math.max(0, capital - totalContributions)

  if (taxMode === 'pre2005') {
    if (!profile?.publicHealthInsurance || kvdrMember || !profile) {
      return { net: capital, incomeTax: 0, kvPv: 0 }
    }
    // freiwillig versichert: apply KV/PV below (marginalTax = 0).
  }

  let marginalTax = 0
  if (taxMode !== 'pre2005') {
    marginalTax = calculateMarginalRetirementTax(
      rules,
      retirementIncomeBase(retirementYear, {
        grvBaselineMonthly,
        otherTaxableAnnual: otherAnnualIncome,
        privateInsuranceTaxMode: taxMode,
      }),
      {
        privateInsuranceTaxableAnnual: gain,
      },
    )
  }

  // KV/PV for freiwillig Versicherte (#47): private insurance is not a Versorgungsbezug.
  // For lump sum, use the full lump sum as one-off monthly income; calculateRetirementKvPv caps at BBG.
  let kvPvBurden = 0
  if (profile?.publicHealthInsurance && !kvdrMember) {
    const otherMonthlyIncome = otherAnnualIncome / 12
    const kvPv = calculateProfileRetirementKvPv(
      profile,
      rules,
      retirementYear,
      {
        bavMonthlyVersorgungsbezuege: 0,
        otherMonthlyVersorgungsbezuege: 0,
        monthlyStatutoryPension: otherMonthlyIncome + grvBaselineMonthly,
        freiwilligOtherMonthlyIncome: capital,
        isFreiwilligVersichert: true,
      },
    )
    kvPvBurden = kvPv.freiwilligOtherKvMonthly + kvPv.freiwilligOtherPvMonthly
  }

  return {
    net: Math.max(0, capital - marginalTax - kvPvBurden),
    incomeTax: marginalTax,
    kvPv: kvPvBurden,
  }
}
