// @vitest-environment jsdom
/**
 * Display-boundary tests for issue #80.
 *
 * Verifies that the four components that previously used raw float interpolation,
 * Math.round, or .toFixed now produce properly locale-formatted output via
 * the shared formatters (formatCurrency, formatPercent, formatNumber).
 *
 * Covered sites:
 *   - FairnessPanel.tsx: GKV Zusatzbeitrag (was raw `${pct} %`)
 *   - InstanceCard.tsx: bAV subsidy hint (was raw float + Math.round)
 *   - ResultWaterfall.tsx: Abzugsquote (was .toFixed(1) + " %")
 *   - OfferCapitalCompareField.tsx: deviation percent (was .toFixed(1) + " %")
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { FairnessPanel } from './FairnessPanel'
import { BavCard } from '../inventory/InstanceCard'
import { ResultWaterfall } from './ResultWaterfall'
import { OfferCapitalCompareField } from '../inputs/sections/OfferCapitalCompareField'
import { QaFeedbackProvider } from '../qa-feedback/QaFeedbackProvider'
import type { PersonalProfile, BavFundingResult, ProductResult } from '../../domain'
import type { BavDraft } from '../inventory/types'
import { defaultProfile, defaultAssumptions } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// FairnessPanel — GKV Zusatzbeitrag
// ---------------------------------------------------------------------------

describe('FairnessPanel — GKV Zusatzbeitrag uses formatPercent (issue #80)', () => {
  function makeMinimalProps(healthAdditionalContributionPct: number) {
    const profile: PersonalProfile = {
      ...defaultProfile,
      publicHealthInsurance: true,
      healthAdditionalContributionPct,
    }

    // Minimal stub for bavFunding — only salaryWithoutBav.pkv257SubsidyMonthly is read
    const bavFunding = {
      salaryWithoutBav: { pkv257SubsidyMonthly: 0 },
    } as unknown as BavFundingResult

    return { profile, assumptions: defaultAssumptions, bavFunding, rules: de2026Rules }
  }

  it('formats a decimal-part Zusatzbeitrag with locale formatting (no raw float)', () => {
    const { container } = render(<FairnessPanel {...makeMinimalProps(1.7)} />)
    // formatPercent(0.017) → "1,7 %" (de-DE locale)
    expect(container.textContent).toContain('1,7')
    // Must NOT contain raw "1.7 %" or "1.7%"
    expect(container.textContent).not.toMatch(/1\.7\s*%/)
  })

  it('formats a whole-number Zusatzbeitrag without spurious decimals', () => {
    const { container } = render(<FairnessPanel {...makeMinimalProps(2)} />)
    // formatPercent(0.02) → "2 %" (de-DE locale)
    expect(container.textContent).toContain('2')
    expect(container.textContent).not.toMatch(/2\.0\s*%/)
  })
})

// ---------------------------------------------------------------------------
// InstanceCard / Layer3Details — bAV subsidy hint
// ---------------------------------------------------------------------------

describe('InstanceCard bAV subsidy — uses formatCurrency, not Math.round (issue #80)', () => {
  function makeBavDraft(monthlyContribution: number): BavDraft {
    return {
      productId: 'bav',
      status: 'active',
      contractStartYear: 2015,
      currentValueEUR: 10_000,
      monthlyContribution,
      anbieter: undefined,
      durchfuehrungsweg: 'direktversicherung_3_63',
      effektivkostenPct: 1.0,
      rentenfaktor: 28,
      payoutMode: 'leibrente',
    }
  }

  it('renders bAV subsidy contribution with currency formatting (no raw float)', () => {
    const draft = makeBavDraft(333.33)
    render(<BavCard draft={draft} onChange={() => {}} />)
    // Open the Details disclosure so the hint is rendered
    const summary = document.querySelector('summary')
    summary?.click()

    const hint = document.querySelector('.inventory-field-hint')?.textContent ?? ''
    // Must not contain the raw float "333.33"
    expect(hint).not.toContain('333.33')
  })

  it('renders bAV employer subsidy (15%) with currency formatting, not Math.round', () => {
    // monthlyContribution = 200 → subsidy = 200 * 0.15 = 30 exactly
    // Math.round(30) === 30, but for a decimal like 200.5 → 200.5 * 0.15 = 30.075
    // Math.round(30.075) = 30, formatCurrency(30.075, 0) = "30 €" (rounds normally)
    // The key check: no raw float digit sequence like "30.075" appears
    const draft = makeBavDraft(200.5)
    render(<BavCard draft={draft} onChange={() => {}} />)
    const summary = document.querySelector('summary')
    summary?.click()

    const hint = document.querySelector('.inventory-field-hint')?.textContent ?? ''
    expect(hint).not.toMatch(/\d+\.\d+/)
  })
})

// ---------------------------------------------------------------------------
// ResultWaterfall — Abzugsquote
// ---------------------------------------------------------------------------

describe('ResultWaterfall — Abzugsquote uses formatPercent (issue #80)', () => {
  function makeResult(capitalAtRetirement: number, afterTaxLumpSum: number): ProductResult {
    return {
      productId: 'bav',
      label: 'bAV',
      capitalAtRetirement,
      afterTaxLumpSum,
      netMonthlyPayout: 500,
      grossMonthlyPayout: 600,
      monthlyUserCost: 200,
      monthlyProductContribution: 250,
      monthlyEmployerContribution: 50,
      lumpSumDeductions: null,
      accumulationRiy: 0.01,
      yearlyRows: [],
      monteCarlo: null,
    } as unknown as ProductResult
  }

  it('renders Abzugsquote with locale percent formatting (no .toFixed raw output)', () => {
    const capital = 100_000
    const afterTax = 87_500  // 12.5% deduction
    const { container } = render(
      <QaFeedbackProvider>
        <ResultWaterfall result={makeResult(capital, afterTax)} />
      </QaFeedbackProvider>,
    )

    // The breakdown tooltip is only visible when totalDeduction > 0.5; open the InfoTip.
    const tipButton = container.querySelector('button[aria-label]')
    if (tipButton) fireEvent.click(tipButton)

    const content = container.textContent ?? ''
    // formatPercent(0.125) → "12,5 %" in de-DE
    expect(content).toContain('12,5')
    // Must NOT contain the raw ".toFixed" style output like "12.5 %"
    expect(content).not.toMatch(/12\.5\s*%/)
  })
})

// ---------------------------------------------------------------------------
// OfferCapitalCompareField — deviation percent
// ---------------------------------------------------------------------------

describe('OfferCapitalCompareField — deviation uses formatPercent (issue #80)', () => {
  it('renders deviation percent with locale formatting for fractional values', () => {
    render(
      <OfferCapitalCompareField
        modelCapital={100_000}
        offerCapital={105_333}
        onChangeOfferCapital={() => {}}
      />,
    )
    const content = document.body.textContent ?? ''
    // deviation = 5333 / 100000 = 0.05333 → formatPercent → "5,3 %" (1 decimal, de-DE)
    // Must NOT contain ".toFixed" raw output like "5.3 %"
    expect(content).not.toMatch(/5\.3\s*%/)
    // Must contain a locale-formatted percent sign
    expect(content).toMatch(/5[,.]3\s*%/)
  })

  it('renders a negative deviation with correct sign', () => {
    render(
      <OfferCapitalCompareField
        modelCapital={100_000}
        offerCapital={92_000}
        onChangeOfferCapital={() => {}}
      />,
    )
    const content = document.body.textContent ?? ''
    // deviation = -8000 / 100000 = -0.08 → formatPercent → "-8 %"
    // The sign should come from the formatPercent output (negative ratio)
    expect(content).toMatch(/-\s*8/)
  })
})
