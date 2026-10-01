import { describe, expect, it } from 'vitest'
import type { ProductResult } from '../../domain/results'
import { rowFromResult } from './vergleichRows'

// `rowFromResult` routes the cost column through `availableRiy`: a legacy
// zero RIY next to charged fees (initial-capital projections) must not reach
// the table as "0,00 %", while a genuine zero-fee product keeps its 0.

function makeResult(overrides: Partial<ProductResult> = {}): ProductResult {
  return {
    productId: 'etf',
    label: 'ETF',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    annualReturn: 0.05,
    monthlyUserCost: 200,
    monthlyProductContribution: 200,
    monthlyEmployerContribution: 0,
    totalUserCost: 60_000,
    totalProductContributions: 60_000,
    totalEmployerContributions: 0,
    totalFees: 5_000,
    capitalAtRetirement: 120_000,
    realCapitalAtRetirement: 90_000,
    afterTaxLumpSum: 100_000,
    grossMonthlyPayout: 500,
    netMonthlyPayout: 400,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: 1.5,
    capitalMultipleAnnualized: 0.04,
    accumulationRiy: 0.012,
    rows: [],
    ...overrides,
  } as unknown as ProductResult
}

describe('rowFromResult — cost column availability', () => {
  it('forwards a positive RIY unchanged', () => {
    expect(rowFromResult(makeResult())!.effectiveAnnualCost).toBe(0.012)
  })

  it('marks a zero RIY with positive fees as unavailable', () => {
    const row = rowFromResult(makeResult({ accumulationRiy: 0, totalFees: 5_000 }))
    expect(row!.effectiveAnnualCost).toBeUndefined()
  })

  it('keeps a genuine zero for a fee-free product', () => {
    const row = rowFromResult(makeResult({ accumulationRiy: 0, totalFees: 0 }))
    expect(row!.effectiveAnnualCost).toBe(0)
  })
})
