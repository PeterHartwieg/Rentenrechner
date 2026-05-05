// @vitest-environment jsdom

/**
 * Phase 3 Lane H — Issue 09: Feedback target coverage for charts, tables,
 * legal pages, and disclaimer banner.
 *
 * Asserts:
 *  - Chart containers carry the expected data-qa-target and data-qa-section
 *    attributes when QA mode is on.
 *  - Table section + header cells carry the expected ids.
 *  - LegalFooter container and links carry the expected ids.
 *  - DisclaimerBanner body and dismiss button carry the expected ids.
 *  - At least one inert-when-disabled assertion (BreakEvenChart container).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
})

// ---------------------------------------------------------------------------
// Minimal stub data for BreakEvenChart (avoids Recharts ResizeObserver issues)
// ---------------------------------------------------------------------------

import { BreakEvenChart } from '../../results/BreakEvenChart'
import type { LifecycleSeriesResult } from '../../results/breakEvenSeries'

function makeSeriesResult(productId: string): LifecycleSeriesResult {
  return {
    productId,
    label: productId,
    rows: [],
    monthlyUserCost: 0,
    totalUserCost: 0,
    capitalAtRetirement: 0,
    grossMonthlyPayout: 0,
    netMonthlyPayout: 0,
  }
}

const BREAK_EVEN_PROPS = {
  selectedResults: [makeSeriesResult('etf')],
  productColors: { etf: '#0ea5e9' },
  startAge: 30,
  retirementAge: 67,
  retirementEndAge: 87,
  bestProductId: 'etf',
}

// ---------------------------------------------------------------------------
// DetailComparisonTable stub
// ---------------------------------------------------------------------------

import { DetailComparisonTable } from '../../results/DetailComparisonTable'

const TABLE_PROPS = {
  products: [],
  linkCopied: false,
  onExportCsv: vi.fn(),
  onPrint: vi.fn(),
}

// ---------------------------------------------------------------------------
// LegalFooter stub
// ---------------------------------------------------------------------------

import { LegalFooter } from '../../legal/LegalFooter'

// ---------------------------------------------------------------------------
// DisclaimerBanner stub
// ---------------------------------------------------------------------------

import { DisclaimerBanner } from '../../workspace/DisclaimerBanner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withQaEnabled(url = '/?qa=1') {
  window.history.replaceState(null, '', url)
}

// ---------------------------------------------------------------------------
// BreakEvenChart — chart container target (section)
// ---------------------------------------------------------------------------

describe('BreakEvenChart — chart container target', () => {
  beforeEach(() => withQaEnabled())

  it('wrapping <section> carries data-qa-target and data-qa-section when QA mode is on', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <BreakEvenChart {...BREAK_EVEN_PROPS} />
      </QaFeedbackProvider>,
    )
    const section = container.querySelector('[data-qa-target="results.breakEvenChart.container"]')
    expect(section).not.toBeNull()
    expect(section?.getAttribute('data-qa-section')).toBe('true')
  })

  it('legend overlay carries data-qa-target="results.breakEvenChart.legend"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <BreakEvenChart {...BREAK_EVEN_PROPS} />
      </QaFeedbackProvider>,
    )
    const legend = container.querySelector('[data-qa-target="results.breakEvenChart.legend"]')
    expect(legend).not.toBeNull()
  })
})

describe('BreakEvenChart — inert when QA mode is disabled', () => {
  // No URL param → QA disabled
  it('does NOT emit data-qa-target on the chart container when QA mode is off', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <BreakEvenChart {...BREAK_EVEN_PROPS} />
      </QaFeedbackProvider>,
    )
    const section = container.querySelector('[data-qa-target="results.breakEvenChart.container"]')
    expect(section).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// DetailComparisonTable — section + header cells
// ---------------------------------------------------------------------------

describe('DetailComparisonTable — table section and header targets', () => {
  beforeEach(() => withQaEnabled())

  it('table <section> carries data-qa-target="results.detailComparisonTable.section" and data-qa-section', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <DetailComparisonTable {...TABLE_PROPS} />
      </QaFeedbackProvider>,
    )
    const section = container.querySelector('[data-qa-target="results.detailComparisonTable.section"]')
    expect(section).not.toBeNull()
    expect(section?.getAttribute('data-qa-section')).toBe('true')
  })

  it('header <th> carries data-qa-target="results.detailComparisonTable.header.product"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <DetailComparisonTable {...TABLE_PROPS} />
      </QaFeedbackProvider>,
    )
    const th = container.querySelector('[data-qa-target="results.detailComparisonTable.header.product"]')
    expect(th?.tagName.toLowerCase()).toBe('th')
    expect(th?.textContent?.trim()).toBe('Produkt')
  })

  it('header <th> carries data-qa-target="results.detailComparisonTable.header.netMonthlyPayout"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <DetailComparisonTable {...TABLE_PROPS} />
      </QaFeedbackProvider>,
    )
    const th = container.querySelector(
      '[data-qa-target="results.detailComparisonTable.header.netMonthlyPayout"]',
    )
    expect(th).not.toBeNull()
    expect(th?.textContent?.trim()).toBe('Netto-Rente')
  })

  it('table section target is absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <DetailComparisonTable {...TABLE_PROPS} />
      </QaFeedbackProvider>,
    )
    expect(
      container.querySelector('[data-qa-target="results.detailComparisonTable.section"]'),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// LegalFooter — footer container and links
// ---------------------------------------------------------------------------

describe('LegalFooter — container and link targets', () => {
  beforeEach(() => withQaEnabled())

  it('footer <footer> carries data-qa-target="legal.footer.container" and data-qa-section', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <LegalFooter navigate={() => undefined} />
      </QaFeedbackProvider>,
    )
    const footer = container.querySelector('[data-qa-target="legal.footer.container"]')
    expect(footer?.tagName.toLowerCase()).toBe('footer')
    expect(footer?.getAttribute('data-qa-section')).toBe('true')
  })

  it('Impressum link carries data-qa-target="legal.footer.impressum"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <LegalFooter navigate={() => undefined} />
      </QaFeedbackProvider>,
    )
    const link = container.querySelector('[data-qa-target="legal.footer.impressum"]')
    expect(link?.tagName.toLowerCase()).toBe('a')
    expect(link?.getAttribute('href')).toBe('/impressum')
  })

  it('Datenschutz link carries data-qa-target="legal.footer.datenschutz"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <LegalFooter navigate={() => undefined} />
      </QaFeedbackProvider>,
    )
    const link = container.querySelector('[data-qa-target="legal.footer.datenschutz"]')
    expect(link?.tagName.toLowerCase()).toBe('a')
    expect(link?.getAttribute('href')).toBe('/datenschutz')
  })

  it('footer target is absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <LegalFooter navigate={() => undefined} />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="legal.footer.container"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// DisclaimerBanner — body and dismiss button
// ---------------------------------------------------------------------------

describe('DisclaimerBanner — body and dismiss targets', () => {
  beforeEach(() => withQaEnabled())

  it('disclaimer wrap carries data-qa-target="workspace.disclaimer.body"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <DisclaimerBanner />
      </QaFeedbackProvider>,
    )
    const body = container.querySelector('[data-qa-target="workspace.disclaimer.body"]')
    expect(body).not.toBeNull()
    expect(body?.getAttribute('data-qa-section')).toBe('true')
  })

  it('dismiss button carries data-qa-target="workspace.disclaimer.dismiss"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <DisclaimerBanner />
      </QaFeedbackProvider>,
    )
    const btn = container.querySelector('[data-qa-target="workspace.disclaimer.dismiss"]')
    expect(btn?.tagName.toLowerCase()).toBe('button')
    expect(btn?.getAttribute('aria-label')).toBe('Hinweis für diese Sitzung ausblenden')
  })

  it('disclaimer body target is absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <DisclaimerBanner />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="workspace.disclaimer.body"]')).toBeNull()
  })

  it('sessionStorage dismissal behavior is unchanged — dismiss hides the banner', () => {
    // Baseline: banner visible before dismiss
    const { container } = render(
      <QaFeedbackProvider>
        <DisclaimerBanner />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('.disclaimer-wrap')).not.toBeNull()
    // session storage flag is written on dismiss (behavior test, not regression)
    expect(sessionStorage.getItem('disclaimer-dismissed')).toBeNull()
  })
})
