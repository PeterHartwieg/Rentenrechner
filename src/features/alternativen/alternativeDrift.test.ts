import { describe, expect, it } from 'vitest'
import { defaultWorkspace } from '../../storage'
import type { Scenario } from '../../domain/workspace'
import { addInstanceToWorkspace } from '../inventory/inventoryHelpers'
import { describeBaselineDrift } from './alternativeDrift'

function baseline(): Scenario {
  return structuredClone(defaultWorkspace.baseline)
}

describe('describeBaselineDrift', () => {
  it('is empty when the snapshot and the baseline are the same', () => {
    expect(describeBaselineDrift(baseline(), baseline())).toEqual([])
  })

  it('names person and assumption changes with before → after', () => {
    const snapshot = baseline()
    const current = baseline()
    current.profile.grossSalaryYear = snapshot.profile.grossSalaryYear + 2160
    current.profile.age = snapshot.profile.age + 1
    current.assumptions.inflationRate = 0.03
    current.assumptions.retirementEndAge = 100
    const lines = describeBaselineDrift(snapshot, current)
    expect(lines.some((l) => l.startsWith('Alter: '))).toBe(true)
    expect(lines.find((l) => l.startsWith('Jahreseinkommen: '))).toMatch(/→/)
    expect(lines.find((l) => l.startsWith('Inflation: '))).toMatch(/→ 3\s%$/)
    expect(lines).toContain(`Entnahme bis Alter: ${snapshot.assumptions.retirementEndAge} → 100`)
  })

  it('reports contracts added since saving and changed contributions', () => {
    const snapshotWs = addInstanceToWorkspace(structuredClone(defaultWorkspace), 'etf')
    const snapshot = snapshotWs.baseline
    const currentWs = addInstanceToWorkspace(structuredClone(snapshotWs), 'versicherung')
    const current = structuredClone(currentWs.baseline)
    current.assumptions.etf[0].monthlyContribution = (snapshot.assumptions.etf[0].monthlyContribution ?? 0) + 118
    const lines = describeBaselineDrift(snapshot, current)
    expect(lines.some((l) => l.startsWith('Neu im Plan: '))).toBe(true)
    expect(lines.find((l) => l.includes('Sparrate: '))).toMatch(/→/)
  })

  it('collapses differences it does not name into one generic line', () => {
    const snapshot = baseline()
    const current = baseline()
    current.assumptions.etfEquityPartialExemptionNote = 'x' as never
    const lines = describeBaselineDrift(snapshot, current)
    expect(lines).toEqual(['Weitere Angaben geändert'])
  })
})
