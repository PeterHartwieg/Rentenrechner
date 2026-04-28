import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import type { PersonalProfile } from '../domain/types'
import {
  careEmployeeRateForChildren,
  calculateBavFunding,
  calculatePkv257Subsidy,
  calculateSalaryResult,
  calculateVorsorgepauschale2026,
} from './salary'
import { simulateRetirementComparison } from './simulate'
import { calculateBasisrenteFunding, netBasisrentePayout } from './basisrente'
import { calculateCapitalGainsTax, calculateIncomeTax2026, calculateSolidarityTax } from './tax'
import { afterTaxBavLumpSum, computeGrossMonthlyPayout, deriveInsuranceTaxMode, etfPayoutSchedule, monthlyPayoutFromCapital, netBavPayout, netInsurancePayout, projectAccumulation } from './projections'
import { ertragsanteilByAge } from '../rules/legalConstants'

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
      contractualMatchPercent: 1.0, // 100% match → 300 extra/month = 3600/year
    })
    // total ≈ 3600 (employee) + 3600 (extra) + ~32 (statutory) >> 4056
    expect(f.svLiableOverflowAnnual).toBeGreaterThan(0)
    expect(f.svFreePortionAnnual).toBeCloseTo(
      de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap,
      0,
    )
  })
})

describe('calculateBavFunding — SV and tax-free overflow boundaries', () => {
  const svFreeLimit = de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.socialSecurityFreePctOfPensionCap  // 4,056
  const taxFreeLimit = de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap            // 8,112

  it('300 EUR/month: total bAV below 4% BBG — no SV-liable overflow', () => {
    // total ≈ 300×12 + subsidy(~32)×12 = 3,984 < 4,056
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
      contractualMatchPercent: 0,
    })
    expect(f.svLiableOverflowAnnual).toBe(0)
    expect(f.taxableOverflowAnnual).toBe(0)
  })

  it('310 EUR/month: total bAV crosses 4% BBG — small SV-liable overflow, svFree capped', () => {
    // total ≈ 310×12 + subsidy×12 > 4,056 → svLiableOverflow > 0
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 310,
      contractualMatchPercent: 0,
    })
    expect(f.svLiableOverflowAnnual).toBeGreaterThan(0)
    expect(f.svLiableOverflowAnnual).toBeLessThan(300) // small overflow, not hundreds
    expect(f.svFreePortionAnnual).toBeCloseTo(svFreeLimit, 0)
    expect(f.taxableOverflowAnnual).toBe(0) // still well below 8% BBG
  })

  it('650 EUR/month: total bAV crosses 8% BBG — taxableOverflow > 0, taxFree capped', () => {
    // total ≈ 650×12 + subsidy ≈ 7,800 + 430 = 8,230 > 8,112 → taxableOverflow > 0
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 650,
      contractualMatchPercent: 0,
    })
    expect(f.taxableOverflowAnnual).toBeGreaterThan(0)
    expect(f.taxFreePortionAnnual).toBeCloseTo(taxFreeLimit, 0)
    expect(f.svLiableOverflowAnnual).toBeGreaterThan(0) // also above 4% BBG
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

describe('calculateSolidarityTax — Milderungszone', () => {
  const freeTax = de2026Rules.incomeTax.solidarityFreeTax // 20,350

  it('returns 0 at and below the solidarity-free threshold', () => {
    expect(calculateSolidarityTax(freeTax, de2026Rules)).toBe(0)
    expect(calculateSolidarityTax(10_000, de2026Rules)).toBe(0)
  })

  it('applies Milderungszone rate just above the threshold (much less than full 5.5%)', () => {
    // At incomeTax = freeTax + 1: transition = 1 × 0.119 = 0.119 << regular 20351 × 0.055 = 1119
    expect(calculateSolidarityTax(freeTax + 1, de2026Rules)).toBeCloseTo(0.119, 3)
  })

  it('Milderungszone rate is lower than 5.5% in the transition range', () => {
    // At it = 25,000: transition = 4650 × 0.119 = 553.35 < regular 1375
    const soli = calculateSolidarityTax(25_000, de2026Rules)
    expect(soli).toBeCloseTo(553.35, 0)
    expect(soli).toBeLessThan(25_000 * 0.055)
  })

  it('exits Milderungszone and applies full 5.5% above the crossover (~37,838)', () => {
    // Crossover: (it - freeTax) × 0.119 = it × 0.055 → it ≈ 37,838
    expect(calculateSolidarityTax(38_000, de2026Rules)).toBeCloseTo(38_000 * 0.055, 0)
    expect(calculateSolidarityTax(40_000, de2026Rules)).toBeCloseTo(40_000 * 0.055, 0)
  })
})

describe('calculateCapitalGainsTax — InvStG §20 partial exemptions', () => {
  const gain = 10_000
  const rules = de2026Rules
  // effective rate = 25% × (1 + 5.5% Soli) = 26.375%
  const effectiveRate = rules.capitalGains.taxRate * (1 + rules.capitalGains.solidarityRate)

  it('0% exemption (Anleihe-ETF / Sonstige): full gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0, 0)).toBeCloseTo(gain * effectiveRate, 0)
  })

  it('15% exemption (Mischfonds): 85% of gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0.15, 0)).toBeCloseTo(gain * 0.85 * effectiveRate, 0)
  })

  it('30% exemption (Aktienfonds): 70% of gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0.3, 0)).toBeCloseTo(gain * 0.7 * effectiveRate, 0)
  })

  it('60% exemption (inl. Immobilienfonds): 40% of gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0.6, 0)).toBeCloseTo(gain * 0.4 * effectiveRate, 0)
  })

  it('80% exemption (ausl. Immobilienfonds): 20% of gain taxed', () => {
    expect(calculateCapitalGainsTax(gain, rules, 0.8, 0)).toBeCloseTo(gain * 0.2 * effectiveRate, 0)
  })

  it('Sparerpauschbetrag fully covers tax when exempted gain < allowance', () => {
    // gain=1000, 30% exemption: taxable = 1000×0.7 = 700 < saverAllowance 1000 → no tax
    expect(calculateCapitalGainsTax(1_000, rules, 0.3, 1_000)).toBe(0)
  })

  it('Sparerpauschbetrag partially reduces tax', () => {
    // gain=5000, 30% exemption, allowance=1000: taxable = 5000×0.7 - 1000 = 2500
    expect(calculateCapitalGainsTax(5_000, rules, 0.3, 1_000)).toBeCloseTo(2_500 * effectiveRate, 0)
  })
})

