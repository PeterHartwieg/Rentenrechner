import type {
  GermanRules,
  PersonalProfile,
  RetirementIncomeComponents,
  RetirementKvPvBreakdown,
  RetirementKvPvContext,
} from '../domain'
import { careEmployeeRateForChildren } from './salary'
import { calculateRetirementKvPv, calculateRetirementTax } from './retirementTax'

export type RetirementHealthStatus = 'kvdr' | 'freiwillig_gkv' | 'pkv'

/**
 * Tax-channel routing for the monthly net-payout primitive.
 *
 * - 'statutory_pension': flows into the GRV Besteuerungsanteil channel — used by
 *   Basisrente (same §22 Nr. 1 Satz 3 a aa EStG cohort table as GRV).
 * - 'bav_pension': enters the §19 Versorgungsbezug base, exposing the
 *   Versorgungsfreibetrag + Zuschlag for laufende Rentenzahlung.
 * - 'private_insurance': enters via privateInsuranceTaxableAnnual, with mode
 *   selecting Halbeinkünfte / Abgeltungsteuer / Ertragsanteil / pre-2005 routing.
 *   The caller pre-multiplies any required factor (e.g. Ertragsanteil fraction).
 * - 'other': §22 Nr. 5 EStG sonstige Einkünfte — used by AVD and Riester.
 */
export type RetirementTaxChannel =
  | 'statutory_pension'
  | 'bav_pension'
  | 'private_insurance'
  | 'other'

/**
 * KV/PV-channel routing for the monthly net-payout primitive.
 *
 * - 'bav_versorgungsbezug': §229 SGB V Versorgungsbezug — full healthRate, with
 *   the §226 Abs. 2 SGB V Freibetrag granted to KVdR members (and PV Freigrenze).
 * - 'freiwillig_other': §240 SGB V broad-income channel — only relevant when
 *   the retiree is freiwillig versichert; ignored otherwise.
 * - 'none': payout never owes statutory KV/PV (e.g. private-insurance Leibrente
 *   for KVdR members; Basisrente for KVdR members).
 */
export type RetirementKvPvChannel = 'bav_versorgungsbezug' | 'freiwillig_other' | 'none'

export interface RetirementMonthlyPayoutBreakdown {
  /** Net monthly payout after tax and KV/PV. */
  netMonthly: number
  /** Marginal annual income-tax delta of adding the payout to the base. */
  marginalTaxAnnual: number
  /** Monthly KV + PV charged on the payout itself. */
  kvPvMonthly: number
}

/**
 * Shared monthly-payout cascade for marginal retirement tax + monthly KV/PV.
 *
 * Builds a baseline retirement-income context from `grvBaselineMonthly` +
 * `otherMonthlyIncome`, then computes (1) the marginal income-tax delta of
 * adding the requested payout via `taxChannel`, and (2) the monthly KV/PV
 * charged on the payout via `kvPvChannel`.
 *
 * Lump-sum helpers (afterTaxBavLumpSum, insuranceLumpSumBreakdown, certified
 * partial-capital helpers) deliberately stay separate — they need different
 * semantics (Fünftelregelung, §229 SGB V 1/120 spreading, all-tax-free
 * pre-2005 short-circuit) that don't fit a single monthly cascade.
 */
