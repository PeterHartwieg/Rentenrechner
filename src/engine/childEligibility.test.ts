import { afterEach, describe, expect, it } from 'vitest'
import { legalConstants } from '../rules/legalConstants'
import { childBirthYearsBornByYear, childBirthYearsUnder25InYear } from './childEligibility'

describe('childBirthYearsUnder25InYear', () => {
  const windowRef = legalConstants.childEligibility as { under25WindowYears: number }
  const originalWindow = windowRef.under25WindowYears
  afterEach(() => {
    windowRef.under25WindowYears = originalWindow
  })

  it('keeps children through the year they turn 24 (under-25 window)', () => {
    // 2026 − 2001 = 25 → excluded; 2026 − 2002 = 24 → kept.
    expect(childBirthYearsUnder25InYear([2000, 2001, 2002, 2020], 2026)).toEqual([2002, 2020])
  })

  it('consumes legalConstants.childEligibility.under25WindowYears', () => {
    // Widening the window re-includes the child who turned 25 in the year.
    windowRef.under25WindowYears = 26
    expect(childBirthYearsUnder25InYear([2000, 2001, 2002, 2020], 2026)).toEqual([
      2001, 2002, 2020,
    ])
  })

  it('never includes planned children born after the contribution year', () => {
    expect(childBirthYearsBornByYear([2020, 2030], 2026)).toEqual([2020])
    expect(childBirthYearsUnder25InYear([2020, 2030], 2026)).toEqual([2020])
  })
})
