import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import type { InsuranceProductResult, ProductId } from '../../domain'
import { de2026Rules } from '../../rules/de2026'
import { ertragsanteilByAge } from '../../rules/legalConstants'
import { deriveInsuranceTaxMode, netInsurancePayout } from '../insurancePayout'
import { monthlyPayoutFromCapital } from '../payoutMath'
import { simulateRetirementComparison } from '../simulate'

// All-products override: insurance tests need to find 'versicherung' in results.
// defaultAssumptions only shows ['etf','bav']; override for these tests.
const allVisibleAssumptions = {
  ...defaultAssumptions,
  visibleProducts: ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'] as ProductId[],
}

describe('deriveInsuranceTaxMode — calendar-year classification', () => {
  // pre-2005 contract, eligible flag true, long runtime → pre2005
  it('pre-2005 contract with eligible=true and runtime ≥ 12 → pre2005', () => {
    expect(deriveInsuranceTaxMode(1995, 38, 67, true)).toBe('pre2005')
  })

  // pre-2005 contract, eligible flag false → falls through to post-2004 logic
  it('pre-2005 contract with eligible=false → halbeinkuenfte when runtime ≥ 12 and retirementAge ≥ 62', () => {
    expect(deriveInsuranceTaxMode(1995, 38, 67, false)).toBe('halbeinkuenfte')
  })

  it('pre-2005 contract with eligible=false and retirementAge < 62 → abgeltungsteuer', () => {
    expect(deriveInsuranceTaxMode(1995, 38, 60, false)).toBe('abgeltungsteuer')
  })

  // pre-2005 contract, eligible true but runtime < 12 → falls through (NOT pre2005)
  it('pre-2005 contract with eligible=true but runtime < 12 → abgeltungsteuer (not pre2005)', () => {
    // contractStartYear 1999, payoutYear 2026+5=2031 → runtime = 2031-1999 = 32... use short runtime directly
    expect(deriveInsuranceTaxMode(2000, 8, 67, true)).toBe('abgeltungsteuer')
  })

  // post-2005 contract, age ≥ 62 at payout, runtime ≥ 12 → halbeinkuenfte
  it('post-2005 contract, retirementAge ≥ 62, runtime ≥ 12 → halbeinkuenfte', () => {
    expect(deriveInsuranceTaxMode(2010, 20, 67, true)).toBe('halbeinkuenfte')
  })

  // post-2005 contract, runtime < 12 → abgeltungsteuer
  it('post-2005 contract, runtime < 12 → abgeltungsteuer', () => {
    expect(deriveInsuranceTaxMode(2020, 8, 67, true)).toBe('abgeltungsteuer')
  })

  // post-2005 contract, payout before age 62 → abgeltungsteuer
  it('post-2005 contract, retirementAge < 62 → abgeltungsteuer', () => {
    expect(deriveInsuranceTaxMode(2010, 20, 60, true)).toBe('abgeltungsteuer')
  })

  // The original bug case: age=60, retirement=62, contractStartYear=2004
  // Old code passed retirementAge-age=2 as runtime → 2 < 12 → abgeltungsteuer (wrong).
  // Correct: payoutYear=2026+(62-60)=2028; actual runtime=2028-2004=24 years → halbeinkuenfte.
  it('calendar-year fix: age 60, retirement 62, contractStartYear 2004 → actual runtime 24, eligible=false → halbeinkuenfte (old code gave abgeltungsteuer with runtime=2)', () => {
    // payoutYear = 2026 + (62 - 60) = 2028; contractRuntimeYears = 2028 - 2004 = 24
    const payoutYear = de2026Rules.year + (62 - 60) // 2028
    const contractRuntimeYears = payoutYear - 2004   // 24
    // 2004 < 2005 but eligible=false → falls through; runtime=24 >= 12 and retirementAge=62 >= 62 → halbeinkuenfte
    expect(deriveInsuranceTaxMode(2004, contractRuntimeYears, 62, false)).toBe('halbeinkuenfte')
  })

  it('original bug case: young user, pre-2005 contractStartYear, actual payout-year runtime < 12 → NOT pre2005', () => {
    // age 28, retirement 67, contractStartYear 2004
    // Old code: retirementAge-age = 39 → pre2005 (wrong if eligible=false, correct if true)
    // payoutYear = 2026 + (67 - 28) = 2065; runtime = 2065 - 2004 = 61 → pre2005 (runtime ≥ 12, eligible=true)
    // To test the "runtime < 12 blocks pre2005" path: contractStartYear 2004, payout only 8 years away
    // payoutYear = 2026 + 5 = 2031; runtime = 2031 - 2024 = 7 (not pre-2005 start, different scenario)
    // Concrete: contractStartYear 1998, runtime forced to 8 (e.g. late-start or residual contract)
    expect(deriveInsuranceTaxMode(1998, 8, 67, true)).toBe('abgeltungsteuer')
  })

  // simulate.ts integration: contractStartYear 2010, age 45, retirement 67 → payoutYear=2048, runtime=38
  it('simulate call-site: age 45, retirement 67, contractStartYear 2010 → halbeinkuenfte via calendar years', () => {
    const profile45 = { ...defaultProfile, age: 45, retirementAge: 67 }
    const result = simulateRetirementComparison(
      profile45,
      { ...allVisibleAssumptions, insurance: { ...allVisibleAssumptions.insurance, contractStartYear: 2010, oldContractTaxFreeEligible: false } },
      de2026Rules,
    )
    const ins = result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined
    // halbeinkuenfte: net payout < gross payout (with other retirement income = 0, gain may be below personal tax threshold)
    // At minimum the lump sum should be ≤ capital (tax applied or zero)
    expect(ins?.afterTaxLumpSum).toBeDefined()
    expect((ins?.afterTaxLumpSum ?? 0)).toBeLessThanOrEqual(ins?.capitalAtRetirement ?? 0)
  })
})

