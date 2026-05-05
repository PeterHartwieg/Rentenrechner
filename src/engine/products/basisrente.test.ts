import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import type { PersonalProfile, ProductId } from '../../domain'
import { calculateBasisrenteFunding, netBasisrentePayout, validateBasisrentePayoutAge } from '../basisrente'
import { calculateSalaryResult } from '../salary'
import { simulateRetirementComparison } from '../simulate'

// All-products override: basisrente tests need to find 'basisrente' in results.
// defaultAssumptions only shows ['etf','bav']; override for these tests.
const allVisibleAssumptions = {
  ...defaultAssumptions,
  visibleProducts: ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'] as ProductId[],
}

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
    const sim = simulateRetirementComparison(defaultProfile, allVisibleAssumptions, de2026Rules)
    expect(sim.basisrenteFunding).toBeDefined()
    expect(sim.basisrenteFunding.monthlyGrossContribution).toBe(
      allVisibleAssumptions.basisrente.monthlyGrossContribution,
    )
    const brResults = sim.products.filter((p) => p.productId === 'basisrente')
    expect(brResults.length).toBe(allVisibleAssumptions.returnScenarios.length)
    for (const r of brResults) {
      expect(r.afterTaxLumpSum).toBeNull()
      expect(r.grossMonthlyPayout).toBeGreaterThan(0)
      expect(r.netMonthlyPayout).toBeGreaterThan(0)
      expect(r.netMonthlyPayout).toBeLessThanOrEqual(r.grossMonthlyPayout)
    }
  })
})

