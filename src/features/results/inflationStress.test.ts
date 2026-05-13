import { describe, expect, it } from 'vitest'
import type { ProductResult } from '../../domain'
import { buildInflationStressRows } from './inflationStress'

const product = {
  productId: 'versicherung',
  label: 'Private Rentenversicherung',
  netMonthlyPayout: 1_000,
} as unknown as ProductResult

describe('buildInflationStressRows (#246)', () => {
  it('keeps nominal payouts and deflates real payouts from the retirement-year anchor', () => {
    const rows = buildInflationStressRows({
      products: [product],
      retirementAge: 67,
      retirementEndAge: 69,
      inflationRate: 0.03,
    })

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.age)).toEqual([67, 68, 69])
    expect(rows.map((row) => row['Private Rentenversicherung nominal'])).toEqual([
      1_000,
      1_000,
      1_000,
    ])
    expect(rows[0]['Private Rentenversicherung real']).toBeCloseTo(1_000, 8)
    expect(rows[1]['Private Rentenversicherung real']).toBeCloseTo(1_000 / 1.03, 8)
    expect(rows[2]['Private Rentenversicherung real']).toBeCloseTo(1_000 / 1.03 ** 2, 8)
  })

  it('zeroes out nominal and real payouts after payoutEndAge (Zeitrente)', () => {
    const zeitrente = {
      ...product,
      productId: 'bav',
      label: 'bAV Zeitrente',
      netMonthlyPayout: 800,
      payoutEndAge: 68,
    } as unknown as (typeof product)

    const rows = buildInflationStressRows({
      products: [zeitrente],
      retirementAge: 67,
      retirementEndAge: 70,
      inflationRate: 0.02,
    })

    expect(rows.map((row) => row['bAV Zeitrente nominal'])).toEqual([800, 800, 0, 0])
    expect(rows[0]['bAV Zeitrente real']).toBeCloseTo(800, 8)
    expect(rows[1]['bAV Zeitrente real']).toBeCloseTo(800 / 1.02, 8)
    expect(rows[2]['bAV Zeitrente real']).toBe(0)
    expect(rows[3]['bAV Zeitrente real']).toBe(0)
  })
})
