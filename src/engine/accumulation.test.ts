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