export function calculateMonthlyRetirementPayout(input: {
  rules: GermanRules
  retirementYear: number
  /** Gross GRV monthly pension (Besteuerungsanteil applied; KV/PV at §249a half-rate / §240). */
  grvBaselineMonthly: number
  /**
   * Other taxable retirement monthly income (already in payout, e.g. an existing
   * pension or §22 Nr. 5 stream). Stacked into the marginal-tax base via
   * `otherTaxableAnnual` and into the freiwillig §240 SGB V BBG headroom.
   */
  otherMonthlyIncome: number
  /** Gross monthly payout being added. */
  grossMonthlyPayout: number
  /** Pre-multiplied annual taxable amount for tax purposes (e.g. annualGain for insurance). */
  taxableAnnualOverride?: number
  /** Where the payout enters the income-tax pipeline. */
  taxChannel: RetirementTaxChannel
  /** Tax mode for private-insurance channel — required iff taxChannel = 'private_insurance'. */
  privateInsuranceTaxMode?: RetirementIncomeComponents['privateInsuranceTaxMode']
  /** Where the payout enters the KV/PV pipeline. */
  kvPvChannel: RetirementKvPvChannel
  profile: PersonalProfile
  /** Retiree health-insurance status (selects KVdR / freiwillig / PKV branch). */
  healthStatus: RetirementHealthStatus
}): RetirementMonthlyPayoutBreakdown {
  const {
    rules,
    retirementYear,
    grvBaselineMonthly,
    otherMonthlyIncome,
    grossMonthlyPayout,
    taxableAnnualOverride,
    taxChannel,
    privateInsuranceTaxMode = 'abgeltungsteuer',
    kvPvChannel,
    profile,
    healthStatus,
  } = input

  const grossAnnual = grossMonthlyPayout * 12
  const taxableAnnual = taxableAnnualOverride ?? grossAnnual
  const otherAnnual = otherMonthlyIncome * 12

  // -------------------------------------------------------------------------
  // 1. Marginal income tax. Skip the calculation when the tax channel is
  //    pre-2005 private insurance (handled by callers as a short-circuit).
  // -------------------------------------------------------------------------
  let marginalTaxAnnual = 0
  if (!(taxChannel === 'private_insurance' && privateInsuranceTaxMode === 'pre2005')) {
    const base = retirementIncomeBase(retirementYear, {
      grvBaselineMonthly,
      otherTaxableAnnual: otherAnnual,
      privateInsuranceTaxMode:
        taxChannel === 'private_insurance' ? privateInsuranceTaxMode : undefined,
    })
    let delta: RetirementIncomeDelta
    if (taxChannel === 'statutory_pension') {
      delta = { statutoryPensionAnnual: taxableAnnual }
    } else if (taxChannel === 'bav_pension') {
      delta = { bavPensionAnnual: taxableAnnual }
    } else if (taxChannel === 'private_insurance') {
      delta = { privateInsuranceTaxableAnnual: taxableAnnual }
    } else {
      delta = { otherTaxableAnnual: taxableAnnual }
    }
    marginalTaxAnnual = Math.max(0, calculateMarginalRetirementTax(rules, base, delta))
  }

  // -------------------------------------------------------------------------
  // 2. KV/PV. PKV and explicit 'none' KV channels owe nothing.
  //    Note on freiwillig + GRV stacking: §249a SGB V applies the half-rate to
  //    statutory pension only for KVdR members. For freiwillig versicherte the
  //    KV/PV pipeline below charges the full healthRate on GRV (consistent with
  //    §240 SGB V treatment of all retirement income).
  // -------------------------------------------------------------------------
  // For the bav_versorgungsbezug channel we deduct KV and PV separately to
  // match the historical accumulation order (gross - tax/12 - kv - pv); this
  // keeps the simulate-integration goldens stable to the last ULP.
  let kvPvMonthly = 0
  let bavKvMonthly = 0
  let bavPvMonthly = 0
  if (profile.publicHealthInsurance && kvPvChannel !== 'none') {
    if (kvPvChannel === 'bav_versorgungsbezug') {
      const isFreiwillig = healthStatus === 'freiwillig_gkv'
      const kvPv = calculateProfileRetirementKvPv(profile, rules, retirementYear, {
        bavMonthlyVersorgungsbezuege: grossMonthlyPayout,
        otherMonthlyVersorgungsbezuege: 0,
        monthlyStatutoryPension: otherMonthlyIncome + grvBaselineMonthly,
        freiwilligOtherMonthlyIncome: 0,
        isFreiwilligVersichert: isFreiwillig,
      })
      bavKvMonthly = kvPv.bavKvMonthly
      bavPvMonthly = kvPv.bavPvMonthly
      kvPvMonthly = bavKvMonthly + bavPvMonthly
    } else if (kvPvChannel === 'freiwillig_other' && healthStatus === 'freiwillig_gkv') {
      // §240 SGB V: BBG headroom counts ALL retirement income — GRV, other
      // monthly income already in payout, and the new payout. Bug-fix unifying
      // the certified-pension and Basisrente paths: previously certified-pension
      // dropped otherMonthlyIncome from the BBG headroom, understating it.
      kvPvMonthly = calculateFreiwilligMarginalKvPvByHeadroom(
        profile,
        rules,
        retirementYear,
        grossMonthlyPayout,
        otherMonthlyIncome + grvBaselineMonthly,
      )
    }
    // healthStatus === 'kvdr' with kvPvChannel === 'freiwillig_other' → 0 (matches
    // §229 SGB V: payout is not a Versorgungsbezug, and KVdR §240 doesn't apply).
  }

  const netMonthly = kvPvChannel === 'bav_versorgungsbezug'
    ? Math.max(0, grossMonthlyPayout - marginalTaxAnnual / 12 - bavKvMonthly - bavPvMonthly)
    : Math.max(0, grossMonthlyPayout - marginalTaxAnnual / 12 - kvPvMonthly)
  return { netMonthly, marginalTaxAnnual, kvPvMonthly }
}