describe('social-security helpers', () => {
  it('calculates employee care-insurance rates by child birth years (§55 Abs. 3a SGB XI)', () => {
    // 0 children → Kinderlosenzuschlag (+0.6 %)
    expect(careEmployeeRateForChildren([], 2026, de2026Rules)).toBeCloseTo(0.024)
    // 1 qualifying child (under 25 in 2026) → base rate, no discount
    expect(careEmployeeRateForChildren([2010], 2026, de2026Rules)).toBeCloseTo(0.018)
    // 2 qualifying → 1 discount of 0.25 %
    expect(careEmployeeRateForChildren([2010, 2012], 2026, de2026Rules)).toBeCloseTo(0.0155)
    // 3 qualifying → 2 discounts
    expect(careEmployeeRateForChildren([2010, 2012, 2014], 2026, de2026Rules)).toBeCloseTo(0.013)
    // 5 qualifying → 4 discounts (statutory maximum)
    expect(careEmployeeRateForChildren([2010, 2012, 2014, 2016, 2018], 2026, de2026Rules)).toBeCloseTo(0.008)
    // 6 qualifying → still capped at 4 discounts
    expect(careEmployeeRateForChildren([2010, 2012, 2014, 2016, 2018, 2020], 2026, de2026Rules)).toBeCloseTo(0.008)
    // All children over 25 (born 1990, 1993) → exempt from Kinderlosenzuschlag but 0 discounts → base rate
    expect(careEmployeeRateForChildren([1990, 1993], 2026, de2026Rules)).toBeCloseTo(0.018)
    // Mixed: 2 over-25 + 1 qualifying → 1 qualifying child → base rate (no discount for single qualifying)
    expect(careEmployeeRateForChildren([1990, 1993, 2010], 2026, de2026Rules)).toBeCloseTo(0.018)
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
  // Shared constants for BBG-regime tests:
  // RV BBG = 101_400, svFreeLimit = 4% × 101_400 = 4_056/year
  // durchschnittsentgelt = 51_944 (SVBezGrV 2026), aktuellerRentenwert = 42.52 EUR/EP (DRV 2026, post-July)
  // yearsToRetirement = 67 - 28 = 39 (defaultProfile)

  it('estimatedMonthlyGrvReduction is zero when conversion is zero', () => {
    const f = calculateBavFunding(defaultProfile, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 0,
    })
    expect(f.estimatedMonthlyGrvReduction).toBe(0)
  })

  it('scales linearly when both conversions are fully SV-free and salary is below RV BBG', () => {
    // Use 100/month (1_200/year) and 200/month (2_400/year): both < svFreeLimit 4_056
    // For 75k salary (below 101_400 BBG): lostBase = full SV-free conversion → linear
    const f100 = calculateBavFunding(defaultProfile, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 100,
    })
    const f200 = calculateBavFunding(defaultProfile, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 200,
    })
    // doubling conversion → doubling reduction (linear when below BBG and within SV-free limit)
    expect(f200.estimatedMonthlyGrvReduction).toBeCloseTo(f100.estimatedMonthlyGrvReduction * 2, 3)
  })

  it('below RV BBG: full SV-free conversion is lost — 200/month at 50k salary', () => {
    // grossSalary = 50_000 < RV_BBG 101_400
    // annualConversion = 2_400, effectiveSvFreeConversion = 2_400 (< svFreeLimit 4_056)
    // lostPensionableBase = min(50_000, 101_400) - min(47_600, 101_400) = 50_000 - 47_600 = 2_400
    // EP_per_year = 2_400 / 51_944 ≈ 0.046204
    // estimatedMonthlyGrvReduction ≈ 0.046204 × 39 × 42.52 ≈ 76.61
    const profile50k: PersonalProfile = { ...defaultProfile, grossSalaryYear: 50_000 }
    const f = calculateBavFunding(profile50k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 200,
      contractualMatchPercent: 0,
      contractualFixedMonthly: 0,
    })
    const expectedLostBase = 2_400
    const expected = 39 * (expectedLostBase / de2026Rules.socialSecurity.durchschnittsentgelt) * de2026Rules.socialSecurity.aktuellerRentenwert
    expect(f.estimatedMonthlyGrvReduction).toBeCloseTo(expected, 2)
  })

  it('crossing RV BBG: only the portion below the ceiling is lost — 200/month at 102k salary', () => {
    // grossSalary = 102_000, RV_BBG = 101_400, annualConversion = 2_400 (< svFreeLimit 4_056)
    // effectiveSvFreeConversion = 2_400
    // grossAfterSvFree = 102_000 - 2_400 = 99_600
    // lostPensionableBase = min(102_000, 101_400) - min(99_600, 101_400) = 101_400 - 99_600 = 1_800
    // (not the full 2_400 — the 600 EUR that was already above BBG contributes nothing)
    const profile102k: PersonalProfile = { ...defaultProfile, grossSalaryYear: 102_000 }
    const f = calculateBavFunding(profile102k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 200,
      contractualMatchPercent: 0,
      contractualFixedMonthly: 0,
    })
    const expectedLostBase = 1_800
    const expected = 39 * (expectedLostBase / de2026Rules.socialSecurity.durchschnittsentgelt) * de2026Rules.socialSecurity.aktuellerRentenwert
    expect(f.estimatedMonthlyGrvReduction).toBeCloseTo(expected, 2)
  })

  it('fully above RV BBG: zero loss — 200/month at 150k salary', () => {
    // grossSalary = 150_000 > RV_BBG 101_400
    // min(150_000, 101_400) - min(147_600, 101_400) = 101_400 - 101_400 = 0
    const profile150k: PersonalProfile = { ...defaultProfile, grossSalaryYear: 150_000 }
    const f = calculateBavFunding(profile150k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 200,
      contractualMatchPercent: 0,
      contractualFixedMonthly: 0,
    })
    expect(f.estimatedMonthlyGrvReduction).toBe(0)
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
      fees: { wrapperAssetFee: 0, fundAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 1, pensionPayoutFeePct: 0 },
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
      fees: { wrapperAssetFee: 0, fundAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 1, pensionPayoutFeePct: 0 },
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
    const subsidyAnnual = f.monthlyStatutoryEmployerSubsidy * 12
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
      contractualMatchPercent: 1.0,
    })
    const subsidyAnnual = f.monthlyStatutoryEmployerSubsidy * 12
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

