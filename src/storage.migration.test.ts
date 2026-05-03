/**
 * Migration tests for storage.ts (Group G issue 02 — v1→v2 schema migration).
 *
 * Test plan coverage:
 * 1. Migration round-trip: v1 localStorage/library/share-URL → v2 → re-serialize → stable
 * 2. v2-only round-trip: v2 → re-serialize → stable
 * 3. Forward-compat: v3 entry rejected; falls back to defaults in main state
 * 4. Migration idempotence: migrating an already-v2 state is a no-op
 * 5. Deterministic singleton-id: v1 → v2 produces ${productId}-singleton ids
 * 6. Empty evidenceMap: every migrated instance has evidenceMap: {}
 * 7. Length-0 vs length-1 detection (all-zero bAV → length-0; non-zero → length-1)
 * 8. Empty-array preservation through mergeDeep
 * 9. Inverse projection byte-identity: migrateV1ToV2 + extractSingletonAssumptions ≈ original
 * 10. Existing oracle golden tests pass (via npm run verify)
 * 11. Illegal transfer-pairing rejection
 * 12. TransferEvent target instance must exist
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import {
  buildWorkspaceJson,
  defaultWorkspace,
  extractSingletonAssumptions,
  loadSavedState,
  loadSavedWorkspace,
  migrateV1ToV2,
  parseStateFromJson,
  parseWorkspaceJson,
  saveWorkspace,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
} from './storage'
import { validateWorkspace, validateWorkspaceAssumptions } from './utils/scenarioSchema'

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

/** Serialize a v1-format payload (what legacy localStorage/share-URL looks like). */
function makeV1Json(
  profile = defaultProfile,
  assumptions = defaultAssumptions,
): string {
  return JSON.stringify({ version: 1, profile, assumptions })
}

/** Assumptions with non-zero bAV contribution. */
const assumptionsWithBav = {
  ...defaultAssumptions,
  bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
}

/** Assumptions with zero bAV (all-default, no contribution). */
const assumptionsZeroBav = {
  ...defaultAssumptions,
  bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 0, contractualMatchPercent: 0, contractualFixedMonthly: 0 },
}

/** Assumptions with non-zero Riester. */
const assumptionsWithRiester = {
  ...defaultAssumptions,
  riester: { ...defaultAssumptions.riester, monthlyOwnContribution: 100 },
}

/** Assumptions with all-zero Riester. */
const assumptionsZeroRiester = {
  ...defaultAssumptions,
  riester: { ...defaultAssumptions.riester, monthlyOwnContribution: 0, existingCapital: 0 },
}

// ---------------------------------------------------------------------------
// Test 1: Migration round-trip
// ---------------------------------------------------------------------------