describe('#61 netBasisrentePayout', () => {
  it('net < gross due to income tax (freiwillig_gkv also deducts KV/PV)', () => {
    const net = netBasisrentePayout(1000, defaultProfile, de2026Rules, 0, de2026Rules.year, 'freiwillig_gkv')
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
    const netFreiwillig = netBasisrentePayout(1000, defaultProfile, de2026Rules, 0, de2026Rules.year, 'freiwillig_gkv')
    const netPkv = netBasisrentePayout(1000, pkvProfile, de2026Rules)
    // PKV holder pays no KV/PV → net is higher than freiwillig_gkv
    expect(netPkv).toBeGreaterThan(netFreiwillig)
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

describe('netBasisrentePayout — KV/PV health status (Group E step 3)', () => {
  it('kvdr: no KV/PV — net equals PKV net (only income tax)', () => {
    const pkvProfile: PersonalProfile = {
      ...defaultProfile,
      publicHealthInsurance: false,
      pkvMonthlyPremium: 500,
      pPVMonthlyPremium: 50,
    }
    const netKvdr = netBasisrentePayout(1000, defaultProfile, de2026Rules, 0, de2026Rules.year, 'kvdr')
    const netPkv = netBasisrentePayout(1000, pkvProfile, de2026Rules)
    // KVdR has no KV/PV on Basisrente (same as PKV)
    expect(netKvdr).toBeCloseTo(netPkv, 5)
  })

  it('freiwillig_gkv: KV/PV applied — net lower than kvdr', () => {
    const netKvdr = netBasisrentePayout(1000, defaultProfile, de2026Rules, 0, de2026Rules.year, 'kvdr')
    const netFreiwillig = netBasisrentePayout(1000, defaultProfile, de2026Rules, 0, de2026Rules.year, 'freiwillig_gkv')
    expect(netFreiwillig).toBeLessThan(netKvdr)
  })

  it('pkv health status with GKV profile: no KV/PV — net equals kvdr', () => {
    const netKvdr = netBasisrentePayout(1000, defaultProfile, de2026Rules, 0, de2026Rules.year, 'kvdr')
    const netPkvStatus = netBasisrentePayout(1000, defaultProfile, de2026Rules, 0, de2026Rules.year, 'pkv')
    expect(netPkvStatus).toBeCloseTo(netKvdr, 5)
  })

  it('default retirementHealthStatus is freiwillig_gkv (backward compat)', () => {
    const netDefault = netBasisrentePayout(1000, defaultProfile, de2026Rules)
    const netFreiwillig = netBasisrentePayout(1000, defaultProfile, de2026Rules, 0, de2026Rules.year, 'freiwillig_gkv')
    expect(netDefault).toBeCloseTo(netFreiwillig, 5)
  })

  it('simulation uses retirementHealthStatus from assumptions.statutoryPension (kvdr default → no KV/PV)', () => {
    // defaultAssumptions.statutoryPension.retirementHealthStatus = 'kvdr'
    const simKvdr = simulateRetirementComparison(defaultProfile, allVisibleAssumptions, de2026Rules)
    const simFreiwillig = simulateRetirementComparison(
      defaultProfile,
      {
        ...allVisibleAssumptions,
        statutoryPension: {
          ...allVisibleAssumptions.statutoryPension,
          retirementHealthStatus: 'freiwillig_gkv',
        },
      },
      de2026Rules,
    )
    const kvdrResult = simKvdr.products.find((p) => p.productId === 'basisrente' && p.scenarioId === 'basis')!
    const freiwilligResult = simFreiwillig.products.find((p) => p.productId === 'basisrente' && p.scenarioId === 'basis')!
    expect(kvdrResult.netMonthlyPayout).toBeGreaterThan(freiwilligResult.netMonthlyPayout)
  })
})

describe('freiwillig-GKV BBG cap interaction (marginal approach)', () => {
  const bbg = de2026Rules.socialSecurity.healthAndCareCapMonth // 5812.50 EUR/month
  // Helper: isolate the KV/PV component by comparing freiwillig vs kvdr (same tax, no KV/PV for kvdr).
  const kvPvAmount = (gross: number, other: number) =>
    netBasisrentePayout(gross, defaultProfile, de2026Rules, other, de2026Rules.year, 'kvdr') -
    netBasisrentePayout(gross, defaultProfile, de2026Rules, other, de2026Rules.year, 'freiwillig_gkv')

  it('below BBG: full KV/PV charged on gross payout', () => {
    // otherMonthlyIncome = 0, gross = 500 → kvPvBase = min(500, BBG) = 500
    // defaultProfile has no children → careEmployeeChildlessRate applies
    const kv = kvPvAmount(500, 0)
    const additionalRate = (defaultProfile.healthAdditionalContributionPct ?? 0) / 100
    const healthRate = de2026Rules.socialSecurity.healthGeneralRate + additionalRate
    const careRate =
      de2026Rules.socialSecurity.careEmployeeChildlessRate + de2026Rules.socialSecurity.careEmployerRate
    expect(kv).toBeCloseTo(500 * (healthRate + careRate), 1)
  })

  it('above BBG: reduced KV/PV when other income consumes most of the headroom', () => {
    // kvPvAmount with otherIncome = BBG - 100 (only 100 EUR headroom) should be
    // much smaller than kvPvAmount with otherIncome = 0
    const kvSmallHeadroom = kvPvAmount(1000, bbg - 100)
    const kvNoOtherIncome = kvPvAmount(1000, 0)
    expect(kvSmallHeadroom).toBeLessThan(kvNoOtherIncome)
  })

  it('other income at BBG: zero KV/PV on Basisrente (no headroom left)', () => {
    // otherMonthlyIncome = BBG → kvPvBase = min(500, max(0, BBG - BBG)) = 0
    const kv = kvPvAmount(500, bbg)
    expect(kv).toBeCloseTo(0, 2)
  })

  it('other income above BBG: still zero KV/PV (negative headroom clamped to 0)', () => {
    const kv = kvPvAmount(500, bbg + 1000)
    expect(kv).toBeCloseTo(0, 2)
  })
})

describe('Basisrente legal compliance (Group E step 3)', () => {
  it('payoutMode is always leibrente', () => {
    expect(defaultAssumptions.basisrente.payoutMode).toBe('leibrente')
  })

  it('afterTaxLumpSum is null (capital payout prohibited)', () => {
    const sim = simulateRetirementComparison(defaultProfile, allVisibleAssumptions, de2026Rules)
    for (const r of sim.products.filter((p) => p.productId === 'basisrente')) {
      expect(r.afterTaxLumpSum).toBeNull()
    }
  })

  it('leibrenteBreakEvenAge is defined (always leibrente)', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      { ...allVisibleAssumptions, returnScenarios: [allVisibleAssumptions.returnScenarios[0]] },
      de2026Rules,
    )
    const r = sim.products.find((p) => p.productId === 'basisrente')!
    expect(r.leibrenteBreakEvenAge).toBeDefined()
  })
})

describe('validateBasisrentePayoutAge — §10 Abs. 1 Nr. 2 b aa EStG age-62 floor', () => {
  it('returns null at the §10 EStG / AltZertG §2 minimum (62)', () => {
    expect(validateBasisrentePayoutAge(62)).toBeNull()
  })

  it('returns null for typical retirement ages above the floor', () => {
    expect(validateBasisrentePayoutAge(63)).toBeNull()
    expect(validateBasisrentePayoutAge(67)).toBeNull()
    expect(validateBasisrentePayoutAge(70)).toBeNull()
  })

  it('returns a warning string below the floor and includes the user-entered age', () => {
    const warning = validateBasisrentePayoutAge(60)
    expect(warning).not.toBeNull()
    expect(warning).toContain('60')
    expect(warning).toContain('62')
  })

  it('warns at age 61 (one year below the floor)', () => {
    expect(validateBasisrentePayoutAge(61)).not.toBeNull()
  })
})
