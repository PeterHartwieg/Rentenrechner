import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { calculateBavFunding, solveBavGrossFromNet } from '../engine/salary'
import { calculateAvdFunding } from '../engine/altersvorsorgedepot'
import {
  avdMaxMonthlyOwn,
  normalizeMonthlyNettoBelastung,
  syncMonthlyContributions,
} from './syncContributions'

const RULES = de2026Rules

/**
 * A pinned state. Note `defaultAssumptions.visibleProducts` is `['etf', 'bav']`,
 * so AVD has to be added explicitly — a pin is only honoured while AVD is part
 * of the comparison.
 */
function pinned(monthlyOwn: number, over: Partial<ScenarioAssumptions> = {}): ScenarioAssumptions {
  return {
    ...defaultAssumptions,
    visibleProducts: ['etf', 'bav', 'altersvorsorgedepot'],
    contributionInput: { kind: 'avd-own', monthlyOwn },
    ...over,
  }
}

/**
 * AVD's true monthly net cost at a given anchor — the quantity the anchor is
 * supposed to equal. Mirrors the fixed-point body but is written independently
 * so the test does not merely restate the implementation.
 */
function trueAvdNetCostAt(
  anchor: number,
  assumptions: ScenarioAssumptions,
  profile: PersonalProfile,
  monthlyOwn: number,
): number {
  const bavGross = solveBavGrossFromNet(anchor, profile, RULES, assumptions.bav)
  const salary = calculateBavFunding(profile, RULES, {
    ...assumptions.bav,
    monthlyGrossConversion: bavGross,
  }).salaryWithBav
  return calculateAvdFunding(RULES, salary, {
    ...assumptions.altersvorsorgedepot,
    monthlyOwnContribution: monthlyOwn,
  }).monthlyNetCost
}

/**
 * Residual tolerance for anchor self-consistency, in EUR/month.
 *
 * `floorEuro(zvE)` quantises the annual tax saving into whole euros, so the
 * anchor fixed point can sit on a riser of that step function and 2-cycle
 * instead of converging. The residual is then bounded by the cycle amplitude,
 * which is 1/12 EUR at typical salaries but grows to a measured 0.0933 EUR at
 * the pension BBG, where the bAV conversion crosses an SV threshold.
 *
 * 0.10 is the measured worst case (0.0933) plus headroom — deliberately not
 * derived from theory, because the 1/12 figure looked exact until a BBG salary
 * was tested. A regression above this is a real solver defect, not quantisation.
 */
const SELF_CONSISTENCY_TOLERANCE = 0.1

describe('syncMonthlyContributions — net mode (unchanged behaviour)', () => {
  it('is byte-identical to the pre-feature result when no input mode is stored', () => {
    const withoutField = syncMonthlyContributions(200, defaultAssumptions, defaultProfile, RULES)
    const withNetMode = syncMonthlyContributions(
      200,
      { ...defaultAssumptions, contributionInput: { kind: 'net' } },
      defaultProfile,
      RULES,
    )
    expect(withoutField.equalInputAmountEUR).toBe(200)
    expect(withoutField.bav.monthlyGrossConversion).toBe(withNetMode.bav.monthlyGrossConversion)
    expect(withoutField.basisrente.monthlyGrossContribution).toBe(
      withNetMode.basisrente.monthlyGrossContribution,
    )
    expect(withoutField.altersvorsorgedepot.monthlyOwnContribution).toBe(
      withNetMode.altersvorsorgedepot.monthlyOwnContribution,
    )
    expect(withoutField.riester.monthlyOwnContribution).toBe(
      withNetMode.riester.monthlyOwnContribution,
    )
  })

  it('does not add the field to states that did not carry it', () => {
    const result = syncMonthlyContributions(200, defaultAssumptions, defaultProfile, RULES)
    expect('contributionInput' in result && result.contributionInput !== undefined).toBe(false)
  })
})

