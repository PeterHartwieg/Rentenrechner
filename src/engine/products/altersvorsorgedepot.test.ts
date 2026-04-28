import { describe, expect, it } from 'vitest'
import {
  afterTaxAvdLumpSum,
  computeAvdAllowances,
  computeAvdGlidepathReturn,
  computeBasicAllowance,
  computeChildAllowance,
  calculateAvdFunding,
  netAvdPayout,
  validateAvdPayoutAge,
} from '../altersvorsorgedepot'
import { de2026Rules } from '../../rules/de2026'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'

const rules = de2026Rules
const avd = rules.altersvorsorgedepot

// ---------------------------------------------------------------------------
// Basic allowance formula
// ---------------------------------------------------------------------------

describe('computeBasicAllowance', () => {
  it('returns 0 below minimum own contribution', () => {
    expect(computeBasicAllowance(0, rules)).toBe(0)
    expect(computeBasicAllowance(119, rules)).toBe(0)
  })

  it('returns 50% for contributions at the minimum (120 EUR)', () => {
    // 50% × 120 = 60 EUR
    expect(computeBasicAllowance(120, rules)).toBeCloseTo(60, 4)
  })

  it('returns 180 EUR at tier-1 max (360 EUR own)', () => {
    // 50% × 360 = 180 EUR — end of tier 1, start of tier 2
    expect(computeBasicAllowance(360, rules)).toBeCloseTo(180, 4)
  })

  it('correctly mixes tier 1 and tier 2 at 1 000 EUR own', () => {
    // 50% × 360 + 25% × (1000 − 360) = 180 + 160 = 340 EUR
    expect(computeBasicAllowance(1_000, rules)).toBeCloseTo(340, 4)
  })

  it('returns the maximum 540 EUR at 1 800 EUR own', () => {
    // 50% × 360 + 25% × 1440 = 180 + 360 = 540 EUR
    expect(computeBasicAllowance(1_800, rules)).toBeCloseTo(540, 4)
  })

  it('caps at maximum 540 EUR for contributions above 1 800 EUR', () => {
    expect(computeBasicAllowance(2_400, rules)).toBeCloseTo(540, 4)
    expect(computeBasicAllowance(6_840, rules)).toBeCloseTo(540, 4)
  })
})

// ---------------------------------------------------------------------------
// Child allowance
// ---------------------------------------------------------------------------

describe('computeChildAllowance', () => {
  it('returns 0 with no children', () => {
    expect(computeChildAllowance(1_200, 0, rules)).toBe(0)
  })

  it('returns 0 below minimum own contribution', () => {
    expect(computeChildAllowance(119, 2, rules)).toBe(0)
  })

  it('caps at 300 EUR per child at 300+ EUR own contribution', () => {
    // 1 child at 300 EUR own → 300 EUR; 2 children → 600 EUR
    expect(computeChildAllowance(300, 1, rules)).toBeCloseTo(300, 4)
    expect(computeChildAllowance(300, 2, rules)).toBeCloseTo(600, 4)
  })

  it('scales below the cap: 150 EUR own, 1 child → 150 EUR', () => {
    expect(computeChildAllowance(150, 1, rules)).toBeCloseTo(150, 4)
  })

  it('caps at 300 per child regardless of own contribution amount', () => {
    expect(computeChildAllowance(1_800, 3, rules)).toBeCloseTo(900, 4)
  })
})

// ---------------------------------------------------------------------------
// Combined allowances
// ---------------------------------------------------------------------------

