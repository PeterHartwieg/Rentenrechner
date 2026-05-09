import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAssumptions, defaultProfile } from './defaultScenario'
import {
  addToLibrary,
  deleteFromLibrary,
  duplicateInLibrary,
  loadLibrary,
  renameInLibrary,
  SAVED_SCENARIO_VERSION,
} from './scenarioLibrary'

const LIBRARY_KEY = 'rentenrechner-library-v1'

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

describe('scenarioLibrary persistence', () => {
  it('round-trips a freshly saved scenario', () => {
    addToLibrary('Plan A', defaultProfile, defaultAssumptions)
    const lib = loadLibrary()
    expect(lib).toHaveLength(1)
    expect(lib[0].name).toBe('Plan A')
    expect(lib[0].schemaVersion).toBe(SAVED_SCENARIO_VERSION)
    expect(lib[0].profile.age).toBe(defaultProfile.age)
    expect(lib[0].assumptions.bav.monthlyGrossConversion).toBe(
      defaultAssumptions.bav.monthlyGrossConversion,
    )
  })

  it('drops malformed entries silently and keeps the valid ones', () => {
    // Mix of: valid, missing fields, profile with NaN age, plain string.
    const valid = {
      id: 'good-1',
      name: 'Good',
      savedAt: '2026-05-03T00:00:00Z',
      schemaVersion: 1,
      profile: defaultProfile,
      assumptions: defaultAssumptions,
    }
    const missingProfile = { id: 'bad-1', name: 'Bad', savedAt: '2026-05-03T00:00:00Z' }
    const negativeAge = {
      id: 'bad-2',
      name: 'Bad',
      savedAt: '2026-05-03T00:00:00Z',
      profile: { ...defaultProfile, age: -7 },
      assumptions: defaultAssumptions,
    }
    mem.storage.setItem(LIBRARY_KEY, JSON.stringify([valid, missingProfile, negativeAge, 'not-an-object']))
    const lib = loadLibrary()
    expect(lib).toHaveLength(1)
    expect(lib[0].id).toBe('good-1')
  })

  it('returns an empty library when the JSON is unparseable', () => {
    mem.storage.setItem(LIBRARY_KEY, '{not valid json')
    expect(loadLibrary()).toEqual([])
  })

  it('returns an empty library when the root is not an array', () => {
    mem.storage.setItem(LIBRARY_KEY, JSON.stringify({ broken: true }))
    expect(loadLibrary()).toEqual([])
  })

  it('migrates a pre-#51 entry (extraEmployerContribution → contractualMatch)', () => {
    const legacy = {
      id: 'legacy-1',
      name: 'Legacy',
      savedAt: '2026-04-01T00:00:00Z',
      // No schemaVersion field — entry predates the field.
      profile: defaultProfile,
      assumptions: {
        ...defaultAssumptions,
        bav: {
          ...defaultAssumptions.bav,
          extraEmployerContributionPct: 0.4,
          extraEmployerContributionMonthly: 25,
          contractualMatchPercent: defaultAssumptions.bav.contractualMatchPercent,
          contractualFixedMonthly: defaultAssumptions.bav.contractualFixedMonthly,
        },
      },
    }
    mem.storage.setItem(LIBRARY_KEY, JSON.stringify([legacy]))
    const lib = loadLibrary()
    expect(lib).toHaveLength(1)
    expect(lib[0].assumptions.bav.contractualMatchPercent).toBe(0.4)
    expect(lib[0].assumptions.bav.contractualFixedMonthly).toBe(25)
    expect(lib[0].schemaVersion).toBe(SAVED_SCENARIO_VERSION)
  })

  it('rejects entries from a future schema version (forward-compat guard)', () => {
    const future = {
      id: 'future-1',
      name: 'Future',
      savedAt: '2026-05-03T00:00:00Z',
      schemaVersion: 99,
      profile: defaultProfile,
      assumptions: defaultAssumptions,
    }
    mem.storage.setItem(LIBRARY_KEY, JSON.stringify([future]))
    expect(loadLibrary()).toEqual([])
  })

  it('rejects an entry with out-of-range fee (fundAssetFee = 50%)', () => {
    const bad = {
      id: 'bad-fee',
      name: 'Bad Fee',
      savedAt: '2026-05-03T00:00:00Z',
      schemaVersion: 1,
      profile: defaultProfile,
      assumptions: {
        ...defaultAssumptions,
        bav: {
          ...defaultAssumptions.bav,
          fees: {
            ...defaultAssumptions.bav.fees,
            fundAssetFee: 0.6,
          },
        },
      },
    }
    mem.storage.setItem(LIBRARY_KEY, JSON.stringify([bad]))
    expect(loadLibrary()).toEqual([])
  })

  it('migrates Basisrente zeitrente → leibrente on load', () => {
    const legacy = {
      id: 'legacy-zr',
      name: 'Pre-Group-E',
      savedAt: '2026-04-01T00:00:00Z',
      profile: defaultProfile,
      assumptions: {
        ...defaultAssumptions,
        basisrente: {
          ...defaultAssumptions.basisrente,
          payoutMode: 'zeitrente',
        },
      },
    }
    mem.storage.setItem(LIBRARY_KEY, JSON.stringify([legacy]))
    const lib = loadLibrary()
    expect(lib).toHaveLength(1)
    expect(lib[0].assumptions.basisrente.payoutMode).toBe('leibrente')
  })

  it('preserves order across delete, duplicate, rename', () => {
    addToLibrary('A', defaultProfile, defaultAssumptions)
    addToLibrary('B', defaultProfile, defaultAssumptions)
    addToLibrary('C', defaultProfile, defaultAssumptions)
    const before = loadLibrary()
    expect(before.map(s => s.name)).toEqual(['A', 'B', 'C'])

    deleteFromLibrary(before[1].id)
    expect(loadLibrary().map(s => s.name)).toEqual(['A', 'C'])

    renameInLibrary(before[2].id, 'C-renamed')
    expect(loadLibrary().map(s => s.name)).toEqual(['A', 'C-renamed'])

    duplicateInLibrary(before[0].id)
    expect(loadLibrary().map(s => s.name)).toEqual(['A', 'C-renamed', 'A (Kopie)'])
  })
})