describe('#51 statutory vs. contractual employer contribution', () => {
  it('statutory enabled, no contractual: only §1a Abs. 1a subsidy, capped by SV savings', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
      statutoryMinimumSubsidyEnabled: true,
      contractualMatchPercent: 0,
      contractualFixedMonthly: 0,
    })
    expect(f.monthlyContractualEmployerContribution).toBe(0)
    expect(f.monthlyStatutoryEmployerSubsidy).toBeGreaterThan(0)
    expect(f.monthlyEffectiveEmployerContribution).toBeCloseTo(f.monthlyStatutoryEmployerSubsidy, 5)
    expect(f.monthlyEmployerContribution).toBeCloseTo(f.monthlyStatutoryEmployerSubsidy, 5)
    // Cap holds: subsidy ≤ employer SV saving
    expect(f.monthlyStatutoryEmployerSubsidy * 12).toBeLessThanOrEqual(f.employerSocialSecuritySavingAnnual + 0.01)
  })

  it('statutory disabled + 15% contractual: contractual paid uncapped, no statutory part', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
      statutoryMinimumSubsidyEnabled: false,
      contractualMatchPercent: 0.15,
      contractualFixedMonthly: 0,
    })
    expect(f.monthlyStatutoryEmployerSubsidy).toBe(0)
    // 15 % of 300 = 45 EUR/month — paid in full, not clipped to employer SV savings
    expect(f.monthlyContractualEmployerContribution).toBeCloseTo(45, 2)
    expect(f.monthlyEffectiveEmployerContribution).toBeCloseTo(45, 2)
  })

  it('statutory enabled + 15% contractual: both stack', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
      statutoryMinimumSubsidyEnabled: true,
      contractualMatchPercent: 0.15,
      contractualFixedMonthly: 0,
    })
    expect(f.monthlyContractualEmployerContribution).toBeCloseTo(45, 2)
    expect(f.monthlyStatutoryEmployerSubsidy).toBeGreaterThan(0)
    expect(f.monthlyEffectiveEmployerContribution).toBeCloseTo(
      f.monthlyStatutoryEmployerSubsidy + f.monthlyContractualEmployerContribution,
      2,
    )
    expect(f.monthlyEmployerContribution).toBeCloseTo(f.monthlyEffectiveEmployerContribution, 5)
  })

  it('contractual fixed monthly only: paid as a flat add-on independent of conversion', () => {
    const f = calculateBavFunding(testProfile75k, de2026Rules, {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 300,
      statutoryMinimumSubsidyEnabled: false,
      contractualMatchPercent: 0,
      contractualFixedMonthly: 50,
    })
    expect(f.monthlyStatutoryEmployerSubsidy).toBe(0)
    expect(f.monthlyContractualEmployerContribution).toBeCloseTo(50, 2)
    expect(f.monthlyEffectiveEmployerContribution).toBeCloseTo(50, 2)
  })
})

describe('#35 children-adjusted retirement PV rate in netBavPayout', () => {
  it('childless rate (0 children) equals careRetirementChildlessRate by construction', () => {
    const threshold = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly
    const payout = threshold + 200  // annual = 4773 EUR < basicAllowance → tax = 0
    // defaultProfile has childBirthYears: [] → Kinderlosenzuschlag applies
    const childless = netBavPayout(payout, defaultProfile, de2026Rules)
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

  it('2-child parent (both qualifying under 25 at retirementYear) pays lower PV than childless', () => {
    const payout = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly + 200
    // childBirthYears: [] → Kinderlosenzuschlag; retirementYear defaults to rules.year (2026)
    const childless = netBavPayout(payout, defaultProfile, de2026Rules)
    // Born 2005, 2008 → ages 21 and 18 in 2026 → both qualifying → 1.55 % rate → lower PV
    const twoChildren = netBavPayout(payout, { ...defaultProfile, childBirthYears: [2005, 2008] }, de2026Rules)
    expect(twoChildren).toBeGreaterThan(childless)
  })
})

describe('bAV funding model', () => {
  it('uses the actual employer social-security saving as cap for the minimum subsidy', () => {
    const funding = calculateBavFunding(defaultProfile, de2026Rules, defaultAssumptions.bav)

    expect(funding.monthlyGrossConversion).toBe(300)
    expect(funding.monthlyStatutoryEmployerSubsidy).toBeGreaterThan(25)
    expect(funding.monthlyStatutoryEmployerSubsidy).toBeLessThan(45)
  })

  it('compares private products against the same net cost as bAV by default', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const basis = result.products.filter((product) => product.scenarioId === 'basis')
    const etf = basis.find((product) => product.productId === 'etf')
    const bav = basis.find((product) => product.productId === 'bav')

    expect(etf?.monthlyUserCost).toBeCloseTo(bav?.monthlyUserCost ?? 0, 2)
    expect(bav?.monthlyProductContribution).toBeGreaterThan(bav?.monthlyUserCost ?? 0)
  })

  it('bAV lump-sum after-tax is computed and less than gross capital', () => {
    const result = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const bav = result.products.find(
      (product) => product.productId === 'bav' && product.scenarioId === 'basis',
    )

    expect(bav?.afterTaxLumpSum).not.toBeNull()
    expect(bav?.afterTaxLumpSum).toBeGreaterThan(0)
    expect(bav?.afterTaxLumpSum).toBeLessThan(bav?.capitalAtRetirement ?? 0)
    expect(bav?.valueMultipleOnUserCost).not.toBeNull()
  })

  it('derives insurance tax modes: pre2005 tax-free, halbeinkuenfte half-income tax, abgeltungsteuer full Abgeltungsteuer', () => {
    // pre2005: lump sum == capital; net payout == gross payout
    const pre2005 = simulateRetirementComparison(defaultProfile, {
      ...defaultAssumptions,
      insurance: { ...defaultAssumptions.insurance, contractStartYear: 1990, oldContractTaxFreeEligible: true },
    }, de2026Rules).products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')
    expect(pre2005?.afterTaxLumpSum).toBeCloseTo(pre2005?.capitalAtRetirement ?? 0)
    expect(pre2005?.netMonthlyPayout).toBeCloseTo(pre2005?.grossMonthlyPayout ?? 0)

    // halbeinkuenfte: with 3,000 EUR/month other income the half-gain sits in the 42% bracket
    // → marginalTax(other + halfGain) - marginalTax(other) > 0 → net < gross
    const halbein = simulateRetirementComparison(defaultProfile, {
      ...defaultAssumptions,
      insurance: {
        ...defaultAssumptions.insurance,
        contractStartYear: 2024,
        monthlyOtherRetirementIncome: 3_000,
      },
    }, de2026Rules).products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')
    expect(halbein?.afterTaxLumpSum ?? 0).toBeLessThan(halbein?.capitalAtRetirement ?? 0)
    expect(halbein?.netMonthlyPayout ?? 0).toBeLessThan(halbein?.grossMonthlyPayout ?? 0)

    // abgeltungsteuer: retirementAge 60 < 62 → full 25% Abgeltungsteuer on gain (lump sum).
    // For monthly payout: leibrente uses Ertragsanteil (#59) regardless of contract era.
    // kapitalverzehr mode keeps the gain-ratio path and shows net < gross on the monthly side.
    const abgelt = simulateRetirementComparison(
      { ...defaultProfile, retirementAge: 60 },
      {
        ...defaultAssumptions,
        insurance: {
          ...defaultAssumptions.insurance,
          contractStartYear: 2024,
          payoutMode: 'kapitalverzehr', // test gain-ratio path explicitly
          monthlyOtherRetirementIncome: 2_000, // push gain into taxable bracket
        },
      },
      de2026Rules,
    ).products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')
    expect(abgelt?.afterTaxLumpSum ?? 0).toBeLessThan(abgelt?.capitalAtRetirement ?? 0)
    expect(abgelt?.netMonthlyPayout ?? 0).toBeLessThan(abgelt?.grossMonthlyPayout ?? 0)
  })
})

describe('#6/#19 afterTaxBavLumpSum — §229 SGB V 1/120 + §34 EStG Fünftelregelung', () => {
  const threshold = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly // 197.75

  it('returns 0 for a zero lump sum', () => {
    expect(afterTaxBavLumpSum(0, defaultProfile, de2026Rules)).toBe(0)
  })

  it('below KVdR threshold × 120: no KV and no PV (only income tax via Fünftelregelung)', () => {
    // threshold × 120 = 197.75 × 120 = 23,730 EUR; monthlyBase = 23,730/120 = 197.75 = threshold (not strictly above)
    // With 0 other income and small lump sum below threshold×120: no KV, no PV
    const lumpSum = threshold * 120 // exactly at threshold
    // income tax: Fünftelregelung on 23,730 — with basicAllowance 12,348, annual lumpSum/5 = 4,746 < basicAllowance
    // → 5×(tax(4746)-tax(0)) = 5×0 = 0 income tax too
    const result = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true)
    expect(result).toBeCloseTo(lumpSum, 0) // no deductions
  })

  it('above threshold × 120 (KVdR): KV on excess, PV on full amount, Fünftelregelung on income tax', () => {
    // lumpSum = 120,000 EUR; threshold×120 = 23,730 → KV excess = 96,270 EUR
    const lumpSum = 120_000
    const healthRate = de2026Rules.socialSecurity.healthGeneralRate + defaultProfile.healthAdditionalContributionPct / 100
    const expectedKv = Math.max(0, lumpSum - threshold * 120) * healthRate
    const pvRate = de2026Rules.socialSecurity.careRetirementChildlessRate
    const monthlyBase = lumpSum / 120 // 1000 EUR > 197.75
    const expectedPv = monthlyBase > threshold ? lumpSum * pvRate : 0
    // Income tax via Fünftelregelung with 0 other income; lumpSum/5 = 24,000 > basicAllowance 12,348
    const result = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true)
    expect(result).toBeLessThan(lumpSum - expectedKv - expectedPv)
    expect(result).toBeGreaterThan(0)
  })

  it('freiwillig versichert: KV on full lump sum (no Freibetrag), higher deduction than KVdR', () => {
    const lumpSum = 100_000
    const kvdrResult = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true)
    const freiwilligResult = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, false)
    expect(freiwilligResult).toBeLessThan(kvdrResult)
  })

  it('PKV member: no KV/PV deduction, only income tax', () => {
    const pkvProfile = { ...defaultProfile, publicHealthInsurance: false }
    const lumpSum = 100_000
    const gkvResult = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true)
    const pkvResult = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, 0, true)
    // PKV: same income tax but no KV/PV → higher net
    expect(pkvResult).toBeGreaterThan(gkvResult)
  })

  it('Fünftelregelung reduces income tax compared to simple marginal rate', () => {
    // With high other income (3,000/month = 36,000/year) and large lump sum, Fünftelregelung saves tax
    const lumpSum = 200_000
    const otherAnnual = 36_000
    const pkvProfile = { ...defaultProfile, publicHealthInsurance: false }
    const withFuenftel = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, otherAnnual, true)
    // Without Fünftelregelung (simple marginal via tax function):
    const totalTax = (income: number) => {
      const it = calculateIncomeTax2026(income, de2026Rules)
      return it + calculateSolidarityTax(it, de2026Rules)
    }
    const simpleTax = totalTax(otherAnnual + lumpSum) - totalTax(otherAnnual)
    const simpleNet = lumpSum - simpleTax
    // Fünftelregelung net > simple marginal net (lower effective tax rate on the spike)
    expect(withFuenftel).toBeGreaterThan(simpleNet)
  })
})

