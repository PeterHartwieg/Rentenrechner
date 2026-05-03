import { describe, expect, it } from 'vitest'
import { projectAccumulation } from './accumulation'
import type { ReturnScenario } from '../domain'

const baseScenario: ReturnScenario = {
  id: 'basis',
  label: 'Basis',
  annualReturn: 0.05,
}

const zeroFees = {
  wrapperAssetFee: 0,
  fundAssetFee: 0,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 1,
  pensionPayoutFeePct: 0,
}

function baseInput(monthlyContribution: number, years: number) {
  return {
    productId: 'etf' as const,
    currentAge: 30,
    months: years * 12,
    monthlyUserCost: monthlyContribution,
    monthlyProductContribution: monthlyContribution,
    monthlyEmployerContribution: 0,
    annualReturn: 0.05,
    inflationRate: 0,
    scenario: baseScenario,
    fees: zeroFees,
  }
}

describe('projectAccumulation contributionGrowth (Beitragsdynamik)', () => {
  it('matches static behavior when rate is 0', () => {
    const a = projectAccumulation(baseInput(300, 10))
    const b = projectAccumulation({
      ...baseInput(300, 10),
      policy: { contributionGrowth: { annualRate: 0 } },
    })
    expect(b.capital).toBeCloseTo(a.capital, 6)
    expect(b.totalProductContributions).toBeCloseTo(a.totalProductContributions, 6)
  })

  it('scales contributions geometrically: 2 % growth over 10y → cumulative ~9.5 % above static', () => {
    const r = 0.02
    const years = 10
    const monthly = 300
    const dyn = projectAccumulation({
      ...baseInput(monthly, years),
      policy: { contributionGrowth: { annualRate: r } },
    })
    const staticTotal = monthly * 12 * years
    // Closed-form: c × 12 × ((1+r)^Y - 1)/r
    const expected = monthly * 12 * (Math.pow(1 + r, years) - 1) / r
    expect(dyn.totalProductContributions).toBeCloseTo(expected, 4)
    expect(dyn.totalProductContributions).toBeGreaterThan(staticTotal * 1.09)
    expect(dyn.totalProductContributions).toBeLessThan(staticTotal * 1.10)
  })

  it('records growing yearly contribution amounts on yearly rows', () => {
    const result = projectAccumulation({
      ...baseInput(100, 3),
      policy: { contributionGrowth: { annualRate: 0.05 } },
    })
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].yearlyProductContribution).toBeCloseTo(1200, 4)
    expect(result.rows[1].yearlyProductContribution).toBeCloseTo(1200 * 1.05, 4)
    expect(result.rows[2].yearlyProductContribution).toBeCloseTo(1200 * 1.05 * 1.05, 4)
  })

  it('produces a higher final capital than the static case for positive growth', () => {
    const stat = projectAccumulation(baseInput(300, 30))
    const dyn = projectAccumulation({
      ...baseInput(300, 30),
      policy: { contributionGrowth: { annualRate: 0.02 } },
    })
    expect(dyn.capital).toBeGreaterThan(stat.capital)
  })

  it('expands acquisition costs to the geometric Beitragssumme', () => {
    const fees = {
      ...zeroFees,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
    }
    const stat = projectAccumulation({ ...baseInput(300, 30), fees })
    const dyn = projectAccumulation({
      ...baseInput(300, 30),
      fees,
      policy: { contributionGrowth: { annualRate: 0.02 } },
    })
    // Dynamic total fees should be larger because Beitragssumme grew (~80 % more
    // total premium over 30 years at 2 %/yr).
    expect(dyn.totalFees).toBeGreaterThan(stat.totalFees)
  })
})

// ---------------------------------------------------------------------------
// Issue 15 — capitalInjections / capitalWithdrawals / costBasisInjections
// ---------------------------------------------------------------------------