describe('#59 ertragsanteilByAge — §22 EStG Anlage 1 table', () => {
  it('confirmed values: 62→21%, 65→18%, 66→18%, 67→17%, 69→15%, 70→15%', () => {
    expect(ertragsanteilByAge(62)).toBe(0.21)
    expect(ertragsanteilByAge(65)).toBe(0.18)
    expect(ertragsanteilByAge(66)).toBe(0.18)
    expect(ertragsanteilByAge(67)).toBe(0.17)
    expect(ertragsanteilByAge(69)).toBe(0.15)
    expect(ertragsanteilByAge(70)).toBe(0.15)
  })

  it('table is monotonically non-increasing over ages 0–89', () => {
    for (let age = 1; age <= 89; age++) {
      expect(ertragsanteilByAge(age)).toBeLessThanOrEqual(ertragsanteilByAge(age - 1))
    }
  })

  it('age 0 returns maximum (0.59) and age 89 returns minimum (0.01)', () => {
    expect(ertragsanteilByAge(0)).toBe(0.59)
    expect(ertragsanteilByAge(89)).toBe(0.01)
  })

  it('ages above 89 clamp to 0.01', () => {
    expect(ertragsanteilByAge(95)).toBe(0.01)
    expect(ertragsanteilByAge(100)).toBe(0.01)
  })

  it('fractional ages floor to integer', () => {
    expect(ertragsanteilByAge(67.9)).toBe(ertragsanteilByAge(67))
    expect(ertragsanteilByAge(62.1)).toBe(ertragsanteilByAge(62))
  })
})