describe('etfPayoutSchedule — negative, zero, and positive rates', () => {
  // Shared setup: 200k capital, 100k contributions, no Vorabpauschale, 20-year payout,
  // no partial exemption, no saver allowance to keep tax effects out of the depletion check.
  const pv = 200_000
  const contributions = 0 // all gain, but we just check depletion here
  const cumulativeVP = 0
  const n = 20
  const retirementAge = 67
  const noExemption = 0
  // use rules but set saverAllowance to 0 via a custom rules object to isolate PMT math
  const taxRules = { ...de2026Rules, capitalGains: { ...de2026Rules.capitalGains, saverAllowance: 0 } }

  it('r = 0: PMT equals PV/n per month and balance decays linearly to zero', () => {
    const r = 0
    const grossMonthly = monthlyPayoutFromCapital(pv, r, n)
    expect(grossMonthly).toBeCloseTo(pv / (n * 12), 4)

    const rows = etfPayoutSchedule(pv, contributions, cumulativeVP, grossMonthly, n, r, retirementAge, taxRules, noExemption)
    expect(rows).toHaveLength(n)

    // Linear decay: after k years, capitalAtEnd ≈ PV * (1 - k/n)
    for (let k = 1; k <= n; k++) {
      const expected = pv * (1 - k / n)
      expect(rows[k - 1].capitalAtEnd).toBeCloseTo(expected, 0)
    }

    // End balance is ~0
    expect(rows[n - 1].capitalAtEnd).toBeCloseTo(0, 1)
  })

  it('r = -0.01: PMT slightly below PV/n; balance reaches ~0 at end-age', () => {
    const r = -0.01
    const grossMonthly = monthlyPayoutFromCapital(pv, r, n)
    // With negative return, sustainable PMT is smaller than PV/(n*12)
    expect(grossMonthly).toBeLessThan(pv / (n * 12))

    const rows = etfPayoutSchedule(pv, contributions, cumulativeVP, grossMonthly, n, r, retirementAge, taxRules, noExemption)
    expect(rows).toHaveLength(n)

    // Balance must be ~0 at end
    expect(rows[n - 1].capitalAtEnd).toBeCloseTo(0, 0)
  })

  it('r = +0.04: PMT above PV/n; balance reaches ~0 at end-age (regression)', () => {
    const r = 0.04
    const grossMonthly = monthlyPayoutFromCapital(pv, r, n)
    // With positive return, sustainable PMT exceeds simple PV/(n*12)
    expect(grossMonthly).toBeGreaterThan(pv / (n * 12))

    const rows = etfPayoutSchedule(pv, contributions, cumulativeVP, grossMonthly, n, r, retirementAge, taxRules, noExemption)
    expect(rows).toHaveLength(n)

    // End balance ~0 (annuity formula guarantees depletion)
    expect(rows[n - 1].capitalAtEnd).toBeCloseTo(0, 0)
  })

  it('all three rates deplete to ~0 at the configured end-age', () => {
    for (const r of [0, -0.01, 0.04]) {
      const grossMonthly = monthlyPayoutFromCapital(pv, r, n)
      const rows = etfPayoutSchedule(pv, contributions, cumulativeVP, grossMonthly, n, r, retirementAge, taxRules, noExemption)
      expect(rows[n - 1].capitalAtEnd).toBeCloseTo(0, 0)
    }
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

describe('payoutMode (#54) — Leibrente / Zeitrente / Kapitalverzehr', () => {
  it('leibrente: gross monthly payout = capital / 10 000 × rentenfaktor (independent of payout horizon)', () => {
    const gross = computeGrossMonthlyPayout(300_000, {
      mode: 'leibrente',
      rentenfaktor: 30,
      zeitrenteYears: 20,
      kapitalverzehrYears: 23,
      payoutReturn: 0.04,
    })
    expect(gross).toBeCloseTo(900, 6) // 300_000 / 10_000 × 30
  })

  it('leibrente: changing kapitalverzehrYears does not change the payout (rentenfaktor only)', () => {
    const a = computeGrossMonthlyPayout(300_000, {
      mode: 'leibrente', rentenfaktor: 30, zeitrenteYears: 20, kapitalverzehrYears: 5, payoutReturn: 0.04,
    })
    const b = computeGrossMonthlyPayout(300_000, {
      mode: 'leibrente', rentenfaktor: 30, zeitrenteYears: 20, kapitalverzehrYears: 50, payoutReturn: 0.04,
    })
    expect(a).toBe(b)
  })

  it('zeitrente: uses zeitrenteYears, ignoring kapitalverzehrYears', () => {
    const gross = computeGrossMonthlyPayout(300_000, {
      mode: 'zeitrente', rentenfaktor: 30, zeitrenteYears: 15, kapitalverzehrYears: 23, payoutReturn: 0.04,
    })
    const expected = monthlyPayoutFromCapital(300_000, 0.04, 15)
    expect(gross).toBeCloseTo(expected, 6)
  })

  it('kapitalverzehr: matches the legacy depletion annuity over kapitalverzehrYears', () => {
    const gross = computeGrossMonthlyPayout(300_000, {
      mode: 'kapitalverzehr', rentenfaktor: 30, zeitrenteYears: 15, kapitalverzehrYears: 23, payoutReturn: 0.04,
    })
    const expected = monthlyPayoutFromCapital(300_000, 0.04, 23)
    expect(gross).toBeCloseTo(expected, 6)
  })

  it('zero/negative capital returns zero payout in any mode', () => {
    const cfg = { rentenfaktor: 30, zeitrenteYears: 15, kapitalverzehrYears: 23, payoutReturn: 0.04 }
    expect(computeGrossMonthlyPayout(0, { ...cfg, mode: 'leibrente' })).toBe(0)
    expect(computeGrossMonthlyPayout(-100, { ...cfg, mode: 'zeitrente' })).toBe(0)
    expect(computeGrossMonthlyPayout(0, { ...cfg, mode: 'kapitalverzehr' })).toBe(0)
  })

  it('simulate: bAV in leibrente mode → gross = capital × rentenfaktor / 10 000 (insensitive to retirementEndAge)', () => {
    const a = simulateRetirementComparison(defaultProfile, { ...defaultAssumptions, retirementEndAge: 80 }, de2026Rules)
    const b = simulateRetirementComparison(defaultProfile, { ...defaultAssumptions, retirementEndAge: 100 }, de2026Rules)
    const aBavBasis = a.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    const bBavBasis = b.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    // Same capital (accumulation phase identical) and same rentenfaktor → identical gross monthly payout.
    expect(aBavBasis.grossMonthlyPayout).toBeCloseTo(bBavBasis.grossMonthlyPayout, 6)
    // Sanity: matches the formula directly.
    expect(aBavBasis.grossMonthlyPayout).toBeCloseTo(
      (aBavBasis.capitalAtRetirement / 10_000) * defaultAssumptions.bav.rentenfaktor,
      6,
    )
  })

  it('simulate: bAV in kapitalverzehr mode → gross matches monthlyPayoutFromCapital over end-age horizon', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, payoutMode: 'kapitalverzehr' },
      },
      de2026Rules,
    )
    const bavBasis = sim.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    const payoutYears = defaultAssumptions.retirementEndAge - defaultProfile.retirementAge
    const payoutReturn = bavBasis.annualReturn - (defaultAssumptions.bav.fees.wrapperAssetFee + defaultAssumptions.bav.fees.fundAssetFee)
    const expected = monthlyPayoutFromCapital(bavBasis.capitalAtRetirement, payoutReturn, payoutYears)
    expect(bavBasis.grossMonthlyPayout).toBeCloseTo(expected, 6)
  })

  it('simulate: pAV in zeitrente mode → gross matches monthlyPayoutFromCapital over zeitrenteYears', () => {
    const sim = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        insurance: { ...defaultAssumptions.insurance, payoutMode: 'zeitrente', zeitrenteYears: 12 },
      },
      de2026Rules,
    )
    const pavBasis = sim.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')!
    const payoutReturn = pavBasis.annualReturn - (defaultAssumptions.insurance.fees.wrapperAssetFee + defaultAssumptions.insurance.fees.fundAssetFee)
    const expected = monthlyPayoutFromCapital(pavBasis.capitalAtRetirement, payoutReturn, 12)
    expect(pavBasis.grossMonthlyPayout).toBeCloseTo(expected, 6)
  })

  it('simulate: ETF payout is unaffected by bAV/pAV payoutMode (always self-managed drawdown)', () => {
    const a = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const b = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, payoutMode: 'kapitalverzehr' },
        insurance: { ...defaultAssumptions.insurance, payoutMode: 'zeitrente', zeitrenteYears: 10 },
      },
      de2026Rules,
    )
    const aEtfBasis = a.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    const bEtfBasis = b.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    expect(aEtfBasis.grossMonthlyPayout).toBeCloseTo(bEtfBasis.grossMonthlyPayout, 6)
    expect(aEtfBasis.netMonthlyPayout).toBeCloseTo(bEtfBasis.netMonthlyPayout, 6)
  })
})

