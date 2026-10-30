import { describe, expect, it } from 'vitest'
import { classifyInsuranceMonthlyIncome } from './insurancePayout'

describe('classifyInsuranceMonthlyIncome — statutory Ertragsanteil', () => {
  it('taxes 22% of a lifelong pension starting at age 60', () => {
    const classification = classifyInsuranceMonthlyIncome({
      grossMonthlyPayout: 1_000,
      capital: 200_000,
      totalContributions: 180_000,
      contractTaxMode: 'halbeinkuenfte',
      payoutMode: 'leibrente',
      retirementAge: 60,
    })

    // §22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG: 12,000 EUR/year × 22% = 2,640 EUR.
    expect(classification).toEqual({
      effectiveTaxMode: 'ertragsanteil',
      taxableAnnual: 2_640,
    })
  })
})
