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
})
