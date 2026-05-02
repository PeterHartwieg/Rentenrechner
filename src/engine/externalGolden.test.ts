import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile, defaultRiesterAssumptions } from '../data/defaultScenario'
import type { PersonalProfile } from '../domain'
import { besteuerungsanteilGrv, de2026Rules, versorgungsfreibetrag } from '../rules/de2026'
import {
  bavContributionLimitGoldenValues,
  bavFundingBoundaryGoldenCases,
  bayernAlterseinkuenfte2026GoldenCases,
  besteuerungsanteilGoldenValues,
  bmfEinkommensteuerRechner2026GoldenCases,
  capitalGains2026GoldenValues,
  etfExitTaxGoldenCases,
  etfVorabpauschaleGoldenCases,
  incomeTax2026GoldenCases,
  payroll2026GoldenCases,
  riester2026GoldenCases,
  retirementTaxGoldenCases,
  socialSecurity2026GoldenValues,
  statutoryPensionGoldenCases,
  validationSources,
  versorgungsfreibetragGoldenValues,
  zfaRiesterCalculatorGoldenCases,
} from '../test/externalGoldenFixtures'
import { projectStatutoryPension } from './grv'
import { projectAccumulation } from './accumulation'
import { afterTaxInvestmentCapital } from './etfPayout'
import { calculateRetirementTax } from './retirementTax'
import { calculateRiesterFunding } from './riester'
import { calculateBavFunding, calculateSalaryResult } from './salary'
import { calculateCapitalGainsTax, calculateIncomeTax2026, calculateSolidarityTax } from './tax'

const sourceIds = new Set(validationSources.map(source => source.id))

function expectCloseToGolden(actual: number, expected: number, toleranceEUR: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(toleranceEUR)
}

function socialSecurityValue(field: (typeof socialSecurity2026GoldenValues)[number]['field']): number {
  return de2026Rules.socialSecurity[field]
}

function capitalGainsValue(field: (typeof capitalGains2026GoldenValues)[number]['field']): number {
  return de2026Rules.capitalGains[field]
}

describe('external golden validation sources', () => {
  it('keeps every fixture linked to a declared outside source', () => {
    const fixtureSourceIds = [
      ...incomeTax2026GoldenCases.map(c => c.sourceId),
      ...bmfEinkommensteuerRechner2026GoldenCases.map(c => c.sourceId),
      ...payroll2026GoldenCases.map(c => c.sourceId),
      ...socialSecurity2026GoldenValues.map(c => c.sourceId),
      ...capitalGains2026GoldenValues.map(c => c.sourceId),
      ...riester2026GoldenCases.map(c => c.sourceId),
      ...zfaRiesterCalculatorGoldenCases.map(c => c.sourceId),
      ...besteuerungsanteilGoldenValues.map(c => c.sourceId),
      ...versorgungsfreibetragGoldenValues.map(c => c.sourceId),
      ...statutoryPensionGoldenCases.map(c => c.sourceId),
      ...bavContributionLimitGoldenValues.map(c => c.sourceId),
      ...retirementTaxGoldenCases.map(c => c.sourceId),
      ...bayernAlterseinkuenfte2026GoldenCases.map(c => c.sourceId),
      ...etfVorabpauschaleGoldenCases.map(c => c.sourceId),
      ...etfExitTaxGoldenCases.map(c => c.sourceId),
      ...bavFundingBoundaryGoldenCases.map(c => c.sourceId),
    ]

    for (const sourceId of fixtureSourceIds) {
      expect(sourceIds.has(sourceId)).toBe(true)
    }
  })
})

describe('external golden: BMF 2026 income tax tariff', () => {
  it.each(incomeTax2026GoldenCases)('$id', (fixture) => {
    const actual = calculateIncomeTax2026(fixture.taxableIncome, de2026Rules)
    expectCloseToGolden(actual, fixture.expectedIncomeTax, fixture.toleranceEUR)
  })
})