describe('projectAccumulation — capitalInjections (issue 15)', () => {
  it('year-1 injection equals adding the same amount to initialCapital', () => {
    const horizon = 10
    const withInitial = projectAccumulation({
      ...baseInput(0, horizon),
      policy: { initialCapital: 50_000 },
    })
    const withInjection = projectAccumulation({
      ...baseInput(0, horizon),
      policy: { capitalInjections: [{ year: 1, amount: 50_000 }] },
    })
    expect(withInjection.capital).toBeCloseTo(withInitial.capital, 6)
  })

  it('mid-horizon injection grows from year-of-injection onwards', () => {
    const horizon = 10
    const noInj = projectAccumulation(baseInput(200, horizon))
    const withInj = projectAccumulation({
      ...baseInput(200, horizon),
      policy: { capitalInjections: [{ year: 5, amount: 10_000 }] },
    })
    expect(withInj.capital).toBeGreaterThan(noInj.capital + 10_000)
    // Six years of compounding (start of year 5 through end of year 10) at 5 %.
    const expectedGrowth = 10_000 * Math.pow(1.05, 6)
    expect(withInj.capital - noInj.capital).toBeCloseTo(expectedGrowth, 0)
  })

  it('multiple same-year injections sum into the running capital', () => {
    const horizon = 5
    const single = projectAccumulation({
      ...baseInput(0, horizon),
      policy: { capitalInjections: [{ year: 2, amount: 30_000 }] },
    })
    const triple = projectAccumulation({
      ...baseInput(0, horizon),
      policy: {
        capitalInjections: [
          { year: 2, amount: 10_000 },
          { year: 2, amount: 10_000 },
          { year: 2, amount: 10_000 },
        ],
      },
    })
    expect(triple.capital).toBeCloseTo(single.capital, 6)
  })

  it('costBasisInjections increase totalContributionsBeforeFees by the injected principal', () => {
    const horizon = 10
    const withCB = projectAccumulation({
      ...baseInput(100, horizon),
      policy: {
        capitalInjections: [{ year: 3, amount: 20_000 }],
        costBasisInjections: [{ year: 3, amount: 20_000 }],
      },
    })
    const withoutCB = projectAccumulation({
      ...baseInput(100, horizon),
      policy: { capitalInjections: [{ year: 3, amount: 20_000 }] },
    })
    // Capital trajectory identical — capitalInjection alone moves the balance.
    expect(withCB.capital).toBeCloseTo(withoutCB.capital, 6)
    // Cost-basis tracker is bumped by the injected principal.
    expect(
      withCB.totalContributionsBeforeFees - withoutCB.totalContributionsBeforeFees,
    ).toBeCloseTo(20_000, 6)
  })

  it('no transfer arrays = no change to legacy oracle output (byte-identical)', () => {
    const horizon = 10
    const baseline = projectAccumulation({
      ...baseInput(200, horizon),
      policy: { initialCapital: 5_000 },
    })
    const withEmptyArrays = projectAccumulation({
      ...baseInput(200, horizon),
      policy: {
        initialCapital: 5_000,
        capitalInjections: [],
        capitalWithdrawals: [],
        costBasisInjections: [],
      },
    })
    expect(withEmptyArrays.capital).toBe(baseline.capital)
    expect(withEmptyArrays.totalContributionsBeforeFees).toBe(baseline.totalContributionsBeforeFees)
  })
})

describe('projectAccumulation — capitalWithdrawals (issue 15)', () => {
  it('mid-horizon withdrawal removes capital and reduces final balance accordingly', () => {
    const horizon = 10
    const baseline = projectAccumulation({
      ...baseInput(0, horizon),
      policy: { initialCapital: 100_000 },
    })
    const withW = projectAccumulation({
      ...baseInput(0, horizon),
      policy: {
        initialCapital: 100_000,
        capitalWithdrawals: [{ year: 5, amount: 20_000 }],
      },
    })
    // Withdrawal at start of year 5 → 6 years of compounding lost (years 5-10).
    const expectedLoss = 20_000 * Math.pow(1.05, 6)
    expect(baseline.capital - withW.capital).toBeCloseTo(expectedLoss, 0)
  })

  it('withdrawal larger than current capital clamps to zero (no negative balance)', () => {
    const horizon = 10
    const result = projectAccumulation({
      ...baseInput(0, horizon),
      policy: {
        initialCapital: 5_000,
        capitalWithdrawals: [{ year: 3, amount: 50_000 }],
      },
    })
    expect(result.capital).toBeGreaterThanOrEqual(0)
  })
})
