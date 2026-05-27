// @vitest-environment jsdom
/**
 * PR R3 R1 fix verification (Codex P2 / CR3): when PrintReport renders in
 * combine-mode, the expensive 6-product `simulateRetirementComparison` must
 * NOT run — the combine-mode branch consumes the pre-built portfolio data
 * threaded in via props, so the compare-mode all-products result is ignored.
 *
 * PrintReport mounts continuously alongside the calculator (not only during
 * print), so every parent assumptions edit would otherwise re-trigger the
 * two-pass funding compute. The short-circuit lives inside the `useMemo`
 * body in `PrintReport.tsx`.
 *
 * This test isolates the mock via a dedicated file so the module-level
 * `vi.mock('../../engine/simulate')` doesn't leak into the broader
 * PrintReport.test.tsx suite (which renders compare-mode and depends on the
 * real simulator).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import type { ProductResult, SimulationResult } from '../../domain'
import type { CombinedResult } from '../../engine/portfolioCombine'

// Mock the simulate module BEFORE importing PrintReport so the import below
// captures the mocked binding.
const simulateRetirementComparisonMock = vi.fn()

vi.mock('../../engine/simulate', async () => {
  const actual = await vi.importActual<typeof import('../../engine/simulate')>(
    '../../engine/simulate',
  )
  return {
    ...actual,
    simulateRetirementComparison: (...args: Parameters<typeof actual.simulateRetirementComparison>) => {
      simulateRetirementComparisonMock(...args)
      return actual.simulateRetirementComparison(...args)
    },
  }
})

// Imports below see the mocked module.
const { PrintReport } = await import('./PrintReport')
const { defaultProfile, defaultAssumptions } = await import(
  '../../data/defaultScenario'
)

function makeSimulation(): SimulationResult {
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
    inputConfidence: 'user_confirmed',
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

beforeEach(() => {
  simulateRetirementComparisonMock.mockClear()
})

afterEach(() => cleanup())

describe('PrintReport combine-mode short-circuit (Codex P2 / CR3)', () => {
  it('does NOT call simulateRetirementComparison when rendering in combine-mode', () => {
    // PrintReport's compare-mode `useMemo` runs an expensive 6-product
    // `simulateRetirementComparison`. The combine-mode branch ignores the
    // result entirely (consumes the pre-built portfolio prop instead), so
    // the useMemo must short-circuit to `null` and skip the simulator call.
    const bavResult: ProductResult = {
      ...(makeSimulation().products[0] as ProductResult),
      productId: 'bav',
      label: 'bAV Direktversicherung A',
      instanceId: 'bav-1',
    } as unknown as ProductResult

    render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation()}
        combineMode={true}
        portfolio={{
          perInstance: { 'bav-1': [bavResult] },
          combinedByScenarioId: { basis: makeCombined(2200) },
          scenarioLabels: { basis: 'Basis' },
        }}
      />,
    )

    expect(simulateRetirementComparisonMock).not.toHaveBeenCalled()
  })

  it('DOES call simulateRetirementComparison in compare-mode (control case)', () => {
    // Sanity check: the short-circuit doesn't accidentally break compare-mode.
    render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation()}
      />,
    )

    expect(simulateRetirementComparisonMock).toHaveBeenCalled()
  })

  it('does NOT call simulateRetirementComparison even when combineMode is true but portfolio is missing', () => {
    // Defensive: the predicate is `combineMode && portfolio`. When the caller
    // sets `combineMode=true` without a portfolio prop the component falls
    // back to the compare-mode render — which DOES need the simulator. The
    // short-circuit must therefore only fire when both are truthy. This test
    // pins that exact contract (an over-eager short-circuit would skip the
    // simulator and produce a blank compare-mode print).
    render(
      <PrintReport
        profile={defaultProfile}
        assumptions={defaultAssumptions}
        simulation={makeSimulation()}
        combineMode={true}
        // portfolio prop omitted → falls back to compare-mode render
      />,
    )

    expect(simulateRetirementComparisonMock).toHaveBeenCalled()
  })
})
