import { describe, expect, it } from 'vitest'
import type { PersonalProfile } from '../domain'
import { defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { legalConstants } from '../rules/legalConstants'
import { calculateVorsorgepauschale2026, careEmployeeRateForChildren } from './salary'

/**
 * Profile chosen so the §39b EStG KV + PV + AV Teilbetrag cap actually binds:
 * gross 16 000 EUR, GKV, childless (Kinderlosenzuschlag), no bAV conversion.
 */
const cappedProfile: PersonalProfile = {
  ...defaultProfile,
  grossSalaryYear: 16_000,
  childBirthYears: [],
  publicHealthInsurance: true,
  healthAdditionalContributionPct: 2.9,
}

function expectedKvPvSum(rules = de2026Rules): number {
  const kvBase = Math.min(16_000, rules.socialSecurity.healthCareCapYear)
  const kv = kvBase * (rules.socialSecurity.healthReducedRate / 2 + 0.029 / 2)
  const pv = kvBase * rules.socialSecurity.careEmployeeChildlessRate
  return kv + pv
}

describe('calculateVorsorgepauschale2026 — §39b KV/PV/AV Teilbetrag cap', () => {
  it('includes the AV Teilbetrag only up to the 1 900 EUR cap', () => {
    // 16 000 gross: KV 1 352 + PV 384 = 1 736 < 1 900 < 1 736 + AV 208,
    // so the AV Teilbetrag is truncated to the remaining headroom of 164.
    const kvpvSum = expectedKvPvSum()
    const avActual = 16_000 * de2026Rules.socialSecurity.unemploymentEmployeeRate
    expect(kvpvSum).toBeLessThan(legalConstants.payrollTax.vorsorgepauschaleKvPvAvCap)
    expect(legalConstants.payrollTax.vorsorgepauschaleKvPvAvCap).toBeLessThan(kvpvSum + avActual)

    const headroom = legalConstants.payrollTax.vorsorgepauschaleKvPvAvCap - kvpvSum
    const expected = 16_000 * de2026Rules.socialSecurity.pensionEmployeeRate + kvpvSum + headroom
    expect(calculateVorsorgepauschale2026(16_000, cappedProfile, de2026Rules)).toBeCloseTo(expected, 9)
    expect(calculateVorsorgepauschale2026(16_000, cappedProfile, de2026Rules)).toBeCloseTo(3_388, 2)
  })

  it('is fully truncated to KV + PV when the cap drops to their sum', () => {
    const capRef = legalConstants.payrollTax as { vorsorgepauschaleKvPvAvCap: number }
    const original = capRef.vorsorgepauschaleKvPvAvCap
    const kvpvSum = expectedKvPvSum()
    capRef.vorsorgepauschaleKvPvAvCap = kvpvSum
    try {
      expect(calculateVorsorgepauschale2026(16_000, cappedProfile, de2026Rules)).toBeCloseTo(
        16_000 * de2026Rules.socialSecurity.pensionEmployeeRate + kvpvSum,
        9,
      )
    } finally {
      capRef.vorsorgepauschaleKvPvAvCap = original
    }
  })

  it('reacts to a statutory amendment of the cap — −100 EUR cap drops the VPA by exactly 100', () => {
    const capRef = legalConstants.payrollTax as { vorsorgepauschaleKvPvAvCap: number }
    const original = capRef.vorsorgepauschaleKvPvAvCap
    const baseline = calculateVorsorgepauschale2026(16_000, cappedProfile, de2026Rules)
    capRef.vorsorgepauschaleKvPvAvCap = original - 100
    try {
      // AV headroom (164 EUR) still positive after the cut, so the full 100 EUR
      // comes out of the AV Teilbetrag.
      expect(calculateVorsorgepauschale2026(16_000, cappedProfile, de2026Rules)).toBeCloseTo(
        baseline - 100,
        9,
      )
    } finally {
      capRef.vorsorgepauschaleKvPvAvCap = original
    }
  })

  it('is unaffected by the cap once KV + PV + AV fit below it', () => {
    const capRef = legalConstants.payrollTax as { vorsorgepauschaleKvPvAvCap: number }
    const original = capRef.vorsorgepauschaleKvPvAvCap
    const avActual = 16_000 * de2026Rules.socialSecurity.unemploymentEmployeeRate
    const kvpvSum = expectedKvPvSum()
    capRef.vorsorgepauschaleKvPvAvCap = kvpvSum + avActual + 1_000
    try {
      const expected =
        16_000 * de2026Rules.socialSecurity.pensionEmployeeRate + kvpvSum + avActual
      expect(calculateVorsorgepauschale2026(16_000, cappedProfile, de2026Rules)).toBeCloseTo(expected, 9)
    } finally {
      capRef.vorsorgepauschaleKvPvAvCap = original
    }
  })
})

describe('careEmployeeRateForChildren — §55 Abs. 3a SGB XI constants', () => {
  it('discounts 0.25 pp per further child under 25, capped at 4 further children', () => {
    // Base rate 1.8 %; two under-25 children → one discount step (0.018 − 0.0025).
    expect(careEmployeeRateForChildren([2020, 2022], 2026, de2026Rules)).toBeCloseTo(0.0155, 9)
    // Five under-25 children → capped at four discount steps (0.018 − 0.0100).
    expect(careEmployeeRateForChildren([2015, 2016, 2017, 2018, 2019], 2026, de2026Rules)).toBeCloseTo(
      0.008,
      9,
    )
    // No children → childless rate (Kinderlosenzuschlag), no discount path.
    expect(careEmployeeRateForChildren([], 2026, de2026Rules)).toBeCloseTo(0.024, 9)
  })

  it('consumes legalConstants.care — doubling the per-child discount doubles its effect', () => {
    const careRef = legalConstants.care as {
      beitragsabschlagPerFurtherChild: number
      beitragsabschlagMaxFurtherChildren: number
    }
    const original = careRef.beitragsabschlagPerFurtherChild
    const baseline = careEmployeeRateForChildren([2020, 2022], 2026, de2026Rules)
    careRef.beitragsabschlagPerFurtherChild = original * 2
    try {
      // One discount step is now worth 0.5 pp instead of 0.25 pp.
      expect(careEmployeeRateForChildren([2020, 2022], 2026, de2026Rules)).toBeCloseTo(
        baseline - 0.0025,
        9,
      )
    } finally {
      careRef.beitragsabschlagPerFurtherChild = original
    }
  })
})
