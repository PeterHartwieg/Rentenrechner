import type {
  BavAssumptions,
  BavDurchfuehrungsweg,
  BavFundingResult,
  GermanRules,
  PersonalProfile,
  SalaryResult,
  SocialContributionBreakdown,
} from '../domain'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'
import {
  childBirthYearsBornByYear,
  childBirthYearsUnder25InYear,
} from './childEligibility'

function contributionBase(annualGross: number, cap: number): number {
  return Math.min(Math.max(0, annualGross), cap)
}

function bavHasStatutoryMinimumSubsidyRoute(
  durchfuehrungsweg: BavDurchfuehrungsweg,
): boolean {
  return (
    durchfuehrungsweg === 'direktversicherung_3_63' ||
    durchfuehrungsweg === 'pensionskasse_3_63' ||
    durchfuehrungsweg === 'pensionsfonds_3_63'
  )
}

export function careEmployeeRateForChildren(
  childBirthYears: number[],
  currentYear: number,
  rules: GermanRules,
): number {
  // Children with a birth year > currentYear are planned/not-yet-born and do not
  // affect the contribution year's Pflege rate (no Kinderlosenzuschlag exemption,
  // no Beitragsabschlag) until they're actually born.
  const bornByNow = childBirthYearsBornByYear(childBirthYears, currentYear)
  if (bornByNow.length === 0) {
    return rules.socialSecurity.careEmployeeChildlessRate
  }
  // §55 Abs. 3a SGB XI: only children under 25 in the contribution year qualify for
  // the Beitragsabschlag. Having any child at all (regardless of age) exempts the
  // member from the Kinderlosenzuschlag.
  const qualifying = childBirthYearsUnder25InYear(bornByNow, currentYear).length
  const discount = Math.min(Math.max(0, qualifying - 1), 4) * 0.0025
  return Math.max(0, rules.socialSecurity.careEmployeeBaseRate - discount)
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
    ? healthBase * careEmployeeRateForChildren(profile.childBirthYears, rules.year, rules)
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

// §257 SGB V + §61 SGB XI: employer subsidy for employees with private health/care insurance.
// Employer pays half the premium, capped at the GKV employer equivalent (§3 Nr. 62 EStG: tax-free).
// Cap = (healthGeneralRate/2 + careEmployerRate) × min(monthlyGross, healthAndCareCapMonth).
export function calculatePkv257Subsidy(
  monthlyGross: number,
  pkvMonthlyPremium: number,
  pPVMonthlyPremium: number,
  rules: GermanRules,
): number {
  const monthlyBase = Math.min(monthlyGross, rules.socialSecurity.healthAndCareCapMonth)
  const maxSubsidy =
    (rules.socialSecurity.healthGeneralRate / 2 + rules.socialSecurity.careEmployerRate) * monthlyBase
  return Math.min((pkvMonthlyPremium + pPVMonthlyPremium) / 2, maxSubsidy)
}

// §39b EStG 2026 Vorsorgepauschale for Steuerklasse I-V.
// Uses steuerlicher Arbeitslohn (gross minus tax-free bAV conversion) as the base.
// GKV: KV Teilbetrag uses ermäßigter Beitragssatz (§243 SGB V) per §39b(2)Nr.3 EStG.
// PKV: KV/PV Teilbeträge = employee's annual PKV/pPV premiums minus the tax-free
// employer subsidy (§39b(2) Nr. 3 EStG, mirrored by the BMF Lohnsteuerrechner).
// AV Teilbetrag is included up to the 1,900 EUR cap (KV + PV + AV ≤ 1,900 EUR).
export function calculateVorsorgepauschale2026(
  steuerlichArbeitslohn: number,
  profile: PersonalProfile,
  rules: GermanRules,
): number {
  const rvBase = contributionBase(steuerlichArbeitslohn, rules.socialSecurity.pensionCapYear)
  const kvBase = contributionBase(steuerlichArbeitslohn, rules.socialSecurity.healthCareCapYear)
  const additionalHealthRate = profile.healthAdditionalContributionPct / 100

  const rvTeilbetrag = rvBase * rules.socialSecurity.pensionEmployeeRate

  const pkv257SubsidyAnnual = !profile.publicHealthInsurance
    ? calculatePkv257Subsidy(
        profile.grossSalaryYear / 12,
        profile.pkvMonthlyPremium,
        profile.pPVMonthlyPremium,
        rules,
      ) * 12
    : 0
  const pkvPremiumAnnualAfterSubsidy = Math.max(
    0,
    (profile.pkvMonthlyPremium + profile.pPVMonthlyPremium) * 12 - pkv257SubsidyAnnual,
  )

  // PKV: the employee-paid annual KV/pPV amount after the tax-free employer
  // subsidy replaces the GKV-based Teilbeträge.
  const kvTeilbetrag = profile.publicHealthInsurance
    ? kvBase * (rules.socialSecurity.healthReducedRate / 2 + additionalHealthRate / 2)
    : pkvPremiumAnnualAfterSubsidy

  const pvTeilbetrag = profile.publicHealthInsurance
    ? kvBase * careEmployeeRateForChildren(profile.childBirthYears, rules.year, rules)
    : 0

  // AV Teilbetrag: only included if KV + PV + AV does not exceed 1,900 EUR
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
  // Pre-floor zvE (can be negative for very low wages after deductions).
  const zvEBeforeFloor =
    steuerlichArbeitslohn -
    vorsorgepauschale -
    rules.employeeAllowance -
    rules.specialExpensesAllowance
  const taxableIncome = Math.max(0, zvEBeforeFloor)
  // §39b EStG tax-class dispatch.
  // III: Ehegattensplitting (§32a Abs. 5 EStG) — 2 × f(income/2); Soli uses married threshold.
  // II: single-filer table with §24b EStG Entlastungsbetrag für Alleinerziehende deducted first.
  // V: §39b tariff 2 × (f(1.25 × zvE) − f(0.75 × zvE)) with PAP MST5 floor.
  // VI: same tariff on raw steuerlichArbeitslohn with PAP MST6 floor.
  // I, IV: standard single-filer table.
  let incomeTax: number
  let solidarityFilingStatus: 'single' | 'married' = 'single'
  if (profile.taxClass === 3) {
    incomeTax = 2 * calculateIncomeTax2026(taxableIncome / 2, rules)
    solidarityFilingStatus = 'married'
  } else if (profile.taxClass === 2) {
    // §24b EStG: base 4,260 EUR + 240 EUR per additional child beyond the first.
    const childCount = Math.max(1, profile.childBirthYears.length)
    const entlastung =
      rules.entlastungsbetragAlleinerziehende +
      (childCount - 1) * rules.entlastungsbetragAlleinerziehendePro
    incomeTax = calculateIncomeTax2026(Math.max(0, taxableIncome - entlastung), rules)
  } else if (profile.taxClass === 5) {
    // §39b Abs. 2 Satz 2 Nr. 2 EStG: statutory V/VI tariff on pre-floor zvE.
    // PAP MST5: floor at f(zvE + basicAllowance) so low-wage earners don't benefit
    // from the Grundfreibetrag they already consume at their primary employment.
    const gf = rules.incomeTax.basicAllowance
    const formula =
      2 *
      (calculateIncomeTax2026(1.25 * zvEBeforeFloor, rules) -
        calculateIncomeTax2026(0.75 * zvEBeforeFloor, rules))
    incomeTax = Math.max(formula, calculateIncomeTax2026(Math.max(0, zvEBeforeFloor) + gf, rules))
  } else if (profile.taxClass === 6) {
    // Class VI has no personal deductions (§39b Abs. 2 Satz 2 Nr. 2 EStG).
    // PAP MST6: same floor on raw steuerlichArbeitslohn.
    const gf = rules.incomeTax.basicAllowance
    const formula =
      2 *
      (calculateIncomeTax2026(1.25 * steuerlichArbeitslohn, rules) -
        calculateIncomeTax2026(0.75 * steuerlichArbeitslohn, rules))
    incomeTax = Math.max(formula, calculateIncomeTax2026(steuerlichArbeitslohn + gf, rules))
  } else {
    incomeTax = calculateIncomeTax2026(taxableIncome, rules)
  }
  const solidarityTax = calculateSolidarityTax(incomeTax, rules, solidarityFilingStatus)

  // #50: §257 SGB V employer subsidy + net PKV cost (zero for GKV members).
  // The employer's §257 subsidy is §3 Nr. 62 EStG tax-free and is not subject to social
  // contributions; the employee still pays the full premium and receives the subsidy separately.
  // Net PKV cost = premium − §257 subsidy; this reduces actual take-home pay.
  const pkv257SubsidyMonthly = !profile.publicHealthInsurance
    ? calculatePkv257Subsidy(
        profile.grossSalaryYear / 12,
        profile.pkvMonthlyPremium,
        profile.pPVMonthlyPremium,
        rules,
      )
    : 0
  const pkvNetMonthlyCost = !profile.publicHealthInsurance
    ? profile.pkvMonthlyPremium + profile.pPVMonthlyPremium - pkv257SubsidyMonthly
    : 0

  const annualNet =
    profile.grossSalaryYear -
    annualBavConversion -
    social.total -
    incomeTax -
    solidarityTax -
    pkvNetMonthlyCost * 12

  return {
    annualGross: profile.grossSalaryYear,
    annualNet,
    taxableIncome,
    incomeTax,
    solidarityTax,
    social,
    vorsorgepauschale,
    pkv257SubsidyMonthly,
    pkvNetMonthlyCost,
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
  // #51: contractual employer share (uncapped, stacks on top of statutory).
  const contractualSubsidyAnnual =
    annualGrossConversion * bav.contractualMatchPercent + bav.contractualFixedMonthly * 12

  const salaryWithoutBav = calculateSalaryResult(profile, rules, 0)
  const employerSocialBefore = calculateEmployerSocialContributions(profile.grossSalaryYear, profile, rules)

  // Iterative fixed-point: employerContribution → effectiveSvFreeConversion →
  // employerSvSaving → statutorySubsidy → employerContribution.
  // Converges because the feedback gain (employer SV rate ≪ 1) is contractive.
  let employerContribution = contractualSubsidyAnnual
  let effectiveTaxFreeConversion = Math.min(annualGrossConversion, taxFreeLimit)
  let effectiveSvFreeConversion = Math.min(annualGrossConversion, svFreeLimit)
  let statutorySubsidyAnnual = 0
  let employerSocialSecuritySavingAnnual = 0

  for (let iter = 0; iter < 20; iter++) {
    const totalBav = annualGrossConversion + employerContribution
    const totalTaxFree = Math.min(totalBav, taxFreeLimit)
    const totalSvFree = Math.min(totalBav, svFreeLimit)
    effectiveTaxFreeConversion = Math.max(0, Math.min(annualGrossConversion, totalTaxFree - employerContribution))
    effectiveSvFreeConversion = Math.max(0, Math.min(annualGrossConversion, totalSvFree - employerContribution))

    const employerSocialAfter = calculateEmployerSocialContributions(
      profile.grossSalaryYear - effectiveSvFreeConversion,
      profile,
      rules,
    )
    employerSocialSecuritySavingAnnual = Math.max(0, employerSocialBefore.total - employerSocialAfter.total)
    statutorySubsidyAnnual =
      bav.statutoryMinimumSubsidyEnabled &&
      bavHasStatutoryMinimumSubsidyRoute(bav.durchfuehrungsweg)
      ? Math.min(
          annualGrossConversion * rules.bav.statutoryEmployerSubsidyPct,
          employerSocialSecuritySavingAnnual,
        )
      : 0
    const next = statutorySubsidyAnnual + contractualSubsidyAnnual
    if (Math.abs(next - employerContribution) < 0.01) {
      employerContribution = next
      break
    }
    employerContribution = next
  }

  const annualEmployerContribution = employerContribution

  // #168: expose subsidy breakdown for API consumers.
  const statutorySubsidyEnabled =
    bav.statutoryMinimumSubsidyEnabled &&
    bavHasStatutoryMinimumSubsidyRoute(bav.durchfuehrungsweg)
  const uncappedStatutorySubsidyAnnual = statutorySubsidyEnabled
    ? annualGrossConversion * rules.bav.statutoryEmployerSubsidyPct
    : 0
  const statutorySubsidyCapAnnual = statutorySubsidyEnabled
    ? employerSocialSecuritySavingAnnual
    : 0
  const statutorySubsidyCapApplied =
    statutorySubsidyEnabled &&
    uncappedStatutorySubsidyAnnual > employerSocialSecuritySavingAnnual

  const salaryWithBav = calculateSalaryResult(
    profile,
    rules,
    annualGrossConversion,
    effectiveTaxFreeConversion,
    effectiveSvFreeConversion,
  )

  const totalBavContributionAnnual = annualGrossConversion + annualEmployerContribution
  const taxFreePortionAnnual = Math.min(totalBavContributionAnnual, taxFreeLimit)
  const svFreePortionAnnual = Math.min(totalBavContributionAnnual, svFreeLimit)
  const taxableOverflowAnnual = Math.max(0, totalBavContributionAnnual - taxFreeLimit)
  const svLiableOverflowAnnual = Math.max(0, totalBavContributionAnnual - svFreeLimit)

  const annualNetCost = salaryWithoutBav.annualNet - salaryWithBav.annualNet
  const annualTaxAndSvSavings = annualGrossConversion - annualNetCost

  // #5: each year of conversion reduces pensionable earnings → fewer Entgeltpunkte → lower GRV.
  // Only the SV-free portion of the employee conversion reduces the pensionable base.
  // Salary already above RV BBG has no reduction (already capped); salary crossing BBG → partial loss.
  // Formula:
  //   lostPensionableBase = min(grossBefore, RV_BBG) - min(grossBefore - svFreeConversion, RV_BBG)
  // where svFreeConversion = effectiveSvFreeConversion (employee portion that is actually SV-free).
  // Monthly pension loss = (lostPensionableBase / Durchschnittsentgelt) × yearsToRetirement × Rentenwert
  const yearsToRetirement = Math.max(0, profile.retirementAge - profile.age)
  const rvBbg = rules.socialSecurity.pensionCapYear
  const lostPensionableBase =
    Math.min(profile.grossSalaryYear, rvBbg) -
    Math.min(profile.grossSalaryYear - effectiveSvFreeConversion, rvBbg)
  const estimatedMonthlyGrvReduction =
    yearsToRetirement *
    (lostPensionableBase / rules.socialSecurity.durchschnittsentgelt) *
    rules.socialSecurity.aktuellerRentenwert

  return {
    monthlyGrossConversion: bav.monthlyGrossConversion,
    annualGrossConversion,
    monthlyNetCost: annualNetCost / 12,
    annualNetCost,
    monthlyTaxAndSvSavings: annualTaxAndSvSavings / 12,
    annualTaxAndSvSavings,
    monthlyStatutoryEmployerSubsidy: statutorySubsidyAnnual / 12,
    monthlyStatutoryEmployerSubsidyUncapped: uncappedStatutorySubsidyAnnual / 12,
    monthlyStatutoryEmployerSubsidyCap: statutorySubsidyCapAnnual / 12,
    monthlyStatutoryEmployerSubsidyCapApplied: statutorySubsidyCapApplied,
    monthlyContractualEmployerContribution: contractualSubsidyAnnual / 12,
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
    estimatedMonthlyGrvReduction,
  }
}

/**
 * Inverse of calculateBavFunding: given a target monthly net cost (out-of-pocket),
 * return the monthlyGrossConversion that produces that net.
 *
 * Used by the input-sync layer: when the user types in any other product's monthly
 * contribution field, that field's net cost is derived and bAV's gross is
 * back-solved to match.
 *
 * Method: bisection. The forward map gross→net is monotone non-decreasing
 * (each additional gross euro reduces take-home by at most one euro and at least
 * the post-cap rate after employer subsidies are exhausted), and piecewise smooth
 * with breakpoints at the §3 Nr. 63 / §1 SvEV caps — bisection is robust where
 * an analytic inverse would need separate cases per cap regime.
 */
export function solveBavGrossFromNet(
  targetMonthlyNet: number,
  profile: PersonalProfile,
  rules: GermanRules,
  bav: BavAssumptions,
): number {
  if (targetMonthlyNet <= 0) return 0

  const forward = (monthlyGross: number) => {
    const result = calculateBavFunding(profile, rules, {
      ...bav,
      monthlyGrossConversion: monthlyGross,
    })
    return result.monthlyNetCost
  }

  let lo = 0
  // Upper bracket: net cost is bounded above by gross (savings are non-negative),
  // so 4× target plus a 100 EUR floor always brackets the solution.
  let hi = Math.max(100, targetMonthlyNet * 4)
  // Expand hi until forward(hi) ≥ target, in case extreme cap/subsidy combinations
  // make the marginal net rate very low.
  for (let i = 0; i < 10 && forward(hi) < targetMonthlyNet; i++) {
    hi *= 2
  }

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const net = forward(mid)
    if (Math.abs(net - targetMonthlyNet) < 0.01) return mid
    if (net < targetMonthlyNet) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
