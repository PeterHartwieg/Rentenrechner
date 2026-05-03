/**
 * Smoke tests for `useCombineSimulation`.
 *
 * Coverage:
 *   - Empty workspace → GRV-only combined result, no errors.
 *   - Workspace with one bAV instance → per-instance result + non-zero combined net.
 *   - Routing differences for `pensionBaselineType` (grv vs beamten vs none).
 *
 * The hook is pure (only useMemo); we call its inner factory by invoking the
 * hook in a renderHook environment.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import { runCombineSimulation } from './useCombineSimulation'

function makeWs() {
  const v1 = {
    ...defaultAssumptions,
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
  }
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
}

describe('useCombineSimulation', () => {
  it('runs simulatePortfolio + combinePortfolio per scenario', () => {
    const ws = makeWs()
    ws.baseline.assumptions.visibleProducts = ['bav']
    const result = { current: runCombineSimulation(ws, de2026Rules) }
    expect(result.current.statutoryPension.grossMonthlyPension).toBeGreaterThan(0)
    const scenarioIds = ws.baseline.assumptions.returnScenarios.map((s) => s.id)
    for (const id of scenarioIds) {
      const combined = result.current.combinedByScenarioId[id]
      expect(combined).toBeDefined()
      expect(combined.monthlyNetIncome).toBeGreaterThan(0)
      expect(combined.statutoryPensionMonthlyNet).toBeGreaterThan(0)
    }
  })

  it('handles a clean-slate (no instances, no GRV) without errors', () => {
    const ws = makeWs()
    // Strip all instances + statutory pension.
    ws.baseline.assumptions.bav = []
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []
    ws.baseline.assumptions.statutoryPension = {
      ...defaultAssumptions.statutoryPension,
      pensionBaselineType: 'none',
      manualMonthlyGross: 0,
      currentEntgeltpunkte: 0,
    }
    const result = { current: runCombineSimulation(ws, de2026Rules) }
    const firstScenario = ws.baseline.assumptions.returnScenarios[0].id
    const combined = result.current.combinedByScenarioId[firstScenario]
    expect(combined.monthlyNetIncome).toBe(0)
    expect(combined.statutoryPensionMonthlyNet).toBe(0)
  })

  it('routes Beamtenpension through the bav_versorgungsbezug tax channel', () => {
    const ws = makeWs()
    // Strip Basisrente / AVD / Riester so only Beamten + bAV hit the tax base.
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []
    ws.baseline.assumptions.statutoryPension = {
      ...defaultAssumptions.statutoryPension,
      pensionBaselineType: 'beamtenpension',
      manualMonthlyGross: 2_500,
    }
    const result = { current: runCombineSimulation(ws, de2026Rules) }
    const scenarioId = ws.baseline.assumptions.returnScenarios[0].id
    const combined = result.current.combinedByScenarioId[scenarioId]
    // Beamten gross is NOT in `statutoryPensionTaxable` (which is the GRV
    // Besteuerungsanteil channel) — it routes through bavPensionTaxable.
    expect(combined.aggregateTax.statutoryPensionTaxable).toBe(0)
    // The Beamten gross plus any bAV instance gross feeds into the
    // bavPensionTaxable channel.
    expect(combined.aggregateTax.bavPensionTaxable).toBeGreaterThan(0)
  })
})