describe('Test 1 — migration round-trip (v1 → v2 → re-serialize → stable)', () => {
  it('v1 localStorage payload parses to a valid result', () => {
    const raw = makeV1Json()
    const result = parseStateFromJson(raw)
    expect(result).not.toBeNull()
    expect(result!.profile.age).toBe(defaultProfile.age)
  })

  it('v1 → v2 workspace round-trips through buildWorkspaceJson → parseWorkspaceJson', () => {
    const workspace = migrateV1ToV2(defaultProfile as unknown as Record<string, unknown>, defaultAssumptions as unknown as Record<string, unknown>)
    const json = buildWorkspaceJson(workspace)
    const parsed = parseWorkspaceJson(json)
    expect(parsed).not.toBeNull()
    expect(parsed!.schemaVersion).toBe(2)
    // Re-serialize again — must be stable.
    const json2 = buildWorkspaceJson(parsed!)
    expect(json2).toEqual(json)
  })

  it('v1 share-URL payload (passed as parseWorkspaceJson) migrates to v2', () => {
    const raw = makeV1Json()
    const workspace = parseWorkspaceJson(raw)
    expect(workspace).not.toBeNull()
    expect(workspace!.schemaVersion).toBe(2)
  })

  it('v1 localStorage read via loadSavedWorkspace returns a v2 Workspace', () => {
    mem.store[STORAGE_KEY_V1] = makeV1Json()
    const workspace = loadSavedWorkspace()
    expect(workspace).not.toBeNull()
    expect(workspace!.schemaVersion).toBe(2)
  })

  it('v1 library entry shape migrates losslessly via migrateV1ToV2', () => {
    const workspace = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithBav as unknown as Record<string, unknown>,
    )
    expect(workspace.schemaVersion).toBe(2)
    expect(workspace.baseline.profile.age).toBe(defaultProfile.age)
    // bAV was non-zero → length-1 instance array.
    expect(workspace.baseline.assumptions.bav).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Test 2: v2-only round-trip
// ---------------------------------------------------------------------------

describe('Test 2 — v2-only round-trip', () => {
  it('a freshly-migrated v2 workspace serializes and parses stably', () => {
    const workspace = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    const json = buildWorkspaceJson(workspace)
    const parsed1 = parseWorkspaceJson(json)
    expect(parsed1).not.toBeNull()
    const json2 = buildWorkspaceJson(parsed1!)
    const parsed2 = parseWorkspaceJson(json2)
    expect(parsed2).not.toBeNull()
    expect(json2).toEqual(json)
  })

  it('loadSavedWorkspace prefers v2 key over v1 key', () => {
    // v2 has newer profile age; v1 has older age.
    const workspace = migrateV1ToV2(
      { ...defaultProfile, age: 45 } as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    mem.store[STORAGE_KEY_V2] = buildWorkspaceJson(workspace)
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 28 })
    const loaded = loadSavedWorkspace()
    expect(loaded).not.toBeNull()
    expect(loaded!.baseline.profile.age).toBe(45)
  })
})

// ---------------------------------------------------------------------------
// Test 3: Forward-compat — schemaVersion > 2 rejected
// ---------------------------------------------------------------------------

describe('Test 3 — forward-compat guard (schemaVersion > 2)', () => {
  it('a hand-written v3 workspace entry is rejected by parseWorkspaceJson', () => {
    const v3Payload = JSON.stringify({ schemaVersion: 3, mode: 'compare', baseline: {}, whatIfs: [], pinnedComparisonIds: [] })
    expect(parseWorkspaceJson(v3Payload)).toBeNull()
  })

  it('a v3 entry in the V2 key causes loadSavedWorkspace to fall back to V1 (absent here → null)', () => {
    const v3Payload = JSON.stringify({ schemaVersion: 3, mode: 'compare', baseline: {}, whatIfs: [], pinnedComparisonIds: [] })
    mem.store[STORAGE_KEY_V2] = v3Payload
    // V2 parse fails → falls back to V1 (absent) → null.
    const result = loadSavedWorkspace()
    expect(result).toBeNull()
  })

  it('main-state v3 falls back to defaults (parseStateFromJson)', () => {
    const v3 = JSON.stringify({ schemaVersion: 3, mode: 'compare', baseline: {}, whatIfs: [], pinnedComparisonIds: [] })
    expect(parseStateFromJson(v3)).toBeNull()
  })

  it('validateWorkspace rejects a workspace with schemaVersion 3', () => {
    const w = { schemaVersion: 3, mode: 'compare', baseline: null, whatIfs: [], pinnedComparisonIds: [] }
    expect(validateWorkspace(w)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Test 4: Migration idempotence
// ---------------------------------------------------------------------------

describe('Test 4 — migration idempotence (already-v2 state is a no-op)', () => {
  it('parseWorkspaceJson applied twice to a v2 payload produces the same result', () => {
    const workspace = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    const json = buildWorkspaceJson(workspace)
    const first = parseWorkspaceJson(json)!
    const json2 = buildWorkspaceJson(first)
    const second = parseWorkspaceJson(json2)
    expect(second).not.toBeNull()
    expect(json2).toEqual(json)
  })

  it('loadSavedWorkspace on an already-v2 stored state returns the same workspace (idempotent)', () => {
    const workspace = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithBav as unknown as Record<string, unknown>,
    )
    mem.store[STORAGE_KEY_V2] = buildWorkspaceJson(workspace)
    const loaded = loadSavedWorkspace()
    expect(loaded).not.toBeNull()
    expect(loaded!.baseline.assumptions.bav).toHaveLength(1)
    // Save and reload — still length-1.
    saveWorkspace(loaded!)
    const loaded2 = loadSavedWorkspace()
    expect(loaded2!.baseline.assumptions.bav).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Test 5: Deterministic singleton-id
// ---------------------------------------------------------------------------

describe('Test 5 — deterministic singleton ids', () => {
  it('bAV migrated instance has instanceId "bav-singleton"', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithBav as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.bav[0].instanceId).toBe('bav-singleton')
  })

  it('ETF migrated instance has instanceId "etf-singleton"', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.etf[0].instanceId).toBe('etf-singleton')
  })

  it('insurance migrated instance has instanceId "versicherung-singleton"', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.insurance[0].instanceId).toBe('versicherung-singleton')
  })

  it('basisrente migrated instance has instanceId "basisrente-singleton"', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      { ...defaultAssumptions, basisrente: { ...defaultAssumptions.basisrente, monthlyGrossContribution: 300 } } as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.basisrente[0].instanceId).toBe('basisrente-singleton')
  })

  it('AVD migrated instance has instanceId "altersvorsorgedepot-singleton"', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      { ...defaultAssumptions, altersvorsorgedepot: { ...defaultAssumptions.altersvorsorgedepot, monthlyOwnContribution: 100 } } as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.altersvorsorgedepot[0].instanceId).toBe('altersvorsorgedepot-singleton')
  })

  it('Riester migrated instance has instanceId "riester-singleton"', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithRiester as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.riester[0].instanceId).toBe('riester-singleton')
  })

  it('same v1 JSON always produces the same instance ids (determinism)', () => {
    const ws1 = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithBav as unknown as Record<string, unknown>,
    )
    const ws2 = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithBav as unknown as Record<string, unknown>,
    )
    expect(ws1.baseline.assumptions.bav[0].instanceId).toBe(ws2.baseline.assumptions.bav[0].instanceId)
  })
})

