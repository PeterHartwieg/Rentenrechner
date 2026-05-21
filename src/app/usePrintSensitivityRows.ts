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
 * - **Compare-mode:** handler short-circuits to `undefined`.
 * - **Unmount:** listener is removed in the effect cleanup.
 *
 * The hook intentionally does not subscribe to `afterprint` — we keep the
 * last computed rows around so a subsequent print (e.g. user hits Ctrl+P
 * a second time without editing) renders instantly. Stale rows are refreshed
 * on the next `beforeprint` because the listener reads via ref every time.
 */

import { useEffect, useRef, useState } from 'react'
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
  // mutation, which is the whole point of this hook). The ref is written
  // in a layout-effect to satisfy the `react-hooks/refs` lint rule which
  // forbids ref mutations during render.
  const inputsRef = useRef(inputs)
  useEffect(() => {
    inputsRef.current = inputs
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleBeforePrint = () => {
      const next = computePrintSensitivityRows(inputsRef.current)
      setRows(next)
    }
    window.addEventListener('beforeprint', handleBeforePrint)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
    }
  }, [])

  return rows
}
