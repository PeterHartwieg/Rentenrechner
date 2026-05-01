import { describe, expect, it } from 'vitest'
import { syncMonthlyContributions } from './syncContributions'
import { calculateBavFunding, solveBavGrossFromNet } from '../engine/salary'
import {
  calculateBasisrenteFunding,
  solveBasisrenteGrossFromNet,
} from '../engine/basisrente'
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

describe('syncMonthlyContributions — bidirectional sync invariant', () => {
  function effectiveNetCosts(assumptions: ReturnType<typeof syncMonthlyContributions>) {
    const bavFunding = calculateBavFunding(defaultProfile, de2026Rules, assumptions.bav)
    const basisrenteFunding = calculateBasisrenteFunding(
      de2026Rules,
      bavFunding.salaryWithBav,
      assumptions.basisrente,
    )
    return {
      bav: bavFunding.monthlyNetCost,
      basisrente: basisrenteFunding.monthlyNetCost,
      avd: assumptions.altersvorsorgedepot.monthlyOwnContribution,
      riester: assumptions.riester.monthlyOwnContribution,
    }
  }

  it('typing in AVD propagates to bAV / Basisrente / Riester at matching net cost', () => {
    const next = syncMonthlyContributions(
      'avd',
      200,
      defaultAssumptions,
      defaultProfile,
      de2026Rules,
    )
    const nets = effectiveNetCosts(next)
    expect(nets.avd).toBe(200)
    expect(nets.riester).toBe(200)
    expect(nets.bav).toBeCloseTo(200, 0)
    expect(nets.basisrente).toBeCloseTo(200, 0)
  })

  it('typing in bAV brutto propagates the resulting net to the other three fields', () => {
    const next = syncMonthlyContributions(
      'bav',
      400,
      defaultAssumptions,
      defaultProfile,
      de2026Rules,
    )
    const nets = effectiveNetCosts(next)
    // bAV net is whatever 400 EUR brutto yields after tax/SV/employer subsidy.
    expect(next.bav.monthlyGrossConversion).toBe(400)
    expect(nets.avd).toBeCloseTo(nets.bav, 0)
    expect(nets.riester).toBeCloseTo(nets.bav, 0)
    expect(nets.basisrente).toBeCloseTo(nets.bav, 0)
  })

  it('typing in Basisrente brutto propagates the resulting net to the other three fields', () => {
    const next = syncMonthlyContributions(
      'basisrente',
      250,
      defaultAssumptions,
      defaultProfile,
      de2026Rules,
    )
    const nets = effectiveNetCosts(next)
    expect(next.basisrente.monthlyGrossContribution).toBe(250)
    expect(nets.avd).toBeCloseTo(nets.basisrente, 0)
    expect(nets.riester).toBeCloseTo(nets.basisrente, 0)
    expect(nets.bav).toBeCloseTo(nets.basisrente, 0)
  })

  it('typing in Riester propagates 1:1 to AVD and back-solves bAV/Basisrente', () => {
    const next = syncMonthlyContributions(
      'riester',
      150,
      defaultAssumptions,
      defaultProfile,
      de2026Rules,
    )
    const nets = effectiveNetCosts(next)
    expect(nets.riester).toBe(150)
    expect(nets.avd).toBe(150)
    expect(nets.bav).toBeCloseTo(150, 0)
    expect(nets.basisrente).toBeCloseTo(150, 0)
  })

  it('typing 0 in any source zeroes all four fields', () => {
    const next = syncMonthlyContributions(
      'avd',
      0,
      defaultAssumptions,
      defaultProfile,
      de2026Rules,
    )
    expect(next.bav.monthlyGrossConversion).toBe(0)
    expect(next.basisrente.monthlyGrossContribution).toBe(0)
    expect(next.altersvorsorgedepot.monthlyOwnContribution).toBe(0)
    expect(next.riester.monthlyOwnContribution).toBe(0)
  })

  it('clamps AVD at the AltZertG contract cap when anchor exceeds it', () => {
    // Default profile (eligible direct, 0 children, no career bonus) → saturated
    // basic allowance = 540 EUR/year. Cap = 6,840 EUR/year. Max own = (6840-540)/12 = 525 EUR/month.
    const next = syncMonthlyContributions(
      'riester',
      900,
      defaultAssumptions,
      defaultProfile,
      de2026Rules,
    )
    // Riester (the source) keeps the user's typed value — other products are not capped.
    expect(next.riester.monthlyOwnContribution).toBe(900)
    // AVD clamps at ≤ 525.
    expect(next.altersvorsorgedepot.monthlyOwnContribution).toBeLessThanOrEqual(525)
    expect(next.altersvorsorgedepot.monthlyOwnContribution).toBeGreaterThan(500)
    // bAV/Basisrente continue to back-solve to the 900 net anchor — no clamp.
    const bavNet = calculateBavFunding(defaultProfile, de2026Rules, next.bav).monthlyNetCost
    expect(bavNet).toBeCloseTo(900, 0)
  })

  it('typing in AVD above the cap clamps the typed value AND the anchor for all four fields', () => {
    // Direct AVD input above cap: anchor itself is clamped, so all four fields rebalance
    // to the cap (the user can physically pay no more than this into AVD).
    const next = syncMonthlyContributions(
      'avd',
      900,
      defaultAssumptions,
      defaultProfile,
      de2026Rules,
    )
    expect(next.altersvorsorgedepot.monthlyOwnContribution).toBeLessThanOrEqual(525)
    expect(next.riester.monthlyOwnContribution).toBeLessThanOrEqual(525)
    // bAV net cost should also match the clamped anchor, not 900.
    const bavNet = calculateBavFunding(defaultProfile, de2026Rules, next.bav).monthlyNetCost
    expect(bavNet).toBeLessThanOrEqual(530) // close to 525, with small bisection slack
  })
})
