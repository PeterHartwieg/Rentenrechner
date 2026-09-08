import { describe, expect, it } from 'vitest'
import { de2026Rules } from '../rules/de2026'
import { legalConstants } from '../rules/legalConstants'
import { computeBavMinimumEntitlement } from './bavWarnings'

describe('computeBavMinimumEntitlement', () => {
  it('returns annualMin = annual Bezugsgröße / 160 for 2026 rules', () => {
    // 2026: bezugsgroesseMonthly = 3 955 EUR → annual = 47 460 EUR → annualMin = 47 460 / 160
    const { annualMin } = computeBavMinimumEntitlement(de2026Rules)
    const expectedAnnual =
      (de2026Rules.socialSecurity.bezugsgroesseMonthly * 12) /
      legalConstants.bav.minimumEntitlementDivisor
    expect(annualMin).toBeCloseTo(expectedAnnual, 6)
    expect(annualMin).toBeCloseTo(296.625, 2)
  })

  it('returns monthlyMin = annualMin / 12 for 2026 rules', () => {
    const { annualMin, monthlyMin } = computeBavMinimumEntitlement(de2026Rules)
    expect(monthlyMin).toBeCloseTo(annualMin / 12, 6)
    expect(monthlyMin).toBeCloseTo(24.72, 2)
  })

  it('annualMin is exactly 12 × monthlyMin (no rounding discrepancy)', () => {
    const { annualMin, monthlyMin } = computeBavMinimumEntitlement(de2026Rules)
    expect(annualMin).toBeCloseTo(monthlyMin * 12, 10)
  })

  it('consumes legalConstants.bav.minimumEntitlementDivisor — changing it moves the threshold', () => {
    // Wiring guard: the 1/160 divisor is read from legalConstants, not inlined.
    // Doubling the divisor must halve the minimum conversion (§1a BetrAVG).
    const baseline = computeBavMinimumEntitlement(de2026Rules)
    const bavRef = legalConstants.bav as { minimumEntitlementDivisor: number }
    const original = bavRef.minimumEntitlementDivisor
    bavRef.minimumEntitlementDivisor = original * 2
    try {
      const doubled = computeBavMinimumEntitlement(de2026Rules)
      expect(doubled.annualMin).toBeCloseTo(baseline.annualMin / 2, 9)
      expect(doubled.monthlyMin).toBeCloseTo(baseline.monthlyMin / 2, 9)
    } finally {
      bavRef.minimumEntitlementDivisor = original
    }
  })
})
