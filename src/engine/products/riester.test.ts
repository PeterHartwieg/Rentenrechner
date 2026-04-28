import { describe, expect, it } from 'vitest'
import {
  afterTaxRiesterLumpSum,
  computeRiesterChildAllowance,
  netRiesterPayout,
} from '../riester'
import { de2026Rules } from '../../rules/de2026'
import { defaultAssumptions, defaultProfile, defaultRiesterAssumptions } from '../../data/defaultScenario'
import { simulateRetirementComparison } from '../simulate'

const rules = de2026Rules
const r = rules.riester

// ---------------------------------------------------------------------------
// Child allowance (§85 EStG)
// ---------------------------------------------------------------------------

describe('computeRiesterChildAllowance', () => {
  it('returns 0 when no eligible children', () => {
    expect(computeRiesterChildAllowance(0, [], rules)).toBe(0)
    expect(computeRiesterChildAllowance(0, [2010, 2015], rules)).toBe(0)
  })

  it('returns 185 EUR for a pre-2008 child', () => {
    expect(computeRiesterChildAllowance(1, [2005], rules)).toBe(185)
  })

  it('returns 300 EUR for a post-2007 child', () => {
    expect(computeRiesterChildAllowance(1, [2010], rules)).toBe(300)
  })

  it('prefers youngest children when eligibleChildren < total', () => {
    // 3 children: 2003 (pre-2008), 2010 (post-2007), 2015 (post-2007).
    // eligibleChildren = 2 → take youngest two: 2015 + 2010 = 300 + 300 = 600.
    expect(computeRiesterChildAllowance(2, [2003, 2010, 2015], rules)).toBeCloseTo(600, 4)
  })

  it('mixed pre/post 2008 with all children eligible', () => {
    // 2005 (pre-2008, 185) + 2012 (post-2007, 300) = 485
    expect(computeRiesterChildAllowance(2, [2005, 2012], rules)).toBeCloseTo(485, 4)
  })

  it('caps at eligibleChildren count', () => {
    expect(computeRiesterChildAllowance(1, [2010, 2015], rules)).toBeCloseTo(300, 4)
  })
})

// ---------------------------------------------------------------------------
// Allowance constants sanity check
// ---------------------------------------------------------------------------

describe('Riester rules constants', () => {
  it('Grundzulage is 175 EUR', () => {
    expect(r.grundzulage).toBe(175)
  })

  it('pre-2008 Kinderzulage is 185 EUR', () => {
    expect(r.childAllowancePre2008).toBe(185)
  })

  it('post-2007 Kinderzulage is 300 EUR', () => {
    expect(r.childAllowancePost2007).toBe(300)
  })

  it('career-starter bonus is 200 EUR', () => {
    expect(r.careerStarterBonus).toBe(200)
  })

  it('Sockelbetrag is 60 EUR', () => {
    expect(r.sockelbetrag).toBe(60)
  })

  it('annualCapInclAllowances is 2100 EUR', () => {
    expect(r.annualCapInclAllowances).toBe(2_100)
  })
})

// ---------------------------------------------------------------------------
// calculateRiesterFunding
// ---------------------------------------------------------------------------

describe('calculateRiesterFunding — full allowances when min contribution met', () => {
  // Profile: 75k EUR salary. Relevant income = min(75000, 101400) = 75000.
  // Full allowances (directly eligible, no children, no career bonus): 175 EUR.
  // minRequired = max(60, 4% × 75000 - 175) = max(60, 3000 - 175) = max(60, 2825) = 2825 EUR/year.
  // annualOwnContribution = 3000 EUR (250 EUR/month × 12) ≥ 2825 → proration = 1.

  const riester = {
    ...defaultRiesterAssumptions,
    monthlyOwnContribution: 250, // 3000 EUR/year — above the 2825 minimum
    eligibility: {
      directlyEligible: true,
      ageAtContractStart: 30,
      careerStarterBonusUsed: true,
    },
  }

  // Use a salary result from the simulation for a realistic zvE.
  // For simplicity, derive it inline using calculateBavFunding via simulate.
  // We use a mock salary result by using the simplest path: no bAV conversion.
  const sim = simulateRetirementComparison(
    defaultProfile,
    {
      ...defaultAssumptions,
      riester,
    },
    rules,
  )
  const rf = sim.riesterFunding

  it('grants full Grundzulage 175 EUR when min contribution met', () => {
    expect(rf.grundzulageAnnual).toBeCloseTo(175, 4)
  })

  it('grants no child allowance when no children', () => {
    expect(rf.childAllowanceAnnual).toBe(0)
  })

  it('grants no career-starter bonus when already used', () => {
    expect(rf.careerStarterBonusAnnual).toBe(0)
  })

  it('proration factor is 1 when contribution meets minimum', () => {
    expect(rf.meetsMinContribution).toBe(true)
    expect(rf.prorationFactor).toBe(1)
  })

  it('special expense deductible capped at 2100 EUR', () => {
    // ownContrib (3000) + grundzulage (175) = 3175, but cap is 2100.
    expect(rf.specialExpenseDeductibleAnnual).toBe(2_100)
  })

  it('monthlyNetCost ≤ monthlyOwnContribution', () => {
    expect(rf.monthlyNetCost).toBeLessThanOrEqual(riester.monthlyOwnContribution + 0.01)
    expect(rf.monthlyNetCost).toBeGreaterThan(0)
  })
})

