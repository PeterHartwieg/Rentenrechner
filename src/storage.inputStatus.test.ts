/**
 * Storage round-trip tests for the union-key `mergeDeep` and the additive
 * input-status metadata (state contract §2.4 / lead decision §10.1).
 *
 * `mergeDeep` used to iterate only the keys present in the defaults, so every
 * persisted field the defaults did not name was silently deleted on load. It
 * now walks the union of saved and default keys. These tests pin both the new
 * behaviour and the behaviours that must NOT change: type mismatches still fall
 * back to the default, an explicitly emptied `visibleProducts` still survives,
 * and a malformed `contributionInput` is still dropped instead of taking the
 * whole scenario down.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import {
  buildWorkspaceJson,
  defaultWorkspace,
  migrateAndValidateState,
  migrateV1ToV2,
  parseStateFromJson,
  parseWorkspaceJson,
} from './storage'
import { singletonViewOfWorkspace } from './engine/portfolioProjection'
import type { Workspace } from './domain/workspace'

function workspaceWithBaseline(mutate: (ws: Workspace) => void): Workspace {
  const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
  mutate(ws)
  return ws
}

describe('mergeDeep — union of saved and default keys', () => {
  it('round-trips a saved-only key that the defaults never mention', () => {
    const ws = workspaceWithBaseline((w) => {
      ;(w.baseline as unknown as Record<string, unknown>).lastEditedAt = 1_700_000_000_000
    })
    const loaded = parseWorkspaceJson(buildWorkspaceJson(ws))
    expect(loaded?.baseline.lastEditedAt).toBe(1_700_000_000_000)
  })

  it('keeps visibleInstanceIds, which the defaults do not carry', () => {
    const ws = workspaceWithBaseline((w) => {
      w.baseline.assumptions.visibleInstanceIds = ['etf-abc', 'bav-def']
    })
    const loaded = parseWorkspaceJson(buildWorkspaceJson(ws))
    expect(loaded?.baseline.assumptions.visibleInstanceIds).toEqual(['etf-abc', 'bav-def'])
  })

  it('still falls back to the default on a type mismatch', () => {
    const raw = JSON.parse(buildWorkspaceJson(defaultWorkspace)) as Record<string, unknown>
    const baseline = (raw.baseline as Record<string, unknown>)
    const assumptions = baseline.assumptions as Record<string, unknown>
    assumptions.inflationRate = 'zwei Prozent'
    const loaded = parseWorkspaceJson(JSON.stringify(raw))
    expect(loaded?.baseline.assumptions.inflationRate).toBe(
      defaultWorkspace.baseline.assumptions.inflationRate,
    )
  })

  it('still preserves an explicitly emptied visibleProducts', () => {
    const ws = workspaceWithBaseline((w) => {
      w.baseline.assumptions.visibleProducts = []
    })
    const loaded = parseWorkspaceJson(buildWorkspaceJson(ws))
    expect(loaded?.baseline.assumptions.visibleProducts).toEqual([])

    const singleton = migrateAndValidateState(defaultProfile, {
      ...defaultAssumptions,
      visibleProducts: [],
    })
    expect(singleton?.assumptions.visibleProducts).toEqual([])
  })

  it('still drops a malformed contributionInput without failing the load', () => {
    const ws = workspaceWithBaseline((w) => {
      ;(w.baseline.assumptions as unknown as Record<string, unknown>).contributionInput = {
        kind: 'avd-own',
      }
    })
    const loaded = parseWorkspaceJson(buildWorkspaceJson(ws))
    expect(loaded).not.toBeNull()
    expect(loaded?.baseline.assumptions.contributionInput).toBeUndefined()
  })

  it('still round-trips a well-formed contributionInput', () => {
    const ws = workspaceWithBaseline((w) => {
      w.baseline.assumptions.contributionInput = { kind: 'avd-own', monthlyOwn: 150 }
    })
    const loaded = parseWorkspaceJson(buildWorkspaceJson(ws))
    expect(loaded?.baseline.assumptions.contributionInput).toEqual({
      kind: 'avd-own',
      monthlyOwn: 150,
    })
  })
})

describe('input-status metadata round-trips', () => {
  it('survives a v2 workspace load at the scenario level', () => {
    const ws = workspaceWithBaseline((w) => {
      w.baseline.assumptions.inputStatus = {
        'profile.grossSalaryYear': 'entered',
        'statutoryPension.currentEntgeltpunkte': 'unknown',
      }
      w.baseline.assumptions.statutoryPension = {
        ...w.baseline.assumptions.statutoryPension,
        pensionEntryMethod: { kind: 'career', careerStartAge: 22, pauseYears: 2 },
      }
    })
    const loaded = parseWorkspaceJson(buildWorkspaceJson(ws))
    expect(loaded?.baseline.assumptions.inputStatus).toEqual({
      'profile.grossSalaryYear': 'entered',
      'statutoryPension.currentEntgeltpunkte': 'unknown',
    })
    expect(loaded?.baseline.assumptions.statutoryPension.pensionEntryMethod).toEqual({
      kind: 'career',
      careerStartAge: 22,
      pauseYears: 2,
    })
  })

  it('survives per instance', () => {
    const ws = workspaceWithBaseline((w) => {
      w.baseline.assumptions.etf = [
        {
          instanceId: 'etf-abc',
          label: 'ETF Welt',
          status: 'active',
          contractStartYear: 2020,
          evidenceMap: {},
          inputStatus: { currentValueEUR: 'document', monthlyContribution: 'unknown' },
          ...defaultAssumptions.etf,
        },
      ]
    })
    const loaded = parseWorkspaceJson(buildWorkspaceJson(ws))
    expect(loaded?.baseline.assumptions.etf[0].inputStatus).toEqual({
      currentValueEUR: 'document',
      monthlyContribution: 'unknown',
    })
  })

  it('sanitises rather than rejects a corrupt status byte', () => {
    const ws = workspaceWithBaseline((w) => {
      w.baseline.assumptions.inputStatus = {
        'profile.age': 'entered',
        // Not a valid status, and not a reserved key either.
        'profile.age.nonsense': 'ganz sicher',
      } as never
      w.baseline.assumptions.statutoryPension = {
        ...w.baseline.assumptions.statutoryPension,
        pensionEntryMethod: { kind: 'telepathie' } as never,
      }
    })
    const loaded = parseWorkspaceJson(buildWorkspaceJson(ws))
    expect(loaded).not.toBeNull()
    expect(loaded?.baseline.assumptions.inputStatus).toEqual({ 'profile.age': 'entered' })
    expect(loaded?.baseline.assumptions.statutoryPension.pensionEntryMethod).toBeUndefined()
  })

  it('carries through the v1 → v2 migration', () => {
    const v1 = {
      ...defaultAssumptions,
      inputStatus: { 'profile.age': 'entered' },
      statutoryPension: {
        ...defaultAssumptions.statutoryPension,
        pensionEntryMethod: { kind: 'points', entgeltpunkte: 21 },
      },
    }
    const migrated = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      v1 as unknown as Record<string, unknown>,
    )
    expect(migrated.baseline.assumptions.inputStatus).toEqual({ 'profile.age': 'entered' })
    expect(migrated.baseline.assumptions.statutoryPension.pensionEntryMethod).toEqual({
      kind: 'points',
      entgeltpunkte: 21,
    })
  })

  it('survives the v1 singleton path and the singleton projection', () => {
    const loaded = migrateAndValidateState(defaultProfile, {
      ...defaultAssumptions,
      inputStatus: { 'profile.retirementAge': 'entered' },
    })
    expect(loaded?.assumptions.inputStatus).toEqual({ 'profile.retirementAge': 'entered' })

    const ws = workspaceWithBaseline((w) => {
      w.baseline.assumptions.inputStatus = { 'profile.retirementAge': 'entered' }
      w.baseline.assumptions.statutoryPension = {
        ...w.baseline.assumptions.statutoryPension,
        pensionEntryMethod: { kind: 'skipped' },
      }
    })
    const singleton = singletonViewOfWorkspace(ws, {
      bav: defaultAssumptions.bav,
      etf: defaultAssumptions.etf,
      insurance: defaultAssumptions.insurance,
      basisrente: defaultAssumptions.basisrente,
      altersvorsorgedepot: defaultAssumptions.altersvorsorgedepot,
      riester: defaultAssumptions.riester,
    })
    expect(singleton.inputStatus).toEqual({ 'profile.retirementAge': 'entered' })
    expect(singleton.statutoryPension.pensionEntryMethod).toEqual({ kind: 'skipped' })

    // …and through the v2 → singleton storage entry point.
    const viaStorage = parseStateFromJson(buildWorkspaceJson(ws))
    expect(viaStorage?.assumptions.inputStatus).toEqual({ 'profile.retirementAge': 'entered' })
  })
})
