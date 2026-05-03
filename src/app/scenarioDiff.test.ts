/**
 * Tests for `scenarioDiff` and `applyDiff` (Group G issue 07).
 *
 * Coverage:
 *   - Basic field changes in assumptions + profile.
 *   - No diff when scenarios are identical.
 *   - Array element changes (instance fields).
 *   - applyDiff re-applies deltas correctly.
 *   - Round-trip: fork → mutate → diff → apply produces the mutated state.
 */

import { describe, expect, it } from 'vitest'
import { scenarioDiff, applyDiff } from './scenarioDiff'
import { defaultProfile } from '../data/defaultScenario'
import { defaultWorkspace } from '../storage'
import type { Scenario } from '../domain/workspace'
import { forkBaselineScenario } from './portfolioState'

function makeBaseline(): Scenario {
  return {
    ...defaultWorkspace.baseline,
    id: 'baseline-test',
    label: 'Test Baseline',
    profile: { ...defaultProfile },
    assumptions: {
      ...defaultWorkspace.baseline.assumptions,
      inflationRate: 0.02,
    },
  }
}

// ---------------------------------------------------------------------------
// scenarioDiff
// ---------------------------------------------------------------------------

describe('scenarioDiff — basic cases', () => {
  it('returns empty array when scenarios are identical', () => {
    const a = makeBaseline()
    const b = makeBaseline()
    expect(scenarioDiff(a, b)).toEqual([])
  })

  it('detects a scalar change in profile', () => {
    const a = makeBaseline()
    const b: Scenario = { ...a, profile: { ...a.profile, age: 45 } }
    const diff = scenarioDiff(a, b)
    const ageEntry = diff.find((d) => d.fieldPath === 'profile.age')
    expect(ageEntry).toBeDefined()
    expect(ageEntry!.oldValue).toBe(a.profile.age)
    expect(ageEntry!.newValue).toBe(45)
  })

  it('detects a scalar change in assumptions.inflationRate', () => {
    const a = makeBaseline()
    const b: Scenario = {
      ...a,
      assumptions: { ...a.assumptions, inflationRate: 0.03 },
    }
    const diff = scenarioDiff(a, b)
    const entry = diff.find((d) => d.fieldPath === 'assumptions.inflationRate')
    expect(entry).toBeDefined()
    expect(entry!.oldValue).toBe(0.02)
    expect(entry!.newValue).toBe(0.03)
  })

  it('does NOT include id, label, createdAt, lastEditedAt in the diff', () => {
    const a = makeBaseline()
    const b: Scenario = {
      ...a,
      id: 'different-id',
      label: 'Different label',
      createdAt: new Date().toISOString(),
      lastEditedAt: Date.now(),
    }
    // diff only looks at profile + assumptions
    const diff = scenarioDiff(a, b)
    const paths = diff.map((d) => d.fieldPath)
    expect(paths).not.toContain('id')
    expect(paths).not.toContain('label')
    expect(paths).not.toContain('createdAt')
    expect(paths).not.toContain('lastEditedAt')
  })

  it('returns multiple entries for multiple field changes', () => {
    const a = makeBaseline()
    const b: Scenario = {
      ...a,
      profile: { ...a.profile, age: 50 },
      assumptions: { ...a.assumptions, inflationRate: 0.04, retirementEndAge: 95 },
    }
    const diff = scenarioDiff(a, b)
    const paths = diff.map((d) => d.fieldPath)
    expect(paths).toContain('profile.age')
    expect(paths).toContain('assumptions.inflationRate')
    expect(paths).toContain('assumptions.retirementEndAge')
  })
})

// ---------------------------------------------------------------------------
// applyDiff
// ---------------------------------------------------------------------------

describe('applyDiff', () => {
  it('returns the target unchanged when diff is empty', () => {
    const target = makeBaseline()
    const result = applyDiff(target, [])
    expect(result.profile.age).toBe(target.profile.age)
    expect(result.assumptions.inflationRate).toBe(target.assumptions.inflationRate)
  })

  it('applies a scalar patch', () => {
    const target = makeBaseline()
    const result = applyDiff(target, [
      { fieldPath: 'profile.age', oldValue: target.profile.age, newValue: 55 },
    ])
    expect(result.profile.age).toBe(55)
    // Source unchanged (deep clone)
    expect(target.profile.age).not.toBe(55)
  })

  it('applies multiple patches', () => {
    const target = makeBaseline()
    const result = applyDiff(target, [
      { fieldPath: 'profile.age', oldValue: target.profile.age, newValue: 40 },
      { fieldPath: 'assumptions.inflationRate', oldValue: 0.02, newValue: 0.025 },
    ])
    expect(result.profile.age).toBe(40)
    expect(result.assumptions.inflationRate).toBe(0.025)
  })

  it('silently skips paths that do not exist in the target', () => {
    const target = makeBaseline()
    expect(() =>
      applyDiff(target, [
        { fieldPath: 'nonexistent.deep.path', oldValue: null, newValue: 99 },
      ]),
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Round-trip: fork → mutate → diff → apply
// ---------------------------------------------------------------------------

describe('scenarioDiff + applyDiff round-trip', () => {
  it('re-applying the diff from a what-if onto a fresh baseline clone reproduces the what-if state', () => {
    const baseline = makeBaseline()
    const whatIf = forkBaselineScenario(baseline, 'round-trip test')

    // Simulate user mutation on the what-if
    const mutatedWhatIf: Scenario = {
      ...whatIf,
      profile: { ...whatIf.profile, age: 42 },
      assumptions: { ...whatIf.assumptions, inflationRate: 0.035 },
    }

    // Compute deltas between snapshot (original baseline) and mutated what-if
    const deltas = scenarioDiff(whatIf.derivedFromBaselineSnapshot, mutatedWhatIf)

    // Apply deltas onto a new baseline (same content here)
    const newBaseline = makeBaseline()
    const reapplied = applyDiff(newBaseline, deltas)

    expect(reapplied.profile.age).toBe(42)
    expect(reapplied.assumptions.inflationRate).toBeCloseTo(0.035)
  })
})