describe('default-profile end-to-end snapshot', () => {
  // Locks in the three key output metrics for the default profile and assumptions.
  // Captures regression when any part of the engine changes.
  // Note: uses defaultAssumptions.retirementEndAge = 90 (payoutYears = 23).
  const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
  const find = (productId: string, scenarioId: string) =>
    sim.products.find((p) => p.productId === productId && p.scenarioId === scenarioId)!

  it('ETF: capitalAtRetirement, afterTaxLumpSum, netMonthlyPayout per scenario', () => {
    const k = find('etf', 'konservativ')
    expect(Math.round(k.capitalAtRetirement)).toBe(136_659)
    expect(Math.round(k.afterTaxLumpSum!)).toBe(134_815)
    expect(Math.round(k.netMonthlyPayout)).toBe(670)

    const b = find('etf', 'basis')
    expect(Math.round(b.capitalAtRetirement)).toBe(214_546)
    expect(Math.round(b.afterTaxLumpSum!)).toBe(201_503)
    expect(Math.round(b.netMonthlyPayout)).toBe(1_217)

    const o = find('etf', 'optimistisch')
    expect(Math.round(o.capitalAtRetirement)).toBe(347_498)
    expect(Math.round(o.afterTaxLumpSum!)).toBe(314_676)
    expect(Math.round(o.netMonthlyPayout)).toBe(2_240)
  })

  it('bAV: capitalAtRetirement, afterTaxLumpSum, netMonthlyPayout per scenario', () => {
    // #54: bAV now defaults to Leibrente with Rentenfaktor 30 EUR/10k/Monat. Gross monthly payout
    // is now capital/10000 × 30 (lifelong annuity) instead of monthlyPayoutFromCapital(...,23 yr).
    // capitalAtRetirement and afterTaxLumpSum are unchanged. netMonthlyPayout drops because the
    // Rentenfaktor-based gross is materially lower than the depletion annuity over 23 years
    // (which over-pays by drawing down principal as well as return).
    //
    // Pre-#54 netMonthlyPayout (capital drawdown, payoutYears = 23):
    //   konservativ: 922  basis: 1_487  optimistisch: 2_438
    // Post-#54 netMonthlyPayout (Leibrente, rentenfaktor 30 EUR/10k):
    //   konservativ: 606  basis:   912  optimistisch: 1_300
    const k = find('bav', 'konservativ')
    expect(Math.round(k.capitalAtRetirement)).toBe(243_214)
    expect(Math.round(k.afterTaxLumpSum!)).toBe(98_632)   // unchanged from #48
    expect(Math.round(k.netMonthlyPayout)).toBe(606)      // was 922 pre-#54 (Leibrente vs. 23-yr drawdown)

    const b = find('bav', 'basis')
    expect(Math.round(b.capitalAtRetirement)).toBe(379_719)
    expect(Math.round(b.afterTaxLumpSum!)).toBe(141_809)  // unchanged from #48
    expect(Math.round(b.netMonthlyPayout)).toBe(912)      // was 1_487 pre-#54

    const o = find('bav', 'optimistisch')
    expect(Math.round(o.capitalAtRetirement)).toBe(611_164)
    expect(Math.round(o.afterTaxLumpSum!)).toBe(213_152)  // unchanged from #48
    expect(Math.round(o.netMonthlyPayout)).toBe(1_300)    // was 2_438 pre-#54
  })

  it('private insurance: capitalAtRetirement, afterTaxLumpSum, netMonthlyPayout per scenario', () => {
    // #54: pAV now defaults to Leibrente with Rentenfaktor 28 EUR/10k/Monat (slightly lower
    // than the bAV default to reflect typical private-contract pricing). capitalAtRetirement
    // and afterTaxLumpSum are unchanged. netMonthlyPayout drops because Rentenfaktor-based
    // gross is materially lower than the 23-year depletion annuity used pre-#54.
    //
    // Pre-#54 netMonthlyPayout (capital drawdown, payoutYears = 23):
    //   konservativ: 418  basis: 783  optimistisch: 1_486
    // Post-#54 netMonthlyPayout (Leibrente, rentenfaktor 28 EUR/10k):
    //   konservativ: 270  basis: 413  optimistisch:   653
    const k = find('versicherung', 'konservativ')
    expect(Math.round(k.capitalAtRetirement)).toBe(96_525)
    expect(Math.round(k.afterTaxLumpSum!)).toBe(96_525) // gain < basicAllowance → still no Halbeinkünfte tax
    expect(Math.round(k.netMonthlyPayout)).toBe(270)    // was 418 pre-#54

    const b = find('versicherung', 'basis')
    expect(Math.round(b.capitalAtRetirement)).toBe(147_636)
    expect(Math.round(b.afterTaxLumpSum!)).toBe(141_947)  // unchanged from #46
    expect(Math.round(b.netMonthlyPayout)).toBe(413)      // was 783 pre-#54

    const o = find('versicherung', 'optimistisch')
    expect(Math.round(o.capitalAtRetirement)).toBe(233_291)
    expect(Math.round(o.afterTaxLumpSum!)).toBe(211_565)  // unchanged from #46
    expect(Math.round(o.netMonthlyPayout)).toBe(653)      // was 1_486 pre-#54
  })
})

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
      { ...defaultAssumptions, insurance: { ...defaultAssumptions.insurance, contractStartYear: 2010, oldContractTaxFreeEligible: false } },
      de2026Rules,
    )
    const ins = result.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')
    // halbeinkuenfte: net payout < gross payout (with other retirement income = 0, gain may be below personal tax threshold)
    // At minimum the lump sum should be ≤ capital (tax applied or zero)
    expect(ins?.afterTaxLumpSum).toBeDefined()
    expect((ins?.afterTaxLumpSum ?? 0)).toBeLessThanOrEqual(ins?.capitalAtRetirement ?? 0)
  })
})

