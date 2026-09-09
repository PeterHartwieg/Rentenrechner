// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { seedCompareFromWorkspace } from './compareSeed'
import { defaultWorkspace } from '../storage'
import { defaultAssumptions } from '../data/defaultScenario'
import type { Workspace } from '../domain/workspace'

function fixture(): Workspace {
  const base = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  base.baseline.profile = { ...base.baseline.profile, age: 41, grossSalaryYear: 77_000 }
  base.baseline.assumptions = {
    ...base.baseline.assumptions,
    inflationRate: 0.031,
    retirementEndAge: 92,
    returnScenarios: [{ id: 'basis', label: 'Basis', annualReturn: 0.049 }],
  }
  return base
}

describe('seedCompareFromWorkspace', () => {
  it('copies profile and the economic frame', () => {
    const ws = fixture()
    const seed = seedCompareFromWorkspace(ws)
    expect(seed.profile.age).toBe(41)
    expect(seed.profile.grossSalaryYear).toBe(77_000)
    expect(seed.assumptions.inflationRate).toBeCloseTo(0.031)
    expect(seed.assumptions.retirementEndAge).toBe(92)
    expect(seed.assumptions.returnScenarios).toHaveLength(1)
    expect(seed.assumptions.returnScenarios[0].annualReturn).toBeCloseTo(0.049)
  })

  it('leaves contracts and contributions untouched', () => {
    // The seed carries the person and the economic frame only. Product blocks
    // and the fair-comparison anchor stay whatever the compare state already
    // had — copying a plan's contracts into the comparison is exactly the
    // cross-contamination `/vergleich` exists to avoid.
    const ws = fixture()
    ws.baseline.assumptions.etf = [
      {
        instanceId: 'etf-1',
        label: 'Depot',
        status: 'active',
        monthlyContribution: 500,
      },
    ] as never
    const base = { ...defaultAssumptions, equalInputAmountEUR: 275 }
    const seed = seedCompareFromWorkspace(ws, base)
    expect(seed.assumptions.equalInputAmountEUR).toBe(275)
    expect(seed.assumptions.etf).toEqual(defaultAssumptions.etf)
    expect(seed.assumptions.visibleProducts).toEqual(defaultAssumptions.visibleProducts)
    expect('instanceId' in (seed.assumptions.etf as object)).toBe(false)
  })

  it('does not mutate the workspace and does not alias its arrays', () => {
    const ws = fixture()
    const before = JSON.stringify(ws)
    const seed = seedCompareFromWorkspace(ws)

    // No aliasing: editing the seed must not reach back into the plan.
    seed.profile.age = 99
    seed.assumptions.returnScenarios[0].annualReturn = 0.99

    expect(JSON.stringify(ws)).toBe(before)
    expect(ws.baseline.profile.age).toBe(41)
    expect(ws.baseline.assumptions.returnScenarios[0].annualReturn).toBeCloseTo(0.049)
  })

  it('does not mutate the base assumptions it is merged onto', () => {
    const ws = fixture()
    const base = JSON.parse(JSON.stringify(defaultAssumptions))
    const snapshot = JSON.stringify(base)
    seedCompareFromWorkspace(ws, base)
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})