// ---------------------------------------------------------------------------
// Test 6: Empty evidenceMap on every migrated instance
// ---------------------------------------------------------------------------

describe('Test 6 — empty evidenceMap on migrated instances', () => {
  it('migrated bAV instance has evidenceMap: {}', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithBav as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.bav[0].evidenceMap).toEqual({})
  })

  it('migrated ETF instance has evidenceMap: {}', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.etf[0].evidenceMap).toEqual({})
  })

  it('migrated insurance instance has evidenceMap: {}', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.insurance[0].evidenceMap).toEqual({})
  })

  it('all migrated instances across all products have evidenceMap: {}', () => {
    const richAssumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
      riester: { ...defaultAssumptions.riester, monthlyOwnContribution: 100 },
      basisrente: { ...defaultAssumptions.basisrente, monthlyGrossContribution: 200 },
      altersvorsorgedepot: { ...defaultAssumptions.altersvorsorgedepot, monthlyOwnContribution: 150 },
    }
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      richAssumptions as unknown as Record<string, unknown>,
    )
    const allInstances = [
      ...ws.baseline.assumptions.bav,
      ...ws.baseline.assumptions.etf,
      ...ws.baseline.assumptions.insurance,
      ...ws.baseline.assumptions.basisrente,
      ...ws.baseline.assumptions.altersvorsorgedepot,
      ...ws.baseline.assumptions.riester,
    ]
    for (const inst of allInstances) {
      expect(inst.evidenceMap).toEqual({})
    }
  })
})

// ---------------------------------------------------------------------------
// Test 7: Length-0 vs length-1 detection
// ---------------------------------------------------------------------------

describe('Test 7 — length-0 vs length-1 detection', () => {
  it('bAV with all-zero contribution migrates to length-0', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsZeroBav as unknown as Record<string, unknown>,
    )
    // Detection rule: a singleton migrates to length-1 only if it has a non-zero
    // monthly contribution, non-zero current value, or non-zero employer match.
    expect(ws.baseline.assumptions.bav).toHaveLength(0)
  })

  it('bAV with non-zero contribution migrates to length-1', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithBav as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.bav).toHaveLength(1)
  })

  it('bAV with only a non-zero employer match migrates to length-1', () => {
    const assumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 0, contractualFixedMonthly: 50 },
    }
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptions as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.bav).toHaveLength(1)
  })

  it('Riester with zero contribution AND zero existingCapital migrates to length-0', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsZeroRiester as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.riester).toHaveLength(0)
  })

  it('Riester with non-zero existingCapital migrates to length-1', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      { ...defaultAssumptions, riester: { ...defaultAssumptions.riester, monthlyOwnContribution: 0, existingCapital: 5000 } } as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.riester).toHaveLength(1)
  })

  it('ETF always migrates to length-1 (no contribution field; prefer length-1)', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.etf).toHaveLength(1)
  })

  it('insurance always migrates to length-1 (no contribution field; prefer length-1)', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.insurance).toHaveLength(1)
  })

  it('Basisrente with zero contribution migrates to length-0', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      { ...defaultAssumptions, basisrente: { ...defaultAssumptions.basisrente, monthlyGrossContribution: 0 } } as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.basisrente).toHaveLength(0)
  })

  it('AVD with zero contribution migrates to length-0', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      { ...defaultAssumptions, altersvorsorgedepot: { ...defaultAssumptions.altersvorsorgedepot, monthlyOwnContribution: 0 } } as unknown as Record<string, unknown>,
    )
    expect(ws.baseline.assumptions.altersvorsorgedepot).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Test 8: Empty-array preservation through mergeDeep