type RetirementIncomeDelta = Partial<
  Omit<RetirementIncomeComponents, 'retirementYear'>
>

type RetirementKvPvSourceContext = Omit<
  RetirementKvPvContext,
  | 'kvFreibetragVersorgungMonthly'
  | 'pvFreigrenzeVersorgungMonthly'
  | 'monthlyKvPvBbg'
  | 'healthRate'
  | 'careRate'
>

export function retirementIncomeBase(
  retirementYear: number,
  input: {
    grvBaselineMonthly?: number
    otherTaxableAnnual?: number
    privateInsuranceTaxMode?: RetirementIncomeComponents['privateInsuranceTaxMode']
  } = {},
): RetirementIncomeComponents {
  return {
    statutoryPensionAnnual: (input.grvBaselineMonthly ?? 0) * 12,
    bavPensionAnnual: 0,
    bavIsLumpSum: false,
    privateInsuranceTaxableAnnual: 0,
    privateInsuranceTaxMode: input.privateInsuranceTaxMode ?? 'abgeltungsteuer',
    otherTaxableAnnual: input.otherTaxableAnnual ?? 0,
    retirementYear,
  }
}

export function addRetirementIncome(
  base: RetirementIncomeComponents,
  delta: RetirementIncomeDelta,
): RetirementIncomeComponents {
  return {
    statutoryPensionAnnual:
      base.statutoryPensionAnnual + (delta.statutoryPensionAnnual ?? 0),
    bavPensionAnnual: base.bavPensionAnnual + (delta.bavPensionAnnual ?? 0),
    bavIsLumpSum: delta.bavIsLumpSum ?? base.bavIsLumpSum,
    privateInsuranceTaxableAnnual:
      base.privateInsuranceTaxableAnnual + (delta.privateInsuranceTaxableAnnual ?? 0),
    privateInsuranceTaxMode:
      delta.privateInsuranceTaxMode ?? base.privateInsuranceTaxMode,
    otherTaxableAnnual: base.otherTaxableAnnual + (delta.otherTaxableAnnual ?? 0),
    retirementYear: base.retirementYear,
  }
}

export function calculateMarginalRetirementTax(
  rules: GermanRules,
  base: RetirementIncomeComponents,
  addedIncome: RetirementIncomeDelta,
): number {
  const taxWith = calculateRetirementTax(addRetirementIncome(base, addedIncome), rules, 'single')
  const taxWithout = calculateRetirementTax(base, rules, 'single')
  return taxWith.totalTaxAnnual - taxWithout.totalTaxAnnual
}

export function retirementContributionRates(
  profile: PersonalProfile,
  rules: GermanRules,
  retirementYear: number,
): { healthRate: number; careRate: number } {
  const additionalHealthRate = (profile.healthAdditionalContributionPct ?? 0) / 100
  return {
    healthRate: rules.socialSecurity.healthGeneralRate + additionalHealthRate,
    careRate:
      careEmployeeRateForChildren(profile.childBirthYears, retirementYear, rules) +
      rules.socialSecurity.careEmployerRate,
  }
}

export function calculateProfileRetirementKvPv(
  profile: PersonalProfile,
  rules: GermanRules,
  retirementYear: number,
  sources: RetirementKvPvSourceContext,
): RetirementKvPvBreakdown {
  const { healthRate, careRate } = retirementContributionRates(profile, rules, retirementYear)
  return calculateRetirementKvPv({
    ...sources,
    kvFreibetragVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    pvFreigrenzeVersorgungMonthly: rules.socialSecurity.kvFreibetragVersorgungMonthly,
    monthlyKvPvBbg: rules.socialSecurity.healthAndCareCapMonth,
    healthRate,
    careRate,
  })
}

export function appliesFreiwilligGkv(
  profile: PersonalProfile,
  retirementHealthStatus: RetirementHealthStatus,
): boolean {
  return profile.publicHealthInsurance && retirementHealthStatus === 'freiwillig_gkv'
}

export function calculateFreiwilligMarginalKvPvByHeadroom(
  profile: PersonalProfile,
  rules: GermanRules,
  retirementYear: number,
  addedMonthly: number,
  existingMonthly: number,
): number {
  const { healthRate, careRate } = retirementContributionRates(profile, rules, retirementYear)
  const kvPvBase = Math.min(
    Math.max(0, addedMonthly),
    Math.max(0, rules.socialSecurity.healthAndCareCapMonth - existingMonthly),
  )
  return kvPvBase * (healthRate + careRate)
}
