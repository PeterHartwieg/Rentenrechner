// @vitest-environment node
/**
 * Tests for the comparison API facade.
 *
 * Verifies shape, parity with the manual pipeline, and edge cases.
 */
import { describe, it, expect } from 'vitest'
import { runComparison } from './comparison'
import type { ComparisonResponse } from './comparison'
import { defaultProfile, defaultAssumptions, DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR } from '../data/defaultScenario'
import { normalizeMonthlyNettoBelastung, syncMonthlyContributions } from '../app/syncContributions'
import { simulateRetirementComparison } from '../engine/simulate'
import { resolveRuleYear } from './rules'
import {
  resolveEffectiveScenarioId,
  deriveSelectedResults,
  deriveBestCapital,
  deriveBestPension,
} from '../app/simulationSelectors'

// ---------------------------------------------------------------------------
// 1. Default comparison — succeeds with expected shape
// ---------------------------------------------------------------------------

describe('runComparison', () => {
  it('succeeds with default inputs and returns expected shape', () => {
    const result = runComparison({})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const data = result.data

    // Meta envelope
    expect(result.meta.apiVersion).toBe('v1')
    expect(typeof result.meta.ruleYear).toBe('number')

    // Top-level fields
    expect(data.effectiveScenarioId).toBe('basis')
    expect(data.effectiveMonthlyNettoBelastungEur).toBe(DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR)
    expect(Array.isArray(data.productManifest)).toBe(true)
    expect(data.productManifest.length).toBeGreaterThan(0)

    // Statutory pension
    expect(typeof data.statutoryPension.grossMonthlyPension).toBe('number')
    expect(typeof data.statutoryPension.netMonthlyPension).toBe('number')

    // Funding summaries
    expect(typeof data.fundingSummaries.bav.monthlyGrossConversion).toBe('number')
    expect(typeof data.fundingSummaries.bav.monthlyNetCost).toBe('number')
    expect(typeof data.fundingSummaries.basisrente.monthlyGross).toBe('number')
    expect(typeof data.fundingSummaries.altersvorsorgedepot.monthlyOwn).toBe('number')
    expect(typeof data.fundingSummaries.riester.monthlyOwn).toBe('number')

    // Selected results — default visibleProducts is ['etf', 'bav']
    expect(Array.isArray(data.selectedResults)).toBe(true)
    expect(data.selectedResults.length).toBe(2)
    const ids = data.selectedResults.map((r) => r.productId)
    expect(ids).toContain('etf')
    expect(ids).toContain('bav')

    // Best capital / pension
    expect(data.bestCapital === null || typeof data.bestCapital.productId === 'string').toBe(true)
    expect(data.bestPension === null || typeof data.bestPension.productId === 'string').toBe(true)

    // Tax diagnostics
    expect(typeof data.taxDiagnostics.insuranceTaxMode).toBe('string')
    expect(typeof data.taxDiagnostics.insuranceContractRuntime).toBe('number')
    expect(typeof data.taxDiagnostics.bavLumpSumTaxMode).toBe('string')
    expect(typeof data.taxDiagnostics.kvdrMember).toBe('boolean')
  })

  // ---------------------------------------------------------------------------
  // 2. Parity with manual pipeline
  // ---------------------------------------------------------------------------

  it('matches the manual pipeline for key numbers', () => {
    const ruleResult = resolveRuleYear()
    if (!ruleResult.ok) throw new Error('resolveRuleYear failed')
    const { rules } = ruleResult.data

    const netto = normalizeMonthlyNettoBelastung(DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR)
    const synced = syncMonthlyContributions(netto, defaultAssumptions, defaultProfile, rules)
    const simulation = simulateRetirementComparison(defaultProfile, synced, rules)
    const scenarioId = resolveEffectiveScenarioId(synced, 'basis')
    const selected = deriveSelectedResults(simulation, synced.visibleProducts, scenarioId)
    const bestCap = deriveBestCapital(selected)
    const bestPen = deriveBestPension(selected)

    const apiResult = runComparison({})
    expect(apiResult.ok).toBe(true)
    if (!apiResult.ok) return
    const data = apiResult.data

    // Capital at retirement must match for each visible product
    for (const engineResult of selected) {
      const apiProduct = data.selectedResults.find((r) => r.productId === engineResult.productId)
      expect(apiProduct).toBeDefined()
      expect(apiProduct!.capitalAtRetirement).toBe(engineResult.capitalAtRetirement)
      expect(apiProduct!.netMonthlyPayout).toBe(engineResult.netMonthlyPayout)
      expect(apiProduct!.monthlyUserCost).toBe(engineResult.monthlyUserCost)
    }

    // bAV funding
    expect(data.fundingSummaries.bav.monthlyNetCost).toBe(simulation.bavFunding.monthlyNetCost)

    // Best capital / pension
    if (bestCap) {
      expect(data.bestCapital).not.toBeNull()
      expect(data.bestCapital!.capitalAtRetirement).toBe(bestCap.capitalAtRetirement)
    } else {
      expect(data.bestCapital).toBeNull()
    }
    if (bestPen) {
      expect(data.bestPension).not.toBeNull()
      expect(data.bestPension!.netMonthlyPayout).toBe(bestPen.netMonthlyPayout)
    } else {
      expect(data.bestPension).toBeNull()
    }
  })

  // ---------------------------------------------------------------------------
  // 3. Custom net anchor
  // ---------------------------------------------------------------------------

  it('produces higher numbers with a larger net anchor', () => {
    const defaultResult = runComparison({})
    const higherResult = runComparison({ monthlyNettoBelastungEur: 500 })

    expect(defaultResult.ok).toBe(true)
    expect(higherResult.ok).toBe(true)
    if (!defaultResult.ok || !higherResult.ok) return

    expect(higherResult.data.effectiveMonthlyNettoBelastungEur).toBe(500)

    // At least one product should have higher capital at retirement
    const defaultEtf = defaultResult.data.selectedResults.find((r) => r.productId === 'etf')
    const higherEtf = higherResult.data.selectedResults.find((r) => r.productId === 'etf')
    expect(defaultEtf).toBeDefined()
    expect(higherEtf).toBeDefined()
    expect(higherEtf!.capitalAtRetirement).toBeGreaterThan(defaultEtf!.capitalAtRetirement)
    expect(higherEtf!.netMonthlyPayout).toBeGreaterThan(defaultEtf!.netMonthlyPayout)
  })

  // ---------------------------------------------------------------------------
  // 4. Custom scenario
  // ---------------------------------------------------------------------------

  it('selects the requested scenario when valid', () => {
    const result = runComparison({ selectedScenarioId: 'konservativ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.effectiveScenarioId).toBe('konservativ')
    // All selected results should carry the konservativ scenario
    for (const r of result.data.selectedResults) {
      expect(r.scenarioId).toBe('konservativ')
    }
  })

  // ---------------------------------------------------------------------------
  // 5. Empty visibleProducts
  // ---------------------------------------------------------------------------

  it('returns empty selectedResults with no errors when visibleProducts is []', () => {
    const result = runComparison({ assumptions: { visibleProducts: [] } })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.selectedResults).toEqual([])
    expect(result.data.bestCapital).toBeNull()
    expect(result.data.bestPension).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // 6. Invalid input
  // ---------------------------------------------------------------------------

  it('returns an error envelope for invalid profile', () => {
    const result = runComparison({ profile: { age: 5 } as never })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.path.includes('age'))).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // 7. Unsupported rule year
  // ---------------------------------------------------------------------------

  it('returns an error for unsupported rule year', () => {
    const result = runComparison({ ruleYear: 9999 })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_RULE_YEAR')).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // 8. JSON serializable
  // ---------------------------------------------------------------------------

  it('response round-trips through JSON.parse(JSON.stringify(...))', () => {
    const result = runComparison({})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const json = JSON.stringify(result.data)
    const parsed = JSON.parse(json) as ComparisonResponse

    expect(parsed.effectiveScenarioId).toBe(result.data.effectiveScenarioId)
    expect(parsed.effectiveMonthlyNettoBelastungEur).toBe(
      result.data.effectiveMonthlyNettoBelastungEur,
    )
    expect(parsed.selectedResults.length).toBe(result.data.selectedResults.length)
    for (let i = 0; i < parsed.selectedResults.length; i++) {
      expect(parsed.selectedResults[i].capitalAtRetirement).toBe(
        result.data.selectedResults[i].capitalAtRetirement,
      )
      expect(parsed.selectedResults[i].netMonthlyPayout).toBe(
        result.data.selectedResults[i].netMonthlyPayout,
      )
    }
    expect(parsed.statutoryPension.grossMonthlyPension).toBe(
      result.data.statutoryPension.grossMonthlyPension,
    )
  })

  // ---------------------------------------------------------------------------
  // 9. No yearly rows in summary
  // ---------------------------------------------------------------------------

  it('does not include yearly rows in selectedResults entries', () => {
    const result = runComparison({})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    for (const r of result.data.selectedResults) {
      expect((r as unknown as Record<string, unknown>).rows).toBeUndefined()
    }
    if (result.data.bestCapital) {
      expect((result.data.bestCapital as unknown as Record<string, unknown>).rows).toBeUndefined()
    }
    if (result.data.bestPension) {
      expect((result.data.bestPension as unknown as Record<string, unknown>).rows).toBeUndefined()
    }
  })

  // ---------------------------------------------------------------------------
  // 10. Summary detail (default) — has detailLevel, no extra sections
  // ---------------------------------------------------------------------------

  it('defaults to summary detail with no extra sections', () => {
    const result = runComparison({})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.detailLevel).toBe('summary')
    expect(result.data.allScenarioResults).toBeUndefined()
    expect(result.data.yearlyRows).toBeUndefined()
    expect(result.data.etfPayoutRows).toBeUndefined()
    expect(result.data.monteCarlo).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // 11. Standard detail — allScenarioResults, no yearlyRows
  // ---------------------------------------------------------------------------

  it('standard detail includes allScenarioResults but no yearlyRows', () => {
    const result = runComparison({ detailLevel: 'standard' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.detailLevel).toBe('standard')
    expect(result.data.allScenarioResults).toBeDefined()
    expect(Array.isArray(result.data.allScenarioResults)).toBe(true)

    // Default: 2 visible products (etf, bav) × 3 scenarios = 6 entries
    expect(result.data.allScenarioResults!.length).toBe(6)

    // Verify we have entries for all 3 scenarios
    const scenarioIds = new Set(result.data.allScenarioResults!.map((r) => r.scenarioId))
    expect(scenarioIds.size).toBe(3)

    // No full-detail sections
    expect(result.data.yearlyRows).toBeUndefined()
    expect(result.data.etfPayoutRows).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // 12. Full detail — allScenarioResults, yearlyRows, etfPayoutRows
  // ---------------------------------------------------------------------------

  it('full detail includes allScenarioResults, yearlyRows, and etfPayoutRows', () => {
    const result = runComparison({ detailLevel: 'full' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.detailLevel).toBe('full')
    expect(result.data.allScenarioResults).toBeDefined()
    expect(result.data.allScenarioResults!.length).toBeGreaterThan(0)

    // Yearly rows
    expect(result.data.yearlyRows).toBeDefined()
    expect(result.data.yearlyRows!.length).toBeGreaterThan(0)

    const firstRow = result.data.yearlyRows![0]
    expect(typeof firstRow.productId).toBe('string')
    expect(typeof firstRow.scenarioId).toBe('string')
    expect(typeof firstRow.year).toBe('number')
    expect(typeof firstRow.age).toBe('number')
    expect(typeof firstRow.balance).toBe('number')
    expect(typeof firstRow.contribution).toBe('number')
    expect(typeof firstRow.fees).toBe('number')
    expect(typeof firstRow.returnAmount).toBe('number')

    // ETF payout rows
    expect(result.data.etfPayoutRows).toBeDefined()
    expect(result.data.etfPayoutRows!.length).toBeGreaterThan(0)

    const firstPayout = result.data.etfPayoutRows![0]
    expect(typeof firstPayout.year).toBe('number')
    expect(typeof firstPayout.age).toBe('number')
    expect(typeof firstPayout.grossPayout).toBe('number')
    expect(typeof firstPayout.netPayout).toBe('number')
    expect(typeof firstPayout.remainingCapital).toBe('number')
    expect(typeof firstPayout.taxPaid).toBe('number')
  })

  // ---------------------------------------------------------------------------
  // 13. Summary numbers match across detail levels
  // ---------------------------------------------------------------------------

  it('selectedResults are identical across summary and full detail levels', () => {
    const summaryResult = runComparison({})
    const fullResult = runComparison({ detailLevel: 'full' })

    expect(summaryResult.ok).toBe(true)
    expect(fullResult.ok).toBe(true)
    if (!summaryResult.ok || !fullResult.ok) return

    expect(summaryResult.data.selectedResults.length).toBe(fullResult.data.selectedResults.length)
    for (let i = 0; i < summaryResult.data.selectedResults.length; i++) {
      const s = summaryResult.data.selectedResults[i]
      const f = fullResult.data.selectedResults[i]
      expect(s.productId).toBe(f.productId)
      expect(s.capitalAtRetirement).toBe(f.capitalAtRetirement)
      expect(s.netMonthlyPayout).toBe(f.netMonthlyPayout)
      expect(s.monthlyUserCost).toBe(f.monthlyUserCost)
      expect(s.totalFees).toBe(f.totalFees)
    }
  })

  // ---------------------------------------------------------------------------
  // 14. Monte Carlo at summary with explicit flag
  // ---------------------------------------------------------------------------

  it('includes monteCarlo at summary detail when includeMonteCarlo is true', () => {
    const result = runComparison({ includeMonteCarlo: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.detailLevel).toBe('summary')
    expect(result.data.monteCarlo).toBeDefined()
    expect(result.data.monteCarlo).not.toBeNull()

    const mc = result.data.monteCarlo!
    expect(typeof mc.scenarioId).toBe('string')
    expect(typeof mc.annualReturn).toBe('number')
    expect(typeof mc.annualVolatility).toBe('number')
    expect(typeof mc.runs).toBe('number')
    expect(typeof mc.seed).toBe('number')
    expect(Array.isArray(mc.productSummaries)).toBe(true)
    expect(mc.productSummaries.length).toBe(2) // etf + bav (default visible)

    // Summary detail does not include yearly bands
    expect(mc.yearlyBands).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // 15. Monte Carlo determinism — same seed, same results
  // ---------------------------------------------------------------------------

  it('produces identical Monte Carlo results with the same seed', () => {
    const r1 = runComparison({ includeMonteCarlo: true })
    const r2 = runComparison({ includeMonteCarlo: true })

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (!r1.ok || !r2.ok) return

    expect(r1.data.monteCarlo).toBeDefined()
    expect(r2.data.monteCarlo).toBeDefined()

    const mc1 = r1.data.monteCarlo!
    const mc2 = r2.data.monteCarlo!

    expect(mc1.seed).toBe(mc2.seed)
    expect(mc1.productSummaries.length).toBe(mc2.productSummaries.length)
    for (let i = 0; i < mc1.productSummaries.length; i++) {
      expect(mc1.productSummaries[i].expectedCapital).toBe(mc2.productSummaries[i].expectedCapital)
      expect(mc1.productSummaries[i].expectedNetMonthlyPayout).toBe(
        mc2.productSummaries[i].expectedNetMonthlyPayout,
      )
      expect(mc1.productSummaries[i].capital.p50).toBe(mc2.productSummaries[i].capital.p50)
    }
  })

  // ---------------------------------------------------------------------------
  // 16. Monte Carlo with empty visible products
  // ---------------------------------------------------------------------------

  it('returns monteCarlo: null when visibleProducts is empty', () => {
    const result = runComparison({
      assumptions: { visibleProducts: [] },
      includeMonteCarlo: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // MC was requested but no products to simulate → null
    expect(result.data.monteCarlo).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // 17. Full detail includes MC yearly bands
  // ---------------------------------------------------------------------------

  it('full detail does not auto-trigger MC; includes yearlyBands when MC explicitly requested', () => {
    // Full detail alone does NOT trigger MC
    const withoutMc = runComparison({ detailLevel: 'full' })
    expect(withoutMc.ok).toBe(true)
    if (!withoutMc.ok) return
    expect(withoutMc.data.monteCarlo).toBeUndefined()

    // Full + explicit MC includes yearly bands
    const result = runComparison({ detailLevel: 'full', includeMonteCarlo: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.monteCarlo).toBeDefined()
    expect(result.data.monteCarlo).not.toBeNull()

    const mc = result.data.monteCarlo!
    expect(mc.yearlyBands).toBeDefined()
    expect(Array.isArray(mc.yearlyBands)).toBe(true)
    expect(mc.yearlyBands!.length).toBeGreaterThan(0)

    const firstBand = mc.yearlyBands![0]
    expect(typeof firstBand.productId).toBe('string')
    expect(typeof firstBand.year).toBe('number')
    expect(typeof firstBand.age).toBe('number')
    expect(typeof firstBand.p10).toBe('number')
    expect(typeof firstBand.p50).toBe('number')
    expect(typeof firstBand.p90).toBe('number')
  })

  // ---------------------------------------------------------------------------
  // 18. Standard detail MC has no yearly bands
  // ---------------------------------------------------------------------------

  it('standard detail MC has no yearlyBands', () => {
    const result = runComparison({ detailLevel: 'standard', includeMonteCarlo: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.monteCarlo).toBeDefined()
    expect(result.data.monteCarlo).not.toBeNull()
    expect(result.data.monteCarlo!.yearlyBands).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // 19. JSON serializable at full detail
  // ---------------------------------------------------------------------------

  it('full detail response round-trips through JSON', () => {
    const result = runComparison({ detailLevel: 'full', includeMonteCarlo: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const json = JSON.stringify(result.data)
    const parsed = JSON.parse(json) as ComparisonResponse

    // Core fields
    expect(parsed.detailLevel).toBe('full')
    expect(parsed.effectiveScenarioId).toBe(result.data.effectiveScenarioId)
    expect(parsed.selectedResults.length).toBe(result.data.selectedResults.length)

    // All scenario results
    expect(parsed.allScenarioResults).toBeDefined()
    expect(parsed.allScenarioResults!.length).toBe(result.data.allScenarioResults!.length)

    // Yearly rows
    expect(parsed.yearlyRows).toBeDefined()
    expect(parsed.yearlyRows!.length).toBe(result.data.yearlyRows!.length)
    for (let i = 0; i < parsed.yearlyRows!.length; i++) {
      expect(parsed.yearlyRows![i].balance).toBe(result.data.yearlyRows![i].balance)
    }

    // ETF payout rows
    expect(parsed.etfPayoutRows).toBeDefined()
    expect(parsed.etfPayoutRows!.length).toBe(result.data.etfPayoutRows!.length)

    // Monte Carlo
    expect(parsed.monteCarlo).toBeDefined()
    expect(parsed.monteCarlo!.productSummaries.length).toBe(
      result.data.monteCarlo!.productSummaries.length,
    )
    expect(parsed.monteCarlo!.yearlyBands).toBeDefined()
    expect(parsed.monteCarlo!.yearlyBands!.length).toBe(
      result.data.monteCarlo!.yearlyBands!.length,
    )
  })

  // ---------------------------------------------------------------------------
  // 20. Manifest cloning — mutation does not leak to subsequent calls
  // ---------------------------------------------------------------------------

  it('productManifest is cloned per response — mutation does not affect later calls', () => {
    const r1 = runComparison({})
    expect(r1.ok).toBe(true)
    if (!r1.ok) return

    const originalLabel = r1.data.productManifest[0].label
    // Mutate the response manifest (cast through unknown — the TS type is
    // readonly, but at runtime the cloned array is mutable; this test pins
    // that the engine snapshot is not the same reference as the response).
    ;(r1.data.productManifest as unknown as Array<{ label: string }>)[0].label = 'MUTATED'

    const r2 = runComparison({})
    expect(r2.ok).toBe(true)
    if (!r2.ok) return

    // Second call must see the unmutated label
    expect(r2.data.productManifest[0].label).toBe(originalLabel)
    expect(r2.data.productManifest[0].label).not.toBe('MUTATED')
  })
})