// ---------------------------------------------------------------------------

describe('Test 8 — empty-array preservation through mergeDeep + validation', () => {
  it('a v2 workspace with bav: [] survives parseWorkspaceJson as bav: []', () => {
    const workspace = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsZeroBav as unknown as Record<string, unknown>,
    )
    // bAV was all-zero → should be length-0.
    expect(workspace.baseline.assumptions.bav).toHaveLength(0)
    const json = buildWorkspaceJson(workspace)
    const reparsed = parseWorkspaceJson(json)
    expect(reparsed).not.toBeNull()
    expect(reparsed!.baseline.assumptions.bav).toHaveLength(0)
  })

  it('a v2 workspace with riester: [] survives round-trip as riester: []', () => {
    const workspace = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsZeroRiester as unknown as Record<string, unknown>,
    )
    expect(workspace.baseline.assumptions.riester).toHaveLength(0)
    const json = buildWorkspaceJson(workspace)
    const reparsed = parseWorkspaceJson(json)
    expect(reparsed!.baseline.assumptions.riester).toHaveLength(0)
  })

  it('defaultWorkspace has empty instance arrays per product', () => {
    expect(defaultWorkspace.baseline.assumptions.bav).toHaveLength(0)
    expect(defaultWorkspace.baseline.assumptions.etf).toHaveLength(0)
    expect(defaultWorkspace.baseline.assumptions.insurance).toHaveLength(0)
    expect(defaultWorkspace.baseline.assumptions.basisrente).toHaveLength(0)
    expect(defaultWorkspace.baseline.assumptions.altersvorsorgedepot).toHaveLength(0)
    expect(defaultWorkspace.baseline.assumptions.riester).toHaveLength(0)
  })

  it('validateWorkspaceAssumptions accepts empty instance arrays', () => {
    expect(validateWorkspaceAssumptions(defaultWorkspace.baseline.assumptions)).not.toBeNull()
  })

  it('empty instance arrays in a workspace pass validateWorkspace', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsZeroBav as unknown as Record<string, unknown>,
    )
    // Note: validateWorkspace requires the full scenario shape to be valid.
    // The migrated workspace has valid profile/assumptions, so this should pass.
    const result = validateWorkspace(ws)
    expect(result).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Test 9: Inverse projection byte-identity
// ---------------------------------------------------------------------------

describe('Test 9 — extractSingletonAssumptions byte-identity', () => {
  it('migrated v2 → extractSingletonAssumptions produces bAV matching the original singleton', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithBav as unknown as Record<string, unknown>,
    )
    const singleton = extractSingletonAssumptions(ws)
    // Core bAV fields must match.
    expect(singleton.bav.monthlyGrossConversion).toBe(assumptionsWithBav.bav.monthlyGrossConversion)
    expect(singleton.bav.contractualMatchPercent).toBe(assumptionsWithBav.bav.contractualMatchPercent)
    expect(singleton.bav.durchfuehrungsweg).toBe(assumptionsWithBav.bav.durchfuehrungsweg)
    expect(singleton.bav.fees.wrapperAssetFee).toBe(assumptionsWithBav.bav.fees.wrapperAssetFee)
    expect(singleton.bav.payoutMode).toBe(assumptionsWithBav.bav.payoutMode)
    expect(singleton.bav.rentenfaktor).toBe(assumptionsWithBav.bav.rentenfaktor)
  })

  it('migrated v2 → extractSingletonAssumptions preserves scenario-level fields', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    const singleton = extractSingletonAssumptions(ws)
    expect(singleton.inflationRate).toBe(defaultAssumptions.inflationRate)
    expect(singleton.retirementEndAge).toBe(defaultAssumptions.retirementEndAge)
    expect(singleton.returnScenarios).toHaveLength(defaultAssumptions.returnScenarios.length)
    expect(singleton.visibleProducts).toEqual(defaultAssumptions.visibleProducts)
  })

  it('when product array is length-0, extractSingletonAssumptions falls back to defaultAssumptions', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsZeroBav as unknown as Record<string, unknown>,
    )
    // bAV array is empty → should fall back to defaultAssumptions.bav
    const singleton = extractSingletonAssumptions(ws)
    // Fallback is defaultAssumptions.bav (not the zero-bAV shape) — the engine
    // needs a valid singleton; the zero contribution is the user-visible state.
    expect(singleton.bav.monthlyGrossConversion).toBe(defaultAssumptions.bav.monthlyGrossConversion)
    expect(typeof singleton.bav.durchfuehrungsweg).toBe('string')
  })

  it('v1 round-trip via migrateAndValidateState and extractSingletonAssumptions is structurally identical', () => {
    // Parse via legacy path to get singleton.
    const legacySingleton = {
      profile: defaultProfile,
      assumptions: assumptionsWithBav,
    }
    // Migrate to v2 then back to singleton.
    const ws = migrateV1ToV2(
      legacySingleton.profile as unknown as Record<string, unknown>,
      legacySingleton.assumptions as unknown as Record<string, unknown>,
    )
    const extracted = extractSingletonAssumptions(ws)

    // Key engine inputs must be byte-identical.
    expect(extracted.bav.monthlyGrossConversion).toBe(legacySingleton.assumptions.bav.monthlyGrossConversion)
    expect(extracted.bav.rentenfaktor).toBe(legacySingleton.assumptions.bav.rentenfaktor)
    expect(extracted.etf.annualAssetFee).toBe(legacySingleton.assumptions.etf.annualAssetFee)
    expect(extracted.insurance.contractStartYear).toBe(legacySingleton.assumptions.insurance.contractStartYear)
    expect(extracted.inflationRate).toBe(legacySingleton.assumptions.inflationRate)
    expect(extracted.retirementEndAge).toBe(legacySingleton.assumptions.retirementEndAge)
  })
})

