import { describe, expect, it, vi, afterEach } from 'vitest'
import { safeSetItem } from './safeStorage'

// Helper that builds a minimal Storage-like object, starting from the
// real globalThis.localStorage (which exists in the node test environment
// as an in-memory store).

function makeThrowingStorage(): Storage {
  const store: Record<string, string> = {}
  const base: Storage = {
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
    setItem() {
      throw new DOMException('QuotaExceededError')
    },
  }
  return base
}

function makeWorkingStorage(): Storage & { store: Record<string, string> } {
  const store: Record<string, string> = {}
  return {
    store,
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
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('safeSetItem', () => {
  it('returns true and writes the value on success', () => {
    const working = makeWorkingStorage()
    vi.stubGlobal('localStorage', working)

    const result = safeSetItem('test-key', 'test-value')

    expect(result).toBe(true)
    expect(working.store['test-key']).toBe('test-value')
  })

  it('returns false and does not throw when setItem throws (quota exhaustion)', () => {
    vi.stubGlobal('localStorage', makeThrowingStorage())

    expect(() => safeSetItem('test-key', 'test-value')).not.toThrow()
    expect(safeSetItem('test-key', 'test-value')).toBe(false)
  })

  it('returns false and does not throw when setItem throws a generic Error', () => {
    vi.stubGlobal('localStorage', {
      ...makeWorkingStorage(),
      setItem() {
        throw new Error('Storage is disabled')
      },
    })

    expect(() => safeSetItem('any-key', 'any-value')).not.toThrow()
    expect(safeSetItem('any-key', 'any-value')).toBe(false)
  })
})