describe('external golden: BMF 2026 Einkommensteuer-Rechner captures', () => {
  it.each(bmfEinkommensteuerRechner2026GoldenCases)('$id', (fixture) => {
    const actualEst = calculateIncomeTax2026(fixture.taxableIncome, de2026Rules)
    const actualSoli = calculateSolidarityTax(actualEst, de2026Rules)
    expectCloseToGolden(actualEst, fixture.expectedIncomeTax, fixture.toleranceEUR)
    expectCloseToGolden(actualSoli, fixture.expectedSolidarityTax, fixture.toleranceEUR)
  })
})

describe('external golden: BMF 2026 payroll cases', () => {
  it.each(payroll2026GoldenCases)('$id', (fixture) => {
    const profile: PersonalProfile = {
      ...defaultProfile,
      grossSalaryYear: fixture.grossSalaryYear,
      childBirthYears: [],
      churchTax: false,
      publicHealthInsurance: true,
      healthAdditionalContributionPct: 2.9,
    }

    const actual = calculateSalaryResult(profile, de2026Rules)

    expectCloseToGolden(
      actual.taxableIncome,
      fixture.expectedTaxableIncome,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(actual.incomeTax, fixture.expectedIncomeTax, fixture.toleranceEUR)
    expectCloseToGolden(
      actual.solidarityTax,
      fixture.expectedSolidarityTax,
      fixture.toleranceEUR,
    )
  })
})

describe('external golden: 2026 statutory constants', () => {
  it.each(socialSecurity2026GoldenValues)('$id', (fixture) => {
    expect(socialSecurityValue(fixture.field)).toBe(fixture.expected)
  })

  it.each(capitalGains2026GoldenValues)('$id', (fixture) => {
    expect(capitalGainsValue(fixture.field)).toBe(fixture.expected)
  })
})

describe('external golden: Riester allowance scenarios', () => {
  it.each(riester2026GoldenCases)('$id', (fixture) => {
    const profile: PersonalProfile = {
      ...defaultProfile,
      grossSalaryYear: fixture.grossSalaryYear,
      childBirthYears: [...fixture.childBirthYears],
    }
    const salary = calculateSalaryResult(profile, de2026Rules)
    const actual = calculateRiesterFunding(
      de2026Rules,
      salary,
      {
        ...defaultRiesterAssumptions,
        monthlyOwnContribution: fixture.monthlyOwnContribution,
        eligibility: {
          ...defaultRiesterAssumptions.eligibility,
          ageAtContractStart: 28,
          careerStarterBonusUsed: true,
          directlyEligible: true,
        },
      },
      profile,
    )

    expectCloseToGolden(
      actual.minEigenbeitragAnnual,
      fixture.expectedMinEigenbeitragAnnual,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.totalAllowanceAnnual,
      fixture.expectedTotalAllowanceAnnual,
      fixture.toleranceEUR,
    )
    expect(actual.meetsMinContribution).toBe(fixture.expectedMeetsMinContribution)
  })
})

describe('external golden: ZfA Riester calculator captures', () => {
  it.each(zfaRiesterCalculatorGoldenCases)('$id', (fixture) => {
    const profile: PersonalProfile = {
      ...defaultProfile,
      grossSalaryYear: fixture.profile.grossSalaryYear,
      childBirthYears: [...fixture.profile.childBirthYears],
    }
    const salary = calculateSalaryResult(profile, de2026Rules)
    // Drive the engine off the oracle's unrounded yearly amount; otherwise
    // 12 × (rounded-to-2-decimals monthly) drifts by up to ~0.04 EUR.
    const actual = calculateRiesterFunding(
      de2026Rules,
      salary,
      {
        ...defaultRiesterAssumptions,
        monthlyOwnContribution: fixture.expected.copaymentYearly / 12,
        eligibility: {
          directlyEligible: fixture.eligibility.directlyEligible,
          indirectSpouseEligible: fixture.eligibility.indirectSpouseEligible,
          ageAtContractStart: fixture.eligibility.ageAtContractStart,
          careerStarterBonusUsed: fixture.eligibility.careerStarterBonusUsed,
        },
      },
      profile,
    )
    const actualChildrenBonus = actual.childAllowanceAnnual + actual.careerStarterBonusAnnual
    const actualInvestmentAmount = actual.annualOwnContribution + actual.totalAllowanceAnnual

    expectCloseToGolden(
      actual.monthlyOwnContribution,
      fixture.expected.copaymentMonthly,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.annualOwnContribution,
      fixture.expected.copaymentYearly,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.grundzulageAnnual,
      fixture.expected.fundamentalBonus,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actualChildrenBonus,
      fixture.expected.childrenBonus,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actualInvestmentAmount,
      fixture.expected.investmentAmount,
      fixture.toleranceEUR,
    )
    expect(actual.meetsMinContribution).toBe(true)
  })
})

describe('external golden: retirement cohort tables', () => {
  it.each(besteuerungsanteilGoldenValues)('$id', (fixture) => {
    expect(besteuerungsanteilGrv(fixture.retirementYear)).toBe(fixture.expected)
  })

  it.each(versorgungsfreibetragGoldenValues)('$id', (fixture) => {
    const actual = versorgungsfreibetrag(fixture.retirementYear)
    expect(actual.prozent).toBeCloseTo(fixture.expectedProzent, 6)
    expect(actual.hoechstbetrag).toBe(fixture.expectedHoechstbetrag)
    expect(actual.zuschlag).toBe(fixture.expectedZuschlag)
  })
})

describe('external golden: statutory pension gross projection', () => {
  it.each(statutoryPensionGoldenCases)('$id', (fixture) => {
    const rules = {
      ...de2026Rules,
      socialSecurity: {
        ...de2026Rules.socialSecurity,
        aktuellerRentenwert: fixture.rulesAktuellerRentenwert,
      },
    }
    const profile: PersonalProfile = {
      ...defaultProfile,
      age: fixture.age,
      retirementAge: fixture.retirementAge,
      grossSalaryYear: fixture.grossSalaryYear,
    }

    const actual = projectStatutoryPension(
      profile,
      rules,
      {
        pensionBaselineType: 'grv',
        manualMonthlyGross: null,
        currentEntgeltpunkte: fixture.currentEntgeltpunkte,
        includeGrvReduction: false,
        annualSalaryGrowthRate: 0,
        rentenwertGrowthRate: 0,
      },
      0,
      rules.year + fixture.retirementAge - fixture.age,
    )

    expect(actual.projectedEntgeltpunkte).toBeCloseTo(
      fixture.expectedProjectedEntgeltpunkte,
      10,
    )
    expectCloseToGolden(
      actual.grossMonthlyPension,
      fixture.expectedGrossMonthlyPension,
      fixture.toleranceEUR,
    )
  })
})

describe('external golden: bAV contribution limits', () => {
  function bavLimit(kind: (typeof bavContributionLimitGoldenValues)[number]['kind']): number {
    const annualTaxFreeLimit =
      de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap
    const annualSvFreeLimit =
      de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap

    switch (kind) {
      case 'taxFreeAnnual':
        return annualTaxFreeLimit
      case 'taxFreeMonthly':
        return annualTaxFreeLimit / 12
      case 'svFreeAnnual':
        return annualSvFreeLimit
      case 'svFreeMonthly':
        return annualSvFreeLimit / 12
    }
  }

  it.each(bavContributionLimitGoldenValues)('$id', (fixture) => {
    expect(bavLimit(fixture.kind)).toBe(fixture.expected)
  })
})

describe('external golden: Bavarian Alterseinkünfte-Rechner 2026 captures', () => {
  it.each(bayernAlterseinkuenfte2026GoldenCases)('$id', (fixture) => {
    const actual = calculateRetirementTax(fixture.components, de2026Rules)
    expectCloseToGolden(
      actual.zuVersteuerndesEinkommen,
      fixture.expected.zuVersteuerndesEinkommen,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.einkommensteuer,
      fixture.expected.einkommensteuer,
      fixture.toleranceEUR,
    )
  })
})

describe('external golden: retirement taxable-income pipeline', () => {
  it.each(retirementTaxGoldenCases)('$id', (fixture) => {
    const actual = calculateRetirementTax(fixture.components, de2026Rules)

    expectCloseToGolden(
      actual.statutoryPensionTaxable,
      fixture.expected.statutoryPensionTaxable,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.bavPensionTaxable,
      fixture.expected.bavPensionTaxable,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.privateInsuranceTaxable,
      fixture.expected.privateInsuranceTaxable,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.zuVersteuerndesEinkommen,
      fixture.expected.zuVersteuerndesEinkommen,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.einkommensteuer,
      fixture.expected.einkommensteuer,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.totalTaxAnnual,
      fixture.expected.totalTaxAnnual,
      fixture.toleranceEUR,
    )
  })
})

describe('external golden: ETF Vorabpauschale gross accrual', () => {
  it.each(etfVorabpauschaleGoldenCases)('$id', (fixture) => {
    const actual = projectAccumulation({
      productId: 'etf',
      currentAge: 40,
      months: fixture.months,
      monthlyUserCost: fixture.monthlyContribution,
      monthlyProductContribution: fixture.monthlyContribution,
      monthlyEmployerContribution: 0,
      annualReturn: fixture.annualReturn,
      inflationRate: 0,
      scenario: { id: 'basis', label: 'Basis', annualReturn: fixture.annualReturn },
      fees: {
        wrapperAssetFee: 0,
        fundAssetFee: 0,
        contributionFee: 0,
        fixedMonthlyFee: 0,
        acquisitionCostPct: 0,
        acquisitionCostSpreadYears: 1,
        pensionPayoutFeePct: 0,
      },
      policy: {
        initialCapital: fixture.initialCapital,
        vorabpauschale: {
          rules: de2026Rules,
          partialExemption: fixture.partialExemption,
        },
      },
    })

    expectCloseToGolden(
      actual.cumulativeVorabpauschale,
      fixture.expectedCumulativeVorabpauschale,
      fixture.toleranceEUR,
    )
  })
})

describe('external golden: ETF exit tax basis', () => {
  it.each(etfExitTaxGoldenCases)('$id', (fixture) => {
    const actualGain = Math.max(
      0,
      fixture.capital - fixture.totalContributions - fixture.cumulativeVorabpauschale,
    )
    const actualTaxDue = calculateCapitalGainsTax(
      actualGain,
      de2026Rules,
      fixture.partialExemption,
      de2026Rules.capitalGains.saverAllowance,
    )
    const actualAfterTaxCapital = afterTaxInvestmentCapital(
      fixture.capital,
      fixture.totalContributions,
      de2026Rules,
      fixture.partialExemption,
      fixture.cumulativeVorabpauschale,
    )

    expectCloseToGolden(
      actualGain,
      fixture.expectedTaxableExitGainBeforeExemption,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(actualTaxDue, fixture.expectedTaxDue, fixture.toleranceEUR)
    expectCloseToGolden(
      actualAfterTaxCapital,
      fixture.expectedAfterTaxCapital,
      fixture.toleranceEUR,
    )
  })
})

describe('external golden: bAV funding at statutory boundaries', () => {
  it.each(bavFundingBoundaryGoldenCases)('$id', (fixture) => {
    const actual = calculateBavFunding(defaultProfile, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: fixture.monthlyGrossConversion,
      contractualMatchPercent: fixture.contractualMatchPercent ?? 0,
      contractualFixedMonthly: fixture.contractualFixedMonthly ?? 0,
    })

    expectCloseToGolden(
      actual.annualGrossConversion,
      fixture.expectedAnnualGrossConversion,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.annualEmployerContribution,
      fixture.expectedAnnualEmployerContribution,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.totalBavContributionAnnual,
      fixture.expectedTotalBavContributionAnnual,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.taxFreePortionAnnual,
      fixture.expectedTaxFreePortionAnnual,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.svFreePortionAnnual,
      fixture.expectedSvFreePortionAnnual,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.taxableOverflowAnnual,
      fixture.expectedTaxableOverflowAnnual,
      fixture.toleranceEUR,
    )
    expectCloseToGolden(
      actual.svLiableOverflowAnnual,
      fixture.expectedSvLiableOverflowAnnual,
      fixture.toleranceEUR,
    )
  })
})