describe('#56 pension payout fee', () => {
  it('grossMonthlyPayout is reduced by pensionPayoutFeePct for bAV Leibrente', () => {
    const noFee = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const withFee = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, fees: { ...defaultAssumptions.bav.fees, pensionPayoutFeePct: 0.0175 } },
      },
      de2026Rules,
    )
    const bavNoFee = noFee.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    const bavFee = withFee.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    // Capital at retirement is unaffected by pension payout fee (accumulation only)
    expect(bavFee.capitalAtRetirement).toBeCloseTo(bavNoFee.capitalAtRetirement, 0)
    // grossMonthlyPayout with 1.75% fee ≈ no-fee × (1 - 0.0175)
    expect(bavFee.grossMonthlyPayout).toBeCloseTo(bavNoFee.grossMonthlyPayout * (1 - 0.0175), 2)
    // Net payout is lower after fee
    expect(bavFee.netMonthlyPayout).toBeLessThan(bavNoFee.netMonthlyPayout)
  })

  it('pensionPayoutFeePct does not affect ETF payout', () => {
    // ETF uses zeroFeeModel (pensionPayoutFeePct=0); adding a non-zero fee to bAV must not bleed into ETF
    const withBavFee = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, bav: { ...defaultAssumptions.bav, fees: { ...defaultAssumptions.bav.fees, pensionPayoutFeePct: 0.05 } } },
      de2026Rules,
    )
    const base = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const etfBase = base.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    const etfWithFee = withBavFee.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    // ETF gross payout is unchanged even when bAV pension fee is set
    expect(etfWithFee.grossMonthlyPayout).toBeCloseTo(etfBase.grossMonthlyPayout, 6)
  })
})

describe('#57 accumulationRiy', () => {
  it('accumulationRiy is positive when fees > 0', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const bav = sim.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    // Default bAV has contribution fee 3%, asset fee 0.5%, acquisition cost 2.5% → RIY > 0
    expect(bav.accumulationRiy).toBeGreaterThan(0)
  })

  it('accumulationRiy is near zero for ETF with only a small TER', () => {
    // Default ETF has annualAssetFee = 0.2% and no other fees → very small RIY
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const etf = sim.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')!
    // 0.2% TER → RIY should be close to 0.2%
    expect(etf.accumulationRiy).toBeCloseTo(0.002, 2)
  })

  it('accumulationRiy is lower for zero-fee product vs. high-fee product', () => {
    const zeroFeeAssumptions = {
      ...defaultAssumptions,
      bav: {
        ...defaultAssumptions.bav,
        fees: {
          wrapperAssetFee: 0,
          fundAssetFee: 0,
          contributionFee: 0,
          fixedMonthlyFee: 0,
          acquisitionCostPct: 0,
          acquisitionCostSpreadYears: 5,
          pensionPayoutFeePct: 0,
        },
      },
    }
    const highFeeAssumptions = {
      ...defaultAssumptions,
      bav: {
        ...defaultAssumptions.bav,
        fees: {
          wrapperAssetFee: 0.007,
          fundAssetFee: 0.002,
          contributionFee: 0.0975,
          fixedMonthlyFee: 0,
          acquisitionCostPct: 0.025,
          acquisitionCostSpreadYears: 5,
          pensionPayoutFeePct: 0.0175,
        },
      },
    }
    const simZero = simulateRetirementComparison(defaultProfile, zeroFeeAssumptions, de2026Rules)
    const simHigh = simulateRetirementComparison(defaultProfile, highFeeAssumptions, de2026Rules)
    const bavZero = simZero.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    const bavHigh = simHigh.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    // RIY with zero fees: the closed-form FV and the accumulation loop may differ by floating-point epsilon
    expect(bavZero.accumulationRiy).toBeCloseTo(0, 10)
    expect(bavHigh.accumulationRiy).toBeGreaterThan(bavZero.accumulationRiy)
    // Hochkosten RIY should be well above 1.5 pp
    expect(bavHigh.accumulationRiy).toBeGreaterThan(0.015)
  })
})

