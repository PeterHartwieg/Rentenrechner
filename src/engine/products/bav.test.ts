import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import type { PersonalProfile } from '../../domain'
import {
  careEmployeeRateForChildren,
  calculateBavFunding,
  calculateSalaryResult,
  calculateVorsorgepauschale2026,
} from '../salary'
import { simulateRetirementComparison } from '../simulate'
import { netBavPayout } from '../projections'

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
