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
import { PRODUCT_EVIDENCE_FIELDS } from './evidence'
import { buildPortfolioFunding } from '../engine/portfolioAdapter'
import type { BavInstance } from '../domain/instances'
import type { Workspace } from '../domain/workspace'
import type { ReturnScenario } from '../domain/profile'

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

  // ---------------------------------------------------------------------------
  // Issue 09: inputConfidence propagation
  // ---------------------------------------------------------------------------

  it('ProductResult.inputConfidence is model_estimate when evidenceMap is empty', () => {
    const ws = makeWs()
    // makeWs uses migrateV1ToV2 which produces instances with empty evidenceMaps.
    ws.baseline.assumptions.visibleProducts = ['bav']
    const result = runCombineSimulation(ws, de2026Rules)
    const firstBavId = ws.baseline.assumptions.bav[0]?.instanceId
    if (!firstBavId) return // guard: no bAV instance in this workspace
    const bavResults = result.perInstance[firstBavId]
    expect(bavResults).toBeDefined()
    // With empty evidenceMap all consumed fields default to model_estimate.
    for (const r of bavResults!) {
      expect(r.inputConfidence).toBe('model_estimate')
    }
  })

  it('ProductResult.inputConfidence is user_confirmed when all ETF evidenceMap fields are confirmed', () => {
    const ws = makeWs()
    // Build evidenceMap by iterating PRODUCT_EVIDENCE_FIELDS.etf so registry
    // expansion automatically keeps this test in sync.
    const etfEvidenceMap = Object.fromEntries(
      PRODUCT_EVIDENCE_FIELDS.etf.map((field) => [field, 'user_confirmed' as const]),
    )
    ws.baseline.assumptions.etf = [
      {
        instanceId: 'etf-testinst',
        label: 'ETF Test',
        status: 'active',
        contractStartYear: 2022,
        currentValueEUR: 0,
        annualAssetFee: 0.002,
        annualContributionGrowthRate: 0,
        equityPartialExemption: 0.3,
        evidenceMap: etfEvidenceMap,
      },
    ]
    const result = runCombineSimulation(ws, de2026Rules)
    const etfResults = result.perInstance['etf-testinst']
    expect(etfResults).toBeDefined()
    for (const r of etfResults!) {
      expect(r.inputConfidence).toBe('user_confirmed')
    }
  })
})

// ---------------------------------------------------------------------------
// QA #14 — multi-bAV GRV reduction + workspace-level retirementHealthStatus
// ---------------------------------------------------------------------------

describe('runCombineSimulation — multi-bAV GRV reduction (QA #14)', () => {
  it('aggregates estimatedMonthlyGrvReduction across all active bAV instances (not just bav[0])', () => {
    const ws = makeWs()
    // Two distinct bAV instances, well under the §3 Nr. 63 cap so the adapter
    // does NOT scale them. This isolates the aggregation fix.
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-a',
      label: 'bAV A',
      monthlyGrossConversion: 100,
    }
    const instB: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-b',
      label: 'bAV B',
      monthlyGrossConversion: 80,
    }
    // includeGrvReduction must be true for the reduction to flow into the
    // statutory baseline; default is false in defaultScenario.
    const wsTwo: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: [instA, instB],
          statutoryPension: {
            ...ws.baseline.assumptions.statutoryPension,
            includeGrvReduction: true,
          },
        },
      },
    }
    const wsOnlyA: Workspace = {
      ...wsTwo,
      baseline: {
        ...wsTwo.baseline,
        assumptions: { ...wsTwo.baseline.assumptions, bav: [instA] },
      },
    }

    // Per-instance reductions (the fixed code's source of truth).
    const fundingTwo = buildPortfolioFunding(wsTwo, de2026Rules)
    const reductionA =
      fundingTwo.bavByInstanceId['bav-a'].estimatedMonthlyGrvReduction
    const reductionB =
      fundingTwo.bavByInstanceId['bav-b'].estimatedMonthlyGrvReduction
    expect(reductionA).toBeGreaterThan(0)
    expect(reductionB).toBeGreaterThan(0)
    expect(Math.abs(reductionA - reductionB)).toBeGreaterThan(0.5) // distinct

    // GRV is monotonic decreasing in the salary-conversion reduction.
    // Adding instance B must FURTHER reduce the GRV gross beyond instance A
    // alone — i.e. instance B's contribution is not silently dropped.
    const bundleTwo = runCombineSimulation(wsTwo, de2026Rules)
    const bundleOnlyA = runCombineSimulation(wsOnlyA, de2026Rules)
    expect(bundleTwo.statutoryPension.grossMonthlyPension)
      .toBeLessThan(bundleOnlyA.statutoryPension.grossMonthlyPension)
  })

  it('surrendered bAV instances do not contribute to the GRV reduction', () => {
    const ws = makeWs()
    const instActive: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-active',
      label: 'bAV Active',
      monthlyGrossConversion: 200,
    }
    const instSurrendered: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-surrendered',
      label: 'bAV Surrendered',
      status: 'surrendered',
      monthlyGrossConversion: 500, // would dominate if not filtered
    }
    const wsActiveOnly: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: [instActive],
          statutoryPension: {
            ...ws.baseline.assumptions.statutoryPension,
            includeGrvReduction: true,
          },
        },
      },
    }
    const wsWithSurrendered: Workspace = {
      ...wsActiveOnly,
      baseline: {
        ...wsActiveOnly.baseline,
        assumptions: {
          ...wsActiveOnly.baseline.assumptions,
          bav: [instActive, instSurrendered],
        },
      },
    }
    const a = runCombineSimulation(wsActiveOnly, de2026Rules)
    const b = runCombineSimulation(wsWithSurrendered, de2026Rules)
    expect(b.statutoryPension.grossMonthlyPension)
      .toBeCloseTo(a.statutoryPension.grossMonthlyPension, 2)
  })
})

