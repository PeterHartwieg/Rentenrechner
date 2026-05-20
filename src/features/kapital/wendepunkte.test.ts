import { describe, expect, it } from 'vitest'
import { buildWendepunkte } from './wendepunkte'
import {
  buildLifecycleLineSeries,
  type LifecycleSeriesResult,
} from '../results/breakEvenSeries'

function lifecycleResult(
  productId: string,
  partial: Partial<LifecycleSeriesResult> = {},
): LifecycleSeriesResult {
  return {
    productId,
    label: productId,
    rows: [],
    monthlyUserCost: 0,
    totalUserCost: 0,
    capitalAtRetirement: 0,
    grossMonthlyPayout: 0,
    netMonthlyPayout: 0,
    ...partial,
  }
}

describe('buildWendepunkte', () => {
  it('returns the four canonical rows in stable order', () => {
    const r = lifecycleResult('etf', {
      monthlyUserCost: 200,
      totalUserCost: 200 * 12 * 30,
      capitalAtRetirement: 100_000,
      grossMonthlyPayout: 1000,
      netMonthlyPayout: 800,
      // 30 yearly balance rows ramping linearly to capitalAtRetirement
      rows: Array.from({ length: 30 }, (_, i) => ({
        age: 31 + i,
        balance: 100_000 * ((i + 1) / 30),
      })),
    })
    const data = buildLifecycleLineSeries([r], 30, 60, 85)
    const rows = buildWendepunkte({
      selectedResults: [r],
      data,
      startAge: 30,
      retirementAge: 60,
      retirementEndAge: 85,
    })
    expect(rows.map((row) => row.kind)).toEqual([
      'halbzeit-anspar',
      'renteneintritt',
      'break-even',
      'modell-ende',
    ])
  })

  it('places Halbzeit at the midpoint between start and retirement', () => {
    const r = lifecycleResult('etf', {
      rows: [{ age: 45, balance: 25_000 }],
      monthlyUserCost: 100,
      totalUserCost: 100 * 12 * 30,
    })
    const data = buildLifecycleLineSeries([r], 30, 60, 85)
    const rows = buildWendepunkte({
      selectedResults: [r],
      data,
      startAge: 30,
      retirementAge: 60,
      retirementEndAge: 85,
    })
    const halbzeit = rows.find((row) => row.kind === 'halbzeit-anspar')
    expect(halbzeit?.age).toBe(45)
  })

  it('puts Renteneintritt exactly at retirementAge', () => {
    const r = lifecycleResult('etf', {
      monthlyUserCost: 100,
      totalUserCost: 100 * 12 * 30,
    })
    const data = buildLifecycleLineSeries([r], 30, 67, 85)
    const rows = buildWendepunkte({
      selectedResults: [r],
      data,
      startAge: 30,
      retirementAge: 67,
      retirementEndAge: 85,
    })
    expect(rows.find((row) => row.kind === 'renteneintritt')?.age).toBe(67)
  })

  it('puts Modell-Ende exactly at retirementEndAge', () => {
    const r = lifecycleResult('etf', {
      monthlyUserCost: 100,
      totalUserCost: 100 * 12 * 30,
    })
    const data = buildLifecycleLineSeries([r], 30, 67, 85)
    const rows = buildWendepunkte({
      selectedResults: [r],
      data,
      startAge: 30,
      retirementAge: 67,
      retirementEndAge: 85,
    })
    expect(rows.find((row) => row.kind === 'modell-ende')?.age).toBe(85)
  })

  it('reports null break-even age when payouts never reach paid-in within the window', () => {
    // Very low payouts that never overtake contributions — payout rate is
    // 1 EUR/year net, contributions are 100 EUR/month for 30 years.
    const r = lifecycleResult('etf', {
      monthlyUserCost: 100,
      totalUserCost: 100 * 12 * 30,
      grossMonthlyPayout: 1,
      netMonthlyPayout: 1,
      capitalAtRetirement: 36_000,
    })
    const data = buildLifecycleLineSeries([r], 30, 60, 65)
    const rows = buildWendepunkte({
      selectedResults: [r],
      data,
      startAge: 30,
      retirementAge: 60,
      retirementEndAge: 65,
    })
    expect(rows.find((row) => row.kind === 'break-even')?.age).toBeNull()
  })

  it('returns an empty array when selectedResults is empty', () => {
    // Page-level filter could narrow to zero results (e.g. user picks a
    // product category that has no instances). Render an empty table rather
    // than dividing by zero.
    expect(
      buildWendepunkte({
        selectedResults: [],
        data: [],
        startAge: 30,
        retirementAge: 60,
        retirementEndAge: 85,
      }),
    ).toEqual([])
  })

  it('aggregates capital/paid-in/payout across multiple selected results', () => {
    const r1 = lifecycleResult('etf', {
      monthlyUserCost: 100,
      totalUserCost: 100 * 12 * 10,
      capitalAtRetirement: 15_000,
      grossMonthlyPayout: 100,
      netMonthlyPayout: 80,
    })
    const r2 = lifecycleResult('versicherung', {
      monthlyUserCost: 50,
      totalUserCost: 50 * 12 * 10,
      capitalAtRetirement: 8_000,
      grossMonthlyPayout: 80,
      netMonthlyPayout: 60,
    })
    const data = buildLifecycleLineSeries([r1, r2], 30, 40, 60)
    const rows = buildWendepunkte({
      selectedResults: [r1, r2],
      data,
      startAge: 30,
      retirementAge: 40,
      retirementEndAge: 60,
    })
    const renteneintritt = rows.find((row) => row.kind === 'renteneintritt')
    // At retirementAge, paidIn = sum of both monthlyUserCost * 12 * 10
    // = (100 + 50) * 120 = 18000
    expect(renteneintritt?.paidIn).toBe(18_000)
  })
})
