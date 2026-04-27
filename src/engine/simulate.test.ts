import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import type { PersonalProfile, ScenarioAssumptions } from '../domain/types'
import { careEmployeeRateForChildren, calculateBavFunding, calculateSalaryResult } from './salary'
import { simulateRetirementComparison } from './simulate'
import { calculateIncomeTax2026 } from './tax'
import { netBavPayout } from './projections'

// Base profile for payroll tax tests: Steuerklasse I, no kids, no church, GKV 2.9%
const testProfile75k: PersonalProfile = {
  ...defaultProfile,
  grossSalaryYear: 75_000,
}
const testProfile50k: PersonalProfile = { ...testProfile75k, grossSalaryYear: 50_000 }
const testProfile100k: PersonalProfile = { ...testProfile75k, grossSalaryYear: 100_000 }

describe('BMF PAP 2026 payroll tax (Steuerklasse I, GKV 2.9%, no church)', () => {
  it('excludes unemployment from the Vorsorgepauschale', () => {
    const r = calculateSalaryResult(testProfile75k, de2026Rules)
    // Vorsorgepauschale = RV + GKV + PV only, no AV
    const expectedVps =
      r.social.pension + r.social.health + r.social.care
    expect(r.vorsorgepauschale).toBeCloseTo(expectedVps)
    expect(r.vorsorgepauschale).toBeLessThan(r.social.total) // AV excluded
  })

  it('returns correct income tax at 50,000 EUR gross', () => {
    const r = calculateSalaryResult(testProfile50k, de2026Rules)
    // taxableIncome = 50000 – VPS(10225) – ANP(1230) – SAP(36) = 38509
    expect(r.taxableIncome).toBeCloseTo(38_509, -1)
    expect(r.incomeTax).toBe(6_741)
    expect(r.solidarityTax).toBe(0)
  })

  it('returns correct income tax at 75,000 EUR gross', () => {
    const r = calculateSalaryResult(testProfile75k, de2026Rules)
    // taxableIncome = 75000 – VPS(14752) – 1266 ≈ 58982
    expect(r.taxableIncome).toBeCloseTo(58_982, -1)
    expect(r.incomeTax).toBe(13_841)
    expect(r.solidarityTax).toBe(0)
  })

  it('returns correct income tax at 100,000 EUR gross', () => {
    const r = calculateSalaryResult(testProfile100k, de2026Rules)
    // taxableIncome = 100000 – VPS(17077) – 1266 ≈ 81657
    expect(r.taxableIncome).toBeCloseTo(81_657, -1)
    expect(r.incomeTax).toBe(23_159)
    expect(r.solidarityTax).toBeCloseTo(334, 0)
  })

  it('bAV at 100 EUR/month reduces net cost to ~55 EUR/month', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 100,
    })
    expect(f.monthlyNetCost).toBeCloseTo(55, 0)
    expect(f.monthlyTaxAndSvSavings).toBeCloseTo(45, 0)
  })

  it('bAV at 300 EUR/month reduces net cost to ~166 EUR/month', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
    })
    expect(f.monthlyNetCost).toBeCloseTo(166, 0)
    expect(f.monthlyTaxAndSvSavings).toBeCloseTo(134, 0)
  })

  it('bAV at 500 EUR/month caps SV-free at 4% BBG and nets ~292 EUR/month', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 500,
    })
    // 500*12=6000 > svFreeLimit(4056): effective employee SV-free < 4056
    expect(f.monthlyNetCost).toBeCloseTo(292, 0)
    expect(f.svLiableOverflowAnnual).toBeGreaterThan(0)
  })
})

describe('bAV contribution limit handling (#4)', () => {
  it('total bAV stays within limits for default profile', () => {
    const f = calculateBavFunding(defaultProfile, de2026Rules, defaultAssumptions.bav)
    expect(f.totalBavContributionAnnual).toBeCloseTo(
      f.annualGrossConversion + f.annualEmployerContribution, 2,
    )
    expect(f.taxableOverflowAnnual).toBe(0)
    expect(f.svLiableOverflowAnnual).toBe(0)
    // taxFreePortionAnnual == totalBavContributionAnnual when under 8% BBG
    expect(f.taxFreePortionAnnual).toBeCloseTo(f.totalBavContributionAnnual, 2)
  })

  it('detects SV-liable overflow when total bAV exceeds 4% BBG', () => {
    // Extra employer match of 100% pushes total well above 4% BBG (4056/year)
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
      extraEmployerContributionPct: 1.0, // 100% match → 300 extra/month = 3600/year
    })
    // total ≈ 3600 (employee) + 3600 (extra) + ~32 (statutory) >> 4056
    expect(f.svLiableOverflowAnnual).toBeGreaterThan(0)
    expect(f.svFreePortionAnnual).toBeCloseTo(
      de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap,
      0,
    )
  })
})