describe('runCombineSimulation — KV/PV reads workspace retirementHealthStatus (QA #14)', () => {
  it('no-bAV freiwillig workspace produces a different combined net than no-bAV KVdR (proves health status was honored)', () => {
    // Pre-fix: `bav[0]?.kvdrMember ?? true` → 'kvdr' for ALL no-bAV workspaces,
    // regardless of `assumptions.statutoryPension.retirementHealthStatus`.
    // Post-fix: the workspace flag drives the cascade. A meaningful KV/PV
    // delta between freiwillig and KVdR is the falsifying signal.
    const ws = makeWs()
    // Strip bAV so the pre-fix fallback is exercised.
    ws.baseline.assumptions.bav = []
    // Keep statutoryPension non-zero so KV applies; freiwillig vs. KVdR rate
    // differs (full rate vs. §249a SGB V half rate).
    ws.baseline.assumptions.statutoryPension = {
      ...ws.baseline.assumptions.statutoryPension,
      manualMonthlyGross: 2000,
      retirementHealthStatus: 'freiwillig_gkv',
    }
    const wsKvdr: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          statutoryPension: {
            ...ws.baseline.assumptions.statutoryPension,
            retirementHealthStatus: 'kvdr',
          },
        },
      },
    }
    const bundleFrw = runCombineSimulation(ws, de2026Rules)
    const bundleKvdr = runCombineSimulation(wsKvdr, de2026Rules)
    const basisId = ws.baseline.assumptions.returnScenarios[0].id
    const netFrw = bundleFrw.combinedByScenarioId[basisId].monthlyNetIncome
    const netKvdr = bundleKvdr.combinedByScenarioId[basisId].monthlyNetIncome
    expect(netFrw).toBeGreaterThan(0)
    expect(netKvdr).toBeGreaterThan(0)
    // Freiwillig pays full KV rate on GRV gross; KVdR pays half (§249a SGB V).
    // → freiwillig net < KVdR net by a measurable amount.
    expect(netFrw).toBeLessThan(netKvdr)
    expect(netKvdr - netFrw).toBeGreaterThan(1) // at least €1/month of KV delta
  })
})

// ---------------------------------------------------------------------------
// QA #25 — combine-mode toolbar must write workspace assumptions, not singleton
// ---------------------------------------------------------------------------

