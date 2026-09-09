// @vitest-environment jsdom
/**
 * Who writes STORAGE_KEY_V2 in combine-mode, and how often.
 *
 * The workspace store in `portfolioState.ts` persists write-through inside
 * `setWorkspaceStore`, so one mutation must produce exactly one write. A second
 * writer in `useAngabenState`'s persistence effect used to serialise the same
 * snapshot again on every edit (Codex P2); these tests pin the single write and
 * the explicit `persistNow()` escape hatch that still exists for the
 * "user changed nothing" CTA.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { deepCloneScenario } from '../app/portfolioState'
import { defaultWorkspace, STORAGE_KEY_V2 } from '../storage'
import { useAngabenState } from './useAngabenState'

function seedCombineWorkspace(): void {
  const ws = deepCloneScenario(defaultWorkspace)
  ws.mode = 'combine'
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
}

beforeEach(() => {
  localStorage.clear()
})

describe('useAngabenState combine-mode persistence', () => {
  it('writes STORAGE_KEY_V2 exactly once per mutation', () => {
    seedCombineWorkspace()
    const { result } = renderHook(() => useAngabenState())
    expect(result.current.mode).toBe('combine')

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    act(() => {
      result.current.setProfile((p) => ({ ...p, age: p.age + 1 }))
    })

    const v2Writes = setItem.mock.calls.filter(([key]) => key === STORAGE_KEY_V2)
    expect(v2Writes).toHaveLength(1)
    setItem.mockRestore()

    // The mutation really did land — the single write is the store's, not a
    // skipped write.
    expect(result.current.profile.age).toBe(
      defaultWorkspace.baseline.profile.age + 1,
    )
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_V2) ?? '{}')
    expect(saved.baseline.profile.age).toBe(
      defaultWorkspace.baseline.profile.age + 1,
    )
  })

  it('still writes on an explicit persistNow() with no mutation', () => {
    seedCombineWorkspace()
    const { result } = renderHook(() => useAngabenState())

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    act(() => {
      result.current.persistNow()
    })

    expect(setItem.mock.calls.filter(([key]) => key === STORAGE_KEY_V2)).toHaveLength(1)
    setItem.mockRestore()
  })
})
