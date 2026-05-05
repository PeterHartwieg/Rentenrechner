/**
 * Load-path tests for storage.ts (issue 08 — split storage migration, validation,
 * and persistence).
 *
 * Covers:
 *   A. Valid v2 workspace: loads correctly end-to-end.
 *   B. Repairable v2 workspace: single-sided transfer event is backfilled and loaded.
 *   C. Malformed local v2 workspace: falls back to defaults (via v1 or null).
 *   D. Malformed share-URL v2 workspace: parseWorkspaceJson returns null (caller
 *      shows invalid-link state, not silently-loaded defaults).
 *   E. Legacy v1 migration path: v1 localStorage data migrates to v2 and loads.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import {
  buildWorkspaceJson,
  loadSavedState,
  loadSavedWorkspace,
  migrateV1ToV2,
  parseWorkspaceJson,
  saveWorkspace,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  transferEventKey,
} from './storage'
import type { Workspace } from './domain/workspace'

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

interface MemoryStorage {
  store: Record<string, string>
  storage: Storage
}

function makeMemoryStorage(): MemoryStorage {
  const store: Record<string, string> = {}
  const storage: Storage = {
    get length() {
      return Object.keys(store).length
    },
    clear() {
      for (const k of Object.keys(store)) delete store[k]
    },
    getItem(key: string) {
      return key in store ? store[key] : null
    },
    key(i: number) {
      return Object.keys(store)[i] ?? null
    },
    removeItem(key: string) {
      delete store[key]
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
  }
  return { store, storage }
}

let mem: MemoryStorage
const originalLocalStorage = globalThis.localStorage

beforeEach(() => {
  mem = makeMemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: mem.storage,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a structurally valid v2 workspace from default assumptions. */
function makeValidV2Workspace(): Workspace {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
}

/** Build a v1-format JSON string (legacy localStorage / share-URL format). */
function makeV1Json(
  profile = defaultProfile,
  assumptions = defaultAssumptions,
): string {
  return JSON.stringify({ version: 1, profile, assumptions })
}

// ---------------------------------------------------------------------------
// A. Valid v2 workspace load
// ---------------------------------------------------------------------------

describe('A — valid v2 workspace load', () => {
  it('parseWorkspaceJson returns a valid Workspace for a well-formed v2 JSON', () => {
    const ws = makeValidV2Workspace()
    const json = buildWorkspaceJson(ws)
    const result = parseWorkspaceJson(json)
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(2)
    expect(result!.baseline.profile.age).toBe(defaultProfile.age)
  })

  it('loadSavedWorkspace returns the saved v2 workspace when v2 key is present', () => {
    const ws = makeValidV2Workspace()
    saveWorkspace(ws)
    const loaded = loadSavedWorkspace()
    expect(loaded).not.toBeNull()
    expect(loaded!.schemaVersion).toBe(2)
    expect(loaded!.baseline.profile.age).toBe(defaultProfile.age)
  })

  it('loadSavedState from a v2 workspace returns a valid singleton { profile, assumptions }', () => {
    const ws = makeValidV2Workspace()
    saveWorkspace(ws)
    const state = loadSavedState()
    expect(state).not.toBeNull()
    expect(state!.profile.age).toBe(defaultProfile.age)
    expect(typeof state!.assumptions.inflationRate).toBe('number')
  })

  it('a v2 workspace round-trips through save → load → save → load stably', () => {
    const ws = makeValidV2Workspace()
    saveWorkspace(ws)
    const first = loadSavedWorkspace()!
    saveWorkspace(first)
    const second = loadSavedWorkspace()!
    expect(buildWorkspaceJson(second)).toEqual(buildWorkspaceJson(first))
  })
})

// ---------------------------------------------------------------------------
// B. Repairable v2 workspace — single-sided transfer-event backfill
// ---------------------------------------------------------------------------

