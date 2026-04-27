import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import type { PersonalProfile, ScenarioAssumptions } from '../domain/types'
import {
  careEmployeeRateForChildren,
  calculateBavFunding,
  calculateSalaryResult,
  calculateVorsorgepauschale2026,
} from './salary'
import { simulateRetirementComparison } from './simulate'
import { calculateIncomeTax2026 } from './tax'
import { etfPayoutSchedule, monthlyPayoutFromCapital, netBavPayout, projectAccumulation } from './projections'

// Base profile for payroll tax tests: Steuerklasse I, no kids, no church, GKV 2.9%
const testProfile75k: PersonalProfile = {
  ...defaultProfile,
  grossSalaryYear: 75_000,
}
const testProfile50k: PersonalProfile = { ...testProfile75k, grossSalaryYear: 50_000 }
const testProfile100k: PersonalProfile = { ...testProfile75k, grossSalaryYear: 100_000 }

describe('§39b EStG 2026 Vorsorgepauschale', () => {
  it('uses ermäßigter GKV rate (14%) and excludes AV when GKV+PV exceed 1,900 EUR cap', () => {
    const r = calculateSalaryResult(testProfile75k, de2026Rules)
    // GKV Teilbetrag: 14%/2 + 2.9%/2 = 7% + 1.45% of min(75k, 69750)
    // PV Teilbetrag: 2.4% of 69750; GKV+PV >> 1900 → AV excluded
    // VPS < actual social contributions (ermäßigter < general rate + no AV in VPS)
    expect(r.vorsorgepauschale).toBeLessThan(r.social.total)
    expect(r.vorsorgepauschale).toBeLessThan(r.social.pension + r.social.health + r.social.care)
    expect(r.vorsorgepauschale).toBeCloseTo(14_543, 0)
  })

  it('includes AV Teilbetrag when GKV+PV sum is below 1,900 EUR (low-income case)', () => {
    const lowProfile: PersonalProfile = { ...testProfile75k, grossSalaryYear: 14_000 }
    // GKV = 0.0845 × 14000 = 1183; PV = 0.024 × 14000 = 336; sum = 1519 < 1900
    // AV actual = 0.013 × 14000 = 182; cap = 1900 - 1519 = 381; AV included = 182
    const vps = calculateVorsorgepauschale2026(14_000, lowProfile, de2026Rules)
    const rvOnly = de2026Rules.socialSecurity.pensionEmployeeRate * 14_000 // 1302
    const kvpvOnly =
      (de2026Rules.socialSecurity.healthReducedRate / 2 + lowProfile.healthAdditionalContributionPct / 200) * 14_000 +
      de2026Rules.socialSecurity.careEmployeeChildlessRate * 14_000
    expect(vps).toBeGreaterThan(rvOnly + kvpvOnly) // AV adds to VPS
    expect(vps).toBeCloseTo(3_003, 0)
  })

  it('uses steuerlicher Arbeitslohn (after tax-free bAV) as the VPS base', () => {
    const noConversion = calculateVorsorgepauschale2026(75_000, testProfile75k, de2026Rules)
    const withConversion = calculateVorsorgepauschale2026(72_000, testProfile75k, de2026Rules) // 250 EUR/month bAV
    expect(withConversion).toBeLessThan(noConversion)
  })
})

describe('BMF PAP 2026 payroll tax (Steuerklasse I, GKV 2.9%, no church)', () => {
  it('returns correct income tax at 50,000 EUR gross', () => {
    const r = calculateSalaryResult(testProfile50k, de2026Rules)
    // VPS(10075) = RV(4650) + GKV(4225) + PV(1200); taxable = 50000 – 10075 – 1266 = 38659
    expect(r.taxableIncome).toBeCloseTo(38_659, -1)
    expect(r.incomeTax).toBe(6_788)
    expect(r.solidarityTax).toBe(0)
  })

  it('returns correct income tax at 75,000 EUR gross', () => {
    const r = calculateSalaryResult(testProfile75k, de2026Rules)
    // VPS(14542.875) = RV(6975) + GKV(5893.875) + PV(1674); taxable = 75000 – 14542.875 – 1266 = 59191.125 → 59191
    expect(r.taxableIncome).toBeCloseTo(59_191, -1)
    expect(r.incomeTax).toBe(13_922)
    expect(r.solidarityTax).toBe(0)
  })

  it('returns correct income tax at 100,000 EUR gross', () => {
    const r = calculateSalaryResult(testProfile100k, de2026Rules)
    // VPS(16868) = RV(9300) + GKV(5894) + PV(1674); taxable = 100000 – 16868 – 1266 = 81866
    expect(r.taxableIncome).toBeCloseTo(81_866, -1)
    expect(r.incomeTax).toBe(23_248)
    expect(r.solidarityTax).toBeCloseTo(345, 0)
  })

  it('bAV at 100 EUR/month reduces net cost to ~55 EUR/month', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 100,
    })
    expect(f.monthlyNetCost).toBeCloseTo(55, 0)
    expect(f.monthlyTaxAndSvSavings).toBeCloseTo(45, 0)
  })

  it('bAV at 300 EUR/month reduces net cost to ~165 EUR/month', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
    })
    expect(f.monthlyNetCost).toBeCloseTo(165, 0)
    expect(f.monthlyTaxAndSvSavings).toBeCloseTo(135, 0)
  })

  it('bAV at 500 EUR/month caps SV-free at 4% BBG', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 500,
    })
    // 500*12=6000 > svFreeLimit(4056): effective employee SV-free < 4056
    expect(f.svLiableOverflowAnnual).toBeGreaterThan(0)
    expect(f.monthlyNetCost).toBeCloseTo(301, 0)
  })
})