describe('#50 PKV premium modeling', () => {
  const pkvBase: PersonalProfile = {
    ...defaultProfile,
    publicHealthInsurance: false,
    pkvMonthlyPremium: 0,
    pPVMonthlyPremium: 0,
  }
  const pkv500: PersonalProfile = {
    ...pkvBase,
    pkvMonthlyPremium: 500,
    pPVMonthlyPremium: 50,
  }

  it('calculatePkv257Subsidy: half the premium, capped at GKV employer equivalent', () => {
    // monthlyGross = 75000/12 = 6250; healthAndCareCapMonth = 5812.50
    // maxSubsidy = (0.146/2 + 0.018) * 5812.50 = (0.073 + 0.018) * 5812.50 = 0.091 * 5812.50 = 528.9375
    // halfPremium = (500 + 50) / 2 = 275 → subsidy = min(275, 528.94) = 275
    const subsidy = calculatePkv257Subsidy(75_000 / 12, 500, 50, de2026Rules)
    expect(subsidy).toBeCloseTo(275, 1)
  })

  it('calculatePkv257Subsidy: capped when premium exceeds GKV employer equivalent', () => {
    // Very high PKV premium: halfPremium = (2000 + 200) / 2 = 1100 > maxSubsidy (528.94)
    // Expected: subsidy = maxSubsidy ≈ 528.94
    const subsidy = calculatePkv257Subsidy(75_000 / 12, 2_000, 200, de2026Rules)
    const monthlyBase = de2026Rules.socialSecurity.healthAndCareCapMonth // 5812.50
    const maxSubsidy = (de2026Rules.socialSecurity.healthGeneralRate / 2 + de2026Rules.socialSecurity.careEmployerRate) * monthlyBase
    expect(subsidy).toBeCloseTo(maxSubsidy, 2)
  })

  it('PKV with zero premiums: salary result identical to GKV=false baseline (no KV/PV social, no premium deduction)', () => {
    const gkvFalseNoPrems = calculateSalaryResult(pkvBase, de2026Rules)
    // Social contributions: no health, no care (as before)
    expect(gkvFalseNoPrems.social.health).toBe(0)
    expect(gkvFalseNoPrems.social.care).toBe(0)
    // PKV cost fields are zero
    expect(gkvFalseNoPrems.pkv257SubsidyMonthly).toBe(0)
    expect(gkvFalseNoPrems.pkvNetMonthlyCost).toBe(0)
  })

  it('PKV with 500 + 50 EUR/month: annualNet decreases by net PKV cost (premium minus §257 subsidy)', () => {
    const noPrems = calculateSalaryResult(pkvBase, de2026Rules)
    const withPrems = calculateSalaryResult(pkv500, de2026Rules)
    // §257 subsidy = 275 EUR/month → net PKV cost = 550 - 275 = 275 EUR/month = 3300/year
    // Income tax LOWER for withPrems (higher Vorsorgepauschale via PKV KV/PV Teilbetrag)
    expect(withPrems.incomeTax).toBeLessThan(noPrems.incomeTax)
    // annualNet is lower by net PKV cost minus tax saving
    expect(withPrems.annualNet).toBeLessThan(noPrems.annualNet)
    const expectedNetCost = (500 + 50 - 275) * 12 // 3300
    expect(noPrems.annualNet - withPrems.annualNet).toBeGreaterThan(0)
    // The difference should be close to expectedNetCost minus the income-tax saving
    const taxSaving = noPrems.incomeTax - withPrems.incomeTax
    expect(noPrems.annualNet - withPrems.annualNet).toBeCloseTo(expectedNetCost - taxSaving, 0)
  })

  it('Vorsorgepauschale for PKV includes annual PKV + pPV premiums as KV/PV Teilbetrag', () => {
    const vpNoPrems = calculateVorsorgepauschale2026(75_000, pkvBase, de2026Rules)
    const vpWithPrems = calculateVorsorgepauschale2026(75_000, pkv500, de2026Rules)
    // With 500+50 = 550/month = 6600/year premium, VP increases by 6600 for KV/PV
    // but AV Teilbetrag (975) drops to 0 since kvpvSum (6600) exceeds the 1,900 EUR cap.
    // Net change = +6600 - 975 = +5625.
    expect(vpWithPrems).toBeGreaterThan(vpNoPrems)
    expect(vpWithPrems - vpNoPrems).toBeCloseTo(5_625, 0)
  })

  it('PKV salary result exposes correct pkv257SubsidyMonthly and pkvNetMonthlyCost', () => {
    const r = calculateSalaryResult(pkv500, de2026Rules)
    expect(r.pkv257SubsidyMonthly).toBeCloseTo(275, 1)
    expect(r.pkvNetMonthlyCost).toBeCloseTo(275, 1) // 550 - 275 = 275
  })

  it('GKV salary result always has zero PKV fields regardless of premium fields', () => {
    const gkvProfile = { ...defaultProfile }
    const r = calculateSalaryResult(gkvProfile, de2026Rules)
    expect(r.pkv257SubsidyMonthly).toBe(0)
    expect(r.pkvNetMonthlyCost).toBe(0)
  })

  it('bAV funding net cost differs slightly with PKV premiums (AV Teilbetrag no longer varies with bAV)', () => {
    const bavFundingNoPkv = calculateBavFunding(pkvBase, de2026Rules, defaultAssumptions.bav)
    const bavFundingPkv = calculateBavFunding(pkv500, de2026Rules, defaultAssumptions.bav)
    // PKV: no KV/PV social savings from bAV conversion → higher net cost than GKV (~165/month).
    // With high PKV premiums the AV Teilbetrag in Vorsorgepauschale is already capped at 0,
    // so it no longer varies with bAV conversion → pkv500 has slightly higher net cost than pkvBase.
    expect(bavFundingNoPkv.monthlyNetCost).toBeCloseTo(161, 0)
    expect(bavFundingPkv.monthlyNetCost).toBeGreaterThan(bavFundingNoPkv.monthlyNetCost)
    expect(Math.abs(bavFundingPkv.monthlyNetCost - bavFundingNoPkv.monthlyNetCost)).toBeLessThan(10)
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

describe('#60 product label — Private Rentenversicherung (Schicht 3)', () => {
  it('insurance product label is "Private Rentenversicherung (Schicht 3)"', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const ins = sim.products.find((p) => p.productId === 'versicherung')
    expect(ins?.label).toBe('Private Rentenversicherung (Schicht 3)')
  })
})

describe('#64 leibrenteBreakEvenAge', () => {
  it('is set for insurance in leibrente mode', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const ins = sim.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')
    // defaultAssumptions.insurance.payoutMode === 'leibrente'
    expect(ins?.leibrenteBreakEvenAge).toBeDefined()
    expect(ins?.leibrenteBreakEvenAge).toBeGreaterThan(defaultProfile.retirementAge)
  })

  it('break-even age = retirementAge + capital / (grossMonthlyPayout * 12)', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const ins = sim.products.find((p) => p.productId === 'versicherung' && p.scenarioId === 'basis')!
    const expected = ins.capitalAtRetirement / (ins.grossMonthlyPayout * 12) + defaultProfile.retirementAge
    expect(ins.leibrenteBreakEvenAge).toBeCloseTo(expected, 4)
  })

  it('is undefined for ETF (drawdown mode)', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const etf = sim.products.find((p) => p.productId === 'etf' && p.scenarioId === 'basis')
    expect(etf?.leibrenteBreakEvenAge).toBeUndefined()
  })

  it('is undefined for bAV in kapitalverzehr mode', () => {
    const kapAssumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, payoutMode: 'kapitalverzehr' as const },
    }
    const sim = simulateRetirementComparison(defaultProfile, kapAssumptions, de2026Rules)
    const bav = sim.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')
    expect(bav?.leibrenteBreakEvenAge).toBeUndefined()
  })
})