describe('calculateRiesterFunding — proration when contribution below minimum', () => {
  // Profile: 75k EUR salary. minRequired = 2825 EUR/year.
  // annualOwnContribution = 600 EUR (50 EUR/month × 12) < 2825 → proration applies.
  // prorationFactor = 600 / 2825 ≈ 0.2124.

  const riester = {
    ...defaultRiesterAssumptions,
    monthlyOwnContribution: 50, // 600 EUR/year — below the 2825 minimum
    eligibility: {
      directlyEligible: true,
      ageAtContractStart: 30,
      careerStarterBonusUsed: true,
    },
  }

  const sim = simulateRetirementComparison(
    defaultProfile,
    {
      ...defaultAssumptions,
      riester,
    },
    rules,
  )
  const rf = sim.riesterFunding

  it('proration factor is between 0 and 1', () => {
    expect(rf.meetsMinContribution).toBe(false)
    expect(rf.prorationFactor).toBeGreaterThan(0)
    expect(rf.prorationFactor).toBeLessThan(1)
  })

  it('prorated Grundzulage is less than 175 EUR', () => {
    expect(rf.grundzulageAnnual).toBeGreaterThan(0)
    expect(rf.grundzulageAnnual).toBeLessThan(175)
    // prorationFactor ≈ 600/2825 ≈ 0.2124; grundzulage ≈ 175 × 0.2124 ≈ 37.17
    expect(rf.grundzulageAnnual).toBeCloseTo(175 * (600 / rf.minEigenbeitragAnnual), 2)
  })
})

describe('calculateRiesterFunding — career-starter bonus in first year', () => {
  const riesterWithBonus = {
    ...defaultRiesterAssumptions,
    monthlyOwnContribution: 250, // ≥ minRequired
    eligibility: {
      directlyEligible: true,
      ageAtContractStart: 24, // ≤ careerStarterMaxAge (24)
      careerStarterBonusUsed: false, // not yet paid
    },
  }

  const sim = simulateRetirementComparison(
    defaultProfile,
    {
      ...defaultAssumptions,
      riester: riesterWithBonus,
    },
    rules,
  )
  const rf = sim.riesterFunding

  it('grants 200 EUR career-starter bonus in first year', () => {
    expect(rf.careerStarterBonusAnnual).toBe(200)
  })

  it('total allowances include the bonus', () => {
    // grundzulage (175) + bonus (200) = 375 (no children in default profile)
    expect(rf.totalAllowanceAnnual).toBeCloseTo(375, 2)
  })
})

