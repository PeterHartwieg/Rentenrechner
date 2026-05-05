// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { lifecyclePickerLabel } from './lifecycleLabels'
import type { LifecycleSeriesResult } from './breakEvenSeries'

function lifecycleResult(productId: string, label: string): LifecycleSeriesResult {
  return {
    productId,
    label,
    rows: [],
    monthlyUserCost: 0,
    totalUserCost: 0,
    capitalAtRetirement: 0,
    grossMonthlyPayout: 0,
    netMonthlyPayout: 0,
  }
}

describe('lifecyclePickerLabel', () => {
  it('preserves grouped portfolio product labels with contract counts', () => {
    expect(lifecyclePickerLabel(lifecycleResult('bav', 'bAV (2 Verträge)'))).toBe(
      'bAV (2 Verträge)',
    )
  })

  it('uses compact product labels for regular compare-mode products', () => {
    expect(lifecyclePickerLabel(lifecycleResult('versicherung', 'Private Rentenversicherung'))).toBe(
      'Private Rente',
    )
  })
})
