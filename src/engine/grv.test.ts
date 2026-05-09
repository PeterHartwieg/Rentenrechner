/**
 * Unit tests for `projectGrvContributionTimeline`.
 *
 * Covered cases:
 *   1. GRV baseline, flat salary → constant annual contribution each year.
 *   2. GRV baseline, salary above BBG-RV → contribution is capped.
 *   3. GRV baseline, salary growth > 0 → monotonically increasing (modulo cap).
 *   4. bAV reduction reduces the contribution proportionally.
 *   5. Non-GRV baselines (versorgungswerk, beamtenpension, none) → empty array.
 *   6. Already at retirement age → empty array.
 */

import { describe, expect, it } from 'vitest'
import { projectGrvContributionTimeline } from './grv'
import { de2026Rules } from '../rules/de2026'
import type { PersonalProfile, StatutoryPensionAssumptions } from '../domain'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function profile(overrides?: Partial<PersonalProfile>): PersonalProfile {
  return {
    age: 40,
    retirementAge: 67,
    grossSalaryYear: 60_000,
    taxClass: 1,
    childBirthYears: [],
    churchTax: false,
    publicHealthInsurance: true,
    healthAdditionalContributionPct: 2.9,
    pkvMonthlyPremium: 0,
    pPVMonthlyPremium: 0,
    desiredNetMonthlyPension: 0,
    ...overrides,
  }
}

function assumptions(overrides?: Partial<StatutoryPensionAssumptions>): StatutoryPensionAssumptions {
  return {
    pensionBaselineType: 'grv',
    manualMonthlyGross: null,
    currentEntgeltpunkte: 0,
    includeGrvReduction: false,
    annualSalaryGrowthRate: 0,
    rentenwertGrowthRate: 0,
    ...overrides,
  }
}

const rules = de2026Rules
// From de2026.ts: pensionEmployeeRate = 0.093, pensionCapYear = 101_400
const RATE = rules.socialSecurity.pensionEmployeeRate // 0.093
const CAP = rules.socialSecurity.pensionCapYear // 101_400

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('projectGrvContributionTimeline', () => {
  it('returns a row per year from current age to retirement for GRV baseline', () => {
    const result = projectGrvContributionTimeline(profile(), rules, assumptions())
    // age 40 to 67 → 27 years
    expect(result).toHaveLength(27)
    expect(result[0].ageYears).toBe(40)
    expect(result[26].ageYears).toBe(66)
  })

  it('flat salary 60,000 → constant annual contribution = 60_000 × 0.093 each year', () => {
    const result = projectGrvContributionTimeline(profile(), rules, assumptions())
    const expected = 60_000 * RATE
    for (const row of result) {
      expect(row.employeeAnnualEUR).toBeCloseTo(expected, 5)
    }
  })

  it('salary above BBG-RV is capped: 120,000 → contribution = cap × 0.093', () => {
    const p = profile({ grossSalaryYear: 120_000 })
    const result = projectGrvContributionTimeline(p, rules, assumptions())
    const expected = CAP * RATE
    for (const row of result) {
      expect(row.employeeAnnualEUR).toBeCloseTo(expected, 5)
    }
  })

  it('salary growth 2% → contributions increase monotonically (until cap)', () => {
    const p = profile({ grossSalaryYear: 60_000 })
    const a = assumptions({ annualSalaryGrowthRate: 0.02 })
    const result = projectGrvContributionTimeline(p, rules, a)
    expect(result.length).toBeGreaterThan(1)
    for (let i = 1; i < result.length; i++) {
      // Once the cap is hit both values are equal; otherwise strictly increasing.
      expect(result[i].employeeAnnualEUR).toBeGreaterThanOrEqual(result[i - 1].employeeAnnualEUR)
    }
    // First and last year should differ when below BBG
    expect(result[result.length - 1].employeeAnnualEUR).toBeGreaterThan(result[0].employeeAnnualEUR)
  })

  it('bAV reduction reduces annual contribution proportionally', () => {
    const p = profile({ grossSalaryYear: 60_000 })
    const bavReduction = 4_800 // EUR/year
    const result = projectGrvContributionTimeline(p, rules, assumptions(), bavReduction)
    // cappedSalary = 60,000; bavReducedSalary = 60,000 - 4,800 = 55,200
    const expected = (60_000 - bavReduction) * RATE
    for (const row of result) {
      expect(row.employeeAnnualEUR).toBeCloseTo(expected, 5)
    }
  })

  it('bAV reduction cannot reduce salary below zero', () => {
    const p = profile({ grossSalaryYear: 60_000 })
    const bavReduction = 200_000 // much larger than salary
    const result = projectGrvContributionTimeline(p, rules, assumptions(), bavReduction)
    for (const row of result) {
      expect(row.employeeAnnualEUR).toBe(0)
    }
  })

  it('returns empty array for versorgungswerk baseline', () => {
    const a = assumptions({ pensionBaselineType: 'versorgungswerk' })
    expect(projectGrvContributionTimeline(profile(), rules, a)).toEqual([])
  })

  it('returns empty array for beamtenpension baseline', () => {
    const a = assumptions({ pensionBaselineType: 'beamtenpension' })
    expect(projectGrvContributionTimeline(profile(), rules, a)).toEqual([])
  })

  it('returns empty array for none baseline', () => {
    const a = assumptions({ pensionBaselineType: 'none' })
    expect(projectGrvContributionTimeline(profile(), rules, a)).toEqual([])
  })

  it('returns empty array when already at retirement age', () => {
    const p = profile({ age: 67, retirementAge: 67 })
    expect(projectGrvContributionTimeline(p, rules, assumptions())).toEqual([])
  })
})
