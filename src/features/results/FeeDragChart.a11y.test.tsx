// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { FeeDragChart } from './FeeDragChart'
import { formatCurrency } from '../../utils/format'

afterEach(() => {
  cleanup()
})

const minimalResults: Parameters<typeof FeeDragChart>[0]['selectedResults'] = [
  {
    productId: 'etf',
    label: 'ETF',
    netMonthlyPayout: 1_000,
    payoutEndAge: 90,
    totalFees: 20_000,
    totalUserCost: 80_000,
  },
  {
    productId: 'bav',
    label: 'bAV',
    netMonthlyPayout: 800,
    payoutEndAge: 85,
    totalFees: 30_000,
    totalUserCost: 70_000,
  },
]

const PRODUCT_COLORS: Record<string, string> = { etf: '#3b82f6', bav: '#f59e0b' }

describe('FeeDragChart – accessible data table', () => {
  it('renders a visually-hidden table with the sr-only class', () => {
    const { container } = render(
      <FeeDragChart
        selectedResults={minimalResults}
        productColors={PRODUCT_COLORS}
        retirementAge={67}
        retirementEndAge={85}
      />,
    )
    const table = container.querySelector('table.sr-only')
    expect(table).not.toBeNull()
  })

  it('accessible table has a caption describing fee data', () => {
    const { container } = render(
      <FeeDragChart
        selectedResults={minimalResults}
        productColors={PRODUCT_COLORS}
        retirementAge={67}
        retirementEndAge={85}
      />,
    )
    const caption = container.querySelector('table.sr-only caption')
    expect(caption).not.toBeNull()
    expect(caption!.textContent).toContain('Gebühren')
  })

  it('accessible table contains column headers for the three fee-drag values', () => {
    const { container } = render(
      <FeeDragChart
        selectedResults={minimalResults}
        productColors={PRODUCT_COLORS}
        retirementAge={67}
        retirementEndAge={85}
      />,
    )
    const table = container.querySelector('table.sr-only')!
    const headers = Array.from(table.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers.some((h) => h?.includes('Nettoaufwand'))).toBe(true)
    expect(headers.some((h) => h?.includes('Netto-Rendite'))).toBe(true)
    expect(headers.some((h) => h?.includes('Gebühren'))).toBe(true)
  })

  it('accessible table has one row per product with formatted currency values', () => {
    const { container } = render(
      <FeeDragChart
        selectedResults={minimalResults}
        productColors={PRODUCT_COLORS}
        retirementAge={67}
        retirementEndAge={85}
      />,
    )
    const table = container.querySelector('table.sr-only')!
    const rows = Array.from(table.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(minimalResults.length)

    // ETF row should contain the formatted fee value
    const etfRow = rows.find((r) => r.textContent?.includes('ETF'))
    expect(etfRow).not.toBeUndefined()
    expect(etfRow!.textContent).toContain(formatCurrency(20_000, 0))
  })

  it('accessible table has aria-label', () => {
    const { container } = render(
      <FeeDragChart
        selectedResults={minimalResults}
        productColors={PRODUCT_COLORS}
        retirementAge={67}
        retirementEndAge={85}
      />,
    )
    const table = container.querySelector('table.sr-only')!
    expect(table.getAttribute('aria-label')).toBeTruthy()
  })
})
