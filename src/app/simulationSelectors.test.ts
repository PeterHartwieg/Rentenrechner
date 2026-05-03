import { describe, expect, it } from 'vitest'
import {
  buildCapitalChartData,
  buildPensionBars,
  deriveBestCapital,
  deriveBestPension,
  deriveCashflowBinding,
  deriveComparableCapitalResults,
  deriveSelectedResults,
  deriveTaxModes,
  deriveVisibleProducts,
  makeRowAfterTaxBalance,
  resolveEffectiveScenarioId,
} from './simulationSelectors'
import type { ProductId } from '../domain'
import { de2026Rules } from '../rules/de2026'
import { makeAssumptions, makeProfile, simulateDefault } from '../test/factories'

const DEFAULT_VISIBLE: ProductId[] = ['bav', 'etf', 'versicherung']

describe('simulationSelectors', () => {
  it('resolves the effective scenario id, falling back to basis when missing', () => {
    const assumptions = makeAssumptions()
    expect(resolveEffectiveScenarioId(assumptions, 'basis')).toBe('basis')
    expect(resolveEffectiveScenarioId(assumptions, 'does-not-exist')).toBe('basis')
  })

  it('deriveSelectedResults returns rows for the active scenario only, in registry order', () => {
    const simulation = simulateDefault()
    const rows = deriveSelectedResults(simulation, DEFAULT_VISIBLE, 'basis')
    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map((r) => r.scenarioId)).size).toBe(1)
    expect(rows[0].scenarioId).toBe('basis')
    // Order should not have duplicates and should be stable.
    const ids = rows.map((r) => r.productId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('deriveSelectedResults filters out products outside visible set', () => {
    const simulation = simulateDefault()
    const rows = deriveSelectedResults(simulation, ['bav'], 'basis')
    expect(rows).toHaveLength(1)
    expect(rows[0].productId).toBe('bav')
  })

  it('deriveVisibleProducts returns rows across all scenarios for visible ids', () => {
    const simulation = simulateDefault()
    const rows = deriveVisibleProducts(simulation, ['bav'])
    expect(rows.length).toBe(simulation.products.filter((p) => p.productId === 'bav').length)
  })

  it('buildCapitalChartData composes balance series keyed by product label', () => {
    const simulation = simulateDefault()
    const selected = deriveSelectedResults(simulation, DEFAULT_VISIBLE, 'basis')
    const data = buildCapitalChartData(selected, false)
    expect(data).toBeDefined()
    expect(data!.length).toBe(selected[0].rows.length)
    for (const point of data!) {
      expect(point.age).toBeTypeOf('number')
      expect(point.year).toBeTypeOf('number')
      for (const r of selected) {
        expect(point[r.label]).toBeDefined()
      }
    }
  })

  it('buildCapitalChartData uses real balances when showRealValues is true', () => {
    const simulation = simulateDefault()
    const selected = deriveSelectedResults(simulation, DEFAULT_VISIBLE, 'basis')
    const nominal = buildCapitalChartData(selected, false)!
    const real = buildCapitalChartData(selected, true)!
    const label = selected[0].label
    // Real balance is at most nominal balance (assumes positive inflation).
    const lastNominal = nominal[nominal.length - 1][label] as number
    const lastReal = real[real.length - 1][label] as number
    expect(lastReal).toBeLessThanOrEqual(lastNominal + 1e-6)
  })

  it('buildCapitalChartData returns undefined when comparison set is empty', () => {
    const simulation = simulateDefault()
    expect(buildCapitalChartData([], false)).toBeUndefined()
    // Same when filtered to nothing visible.
    const selected = deriveSelectedResults(simulation, [], 'basis')
    expect(buildCapitalChartData(selected, false)).toBeUndefined()
  })

  it('buildPensionBars prepends the GRV bar and one bar per result', () => {
    const simulation = simulateDefault()
    const selected = deriveSelectedResults(simulation, DEFAULT_VISIBLE, 'basis')
    const bars = buildPensionBars(simulation, selected)
    expect(bars).toHaveLength(selected.length + 1)
    expect(bars[0].name).toBe('Gesetzl. Rente')
    expect(bars[0].value).toBe(simulation.statutoryPension.netMonthlyPension)
  })

  it('deriveBestCapital and deriveBestPension pick the maximum row', () => {
    const simulation = simulateDefault()
    const selected = deriveSelectedResults(simulation, DEFAULT_VISIBLE, 'basis')
    const comparable = deriveComparableCapitalResults(selected)
    const bestCapital = deriveBestCapital(selected)
    const bestPension = deriveBestPension(selected)
    if (comparable.length > 0) {
      expect(bestCapital).toBeDefined()
      const maxLump = Math.max(...comparable.map((r) => r.afterTaxLumpSum))
      expect(bestCapital!.afterTaxLumpSum).toBe(maxLump)
    }
    expect(bestPension).toBeDefined()
    const maxNet = Math.max(...selected.map((r) => r.netMonthlyPayout))
    expect(bestPension!.netMonthlyPayout).toBe(maxNet)
  })

  it('deriveBestCapital returns undefined when no comparable products', () => {
    expect(deriveBestCapital([])).toBeUndefined()
    expect(deriveBestPension([])).toBeUndefined()
  })

  it('deriveCashflowBinding falls back to the first selected product when the choice is gone', () => {
    const simulation = simulateDefault()
    const selected = deriveSelectedResults(simulation, ['etf'], 'basis')
    const binding = deriveCashflowBinding(selected, 'bav', simulation)
    expect(binding.effectiveCashflowProductId).toBe('etf')
    expect(binding.cashflowAnnualTaxSvSavings).toBe(0)
  })

  it('deriveCashflowBinding returns the bAV tax/SV savings only when bav is the active product', () => {
    const simulation = simulateDefault()
    const selected = deriveSelectedResults(simulation, DEFAULT_VISIBLE, 'basis')
    const bavBinding = deriveCashflowBinding(selected, 'bav', simulation)
    expect(bavBinding.cashflowAnnualTaxSvSavings).toBe(simulation.bavFunding.annualTaxAndSvSavings)
    const etfBinding = deriveCashflowBinding(selected, 'etf', simulation)
    expect(etfBinding.cashflowAnnualTaxSvSavings).toBe(0)
  })

  it('deriveTaxModes derives consistent year and tax mode flags', () => {
    const profile = makeProfile()
    const assumptions = makeAssumptions()
    const tax = deriveTaxModes(profile, assumptions, de2026Rules)
    expect(tax.insurancePayoutYear).toBe(de2026Rules.year + (profile.retirementAge - profile.age))
    expect(tax.kvdrMember).toBe(assumptions.bav.kvdrMember !== false)
    expect(['pre2005', 'halbeinkuenfte', 'abgeltungsteuer']).toContain(tax.insuranceTaxMode)
  })

  it('makeRowAfterTaxBalance returns null for AVD/Basisrente/Riester and a number for ETF/bAV/Versicherung', () => {
    const profile = makeProfile()
    const assumptions = makeAssumptions()
    const simulation = simulateDefault()
    const taxModes = deriveTaxModes(profile, assumptions, de2026Rules)
    const make = (id: ProductId) =>
      makeRowAfterTaxBalance({
        effectiveCashflowProductId: id,
        profile,
        assumptions,
        rules: de2026Rules,
        simulation,
        taxModes,
      })
    expect(make('altersvorsorgedepot')(100_000, 50_000, 0)).toBeNull()
    expect(make('basisrente')(100_000, 50_000, 0)).toBeNull()
    expect(make('riester')(100_000, 50_000, 0)).toBeNull()
    expect(typeof make('etf')(100_000, 50_000, 0)).toBe('number')
    expect(typeof make('bav')(100_000, 50_000, 0)).toBe('number')
    expect(typeof make('versicherung')(100_000, 50_000, 0)).toBe('number')
  })
})