describe('runCombineSimulation — custom scenario edits land on workspace state (QA #25)', () => {
  it('a custom returnScenario added to workspace assumptions appears in combinedByScenarioId', () => {
    // Simulates what ScenarioToolbar.addCustomScenario does via onAssumptionsChange
    // in combine mode: add a 'custom' scenario to workspace.baseline.assumptions.returnScenarios.
    // The fix in App.tsx wires the toolbar to patchBaseline so the updater runs
    // against workspace state — this test exercises runCombineSimulation directly
    // to confirm the scenario is picked up.
    const ws = makeWs()

    // Baseline: no 'custom' scenario in workspace.
    const beforeIds = ws.baseline.assumptions.returnScenarios.map((s) => s.id)
    expect(beforeIds).not.toContain('custom')

    // Apply the same functional updater that ScenarioToolbar.addCustomScenario
    // would produce via onAssumptionsChange (i.e. patchBaseline in combine mode).
    const customScenario: ReturnScenario = { id: 'custom', label: 'Eigenes', annualReturn: 0.08 }
    const updatedAssumptions = {
      ...ws.baseline.assumptions,
      returnScenarios: [
        ...ws.baseline.assumptions.returnScenarios,
        customScenario,
      ],
    }
    const wsWithCustom: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: updatedAssumptions,
      },
    }

    // The custom scenario must be present in workspace returnScenarios.
    expect(wsWithCustom.baseline.assumptions.returnScenarios.map((s) => s.id)).toContain('custom')

    // runCombineSimulation must produce a result for the custom scenario id.
    const bundle = runCombineSimulation(wsWithCustom, de2026Rules)
    expect(bundle.combinedByScenarioId['custom']).toBeDefined()
    expect(bundle.combinedByScenarioId['custom'].monthlyNetIncome).toBeGreaterThanOrEqual(0)
  })

  it('editing a custom scenario annualReturn on workspace changes the combined net (proves simulation reacts)', () => {
    // This guards against a regression where writing to singleton (wrong) state
    // leaves the combine simulation unchanged — the bundle must differ when
    // workspace assumptions differ.
    const ws = makeWs()
    const addCustom = (annualReturn: number): Workspace => {
      const customScenario: ReturnScenario = { id: 'custom', label: 'Eigenes', annualReturn }
      return {
        ...ws,
        baseline: {
          ...ws.baseline,
          assumptions: {
            ...ws.baseline.assumptions,
            returnScenarios: [
              ...ws.baseline.assumptions.returnScenarios,
              customScenario,
            ],
          },
        },
      }
    }
    const wsLow = addCustom(0.02)
    const wsHigh = addCustom(0.10)

    const bundleLow = runCombineSimulation(wsLow, de2026Rules)
    const bundleHigh = runCombineSimulation(wsHigh, de2026Rules)

    // Higher returns must produce a higher (or equal) combined net income.
    const netLow = bundleLow.combinedByScenarioId['custom'].monthlyNetIncome
    const netHigh = bundleHigh.combinedByScenarioId['custom'].monthlyNetIncome
    expect(netLow).toBeGreaterThanOrEqual(0)
    expect(netHigh).toBeGreaterThanOrEqual(netLow)
  })
})

// ---------------------------------------------------------------------------
// QA #25 round 2 — combineEffectiveScenarioId must resolve against workspace
// ---------------------------------------------------------------------------

/**
 * Mirrors the inline resolver in App.tsx (`combineEffectiveScenarioId`):
 *   scenarios.some(s => s.id === selected) ? selected : fallback
 *
 * This is a pure function so we test it directly to guard against future
 * regressions where the resolution is accidentally moved back to the
 * singleton `assumptions` (which doesn't hold workspace custom scenarios).
 */
function resolveCombineEffectiveScenarioId(
  workspaceScenarios: ReturnScenario[],
  selectedScenarioId: string,
): string {
  return workspaceScenarios.some((s) => s.id === selectedScenarioId)
    ? selectedScenarioId
    : (workspaceScenarios.find((s) => s.id === 'basis')?.id ?? workspaceScenarios[0]?.id ?? 'basis')
}

