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

  // Codex P2 regression: workspace with only paid_up ETF contracts must not
  // surface 'no_etf_instance' — it must surface 'etf_paid_up_only' so the UI
  // can show "ETF-Vertrag vorhanden, aber beitragsfrei" instead of the
  // misleading "Noch kein ETF-Sparplan im Plan".
  it('surfaces "etf_paid_up_only" when all ETF instances are paid_up', () => {
    const ws = buildBaseWorkspace()
    // Force the ETF instance to paid_up status.
    const wsPaidUpEtf: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          etf: ws.baseline.assumptions.etf.map((inst) => ({
            ...inst,
            status: 'paid_up' as const,
          })),
        },
      },
    }
    const bundle = runCombineSimulation(wsPaidUpEtf, de2026Rules)
    const baseline = bundle.combinedByScenarioId['basis']
    const result = sensitivityIfEtfBump(wsPaidUpEtf, baseline, de2026Rules, 'basis', 100)
    // Must NOT be 'no_etf_instance' — an ETF contract exists.
    expect(result.note).toBe('etf_paid_up_only')
    expect(result.note).not.toBe('no_etf_instance')
    expect(result.headlineDelta).toBe(0)
  })

  // CR Minor regression (R5): surrendered/offered ETF instances must NOT use the
  // 'etf_paid_up_only' note — that copy is misleading when no beitragsfrei
  // contract exists. Must fall back to 'no_etf_instance'.
  it('surfaces "no_etf_instance" when the ETF instance is surrendered (not paid_up)', () => {
    const ws = buildBaseWorkspace()
    const wsSurrendered: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          etf: ws.baseline.assumptions.etf.map((inst) => ({
            ...inst,
            status: 'surrendered' as const,
          })),
        },
      },
    }
    const bundle = runCombineSimulation(wsSurrendered, de2026Rules)
    const baseline = bundle.combinedByScenarioId['basis']
    const result = sensitivityIfEtfBump(wsSurrendered, baseline, de2026Rules, 'basis', 100)
    expect(result.note).toBe('no_etf_instance')
    expect(result.note).not.toBe('etf_paid_up_only')
    expect(result.headlineDelta).toBe(0)
  })

  it('surfaces "no_etf_instance" when ETF instances are a mix of paid_up + surrendered', () => {
    // Mixed: one paid_up + one surrendered → not "all paid_up" → 'no_etf_instance'.
    const ws = buildBaseWorkspace()
    // The base workspace adds one ETF instance; add a second one.
    const wsTwo = addInstanceToWorkspace(ws, 'etf')
    const etfInstances = wsTwo.baseline.assumptions.etf
    const wsMixed: Workspace = {
      ...wsTwo,
      baseline: {
        ...wsTwo.baseline,
        assumptions: {
          ...wsTwo.baseline.assumptions,
          etf: etfInstances.map((inst, idx) => ({
            ...inst,
            status: (idx === 0 ? 'paid_up' : 'surrendered') as 'paid_up' | 'surrendered',
          })),
        },
      },
    }
    const bundle = runCombineSimulation(wsMixed, de2026Rules)
    const baseline = bundle.combinedByScenarioId['basis']
    const result = sensitivityIfEtfBump(wsMixed, baseline, de2026Rules, 'basis', 100)
    expect(result.note).toBe('no_etf_instance')
    expect(result.note).not.toBe('etf_paid_up_only')
    expect(result.headlineDelta).toBe(0)
  })
})

// Codex P3 regression: when retirementAge (69) + retirementEndAge (70) causes
// the clamp to collapse the perturbation to a no-op delta, the note must be
// 'retirement_age_clamped' — NOT 'unchanged' — so the row does not render
// "mit 70 Jahren ±0 €/Mon." without any explanation.
describe('sensitivityIfRetirementAge — clamp-no-op regression (Codex P3)', () => {
  it('preserves clamp note when clamped value equals current retirementAge', () => {
    const ws = buildBaseWorkspace()
    // Arrange: retirementAge = 69, retirementEndAge = 70.
    // Requested age = 70 → clamp fires → targetAge = 69 = currentAge.
    const wsEdge: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        profile: {
          ...ws.baseline.profile,
          retirementAge: 69,
        },
        assumptions: {
          ...ws.baseline.assumptions,
          retirementEndAge: 70,
        },
      },
    }
    const bundle = runCombineSimulation(wsEdge, de2026Rules)
    const baseline = bundle.combinedByScenarioId['basis']
    // Request retirement at 70 — the clamp fires (max = 70 - 1 = 69 = current).
    const result = sensitivityIfRetirementAge(wsEdge, baseline, de2026Rules, 'basis', 70)
    // The clamp signal must be preserved — NOT 'unchanged'.
    expect(result.note).toBe('retirement_age_clamped')
    expect(result.note).not.toBe('unchanged')
    // Delta is zero because the clamped target equals the current age.
    expect(result.headlineDelta).toBe(0)
  })
})