describe('German 2026 tax helper', () => {
  it('keeps income below the basic allowance tax-free', () => {
    expect(calculateIncomeTax2026(12_348, de2026Rules)).toBe(0)
  })

  it('calculates the 42 percent zone from the BMF 2026 formula', () => {
    expect(calculateIncomeTax2026(75_000, de2026Rules)).toBe(20_364)
  })

  it('uses the 2026 top tax zone from 277,826 EUR onward', () => {
    expect(calculateIncomeTax2026(277_825, de2026Rules)).toBe(105_550)
    expect(calculateIncomeTax2026(277_826, de2026Rules)).toBe(105_551)
    expect(calculateIncomeTax2026(277_827, de2026Rules)).toBe(105_551)
  })
})

describe('social-security helpers', () => {
  it('calculates employee care-insurance rates by child count', () => {
    expect(careEmployeeRateForChildren(0, de2026Rules)).toBeCloseTo(0.024)
    expect(careEmployeeRateForChildren(1, de2026Rules)).toBeCloseTo(0.018)
    expect(careEmployeeRateForChildren(2, de2026Rules)).toBeCloseTo(0.0155)
    expect(careEmployeeRateForChildren(3, de2026Rules)).toBeCloseTo(0.013)
    expect(careEmployeeRateForChildren(5, de2026Rules)).toBeCloseTo(0.008)
    expect(careEmployeeRateForChildren(6, de2026Rules)).toBeCloseTo(0.008)
  })

  it('applies the same KV Freibetrag base to bAV health and care deductions', () => {
    const allowance = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly
    const deductionRate =
      de2026Rules.socialSecurity.healthGeneralRate +
      defaultProfile.healthAdditionalContributionPct / 100 +
      de2026Rules.socialSecurity.careRetirementChildlessRate

    expect(netBavPayout(allowance - 1, defaultProfile, de2026Rules)).toBeCloseTo(allowance - 1)
    expect(netBavPayout(allowance, defaultProfile, de2026Rules)).toBeCloseTo(allowance)
    expect(netBavPayout(allowance + 100, defaultProfile, de2026Rules)).toBeCloseTo(
      allowance + 100 - 100 * deductionRate,
    )
  })
})

describe('bAV funding model', () => {
  it('uses the actual employer social-security saving as cap for the minimum subsidy', () => {
    const funding = calculateBavFunding(defaultProfile, de2026Rules, defaultAssumptions.bav)

    expect(funding.monthlyGrossConversion).toBe(300)
    expect(funding.monthlyMandatoryEmployerSubsidy).toBeGreaterThan(25)
    expect(funding.monthlyMandatoryEmployerSubsidy).toBeLessThan(45)
  })

  it('compares private products against the same net cost as bAV by default', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const basis = result.products.filter((product) => product.scenarioId === 'basis')
    const etf = basis.find((product) => product.productId === 'etf')
    const bav = basis.find((product) => product.productId === 'bav')

    expect(etf?.monthlyUserCost).toBeCloseTo(bav?.monthlyUserCost ?? 0, 2)
    expect(bav?.monthlyProductContribution).toBeGreaterThan(bav?.monthlyUserCost ?? 0)
  })

  it('hides bAV lump-sum after-tax capital until exact lump-sum treatment is modeled', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const bav = result.products.find(
      (product) => product.productId === 'bav' && product.scenarioId === 'basis',
    )

    expect(bav?.afterTaxLumpSum).toBeNull()
    expect(bav?.valueMultipleOnUserCost).toBeNull()
  })

  it('explicitly handles normal and tax-free private insurance modes', () => {
    const taxFreeAssumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      insurance: {
        ...defaultAssumptions.insurance,
        taxMode: 'steuerfrei',
      },
    }
    const normal = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
      .products.filter((product) => product.productId === 'versicherung')
      .find((product) => product.scenarioId === 'basis')
    const taxFree = simulateRetirementComparison(defaultProfile, taxFreeAssumptions, de2026Rules)
      .products.filter((product) => product.productId === 'versicherung')
      .find((product) => product.scenarioId === 'basis')

    expect(taxFree?.afterTaxLumpSum).toBeCloseTo(taxFree?.capitalAtRetirement ?? 0)
    expect(taxFree?.netMonthlyPayout).toBeCloseTo(taxFree?.grossMonthlyPayout ?? 0)
    expect(normal?.afterTaxLumpSum ?? 0).toBeLessThan(taxFree?.afterTaxLumpSum ?? 0)
    expect(normal?.netMonthlyPayout ?? 0).toBeLessThan(taxFree?.netMonthlyPayout ?? 0)
  })
})
