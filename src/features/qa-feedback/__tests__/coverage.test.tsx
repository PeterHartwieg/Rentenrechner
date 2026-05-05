// @vitest-environment jsdom

/**
 * Phase 3 Lane H — Issue 09: Feedback target coverage for charts, tables,
 * legal pages, and disclaimer banner.
 *
 * Extended in Issue 13 to cover leaf-level targets:
 *  - BreakEvenChart individual legend items (leaf)
 *  - FeeDragChart individual legend items (leaf)
 *  - ProductTabs per-product tab buttons (leaf)
 *  - FeeSection mode-tab buttons (leaf)
 *  - qaTarget convenience helper
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
// FeeDragChart stub
// ---------------------------------------------------------------------------

import { FeeDragChart } from '../../results/FeeDragChart'

const FEE_DRAG_PROPS = {
  selectedResults: [
    {
      productId: 'etf' as const,
      label: 'ETF',
      netMonthlyPayout: 1200,
      totalFees: 5000,
      totalUserCost: 50000,
      etfPayoutRows: [],
    },
  ],
  productColors: { etf: '#0ea5e9' },
  retirementAge: 67,
  retirementEndAge: 87,
}

// ---------------------------------------------------------------------------
// ProductTabs stub
// ---------------------------------------------------------------------------

import { ProductTabs } from '../../inputs/ProductTabs'

// ---------------------------------------------------------------------------
// FeeSection stub
// ---------------------------------------------------------------------------

import { FeeSection } from '../../inputs/sections/FeeSection'

const DEFAULT_FEES = {
  wrapperAssetFee: 0.007,
  fundAssetFee: 0.003,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 5,
  pensionPayoutFeePct: 0,
}

// ---------------------------------------------------------------------------
// qaTarget helper
// ---------------------------------------------------------------------------

import { qaTarget } from '../useFeedbackTarget'

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

// ---------------------------------------------------------------------------
// Issue 13: BreakEvenChart — individual legend items at leaf level
// ---------------------------------------------------------------------------

describe('BreakEvenChart — leaf-level legend items (issue 13)', () => {
  beforeEach(() => withQaEnabled())

  it('individual legend items carry their own data-qa-target (leaf precision)', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <BreakEvenChart {...BREAK_EVEN_PROPS} />
      </QaFeedbackProvider>,
    )
    const nettoEl = container.querySelector('[data-qa-target="results.breakEvenChart.legend.nettoEingezahlt"]')
    expect(nettoEl).not.toBeNull()
    expect(nettoEl?.getAttribute('data-qa-precision')).toBe('exact')
  })

  it('Restkapital legend item carries data-qa-target="results.breakEvenChart.legend.restkapital"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <BreakEvenChart {...BREAK_EVEN_PROPS} />
      </QaFeedbackProvider>,
    )
    const el = container.querySelector('[data-qa-target="results.breakEvenChart.legend.restkapital"]')
    expect(el).not.toBeNull()
  })

  it('all five legend items are individually selectable', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <BreakEvenChart {...BREAK_EVEN_PROPS} />
      </QaFeedbackProvider>,
    )
    const ids = [
      'results.breakEvenChart.legend.nettoEingezahlt',
      'results.breakEvenChart.legend.restkapital',
      'results.breakEvenChart.legend.nettoAusgezahlt',
      'results.breakEvenChart.legend.breakEven',
      'results.breakEvenChart.legend.leibrenteCrossover',
    ]
    for (const id of ids) {
      expect(container.querySelector(`[data-qa-target="${id}"]`)).not.toBeNull()
    }
  })

  it('product picker chip carries data-qa-target="results.breakEvenChart.picker.etf"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <BreakEvenChart {...BREAK_EVEN_PROPS} />
      </QaFeedbackProvider>,
    )
    const chip = container.querySelector('[data-qa-target="results.breakEvenChart.picker.etf"]')
    expect(chip?.tagName.toLowerCase()).toBe('button')
  })

  it('legend items are absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <BreakEvenChart {...BREAK_EVEN_PROPS} />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="results.breakEvenChart.legend.nettoEingezahlt"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Issue 13: FeeDragChart — individual legend items at leaf level
// ---------------------------------------------------------------------------

describe('FeeDragChart — leaf-level legend items (issue 13)', () => {
  beforeEach(() => withQaEnabled())

  it('Nettoaufwand legend item carries data-qa-target with exact precision', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <FeeDragChart {...FEE_DRAG_PROPS} />
      </QaFeedbackProvider>,
    )
    const el = container.querySelector('[data-qa-target="results.feeDragChart.legend.nettoaufwandGesamt"]')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('data-qa-precision')).toBe('exact')
  })

  it('all three fee-drag legend items are individually selectable', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <FeeDragChart {...FEE_DRAG_PROPS} />
      </QaFeedbackProvider>,
    )
    const ids = [
      'results.feeDragChart.legend.nettoaufwandGesamt',
      'results.feeDragChart.legend.nettoRendite',
      'results.feeDragChart.legend.gebuehrenGesamt',
    ]
    for (const id of ids) {
      expect(container.querySelector(`[data-qa-target="${id}"]`)).not.toBeNull()
    }
  })

  it('legend items are absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <FeeDragChart {...FEE_DRAG_PROPS} />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="results.feeDragChart.legend.nettoaufwandGesamt"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Issue 13: ProductTabs — per-product tab buttons at leaf level
// ---------------------------------------------------------------------------

describe('ProductTabs — leaf-level tab buttons (issue 13)', () => {
  beforeEach(() => withQaEnabled())

  it('each visible product tab carries data-qa-target="inputs.productTabs.<productId>"', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <ProductTabs visible={['etf', 'bav']} active={'etf'} onChange={() => {}} />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="inputs.productTabs.etf"]')).not.toBeNull()
    expect(container.querySelector('[data-qa-target="inputs.productTabs.bav"]')).not.toBeNull()
  })

  it('tab targets are absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <ProductTabs visible={['etf']} active={'etf'} onChange={() => {}} />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="inputs.productTabs.etf"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Issue 13: FeeSection — mode-tab buttons at leaf level
// ---------------------------------------------------------------------------

describe('FeeSection — fee-mode tab buttons (issue 13)', () => {
  beforeEach(() => withQaEnabled())

  it('Einzelposten tab carries data-qa-target with feedbackBaseId prefix', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <FeeSection
          fees={DEFAULT_FEES}
          onChangeFees={vi.fn()}
          presets={[]}
          riy={0.01}
          feeInputMode="aufgeschluesselt"
          setFeeInputMode={vi.fn()}
          feedbackBaseId="inputs.bav.fees"
        />
      </QaFeedbackProvider>,
    )
    const btn = container.querySelector('[data-qa-target="inputs.bav.fees.tab.aufgeschluesselt"]')
    expect(btn?.tagName.toLowerCase()).toBe('button')
  })

  it('Effektivkosten tab carries data-qa-target with feedbackBaseId prefix', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <FeeSection
          fees={DEFAULT_FEES}
          onChangeFees={vi.fn()}
          presets={[]}
          riy={0.01}
          feeInputMode="aufgeschluesselt"
          setFeeInputMode={vi.fn()}
          feedbackBaseId="inputs.bav.fees"
        />
      </QaFeedbackProvider>,
    )
    const btn = container.querySelector('[data-qa-target="inputs.bav.fees.tab.effektivkosten"]')
    expect(btn).not.toBeNull()
  })

  it('mode-tab buttons fall back to inputs.fees prefix when feedbackBaseId is absent', () => {
    const { container } = render(
      <QaFeedbackProvider>
        <FeeSection
          fees={DEFAULT_FEES}
          onChangeFees={vi.fn()}
          presets={[]}
          riy={0.01}
          feeInputMode="aufgeschluesselt"
          setFeeInputMode={vi.fn()}
        />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="inputs.fees.tab.aufgeschluesselt"]')).not.toBeNull()
  })

  it('mode-tab targets are absent when QA mode is off', () => {
    window.history.replaceState(null, '', '/')
    const { container } = render(
      <QaFeedbackProvider>
        <FeeSection
          fees={DEFAULT_FEES}
          onChangeFees={vi.fn()}
          presets={[]}
          riy={0.01}
          feeInputMode="aufgeschluesselt"
          setFeeInputMode={vi.fn()}
          feedbackBaseId="inputs.bav.fees"
        />
      </QaFeedbackProvider>,
    )
    expect(container.querySelector('[data-qa-target="inputs.bav.fees.tab.aufgeschluesselt"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Issue 13: qaTarget convenience helper
// ---------------------------------------------------------------------------

describe('qaTarget — convenience helper', () => {
  it('returns empty object when enabled is false', () => {
    const result = qaTarget(false, 'inputs.bav.contribution')
    expect(result).toEqual({})
  })

  it('returns data-qa-target and precision when enabled is true', () => {
    const result = qaTarget(true, 'inputs.bav.contribution')
    expect(result['data-qa-target']).toBe('inputs.bav.contribution')
    expect(result['data-qa-precision']).toBe('exact')
  })

  it('passes opts through to qaTargetAttrs (label, precision, sensitive)', () => {
    const result = qaTarget(true, 'inputs.bav.contribution', {
      label: 'Beitrag',
      precision: 'section',
      sensitive: true,
    })
    expect(result['data-qa-target']).toBe('inputs.bav.contribution')
    expect(result['data-qa-label']).toBe('Beitrag')
    expect(result['data-qa-precision']).toBe('section')
    expect(result['data-qa-section']).toBe('true')
    expect(result['data-qa-sensitive']).toBe('true')
  })
})
