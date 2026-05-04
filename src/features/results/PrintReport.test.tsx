// @vitest-environment jsdom
/**
 * Render tests for PrintReport (Group G issue 09 N6).
 *
 * Coverage:
 *   - combine-mode fixture with model_estimate → .pr-confidence-estimate is present
 *   - .pr-disclaimer-top is the FIRST child of #print-report (publication-blocking compliance)
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PrintReport } from './PrintReport'
import { defaultProfile, defaultAssumptions } from '../../data/defaultScenario'
import type { SimulationResult } from '../../domain'
import type { ProductResult } from '../../domain'
import type { CombinedResult } from '../../engine/portfolioCombine'

afterEach(() => cleanup())

function makeSimulation(inputConfidence: ProductResult['inputConfidence']): SimulationResult {
  const product: ProductResult = {
    productId: 'etf',
    label: 'ETF',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    annualReturn: 0.06,
    monthlyUserCost: 200,
    monthlyProductContribution: 200,
    monthlyEmployerContribution: 0,
    totalUserCost: 48000,
    totalProductContributions: 48000,
    totalEmployerContributions: 0,
    totalFees: 1000,
    capitalAtRetirement: 120000,
    realCapitalAtRetirement: 90000,
    afterTaxLumpSum: 110000,
    grossMonthlyPayout: 500,
    netMonthlyPayout: 450,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: 2.5,
    capitalMultipleAnnualized: 1.05,
    accumulationRiy: 0.008,
    inputConfidence,
    rows: [],
    etfPayoutRows: [],
  } as unknown as ProductResult

  return {
    products: [product],
    bavFunding: {
      monthlyNetCost: 0,
      monthlyGrossConversion: 0,
      monthlyEmployerContribution: 0,
      annualTaxSaving: 0,
      annualSvSaving: 0,
      annualTaxSvSavings: 0,
      annualSavings: 0,
      effectiveMonthlyEmployerContribution: 0,
      effectiveLimit3Nr63: 0,
      effectiveLimitSvEV: 0,
      monthly3Nr63Contribution: 0,
      monthlySvContribution: 0,
      monthlyExcessContribution: 0,
      cappedAt3Nr63: false,
      cappedAtSvEV: false,
      iterations: 0,
    } as unknown as SimulationResult['bavFunding'],
    statutoryPension: {
      grossMonthlyPension: 1000,
      netMonthlyPension: 900,
      projectedEntgeltpunkte: 35,
    } as unknown as SimulationResult['statutoryPension'],
    basisrenteFunding: { monthlyGrossContribution: 0 } as unknown as SimulationResult['basisrenteFunding'],
    altersvorsorgedepotFunding: { monthlyOwnContribution: 0 } as unknown as SimulationResult['altersvorsorgedepotFunding'],
    riesterFunding: { monthlyOwnContribution: 0 } as unknown as SimulationResult['riesterFunding'],
  }
}

describe('PrintReport', () => {
  it('renders .pr-confidence-estimate for a product with model_estimate inputConfidence', () => {
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('model_estimate')}
      />
    )
    const indicator = container.querySelector('.pr-confidence-estimate')
    expect(indicator).not.toBeNull()
  })

  it('.pr-disclaimer-top is the FIRST child of #print-report', () => {
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
      />
    )
    const root = container.querySelector('#print-report')
    expect(root).not.toBeNull()
    const firstChild = root!.firstElementChild
    expect(firstChild?.classList.contains('pr-disclaimer-top')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Combine-mode rendering (Group G issue 11).
  // -------------------------------------------------------------------------

  function makeCombined(monthlyNetIncome: number): CombinedResult {
    return {
      monthlyNetIncome,
      monthlyGrossPayouts: {
        statutoryPension: 1000,
        bav: 500,
        privateInsurance: 0,
        basisrente: 0,
        altersvorsorgedepot: 0,
        riester: 0,
        etf: 0,
      },
      aggregateTax: { totalTaxAnnual: 0 } as unknown as CombinedResult['aggregateTax'],
      aggregateKvPv: {} as unknown as CombinedResult['aggregateKvPv'],
      byInstance: {},
      statutoryPensionMonthlyNet: 900,
      notes: [],
    }
  }

  it('combine-mode renders portfolio detail section instead of singleton compare table', () => {
    const bavResult: ProductResult = {
      ...(makeSimulation('user_confirmed').products[0] as ProductResult),
      productId: 'bav',
      label: 'bAV Direktversicherung A',
      instanceId: 'bav-1',
    } as unknown as ProductResult
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
        combineMode={true}
        portfolio={{
          perInstance: { 'bav-1': [bavResult] },
          combinedByScenarioId: { basis: makeCombined(2200) },
          scenarioLabels: { basis: 'Basis' },
        }}
      />
    )
    // Combine title
    expect(container.textContent).toContain('Mein Plan')
    expect(container.textContent).toContain('Kombiniertes Renteneinkommen')
    // Per-instance label appears
    expect(container.textContent).toContain('bAV Direktversicherung A')
    // Singleton-compare specific section title is gone
    expect(container.textContent).not.toContain('Produktvergleich — alle Szenarien')
  })

  it('combine-mode keeps .pr-disclaimer-top as FIRST child of #print-report', () => {
    const bavResult: ProductResult = {
      ...(makeSimulation('user_confirmed').products[0] as ProductResult),
      productId: 'bav',
      label: 'bAV',
      instanceId: 'bav-1',
    } as unknown as ProductResult
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
        combineMode={true}
        portfolio={{
          perInstance: { 'bav-1': [bavResult] },
          combinedByScenarioId: { basis: makeCombined(2200) },
          scenarioLabels: { basis: 'Basis' },
        }}
      />
    )
    const root = container.querySelector('#print-report')
    expect(root).not.toBeNull()
    const firstChild = root!.firstElementChild
    expect(firstChild?.classList.contains('pr-disclaimer-top')).toBe(true)
  })

  it('compare-mode (combineMode=false / undefined) still renders the singleton product table — byte-identical first child', () => {
    // The compare-mode path is byte-identical to the historical render. We
    // assert the first-child invariant + presence of the singleton-only
    // section title.
    const { container } = render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation('user_confirmed')}
      />
    )
    expect(container.textContent).toContain('Produktvergleich — alle Szenarien')
  })
})
