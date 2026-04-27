import type {
  BavAssumptions,
  BavFundingResult,
  GermanRules,
  PersonalProfile,
  SalaryResult,
  SocialContributionBreakdown,
} from '../domain/types'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'

function contributionBase(annualGross: number, cap: number): number {
  return Math.min(Math.max(0, annualGross), cap)
}

export function careEmployeeRateForChildren(
  children: number,
  rules: GermanRules,
): number {
  if (children <= 0) {
    return rules.socialSecurity.careEmployeeChildlessRate
  }

  const childDiscount = Math.min(Math.max(0, children - 1), 4) * 0.0025

  return Math.max(0, rules.socialSecurity.careEmployeeBaseRate - childDiscount)
}

export function calculateEmployeeSocialContributions(
  annualGrossForSocialSecurity: number,
  profile: PersonalProfile,
  rules: GermanRules,
): SocialContributionBreakdown {
  const pensionBase = contributionBase(
    annualGrossForSocialSecurity,
    rules.socialSecurity.pensionCapYear,
  )
  const healthBase = contributionBase(
    annualGrossForSocialSecurity,
    rules.socialSecurity.healthCareCapYear,
  )
  const additionalHealthRate = profile.healthAdditionalContributionPct / 100
  const healthEmployeeRate = rules.socialSecurity.healthGeneralRate / 2 + additionalHealthRate / 2

  const pension = pensionBase * rules.socialSecurity.pensionEmployeeRate
  const unemployment = pensionBase * rules.socialSecurity.unemploymentEmployeeRate
  const health = profile.publicHealthInsurance ? healthBase * healthEmployeeRate : 0
  const care = profile.publicHealthInsurance
    ? healthBase * careEmployeeRateForChildren(profile.children, rules)
    : 0

  return {
    pension,
    unemployment,
    health,
    care,
    total: pension + unemployment + health + care,
  }
}

function calculateEmployerSocialContributions(
  annualGrossForSocialSecurity: number,
  profile: PersonalProfile,
  rules: GermanRules,
): SocialContributionBreakdown {
  const pensionBase = contributionBase(
    annualGrossForSocialSecurity,
    rules.socialSecurity.pensionCapYear,
  )
  const healthBase = contributionBase(
    annualGrossForSocialSecurity,
    rules.socialSecurity.healthCareCapYear,
  )
  const additionalHealthRate = profile.healthAdditionalContributionPct / 100
  const healthEmployerRate = rules.socialSecurity.healthGeneralRate / 2 + additionalHealthRate / 2

  const pension = pensionBase * rules.socialSecurity.pensionEmployerRate
  const unemployment = pensionBase * rules.socialSecurity.unemploymentEmployerRate
  const health = profile.publicHealthInsurance ? healthBase * healthEmployerRate : 0
  const care = profile.publicHealthInsurance ? healthBase * rules.socialSecurity.careEmployerRate : 0

  return {
    pension,
    unemployment,
    health,
    care,
    total: pension + unemployment + health + care,
  }
}

// §39b EStG 2026 Vorsorgepauschale for Steuerklasse I-V, GKV-insured.
// Uses steuerlicher Arbeitslohn (gross minus tax-free bAV conversion) as the base.
// GKV Teilbetrag uses ermäßigter Beitragssatz (§243 SGB V) per §39b(2)Nr.3 EStG.
// AV Teilbetrag is included up to the 1,900 EUR cap (GKV + PV + AV ≤ 1,900 EUR).
export function calculateVorsorgepauschale2026(
  steuerlichArbeitslohn: number,
  profile: PersonalProfile,
  rules: GermanRules,
): number {
  const rvBase = contributionBase(steuerlichArbeitslohn, rules.socialSecurity.pensionCapYear)
  const kvBase = contributionBase(steuerlichArbeitslohn, rules.socialSecurity.healthCareCapYear)
  const additionalHealthRate = profile.healthAdditionalContributionPct / 100

  const rvTeilbetrag = rvBase * rules.socialSecurity.pensionEmployeeRate

  const kvTeilbetrag = profile.publicHealthInsurance
    ? kvBase * (rules.socialSecurity.healthReducedRate / 2 + additionalHealthRate / 2)
    : 0

  const pvTeilbetrag = profile.publicHealthInsurance
    ? kvBase * careEmployeeRateForChildren(profile.children, rules)
    : 0

  // AV Teilbetrag: only included if GKV + PV + AV does not exceed 1,900 EUR
  const kvpvSum = kvTeilbetrag + pvTeilbetrag
  const avActual = rvBase * rules.socialSecurity.unemploymentEmployeeRate
  const avTeilbetrag = Math.max(0, Math.min(avActual, 1_900 - kvpvSum))

  return rvTeilbetrag + kvTeilbetrag + pvTeilbetrag + avTeilbetrag
}