// ---------------------------------------------------------------------------
// Test 10: Oracle goldens green (covered by npm run verify — no additional test needed)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Test 11: Illegal transfer-pairing rejection
// ---------------------------------------------------------------------------

describe('Test 11 — illegal transfer-pairing rejection', () => {
  it('validateWorkspaceAssumptions rejects AVD instance with transferEvent pointing to Riester target', () => {
    const avdInstance = {
      instanceId: 'altersvorsorgedepot-singleton',
      label: 'AVD',
      status: 'active',
      contractStartYear: 2026,
      evidenceMap: {},
      ...defaultAssumptions.altersvorsorgedepot,
      transferEvents: [
        {
          type: 'certified',
          year: 2030,
          sourceInstanceId: 'altersvorsorgedepot-singleton',
          targetInstanceId: 'riester-singleton',
          amountEUR: 10000,
        },
      ],
    }
    const riesterInstance = {
      instanceId: 'riester-singleton',
      label: 'Riester',
      status: 'active',
      contractStartYear: 2005,
      evidenceMap: {},
      ...defaultAssumptions.riester,
    }
    const assumptions: Record<string, unknown> = {
      ...defaultWorkspace.baseline.assumptions,
      altersvorsorgedepot: [avdInstance],
      riester: [riesterInstance],
    }
    // AVD → Riester is an illegal certified transfer pairing.
    expect(validateWorkspaceAssumptions(assumptions)).toBeNull()
  })

  it('Riester → AVD certified transfer is valid (a legal AltZertG path)', () => {
    const riesterInstance = {
      instanceId: 'riester-singleton',
      label: 'Riester',
      status: 'active',
      contractStartYear: 2005,
      evidenceMap: {},
      ...defaultAssumptions.riester,
      transferEvents: [
        {
          type: 'certified',
          year: 2026,
          sourceInstanceId: 'riester-singleton',
          targetInstanceId: 'altersvorsorgedepot-singleton',
          amountEUR: 15000,
        },
      ],
    }
    const avdInstance = {
      instanceId: 'altersvorsorgedepot-singleton',
      label: 'AVD',
      status: 'active',
      contractStartYear: 2026,
      evidenceMap: {},
      ...defaultAssumptions.altersvorsorgedepot,
    }
    const assumptions: Record<string, unknown> = {
      ...defaultWorkspace.baseline.assumptions,
      riester: [riesterInstance],
      altersvorsorgedepot: [avdInstance],
    }
    expect(validateWorkspaceAssumptions(assumptions)).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Test 12: TransferEvent target instance must exist
// ---------------------------------------------------------------------------

describe('Test 12 — transferEvent target instance must exist', () => {
  it('validator rejects a transferEvent whose targetInstanceId does not exist in the workspace', () => {
    const bavInstance = {
      instanceId: 'bav-singleton',
      label: 'bAV',
      status: 'active',
      contractStartYear: 2015,
      evidenceMap: {},
      ...defaultAssumptions.bav,
      transferEvents: [
        {
          type: 'surrender_reinvest',
          year: 2030,
          sourceInstanceId: 'bav-singleton',
          targetInstanceId: 'etf-nonexistent', // this instance does not exist in workspace
          amountEUR: 50000,
          surrenderHaircutPct: 0,
        },
      ],
    }
    const assumptions: Record<string, unknown> = {
      ...defaultWorkspace.baseline.assumptions,
      bav: [bavInstance],
      // etf is empty (no etf-nonexistent instance)
      etf: [],
    }
    expect(validateWorkspaceAssumptions(assumptions)).toBeNull()
  })

  it('validator accepts a transferEvent whose targetInstanceId exists in another product array', () => {
    const etfInstance = {
      instanceId: 'etf-singleton',
      label: 'ETF',
      status: 'active',
      contractStartYear: 2020,
      evidenceMap: {},
      ...defaultAssumptions.etf,
    }
    const bavInstance = {
      instanceId: 'bav-singleton',
      label: 'bAV',
      status: 'active',
      contractStartYear: 2015,
      evidenceMap: {},
      ...defaultAssumptions.bav,
      transferEvents: [
        {
          type: 'surrender_reinvest',
          year: 2030,
          sourceInstanceId: 'bav-singleton',
          targetInstanceId: 'etf-singleton',
          amountEUR: 50000,
          surrenderHaircutPct: 0,
        },
      ],
    }
    const assumptions: Record<string, unknown> = {
      ...defaultWorkspace.baseline.assumptions,
      bav: [bavInstance],
      etf: [etfInstance],
    }
    expect(validateWorkspaceAssumptions(assumptions)).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Additional: loadSavedState / saveWorkspace integration
// ---------------------------------------------------------------------------

describe('loadSavedState + saveWorkspace integration', () => {
  it('saveWorkspace writes v2 key but does NOT remove v1 key (issue 03 owns that step)', () => {
    mem.store[STORAGE_KEY_V1] = makeV1Json()
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    saveWorkspace(ws)
    // V1 key preserved — issue 03 will remove it when the write path switches.
    expect(mem.store[STORAGE_KEY_V1]).toBeDefined()
    expect(mem.store[STORAGE_KEY_V2]).toBeDefined()
  })

  it('loadSavedState reads v2 key (written by saveWorkspace) and returns valid profile + assumptions', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      assumptionsWithBav as unknown as Record<string, unknown>,
    )
    saveWorkspace(ws)
    const result = loadSavedState()
    expect(result).not.toBeNull()
    expect(result!.profile.age).toBe(defaultProfile.age)
  })

  it('loadSavedState falls back to v1 when v2 key is absent', () => {
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 42 })
    const result = loadSavedState()
    expect(result).not.toBeNull()
    expect(result!.profile.age).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// Test 13: loadSavedWorkspace falls back to V1 when V2 is unparseable
// ---------------------------------------------------------------------------

describe('Test 13 — loadSavedWorkspace falls back to V1 on corrupt/future V2', () => {
  it('corrupt V2 JSON + valid V1 → returns migrated V1 workspace', () => {
    mem.store[STORAGE_KEY_V2] = '{not valid json at all'
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 44 })
    const result = loadSavedWorkspace()
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(2)
    expect(result!.baseline.profile.age).toBe(44)
  })

  it('v3 payload in V2 key + valid V1 → falls back to V1', () => {
    const v3 = JSON.stringify({ schemaVersion: 3, mode: 'compare', baseline: {}, whatIfs: [], pinnedComparisonIds: [] })
    mem.store[STORAGE_KEY_V2] = v3
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 38 })
    const result = loadSavedWorkspace()
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(2)
    expect(result!.baseline.profile.age).toBe(38)
  })

  it('corrupt V2 + absent V1 → returns null', () => {
    mem.store[STORAGE_KEY_V2] = 'completely broken'
    const result = loadSavedWorkspace()
    expect(result).toBeNull()
  })

  it('valid V2 is preferred over valid V1 even when both are present', () => {
    const ws = migrateV1ToV2(
      { ...defaultProfile, age: 50 } as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    mem.store[STORAGE_KEY_V2] = buildWorkspaceJson(ws)
    mem.store[STORAGE_KEY_V1] = makeV1Json({ ...defaultProfile, age: 30 })
    const result = loadSavedWorkspace()
    expect(result).not.toBeNull()
    expect(result!.baseline.profile.age).toBe(50)
  })
})
