import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import type { PersonalProfile } from '../../domain'
import { calculateBasisrenteFunding, netBasisrentePayout } from '../basisrente'
import { calculateSalaryResult } from '../salary'
import { simulateRetirementComparison } from '../simulate'

describe('#61 calculateBasisrenteFunding', () => {
  const baseSalary = calculateSalaryResult(defaultProfile, de2026Rules)

  it('tax saving is positive for nonzero contribution within cap', () => {
    const result = calculateBasisrenteFunding(de2026Rules, baseSalary, defaultAssumptions.basisrente)
    expect(result.annualTaxSaving).toBeGreaterThan(0)
    expect(result.monthlyTaxSaving).toBeCloseTo(result.annualTaxSaving / 12, 5)
  })

  it('monthlyNetCost = monthlyGross - monthlyTaxSaving', () => {
    const result = calculateBasisrenteFunding(de2026Rules, baseSalary, defaultAssumptions.basisrente)
    expect(result.monthlyNetCost).toBeCloseTo(
      result.monthlyGrossContribution - result.monthlyTaxSaving,
      5,
    )
  })

  it('GRV contributions count against cap; high GRV reduces remaining cap', () => {
    // At 75k salary, GRV employee = min(75000,101400) × 0.093 = 6975
    // GRV employer = same = 6975; total GRV = 13950; remaining = 30826 - 13950 = 16876
    const result = calculateBasisrenteFunding(de2026Rules, baseSalary, defaultAssumptions.basisrente)
    const expectedGrv =
      baseSalary.social.pension * (1 + de2026Rules.socialSecurity.pensionEmployerRate / de2026Rules.socialSecurity.pensionEmployeeRate)
    expect(result.annualPensionContributionsTowardsCap).toBeCloseTo(expectedGrv, 1)
    expect(result.remainingSchicht1Cap).toBeCloseTo(
      de2026Rules.basisrente.schicht1CapSingle - expectedGrv,
      1,
    )
  })

  it('deductible capped when contribution exceeds remaining cap', () => {
    // Contribute 2000 EUR/month = 24000/year; remaining cap ~16876; deductible = 16876
    const basisrente = { ...defaultAssumptions.basisrente, monthlyGrossContribution: 2000 }
    const result = calculateBasisrenteFunding(de2026Rules, baseSalary, basisrente)
    expect(result.annualDeductible).toBeLessThanOrEqual(result.remainingSchicht1Cap + 0.01)
    expect(result.annualDeductible).toBeCloseTo(result.remainingSchicht1Cap, 0)
  })

  it('zero contribution → zero tax saving and zero net cost', () => {
    const basisrente = { ...defaultAssumptions.basisrente, monthlyGrossContribution: 0 }
    const result = calculateBasisrenteFunding(de2026Rules, baseSalary, basisrente)
    expect(result.annualTaxSaving).toBe(0)
    expect(result.monthlyNetCost).toBe(0)
  })

  it('full simulation includes basisrente product and basisrenteFunding', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    expect(sim.basisrenteFunding).toBeDefined()
    expect(sim.basisrenteFunding.monthlyGrossContribution).toBe(
      defaultAssumptions.basisrente.monthlyGrossContribution,
    )
    const brResults = sim.products.filter((p) => p.productId === 'basisrente')
    expect(brResults.length).toBe(defaultAssumptions.returnScenarios.length)
    for (const r of brResults) {
      expect(r.afterTaxLumpSum).toBeNull()
      expect(r.grossMonthlyPayout).toBeGreaterThan(0)
      expect(r.netMonthlyPayout).toBeGreaterThan(0)
      expect(r.netMonthlyPayout).toBeLessThanOrEqual(r.grossMonthlyPayout)
    }
  })
})

describe('#61 netBasisrentePayout', () => {
  it('net < gross due to tax and KV/PV', () => {
    const net = netBasisrentePayout(1000, defaultProfile, de2026Rules)
    expect(net).toBeGreaterThan(0)
    expect(net).toBeLessThan(1000)
  })

  it('net = gross for zero payout', () => {
    expect(netBasisrentePayout(0, defaultProfile, de2026Rules)).toBe(0)
  })

  it('PKV holder: no KV/PV deducted (only tax)', () => {
    const pkvProfile: PersonalProfile = {
      ...defaultProfile,
      publicHealthInsurance: false,
      pkvMonthlyPremium: 500,
      pPVMonthlyPremium: 50,
    }
    const netGkv = netBasisrentePayout(1000, defaultProfile, de2026Rules)
    const netPkv = netBasisrentePayout(1000, pkvProfile, de2026Rules)
    // PKV holder pays less (no KV/PV on Basisrente) → net is higher
    expect(netPkv).toBeGreaterThan(netGkv)
  })

  it('taxable share follows Besteuerungsanteil for retirement year', () => {
    // For the default profile (28 → retires 2065), Besteuerungsanteil should be 100%
    // net should still be less than gross due to full marginal income tax
    const net = netBasisrentePayout(2000, defaultProfile, de2026Rules, 0, 2065)
    expect(net).toBeLessThan(2000)
    expect(net).toBeGreaterThan(0)
  })

  it('higher otherMonthlyIncome → higher marginal tax → lower net', () => {
    const netLowOther = netBasisrentePayout(1000, defaultProfile, de2026Rules, 500)
    const netHighOther = netBasisrentePayout(1000, defaultProfile, de2026Rules, 3000)
    expect(netHighOther).toBeLessThan(netLowOther)
  })
})
