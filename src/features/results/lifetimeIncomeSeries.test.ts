import { describe, expect, it } from 'vitest'
import type { ProductResult } from '../../domain'
import { buildLifetimeIncomeSeries } from './lifetimeIncomeSeries'

function makeProduct(overrides: Partial<ProductResult>): ProductResult {
  return {
    productId: 'etf',
    label: 'ETF',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    annualReturn: 0.05,
    monthlyUserCost: 200,
    monthlyProductContribution: 200,
    monthlyEmployerContribution: 0,
    totalUserCost: 72_000,
    totalProductContributions: 72_000,
    totalContributionsBeforeFees: 72_000,
    totalEmployerContributions: 0,
    totalFees: 1_000,
    capitalAtRetirement: 100_000,
    realCapitalAtRetirement: 80_000,
    afterTaxLumpSum: null,
    grossMonthlyPayout: 1_000,
    netMonthlyPayout: 800,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: null,
    capitalMultipleAnnualized: 0,
    accumulationRiy: 0,
    rows: [],
    ...overrides,
  } as unknown as ProductResult
}

describe('buildLifetimeIncomeSeries (#242)', () => {
  it('accumulates net retirement payouts through age 95 using etfPayoutRows (lump sum excluded)', () => {
    const result = makeProduct({
      productId: 'etf',
      label: 'ETF',
      afterTaxLumpSum: 12_000,
      netMonthlyPayout: 999,
      etfPayoutRows: [
        { age: 67, netAnnualPayout: 10_000 },
        { age: 68, netAnnualPayout: 11_000 },
        { age: 69, netAnnualPayout: 12_000 },
      ],
    } as Partial<ProductResult>)

    const series = buildLifetimeIncomeSeries([result], {
      retirementAge: 67,
      horizonAge: 95,
    })

    expect(series).toHaveLength(29)
    expect(series[0]).toMatchObject({
      age: 67,
      etf: 10_000,
    })
    expect(series[1]).toMatchObject({
      age: 68,
      etf: 21_000,
    })
    expect(series[2]).toMatchObject({
      age: 69,
      etf: 33_000,
    })
    expect(series.at(-1)).toMatchObject({
      age: 95,
      etf: 33_000,
    })
  })

  it('stops accruing after payoutEndAge for finite payout modes (Zeitrente / Kapitalverzehr)', () => {
    const result = makeProduct({
      productId: 'bav',
      label: 'bAV',
      netMonthlyPayout: 500,
      payoutEndAge: 82,
    } as Partial<ProductResult>)

    const series = buildLifetimeIncomeSeries([result], {
      retirementAge: 67,
      horizonAge: 85,
    })

    // payoutEndAge=82 is exclusive: last payout at age 81, so 67..81 = 15 years
    const expectedAtEnd = 15 * 500 * 12
    expect(series.find((p) => p.age === 81)?.bav).toBe(expectedAtEnd)
    expect(series.find((p) => p.age === 82)?.bav).toBe(expectedAtEnd)
    expect(series.at(-1)?.bav).toBe(expectedAtEnd)
  })

  it('uses monthly net payout for lifelong products without payout rows', () => {
    const result = makeProduct({
      productId: 'basisrente',
      label: 'Basisrente',
      netMonthlyPayout: 500,
      afterTaxLumpSum: null,
    } as Partial<ProductResult>)

    const series = buildLifetimeIncomeSeries([result], {
      retirementAge: 67,
      horizonAge: 69,
    })

    expect(series).toEqual([
      { age: 67, basisrente: 6_000 },
      { age: 68, basisrente: 12_000 },
      { age: 69, basisrente: 18_000 },
    ])
  })
})
