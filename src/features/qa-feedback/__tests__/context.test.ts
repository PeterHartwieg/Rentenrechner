/**
 * Unit tests for collectWorkspaceContext (Lane D / issue 05).
 *
 * These are environment-agnostic (no jsdom needed) because the function reads
 * from localStorage (stubbed) and an optional DOM element parameter.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectWorkspaceContext } from '../context/collectWorkspaceContext'
import { STORAGE_KEY_V2 } from '../../../storage'

// ---------------------------------------------------------------------------
// Stub localStorage so detectSavedMode() can see what we plant.
// ---------------------------------------------------------------------------
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]) }),
  get length() { return Object.keys(store).length },
  key: vi.fn(),
}

function fakeElement(
  attrs: Record<string, string> = {},
  parentElement: Element | null = null,
): Element {
  return {
    getAttribute: vi.fn((name: string) => attrs[name] ?? null),
    hasAttribute: vi.fn((name: string) => Object.hasOwn(attrs, name)),
    parentElement,
  } as unknown as Element
}

vi.stubGlobal('localStorage', localStorageMock)
vi.stubGlobal('window', { location: { search: '' } })

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
})

describe('collectWorkspaceContext — mode detection', () => {
  it('returns mode=compare when localStorage has a compare-mode save', () => {
    localStorageMock.setItem(STORAGE_KEY_V2, JSON.stringify({ mode: 'compare' }))
    const ctx = collectWorkspaceContext()
    expect(ctx.mode).toBe('compare')
  })

  it('returns mode=combine when localStorage has a combine-mode save', () => {
    localStorageMock.setItem(STORAGE_KEY_V2, JSON.stringify({ mode: 'combine' }))
    const ctx = collectWorkspaceContext()
    expect(ctx.mode).toBe('combine')
  })

  it('returns undefined mode when no save exists (new user)', () => {
    const ctx = collectWorkspaceContext()
    expect(ctx.mode).toBeUndefined()
  })

  it('returns mode=compare for a legacy v1 save (fallback path)', () => {
    // detectSavedMode falls back to v1 key when v2 is absent.
    localStorageMock.setItem('rentenrechner-state-v1', '{"version":1}')
    const ctx = collectWorkspaceContext()
    expect(ctx.mode).toBe('compare')
  })
})

describe('collectWorkspaceContext — activeView passthrough', () => {
  it('forwards the activeView argument directly', () => {
    const ctx = collectWorkspaceContext({ activeView: 'vergleich' })
    expect(ctx.activeView).toBe('vergleich')
  })

  it('leaves activeView undefined when not provided', () => {
    const ctx = collectWorkspaceContext()
    expect(ctx.activeView).toBeUndefined()
  })
})

describe('collectWorkspaceContext — activeProductId passthrough', () => {
  it('forwards activeProductId when provided', () => {
    const ctx = collectWorkspaceContext({ activeProductId: 'bav' })
    expect(ctx.activeProductId).toBe('bav')
  })

  it('leaves activeProductId undefined when not provided', () => {
    const ctx = collectWorkspaceContext()
    expect(ctx.activeProductId).toBeUndefined()
  })
})

describe('collectWorkspaceContext — flow detection (DOM)', () => {
  it('returns undefined flow when no pinnedElement is provided', () => {
    const ctx = collectWorkspaceContext()
    expect(ctx.flow).toBeUndefined()
  })

  it('returns undefined flow when pinnedElement is null', () => {
    const ctx = collectWorkspaceContext({ pinnedElement: null })
    expect(ctx.flow).toBeUndefined()
  })

  it('does not leak aria-labelledby text from dialog labels into QA context', () => {
    const previousDocument = globalThis.document
    const root = fakeElement()
    const dialog = fakeElement({ role: 'dialog', 'aria-labelledby': 'contract-name' }, root)
    const target = fakeElement({}, dialog)

    try {
      vi.stubGlobal('document', {
        documentElement: root,
        getElementById: vi.fn(() => ({
          textContent: 'Private Vertragsnotiz: Alice Musterfrau',
        })),
      })
      const ctx = collectWorkspaceContext({ pinnedElement: target })

      expect(ctx.flow).toBe('dialog')
    } finally {
      vi.stubGlobal('document', previousDocument)
    }
  })
})
