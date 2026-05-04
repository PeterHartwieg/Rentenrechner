/**
 * Portfolio state hook (Group G issue 03 — milestone M1.4).
 * Extended in issue 07: auto-pinned baseline, lastEditedAt, rebaseWhatIf,
 * freezeWhatIf, archiveAndRestart.
 *
 * Workspace-level state container for combine-mode. Reads/writes the
 * `Workspace` shape (v2 schema) and exposes baseline + what-if mutators.
 *
 * Coexists with `useCalculatorState` (compare-mode singleton API). The mode
 * tag on the workspace tells the orchestration layer which hook to use.
 *
 * Plan §3 module map:
 *   - `src/app/portfolioState.ts`: this hook.
 *   - `useCalculatorState`: compare-mode keeps the singleton API.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Scenario, WhatIfScenario, Workspace } from '../domain/workspace'
import {
  defaultWorkspace,
  loadSavedWorkspace,
  saveWorkspace,
} from '../storage'
import {
  addInstanceToWorkspace,
  removeInstanceFromWorkspace,
} from '../features/inventory/inventoryHelpers'
import { scenarioDiff, applyDiff } from './scenarioDiff'
import type { SavedScenario } from '../data/scenarioLibrary'
import { addArchivedEntry } from '../data/scenarioLibrary'
import { singletonViewOfWorkspace } from '../engine/portfolioAdapter'
import { defaultAssumptions } from '../data/defaultScenario'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a uuid-style id for new scenarios. Uses crypto.randomUUID when
 * available (browsers + Node 19+), with a fallback for older environments.
 *
 * Exported so tests + spawn flows can produce deterministic-shape ids without
 * pulling in the React hook.
 */
