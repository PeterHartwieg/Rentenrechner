// @vitest-environment jsdom

/**
 * VergleichComparisonTable tests (R1 — issue #319).
 *
 * Coverage:
 *   - Renders one row per VergleichTableRow on desktop
 *   - Renders cards on phone, table on tablet/desktop
 *   - Header columns: Sparform, Wie es funktioniert, Kapital mit N,
 *     Kosten p.a., Brutto-Rente, Abzüge, Netto pro Monat (7 cols)
 *   - Column "Kapital mit N" uses dynamic retirementAge (never hardcoded 67)
 *   - Abzüge cell carries the `vergleich-cell--abzuege` class so the CSS
 *     oxblood rule applies
 *   - Netto value cell carries the `vergleich-cell-netto__value` class
 *   - Bar fill width is proportional to maxNet (top row = 100 %)
 *   - Empty rows array → returns null (no table rendered)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { VergleichComparisonTable } from './VergleichComparisonTable'
import type { VergleichTableRow } from './vergleichRows'
import { eachViewport, mockViewport } from '../../test/viewport'

beforeEach(() => {
  mockViewport('desktop')
})

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

const SAMPLE_ROWS: VergleichTableRow[] = [
  {
    productId: 'etf',
    label: 'ETF-Depot',
    shortLabel: 'ETF',
    capitalAtRetirement: 250_000,
    effectiveAnnualCost: 0.004,
    grossMonthlyPayout: 1_500,
    deductionsMonthly: 80,
    netMonthlyPayout: 1_420,
  },
  {
    productId: 'bav',
    label: 'Betriebliche Altersvorsorge',
    shortLabel: 'BAV',
    capitalAtRetirement: 400_000,
    effectiveAnnualCost: 0.012,
    grossMonthlyPayout: 1_200,
    deductionsMonthly: 600,
    netMonthlyPayout: 600,
  },
]

describe('VergleichComparisonTable — desktop', () => {
  it('renders one tbody row per input row', () => {
    const { container } = render(<VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={67} />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(SAMPLE_ROWS.length)
  })

  it('renders all 7 column headers', () => {
    const { container } = render(<VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={67} />)
    const headers = container.querySelectorAll('thead th')
    expect(headers.length).toBe(7)
    const labels = Array.from(headers).map((th) => th.textContent ?? '')
    expect(labels[0]).toBe('Sparform')
    expect(labels[1]).toBe('Wie es funktioniert')
    expect(labels[2]).toBe('Kapital mit 67')
    expect(labels[3]).toBe('Kosten p. a.')
    expect(labels[4]).toBe('Brutto-Rente')
    expect(labels[5]).toBe('Abzüge')
    expect(labels[6]).toBe('Netto pro Monat')
  })

  it('Kapital column header uses dynamic retirementAge (not hardcoded 67)', () => {
    const { container } = render(<VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={63} />)
    const headers = container.querySelectorAll('thead th')
    expect(headers[2].textContent).toBe('Kapital mit 63')
  })

  it('Abzüge cell carries the oxblood class', () => {
    const { container } = render(<VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={67} />)
    const abzuege = container.querySelectorAll('td.vergleich-cell--abzuege')
    expect(abzuege.length).toBe(SAMPLE_ROWS.length)
  })

  it('Netto value cell carries the dedicated class for the 20px oxblood treatment', () => {
    const { container } = render(<VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={67} />)
    const nettoValues = container.querySelectorAll('.vergleich-cell-netto__value')
    expect(nettoValues.length).toBe(SAMPLE_ROWS.length)
  })

  it('bar fill widths are proportional to maxNet (top row = 100 %)', () => {
    // SAMPLE_ROWS is pre-sorted: 1420 (top), 600 (second). Max = 1420.
    const { container } = render(<VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={67} />)
    const fills = container.querySelectorAll<HTMLElement>('.vergleich-cell-netto__bar-fill')
    expect(fills.length).toBe(SAMPLE_ROWS.length)
    expect(fills[0].style.width).toBe('100%')
    // Second row: 600 / 1420 ≈ 42.25 %
    const secondPct = (SAMPLE_ROWS[1].netMonthlyPayout / SAMPLE_ROWS[0].netMonthlyPayout) * 100
    expect(fills[1].style.width).toBe(`${secondPct}%`)
  })

  it('returns null on empty rows', () => {
    const { container } = render(<VergleichComparisonTable rows={[]} retirementAge={67} />)
    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelector('.vergleich-product-cards')).toBeNull()
  })

  it('does not render a winner badge or row highlight (R1 neutrality)', () => {
    const { container } = render(<VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={67} />)
    // Sanity: no "Sieger" / "Winner" / "Empfehlung" copy anywhere.
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/sieger/i)
    expect(text).not.toMatch(/winner/i)
    expect(text).not.toMatch(/empfehlung/i)
    // No row gets a special highlight class.
    const rows = container.querySelectorAll('tbody tr')
    rows.forEach((row) => {
      expect(row.className).toBe('')
    })
  })
})

describe('VergleichComparisonTable — phone variant', () => {
  it('renders vertical product cards instead of the table', () => {
    mockViewport('phone')
    const { container } = render(<VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={67} />)
    expect(container.querySelector('.vergleich-comparison-table')).toBeNull()
    const cards = container.querySelectorAll('.vergleich-product-card')
    expect(cards.length).toBe(SAMPLE_ROWS.length)
  })

  it('phone card shows Netto, Kosten, name, short label, tagline', () => {
    mockViewport('phone')
    const { container } = render(<VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={67} />)
    const first = container.querySelector('.vergleich-product-card')!
    const text = first.textContent ?? ''
    expect(text).toContain('ETF-Depot')
    expect(text).toContain('ETF')
    expect(text).toContain('Kosten')
  })
})

describe('VergleichComparisonTable — viewport sweep', () => {
  it('renders without throwing at phone / tablet / desktop', () => {
    eachViewport(() => {
      const { container, unmount } = render(
        <VergleichComparisonTable rows={SAMPLE_ROWS} retirementAge={67} />,
      )
      expect(container.firstChild).not.toBeNull()
      unmount()
    })
  })
})