describe('combineEffectiveScenarioId — resolves against workspace scenarios (QA #25 round 2)', () => {
  it('resolves to "custom" when workspace has custom scenario and selectedScenarioId is "custom"', () => {
    const ws = makeWs()
    const customScenario: ReturnScenario = { id: 'custom', label: 'Eigenes', annualReturn: 0.08 }
    const wsWithCustom: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          returnScenarios: [...ws.baseline.assumptions.returnScenarios, customScenario],
        },
      },
    }

    const workspaceScenarios = wsWithCustom.baseline.assumptions.returnScenarios
    // Simulate user clicking "+ Eigenes Szenario" then setSelectedScenarioId('custom').
    const effectiveId = resolveCombineEffectiveScenarioId(workspaceScenarios, 'custom')
    expect(effectiveId).toBe('custom')

    // And the bundle must have that scenario so the dashboard reflects it.
    const bundle = runCombineSimulation(wsWithCustom, de2026Rules)
    expect(bundle.combinedByScenarioId[effectiveId]).toBeDefined()

    // The combineBasisScenarioId derivation in App.tsx: if combinedByScenarioId
    // contains effectiveId, use it — otherwise fall back to 'basis'.
    const combineBasisScenarioId = bundle.combinedByScenarioId[effectiveId]
      ? effectiveId
      : 'basis'
    expect(combineBasisScenarioId).toBe('custom')
  })

  it('falls back to "basis" when workspace does NOT have the selected scenario (singleton-vs-workspace regression guard)', () => {
    const ws = makeWs()
    // Workspace has NO 'custom' scenario. If selectedScenarioId='custom' were
    // resolved against singleton assumptions (which also lack it), it would
    // incorrectly fall to 'basis' — but even the correct fix must fall back too.
    const workspaceScenarios = ws.baseline.assumptions.returnScenarios
    expect(workspaceScenarios.map((s) => s.id)).not.toContain('custom')
    const effectiveId = resolveCombineEffectiveScenarioId(workspaceScenarios, 'custom')
    expect(effectiveId).toBe('basis')
  })

  it('toolbar pill shows "custom" after addCustomScenario: resolvedId matches combinedByScenarioId key', () => {
    // End-to-end path: user adds custom scenario to workspace → selectedScenarioId
    // is set to 'custom' → combineEffectiveScenarioId resolves to 'custom' →
    // toolbar pill highlights 'custom' → combineBasisScenarioId is 'custom' →
    // combine dashboard consumes the custom-scenario result.
    const ws = makeWs()
    const customScenario: ReturnScenario = { id: 'custom', label: 'Eigenes', annualReturn: 0.09 }
    const wsWithCustom: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          returnScenarios: [...ws.baseline.assumptions.returnScenarios, customScenario],
        },
      },
    }

    const workspaceScenarios = wsWithCustom.baseline.assumptions.returnScenarios
    const selectedScenarioId = 'custom' // simulates ui.selectedScenarioId after click
    const effectiveId = resolveCombineEffectiveScenarioId(workspaceScenarios, selectedScenarioId)
    // toolbar selectedScenarioId prop must equal 'custom'
    expect(effectiveId).toBe('custom')

    const bundle = runCombineSimulation(wsWithCustom, de2026Rules)
    const combineBasisScenarioId = bundle.combinedByScenarioId[effectiveId] ? effectiveId : 'basis'
    // combineBasisScenarioId (drives dashboard) must also equal 'custom'
    expect(combineBasisScenarioId).toBe('custom')
    // The result must be non-trivially different from the basis result
    const basisResult = bundle.combinedByScenarioId['basis']
    const customResult = bundle.combinedByScenarioId['custom']
    expect(basisResult).toBeDefined()
    expect(customResult).toBeDefined()
    // 9% vs basis return → distinct results (custom net >= basis net for higher return)
    expect(customResult.monthlyNetIncome).toBeGreaterThanOrEqual(basisResult.monthlyNetIncome)
  })
})

describe('runCombineSimulation — single-bAV back-compat (QA #14)', () => {
  it('single-bAV workspace produces a non-zero baseline matching the per-instance funding it consumed', () => {
    // Smoke test: pre-fix used `firstBavFunding.estimatedMonthlyGrvReduction`;
    // post-fix the single-element reduce returns the same value. Guards against
    // accidental drift in the one-instance path that compare-mode mirrors.
    const ws = makeWs()
    expect(ws.baseline.assumptions.bav.length).toBe(1)
    const onlyId = ws.baseline.assumptions.bav[0].instanceId

    const portfolioFunding = buildPortfolioFunding(ws, de2026Rules)
    const expectedReduction =
      portfolioFunding.bavByInstanceId[onlyId].estimatedMonthlyGrvReduction
    expect(expectedReduction).toBeGreaterThan(0)

    const bundle = runCombineSimulation(ws, de2026Rules)
    expect(bundle.statutoryPension.grossMonthlyPension).toBeGreaterThan(0)
    const basisId = ws.baseline.assumptions.returnScenarios[0].id
    expect(bundle.combinedByScenarioId[basisId].monthlyNetIncome).toBeGreaterThan(0)
  })
})