describe('#72 projectStatutoryPension (via simulateRetirementComparison)', () => {
  // Default profile: age=28, retirementAge=67, grossSalaryYear=75,000, currentEntgeltpunkte=8
  // pensionCapYear=101,400 (below cap); durchschnittsentgelt=51,944; aktuellerRentenwert=42.52
  // remainingYears=39; epPerYear=75000/51944≈1.4439; projectedEP=8+39*1.4439≈64.31; gross≈2734 EUR/month

  it('EP-based: gross monthly pension equals projectedEntgeltpunkte * aktuellerRentenwert', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const { grossMonthlyPension, projectedEntgeltpunkte } = sim.statutoryPension
    const expectedGross = projectedEntgeltpunkte * de2026Rules.socialSecurity.aktuellerRentenwert
    expect(grossMonthlyPension).toBeCloseTo(expectedGross, 2)
  })

  it('EP-based: projectedEntgeltpunkte = currentEP + remainingYears * (cappedSalary / durchschnittsentgelt)', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const cappedSalary = Math.min(defaultProfile.grossSalaryYear, de2026Rules.socialSecurity.pensionCapYear)
    const epPerYear = cappedSalary / de2026Rules.socialSecurity.durchschnittsentgelt
    const remainingYears = defaultProfile.retirementAge - defaultProfile.age
    const expectedEP = defaultAssumptions.statutoryPension.currentEntgeltpunkte + remainingYears * epPerYear
    expect(sim.statutoryPension.projectedEntgeltpunkte).toBeCloseTo(expectedEP, 4)
    // Snapshot: ~64.3 EP → ~2,734 EUR/month gross for the default 28-year-old at 75k
    expect(sim.statutoryPension.grossMonthlyPension).toBeCloseTo(2_734, 0)
  })

  it('manual override: gross pension equals manualMonthlyGross, EP-based estimation is bypassed', () => {
    const manualGross = 1_800
    const sim = simulateRetirementComparison(
      defaultProfile,
      {
        ...defaultAssumptions,
        statutoryPension: {
          ...defaultAssumptions.statutoryPension,
          manualMonthlyGross: manualGross,
          currentEntgeltpunkte: 100, // ignored in manual mode
        },
      },
      de2026Rules,
    )
    expect(sim.statutoryPension.grossMonthlyPension).toBeCloseTo(manualGross, 0)
  })

  it('net pension < gross pension (income tax + KV/PV both positive)', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    expect(sim.statutoryPension.taxMonthly).toBeGreaterThan(0)
    expect(sim.statutoryPension.kvPvMonthly).toBeGreaterThan(0)
    expect(sim.statutoryPension.netMonthlyPension).toBeLessThan(sim.statutoryPension.grossMonthlyPension)
  })

  it('net + tax + KV/PV ≈ gross (balance identity, floor at 0)', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const { grossMonthlyPension, netMonthlyPension, taxMonthly, kvPvMonthly } = sim.statutoryPension
    expect(netMonthlyPension).toBeCloseTo(
      Math.max(0, grossMonthlyPension - taxMonthly - kvPvMonthly),
      1,
    )
  })

  it('includeGrvReduction: gross drops by estimatedMonthlyGrvReduction from bAV', () => {
    const reduction = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
      .bavFunding.estimatedMonthlyGrvReduction
    // Only meaningful when bAV conversion > 0 (default: 300 EUR/month → reduction > 0)
    expect(reduction).toBeGreaterThan(0)

    const withRed = simulateRetirementComparison(
      defaultProfile,
      { ...defaultAssumptions, statutoryPension: { ...defaultAssumptions.statutoryPension, includeGrvReduction: true } },
      de2026Rules,
    )
    const noRed = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    expect(withRed.statutoryPension.grossMonthlyPension).toBeCloseTo(
      noRed.statutoryPension.grossMonthlyPension - reduction,
      2,
    )
    expect(withRed.statutoryPension.grvReductionApplied).toBeCloseTo(reduction, 2)
    expect(noRed.statutoryPension.grvReductionApplied).toBe(0)
  })

  it('zero EP, zero salary: gross and net are both 0', () => {
    const sim = simulateRetirementComparison(
      { ...defaultProfile, grossSalaryYear: 0 },
      {
        ...defaultAssumptions,
        statutoryPension: { manualMonthlyGross: null, currentEntgeltpunkte: 0, includeGrvReduction: false },
      },
      de2026Rules,
    )
    expect(sim.statutoryPension.grossMonthlyPension).toBe(0)
    expect(sim.statutoryPension.netMonthlyPension).toBe(0)
  })

  it('salary above BBG is capped at pensionCapYear for EP calculation', () => {
    const highSim = simulateRetirementComparison(
      { ...defaultProfile, grossSalaryYear: 200_000 },
      { ...defaultAssumptions, statutoryPension: { manualMonthlyGross: null, currentEntgeltpunkte: 0, includeGrvReduction: false } },
      de2026Rules,
    )
    const cappedSim = simulateRetirementComparison(
      { ...defaultProfile, grossSalaryYear: de2026Rules.socialSecurity.pensionCapYear },
      { ...defaultAssumptions, statutoryPension: { manualMonthlyGross: null, currentEntgeltpunkte: 0, includeGrvReduction: false } },
      de2026Rules,
    )
    // 200k and BBG cap should produce identical projectedEP (both capped)
    expect(highSim.statutoryPension.projectedEntgeltpunkte).toBeCloseTo(
      cappedSim.statutoryPension.projectedEntgeltpunkte,
      4,
    )
  })
})

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
    expect(result.annualGrvCountedTowardsCap).toBeCloseTo(expectedGrv, 1)
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
