import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import type { PersonalProfile } from '../../domain/types'
import {
  careEmployeeRateForChildren,
  calculateBavFunding,
  calculatePkv257Subsidy,
  calculateSalaryResult,
  calculateVorsorgepauschale2026,
} from '../salary'
import { simulateRetirementComparison } from '../simulate'
import { calculateIncomeTax2026, calculateSolidarityTax } from '../tax'
import { afterTaxBavLumpSum, monthlyPayoutFromCapital, netBavPayout } from '../projections'

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

describe('#56 pension payout fee — bAV Leibrente', () => {
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
})

describe('#57 accumulationRiy — bAV', () => {
  it('accumulationRiy is positive when fees > 0', () => {
    const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
    const bav = sim.products.find((p) => p.productId === 'bav' && p.scenarioId === 'basis')!
    // Default bAV has contribution fee 3%, asset fee 0.5%, acquisition cost 2.5% → RIY > 0
    expect(bav.accumulationRiy).toBeGreaterThan(0)
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

describe('payoutMode (#54) — bAV', () => {
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
})
