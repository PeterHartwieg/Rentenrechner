// @vitest-environment jsdom
/**
 * Perf-contract tests for `usePrintSensitivityRows`
 * (PR 11 R2 — Codex P1).
 *
 * The hook MUST NOT compute `buildPrintSensitivityRows` on a workspace
 * mutation alone. It computes only when `window.beforeprint` fires (which
 * the browser dispatches on Ctrl+P, the print menu, and `window.print()`).
 *
 * Coverage:
 *   1. Initial render returns `undefined` and does not invoke
 *      `buildPrintSensitivityRows`.
 *   2. Re-rendering with a mutated workspace (e.g. user added a contract)
 *      does NOT trigger `buildPrintSensitivityRows`.
 *   3. Dispatching a synthetic `beforeprint` event invokes
 *      `buildPrintSensitivityRows` exactly once with the latest workspace.
 *   4. Compare-mode (isCombineMode=false) short-circuits to `undefined`
 *      even when `beforeprint` fires.
 *   5. Listener is removed on unmount.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import type { Workspace } from '../domain/workspace'
import type { CombinedResult } from '../engine/portfolioCombine'
import type {
  PrintSensitivityRow,
  buildPrintSensitivityRows as BuildPrintSensitivityRowsFn,
} from '../features/results/printReportRows'

// Spy on the row-builder. `vi.mock` hoists, so the spy fires before any
// importer captures the symbol. The mock returns an empty list — the
// real builder fires `runCombineSimulation` (the very work we want to
// defer), so the test would otherwise re-run portfolio simulation on
// every event dispatch. The perf contract we are asserting is "does the
// hook call the builder?", not "what does the builder return?".
const buildPrintSensitivityRowsSpy = vi.fn<typeof BuildPrintSensitivityRowsFn>(
  () => [] as PrintSensitivityRow[],
)
vi.mock('../features/results/printReportRows', async () => {
  const actual = await vi.importActual<
    typeof import('../features/results/printReportRows')
  >('../features/results/printReportRows')
  return {
    ...actual,
    buildPrintSensitivityRows: (
      ...args: Parameters<typeof actual.buildPrintSensitivityRows>
    ) => buildPrintSensitivityRowsSpy(...args),
  }
})

// Lazy import after the mock is registered.
import { usePrintSensitivityRows } from './usePrintSensitivityRows'

function makeWorkspace(): Workspace {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
}

function makeStubCombined(): CombinedResult {
  // The hook only forwards this to the builder; the builder is mocked-thru
  // so the exact shape only matters for the real-call path. A minimal stub
  // suffices for the "did we call?" assertions.
  return {
    monthlyNetIncome: 2000,
    statutoryPensionMonthlyNet: 1000,
  } as unknown as CombinedResult
}

beforeEach(() => {
  buildPrintSensitivityRowsSpy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('usePrintSensitivityRows', () => {
  it('initial render returns undefined and does not invoke the builder', () => {
    const ws = makeWorkspace()
    const combinedByScenarioId = { basis: makeStubCombined() }
    const { result } = renderHook(() =>
      usePrintSensitivityRows({
        isCombineMode: true,
        workspace: ws,
        combinedByScenarioId,
        rules: de2026Rules,
      }),
    )
    expect(result.current).toBeUndefined()
    expect(buildPrintSensitivityRowsSpy).not.toHaveBeenCalled()
  })

  it('does NOT invoke the builder on a workspace mutation alone', () => {
    const ws1 = makeWorkspace()
    const combined1 = { basis: makeStubCombined() }
    const { result, rerender } = renderHook(
      ({ workspace, combinedByScenarioId }) =>
        usePrintSensitivityRows({
          isCombineMode: true,
          workspace,
          combinedByScenarioId,
          rules: de2026Rules,
        }),
      { initialProps: { workspace: ws1, combinedByScenarioId: combined1 } },
    )
    expect(buildPrintSensitivityRowsSpy).not.toHaveBeenCalled()

    // Simulate a workspace edit (user added a contract / changed assumptions).
    // The new reference forces a rerender; the hook must still not compute.
    const ws2 = makeWorkspace()
    const combined2 = { basis: makeStubCombined() }
    rerender({ workspace: ws2, combinedByScenarioId: combined2 })

    expect(result.current).toBeUndefined()
    expect(buildPrintSensitivityRowsSpy).not.toHaveBeenCalled()
  })

  it('invokes the builder when window.beforeprint fires', () => {
    const ws = makeWorkspace()
    const combined = { basis: makeStubCombined() }
    const { result } = renderHook(() =>
      usePrintSensitivityRows({
        isCombineMode: true,
        workspace: ws,
        combinedByScenarioId: combined,
        rules: de2026Rules,
      }),
    )
    expect(buildPrintSensitivityRowsSpy).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })

    expect(buildPrintSensitivityRowsSpy).toHaveBeenCalledTimes(1)
    const callArgs = buildPrintSensitivityRowsSpy.mock.calls[0]?.[0]
    expect(callArgs?.workspace).toBe(ws)
    expect(callArgs?.baselineCombined).toBe(combined.basis)
    expect(callArgs?.rules).toBe(de2026Rules)
    // State is now populated (real builder ran through the mock; rows is
    // an array — possibly empty for the default workspace, possibly with
    // entries — what we assert here is "no longer undefined").
    expect(result.current).toBeDefined()
  })

  it('reads the latest workspace via ref — beforeprint after a mutation uses fresh inputs', () => {
    const ws1 = makeWorkspace()
    const combined1 = { basis: makeStubCombined() }
    const { rerender } = renderHook(
      ({ workspace, combinedByScenarioId }) =>
        usePrintSensitivityRows({
          isCombineMode: true,
          workspace,
          combinedByScenarioId,
          rules: de2026Rules,
        }),
      { initialProps: { workspace: ws1, combinedByScenarioId: combined1 } },
    )

    const ws2 = makeWorkspace()
    const combined2 = { basis: makeStubCombined() }
    rerender({ workspace: ws2, combinedByScenarioId: combined2 })

    // Mutation alone — still no call.
    expect(buildPrintSensitivityRowsSpy).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })

    expect(buildPrintSensitivityRowsSpy).toHaveBeenCalledTimes(1)
    const callArgs = buildPrintSensitivityRowsSpy.mock.calls[0]?.[0]
    expect(callArgs?.workspace).toBe(ws2)
    expect(callArgs?.baselineCombined).toBe(combined2.basis)
  })

  it('compare-mode (isCombineMode=false) short-circuits even on beforeprint', () => {
    const ws = makeWorkspace()
    const combined = { basis: makeStubCombined() }
    const { result } = renderHook(() =>
      usePrintSensitivityRows({
        isCombineMode: false,
        workspace: ws,
        combinedByScenarioId: combined,
        rules: de2026Rules,
      }),
    )

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })

    expect(buildPrintSensitivityRowsSpy).not.toHaveBeenCalled()
    expect(result.current).toBeUndefined()
  })

  it('removes the listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const ws = makeWorkspace()
    const combined = { basis: makeStubCombined() }
    const { unmount } = renderHook(() =>
      usePrintSensitivityRows({
        isCombineMode: true,
        workspace: ws,
        combinedByScenarioId: combined,
        rules: de2026Rules,
      }),
    )
    unmount()
    expect(removeSpy).toHaveBeenCalledWith(
      'beforeprint',
      expect.any(Function),
    )
  })
})
