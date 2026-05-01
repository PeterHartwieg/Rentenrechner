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