describe('bAV contribution limit handling (#4)', () => {
  it('total bAV stays within limits for default profile', () => {
    const f = calculateBavFunding(defaultProfile, de2026Rules, defaultAssumptions.bav)
    expect(f.totalBavContributionAnnual).toBeCloseTo(
      f.annualGrossConversion + f.annualEmployerContribution, 2,
    )
    expect(f.taxableOverflowAnnual).toBe(0)
    expect(f.svLiableOverflowAnnual).toBe(0)
    // taxFreePortionAnnual == totalBavContributionAnnual when under 8% BBG
    expect(f.taxFreePortionAnnual).toBeCloseTo(f.totalBavContributionAnnual, 2)
  })

  it('detects SV-liable overflow when total bAV exceeds 4% BBG', () => {
    // Extra employer match of 100% pushes total well above 4% BBG (4056/year)
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
      extraEmployerContributionPct: 1.0, // 100% match → 300 extra/month = 3600/year
    })
    // total ≈ 3600 (employee) + 3600 (extra) + ~32 (statutory) >> 4056
    expect(f.svLiableOverflowAnnual).toBeGreaterThan(0)
    expect(f.svFreePortionAnnual).toBeCloseTo(
      de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap,
      0,
    )
  })
})

describe('German 2026 tax helper', () => {
  it('keeps income below the basic allowance tax-free', () => {
    expect(calculateIncomeTax2026(12_348, de2026Rules)).toBe(0)
  })

  it('calculates the 42 percent zone from the BMF 2026 formula', () => {
    expect(calculateIncomeTax2026(75_000, de2026Rules)).toBe(20_364)
  })

  it('uses the 2026 top tax zone from 277,826 EUR onward', () => {
    expect(calculateIncomeTax2026(277_825, de2026Rules)).toBe(105_550)
    expect(calculateIncomeTax2026(277_826, de2026Rules)).toBe(105_551)
    expect(calculateIncomeTax2026(277_827, de2026Rules)).toBe(105_551)
  })
})

