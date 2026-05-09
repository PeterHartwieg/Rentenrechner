// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { BreakEvenChart } from './BreakEvenChart'
import { lifecyclePickerLabel } from './lifecycleLabels'
import type { LifecycleSeriesResult } from './breakEvenSeries'
import { formatCurrency } from '../../utils/format'

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
// BreakEvenChart accessible table
// ---------------------------------------------------------------------------

describe('BreakEvenChart – accessible data table', () => {
  const minimalEtfForA11y: LifecycleSeriesResult = {
    productId: 'etf',
    label: 'ETF',
    rows: [{ age: 40, balance: 1000 }],
    monthlyUserCost: 200,
    totalUserCost: 48_000,
    capitalAtRetirement: 100_000,
    grossMonthlyPayout: 1000,
    netMonthlyPayout: 900,
  }
  const colors: Record<string, string> = { etf: '#3b82f6' }

  it('renders a visually-hidden table with the sr-only class', () => {
    const { container } = render(
      <BreakEvenChart
        selectedResults={[minimalEtfForA11y]}
        productColors={colors}
        startAge={40}
        retirementAge={67}
        retirementEndAge={85}
      />,
    )
    const table = container.querySelector('table.sr-only')
    expect(table).not.toBeNull()
  })

  it('accessible table has a caption describing lifecycle data', () => {
    const { container } = render(
      <BreakEvenChart
        selectedResults={[minimalEtfForA11y]}
        productColors={colors}
        startAge={40}
        retirementAge={67}
        retirementEndAge={85}
      />,
    )
    const caption = container.querySelector('table.sr-only caption')
    expect(caption).not.toBeNull()
    expect(caption!.textContent).toContain('Netto-Einzahlungen')
  })

  it('accessible table contains column headers for key lifecycle metrics', () => {
    const { container } = render(
      <BreakEvenChart
        selectedResults={[minimalEtfForA11y]}
        productColors={colors}
        startAge={40}
        retirementAge={67}
        retirementEndAge={85}
      />,
    )
    const table = container.querySelector('table.sr-only')!
    const headers = Array.from(table.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers.some((h) => h?.includes('Netto eingezahlt'))).toBe(true)
    expect(headers.some((h) => h?.includes('Netto ausgezahlt'))).toBe(true)
    expect(headers.some((h) => h?.includes('Break-Even'))).toBe(true)
  })

  it('accessible table contains a row for the ETF product with formatted total user cost', () => {
    const { container } = render(
      <BreakEvenChart
        selectedResults={[minimalEtfForA11y]}
        productColors={colors}
        startAge={40}
        retirementAge={67}
        retirementEndAge={85}
      />,
    )
    const table = container.querySelector('table.sr-only')!
    const rows = Array.from(table.querySelectorAll('tbody tr'))
    // Expect at least the benchmark row + one product row
    expect(rows.length).toBeGreaterThanOrEqual(2)
    // The product row should include the formatted total user cost
    const productRow = rows.find((r) => r.textContent?.includes('ETF'))
    expect(productRow).not.toBeUndefined()
    expect(productRow!.textContent).toContain(formatCurrency(minimalEtfForA11y.totalUserCost, 0))
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
