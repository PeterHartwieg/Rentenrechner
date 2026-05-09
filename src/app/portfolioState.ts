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
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../domain/instances'
import {
  defaultWorkspace,
  loadSavedWorkspace,
  saveWorkspace,
} from '../storage'
import { hasShareStateInUrl } from '../utils/urlShareDetect'
import {
  addInstanceToWorkspace,
  removeInstanceFromWorkspace,
  newScenarioId,
  deepCloneScenario,
} from './workspaceIdentity'
import { scenarioDiff, applyDiff } from './scenarioDiff'
import type { SavedScenario } from '../data/scenarioLibrary'
import { addArchivedEntry } from '../data/scenarioLibrary'
import { singletonViewOfWorkspace } from '../engine/portfolioAdapter'
import { defaultAssumptions } from '../data/defaultScenario'

/** Union of all per-product instance types for `addPopulatedInstance`. */
export type AnyInstance =
  | BavInstance
  | EtfInstance
  | InsuranceInstance
  | BasisrenteInstance
  | AltersvorsorgedepotInstance
  | RiesterInstance

/**
 * When the user did not enter a provider name, the draft converter produces a
 * generic label (e.g. "ETF-Depot", "bAV", "Riester-Rente") that would repeat
 * for every blank-provider add. Append a "#N" suffix where N is the count
 * after the new instance lands, matching addInstanceToWorkspace's behaviour.
 */
export function applyDisambiguatingLabel<T extends AnyInstance>(instance: T, count: number): T {
  if (instance.anbieter && instance.anbieter.trim() !== '') return instance
  return { ...instance, label: `${instance.label} #${count}` }
}

// Re-export so existing callers (tests, recommender, ContractDecisionMenu, etc.)
// continue to work without changes.
export { newScenarioId, deepCloneScenario }

/**
 * Load the initial workspace for this session.
 *
 * When a valid `?s=` compare share URL is present the active view must show
 * the shared compare state, not the user's saved combine-mode workspace.
 * We override `mode` to `'compare'` in that case so `isCombineMode` is false
 * and `useCalculatorState` (which reads `readUrlState()`) wins for this view.
 * The underlying combine workspace remains untouched in localStorage — the
 * override is session-scoped (in-memory only).
 */
export function loadInitialWorkspace(): Workspace {
  const saved = loadSavedWorkspace() ?? deepCloneScenario(defaultWorkspace)
  if (hasShareStateInUrl() && saved.mode === 'combine') {
    return { ...saved, mode: 'compare' }
  }
  return saved
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
   * Add a fully-populated instance (built from draft inputs) to the baseline.
   * Unlike `addInstance`, this preserves user-entered draft values instead of
   * inserting engine defaults.
   */
  addPopulatedInstance: (productId: MultiInstanceProductId, instance: AnyInstance) => void
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

  const addPopulatedInstance = useCallback(
    (productId: MultiInstanceProductId, instance: AnyInstance) => {
      setWorkspace((w) => {
        const wa = w.baseline.assumptions
        let updated: typeof wa
        switch (productId) {
          case 'bav':
            updated = {
              ...wa,
              bav: [...wa.bav, applyDisambiguatingLabel(instance as BavInstance, wa.bav.length + 1)],
            }
            break
          case 'versicherung':
            updated = {
              ...wa,
              insurance: [
                ...wa.insurance,
                applyDisambiguatingLabel(instance as InsuranceInstance, wa.insurance.length + 1),
              ],
            }
            break
          case 'etf':
            updated = {
              ...wa,
              etf: [...wa.etf, applyDisambiguatingLabel(instance as EtfInstance, wa.etf.length + 1)],
            }
            break
          case 'basisrente':
            updated = {
              ...wa,
              basisrente: [
                ...wa.basisrente,
                applyDisambiguatingLabel(instance as BasisrenteInstance, wa.basisrente.length + 1),
              ],
            }
            break
          case 'altersvorsorgedepot':
            updated = {
              ...wa,
              altersvorsorgedepot: [
                ...wa.altersvorsorgedepot,
                applyDisambiguatingLabel(
                  instance as AltersvorsorgedepotInstance,
                  wa.altersvorsorgedepot.length + 1,
                ),
              ],
            }
            break
          case 'riester':
            updated = {
              ...wa,
              riester: [
                ...wa.riester,
                applyDisambiguatingLabel(instance as RiesterInstance, wa.riester.length + 1),
              ],
            }
            break
          default:
            return w
        }
        return {
          ...w,
          baseline: { ...w.baseline, assumptions: updated, lastEditedAt: Date.now() },
        }
      })
    },
    [],
  )

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
    addPopulatedInstance,
    removeInstance,
  }
}