describe('syncMonthlyContributions — pinned AVD Eigenbeitrag', () => {
  it.each([10, 30, 150, 300, 525])(
    'keeps the Eigenbeitrag exactly at %s EUR/month',
    (own) => {
      const result = syncMonthlyContributions(0, pinned(own), defaultProfile, RULES)
      expect(result.altersvorsorgedepot.monthlyOwnContribution).toBe(own)
    },
  )

  it.each([10, 30, 150, 300, 525])(
    'derives an anchor that equals AVD real net cost at %s EUR/month',
    (own) => {
      const result = syncMonthlyContributions(0, pinned(own), defaultProfile, RULES)
      const anchor = result.equalInputAmountEUR ?? 0
      const trueCost = trueAvdNetCostAt(anchor, defaultAssumptions, defaultProfile, own)
      // This is the fair-comparison postcondition: every other product invests
      // `anchor`, so `anchor` must be what AVD actually costs. The earlier
      // design that bisected the inverse failed here by 2.28 EUR at own=10.
      expect(Math.abs(anchor - trueCost)).toBeLessThan(SELF_CONSISTENCY_TOLERANCE)
    },
  )

  it('sizes the other products from the derived anchor, not from targetNet', () => {
    const result = syncMonthlyContributions(999, pinned(150), defaultProfile, RULES)
    const anchor = result.equalInputAmountEUR ?? 0
    expect(anchor).toBeLessThan(999)
    const unpinned = syncMonthlyContributions(anchor, defaultAssumptions, defaultProfile, RULES)
    expect(result.bav.monthlyGrossConversion).toBeCloseTo(unpinned.bav.monthlyGrossConversion, 6)
    expect(result.basisrente.monthlyGrossContribution).toBeCloseTo(
      unpinned.basisrente.monthlyGrossContribution,
      6,
    )
  })

  it('re-derives the anchor when the salary changes afterwards', () => {
    // Regression guard for the defect that motivated deriving inside the sync:
    // an anchor computed once at write time and stored goes stale, leaving every
    // other product investing a different amount than AVD actually costs.
    const state = pinned(150)
    const before = syncMonthlyContributions(0, state, defaultProfile, RULES)
    const richer = { ...defaultProfile, grossSalaryYear: defaultProfile.grossSalaryYear + 20_000 }
    const after = syncMonthlyContributions(0, state, richer, RULES)

    expect(after.equalInputAmountEUR).not.toBeCloseTo(before.equalInputAmountEUR ?? 0, 2)
    const anchor = after.equalInputAmountEUR ?? 0
    const trueCost = trueAvdNetCostAt(anchor, defaultAssumptions, richer, 150)
    expect(Math.abs(anchor - trueCost)).toBeLessThan(SELF_CONSISTENCY_TOLERANCE)
  })

  it('terminates on a known 2-cycle point', () => {
    // own=35 is one of the 30/211 sampled points where the fixed point sits on a
    // riser of the floorEuro step function and plain iteration never converges.
    const result = syncMonthlyContributions(0, pinned(35), defaultProfile, RULES)
    const anchor = result.equalInputAmountEUR ?? 0
    expect(Number.isFinite(anchor)).toBe(true)
    const trueCost = trueAvdNetCostAt(anchor, defaultAssumptions, defaultProfile, 35)
    expect(Math.abs(anchor - trueCost)).toBeLessThan(SELF_CONSISTENCY_TOLERANCE)
  })

  it.each([0, 12_000, 30_000, 69_750, 95_000, 101_400, 250_000])(
    'stays finite and self-consistent at a %s EUR salary',
    (grossSalaryYear) => {
      const profile = { ...defaultProfile, grossSalaryYear }
      const result = syncMonthlyContributions(0, pinned(150), profile, RULES)
      const anchor = result.equalInputAmountEUR ?? 0
      expect(Number.isFinite(anchor)).toBe(true)
      expect(anchor).toBeGreaterThanOrEqual(0)
      const trueCost = trueAvdNetCostAt(anchor, defaultAssumptions, profile, 150)
      expect(Math.abs(anchor - trueCost)).toBeLessThan(SELF_CONSISTENCY_TOLERANCE)
    },
  )

  it('re-clamps the pinned Eigenbeitrag when profile eligibility lowers the ceiling', () => {
    const profile = {
      ...defaultProfile,
      childBirthYears: [RULES.year - 5, RULES.year - 3],
    }
    const twoKids: ScenarioAssumptions = pinned(525, {
      altersvorsorgedepot: {
        ...defaultAssumptions.altersvorsorgedepot,
        eligibility: {
          ...defaultAssumptions.altersvorsorgedepot.eligibility,
          eligibleChildren: 2,
        },
      },
    })
    const ceiling = avdMaxMonthlyOwn(twoKids, RULES)
    expect(ceiling).toBeCloseTo(475, 6)

    const result = syncMonthlyContributions(0, twoKids, profile, RULES)
    expect(result.altersvorsorgedepot.monthlyOwnContribution).toBeCloseTo(475, 6)
    expect(result.contributionInput).toEqual({ kind: 'avd-own', monthlyOwn: ceiling })
  })

  it('ignores the pin while AVD is not part of the comparison', () => {
    const hidden = pinned(150, { visibleProducts: ['etf', 'bav'] })
    const result = syncMonthlyContributions(200, hidden, defaultProfile, RULES)
    // Falls back to plain net mode: the anchor is the caller's target again.
    expect(result.equalInputAmountEUR).toBe(200)
    // ...but the user's choice is preserved rather than erased, so re-adding
    // AVD to the comparison restores it.
    expect(result.contributionInput).toEqual({ kind: 'avd-own', monthlyOwn: 150 })
  })

  it('treats a zero or negative pin as zero', () => {
    for (const own of [0, -5]) {
      const result = syncMonthlyContributions(200, pinned(own), defaultProfile, RULES)
      expect(result.equalInputAmountEUR).toBe(0)
      expect(result.altersvorsorgedepot.monthlyOwnContribution).toBe(0)
    }
  })
})

describe('normalizeMonthlyNettoBelastung', () => {
  it('floors at zero and rejects non-finite input', () => {
    expect(normalizeMonthlyNettoBelastung(-1)).toBe(0)
    expect(normalizeMonthlyNettoBelastung(Number.NaN)).toBe(0)
    expect(normalizeMonthlyNettoBelastung(Number.POSITIVE_INFINITY)).toBe(0)
    expect(normalizeMonthlyNettoBelastung(42)).toBe(42)
  })
})
