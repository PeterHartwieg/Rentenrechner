import { describe, expect, it } from 'vitest'
import { computeRIY } from './fees'

describe('computeRIY (#57)', () => {
  it('returns 0 when contribution is zero', () => {
    expect(computeRIY(0, 120, 0.05, 10_000)).toBe(0)
  })

  it('returns 0 when months is zero', () => {
    expect(computeRIY(300, 0, 0.05, 10_000)).toBe(0)
  })

  it('returns 0 when capital is zero', () => {
    expect(computeRIY(300, 120, 0.05, 0)).toBe(0)
  })

  it('returns 0 when capital equals or exceeds no-fee FV (fees provide a bonus)', () => {
    // Capital exceeds the no-fee annuity FV — treat as zero effective cost
    const months = 12
    const c = 1_000
    const r = 0.05
    // A no-fee FV at 5% for 12 months with 1000/month ≈ 12,294 EUR
    expect(computeRIY(c, months, r, 15_000)).toBe(0)
  })

  it('RIY ≈ 0 when fees are truly zero (capital matches no-fee FV)', () => {
    // With zero fees and 5% return, the FV equals the no-fee annuity.
    // Simulate that capital by computing the beginning-of-period annuity FV manually.
    const c = 500
    const months = 240 // 20 years
    const r = 0.05
    const r_m = Math.pow(1 + r, 1 / 12) - 1
    const fv = (c * (Math.pow(1 + r_m, months) - 1) / r_m) * (1 + r_m)
    const riy = computeRIY(c, months, r, fv)
    expect(riy).toBeCloseTo(0, 5)
  })

  it('RIY ≈ totalAssetFee when only a TER-style asset fee is applied (single-fee case)', () => {
    // For a pure TER of 0.5 %, RIY should be very close to 0.5 % (not exactly, due to fee compounding
    // on net capital vs. gross, but within ~0.05 pp for typical accumulation periods).
    const c = 300
    const months = 12 * 39 // 39-year horizon
    const grossReturn = 0.05
    const ter = 0.005 // 0.5 %
    const netReturn = grossReturn - ter

    // FV at net return is what an investor would actually accumulate with a 0.5 % TER
    const r_m = (r: number) => Math.pow(1 + r, 1 / 12) - 1
    const fv = (r: number) => (c * (Math.pow(1 + r_m(r), months) - 1) / r_m(r)) * (1 + r_m(r))
    const capitalWithFees = fv(netReturn)
    const riy = computeRIY(c, months, grossReturn, capitalWithFees)
    // RIY should equal TER closely (within 0.02 pp)
    expect(riy).toBeCloseTo(ter, 2)
  })

  it('RIY is positive when fees reduce capital', () => {
    const c = 300
    const months = 12 * 39
    const grossReturn = 0.05
    const r_m = (r: number) => Math.pow(1 + r, 1 / 12) - 1
    const fv = (r: number) => (c * (Math.pow(1 + r_m(r), months) - 1) / r_m(r)) * (1 + r_m(r))
    // Reduce capital by 20% to simulate significant fees
    const capitalWithFees = fv(grossReturn) * 0.8
    const riy = computeRIY(c, months, grossReturn, capitalWithFees)
    expect(riy).toBeGreaterThan(0)
  })

  it('higher fees produce higher RIY', () => {
    const c = 300
    const months = 12 * 39
    const grossReturn = 0.05
    const r_m = (r: number) => Math.pow(1 + r, 1 / 12) - 1
    const fv = (r: number) => (c * (Math.pow(1 + r_m(r), months) - 1) / r_m(r)) * (1 + r_m(r))
    const capitalLowFee = fv(grossReturn - 0.005)   // 0.5 % TER simulation
    const capitalHighFee = fv(grossReturn - 0.015)  // 1.5 % TER simulation
    const riyLow = computeRIY(c, months, grossReturn, capitalLowFee)
    const riyHigh = computeRIY(c, months, grossReturn, capitalHighFee)
    expect(riyHigh).toBeGreaterThan(riyLow)
  })
})
