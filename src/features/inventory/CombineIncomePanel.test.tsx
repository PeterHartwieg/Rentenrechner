// @vitest-environment jsdom
/**
 * Render tests for CombineIncomePanel (Group G issue 09 + issue 111).
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
 *   - Issue #111: Badge must NOT appear when inputConfidence is model_estimate
 *     solely because evidenceMap fields are absent (not explicitly estimated).
 *     Only explicit EvidenceState === 'model_estimate' in instanceEvidenceMaps
 *     should trigger the badge ("übernommen"/zero values must not trigger it).
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

  // Issue #111 regression tests: badge must be driven by explicit EvidenceState,
  // not by absent/undefined evidenceMap entries.
  // lowestConfidence() returns 'model_estimate' for absent fields, but the badge
  // should only trigger on explicit 'model_estimate' in instanceEvidenceMaps.

  it('[#111] does NOT show badge when instanceEvidenceMaps is empty (all-übernommen / zero values)', () => {
    // Real-world trigger: user accepts zero values via wizard but the wizard
    // does not write evidenceMap entries for them. lowestConfidence() then
    // returns 'model_estimate' (treating absent fields as estimated), which
    // propagates to ProductResult.inputConfidence. The badge must not fire for
    // these instances — only explicit model_estimate values should trigger it.
    render(
      <CombineIncomePanel
        combinedResult={makeCombinedResult()}
        perInstanceResults={{
          'bav-test01': [makeProductResult({ inputConfidence: 'model_estimate' })],
        }}
        scenarioId="basis"
        scenarioLabel="Basis"
        instanceEvidenceMaps={{ 'bav-test01': {} }}
      />,
    )
    expect(screen.queryByText(/Teilweise geschätzt/)).toBeNull()
  })

  it('[#111] does NOT show badge when all instanceEvidenceMaps fields are user_confirmed (all-bestätigt)', () => {
    render(
      <CombineIncomePanel
        combinedResult={makeCombinedResult()}
        perInstanceResults={{
          'bav-test01': [makeProductResult({ inputConfidence: 'model_estimate' })],
        }}
        scenarioId="basis"
        scenarioLabel="Basis"
        instanceEvidenceMaps={{
          'bav-test01': {
            monthlyGrossConversion: 'user_confirmed',
            'fees.wrapperAssetFee': 'user_confirmed',
            'fees.fundAssetFee': 'user_confirmed',
            'fees.acquisitionCostPct': 'user_confirmed',
            'fees.pensionPayoutFeePct': 'user_confirmed',
            contractualMatchPercent: 'user_confirmed',
            contractualFixedMonthly: 'user_confirmed',
            acquisitionCostPct: 'user_confirmed',
            durchfuehrungsweg: 'user_confirmed',
            pre2005EligibleTaxFree: 'user_confirmed',
            rentenfaktor: 'user_confirmed',
            payoutMode: 'user_confirmed',
          },
        }}
      />,
    )
    expect(screen.queryByText(/Teilweise geschätzt/)).toBeNull()
  })

  it('[#111] shows badge when instanceEvidenceMaps has at least one explicit model_estimate field (mixed bestätigt+geschätzt)', () => {
    render(
      <CombineIncomePanel
        combinedResult={makeCombinedResult()}
        perInstanceResults={{
          'bav-test01': [makeProductResult({ inputConfidence: 'model_estimate' })],
        }}
        scenarioId="basis"
        scenarioLabel="Basis"
        instanceEvidenceMaps={{
          'bav-test01': {
            monthlyGrossConversion: 'model_estimate',
            'fees.wrapperAssetFee': 'user_confirmed',
          },
        }}
      />,
    )
    expect(screen.getByText(/Teilweise geschätzt/)).toBeTruthy()
  })
})
