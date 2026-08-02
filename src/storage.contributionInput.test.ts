/**
 * Persistence tests for `ScenarioAssumptions.contributionInput`.
 *
 * The field is optional and deliberately absent from `defaultAssumptions` — its
 * absence *is* plain net mode. That makes it invisible to `mergeDeep`, which
 * only walks keys present in the defaults and only accepts saved primitives
 * whose type matches the default. Without the explicit carry in
 * `applyPostMergeMigrations` the field is silently dropped on every load, share
 * link and scenario-library round-trip, quietly reverting a pinned AVD
 * Eigenbeitrag to net mode. These tests pin that carry.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { migrateAndValidateState } from './storage'
import { singletonViewOfWorkspace } from './engine/portfolioProjection'
import { defaultWorkspace } from './storage'

describe('contributionInput survives the load pipeline', () => {
  it('round-trips a pinned AVD Eigenbeitrag through migrateAndValidateState', () => {
    const saved = {
      ...defaultAssumptions,
      contributionInput: { kind: 'avd-own', monthlyOwn: 150 },
    }
    const result = migrateAndValidateState(defaultProfile, saved)
    expect(result).not.toBeNull()
    expect(result?.assumptions.contributionInput).toEqual({
      kind: 'avd-own',
      monthlyOwn: 150,
    })
  })

  it('round-trips explicit net mode', () => {
    const result = migrateAndValidateState(defaultProfile, {
      ...defaultAssumptions,
      contributionInput: { kind: 'net' },
    })
    expect(result?.assumptions.contributionInput).toEqual({ kind: 'net' })
  })

  it('leaves the field absent for states saved before it existed', () => {
    const legacy = { ...defaultAssumptions }
    delete (legacy as Record<string, unknown>).contributionInput
    const result = migrateAndValidateState(defaultProfile, legacy)
    expect(result).not.toBeNull()
    expect(result?.assumptions.contributionInput).toBeUndefined()
  })

  it.each([
    ['unknown kind', { kind: 'something-else', monthlyOwn: 10 }],
    ['missing payload', { kind: 'avd-own' }],
    ['non-finite payload', { kind: 'avd-own', monthlyOwn: Number.NaN }],
    ['negative payload', { kind: 'avd-own', monthlyOwn: -20 }],
    ['not an object', 'avd-own'],
  ])('drops a malformed input mode (%s) without failing the whole load', (_label, bad) => {
    const result = migrateAndValidateState(defaultProfile, {
      ...defaultAssumptions,
      contributionInput: bad,
    })
    // The saved scenario is still usable — a corrupt input mode must not cost
    // the user everything else in the state.
    expect(result).not.toBeNull()
    expect(result?.assumptions.contributionInput).toBeUndefined()
  })
})

describe('contributionInput survives the workspace projection', () => {
  const emptySlotDefaults = {
    bav: defaultAssumptions.bav,
    etf: defaultAssumptions.etf,
    insurance: defaultAssumptions.insurance,
    basisrente: defaultAssumptions.basisrente,
    altersvorsorgedepot: defaultAssumptions.altersvorsorgedepot,
    riester: defaultAssumptions.riester,
  }

  it('is carried by singletonViewOfWorkspace', () => {
    const ws = {
      ...defaultWorkspace,
      baseline: {
        ...defaultWorkspace.baseline,
        assumptions: {
          ...defaultWorkspace.baseline.assumptions,
          contributionInput: { kind: 'avd-own' as const, monthlyOwn: 150 },
        },
      },
    }
    const view = singletonViewOfWorkspace(ws, emptySlotDefaults)
    expect(view.contributionInput).toEqual({ kind: 'avd-own', monthlyOwn: 150 })
  })

  it('is undefined when the workspace does not carry it', () => {
    const view = singletonViewOfWorkspace(defaultWorkspace, emptySlotDefaults)
    expect(view.contributionInput).toBeUndefined()
  })
})
