/**
 * Lazy compute hook for the combine-mode print sensitivity rows
 * (PR 11 R2 — Codex P1 perf fix).
 *
 * Background
 * ----------
 * `buildPrintSensitivityRows` runs the sensitivity selectors, each of which
 * fires a full `runCombineSimulation` pass — up to 4 extra portfolio
 * simulations per invocation. PrintReport is always mounted (it sits hidden
 * in the DOM and materialises only via `@media print`), so any eager memo
 * keyed on workspace mutations forces users to pay this cost during normal
 * editing even when they never print.
 *
 * Contract
 * --------
 * - **Initial render:** returns `undefined`. PrintReport's sensitivity sub-
 *   table is already guarded by `sensitivityRows && length > 0` so the
 *   section renders empty.
 * - **Workspace mutation alone:** does NOT compute. The latest values are
 *   tracked via a ref so the listener always reads fresh data without
 *   forcing a recompute / rerender chain.
 * - **`window.beforeprint` event:** computes fresh rows from the latest
 *   workspace + combined results and caches them in state. Fires reliably
 *   on `Ctrl+P`, the browser print menu, and `window.print()` in
 *   Chromium / Firefox / Safari — that contract is part of the platform.
 * - **Compare-mode:** the row computation short-circuits to `undefined` inside
 *   the handler AND the returned value is gated on `isCombineMode` so any
 *   rows cached from a previous combine-mode print do not leak through when
 *   the user flips modes without unmounting.
 * - **Print-DOM commit:** the `setRows` update fires inside `flushSync` so it
 *   commits synchronously before `window.print()` captures the print DOM.
 * - **Unmount:** listener is removed in the effect cleanup.
 *
 * The hook intentionally does not subscribe to `afterprint` — we keep the
 * last computed rows around so a subsequent print (e.g. user hits Ctrl+P
 * a second time without editing) renders instantly. Stale rows are refreshed
 * on the next `beforeprint` because the listener reads via ref every time.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { GermanRules } from '../domain'
import type { Workspace } from '../domain/workspace'
import type { CombinedResult } from '../engine/portfolioCombine'
import {
  buildPrintSensitivityRows,
  type PrintSensitivityRow,
} from '../features/results/printReportRows'

export interface PrintSensitivityInputs {
  readonly isCombineMode: boolean
  readonly workspace: Workspace
  readonly combinedByScenarioId: Record<string, CombinedResult>
  readonly rules: GermanRules
}

/**
 * Compute the rows from the current inputs. Pure helper — exposed so tests
 * can assert the same logic the listener runs without forcing the listener
 * itself through React's effect machinery.
 */
export function computePrintSensitivityRows(
  inputs: PrintSensitivityInputs,
): PrintSensitivityRow[] | undefined {
  const { isCombineMode, workspace, combinedByScenarioId, rules } = inputs
  if (!isCombineMode) return undefined
  const scenarios = workspace.baseline.assumptions.returnScenarios
  const basisScenarioId =
    scenarios.find((s) => s.id === 'basis')?.id ?? scenarios[0]?.id ?? 'basis'
  const basisCombined = combinedByScenarioId[basisScenarioId]
  if (!basisCombined) return undefined
  return buildPrintSensitivityRows({
    workspace,
    baselineCombined: basisCombined,
    rules,
    scenarioId: basisScenarioId,
  })
}

export function usePrintSensitivityRows(
  inputs: PrintSensitivityInputs,
): PrintSensitivityRow[] | undefined {
  const [rows, setRows] = useState<PrintSensitivityRow[] | undefined>(undefined)
  // Track latest inputs via a ref so the listener never goes stale without
  // forcing a re-attach (and without forcing a recompute on every workspace
  // mutation, which is the whole point of this hook). The ref is written in
  // `useLayoutEffect` (not `useEffect`) so it is always current before paint:
  // a user who mutates workspace inputs and synchronously calls `window.print()`
  // in the same tick would otherwise hit the `beforeprint` handler with a
  // stale ref (Codex P1, PR 11 R4). `useLayoutEffect` runs synchronously
  // after commit but before paint — the React-documented pattern for "ref
  // must always reflect the latest committed render".
  const inputsRef = useRef(inputs)
  useLayoutEffect(() => {
    inputsRef.current = inputs
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleBeforePrint = () => {
      const next = computePrintSensitivityRows(inputsRef.current)
      // `window.print()` (and the browser's Ctrl+P / print-menu paths) snapshot
      // the print DOM *synchronously* after `beforeprint` returns. A plain
      // `setRows(next)` queues an async commit, so the first print after a
      // workspace change would capture the stale DOM (Codex P1, PR 11 R3).
      // `flushSync` forces React to commit the update before the browser
      // captures, ensuring the freshly-computed rows are in the print snapshot
      // on the very first attempt.
      flushSync(() => setRows(next))
    }
    window.addEventListener('beforeprint', handleBeforePrint)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
    }
  }, [])

  // Gate on `isCombineMode` so cached combine-mode rows do not leak into a
  // compare-mode render when the user flips modes without unmounting the
  // hook (CodeRabbit Minor, PR 11 R3). Cache itself is preserved across the
  // toggle so flipping back to combine-mode reuses the last computed rows
  // without forcing a recompute on the toggle event.
  return inputs.isCombineMode ? rows : undefined
}
