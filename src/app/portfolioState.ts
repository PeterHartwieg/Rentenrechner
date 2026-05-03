/**
 * Portfolio state hook (Group G issue 03 — milestone M1.4).
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
 *
 * Out-of-scope for this issue:
 *   - `rebaseWhatIf` full diff/re-apply (issue P2). A stub is exported so the
 *     surface is committed; a `it.skip` test pins the deferred work.
 *   - `simulationViewModel` integration with `simulatePortfolio` (issue 06).
 */

import { useCallback, useEffect, useState } from 'react'
import type { Scenario, WhatIfScenario, Workspace } from '../domain/workspace'
import {
  defaultWorkspace,
  loadSavedWorkspace,
  saveWorkspace,
} from '../storage'

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
 * Re-base a what-if against a new baseline. STUB — see
 * UsePortfolioStateApi.rebaseWhatIf JSDoc and the it.skip test in
 * portfolioState.test.ts.
 *
 * Today this only refreshes `derivedFromBaselineSnapshot` to the supplied new
 * baseline. Issue P2 will replace this with a structural diff + re-apply.
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

export interface UsePortfolioStateApi {
  workspace: Workspace
  baseline: Scenario
  whatIfs: WhatIfScenario[]
  mode: Workspace['mode']
  setMode: (mode: Workspace['mode']) => void
  setBaseline: (scenario: Scenario) => void
  /** Update the baseline in-place (preserves id/createdAt). */
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
   * Re-base a what-if against the current baseline. STUB — full diff/re-apply
   * logic is issue P2. Today this discards the snapshot and replaces it with
   * the current baseline; user deltas are preserved as-is on the what-if's
   * own assumptions copy.
   *
   * TODO(issue P2): compute a structural diff between the what-if's current
   * assumptions and its snapshot, then re-apply that diff on top of a fresh
   * baseline clone.
   */
  rebaseWhatIf: (id: string) => void
}

export function usePortfolioState(): UsePortfolioStateApi {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadInitialWorkspace())

  useEffect(() => {
    saveWorkspace(workspace)
  }, [workspace])

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
        baseline: { ...w.baseline, ...patch },
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

  const rebaseWhatIf = useCallback((id: string) => {
    // STUB — see UsePortfolioStateApi.rebaseWhatIf JSDoc.
    setWorkspace((w) => ({
      ...w,
      whatIfs: w.whatIfs.map((wi) =>
        wi.id === id ? rebaseWhatIfStub(wi, w.baseline) : wi,
      ),
    }))
  }, [])

  return {
    workspace,
    baseline: workspace.baseline,
    whatIfs: workspace.whatIfs,
    mode: workspace.mode,
    setMode,
    setBaseline,
    patchBaseline,
    addWhatIf,
    updateWhatIf,
    removeWhatIf,
    forkBaseline,
    rebaseWhatIf,
  }
}
