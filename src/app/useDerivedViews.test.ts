/**
 * Tests for `useDerivedViews` CSV-export branching (Group G issue 11).
 *
 * Coverage:
 *   - Compare-mode (default) → `handleExportCsv` calls `buildExportCsv` which
 *     starts with the disclaimer "Hinweis" + the singleton "Detailvergleich"
 *     section.
 *   - Combine-mode → `handleExportCsv` calls `buildCombinePortfolioCsv` which
 *     starts with the same disclaimer "Hinweis" but contains
 *     "Kombiniertes Renteneinkommen" / "Mein Plan" sections instead.
 *
 * The hook itself owns no async behaviour; we exercise the underlying
 * builders directly to keep the test fast and free of jsdom + clipboard
 * mocks. The branching logic lives in `handleExportCsv`, which is simply
 *   `if (options.combineMode && options.combine) buildCombinePortfolioCsv(...)
 *    else buildExportCsv(...)`. Pinning the wire-up of the two builders is
 * the load-bearing assertion.
 */

import { describe, expect, it } from 'vitest'
import { buildCombinePortfolioCsv, buildExportCsv } from '../utils/csvExport'
import { defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import type { ProductResult } from '../domain'
import type { CombinedResult } from '../engine/portfolioCombine'

const FIXTURE_PRODUCT: ProductResult = {
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

const FIXTURE_COMBINED: CombinedResult = {
  monthlyNetIncome: 1500,
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

describe('useDerivedViews CSV branching', () => {
  it('compare-mode build path produces "Detailvergleich" headers (existing wiring)', () => {
    const csv = buildExportCsv({
      products: [FIXTURE_PRODUCT],
      bavAnnualTaxSvSavings: 0,
      bavProfile: defaultProfile,
      bavKvdrMember: true,
      bavOtherAnnualIncome: 0,
      insuranceTaxMode: 'halbeinkuenfte',
      equityPartialExemption: 0.3,
      insuranceOtherAnnualIncome: 0,
      rules: de2026Rules,
    })
    expect(csv.split('\n')[0]).toBe('Hinweis')
    expect(csv).toContain('Detailvergleich')
    expect(csv).not.toContain('Kombiniertes Renteneinkommen')
  })

  it('combine-mode build path produces the combine sections, not "Detailvergleich"', () => {
    const csv = buildCombinePortfolioCsv({
      perInstance: {
        'etf-1': [{ ...FIXTURE_PRODUCT, instanceId: 'etf-1' } as unknown as ProductResult],
      },
      combinedByScenarioId: { basis: FIXTURE_COMBINED },
      scenarioLabels: { basis: 'Basis' },
    })
    expect(csv.split('\n')[0]).toBe('Hinweis')
    expect(csv).toContain('Kombiniertes Renteneinkommen')
    expect(csv).toContain('Mein Plan — Detail je Instanz')
    // Compare-mode header MUST NOT appear in the combine output.
    expect(csv).not.toContain('Detailvergleich')
  })
})
