// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getManifest } from './manifest'
import { activeRules } from '../rules'
import { PRODUCT_IDS, PRODUCT_MANIFEST } from '../engine/productRegistry'

describe('getManifest', () => {
  const result = getManifest()

  it('returns ok: true', () => {
    expect(result.ok).toBe(true)
  })

  it('has the expected ApiMeta shape', () => {
    expect(result.meta).toEqual({
      apiVersion: 'v1',
      ruleYear: activeRules.year,
    })
  })

  it('activeRuleYear matches the rules module', () => {
    expect(result.data.activeRuleYear).toBe(activeRules.year)
  })

  it('supportedRuleYears contains the active year', () => {
    expect(result.data.supportedRuleYears).toContain(activeRules.year)
  })

  it('documents that supported rule years are retained for archive re-runs', () => {
    expect((result.data as Record<string, unknown>)['ruleYearRetention']).toEqual({
      policy: 'never_remove_supported_years',
      text: 'Rule years are never removed once added to supportedRuleYears.',
    })
  })

  it('all product IDs from registry are present', () => {
    for (const id of PRODUCT_IDS) {
      expect(result.data.productIds).toContain(id)
    }
  })

  it('products match the registry manifest length', () => {
    expect(result.data.products).toHaveLength(PRODUCT_MANIFEST.length)
  })

  it('products are sorted by registry order', () => {
    const orders = result.data.products.map(p => p.order)
    const sorted = [...orders].sort((a, b) => a - b)
    expect(orders).toEqual(sorted)
  })

  it('includes default profile and assumptions', () => {
    expect(result.data.defaultProfile).toBeDefined()
    expect(result.data.defaultProfile['age']).toBeTypeOf('number')
    expect(result.data.defaultAssumptions).toBeDefined()
    expect((result.data.defaultAssumptions['returnScenarios'] as unknown[]).length).toBeGreaterThan(0)
  })

  it('includes defaultMonthlyNettoBelastungEur', () => {
    expect(result.data.defaultMonthlyNettoBelastungEur).toBeTypeOf('number')
    expect(result.data.defaultMonthlyNettoBelastungEur).toBeGreaterThan(0)
  })

  it('includes comparison capabilities with canonical bounds', () => {
    expect(result.data.comparisonCapabilities.detailLevels).toContain('summary')
    expect(result.data.comparisonCapabilities.monteCarloMinRuns).toBe(100)
    expect(result.data.comparisonCapabilities.monteCarloMaxRuns).toBe(5_000)
    expect(result.data.comparisonCapabilities.monteCarloMaxVolatility).toBe(0.6)
    expect(result.data.comparisonCapabilities.validScenarioIds).toContain('basis')
    expect(result.data.comparisonCapabilities.validScenarioIds).toContain('konservativ')
    expect(result.data.comparisonCapabilities.validScenarioIds).toContain('optimistisch')
    expect(result.data.comparisonCapabilities.validScenarioIds).toContain('custom')
  })

  it('includes disclaimer', () => {
    expect(result.data.disclaimer.type).toBe('not_advice')
    expect(result.data.disclaimer.text).toBeTruthy()
  })

  it('round-trips through JSON serialization', () => {
    const roundTripped = JSON.parse(JSON.stringify(result))
    expect(roundTripped).toEqual(result)
  })
})