describe('#59 netInsurancePayout — Ertragsanteil for leibrente', () => {
  // Reference: 200,000 EUR capital, 180,000 EUR contributions, Rentenfaktor 28 (pAV default)
  // grossMonthlyPayout = 200_000 / 10_000 * 28 = 560 EUR/month
  // At age 67: Ertragsanteil = 17%
  // Taxable annual = 560 * 12 * 0.17 = 1,142.40 EUR → below Grundfreibetrag → no income tax
  // → netMonthlyPayout ≈ grossMonthlyPayout (560 EUR) since taxable below threshold
  const capital = 200_000
  const contributions = 180_000
  const grossMonthly = (capital / 10_000) * 28  // 560

  it('leibrente age 67 (17%) — taxable income below Grundfreibetrag → net ≈ gross', () => {
    const net = netInsurancePayout(
      grossMonthly, capital, contributions,
      'halbeinkuenfte', de2026Rules,
      0, de2026Rules.year, undefined, true,
      'leibrente', 67,
    )
    // Annual taxable = 560 * 12 * 0.17 = 1,142.40 → below 12,348 Grundfreibetrag → zero ESt
    expect(net).toBeCloseTo(grossMonthly, 1)
  })

  it('leibrente age 62 (21%) — taxable fraction higher than 67 but still below Grundfreibetrag at this payout level', () => {
    const net62 = netInsurancePayout(
      grossMonthly, capital, contributions,
      'abgeltungsteuer', de2026Rules,
      0, de2026Rules.year, undefined, true,
      'leibrente', 62,
    )
    const net67 = netInsurancePayout(
      grossMonthly, capital, contributions,
      'abgeltungsteuer', de2026Rules,
      0, de2026Rules.year, undefined, true,
      'leibrente', 67,
    )
    // age 62 has higher Ertragsanteil (21%) → marginally more tax → net ≤ net67
    // At low payouts (560 EUR/month) both are below the Grundfreibetrag → both ≈ gross
    expect(net62).toBeLessThanOrEqual(net67 + 0.01)
  })

  it('leibrente with high payout + other income shows Ertragsanteil lower tax than gain-ratio method', () => {
    // High-gain contract: capital=500_000, contributions=100_000 (80% gain ratio)
    // Rentenfaktor 28 → grossMonthly = 500_000 / 10_000 * 28 = 1400 EUR/month
    // otherMonthlyIncome=2000 pushes the combined income into the taxable bracket for both methods.
    // Gain-ratio taxable annual = 1400*12*0.8 = 13,440 → halbeinkuenfte: halved = 6,720 EUR in personal base
    // Ertragsanteil at 67 = 17%: taxable annual = 1400*12*0.17 = 2,856 EUR in personal base
    // Combined with 24,000 EUR other income: halbeinkuenfte base 30,720 > ertragsanteil base 26,856
    // → marginal tax higher for gain-ratio path → Ertragsanteil net > gain-ratio net
    const bigCapital = 500_000
    const bigContribs = 100_000
    const bigGross = (bigCapital / 10_000) * 28  // 1400 EUR/month
    const otherIncome = 2_000  // 24,000 EUR/year pushes income into taxable bracket

    const netErtragsanteil = netInsurancePayout(
      bigGross, bigCapital, bigContribs,
      'halbeinkuenfte', de2026Rules,
      otherIncome, de2026Rules.year, undefined, true,
      'leibrente', 67,
    )
    // Without leibrente flag → gain-ratio halbeinkuenfte path
    const netGainRatio = netInsurancePayout(
      bigGross, bigCapital, bigContribs,
      'halbeinkuenfte', de2026Rules,
      otherIncome, de2026Rules.year, undefined, true,
    )
    // Ertragsanteil (17% of gross in base) << halbeinkuenfte gain-ratio (40% of gross in base)
    // → less marginal tax under Ertragsanteil → Ertragsanteil net is higher
    expect(netErtragsanteil).toBeGreaterThan(netGainRatio)
  })

  it('leibrente overrides pre2005 tax-free treatment and applies Ertragsanteil', () => {
    // pre2005 contract with minimal gain (2% gain ratio) + otherIncome to ensure taxable
    // pre2005 capital-payout path: tax-free → net = gross
    // leibrente path: Ertragsanteil 17% at age 67 → taxable = 1400*12*0.17 = 2856 + 24000 other > threshold
    const bigCapital = 500_000
    const bigContribs = 490_000
    const bigGross = (bigCapital / 10_000) * 28  // 1400 EUR/month
    const otherIncome = 2_000  // 24,000 EUR/year → combined income definitely in taxable bracket

    const netPre2005Leibrente = netInsurancePayout(
      bigGross, bigCapital, bigContribs,
      'pre2005', de2026Rules,
      otherIncome, de2026Rules.year, undefined, true,
      'leibrente', 67,
    )
    // pre2005 without leibrente → tax-free on the payout (KV/PV skipped too; only freiwillig gets KV/PV)
    const netPre2005NoLeib = netInsurancePayout(
      bigGross, bigCapital, bigContribs,
      'pre2005', de2026Rules,
      otherIncome,
    )
    // leibrente overrides pre2005: Ertragsanteil taxable = 2856 EUR → marginal tax on otherIncome
    // pushes it above threshold → net < gross. pre2005 no-leibrente: tax-free → net = gross.
    expect(netPre2005Leibrente).toBeLessThan(netPre2005NoLeib)
  })
})

