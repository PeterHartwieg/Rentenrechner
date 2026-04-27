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
  const care =
    profile.publicHealthInsurance && profile.children === 0
      ? healthBase * rules.socialSecurity.careEmployeeChildlessRate
      : healthBase * 0.018

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

export function calculateSalaryResult(
  profile: PersonalProfile,
  rules: GermanRules,
  annualBavConversion = 0,
): SalaryResult {
  const taxFreeLimit = rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap
  const svFreeLimit =
    rules.socialSecurity.pensionCapYear * rules.bav.socialSecurityFreePctOfPensionCap
  const taxFreeConversion = Math.min(annualBavConversion, taxFreeLimit)
  const svFreeConversion = Math.min(annualBavConversion, svFreeLimit)
  const annualGrossForSocialSecurity = profile.grossSalaryYear - svFreeConversion
  const social = calculateEmployeeSocialContributions(
    annualGrossForSocialSecurity,
    profile,
    rules,
  )
  const taxableIncome = Math.max(
    0,
    profile.grossSalaryYear -
      taxFreeConversion -
      social.total -
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
  }
}

export function calculateBavFunding(
  profile: PersonalProfile,
  rules: GermanRules,
  bav: BavAssumptions,
): BavFundingResult {
  const annualGrossConversion = bav.monthlyGrossConversion * 12
  const svFreeLimit =
    rules.socialSecurity.pensionCapYear * rules.bav.socialSecurityFreePctOfPensionCap
  const svFreeConversion = Math.min(annualGrossConversion, svFreeLimit)

  const salaryWithoutBav = calculateSalaryResult(profile, rules, 0)
  const salaryWithBav = calculateSalaryResult(profile, rules, annualGrossConversion)
  const employerSocialBefore = calculateEmployerSocialContributions(
    profile.grossSalaryYear,
    profile,
    rules,
  )
  const employerSocialAfter = calculateEmployerSocialContributions(
    profile.grossSalaryYear - svFreeConversion,
    profile,
    rules,
  )
  const employerSocialSecuritySavingAnnual = Math.max(
    0,
    employerSocialBefore.total - employerSocialAfter.total,
  )
  const statutorySubsidyAnnual = Math.min(
    annualGrossConversion * rules.bav.statutoryEmployerSubsidyPct,
    employerSocialSecuritySavingAnnual,
  )
  const extraSubsidyAnnual =
    annualGrossConversion * bav.extraEmployerContributionPct + bav.extraEmployerContributionMonthly * 12
  const annualEmployerContribution = statutorySubsidyAnnual + extraSubsidyAnnual
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
  }
}