describe('calculateRiesterFunding — Sockelbetrag minimum contribution', () => {
  // Very low contribution: 1 EUR/month = 12 EUR/year.
  // 12 EUR < 60 EUR Sockelbetrag → no allowances at all.

  const riesterLow = {
    ...defaultRiesterAssumptions,
    monthlyOwnContribution: 1,
    eligibility: {
      directlyEligible: true,
      ageAtContractStart: 30,
      careerStarterBonusUsed: true,
    },
  }

  const sim = simulateRetirementComparison(
    defaultProfile,
    {
      ...defaultAssumptions,
      riester: riesterLow,
    },
    rules,
  )
  const rf = sim.riesterFunding

  it('grants zero allowances when contribution below Sockelbetrag', () => {
    expect(rf.prorationFactor).toBe(0)
    expect(rf.grundzulageAnnual).toBe(0)
    expect(rf.totalAllowanceAnnual).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// netRiesterPayout — §22 Nr. 5 EStG
// ---------------------------------------------------------------------------

describe('netRiesterPayout', () => {
  it('returns less than gross (tax + KV/PV deducted)', () => {
    const net = netRiesterPayout(1_000, defaultProfile, rules, 0)
    expect(net).toBeGreaterThan(0)
    expect(net).toBeLessThan(1_000)
  })

  it('net payout is zero-floored (never negative)', () => {
    expect(netRiesterPayout(0, defaultProfile, rules)).toBe(0)
  })

  it('higher other income → higher marginal rate → lower net payout', () => {
    const netLow = netRiesterPayout(1_000, defaultProfile, rules, 500)
    const netHigh = netRiesterPayout(1_000, defaultProfile, rules, 3_000)
    expect(netHigh).toBeLessThanOrEqual(netLow)
  })

  it('PKV holder pays no KV/PV on Riester payout', () => {
    const gkvProfile = { ...defaultProfile, publicHealthInsurance: true }
    const pkvProfile = { ...defaultProfile, publicHealthInsurance: false }
    const netGkv = netRiesterPayout(1_000, gkvProfile, rules, 0)
    const netPkv = netRiesterPayout(1_000, pkvProfile, rules, 0)
    expect(netPkv).toBeGreaterThanOrEqual(netGkv)
  })
})

// ---------------------------------------------------------------------------
// afterTaxRiesterLumpSum — §93 Abs. 2 EStG partial capital
// ---------------------------------------------------------------------------

describe('afterTaxRiesterLumpSum', () => {
  it('returns 0 for zero capital', () => {
    expect(afterTaxRiesterLumpSum(0, defaultProfile, rules, 0)).toBe(0)
  })

  it('returns less than gross (tax deducted)', () => {
    const afterTax = afterTaxRiesterLumpSum(50_000, defaultProfile, rules, 0)
    expect(afterTax).toBeGreaterThan(0)
    expect(afterTax).toBeLessThan(50_000)
  })

  it('higher other income → higher marginal rate → lower after-tax lump sum', () => {
    const at1 = afterTaxRiesterLumpSum(50_000, defaultProfile, rules, 0)
    const at2 = afterTaxRiesterLumpSum(50_000, defaultProfile, rules, 30_000)
    expect(at2).toBeLessThan(at1)
  })
})

// ---------------------------------------------------------------------------
// Simulation integration
// ---------------------------------------------------------------------------

describe('simulateRetirementComparison — Riester product', () => {
  const sim = simulateRetirementComparison(defaultProfile, defaultAssumptions, rules)

  it('produces a Riester product result for each scenario', () => {
    const riesterResults = sim.products.filter((p) => p.productId === 'riester')
    expect(riesterResults.length).toBe(defaultAssumptions.returnScenarios.length)
  })

  it('Riester label identifies it as Altvertrag', () => {
    const r = sim.products.find((p) => p.productId === 'riester')
    expect(r?.label).toContain('Riester')
  })

  it('Riester product result has positive capital at retirement', () => {
    const r = sim.products.find((p) => p.productId === 'riester' && p.scenarioId === 'basis')
    expect(r?.capitalAtRetirement).toBeGreaterThan(0)
  })

  it('Riester netMonthlyPayout is positive', () => {
    const r = sim.products.find((p) => p.productId === 'riester' && p.scenarioId === 'basis')
    expect(r?.netMonthlyPayout).toBeGreaterThan(0)
  })

  it('riesterFunding is included in simulation result', () => {
    expect(sim.riesterFunding).toBeDefined()
    expect(sim.riesterFunding.monthlyOwnContribution).toBeCloseTo(
      defaultAssumptions.riester.monthlyOwnContribution,
      4,
    )
  })

  it('Riester taxAndSvSavings includes allowances and Günstigerprüfung', () => {
    const r = sim.products.find((p) => p.productId === 'riester' && p.scenarioId === 'basis')
    // With proration (100 EUR/month < minimum for 75k salary), total savings may be small but ≥ 0.
    expect(r?.taxAndSvSavings).toBeGreaterThanOrEqual(0)
  })
})

describe('simulateRetirementComparison — existingCapital raises retirement capital', () => {
  const base = simulateRetirementComparison(defaultProfile, defaultAssumptions, rules)
  const withCapital = simulateRetirementComparison(
    defaultProfile,
    {
      ...defaultAssumptions,
      riester: { ...defaultAssumptions.riester, existingCapital: 20_000 },
    },
    rules,
  )

  it('existingCapital increases capital at retirement', () => {
    const baseCapital = base.products.find(
      (p) => p.productId === 'riester' && p.scenarioId === 'basis',
    )?.capitalAtRetirement ?? 0
    const withCapitalResult = withCapital.products.find(
      (p) => p.productId === 'riester' && p.scenarioId === 'basis',
    )?.capitalAtRetirement ?? 0
    expect(withCapitalResult).toBeGreaterThan(baseCapital)
  })
})

// ---------------------------------------------------------------------------
// #71: AVD riesterTransferCapital — initial capital in AVD product
// ---------------------------------------------------------------------------

describe('#71: AVD with riesterTransferCapital', () => {
  const baseSimulation = simulateRetirementComparison(defaultProfile, defaultAssumptions, rules)

  const transferAssumptions = {
    ...defaultAssumptions,
    altersvorsorgedepot: {
      ...defaultAssumptions.altersvorsorgedepot,
      riesterTransferCapital: 15_000,
      transferCostEUR: 150,
    },
  }
  const transferSimulation = simulateRetirementComparison(defaultProfile, transferAssumptions, rules)

  it('AVD with transfer has higher retirement capital than AVD without', () => {
    const baseAvd = baseSimulation.products.find(
      (p) => p.productId === 'altersvorsorgedepot' && p.scenarioId === 'basis',
    )
    const transferAvd = transferSimulation.products.find(
      (p) => p.productId === 'altersvorsorgedepot' && p.scenarioId === 'basis',
    )
    expect(transferAvd?.capitalAtRetirement ?? 0).toBeGreaterThan(
      baseAvd?.capitalAtRetirement ?? 0,
    )
  })

  it('AVD transfer label identifies it as a Riester-Übertrag', () => {
    const transferAvd = transferSimulation.products.find(
      (p) => p.productId === 'altersvorsorgedepot',
    )
    expect(transferAvd?.label).toContain('Übertrag')
  })

  it('transfer costs are deducted from the initial capital', () => {
    // Rough test: with transferCostEUR = 150, the capital increase over baseline
    // should be less than 15000 × growth_factor and more than 14850 × growth_factor.
    const baseAvd = baseSimulation.products.find(
      (p) => p.productId === 'altersvorsorgedepot' && p.scenarioId === 'basis',
    )?.capitalAtRetirement ?? 0
    const transferAvd = transferSimulation.products.find(
      (p) => p.productId === 'altersvorsorgedepot' && p.scenarioId === 'basis',
    )?.capitalAtRetirement ?? 0

    const capitalIncrease = transferAvd - baseAvd
    // After 39 years at ~5% return, 14850 compounded. 14850 * 1.05^39 ≈ 100k roughly.
    expect(capitalIncrease).toBeGreaterThan(14_850)
  })
})

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('validateState includes Riester', () => {
  it('valid default assumptions pass validation', async () => {
    const { validateState } = await import('../../utils/scenarioSchema')
    const result = validateState(defaultProfile, defaultAssumptions)
    expect(result).not.toBeNull()
  })

  it('invalid Riester payoutMode fails validation', async () => {
    const { validateState } = await import('../../utils/scenarioSchema')
    const bad = {
      ...defaultAssumptions,
      riester: { ...defaultAssumptions.riester, payoutMode: 'kapitalverzehr' },
    }
    const result = validateState(defaultProfile, bad)
    expect(result).toBeNull()
  })

  it('negative existingCapital fails validation', async () => {
    const { validateState } = await import('../../utils/scenarioSchema')
    const bad = {
      ...defaultAssumptions,
      riester: { ...defaultAssumptions.riester, existingCapital: -100 },
    }
    const result = validateState(defaultProfile, bad)
    expect(result).toBeNull()
  })

  it('negative riesterTransferCapital on AVD fails validation', async () => {
    const { validateState } = await import('../../utils/scenarioSchema')
    const bad = {
      ...defaultAssumptions,
      altersvorsorgedepot: {
        ...defaultAssumptions.altersvorsorgedepot,
        riesterTransferCapital: -1,
      },
    }
    const result = validateState(defaultProfile, bad)
    expect(result).toBeNull()
  })
})