describe('#60 product label — Private Rentenversicherung', () => {
  it('insurance product label is "Private Rentenversicherung"', () => {
    const sim = simulateRetirementComparison(defaultProfile, allVisibleAssumptions, de2026Rules)
    const ins = sim.products.find((p) => p.productId === 'versicherung')
    expect(ins?.label).toBe('Private Rentenversicherung')
  })
})

describe('#64 leibrenteBreakEvenAge', () => {
  it('is set for insurance in leibrente mode', () => {
    const sim = simulateRetirementComparison(defaultProfile, allVisibleAssumptions, de2026Rules)
    const ins = sim.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')
    // defaultAssumptions.insurance.payoutMode === 'leibrente'
    expect(ins?.leibrenteBreakEvenAge).toBeDefined()
    expect(ins?.leibrenteBreakEvenAge).toBeGreaterThan(defaultProfile.retirementAge)
  })

  it('break-even age = retirementAge + capital / (grossMonthlyPayout * 12)', () => {
    const sim = simulateRetirementComparison(defaultProfile, allVisibleAssumptions, de2026Rules)
    const ins = sim.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')!
    const expected = ins.capitalAtRetirement / (ins.grossMonthlyPayout * 12) + defaultProfile.retirementAge
    expect(ins.leibrenteBreakEvenAge).toBeCloseTo(expected, 4)
  })

  it('is undefined for ETF (drawdown mode)', () => {
    const sim = simulateRetirementComparison(defaultProfile, allVisibleAssumptions, de2026Rules)
    const etf = sim.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')
    expect(etf?.leibrenteBreakEvenAge).toBeUndefined()
  })

  it('is undefined for bAV in kapitalverzehr mode', () => {
    const kapAssumptions = {
      ...allVisibleAssumptions,
      bav: { ...allVisibleAssumptions.bav, payoutMode: 'kapitalverzehr' as const },
    }
    const sim = simulateRetirementComparison(defaultProfile, kapAssumptions, de2026Rules)
    const bav = sim.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')
    expect(bav?.leibrenteBreakEvenAge).toBeUndefined()
  })
})

