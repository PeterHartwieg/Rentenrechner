/**
 * Result-readiness policy tests (state contract §3).
 *
 * Semantics pinned here:
 *   - an explicit "weiß ich nicht" on a core input blocks the household total;
 *   - `pensionBaselineType: 'none'` is an answer, not a reason;
 *   - a thrown simulation is an error state, never a plausible zero;
 *   - `canShowHouseholdTotal` is false exactly for `incomplete` and `error`.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import type { Workspace } from '../domain/workspace'
import { runCombineSimulation, type CombineSimulationBundle } from './useCombineSimulation'
import { householdTotalBlockedLabels, selectResultReadiness } from './resultReadiness'
import { ROUTES } from './useRoute'

function makeWorkspace(): Workspace {
  const v1 = {
    ...defaultAssumptions,
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
  }
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
}

/** Strip every contract so only the statutory baseline remains. */
function clearContracts(ws: Workspace): void {
  const a = ws.baseline.assumptions
  a.bav = []
  a.etf = []
  a.insurance = []
  a.basisrente = []
  a.altersvorsorgedepot = []
  a.riester = []
}

function bundleFor(ws: Workspace): CombineSimulationBundle {
  return runCombineSimulation(ws, de2026Rules)
}

describe('selectResultReadiness', () => {
  it('reports estimated (not available) for a workspace whose contract costs are model values', () => {
    const ws = makeWorkspace()
    const readiness = selectResultReadiness(ws, bundleFor(ws))
    expect(readiness.status).toBe('estimated')
    expect(readiness.blocking).toHaveLength(0)
    expect(readiness.assumptions.map((r) => r.code)).toContain('assumed-fees')
    expect(readiness.canShowHouseholdTotal).toBe(true)
  })

  it('is available when nothing is assumed and nothing blocks', () => {
    const ws = makeWorkspace()
    clearContracts(ws)
    const readiness = selectResultReadiness(ws, bundleFor(ws))
    expect(readiness.status).toBe('available')
    expect(readiness.reasons).toHaveLength(0)
    expect(readiness.canShowHouseholdTotal).toBe(true)
  })

  it('blocks on an explicitly unknown gross salary', () => {
    // The edit surface lets the user decline the salary; onboarding does not.
    // The declined value still drives future Entgeltpunkte, the payroll pass
    // and the Schicht-1 / Riester caps, so the total must not be presented as
    // complete — same treatment as an unknown PKV premium.
    const ws = makeWorkspace()
    clearContracts(ws)
    ws.baseline.assumptions.inputStatus = { 'profile.grossSalaryYear': 'unknown' }
    const readiness = selectResultReadiness(ws, bundleFor(ws))
    expect(readiness.status).toBe('incomplete')
    expect(readiness.blocking.map((r) => r.code)).toContain('salary-unknown')
    expect(readiness.canShowHouseholdTotal).toBe(false)
    const reason = readiness.blocking.find((r) => r.code === 'salary-unknown')!
    expect(reason.label).toContain('Bruttoeinkommen')
    expect(reason.target.route).toEqual(ROUTES.eingaben)
  })

  it('does not block on a salary the user actually entered', () => {
    const ws = makeWorkspace()
    clearContracts(ws)
    ws.baseline.assumptions.inputStatus = { 'profile.grossSalaryYear': 'entered' }
    const readiness = selectResultReadiness(ws, bundleFor(ws))
    expect(readiness.blocking.map((r) => r.code)).not.toContain('salary-unknown')
  })

  it('blocks on an explicitly unknown statutory-pension figure', () => {
    const ws = makeWorkspace()
    ws.baseline.assumptions.inputStatus = {
      'statutoryPension.currentEntgeltpunkte': 'unknown',
    }
    const readiness = selectResultReadiness(ws, bundleFor(ws))
    expect(readiness.status).toBe('incomplete')
    expect(readiness.blocking.map((r) => r.code)).toContain('statutory-pension-unknown')
    expect(readiness.canShowHouseholdTotal).toBe(false)
  })

  it('blocks when the pension step was skipped', () => {
    const ws = makeWorkspace()
    ws.baseline.assumptions.statutoryPension = {
      ...ws.baseline.assumptions.statutoryPension,
      pensionEntryMethod: { kind: 'skipped' },
    }
    const readiness = selectResultReadiness(ws, bundleFor(ws))
    expect(readiness.blocking.map((r) => r.code)).toContain('pension-entry-skipped')
  })

  it('treats pensionBaselineType "none" as an answer, never a reason', () => {
    const ws = makeWorkspace()
    clearContracts(ws)
    ws.baseline.assumptions.statutoryPension = {
      ...ws.baseline.assumptions.statutoryPension,
      pensionBaselineType: 'none',
      // Even an unknown marker on the pension fields must not surface once the
      // user has said there is no mandatory pension at all.
      pensionEntryMethod: { kind: 'skipped' },
    }
    ws.baseline.assumptions.inputStatus = {
      'statutoryPension.currentEntgeltpunkte': 'unknown',
    }
    const readiness = selectResultReadiness(ws, bundleFor(ws))
    expect(readiness.reasons.map((r) => r.code)).not.toContain('statutory-pension-unknown')
    expect(readiness.reasons.map((r) => r.code)).not.toContain('pension-entry-skipped')
    expect(readiness.status).toBe('available')
  })

  it('blocks on an unknown contract value and links to that contract editor', () => {
    const ws = makeWorkspace()
    const inst = ws.baseline.assumptions.bav[0]
    inst.inputStatus = { currentValueEUR: 'unknown' }
    const readiness = selectResultReadiness(ws, bundleFor(ws))
    const reason = readiness.blocking.find((r) => r.code === 'instance-capital-unknown')
    expect(reason).toBeDefined()
    expect(reason?.instanceId).toBe(inst.instanceId)
    expect(reason?.target.route).toEqual({
      kind: 'vertrag-bearbeiten',
      instanceId: inst.instanceId,
    })
    expect(readiness.canShowHouseholdTotal).toBe(false)
  })

  it('links an unknown contribution to the contract editor as well', () => {
    const ws = makeWorkspace()
    const inst = ws.baseline.assumptions.bav[0]
    inst.inputStatus = { monthlyGrossConversion: 'unknown' }
    const reason = selectResultReadiness(ws, bundleFor(ws)).blocking.find(
      (r) => r.code === 'instance-contribution-unknown',
    )
    expect(reason?.target.route).toEqual({
      kind: 'vertrag-bearbeiten',
      instanceId: inst.instanceId,
    })
  })

  it('blocks on an unknown PKV premium only for privately insured users', () => {
    const ws = makeWorkspace()
    ws.baseline.assumptions.inputStatus = { 'profile.pkvMonthlyPremium': 'unknown' }
    expect(
      selectResultReadiness(ws, bundleFor(ws)).reasons.map((r) => r.code),
    ).not.toContain('pkv-premium-unknown')

    ws.baseline.profile = { ...ws.baseline.profile, publicHealthInsurance: false }
    expect(
      selectResultReadiness(ws, bundleFor(ws)).blocking.map((r) => r.code),
    ).toContain('pkv-premium-unknown')
  })

  it('returns error — never a zero total — when the simulation threw', () => {
    const ws = makeWorkspace()
    const readiness = selectResultReadiness(ws, null, new Error('boom'))
    expect(readiness.status).toBe('error')
    expect(readiness.blocking.map((r) => r.code)).toContain('simulation-error')
    expect(readiness.canShowHouseholdTotal).toBe(false)
  })

  it('returns error when the headline is non-finite', () => {
    const ws = makeWorkspace()
    const bundle = bundleFor(ws)
    bundle.combinedByScenarioId.basis.monthlyNetIncome = Number.NaN
    expect(selectResultReadiness(ws, bundle).status).toBe('error')
  })

  it('surfaces the shared drawdown horizon as an assumption, not a blocker', () => {
    const ws = makeWorkspace()
    const readiness = selectResultReadiness(ws, bundleFor(ws))
    const shared = readiness.assumptions.find((r) => r.code === 'shared-drawdown-horizon')
    expect(shared).toBeDefined()
    expect(shared?.label).toContain(String(ws.baseline.assumptions.retirementEndAge))
  })

  it('householdTotalBlockedLabels lists blocking labels only when the total is suppressed', () => {
    const ws = makeWorkspace()
    expect(householdTotalBlockedLabels(selectResultReadiness(ws, bundleFor(ws)))).toEqual([])
    const blocked = selectResultReadiness(ws, null, new Error('boom'))
    expect(householdTotalBlockedLabels(blocked)).toHaveLength(1)
  })
})