describe('B — repairable v2 workspace (single-sided transfer-event backfill)', () => {
  it('parseWorkspaceJson backfills a source-only transfer event onto the target', () => {
    // Build a workspace with a bAV instance that has a transfer event but the
    // corresponding ETF target instance does not yet have the event recorded.
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      {
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
      } as unknown as Record<string, unknown>,
    )

    // Add an ETF instance alongside the bAV instance.
    const etfInst = ws.baseline.assumptions.etf[0]
    const bavInst = ws.baseline.assumptions.bav[0]

    // Attach a transfer event only to the source (bAV) — the target (ETF) is missing it.
    const transferEvent = {
      type: 'surrender_reinvest' as const,
      year: 2035,
      sourceInstanceId: bavInst.instanceId,
      targetInstanceId: etfInst.instanceId,
      amountEUR: 10000,
      surrenderHaircutPct: 0,
    }
    ;(bavInst as { transferEvents?: typeof transferEvent[] }).transferEvents = [transferEvent]
    // ETF instance has NO transferEvents (source-only state).

    const json = buildWorkspaceJson(ws)
    const loaded = parseWorkspaceJson(json)
    expect(loaded).not.toBeNull()

    // After backfill, the ETF target instance must also carry the event.
    const loadedEtf = loaded!.baseline.assumptions.etf[0] as { transferEvents?: typeof transferEvent[] }
    expect(loadedEtf.transferEvents).toBeDefined()
    expect(loadedEtf.transferEvents!.length).toBe(1)
    expect(loadedEtf.transferEvents![0].sourceInstanceId).toBe(bavInst.instanceId)
  })

  it('backfill is idempotent: loading twice does not duplicate transfer events', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      {
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
      } as unknown as Record<string, unknown>,
    )
    const etfInst = ws.baseline.assumptions.etf[0]
    const bavInst = ws.baseline.assumptions.bav[0]

    const transferEvent = {
      type: 'surrender_reinvest' as const,
      year: 2035,
      sourceInstanceId: bavInst.instanceId,
      targetInstanceId: etfInst.instanceId,
      amountEUR: 10000,
      surrenderHaircutPct: 0,
    }
    ;(bavInst as { transferEvents?: typeof transferEvent[] }).transferEvents = [transferEvent]

    const json = buildWorkspaceJson(ws)
    const first = parseWorkspaceJson(json)!
    const json2 = buildWorkspaceJson(first)
    const second = parseWorkspaceJson(json2)!

    // Both sides should have exactly one transfer event each.
    const bavFirst = first.baseline.assumptions.bav[0] as { transferEvents?: typeof transferEvent[] }
    const bavSecond = second.baseline.assumptions.bav[0] as { transferEvents?: typeof transferEvent[] }
    expect(bavFirst.transferEvents!.length).toBe(1)
    expect(bavSecond.transferEvents!.length).toBe(1)

    const etfFirst = first.baseline.assumptions.etf[0] as { transferEvents?: typeof transferEvent[] }
    const etfSecond = second.baseline.assumptions.etf[0] as { transferEvents?: typeof transferEvent[] }
    expect(etfFirst.transferEvents!.length).toBe(1)
    expect(etfSecond.transferEvents!.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// C. Malformed local v2 workspace — falls back to defaults
// ---------------------------------------------------------------------------

describe('C — malformed local v2 workspace falls back to defaults', () => {
  it('corrupt JSON in v2 key + valid v1 key → loads from v1 (not corrupt defaults)', () => {
    mem.store[STORAGE_KEY_V2] = '{not valid json at all'
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 44 })
    const result = loadSavedWorkspace()
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(2)
    expect(result!.baseline.profile.age).toBe(44)
  })

  it('invalid v2 workspace (invalid baseline origin enum) + valid v1 → loads from v1', () => {
    // A workspace with an invalid baseline.origin enum value that mergeDeep
    // cannot repair (type mismatch: string with invalid value vs string default).
    // mergeDeep preserves the saved string, then validateWorkspace rejects it.
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    // Poison the baseline with an invalid origin.
    const poisoned = JSON.parse(buildWorkspaceJson(ws)) as Record<string, unknown>
    ;(poisoned.baseline as Record<string, unknown>).origin = 'invalid_origin_value'
    mem.store[STORAGE_KEY_V2] = JSON.stringify(poisoned)
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 39 })
    const result = loadSavedWorkspace()
    expect(result).not.toBeNull()
    expect(result!.baseline.profile.age).toBe(39)
  })

  it('both v2 and v1 absent → loadSavedWorkspace returns null (caller uses defaultWorkspace)', () => {
    const result = loadSavedWorkspace()
    expect(result).toBeNull()
  })

  it('corrupt v2 + absent v1 → loadSavedWorkspace returns null', () => {
    mem.store[STORAGE_KEY_V2] = 'completely broken'
    const result = loadSavedWorkspace()
    expect(result).toBeNull()
  })

  it('corrupt v2 key → loadSavedState falls back to v1', () => {
    mem.store[STORAGE_KEY_V2] = 'not json'
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 41 })
    const result = loadSavedState()
    expect(result).not.toBeNull()
    expect(result!.profile.age).toBe(41)
  })
})