describe('social-security helpers', () => {
  it('calculates employee care-insurance rates by child count', () => {
    expect(careEmployeeRateForChildren(0, de2026Rules)).toBeCloseTo(0.024)
    expect(careEmployeeRateForChildren(1, de2026Rules)).toBeCloseTo(0.018)
    expect(careEmployeeRateForChildren(2, de2026Rules)).toBeCloseTo(0.0155)
    expect(careEmployeeRateForChildren(3, de2026Rules)).toBeCloseTo(0.013)
    expect(careEmployeeRateForChildren(5, de2026Rules)).toBeCloseTo(0.008)
    expect(careEmployeeRateForChildren(6, de2026Rules)).toBeCloseTo(0.008)
  })

  it('applies KV-Freibetrag and PV-Freigrenze separately for bAV retirement deductions', () => {
    const threshold = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly // 197.75

    // Below threshold: KV base = 0 (Freibetrag), PV = 0 (Freigrenze not reached)
    // Annual payout < basicAllowance → no income tax, marginal tax = 0
    expect(netBavPayout(threshold - 1, defaultProfile, de2026Rules)).toBeCloseTo(threshold - 1, 1)

    // At threshold: KV base = 0, PV = 0 (Freigrenze: not strictly above)
    expect(netBavPayout(threshold, defaultProfile, de2026Rules)).toBeCloseTo(threshold, 1)

    // Above threshold (threshold + 100 = 297.75); annual = 3573 EUR < basicAllowance → no tax
    // KV: (297.75 - 197.75) × (14.6% + 2.9%) = 100 × 17.5% = 17.5 EUR
    // PV Freigrenze: 297.75 > threshold → PV = 297.75 × 4.2% = 12.5055 EUR (full amount)
    const kvDeduction = 100 * (
      de2026Rules.socialSecurity.healthGeneralRate +
      defaultProfile.healthAdditionalContributionPct / 100
    )
    const pvDeduction = (threshold + 100) * de2026Rules.socialSecurity.careRetirementChildlessRate
    expect(netBavPayout(threshold + 100, defaultProfile, de2026Rules)).toBeCloseTo(
      threshold + 100 - kvDeduction - pvDeduction,
      1,
    )
  })

  it('marginal-tax: other retirement income pushes bAV into higher tax bracket', () => {
    // With no other income, a bAV pension of 1,500 EUR/month = 18,000 EUR/year
    // is above basicAllowance; taxes are applied to (18000 - basicAllowance).
    // Adding 1,000 EUR/month other income should increase the marginal tax on bAV.
    const bavPayout = 1_500
    const noOther = netBavPayout(bavPayout, defaultProfile, de2026Rules, 0)
    const withOther = netBavPayout(bavPayout, defaultProfile, de2026Rules, 1_000)
    expect(withOther).toBeLessThan(noOther)
  })
})

describe('#5 GRV reduction estimate', () => {
  it('estimatedMonthlyGrvReduction is zero when conversion is zero', () => {
    const f = calculateBavFunding(defaultProfile, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 0,
    })
    expect(f.estimatedMonthlyGrvReduction).toBe(0)
  })

  it('estimatedMonthlyGrvReduction scales linearly with conversion and years', () => {
    const f300 = calculateBavFunding(defaultProfile, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
    })
    const f600 = calculateBavFunding(defaultProfile, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 600,
    })
    // doubling conversion → doubling reduction (linear in annualConversion)
    expect(f600.estimatedMonthlyGrvReduction).toBeCloseTo(f300.estimatedMonthlyGrvReduction * 2, 3)
  })

  it('bAV net payout with includeGrvReduction subtracts the estimate', () => {
    const withReduction = simulateRetirementComparison(defaultProfile, {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, includeGrvReduction: true },
    }, de2026Rules)
    const without = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const bavWith = withReduction.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')
    const bavWithout = without.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')
    expect(bavWith!.netMonthlyPayout).toBeLessThan(bavWithout!.netMonthlyPayout)
  })
})

describe('ETF rules — #31 Basiszins and #7/#36 Vorabpauschale', () => {
  it('de2026 basiszins is the official 2026 value of 3.20% (BMF-Schreiben 2026-01-13)', () => {
    expect(de2026Rules.capitalGains.basiszins).toBe(0.032)
  })

  it('ETF Vorabpauschale is non-zero in acquisition year due to prorated contributions (#36)', () => {
    // 24 months, 10k/month, 7% return, 30% partial exemption, 0 fees
    const result = projectAccumulation({
      productId: 'etf',
      currentAge: 30,
      months: 24,
      monthlyUserCost: 10_000,
      monthlyProductContribution: 10_000,
      monthlyEmployerContribution: 0,
      annualReturn: 0.07,
      inflationRate: 0.02,
      scenario: { id: 'basis', label: 'Basis', annualReturn: 0.07 },
      fees: { annualAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 1 },
      etfVorabpauschale: { rules: de2026Rules, partialExemption: 0.3 },
    })
    // Year 1: prorated contributions → VP > 0 (unlike old opening-balance-only formula)
    expect(result.rows[0].cumulativeVorabpauschale).toBeGreaterThan(0)
    // Year 2: opening balance adds to VP → cumulative is higher
    expect(result.rows[1].cumulativeVorabpauschale).toBeGreaterThan(result.rows[0].cumulativeVorabpauschale)
    expect(result.cumulativeVorabpauschale).toBe(result.rows[1].cumulativeVorabpauschale)
  })

  it('year-1 VP matches the proration formula: sum(contribution × (13-month)/12) × basiszins × 0.7', () => {
    // 12 equal monthly contributions of 1000, 0% return (so growth ≥ basisertrag is guaranteed
    // to be large enough only with positive return; use 10% to ensure cap is not binding)
    const c = 1_000
    const result = projectAccumulation({
      productId: 'etf',
      currentAge: 30,
      months: 12,
      monthlyUserCost: c,
      monthlyProductContribution: c,
      monthlyEmployerContribution: 0,
      annualReturn: 0.1,
      inflationRate: 0,
      scenario: { id: 'basis', label: 'Basis', annualReturn: 0.1 },
      fees: { annualAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 1 },
      etfVorabpauschale: { rules: de2026Rules, partialExemption: 0 },
    })
    // Expected prorated acquisition base: c × sum(12+11+...+1)/12 = c × 78/12 = c × 6.5
    const expectedBase = c * 78 / 12 // = 6500
    const expectedBasisertrag = expectedBase * de2026Rules.capitalGains.basiszins * 0.7
    // VP is capped at annualGrowth; with 10% return it should be well above basisertrag
    expect(result.rows[0].cumulativeVorabpauschale).toBeCloseTo(expectedBasisertrag, 1)
  })
})

