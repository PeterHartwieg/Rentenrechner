import { describe, expect, it } from 'vitest'
import { defaultProfile, defaultRiesterAssumptions } from '../data/defaultScenario'
import type { PersonalProfile } from '../domain'
import { de2026Rules } from '../rules/de2026'
import {
  capitalGains2026GoldenValues,
  incomeTax2026GoldenCases,
  payroll2026GoldenCases,
  riester2026GoldenCases,
  socialSecurity2026GoldenValues,
  validationSources,
} from '../test/externalGoldenFixtures'
import { calculateRiesterFunding } from './riester'
import { calculateSalaryResult } from './salary'
import { calculateIncomeTax2026 } from './tax'

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
      ...payroll2026GoldenCases.map(c => c.sourceId),
      ...socialSecurity2026GoldenValues.map(c => c.sourceId),
      ...capitalGains2026GoldenValues.map(c => c.sourceId),
      ...riester2026GoldenCases.map(c => c.sourceId),
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