// ---------------------------------------------------------------------------
// D. Malformed share-URL v2 workspace — returns null (not defaults)
// ---------------------------------------------------------------------------

describe('D — malformed share-URL v2 workspace returns null (not defaults)', () => {
  it('parseWorkspaceJson returns null for a v2 workspace with invalid baseline origin (invalid-link state)', () => {
    // Simulate a share-URL workspace where the baseline has an invalid enum value
    // that mergeDeep preserves (type matches string). validateWorkspace must
    // reject it and parseWorkspaceJson must return null — not silently load defaults.
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    const poisoned = JSON.parse(buildWorkspaceJson(ws)) as Record<string, unknown>
    ;(poisoned.baseline as Record<string, unknown>).origin = 'invalid_share_url_origin'
    const malformedSharePayload = JSON.stringify(poisoned)
    const result = parseWorkspaceJson(malformedSharePayload)
    // Must return null — caller can surface an invalid-link state.
    // Must NOT fall back to defaultWorkspace silently.
    expect(result).toBeNull()
  })

  it('parseWorkspaceJson returns null for a v3 payload (forward-compat guard)', () => {
    const v3Payload = JSON.stringify({
      schemaVersion: 3,
      mode: 'compare',
      baseline: {},
      whatIfs: [],
      pinnedComparisonIds: [],
    })
    expect(parseWorkspaceJson(v3Payload)).toBeNull()
  })

  it('parseWorkspaceJson returns null for a workspace with an invalid transfer-event target', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    // Inject an invalid transfer event on the ETF instance (non-existent target).
    const etfInst = ws.baseline.assumptions.etf[0] as unknown as Record<string, unknown>
    etfInst.transferEvents = [
      {
        type: 'certified',
        year: 2030,
        sourceInstanceId: etfInst.instanceId,
        targetInstanceId: 'nonexistent-instance-id',
        amountEUR: 5000,
      },
    ]
    const json = buildWorkspaceJson(ws)
    // Validation must reject this workspace (target instance doesn't exist).
    expect(parseWorkspaceJson(json)).toBeNull()
  })

  it('parseWorkspaceJson returns null for corrupt JSON', () => {
    expect(parseWorkspaceJson('{corrupt')).toBeNull()
    expect(parseWorkspaceJson('')).toBeNull()
    expect(parseWorkspaceJson('null')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// E. Legacy v1 migration path
// ---------------------------------------------------------------------------

describe('E — legacy v1 migration path', () => {
  it('loadSavedWorkspace migrates a v1 key to a v2 Workspace', () => {
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 37 })
    const result = loadSavedWorkspace()
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(2)
    expect(result!.baseline.profile.age).toBe(37)
  })

  it('loadSavedState migrates a v1 key to a valid singleton state', () => {
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 33 })
    const result = loadSavedState()
    expect(result).not.toBeNull()
    expect(result!.profile.age).toBe(33)
  })

  it('v2 key is preferred over v1 key when both are present', () => {
    const ws = migrateV1ToV2(
      { ...defaultProfile, age: 55 } as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    mem.store[STORAGE_KEY_V2] = buildWorkspaceJson(ws)
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 25 })
    const result = loadSavedWorkspace()
    expect(result).not.toBeNull()
    expect(result!.baseline.profile.age).toBe(55)
  })

  it('v1 migration preserves fee split (annualAssetFee → wrapperAssetFee)', () => {
    const oldFees = {
      annualAssetFee: 0.010,
      contributionFee: 0.04,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
    }
    const assumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 300, fees: oldFees },
    }
    // Cast via unknown: oldFees intentionally omits new fields (annualAssetFee migration test).
    mem.store[STORAGE_KEY_V1] = makeV1Json(defaultProfile, assumptions as unknown as typeof defaultAssumptions)
    const ws = loadSavedWorkspace()
    expect(ws).not.toBeNull()
    const bavInst = ws!.baseline.assumptions.bav[0]
    expect(bavInst.fees.wrapperAssetFee).toBe(0.010)
    expect(bavInst.fees.fundAssetFee).toBe(0)
  })

  it('v1 migration rejects a malformed v1 payload (null profile)', () => {
    const badV1 = JSON.stringify({ version: 1, profile: null, assumptions: defaultAssumptions })
    mem.store[STORAGE_KEY_V1] = badV1
    const result = loadSavedWorkspace()
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// F. transferEventKey — exported helper for issue 04 coordination
// ---------------------------------------------------------------------------

describe('F — transferEventKey export (shared with portfolio transfer collection)', () => {
  it('produces a stable key for a certified transfer event', () => {
    const ev = {
      type: 'certified' as const,
      year: 2030,
      sourceInstanceId: 'riester-singleton',
      targetInstanceId: 'altersvorsorgedepot-singleton',
      amountEUR: 15000,
    }
    const key = transferEventKey(ev)
    expect(typeof key).toBe('string')
    expect(key).toContain('certified')
    expect(key).toContain('riester-singleton')
    expect(key).toContain('altersvorsorgedepot-singleton')
    expect(key).toContain('2030')
  })

  it('produces a stable key for a surrender_reinvest event (includes haircutPct)', () => {
    const ev = {
      type: 'surrender_reinvest' as const,
      year: 2035,
      sourceInstanceId: 'bav-singleton',
      targetInstanceId: 'etf-singleton',
      amountEUR: 50000,
      surrenderHaircutPct: 0.02,
    }
    const key = transferEventKey(ev)
    expect(key).toContain('surrender_reinvest')
    expect(key).toContain('0.02')
  })

  it('two events with different years produce different keys', () => {
    const base = {
      type: 'certified' as const,
      sourceInstanceId: 'riester-singleton',
      targetInstanceId: 'altersvorsorgedepot-singleton',
      amountEUR: 10000,
    }
    const key1 = transferEventKey({ ...base, year: 2030 })
    const key2 = transferEventKey({ ...base, year: 2031 })
    expect(key1).not.toEqual(key2)
  })

  it('two events with different amounts produce different keys', () => {
    const base = {
      type: 'certified' as const,
      year: 2030,
      sourceInstanceId: 'riester-singleton',
      targetInstanceId: 'altersvorsorgedepot-singleton',
    }
    const key1 = transferEventKey({ ...base, amountEUR: 10000 })
    const key2 = transferEventKey({ ...base, amountEUR: 20000 })
    expect(key1).not.toEqual(key2)
  })
})
