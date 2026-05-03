/**
 * Tests for portfolioState helpers (Group G issue 03 — milestone M1.4).
 *
 * The React hook in `portfolioState.ts` delegates to small pure helpers
 * (`forkBaselineScenario`, `rebaseWhatIfStub`, `deepCloneScenario`,
 * `newScenarioId`). Testing the pure helpers covers the load-bearing
 * behaviour without pulling in `@testing-library/react`.
 *
 * Coverage:
 *  - newScenarioId returns a prefixed id.
 *  - deepCloneScenario produces a structural clone (mutating the result does
 *    not affect the source).
 *  - forkBaselineScenario freezes a snapshot at fork time (Decision A3).
 *  - rebaseWhatIfStub refreshes the snapshot but is documented as TODO(P2).
 */

import { describe, expect, it } from 'vitest'
import { defaultProfile } from '../data/defaultScenario'
import { defaultWorkspace } from '../storage'
import {
  deepCloneScenario,
  forkBaselineScenario,
  newScenarioId,
  rebaseWhatIfStub,
  rebaseWhatIf,
} from './portfolioState'
import type { Scenario, WhatIfScenario } from '../domain/workspace'

// ---------------------------------------------------------------------------
// newScenarioId / deepCloneScenario
// ---------------------------------------------------------------------------

describe('portfolioState helpers — newScenarioId', () => {
  it('returns a prefixed id with the requested prefix', () => {
    expect(newScenarioId('whatif')).toMatch(/^whatif-/)
    expect(newScenarioId('baseline')).toMatch(/^baseline-/)
  })
  it('returns distinct ids on subsequent calls', () => {
    const a = newScenarioId('whatif')
    const b = newScenarioId('whatif')
    expect(a).not.toEqual(b)
  })
})

describe('portfolioState helpers — deepCloneScenario', () => {
  it('mutating the clone does not affect the source', () => {
    const source = { foo: { bar: 1 } }
    const clone = deepCloneScenario(source)
    clone.foo.bar = 99
    expect(source.foo.bar).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// forkBaselineScenario — Decision A3 (load-bearing)
// ---------------------------------------------------------------------------

describe('portfolioState helpers — forkBaselineScenario', () => {
  function buildBaseline(): Scenario {
    return {
      ...defaultWorkspace.baseline,
      id: 'baseline-1',
      label: 'Original baseline',
      profile: { ...defaultProfile },
    }
  }

  it('returns a what-if whose derivedFromBaselineId points at the source baseline id', () => {
    const baseline = buildBaseline()
    const whatIf = forkBaselineScenario(baseline, 'experiment')
    expect(whatIf.derivedFromBaselineId).toBe('baseline-1')
    expect(whatIf.label).toBe('experiment')
    expect(whatIf.origin).toBe('manual')
  })

  it('uses the supplied origin when provided', () => {
    const baseline = buildBaseline()
    const whatIf = forkBaselineScenario(baseline, 'recommended', 'recommender')
    expect(whatIf.origin).toBe('recommender')
  })

  it('derivedFromBaselineSnapshot is a STRUCTURAL clone of the baseline at fork time', () => {
    const baseline = buildBaseline()
    const whatIf = forkBaselineScenario(baseline, 'snapshot test')
    expect(whatIf.derivedFromBaselineSnapshot.id).toBe(baseline.id)
    expect(whatIf.derivedFromBaselineSnapshot.profile.age).toBe(baseline.profile.age)
    // The snapshot is a clone, NOT a reference — verify by mutating the source.
    baseline.profile.age = 99
    expect(whatIf.derivedFromBaselineSnapshot.profile.age).not.toBe(99)
  })

  it('mutating the what-if assumptions does not propagate back to the baseline', () => {
    const baseline = buildBaseline()
    const whatIf = forkBaselineScenario(baseline, 'isolation test')
    whatIf.assumptions.inflationRate = 0.99
    expect(baseline.assumptions.inflationRate).not.toBe(0.99)
  })
})

// ---------------------------------------------------------------------------
// rebaseWhatIfStub
// ---------------------------------------------------------------------------

describe('portfolioState helpers — rebaseWhatIfStub', () => {
  it('refreshes derivedFromBaselineSnapshot to match the new baseline (stub behaviour)', () => {
    const baseline: Scenario = {
      ...defaultWorkspace.baseline,
      id: 'baseline-1',
      label: 'Original',
    }
    const whatIf = forkBaselineScenario(baseline, 'stub re-base')
    const newBaseline: Scenario = { ...baseline, label: 'Updated baseline' }
    const rebased = rebaseWhatIfStub(whatIf, newBaseline)
    expect(rebased.derivedFromBaselineSnapshot.label).toBe('Updated baseline')
    expect(rebased.id).toBe(whatIf.id)
  })

  // Issue 07 ships full rebaseWhatIf with diff + re-apply:
  it('rebaseWhatIf preserves user deltas and incorporates new baseline changes', () => {
    const baseline: Scenario = {
      ...defaultWorkspace.baseline,
      id: 'baseline-1',
      label: 'Original',
      assumptions: { ...defaultWorkspace.baseline.assumptions, inflationRate: 0.02 },
    }
    const whatIf = forkBaselineScenario(baseline, 'delta test')

    // User mutates the what-if
    const mutatedWhatIf: WhatIfScenario = {
      ...whatIf,
      assumptions: { ...whatIf.assumptions, inflationRate: 0.05 },
    }

    // Baseline is updated independently
    const newBaseline: Scenario = {
      ...baseline,
      id: 'baseline-2',
      assumptions: { ...baseline.assumptions, retirementEndAge: 95 },
    }

    const rebased = rebaseWhatIf(mutatedWhatIf, newBaseline)
    // User's delta preserved
    expect(rebased.assumptions.inflationRate).toBeCloseTo(0.05)
    // New baseline value incorporated
    expect(rebased.assumptions.retirementEndAge).toBe(95)
    // Snapshot updated to new baseline
    expect(rebased.derivedFromBaselineSnapshot.id).toBe('baseline-2')
    // frozenAt cleared
    expect(rebased.frozenAt).toBeUndefined()
  })
})