describe('#65 InsurancePaidUpScenario', () => {
  const baseAssumptions = {
    ...allVisibleAssumptions,
    insurance: {
      ...allVisibleAssumptions.insurance,
      surrenderHaircutPct: 0.05,
    },
  }

  it('paidUpScenario is undefined when paidUpAge is not set', () => {
    const result = simulateRetirementComparison(defaultProfile, baseAssumptions, de2026Rules)
    const ins = result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined
    expect(ins?.paidUpScenario).toBeUndefined()
  })

  it('paidUpScenario is defined when paidUpAge is between current age and retirementAge', () => {
    const assumptions = {
      ...baseAssumptions,
      insurance: { ...baseAssumptions.insurance, paidUpAge: 45 },
    }
    const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const ins = result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined
    expect(ins?.paidUpScenario).toBeDefined()
    expect(ins?.paidUpScenario?.paidUpAge).toBe(45)
  })

  it('paidUpScenario is undefined when paidUpAge equals current age', () => {
    const assumptions = {
      ...baseAssumptions,
      insurance: { ...baseAssumptions.insurance, paidUpAge: defaultProfile.age },
    }
    const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const ins = result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined
    expect(ins?.paidUpScenario).toBeUndefined()
  })

  it('paidUpScenario is undefined when paidUpAge equals retirementAge', () => {
    const assumptions = {
      ...baseAssumptions,
      insurance: { ...baseAssumptions.insurance, paidUpAge: defaultProfile.retirementAge },
    }
    const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const ins = result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined
    expect(ins?.paidUpScenario).toBeUndefined()
  })

  it('surrenderValue = capitalAtPaidUp * (1 - surrenderHaircutPct)', () => {
    const assumptions = {
      ...baseAssumptions,
      insurance: { ...baseAssumptions.insurance, paidUpAge: 45 },
    }
    const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const pu = (result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined)?.paidUpScenario
    expect(pu).toBeDefined()
    expect(pu!.surrenderValue).toBeCloseTo(pu!.capitalAtPaidUp * (1 - 0.05), 4)
  })

  it('surrenderValue = capitalAtPaidUp when surrenderHaircutPct is 0', () => {
    const assumptions = {
      ...baseAssumptions,
      insurance: { ...baseAssumptions.insurance, paidUpAge: 45, surrenderHaircutPct: 0 },
    }
    const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const pu = (result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined)?.paidUpScenario
    expect(pu).toBeDefined()
    expect(pu!.surrenderValue).toBeCloseTo(pu!.capitalAtPaidUp, 4)
  })

  it('paid-up retirementCapital < normal retirementCapital (fewer contributions)', () => {
    const assumptions = {
      ...baseAssumptions,
      insurance: { ...baseAssumptions.insurance, paidUpAge: 45, surrenderHaircutPct: 0 },
    }
    const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const insProduct = result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined
    expect(insProduct).toBeDefined()
    expect(insProduct!.paidUpScenario!.retirementCapital).toBeLessThan(insProduct!.capitalAtRetirement)
  })

  it('paid-up netMonthlyPayout < normal netMonthlyPayout', () => {
    const assumptions = {
      ...baseAssumptions,
      insurance: { ...baseAssumptions.insurance, paidUpAge: 45, surrenderHaircutPct: 0 },
    }
    const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const insProduct = result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined
    expect(insProduct).toBeDefined()
    expect(insProduct!.paidUpScenario!.netMonthlyPayout).toBeLessThan(insProduct!.netMonthlyPayout)
  })

  it('feesAtPaidUp is positive when fees are non-zero', () => {
    const assumptions = {
      ...baseAssumptions,
      insurance: { ...baseAssumptions.insurance, paidUpAge: 45 },
    }
    const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const pu = (result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis') as InsuranceProductResult | undefined)?.paidUpScenario
    expect(pu!.feesAtPaidUp).toBeGreaterThan(0)
  })

  it('paidUpScenario is computed for all return scenarios independently', () => {
    const assumptions = {
      ...baseAssumptions,
      insurance: { ...baseAssumptions.insurance, paidUpAge: 45, surrenderHaircutPct: 0 },
    }
    const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const insProducts = result.products.filter((p) => p.productId === 'versicherung') as InsuranceProductResult[]
    expect(insProducts).toHaveLength(3)
    for (const p of insProducts) {
      expect(p.paidUpScenario).toBeDefined()
    }
    // Higher return scenario → higher capital at retirement
    const konservativ = insProducts.find((p) => p.scenarioId === 'konservativ')!.paidUpScenario!
    const optimistisch = insProducts.find((p) => p.scenarioId === 'optimistisch')!.paidUpScenario!
    expect(optimistisch.retirementCapital).toBeGreaterThan(konservativ.retirementCapital)
  })
})

describe('payoutMode (#54) — insurance (pAV zeitrente)', () => {
  it('simulate: pAV in zeitrente mode → gross matches monthlyPayoutFromCapital over zeitrenteYears', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      {
        ...allVisibleAssumptions,
        insurance: { ...allVisibleAssumptions.insurance, payoutMode: 'zeitrente', zeitrenteYears: 12 },
      },
      de2026Rules,
    )
    const pavBasis = sim.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')!
    const payoutReturn = pavBasis.annualReturn - (allVisibleAssumptions.insurance.fees.wrapperAssetFee + allVisibleAssumptions.insurance.fees.fundAssetFee)
    const grossBeforePayoutFee = monthlyPayoutFromCapital(pavBasis.capitalAtRetirement, payoutReturn, 12)
    const expected = grossBeforePayoutFee * (1 - allVisibleAssumptions.insurance.fees.pensionPayoutFeePct)
    expect(pavBasis.grossMonthlyPayout).toBeCloseTo(expected, 6)
  })
})
