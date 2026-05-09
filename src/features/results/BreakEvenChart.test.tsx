// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { BreakEvenChart } from './BreakEvenChart'
import { lifecyclePickerLabel } from './lifecycleLabels'
import type { LifecycleSeriesResult } from './breakEvenSeries'

afterEach(() => {
  cleanup()
})

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

// ---------------------------------------------------------------------------
// BreakEvenChart GRV contribution series
// ---------------------------------------------------------------------------

const minimalEtfResult: LifecycleSeriesResult = {
  productId: 'etf',
  label: 'ETF',
  rows: [{ age: 40, balance: 1000 }],
  monthlyUserCost: 200,
  totalUserCost: 48_000,
  capitalAtRetirement: 100_000,
  grossMonthlyPayout: 1000,
  netMonthlyPayout: 900,
}

const PRODUCT_COLORS: Record<string, string> = { etf: '#3b82f6' }

const sampleGrvContribTimeline = [
  { ageYears: 40, employeeAnnualEUR: 5_580 },
  { ageYears: 41, employeeAnnualEUR: 5_580 },
  { ageYears: 42, employeeAnnualEUR: 5_580 },
]

describe('BreakEvenChart – GRV contribution series', () => {
  it('renders the GRV contribution legend entry when grvContributionTimeline is non-empty', () => {
    const { getByText } = render(
      <BreakEvenChart
        selectedResults={[minimalEtfResult]}
        productColors={PRODUCT_COLORS}
        startAge={40}
        retirementAge={67}
        retirementEndAge={85}
        pensionBaselineType="grv"
        grvContributionTimeline={sampleGrvContribTimeline}
      />,
    )
    expect(getByText('GRV Netto-Einzahlung kumuliert')).toBeTruthy()
  })

  it('does not render the GRV contribution legend entry when grvContributionTimeline is empty', () => {
    const { queryByText } = render(
      <BreakEvenChart
        selectedResults={[minimalEtfResult]}
        productColors={PRODUCT_COLORS}
        startAge={40}
        retirementAge={67}
        retirementEndAge={85}
        pensionBaselineType="grv"
        grvContributionTimeline={[]}
      />,
    )
    expect(queryByText('GRV Netto-Einzahlung kumuliert')).toBeNull()
  })

  it('does not render the GRV contribution series when grvContributionTimeline is absent', () => {
    const { queryByText } = render(
      <BreakEvenChart
        selectedResults={[minimalEtfResult]}
        productColors={PRODUCT_COLORS}
        startAge={40}
        retirementAge={67}
        retirementEndAge={85}
        pensionBaselineType="versorgungswerk"
      />,
    )
    expect(queryByText('GRV Netto-Einzahlung kumuliert')).toBeNull()
  })
})