describe('#34 bAV convergence', () => {
  it('statutory subsidy equals min(15% cap, employer SV saving) at the converged solution (350 EUR/month)', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 350,
    })
    const subsidyAnnual = f.monthlyMandatoryEmployerSubsidy * 12
    expect(subsidyAnnual).toBeCloseTo(
      Math.min(
        f.annualGrossConversion * de2026Rules.bav.statutoryEmployerSubsidyPct,
        f.employerSocialSecuritySavingAnnual,
      ),
      1,
    )
  })

  it('converges with 100% employer match pushing total bAV above SV-free limit', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 200,
      extraEmployerContributionPct: 1.0,
    })
    const subsidyAnnual = f.monthlyMandatoryEmployerSubsidy * 12
    expect(subsidyAnnual).toBeCloseTo(
      Math.min(
        f.annualGrossConversion * de2026Rules.bav.statutoryEmployerSubsidyPct,
        f.employerSocialSecuritySavingAnnual,
      ),
      1,
    )
    expect(f.svLiableOverflowAnnual).toBeGreaterThan(0)
  })
})

describe('#35 children-adjusted retirement PV rate in netBavPayout', () => {
  it('childless rate (0 children) equals careRetirementChildlessRate by construction', () => {
    const threshold = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly
    const payout = threshold + 200  // annual = 4773 EUR < basicAllowance → tax = 0
    const childless = netBavPayout(payout, { ...defaultProfile, children: 0 }, de2026Rules)
    const derived =
      de2026Rules.socialSecurity.careEmployeeChildlessRate +
      de2026Rules.socialSecurity.careEmployerRate
    expect(derived).toBeCloseTo(de2026Rules.socialSecurity.careRetirementChildlessRate, 5)
    // KV/PV only (no income tax because annual < basicAllowance)
    const expected =
      payout -
      Math.max(0, payout - threshold) * (de2026Rules.socialSecurity.healthGeneralRate + defaultProfile.healthAdditionalContributionPct / 100) -
      payout * de2026Rules.socialSecurity.careRetirementChildlessRate
    expect(childless).toBeCloseTo(expected, 1)
  })

  it('2-child parent pays lower retirement PV than childless (higher net payout)', () => {
    const payout = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly + 200
    const childless = netBavPayout(payout, { ...defaultProfile, children: 0 }, de2026Rules)
    const twoChildren = netBavPayout(payout, { ...defaultProfile, children: 2 }, de2026Rules)
    expect(twoChildren).toBeGreaterThan(childless)
  })
})

