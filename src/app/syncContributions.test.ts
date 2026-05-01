import { describe, expect, it } from 'vitest'
import { syncMonthlyContributions } from './syncContributions'
import { calculateBavFunding, solveBavGrossFromNet } from '../engine/salary'
import {
  calculateBasisrenteFunding,
  solveBasisrenteGrossFromNet,
} from '../engine/basisrente'
import { calculateAvdFunding } from '../engine/altersvorsorgedepot'
import { calculateRiesterFunding } from '../engine/riester'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'

describe('solveBavGrossFromNet', () => {
  it('round-trips: forward(inverse(target)) ≈ target across the typical range', () => {
    for (const targetNet of [50, 100, 200, 300, 500, 800]) {
      const gross = solveBavGrossFromNet(
        targetNet,
        defaultProfile,
        de2026Rules,
        defaultAssumptions.bav,
      )
      const forwardNet = calculateBavFunding(defaultProfile, de2026Rules, {
        ...defaultAssumptions.bav,
        monthlyGrossConversion: gross,
      }).monthlyNetCost
      expect(forwardNet).toBeCloseTo(targetNet, 1)
    }
  })

  it('returns 0 when target is 0 or negative', () => {
    expect(
      solveBavGrossFromNet(0, defaultProfile, de2026Rules, defaultAssumptions.bav),
    ).toBe(0)
    expect(
      solveBavGrossFromNet(-50, defaultProfile, de2026Rules, defaultAssumptions.bav),
    ).toBe(0)
  })
})

describe('solveBasisrenteGrossFromNet', () => {
  it('round-trips: forward(inverse(target)) ≈ target across the typical range', () => {
    const salary = calculateBavFunding(
      defaultProfile,
      de2026Rules,
      defaultAssumptions.bav,
    ).salaryWithBav
    for (const targetNet of [50, 100, 200, 300, 500]) {
      const gross = solveBasisrenteGrossFromNet(
        targetNet,
        de2026Rules,
        salary,
        defaultAssumptions.basisrente,
      )
      const forwardNet = calculateBasisrenteFunding(de2026Rules, salary, {
        ...defaultAssumptions.basisrente,
        monthlyGrossContribution: gross,
      }).monthlyNetCost
      expect(forwardNet).toBeCloseTo(targetNet, 1)
    }
  })
})

describe('syncMonthlyContributions — single-anchor sync invariant', () => {
  function effectiveNetCosts(assumptions: ReturnType<typeof syncMonthlyContributions>) {
    const bavFunding = calculateBavFunding(defaultProfile, de2026Rules, assumptions.bav)
    const basisrenteFunding = calculateBasisrenteFunding(
      de2026Rules,
      bavFunding.salaryWithBav,
      assumptions.basisrente,
    )
    const avdFunding = calculateAvdFunding(
      de2026Rules,
      bavFunding.salaryWithBav,
      assumptions.altersvorsorgedepot,
    )
    const riesterFunding = calculateRiesterFunding(
      de2026Rules,
      bavFunding.salaryWithBav,
      assumptions.riester,
      defaultProfile,
    )
    return {
      bav: bavFunding.monthlyNetCost,
      basisrente: basisrenteFunding.monthlyNetCost,
      avd: avdFunding.monthlyNetCost,
      riester: riesterFunding.monthlyNetCost,
    }
  }

  it('a target net of 200 EUR/Monat harmonizes all four products', () => {
    const next = syncMonthlyContributions(200, defaultAssumptions, defaultProfile, de2026Rules)
    const nets = effectiveNetCosts(next)
    expect(nets.bav).toBeCloseTo(200, 0)
    expect(nets.basisrente).toBeCloseTo(200, 0)
    expect(nets.avd).toBeCloseTo(200, 0)
    expect(nets.riester).toBeCloseTo(200, 0)
  })

  it('a target net of 100 EUR/Monat harmonizes all four products', () => {
    const next = syncMonthlyContributions(100, defaultAssumptions, defaultProfile, de2026Rules)
    const nets = effectiveNetCosts(next)
    expect(nets.bav).toBeCloseTo(100, 0)
    expect(nets.basisrente).toBeCloseTo(100, 0)
    expect(nets.avd).toBeCloseTo(100, 0)
    expect(nets.riester).toBeCloseTo(100, 0)
  })

  it('a target of 0 zeroes all four contribution fields', () => {
    const next = syncMonthlyContributions(0, defaultAssumptions, defaultProfile, de2026Rules)
    expect(next.bav.monthlyGrossConversion).toBe(0)
    expect(next.basisrente.monthlyGrossContribution).toBe(0)
    expect(next.altersvorsorgedepot.monthlyOwnContribution).toBe(0)
    expect(next.riester.monthlyOwnContribution).toBe(0)
  })

  it('AVD Eigenbeitrag clamps at the AltZertG contract cap when target exceeds AVD reach', () => {
    // Default profile (eligible direct, 0 children, no career bonus) → saturated
    // basic allowance = 540 EUR/year. Cap = 6,840 EUR/year. Max own = (6840-540)/12 = 525 EUR/month.
    const next = syncMonthlyContributions(600, defaultAssumptions, defaultProfile, de2026Rules)
    expect(next.altersvorsorgedepot.monthlyOwnContribution).toBeLessThanOrEqual(525)
    // bAV/Basisrente/Riester back-solve to the 600 net target — no clamp.
    const nets = effectiveNetCosts(next)
    expect(nets.bav).toBeCloseTo(600, 0)
    expect(nets.basisrente).toBeCloseTo(600, 0)
    expect(nets.riester).toBeCloseTo(600, 0)
    // AVD's true netto lags below the target because it ran out of headroom.
    expect(nets.avd).toBeLessThan(600)
  })
})
