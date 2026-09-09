/**
 * Plan-summary selector tests (state contract §4).
 *
 * Semantics pinned here:
 *   - the total is the engine's aggregate, never a re-sum of product headlines;
 *   - one deflator drives the total, every row and the Wunschrente target;
 *   - payout duration comes from the real payout mode, including the shared
 *     drawdown horizon and its `sharedWith` list;
 *   - the gap is emitted only against an explicit target and a showable total.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import type { Workspace } from '../domain/workspace'
import { runCombineSimulation } from './useCombineSimulation'
import { durationOfInstance, realDeflator, selectPlanSummary } from './planSummary'
import type { AnyWorkspaceInstance } from './resultReadiness'

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

function instance(overrides: Partial<AnyWorkspaceInstance>): AnyWorkspaceInstance {
  return {
    instanceId: 'x-1',
    label: 'X',
    status: 'active',
    contractStartYear: 2020,
    evidenceMap: {},
    ...overrides,
  }
}

describe('realDeflator', () => {
  it('discounts by the inflation rate over the remaining years', () => {
    expect(realDeflator(0.02, 10)).toBeCloseTo(1.02 ** -10, 12)
  })

  it('is 1 at retirement and never inflates', () => {
    expect(realDeflator(0.02, 0)).toBe(1)
    expect(realDeflator(-0.05, 10)).toBe(1)
    expect(realDeflator(0.02, -3)).toBe(1)
  })
})

describe('durationOfInstance', () => {
  it('Basisrente is lifelong regardless of the stored mode', () => {
    expect(durationOfInstance('basisrente', instance({}), 67, 90)).toEqual({ kind: 'lifelong' })
  })

  it('bAV / private insurance follow their payout mode', () => {
    expect(durationOfInstance('bav', instance({ payoutMode: 'leibrente' }), 67, 90)).toEqual({
      kind: 'lifelong',
    })
    expect(
      durationOfInstance(
        'versicherung',
        instance({ payoutMode: 'zeitrente', zeitrenteYears: 15 }),
        67,
        90,
      ),
    ).toEqual({ kind: 'fixed-term', endAge: 82, years: 15 })
    expect(
      durationOfInstance('bav', instance({ payoutMode: 'kapitalverzehr' }), 67, 90),
    ).toEqual({ kind: 'drawdown-shared-horizon', endAge: 90, sharedWith: [] })
  })

  it('ETF always uses the shared drawdown horizon', () => {
    expect(durationOfInstance('etf', instance({}), 67, 88)).toEqual({
      kind: 'drawdown-shared-horizon',
      endAge: 88,
      sharedWith: [],
    })
  })

  it('AVD payout plan never ends before the statutory minimum end age', () => {
    const min = de2026Rules.altersvorsorgedepot.payoutPlanMinEndAge
    expect(
      durationOfInstance(
        'altersvorsorgedepot',
        instance({ payoutMode: 'certified_payout_plan', payoutPlanEndAge: 80 }),
        67,
        90,
      ),
    ).toEqual({ kind: 'avd-plan', endAge: min })
    expect(
      durationOfInstance(
        'altersvorsorgedepot',
        instance({ payoutMode: 'certified_payout_plan', payoutPlanEndAge: 92 }),
        67,
        90,
      ),
    ).toEqual({ kind: 'avd-plan', endAge: 92 })
    expect(
      durationOfInstance(
        'altersvorsorgedepot',
        instance({ payoutMode: 'lifelong_annuity' }),
        67,
        90,
      ),
    ).toEqual({ kind: 'lifelong' })
  })
})

describe('selectPlanSummary', () => {
  it('takes the total from the engine aggregate and the rows from byInstance', () => {
    const ws = makeWorkspace()
    const bundle = runCombineSimulation(ws, de2026Rules)
    const summary = selectPlanSummary(ws, bundle, 'basis')
    const combined = bundle.combinedByScenarioId.basis

    expect(summary.netMonthlyTotalNominal).toBe(combined.monthlyNetIncome)
    const statutoryRow = summary.rows.find((r) => r.key === 'statutory')
    expect(statutoryRow?.netMonthlyNominal).toBe(combined.statutoryPensionMonthlyNet)
    expect(statutoryRow?.duration).toEqual({ kind: 'lifelong' })

    const bavId = ws.baseline.assumptions.bav[0].instanceId
    const bavRow = summary.rows.find((r) => r.instanceId === bavId)
    expect(bavRow?.netMonthlyNominal).toBe(combined.byInstance[bavId].monthlyNet)

    // Rows reconcile with the aggregate (the engine's own <1 ct invariant).
    const rowSum = summary.rows.reduce((s, r) => s + r.netMonthlyNominal, 0)
    expect(rowSum).toBeCloseTo(summary.netMonthlyTotalNominal, 2)
  })

  it('applies one deflator consistently to the total and every row', () => {
    const ws = makeWorkspace()
    const bundle = runCombineSimulation(ws, de2026Rules)
    const summary = selectPlanSummary(ws, bundle, 'basis')
    const expected = realDeflator(
      ws.baseline.assumptions.inflationRate,
      ws.baseline.profile.retirementAge - ws.baseline.profile.age,
    )
    expect(summary.deflator).toBeCloseTo(expected, 12)
    expect(summary.netMonthlyTotalReal).toBeCloseTo(
      summary.netMonthlyTotalNominal * summary.deflator,
      9,
    )
    for (const row of summary.rows) {
      expect(row.netMonthlyReal).toBeCloseTo(row.netMonthlyNominal * summary.deflator, 9)
    }
  })

  it('labels the shared drawdown horizon with the other affected contracts', () => {
    const ws = makeWorkspace()
    const bundle = runCombineSimulation(ws, de2026Rules)
    const summary = selectPlanSummary(ws, bundle, 'basis')
    const etfId = ws.baseline.assumptions.etf[0].instanceId
    const etfRow = summary.rows.find((r) => r.instanceId === etfId)
    expect(etfRow?.duration.kind).toBe('drawdown-shared-horizon')
    if (etfRow?.duration.kind === 'drawdown-shared-horizon') {
      expect(etfRow.duration.endAge).toBe(ws.baseline.assumptions.retirementEndAge)
      expect(etfRow.duration.sharedWith).not.toContain(etfId)
    }
  })

  it('carries the worst input status of a row', () => {
    const ws = makeWorkspace()
    const inst = ws.baseline.assumptions.etf[0]
    inst.inputStatus = { currentValueEUR: 'document', monthlyContribution: 'assumed' }
    const bundle = runCombineSimulation(ws, de2026Rules)
    const summary = selectPlanSummary(ws, bundle, 'basis')
    expect(summary.rows.find((r) => r.instanceId === inst.instanceId)?.status).toBe('assumed')

    inst.inputStatus = { currentValueEUR: 'document', monthlyContribution: 'unknown' }
    const summary2 = selectPlanSummary(ws, runCombineSimulation(ws, de2026Rules), 'basis')
    expect(summary2.rows.find((r) => r.instanceId === inst.instanceId)?.status).toBe('unknown')
  })

  it('emits the Wunschrente gap only for an explicit target and a showable total', () => {
    const ws = makeWorkspace()
    const bundle = runCombineSimulation(ws, de2026Rules)
    expect(selectPlanSummary(ws, bundle, 'basis').gap).toBeUndefined()

    ws.baseline.profile = { ...ws.baseline.profile, desiredNetMonthlyPension: 2500 }
    const withTarget = selectPlanSummary(ws, runCombineSimulation(ws, de2026Rules), 'basis')
    expect(withTarget.gap?.targetMonthly).toBe(2500)
    // Real gap compares like with like: today's euros on both sides.
    expect(withTarget.gap?.gapReal).toBeCloseTo(2500 - withTarget.netMonthlyTotalReal, 6)

    // A blocked total suppresses the gap rather than comparing against a
    // number the user is not allowed to see.
    ws.baseline.assumptions.inputStatus = {
      'statutoryPension.currentEntgeltpunkte': 'unknown',
    }
    const blocked = selectPlanSummary(ws, runCombineSimulation(ws, de2026Rules), 'basis')
    expect(blocked.readiness.canShowHouseholdTotal).toBe(false)
    expect(blocked.gap).toBeUndefined()
  })

  it('returns zeroed figures for an unknown scenario id instead of another scenario', () => {
    const ws = makeWorkspace()
    const bundle = runCombineSimulation(ws, de2026Rules)
    const summary = selectPlanSummary(ws, bundle, 'gibt-es-nicht')
    expect(summary.netMonthlyTotalNominal).toBe(0)
    expect(summary.rows.every((r) => r.netMonthlyNominal === 0)).toBe(true)
  })
})