describe('bAV funding model', () => {
  it('uses the actual employer social-security saving as cap for the minimum subsidy', () => {
    const funding = calculateBavFunding(defaultProfile, de2026Rules, defaultAssumptions.bav)

    expect(funding.monthlyGrossConversion).toBe(300)
    expect(funding.monthlyMandatoryEmployerSubsidy).toBeGreaterThan(25)
    expect(funding.monthlyMandatoryEmployerSubsidy).toBeLessThan(45)
  })

  it('compares private products against the same net cost as bAV by default', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const basis = result.products.filter((product) => product.scenarioId === 'basis')
    const etf = basis.find((product) => product.productId === 'etf')
    const bav = basis.find((product) => product.productId === 'bav')

    expect(etf?.monthlyUserCost).toBeCloseTo(bav?.monthlyUserCost ?? 0, 2)
    expect(bav?.monthlyProductContribution).toBeGreaterThan(bav?.monthlyUserCost ?? 0)
  })

  it('hides bAV lump-sum after-tax capital until exact lump-sum treatment is modeled', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const bav = result.products.find(
      (product) => product.productId === 'bav' && product.scenarioId === 'basis',
    )

    expect(bav?.afterTaxLumpSum).toBeNull()
    expect(bav?.valueMultipleOnUserCost).toBeNull()
  })

  it('explicitly handles normal and tax-free private insurance modes', () => {
    const taxFreeAssumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      insurance: {
        ...defaultAssumptions.insurance,
        taxMode: 'steuerfrei',
      },
    }
    const normal = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
      .products.filter((product) => product.productId === 'versicherung')
      .find((product) => product.scenarioId === 'basis')
    const taxFree = simulateRetirementComparison(defaultProfile, taxFreeAssumptions, de2026Rules)
      .products.filter((product) => product.productId === 'versicherung')
      .find((product) => product.scenarioId === 'basis')

    expect(taxFree?.afterTaxLumpSum).toBeCloseTo(taxFree?.capitalAtRetirement ?? 0)
    expect(taxFree?.netMonthlyPayout).toBeCloseTo(taxFree?.grossMonthlyPayout ?? 0)
    expect(normal?.afterTaxLumpSum ?? 0).toBeLessThan(taxFree?.afterTaxLumpSum ?? 0)
    expect(normal?.netMonthlyPayout ?? 0).toBeLessThan(taxFree?.netMonthlyPayout ?? 0)
  })
})

describe('#37 ETF payout schedule (etfPayoutSchedule)', () => {
  const capital = 400_000
  const contributions = 200_000
  const cumulativeVP = 5_000
  const payoutYears = 20
  const payoutReturn = 0.05
  const retirementAge = 67
  const partialExemption = 0.3 // Aktienfonds
  // Compute the correct PMT so capital depletes to ~0 in payoutYears
  const grossMonthly = monthlyPayoutFromCapital(capital, payoutReturn, payoutYears)

  it('year-1 net monthly payout matches constant-ratio approximation', () => {
    const rows = etfPayoutSchedule(
      capital, contributions, cumulativeVP, grossMonthly,
      payoutYears, payoutReturn, retirementAge, de2026Rules, partialExemption,
    )
    expect(rows).toHaveLength(payoutYears)
    // Year-1 gain ratio: (capital - contributions - VP) / capital = 195000/400000
    const gainRatio = (capital - contributions - cumulativeVP) / capital
    const taxableGain = grossMonthly * 12 * gainRatio
    const effectiveTaxRate = de2026Rules.capitalGains.taxRate * (1 + de2026Rules.capitalGains.solidarityRate)
    const expectedTax = Math.max(0, taxableGain * (1 - partialExemption) - de2026Rules.capitalGains.saverAllowance) * effectiveTaxRate
    const expectedNet = (grossMonthly * 12 - expectedTax) / 12
    expect(rows[0].netMonthlyPayout).toBeCloseTo(expectedNet, 2)
  })

  it('capital depletes to approximately zero over the payout period', () => {
    const rows = etfPayoutSchedule(
      capital, contributions, cumulativeVP, grossMonthly,
      payoutYears, payoutReturn, retirementAge, de2026Rules, partialExemption,
    )
    const finalCapital = rows[rows.length - 1].capitalAtEnd
    // Annuity formula guarantees depletion; allow small rounding residual (within 1 EUR)
    expect(Math.abs(finalCapital)).toBeLessThan(1)
  })

  it('Sparerpauschbetrag fully covers tax when gain is small', () => {
    // Very large cost basis means almost no gain → saverAllowance covers all of it
    const highBasisCapital = 100_000
    const highContributions = 99_500  // only 500 EUR gain → after 30% exemption: 350 EUR < 1000 EUR
    const rows = etfPayoutSchedule(
      highBasisCapital, highContributions, 0, 1_000,
      5, 0.04, 67, de2026Rules, 0.3,
    )
    expect(rows[0].taxDue).toBe(0)
    expect(rows[0].netMonthlyPayout).toBeCloseTo(1_000, 0)
  })

  it('simulate produces etfPayoutRows for ETF product', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const etfBasis = result.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')
    expect(etfBasis?.etfPayoutRows).toBeDefined()
    expect(etfBasis?.etfPayoutRows?.length).toBeGreaterThan(0)
    // netMonthlyPayout is derived from year-1 of the schedule
    expect(etfBasis?.netMonthlyPayout).toBeCloseTo(etfBasis?.etfPayoutRows?.[0]?.netMonthlyPayout ?? 0, 2)
  })
})
