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
 *   6. (Ref read across mutation) `beforeprint` after a workspace mutation
 *      uses the latest workspace + combined, not the original.
 *   7. (PR 11 R3 — Codex P1) `flushSync` causes the rows state update to
 *      commit synchronously inside the same `beforeprint` event tick — no
 *      `await act(...)` requeue required. Guards against the print-DOM
 *      snapshot race against synchronous `window.print()`.
 *   8. (PR 11 R3 — CodeRabbit Minor) Flipping `isCombineMode` from true to
 *      false after a cached print does NOT leak the cached rows; flipping
 *      back to true reuses the cache without firing the builder again.
 *   9. (PR 11 R3 — CodeRabbit Major, CLAUDE.md cron-dispatch §2 paired
 *      assertions) Multi-instance / transfer regression: workspace mutation
 *      that adds a second instance and a transfer event is picked up via
 *      the ref read on the next `beforeprint`, paired with an explicit
 *      compare-mode short-circuit assertion to keep the singleton path
 *      coverage in the same test.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import type { Workspace } from '../domain/workspace'
import type { BavInstance } from '../domain/instances'
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

// Spy on `flushSync` via a hoisted `vi.mock`. ESM `react-dom` exports are
// non-configurable, so `vi.spyOn(ReactDom, 'flushSync')` fails with
// "Cannot redefine property" — the mock replaces the export at module-load
// time, before the hook captures the symbol. Other react-dom exports
// (createRoot, etc.) are passed through unchanged.
const flushSyncSpy = vi.fn<(fn: () => void) => void>((fn) => {
  fn()
})
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
  return {
    ...actual,
    flushSync: (fn: () => void) => flushSyncSpy(fn),
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
  flushSyncSpy.mockClear()
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

  // PR 11 R3 — Codex P1: print-DOM snapshot race.
  // `window.print()` synchronously captures the print DOM after the
  // `beforeprint` handler returns. A plain async `setRows` queues the commit
  // for after the dispatch event resolves, so the *first* print after a
  // workspace change would capture the stale DOM. `flushSync` forces React
  // to commit before the browser snapshots. We assert both: (a) `flushSync`
  // is called inside the handler, and (b) `result.current` reflects the
  // newly-computed rows in the same synchronous event tick — no extra
  // `await act(...)` round-trip required.
  it('commits the rows synchronously via flushSync inside the beforeprint handler', () => {
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
    expect(flushSyncSpy).not.toHaveBeenCalled()
    expect(result.current).toBeUndefined()

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })

    // flushSync must have been used to commit the setRows update inside
    // the synchronous beforeprint handler — without it, `window.print()`
    // would capture the print DOM before React's async commit fires.
    expect(flushSyncSpy).toHaveBeenCalledTimes(1)
    expect(flushSyncSpy).toHaveBeenCalledWith(expect.any(Function))
    // Rows are now defined — and because flushSync forces a synchronous
    // commit, the value is available on the same render `result.current`
    // already tracks, with no extra `await act(...)` round-trip required.
    expect(result.current).toBeDefined()
  })

  // PR 11 R3 — CodeRabbit Minor: stale combine rows must not leak into
  // compare-mode renders. The cached `rows` state is preserved across the
  // toggle, but the returned value is gated on `isCombineMode` so the
  // compare-mode render sees `undefined`. Flipping back to combine-mode
  // re-exposes the cache without a fresh `beforeprint`.
  it('returns undefined in compare-mode even when combine-mode rows are cached, and re-exposes the cache on flip back', () => {
    const ws = makeWorkspace()
    const combined = { basis: makeStubCombined() }
    const { result, rerender } = renderHook(
      ({ isCombineMode }) =>
        usePrintSensitivityRows({
          isCombineMode,
          workspace: ws,
          combinedByScenarioId: combined,
          rules: de2026Rules,
        }),
      { initialProps: { isCombineMode: true } },
    )

    // Print once while combine-mode — rows are cached in state.
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(buildPrintSensitivityRowsSpy).toHaveBeenCalledTimes(1)
    expect(result.current).toBeDefined()
    const cachedRows = result.current

    // Flip to compare-mode without unmounting. The hook must return
    // undefined — the cached combine-mode rows must not leak.
    rerender({ isCombineMode: false })
    expect(result.current).toBeUndefined()

    // Flip back to combine-mode. The cache is preserved across the toggle,
    // so we get the same row reference back without firing another
    // `beforeprint` (the builder must NOT have been called a second time).
    rerender({ isCombineMode: true })
    expect(result.current).toBe(cachedRows)
    expect(buildPrintSensitivityRowsSpy).toHaveBeenCalledTimes(1)
  })

  // PR 11 R3 — CodeRabbit Major (CLAUDE.md cron-dispatch §2: paired test
  // assertions for combine-mode bugs).
  //
  // The latest-ref-read pattern in `usePrintSensitivityRows` is the
  // load-bearing path for combine-mode workspaces that mutate between
  // renders (e.g. user adds a second contract, or a transfer event
  // converts an existing instance to paid_up). This test exercises that
  // path with a multi-instance + transfer-event delta and pairs it with
  // an explicit compare-mode short-circuit assertion to keep the
  // singleton path covered in the same regression.
  it('reads multi-instance + transfer-event workspace mutations via ref on the next beforeprint; compare-mode singleton still short-circuits', () => {
    // --- Combine-mode multi-instance / transfer regression ---
    const ws1 = makeWorkspace()
    const combined1 = { basis: makeStubCombined() }
    const { rerender } = renderHook(
      ({ workspace, combinedByScenarioId, isCombineMode }) =>
        usePrintSensitivityRows({
          isCombineMode,
          workspace,
          combinedByScenarioId,
          rules: de2026Rules,
        }),
      {
        initialProps: {
          workspace: ws1,
          combinedByScenarioId: combined1,
          isCombineMode: true,
        },
      },
    )

    // Build a second workspace with: (a) an additional bAV instance
    // (multi-instance delta) and (b) a transfer event on the original
    // bAV singleton (instance → paid_up + a certified-transfer entry).
    const base = makeWorkspace()
    const bavInstances = base.baseline.assumptions.bav
    expect(bavInstances.length).toBeGreaterThanOrEqual(1)
    const original = bavInstances[0] as BavInstance
    const secondBav: BavInstance = {
      ...original,
      instanceId: 'bav-second',
      label: 'bAV (zweiter Vertrag)',
    }
    const originalAsPaidUp: BavInstance = {
      ...original,
      status: 'paid_up',
      transferEvents: [
        {
          type: 'certified',
          year: new Date().getFullYear() + 1,
          sourceInstanceId: original.instanceId,
          targetInstanceId: secondBav.instanceId,
          amountEUR: 10_000,
        },
      ],
    }
    const ws2: Workspace = {
      ...base,
      baseline: {
        ...base.baseline,
        assumptions: {
          ...base.baseline.assumptions,
          bav: [originalAsPaidUp, secondBav],
        },
      },
    }
    const combined2 = { basis: makeStubCombined() }
    rerender({
      workspace: ws2,
      combinedByScenarioId: combined2,
      isCombineMode: true,
    })

    // Mutation alone — still no compute.
    expect(buildPrintSensitivityRowsSpy).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })

    // Builder was called once with the NEW workspace + the new combined,
    // not the original references — proves the ref read picks up the
    // multi-instance + transfer delta.
    expect(buildPrintSensitivityRowsSpy).toHaveBeenCalledTimes(1)
    const callArgs = buildPrintSensitivityRowsSpy.mock.calls[0]?.[0]
    expect(callArgs?.workspace).toBe(ws2)
    expect(callArgs?.workspace.baseline.assumptions.bav).toHaveLength(2)
    expect(
      callArgs?.workspace.baseline.assumptions.bav[0].transferEvents,
    ).toBeDefined()
    expect(callArgs?.baselineCombined).toBe(combined2.basis)
    expect(callArgs?.workspace).not.toBe(ws1)
    expect(callArgs?.baselineCombined).not.toBe(combined1.basis)

    // --- Paired compare-mode singleton short-circuit assertion ---
    // Flip the same hook to compare-mode and fire another beforeprint.
    // The handler must short-circuit and the builder must NOT be called
    // again.
    buildPrintSensitivityRowsSpy.mockClear()
    rerender({
      workspace: ws2,
      combinedByScenarioId: combined2,
      isCombineMode: false,
    })

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })

    expect(buildPrintSensitivityRowsSpy).not.toHaveBeenCalled()
  })

  // PR 11 R4 — Codex P1: useLayoutEffect ref-update contract.
  //
  // In a real browser, a user can mutate workspace inputs then synchronously
  // call `window.print()` in the same tick (e.g. a keyboard handler that
  // calls `window.print()` immediately after a state setter). Because
  // `window.print()` dispatches `beforeprint` synchronously before returning,
  // the listener reads `inputsRef.current` in the same tick. If the ref were
  // assigned in `useEffect` (which fires after paint), it would still hold the
  // previous render's inputs and the print DOM would be stale.
  //
  // `useLayoutEffect` runs synchronously after React's commit phase — before
  // the browser paints and before `window.print()` captures the print DOM —
  // so `inputsRef.current` always reflects the latest committed render.
  //
  // jsdom limitation: jsdom has no paint model, so both `useLayoutEffect` and
  // `useEffect` flush eagerly inside `act()`. This test validates the correct
  // ref-read behaviour (builder receives fresh inputs on `beforeprint` after a
  // workspace mutation) and serves as a regression guard for the useLayoutEffect
  // annotation. The comment above and the hook's inline comment are the
  // authoritative documentation of the real-browser guarantee.
  it('useLayoutEffect annotation: builder receives fresh inputs when beforeprint fires after a workspace mutation (PR 11 R4 regression guard)', () => {
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

    // Rerender with the new workspace (commits the useLayoutEffect ref-update).
    act(() => {
      rerender({ workspace: ws2, combinedByScenarioId: combined2 })
    })

    // The builder must NOT have been called yet (no workspace-mutation compute).
    expect(buildPrintSensitivityRowsSpy).not.toHaveBeenCalled()

    // Now fire beforeprint — the listener reads inputsRef.current which the
    // useLayoutEffect has already updated to ws2.
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })

    expect(buildPrintSensitivityRowsSpy).toHaveBeenCalledTimes(1)
    const callArgs = buildPrintSensitivityRowsSpy.mock.calls[0]?.[0]
    // Must receive the NEW workspace reference, not the previous ws1.
    expect(callArgs?.workspace).toBe(ws2)
    expect(callArgs?.baselineCombined).toBe(combined2.basis)
    expect(callArgs?.workspace).not.toBe(ws1)
  })
})