describe('scenarioLibrary write resilience', () => {
  it('addToLibrary uses a default name when given an empty string', () => {
    addToLibrary('   ', defaultProfile, defaultAssumptions)
    expect(loadLibrary()[0].name).toBe('Gespeichertes Szenario')
  })

  it('renameInLibrary ignores blank names', () => {
    addToLibrary('Original', defaultProfile, defaultAssumptions)
    const id = loadLibrary()[0].id
    renameInLibrary(id, '   ')
    expect(loadLibrary()[0].name).toBe('Original')
  })

  it('failure to read localStorage falls back to an empty library', () => {
    const broken: Storage = {
      ...mem.storage,
      getItem: vi.fn(() => {
        throw new Error('quota exceeded')
      }),
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: broken,
      configurable: true,
      writable: true,
    })
    expect(loadLibrary()).toEqual([])
  })

  it('addToLibrary does not throw when setItem throws (quota exhaustion)', () => {
    const throwingStorage: Storage = {
      ...mem.storage,
      setItem: () => {
        throw new DOMException('QuotaExceededError')
      },
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: throwingStorage,
      configurable: true,
      writable: true,
    })
    expect(() => addToLibrary('Plan X', defaultProfile, defaultAssumptions)).not.toThrow()
  })

  it('deleteFromLibrary does not throw when setItem throws', () => {
    // Seed the library while setItem still works, then break writes.
    addToLibrary('Plan Y', defaultProfile, defaultAssumptions)
    const id = loadLibrary()[0].id

    const throwingStorage: Storage = {
      ...mem.storage,
      setItem: () => {
        throw new DOMException('QuotaExceededError')
      },
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: throwingStorage,
      configurable: true,
      writable: true,
    })
    expect(() => deleteFromLibrary(id)).not.toThrow()
  })
})
