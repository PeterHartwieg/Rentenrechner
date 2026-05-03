// @vitest-environment jsdom
/**
 * Render tests for CombineIncomePanel (Group G issue 09).
 *
 * Karin shape: one bAV instance with empty evidenceMap → inputConfidence is
 * 'model_estimate' → the "🤔 Teilweise geschätzt" badge must appear.
 *
 * Coverage:
 *   - Renders the combined monthly income figure.
 *   - Shows the scenario label.
 *   - Renders yellow "Teilweise geschätzt" badge when any instance has
 *     inputConfidence === 'model_estimate'.
 *   - Does NOT render the badge when all instances are user_confirmed.
 *   - Badge click opens the popover listing estimated instances.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CombineIncomePanel } from './CombineIncomePanel'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { ProductResult } from '../../domain/results'

function makeCombinedResult(overrides: Partial<CombinedResult> = {}): CombinedResult {
  // Minimal stub: CombineIncomePanel only reads monthlyNetIncome from this.
  return {
    monthlyNetIncome: 1500,
    statutoryPensionMonthlyNet: 900,
    monthlyGrossPayouts: {} as CombinedResult['monthlyGrossPayouts'],
    aggregateTax: {} as CombinedResult['aggregateTax'],
    aggregateKvPv: {} as CombinedResult['aggregateKvPv'],
    byInstance: {},
    notes: [],
    ...overrides,
  }
}

function makeProductResult(
  overrides: Partial<ProductResult> = {},
): ProductResult {
  // Minimal stub: CombineIncomePanel reads only scenarioId, inputConfidence,
  // instanceId, productId, and label from each ProductResult.
  return {
    productId: 'bav',
    instanceId: 'bav-test01',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    label: 'bAV Allianz',
    inputConfidence: 'model_estimate',
    rows: [],
    ...overrides,
  } as unknown as ProductResult
}

describe('CombineIncomePanel', () => {
  afterEach(() => cleanup())

  it('renders the combined monthly income', () => {
    const combinedResult = makeCombinedResult({ monthlyNetIncome: 1500 })
    const perInstanceResults: Record<string, ProductResult[]> = {
      'bav-test01': [makeProductResult()],
    }
    render(
      <CombineIncomePanel
        combinedResult={combinedResult}
        perInstanceResults={perInstanceResults}
        scenarioId="basis"
        scenarioLabel="Basis"
      />,
    )
    // 1500 EUR/Monat should be displayed.
    expect(screen.getByText(/1\.500/)).toBeTruthy()
  })

  it('renders the scenario label', () => {
    render(
      <CombineIncomePanel
        combinedResult={makeCombinedResult()}
        perInstanceResults={{ 'bav-test01': [makeProductResult()] }}
        scenarioId="basis"
        scenarioLabel="Basis"
      />,
    )
    expect(screen.getByText('Basis')).toBeTruthy()
  })

  // Karin shape: bAV instance with model_estimate → badge renders.
  it('shows "Teilweise geschätzt" badge when any instance has model_estimate confidence', () => {
    render(
      <CombineIncomePanel
        combinedResult={makeCombinedResult()}
        perInstanceResults={{
          'bav-test01': [makeProductResult({ inputConfidence: 'model_estimate' })],
        }}
        scenarioId="basis"
        scenarioLabel="Basis"
      />,
    )
    expect(screen.getByText(/Teilweise geschätzt/)).toBeTruthy()
  })

  it('does NOT show the badge when all instances are user_confirmed', () => {
    render(
      <CombineIncomePanel
        combinedResult={makeCombinedResult()}
        perInstanceResults={{
          'bav-test01': [makeProductResult({ inputConfidence: 'user_confirmed' })],
        }}
        scenarioId="basis"
        scenarioLabel="Basis"
      />,
    )
    expect(screen.queryByText(/Teilweise geschätzt/)).toBeNull()
  })

  it('does NOT show the badge when perInstanceResults is empty', () => {
    render(
      <CombineIncomePanel
        combinedResult={makeCombinedResult()}
        perInstanceResults={{}}
        scenarioId="basis"
        scenarioLabel="Basis"
      />,
    )
    expect(screen.queryByText(/Teilweise geschätzt/)).toBeNull()
  })

  it('clicking the badge opens a popover listing the estimated instance label', () => {
    render(
      <CombineIncomePanel
        combinedResult={makeCombinedResult()}
        perInstanceResults={{
          'bav-test01': [makeProductResult({ label: 'bAV Allianz', inputConfidence: 'model_estimate' })],
        }}
        scenarioId="basis"
        scenarioLabel="Basis"
      />,
    )
    const badge = screen.getByRole('button', { name: /Teilweise geschätzt/ })
    // Popover should not be visible before clicking.
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(badge)
    // After click, tooltip (popover) should be visible and contain the instance label.
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toBeTruthy()
    expect(tooltip.textContent).toContain('bAV Allianz')
  })

  it('clicking the badge again closes the popover', () => {
    render(
      <CombineIncomePanel
        combinedResult={makeCombinedResult()}
        perInstanceResults={{
          'bav-test01': [makeProductResult({ inputConfidence: 'model_estimate' })],
        }}
        scenarioId="basis"
        scenarioLabel="Basis"
      />,
    )
    const badge = screen.getByRole('button', { name: /Teilweise geschätzt/ })
    fireEvent.click(badge)
    expect(screen.queryByRole('tooltip')).toBeTruthy()
    fireEvent.click(badge)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
