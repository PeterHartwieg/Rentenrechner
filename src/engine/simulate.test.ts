import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { calculateBavFunding } from './salary'
import { simulateRetirementComparison } from './simulate'
import { calculateIncomeTax2026 } from './tax'

describe('German 2026 tax helper', () => {
  it('keeps income below the basic allowance tax-free', () => {
    expect(calculateIncomeTax2026(12_348, de2026Rules)).toBe(0)
  })

  it('calculates the 42 percent zone from the BMF 2026 formula', () => {
    expect(calculateIncomeTax2026(75_000, de2026Rules)).toBe(20_364)
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
})
