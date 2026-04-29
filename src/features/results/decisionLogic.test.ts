import { describe, expect, it } from 'vitest'
import type { ProductResult } from '../../domain'
import {
  biggestCostDriver,
  productReason,
  rankingsDisagree,
  sensitivityHint,
} from './decisionLogic'

// accumulationRiy is a decimal fraction (0.012 = 1.2 % p. a.).
function makeResult(overrides: Partial<ProductResult>): ProductResult {
  return {
    productId: 'etf',
    label: 'ETF-Depot',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    annualReturn: 0.05,
    monthlyUserCost: 100,
    monthlyProductContribution: 100,
    monthlyEmployerContribution: 0,
    totalUserCost: 12000,
    totalProductContributions: 12000,
    totalEmployerContributions: 0,
    totalFees: 100,
    capitalAtRetirement: 25000,
    realCapitalAtRetirement: 20000,
    afterTaxLumpSum: 22000,
    grossMonthlyPayout: 100,
    netMonthlyPayout: 80,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: 1.8,
    capitalMultipleAnnualized: 1.05,
    accumulationRiy: 0.003,
    rows: [],
    etfPayoutRows: [],
    ...overrides,
  } as ProductResult
}

describe('productReason', () => {
  it('flags ETF low_fees when RIY is below 0.6 % p. a.', () => {
    const r = makeResult({ productId: 'etf', accumulationRiy: 0.004 })
    expect(productReason(r).kind).toBe('low_fees')
  })

  it('flags ETF flexible_capital when RIY is high', () => {
    const r = makeResult({ productId: 'etf', accumulationRiy: 0.015 })
    expect(productReason(r).kind).toBe('flexible_capital')
  })

  it('flags bAV employer_subsidy when employer share >= 20 %', () => {
    const r = makeResult({
      productId: 'bav',
      totalProductContributions: 10000,
      totalEmployerContributions: 3000,
      accumulationRiy: 0.005,
    })
    expect(productReason(r).kind).toBe('employer_subsidy')
  })

  it('flags bAV high_fees when employer share is small but RIY is high', () => {
    const r = makeResult({
      productId: 'bav',
      totalProductContributions: 10000,
      totalEmployerContributions: 500,
      accumulationRiy: 0.015,
    })
    expect(productReason(r).kind).toBe('high_fees')
  })

  it('falls back to bAV tax_deferral when neither subsidy nor high fees', () => {
    const r = makeResult({
      productId: 'bav',
      totalProductContributions: 10000,
      totalEmployerContributions: 500,
      accumulationRiy: 0.004,
    })
    expect(productReason(r).kind).toBe('tax_deferral')
  })

  it('flags insurance high_fees when RIY exceeds threshold', () => {
    const r = makeResult({ productId: 'versicherung', accumulationRiy: 0.015 })
    expect(productReason(r).kind).toBe('high_fees')
  })

  it('falls back to insurance guarantee otherwise', () => {
    const r = makeResult({ productId: 'versicherung', accumulationRiy: 0.008 })
    expect(productReason(r).kind).toBe('guarantee')
  })

  it('flags Basisrente tax_deferral by default', () => {
    const r = makeResult({ productId: 'basisrente', accumulationRiy: 0.005 })
    expect(productReason(r).kind).toBe('tax_deferral')
  })

  it('flags AVD subsidies', () => {
    const r = makeResult({ productId: 'altersvorsorgedepot', accumulationRiy: 0.005 })
    expect(productReason(r).kind).toBe('subsidies')
  })

  it('flags Riester subsidies', () => {
    const r = makeResult({ productId: 'riester', accumulationRiy: 0.005 })
    expect(productReason(r).kind).toBe('subsidies')
  })
})

describe('biggestCostDriver', () => {
  it('returns the highest-RIY product among the inputs', () => {
    const a = makeResult({ productId: 'etf', accumulationRiy: 0.003 })
    const b = makeResult({ productId: 'versicherung', label: 'pAV', accumulationRiy: 0.014 })
    const c = makeResult({ productId: 'bav', label: 'bAV', accumulationRiy: 0.008 })
    const driver = biggestCostDriver([a, b, c])
    expect(driver?.productId).toBe('versicherung')
    expect(driver?.riyDecimal).toBe(0.014)
  })

  it('returns undefined when the list is empty', () => {
    expect(biggestCostDriver([])).toBeUndefined()
  })

  it('returns undefined when all RIYs are zero', () => {
    const a = makeResult({ accumulationRiy: 0 })
    expect(biggestCostDriver([a])).toBeUndefined()
  })
})

describe('sensitivityHint', () => {
  it('flags rankings_disagree when capital and pension winners differ', () => {
    const etf = makeResult({
      productId: 'etf',
      label: 'ETF',
      afterTaxLumpSum: 100_000,
      netMonthlyPayout: 600,
    })
    const bav = makeResult({
      productId: 'bav',
      label: 'bAV',
      afterTaxLumpSum: 80_000,
      netMonthlyPayout: 900,
    })
    expect(sensitivityHint([etf, bav]).kind).toBe('rankings_disagree')
  })

  it('flags narrow_capital_gap when winner is within 5 % of runner-up', () => {
    const etf = makeResult({
      productId: 'etf',
      label: 'ETF',
      afterTaxLumpSum: 100_000,
      netMonthlyPayout: 900,
    })
    const bav = makeResult({
      productId: 'bav',
      label: 'bAV',
      afterTaxLumpSum: 98_000,
      netMonthlyPayout: 800,
    })
    expect(sensitivityHint([etf, bav]).kind).toBe('narrow_capital_gap')
  })

  it('flags high_fee_winner when winner has high RIY and clear lead', () => {
    const insurance = makeResult({
      productId: 'versicherung',
      label: 'pAV',
      afterTaxLumpSum: 100_000,
      netMonthlyPayout: 900,
      accumulationRiy: 0.016,
    })
    const etf = makeResult({
      productId: 'etf',
      label: 'ETF',
      afterTaxLumpSum: 80_000,
      netMonthlyPayout: 700,
      accumulationRiy: 0.003,
    })
    expect(sensitivityHint([insurance, etf]).kind).toBe('high_fee_winner')
  })

  it('returns default hint when no special condition fires', () => {
    const a = makeResult({
      productId: 'etf',
      label: 'ETF',
      afterTaxLumpSum: 100_000,
      netMonthlyPayout: 900,
      accumulationRiy: 0.003,
    })
    const b = makeResult({
      productId: 'bav',
      label: 'bAV',
      afterTaxLumpSum: 80_000,
      netMonthlyPayout: 700,
      accumulationRiy: 0.005,
    })
    expect(sensitivityHint([a, b]).kind).toBe('default')
  })

  it('returns default hint when fewer than 2 results', () => {
    const a = makeResult({})
    expect(sensitivityHint([a]).kind).toBe('default')
    expect(sensitivityHint([]).kind).toBe('default')
  })
})

describe('rankingsDisagree', () => {
  it('returns false when both winners are the same product', () => {
    const r = makeResult({ productId: 'bav' })
    expect(rankingsDisagree(r, r)).toBe(false)
  })

  it('returns true when winners differ', () => {
    const a = makeResult({ productId: 'etf' })
    const b = makeResult({ productId: 'bav' })
    expect(rankingsDisagree(a, b)).toBe(true)
  })

  it('returns false when either side is missing', () => {
    const a = makeResult({ productId: 'etf' })
    expect(rankingsDisagree(a, undefined)).toBe(false)
    expect(rankingsDisagree(undefined, a)).toBe(false)
    expect(rankingsDisagree(undefined, undefined)).toBe(false)
  })
})