export function calculateSalaryResult(
  profile: PersonalProfile,
  rules: GermanRules,
  annualBavConversion = 0,
  effectiveTaxFreeConversion?: number,
  effectiveSvFreeConversion?: number,
): SalaryResult {
  const taxFreeLimit = rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap
  const svFreeLimit =
    rules.socialSecurity.pensionCapYear * rules.bav.socialSecurityFreePctOfPensionCap
  const taxFreeConversion = effectiveTaxFreeConversion ?? Math.min(annualBavConversion, taxFreeLimit)
  const svFreeConversion = effectiveSvFreeConversion ?? Math.min(annualBavConversion, svFreeLimit)
  const annualGrossForSocialSecurity = profile.grossSalaryYear - svFreeConversion
  const social = calculateEmployeeSocialContributions(
    annualGrossForSocialSecurity,
    profile,
    rules,
  )
  // §39b EStG 2026 Vorsorgepauschale based on steuerlicher Arbeitslohn
  const steuerlichArbeitslohn = profile.grossSalaryYear - taxFreeConversion
  const vorsorgepauschale = calculateVorsorgepauschale2026(steuerlichArbeitslohn, profile, rules)
  const taxableIncome = Math.max(
    0,
    steuerlichArbeitslohn -
      vorsorgepauschale -
      rules.employeeAllowance -
      rules.specialExpensesAllowance,
  )
  const incomeTax = calculateIncomeTax2026(taxableIncome, rules)
  const solidarityTax = calculateSolidarityTax(incomeTax, rules)
  const annualNet =
    profile.grossSalaryYear - annualBavConversion - social.total - incomeTax - solidarityTax

  return {
    annualGross: profile.grossSalaryYear,
    annualNet,
    taxableIncome,
    incomeTax,
    solidarityTax,
    social,
    vorsorgepauschale,
  }
}

export function calculateBavFunding(
  profile: PersonalProfile,
  rules: GermanRules,
  bav: BavAssumptions,
): BavFundingResult {
  const annualGrossConversion = bav.monthlyGrossConversion * 12
  const taxFreeLimit = rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap
  const svFreeLimit = rules.socialSecurity.pensionCapYear * rules.bav.socialSecurityFreePctOfPensionCap
  const extraSubsidyAnnual =
    annualGrossConversion * bav.extraEmployerContributionPct + bav.extraEmployerContributionMonthly * 12

  const salaryWithoutBav = calculateSalaryResult(profile, rules, 0)
  const employerSocialBefore = calculateEmployerSocialContributions(profile.grossSalaryYear, profile, rules)

  // Pass 1: approximate employer subsidy using employee-only SV-free limit
  const approxSvFreeConversion = Math.min(annualGrossConversion, svFreeLimit)
  const approxEmployerSocialAfter = calculateEmployerSocialContributions(
    profile.grossSalaryYear - approxSvFreeConversion,
    profile,
    rules,
  )
  const approxEmployerSvSaving = Math.max(0, employerSocialBefore.total - approxEmployerSocialAfter.total)
  const approxStatutorySubsidy = Math.min(annualGrossConversion * rules.bav.statutoryEmployerSubsidyPct, approxEmployerSvSaving)
  const approxEmployerTotal = approxStatutorySubsidy + extraSubsidyAnnual

  // Apply §3 Nr. 63 EStG (8% BBG) and §1 SvEV (4% BBG) to total bAV
  const approxTotalBav = annualGrossConversion + approxEmployerTotal
  const totalTaxFree = Math.min(approxTotalBav, taxFreeLimit)
  const totalSvFree = Math.min(approxTotalBav, svFreeLimit)

  // Effective employee amounts after subtracting the employer's portion of each limit
  const effectiveTaxFreeConversion = Math.max(0, Math.min(annualGrossConversion, totalTaxFree - approxEmployerTotal))
  const effectiveSvFreeConversion = Math.max(0, Math.min(annualGrossConversion, totalSvFree - approxEmployerTotal))

  // Pass 2: salary with corrected limits
  const salaryWithBav = calculateSalaryResult(
    profile,
    rules,
    annualGrossConversion,
    effectiveTaxFreeConversion,
    effectiveSvFreeConversion,
  )

  // Final employer SV saving using corrected employee SV-free amount
  const finalEmployerSocialAfter = calculateEmployerSocialContributions(
    profile.grossSalaryYear - effectiveSvFreeConversion,
    profile,
    rules,
  )
  const employerSocialSecuritySavingAnnual = Math.max(0, employerSocialBefore.total - finalEmployerSocialAfter.total)
  const statutorySubsidyAnnual = Math.min(annualGrossConversion * rules.bav.statutoryEmployerSubsidyPct, employerSocialSecuritySavingAnnual)
  const annualEmployerContribution = statutorySubsidyAnnual + extraSubsidyAnnual

  const totalBavContributionAnnual = annualGrossConversion + annualEmployerContribution
  const taxFreePortionAnnual = Math.min(totalBavContributionAnnual, taxFreeLimit)
  const svFreePortionAnnual = Math.min(totalBavContributionAnnual, svFreeLimit)
  const taxableOverflowAnnual = Math.max(0, totalBavContributionAnnual - taxFreeLimit)
  const svLiableOverflowAnnual = Math.max(0, totalBavContributionAnnual - svFreeLimit)

  const annualNetCost = salaryWithoutBav.annualNet - salaryWithBav.annualNet
  const annualTaxAndSvSavings = annualGrossConversion - annualNetCost

  return {
    monthlyGrossConversion: bav.monthlyGrossConversion,
    annualGrossConversion,
    monthlyNetCost: annualNetCost / 12,
    annualNetCost,
    monthlyTaxAndSvSavings: annualTaxAndSvSavings / 12,
    annualTaxAndSvSavings,
    monthlyMandatoryEmployerSubsidy: statutorySubsidyAnnual / 12,
    monthlyExtraEmployerSubsidy: extraSubsidyAnnual / 12,
    monthlyEmployerContribution: annualEmployerContribution / 12,
    annualEmployerContribution,
    employerSocialSecuritySavingAnnual,
    salaryWithoutBav,
    salaryWithBav,
    totalBavContributionAnnual,
    taxFreePortionAnnual,
    svFreePortionAnnual,
    taxableOverflowAnnual,
    svLiableOverflowAnnual,
  }
}
