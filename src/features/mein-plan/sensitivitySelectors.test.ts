import { describe, expect, it } from 'vitest'
import { defaultWorkspace } from '../../storage'
import { addInstanceToWorkspace } from '../inventory/inventoryHelpers'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { de2026Rules } from '../../rules/de2026'
import type { Workspace } from '../../domain/workspace'
import {
  sensitivityIfReturnScenario,
  sensitivityIfRetirementAge,
  sensitivityIfInflation,
  sensitivityIfEtfBump,
} from './sensitivitySelectors'

/**
 * Deep-clone a workspace and ensure it's in combine-mode for the selector
 * to operate. We use `addInstanceToWorkspace` to add one each of bAV + ETF
 * so the selectors have observable per-instance state to perturb.
 */
function buildBaseWorkspace(): Workspace {
  let ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
  ws = { ...ws, mode: 'combine' }
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, 'etf')
  return ws
}

function buildBaseline() {
  const ws = buildBaseWorkspace()
  const bundle = runCombineSimulation(ws, de2026Rules)
  const basisId = 'basis'
  return {
    ws,
    baselineCombined: bundle.combinedByScenarioId[basisId],
    basisId,
  }
}

describe('sensitivitySelectors — public contract', () => {
  it('every selector returns the documented `SensitivityRowResult` shape', () => {
    const { ws, baselineCombined, basisId } = buildBaseline()
    const fns = [
      () => sensitivityIfReturnScenario(ws, baselineCombined, de2026Rules, basisId, 'konservativ'),
      () => sensitivityIfRetirementAge(ws, baselineCombined, de2026Rules, basisId, 70),
      () => sensitivityIfInflation(ws, baselineCombined, de2026Rules, basisId, 0.03),
      () => sensitivityIfEtfBump(ws, baselineCombined, de2026Rules, basisId, 100),
    ]
    for (const fn of fns) {
      const result = fn()
      expect(typeof result.headlineDelta).toBe('number')
      expect(Number.isFinite(result.headlineDelta)).toBe(true)
      expect(typeof result.perInstanceDelta).toBe('object')
      expect(result.perInstanceDelta).not.toBeNull()
      expect(typeof result.perturbedProjectedMonthly).toBe('number')
      expect(Number.isFinite(result.perturbedProjectedMonthly)).toBe(true)
    }
  })

  it('selectors do not mutate the baseline workspace', () => {
    // No-mutation invariant pinned in the module doc-comment. Run every
    // selector, then assert the cloned baseline still equals the original.
    const { ws, baselineCombined, basisId } = buildBaseline()
    const before = JSON.stringify(ws)
    sensitivityIfReturnScenario(ws, baselineCombined, de2026Rules, basisId, 'konservativ')
    sensitivityIfRetirementAge(ws, baselineCombined, de2026Rules, basisId, 70)
    sensitivityIfInflation(ws, baselineCombined, de2026Rules, basisId, 0.03)
    sensitivityIfEtfBump(ws, baselineCombined, de2026Rules, basisId, 100)
    expect(JSON.stringify(ws)).toBe(before)
  })
})

describe('sensitivityIfReturnScenario', () => {
  it('drops the projected monthly when swapping basis → konservativ', () => {
    // Konservativ has a lower annual return than basis (3 % vs 5 % on the
    // default scenario triple), so the perturbed monthly net retirement
    // income should be ≤ baseline for any non-degenerate workspace.
    const { ws, baselineCombined, basisId } = buildBaseline()
    const result = sensitivityIfReturnScenario(
      ws,
      baselineCombined,
      de2026Rules,
      basisId,
      'konservativ',
    )
    expect(result.headlineDelta).toBeLessThanOrEqual(0)
    // The perturbed projection is finite and non-negative.
    expect(result.perturbedProjectedMonthly).toBeGreaterThanOrEqual(0)
    expect(result.note).toBeUndefined()
  })

  it('returns an "unchanged" note when target id equals baseline', () => {
    const { ws, baselineCombined, basisId } = buildBaseline()
    const result = sensitivityIfReturnScenario(
      ws,
      baselineCombined,
      de2026Rules,
      basisId,
      basisId,
    )
    expect(result.note).toBe('unchanged')
    expect(result.headlineDelta).toBe(0)
  })
})

describe('sensitivityIfRetirementAge', () => {
  it('reports a non-zero delta when shifting retirement age to 70', () => {
    const { ws, baselineCombined, basisId } = buildBaseline()
    expect(ws.baseline.profile.retirementAge).not.toBe(70)
    const result = sensitivityIfRetirementAge(ws, baselineCombined, de2026Rules, basisId, 70)
    // Retiring later should not be a no-op for any non-empty workspace.
    expect(result.headlineDelta).not.toBe(0)
    expect(result.note).toBeUndefined()
  })

  it('reports a clamp note when target age exceeds retirementEndAge - 1', () => {
    // retirementEndAge default is 90 → clamp to 89.
    const { ws, baselineCombined, basisId } = buildBaseline()
    const result = sensitivityIfRetirementAge(
      ws,
      baselineCombined,
      de2026Rules,
      basisId,
      95,
    )
    expect(result.note).toBe('retirement_age_clamped')
  })

  it('reports "unchanged" when the target equals the current retirement age', () => {
    const { ws, baselineCombined, basisId } = buildBaseline()
    const currentAge = ws.baseline.profile.retirementAge
    const result = sensitivityIfRetirementAge(
      ws,
      baselineCombined,
      de2026Rules,
      basisId,
      currentAge,
    )
    expect(result.note).toBe('unchanged')
  })
})

describe('sensitivityIfInflation', () => {
  it('does not change nominal monthly when only inflation changes', () => {
    // Inflation only flows into accumulation `realBalance`, not nominal
    // `netMonthlyPayout`. Headline delta on nominal monthly should be
    // approximately 0 (allow a small floating-point margin).
    const { ws, baselineCombined, basisId } = buildBaseline()
    const result = sensitivityIfInflation(ws, baselineCombined, de2026Rules, basisId, 0.03)
    expect(Math.abs(result.headlineDelta)).toBeLessThan(1)
  })

  it('reports "unchanged" when target matches the baseline rate', () => {
    const { ws, baselineCombined, basisId } = buildBaseline()
    const currentRate = ws.baseline.assumptions.inflationRate
    const result = sensitivityIfInflation(
      ws,
      baselineCombined,
      de2026Rules,
      basisId,
      currentRate,
    )
    expect(result.note).toBe('unchanged')
  })
})

describe('sensitivityIfEtfBump', () => {
  it('reports a positive headline delta when bumping ETF contribution by 100 EUR', () => {
    const { ws, baselineCombined, basisId } = buildBaseline()
    const result = sensitivityIfEtfBump(ws, baselineCombined, de2026Rules, basisId, 100)
    // More monthly contribution → more capital → higher monthly net.
    expect(result.headlineDelta).toBeGreaterThan(0)
    expect(result.note).toBeUndefined()
  })

  it('skips with "no_etf_instance" when the workspace has no ETF instance', () => {
    // Strip the ETF instance via a structural clone.
    const ws = buildBaseWorkspace()
    const wsNoEtf: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          etf: [],
        },
      },
    }
    const bundle = runCombineSimulation(wsNoEtf, de2026Rules)
    const baseline = bundle.combinedByScenarioId['basis']
    const result = sensitivityIfEtfBump(wsNoEtf, baseline, de2026Rules, 'basis', 100)
    expect(result.note).toBe('no_etf_instance')
    expect(result.headlineDelta).toBe(0)
    expect(Object.keys(result.perInstanceDelta).length).toBe(0)
  })
})