export function newScenarioId(prefix: 'whatif' | 'baseline' = 'whatif'): string {
  // crypto.randomUUID is widely available in modern browsers and Node 19+;
  // fall back to a Math.random-based string for very old environments.
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined
  const uuid = cryptoObj?.randomUUID
    ? cryptoObj.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${uuid}`
}

export function deepCloneScenario<T>(v: T): T {
  // structuredClone is available in modern runtimes; fall back to JSON when not.
  if (typeof structuredClone === 'function') {
    return structuredClone(v)
  }
  return JSON.parse(JSON.stringify(v)) as T
}

function loadInitialWorkspace(): Workspace {
  return loadSavedWorkspace() ?? deepCloneScenario(defaultWorkspace)
}

// ---------------------------------------------------------------------------
// Pure state-transition helpers (consumed by the React hook AND by tests)
// ---------------------------------------------------------------------------

/**
 * Fork a new what-if from the given baseline scenario. Sets
 * `derivedFromBaselineId` and `derivedFromBaselineSnapshot` (a frozen
 * structuredClone of the baseline) so re-base can reconstruct the user's
 * deltas later.
 */
export function forkBaselineScenario(
  baseline: Scenario,
  label: string,
  origin: Scenario['origin'] = 'manual',
): WhatIfScenario {
  return {
    id: newScenarioId('whatif'),
    label,
    profile: deepCloneScenario(baseline.profile),
    partner: baseline.partner ? deepCloneScenario(baseline.partner) : undefined,
    assumptions: deepCloneScenario(baseline.assumptions),
    createdAt: new Date().toISOString(),
    origin,
    derivedFromBaselineId: baseline.id,
    derivedFromBaselineSnapshot: deepCloneScenario(baseline),
  }
}

/**
 * Re-base a what-if against a new baseline.
 *
 * Algorithm (Plan §2.1 / Decision A3):
 *  1. Compute the diff between the what-if's current state and its stale
 *     `derivedFromBaselineSnapshot` (those are the user's deltas).
 *  2. Clone the new baseline.
 *  3. Apply the deltas onto the clone.
 *  4. Stamp a new `derivedFromBaselineSnapshot` pointing at the new baseline.
 *
 * The result carries the user's intentional changes on top of the fresh
 * baseline. Fields not touched by the user revert to the new baseline's values.
 */
export function rebaseWhatIf(
  whatIf: WhatIfScenario,
  newBaseline: Scenario,
): WhatIfScenario {
  // Step 1: compute the user's deltas
  const deltas = scenarioDiff(whatIf.derivedFromBaselineSnapshot, whatIf)

  // Step 2-3: fork from new baseline, apply deltas
  const rebased = applyDiff(deepCloneScenario(newBaseline), deltas)

  return {
    ...rebased,
    id: whatIf.id,
    label: whatIf.label,
    createdAt: whatIf.createdAt,
    origin: whatIf.origin,
    derivedFromBaselineId: newBaseline.id,
    derivedFromBaselineSnapshot: deepCloneScenario(newBaseline),
    // Clear any frozen marker — the what-if is now in sync with the new baseline.
    frozenAt: undefined,
  } as WhatIfScenario
}

/**
 * @deprecated Use `rebaseWhatIf` instead. This stub only refreshes the
 * snapshot and is kept for backward compatibility with issue 03 tests.
 */
export function rebaseWhatIfStub(
  whatIf: WhatIfScenario,
  newBaseline: Scenario,
): WhatIfScenario {
  return {
    ...whatIf,
    derivedFromBaselineSnapshot: deepCloneScenario(newBaseline),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Product types that support multiple instances (GRV stays singleton). */
export type MultiInstanceProductId =
  | 'bav'
  | 'versicherung'
  | 'riester'
  | 'basisrente'
  | 'altersvorsorgedepot'
  | 'etf'

export interface UsePortfolioStateApi {
  workspace: Workspace
  baseline: Scenario
  whatIfs: WhatIfScenario[]
  mode: Workspace['mode']
  setMode: (mode: Workspace['mode']) => void
  /**
   * Atomically replace the entire workspace (e.g. after InventoryWizard
   * completes and hands back a freshly-built Workspace). Call this BEFORE
   * any subsequent `setMode` so the first re-render that reads `portfolioState`
   * sees the new data, not stale defaults.
   */
  replaceWorkspace: (workspace: Workspace) => void
  setBaseline: (scenario: Scenario) => void
  /** Update the baseline in-place (preserves id/createdAt). Stamps lastEditedAt. */
  patchBaseline: (patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => void
  addWhatIf: (whatIf: WhatIfScenario) => void
  updateWhatIf: (id: string, patch: Partial<Omit<WhatIfScenario, 'id'>>) => void
  removeWhatIf: (id: string) => void
  /**
   * Fork a new what-if from the current baseline. Sets
   * `derivedFromBaselineId` and `derivedFromBaselineSnapshot` (a frozen
   * structuredClone of the current baseline) so re-base can reconstruct
   * the user's deltas.
   */
  forkBaseline: (label: string, origin?: Scenario['origin']) => WhatIfScenario
  /**
   * Re-base a what-if against the current baseline. Computes a structural
   * diff between the what-if's current state and its stale snapshot, then
   * re-applies those deltas onto the current baseline. Updates
   * `derivedFromBaselineId` + `derivedFromBaselineSnapshot`.
   */
  rebaseWhatIf: (id: string) => void
  /**
   * Freeze a what-if to its current materialised state. Stamps `frozenAt` so
   * the "Baseline hat sich geändert" badge suppresses itself until the next
   * baseline mutation that post-dates the freeze.
   */
  freezeWhatIf: (id: string) => void
  /**
   * Archive the current baseline as a saved library entry named
   * "Baseline {currentYear}", clear all what-ifs, and stamp the workspace
   * so it continues editing the same (now archived) baseline.
   *
   * Returns the created `SavedScenario` so callers can display its name.
   */
  archiveAndRestart: () => SavedScenario
  /**
   * Add a new default instance of the given product type to the baseline.
   * GRV stays singleton and is not in scope.
   */
  addInstance: (productId: MultiInstanceProductId) => void
  /**
   * Remove an instance from the baseline by productId + instanceId. Pinned
   * comparison ids referencing the removed instance are cleaned up.
   */
  removeInstance: (productId: MultiInstanceProductId, instanceId: string) => void
}

export function usePortfolioState(): UsePortfolioStateApi {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadInitialWorkspace())

  useEffect(() => {
    saveWorkspace(workspace)
  }, [workspace])

  const replaceWorkspace = useCallback((next: Workspace) => {
    setWorkspace(next)
  }, [])

  const setMode = useCallback((mode: Workspace['mode']) => {
    setWorkspace((w) => ({ ...w, mode }))
  }, [])

  const setBaseline = useCallback((scenario: Scenario) => {
    setWorkspace((w) => ({ ...w, baseline: scenario }))
  }, [])

  const patchBaseline = useCallback(
    (patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => {
      setWorkspace((w) => ({
        ...w,
        baseline: { ...w.baseline, ...patch, lastEditedAt: Date.now() },
      }))
    },
    [],
  )

  const addWhatIf = useCallback((whatIf: WhatIfScenario) => {
    setWorkspace((w) => ({ ...w, whatIfs: [...w.whatIfs, whatIf] }))
  }, [])

  const updateWhatIf = useCallback(
    (id: string, patch: Partial<Omit<WhatIfScenario, 'id'>>) => {
      setWorkspace((w) => ({
        ...w,
        whatIfs: w.whatIfs.map((wi) => (wi.id === id ? { ...wi, ...patch } : wi)),
      }))
    },
    [],
  )

  const removeWhatIf = useCallback((id: string) => {
    setWorkspace((w) => ({
      ...w,
      whatIfs: w.whatIfs.filter((wi) => wi.id !== id),
      pinnedComparisonIds: w.pinnedComparisonIds.filter((p) => p !== id),
    }))
  }, [])

  const forkBaseline = useCallback(
    (label: string, origin: Scenario['origin'] = 'manual'): WhatIfScenario => {
      const whatIf = forkBaselineScenario(workspace.baseline, label, origin)
      setWorkspace((w) => ({ ...w, whatIfs: [...w.whatIfs, whatIf] }))
      return whatIf
    },
    [workspace.baseline],
  )

  const rebaseWhatIfCallback = useCallback((id: string) => {
    setWorkspace((w) => ({
      ...w,
      whatIfs: w.whatIfs.map((wi) =>
        wi.id === id ? rebaseWhatIf(wi, w.baseline) : wi,
      ),
    }))
  }, [])

  const freezeWhatIf = useCallback((id: string) => {
    setWorkspace((w) => ({
      ...w,
      whatIfs: w.whatIfs.map((wi) =>
        wi.id === id ? { ...wi, frozenAt: Date.now() } : wi,
      ),
    }))
  }, [])

  const archiveAndRestart = useCallback((): SavedScenario => {
    const currentYear = new Date().getFullYear()
    const archiveName = `Baseline ${currentYear}`
    // We read the current workspace synchronously from the React state ref
    // pattern is not available here, so we capture via a closure over the
    // workspace variable (which is the current render's snapshot).
    const currentWorkspace = workspace
    const projectedAssumptions = singletonViewOfWorkspace(currentWorkspace, {
      bav: defaultAssumptions.bav,
      etf: defaultAssumptions.etf,
      insurance: defaultAssumptions.insurance,
      basisrente: defaultAssumptions.basisrente,
      altersvorsorgedepot: defaultAssumptions.altersvorsorgedepot,
      riester: defaultAssumptions.riester,
    })
    const archived = addArchivedEntry(
      archiveName,
      currentWorkspace.baseline.profile,
      projectedAssumptions,
    )
    setWorkspace((w) => ({
      ...w,
      whatIfs: [],
    }))
    return archived
  }, [workspace])

  const addInstance = useCallback((productId: MultiInstanceProductId) => {
    setWorkspace((w) => addInstanceToWorkspace(w, productId))
  }, [])

  const removeInstance = useCallback((productId: MultiInstanceProductId, instanceId: string) => {
    setWorkspace((w) => removeInstanceFromWorkspace(w, productId, instanceId))
  }, [])

  return {
    workspace,
    baseline: workspace.baseline,
    whatIfs: workspace.whatIfs,
    mode: workspace.mode,
    replaceWorkspace,
    setMode,
    setBaseline,
    patchBaseline,
    addWhatIf,
    updateWhatIf,
    removeWhatIf,
    forkBaseline,
    rebaseWhatIf: rebaseWhatIfCallback,
    freezeWhatIf,
    archiveAndRestart,
    addInstance,
    removeInstance,
  }
}