describe('computeAvdAllowances', () => {
  const baseEligibility: Parameters<typeof computeAvdAllowances>[1] = {
    directlyEligible: true,
    indirectSpouseEligible: false,
    eligibleChildren: 0,
    ageAtContractStart: 30,
    careerStarterBonusUsed: false,
  }

  it('adds career-starter bonus in first year for under-25', () => {
    const result = computeAvdAllowances(
      1_200,
      { ...baseEligibility, ageAtContractStart: 22 },
      rules,
      true, // isFirstContributionYear
    )
    expect(result.careerStarterBonusAnnual).toBe(avd.careerStarterBonus)
  })

  it('does not add career-starter bonus when already used', () => {
    const result = computeAvdAllowances(
      1_200,
      { ...baseEligibility, ageAtContractStart: 22, careerStarterBonusUsed: true },
      rules,
      true,
    )
    expect(result.careerStarterBonusAnnual).toBe(0)
  })

  it('does not add career-starter bonus for age 25+', () => {
    const result = computeAvdAllowances(
      1_200,
      { ...baseEligibility, ageAtContractStart: 25 },
      rules,
      true,
    )
    expect(result.careerStarterBonusAnnual).toBe(0)
  })

  it('does not add career-starter bonus in subsequent years', () => {
    const result = computeAvdAllowances(
      1_200,
      { ...baseEligibility, ageAtContractStart: 22 },
      rules,
      false, // NOT first year
    )
    expect(result.careerStarterBonusAnnual).toBe(0)
  })

  it('adds indirect-spouse allowance capped at 175 EUR', () => {
    const result = computeAvdAllowances(
      1_800,
      { ...baseEligibility, indirectSpouseEligible: true },
      rules,
    )
    // Basic at 1800 = 540, capped at 175 for indirect
    expect(result.indirectSpouseAllowanceAnnual).toBeCloseTo(175, 4)
  })

  it('correctly totals all allowances with children', () => {
    const result = computeAvdAllowances(
      1_200,
      { ...baseEligibility, eligibleChildren: 2 },
      rules,
    )
    // basic(1200) = 180 + 25%×840 = 180+210 = 390; child(1200,2) = 300×2 = 600
    expect(result.basicAllowanceAnnual).toBeCloseTo(390, 4)
    expect(result.childAllowanceAnnual).toBeCloseTo(600, 4)
    expect(result.totalAllowanceAnnual).toBeCloseTo(990, 4)
  })
})

// ---------------------------------------------------------------------------
// AVD funding calculation (§10a Günstigerprüfung)
// ---------------------------------------------------------------------------

describe('calculateAvdFunding', () => {
  const avdBase: Parameters<typeof calculateAvdFunding>[2] = {
    ...defaultAssumptions.altersvorsorgedepot,
    monthlyOwnContribution: 150, // 1 800 EUR/year → max basic allowance
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      eligibleChildren: 0,
      ageAtContractStart: 30,
      careerStarterBonusUsed: true,
    },
  }

  it('produces maximum 540 EUR basic allowance at 1 800 EUR own', () => {
    const result = calculateAvdFunding(rules, { taxableIncome: 50_000 } as never, avdBase)
    expect(result.basicAllowanceAnnual).toBeCloseTo(540, 4)
    expect(result.childAllowanceAnnual).toBe(0)
  })

  it('special expense base = min(own, 1800) + allowance = 1800 + 540 = 2340 at 1800 own', () => {
    const result = calculateAvdFunding(rules, { taxableIncome: 50_000 } as never, avdBase)
    expect(result.specialExpenseBaseAnnual).toBeCloseTo(2_340, 4)
  })

  it('contributions above 1 800 EUR do not increase special expense base', () => {
    const highContrib: typeof avdBase = { ...avdBase, monthlyOwnContribution: 570 } // 6 840 EUR/year
    const result = calculateAvdFunding(rules, { taxableIncome: 50_000 } as never, highContrib)
    // specialExpenseBase still = 1800 + 540 = 2340
    expect(result.specialExpenseBaseAnnual).toBeCloseTo(2_340, 4)
  })

  it('net cost is reduced by Günstigerprüfung benefit', () => {
    // High income → Günstigerprüfung should provide a benefit > 0
    const result = calculateAvdFunding(rules, { taxableIncome: 80_000 } as never, avdBase)
    expect(result.guenstigerpruefungBenefitAnnual).toBeGreaterThan(0)
    expect(result.monthlyNetCost).toBeLessThan(avdBase.monthlyOwnContribution)
  })

  it('no Günstigerprüfung benefit at zero income (allowance always wins)', () => {
    const result = calculateAvdFunding(rules, { taxableIncome: 0 } as never, avdBase)
    expect(result.guenstigerpruefungBenefitAnnual).toBe(0)
    expect(result.monthlyNetCost).toBeCloseTo(avdBase.monthlyOwnContribution, 4)
  })
})

// ---------------------------------------------------------------------------
// Glidepath
// ---------------------------------------------------------------------------

