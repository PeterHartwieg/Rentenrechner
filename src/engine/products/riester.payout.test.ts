import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import type { RiesterAssumptions } from '../../domain'
import { de2026Rules } from '../../rules/de2026'
import { simulateRetirementComparison } from '../simulate'

// Zero fees, returns and retirement income make the gross capital partition
// observable without tax progression or investment returns obscuring it.
function payout(payoutMode: RiesterAssumptions['payoutMode'], partialCapitalPct: number) {
  const result = simulateRetirementComparison(
    {
      ...defaultProfile,
      age: 66,
      retirementAge: 67,
      grossSalaryYear: 0,
    },
    {
      ...defaultAssumptions,
      visibleProducts: ['riester'],
      returnScenarios: [{ id: 'basis', label: 'Zero return', annualReturn: 0 }],
      riester: {
        ...defaultAssumptions.riester,
        monthlyOwnContribution: 0,
        existingCapital: 1699.123456789,
        capitalGuarantee: { ...defaultAssumptions.riester.capitalGuarantee, enabled: false },
        fees: {
          ...defaultAssumptions.riester.fees,
          acquisitionCostPct: 0,
          contributionFee: 0,
          wrapperAssetFee: 0,
          fundAssetFee: 0,
          fixedMonthlyFee: 0,
        },
        payoutMode,
        partialCapitalPct,
        monthlyOtherRetirementIncome: 0,
      },
    },
    de2026Rules,
  )
  return result.products.find((product) => product.productId === 'riester')!
}

describe('Riester partial-capital payout partition', () => {
  it.each(['leibrente', 'zeitrente'] as const)(
    '%s pays the lump sum from the same capital that funds the monthly payout',
    (mode) => {
      const full = payout(mode, 0)
      const partial = payout(mode, 0.3)

      expect(full.capitalAtRetirement).toBeGreaterThan(0)
      expect(partial.capitalAtRetirement).toBe(full.capitalAtRetirement)
      expect(full.afterTaxLumpSum).toBeNull()
      // Below the tax allowance, this is also the gross lump sum.
      expect(partial.afterTaxLumpSum).toBeCloseTo(full.capitalAtRetirement * 0.3, 10)
      expect(partial.grossMonthlyPayout).toBeCloseTo(full.grossMonthlyPayout * 0.7, 12)
      expect(partial.netMonthlyPayout).toBeLessThan(full.netMonthlyPayout)
      const capitalUsedForMonthlyPayout = full.capitalAtRetirement
        * partial.grossMonthlyPayout / full.grossMonthlyPayout
      expect(capitalUsedForMonthlyPayout + partial.afterTaxLumpSum!).toBeCloseTo(
        full.capitalAtRetirement, 10,
      )
    },
  )

  it('recovers only annuitized capital when calculating Leibrente break-even', () => {
    const full = payout('leibrente', 0)
    const partial = payout('leibrente', 0.3)
    expect(partial.leibrenteBreakEvenAge).toBeCloseTo(full.leibrenteBreakEvenAge!, 12)
    const annuityYears = partial.leibrenteBreakEvenAge! - 67
    expect(partial.grossMonthlyPayout * 12 * annuityYears + partial.afterTaxLumpSum!)
      .toBeCloseTo(partial.capitalAtRetirement, 10)
    expect(payout('zeitrente', 0.3).leibrenteBreakEvenAge).toBeUndefined()
  })
})