describe('computeAvdGlidepathReturn', () => {
  const riskReturn = 0.07
  const lowReturn = 0.02
  const defaultAlloc = 0.80

  it('uses full default allocation far from retirement', () => {
    const result = computeAvdGlidepathReturn(0, 30, riskReturn, lowReturn, defaultAlloc, rules)
    // 30 years to go → no clamp; 0.8×7% + 0.2×2% = 5.6 + 0.4 = 6.0%
    expect(result).toBeCloseTo(0.80 * riskReturn + 0.20 * lowReturn, 6)
  })

  it('clamps to 50% risk allocation 5 years before retirement', () => {
    // yearIndex=25, yearsToRetirement=30 → 5 years to go → clamp to 50%
    const result = computeAvdGlidepathReturn(25, 30, riskReturn, lowReturn, defaultAlloc, rules)
    expect(result).toBeCloseTo(0.50 * riskReturn + 0.50 * lowReturn, 6)
  })

  it('clamps to 30% risk allocation 2 years before retirement', () => {
    // yearIndex=28, yearsToRetirement=30 → 2 years to go → clamp to 30%
    const result = computeAvdGlidepathReturn(28, 30, riskReturn, lowReturn, defaultAlloc, rules)
    expect(result).toBeCloseTo(0.30 * riskReturn + 0.70 * lowReturn, 6)
  })

  it('does not exceed the user default allocation in early years', () => {
    // If user already chose 30%, glidepath should not increase it
    const result = computeAvdGlidepathReturn(0, 30, riskReturn, lowReturn, 0.30, rules)
    expect(result).toBeCloseTo(0.30 * riskReturn + 0.70 * lowReturn, 6)
  })
})

// ---------------------------------------------------------------------------
// Payout age validation
// ---------------------------------------------------------------------------

describe('validateAvdPayoutAge', () => {
  it('returns null for valid ages 65–70', () => {
    expect(validateAvdPayoutAge(65, rules)).toBeNull()
    expect(validateAvdPayoutAge(67, rules)).toBeNull()
    expect(validateAvdPayoutAge(70, rules)).toBeNull()
  })

  it('returns warning below 65', () => {
    expect(validateAvdPayoutAge(64, rules)).not.toBeNull()
    expect(validateAvdPayoutAge(60, rules)).not.toBeNull()
  })

  it('returns warning above 70', () => {
    expect(validateAvdPayoutAge(71, rules)).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Payout taxation
// ---------------------------------------------------------------------------

describe('netAvdPayout', () => {
  const profile = { ...defaultProfile, publicHealthInsurance: true }
  const retirementYear = 2060

  it('returns less than gross (positive tax and KV/PV)', () => {
    const net = netAvdPayout(1_000, profile, rules, 0, retirementYear)
    expect(net).toBeGreaterThan(0)
    expect(net).toBeLessThan(1_000)
  })

  it('net is lower with higher other income (higher marginal rate)', () => {
    const netLow = netAvdPayout(1_000, profile, rules, 500, retirementYear)
    const netHigh = netAvdPayout(1_000, profile, rules, 3_000, retirementYear)
    expect(netHigh).toBeLessThan(netLow)
  })

  it('PKV holders pay no KV/PV, only income tax', () => {
    const gkvProfile = { ...profile, publicHealthInsurance: true }
    const pkvProfile = { ...profile, publicHealthInsurance: false }
    const netGkv = netAvdPayout(500, gkvProfile, rules, 0, retirementYear)
    const netPkv = netAvdPayout(500, pkvProfile, rules, 0, retirementYear)
    expect(netPkv).toBeGreaterThan(netGkv)
  })
})

// ---------------------------------------------------------------------------
// Partial capital lump-sum taxation
// ---------------------------------------------------------------------------

describe('afterTaxAvdLumpSum', () => {
  const profile = { ...defaultProfile }
  const retirementYear = 2060

  it('returns 0 for zero partial capital', () => {
    expect(afterTaxAvdLumpSum(0, profile, rules, 0, retirementYear)).toBe(0)
  })

  it('after-tax is less than gross (positive tax)', () => {
    const after = afterTaxAvdLumpSum(50_000, profile, rules, 0, retirementYear)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(50_000)
  })

  it('after-tax is lower with higher other income', () => {
    const low = afterTaxAvdLumpSum(30_000, profile, rules, 0, retirementYear)
    const high = afterTaxAvdLumpSum(30_000, profile, rules, 30_000, retirementYear)
    expect(high).toBeLessThan(low)
  })
})
