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

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type {
  Scenario,
  WhatIfScenario,
  Workspace,
  WorkspaceAssumptionsV2,
} from '../domain/workspace'
import type { InputStatusMap } from '../domain/inputStatus'
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
  newInstanceId,
  newScenarioId,
  deepCloneScenario,
} from './workspaceIdentity'
import { INVENTORY_PRODUCT_REGISTRY } from '../features/inventory/inventoryProductRegistry'
import { scenarioDiff, applyDiff } from './scenarioDiff'
import type { SavedScenario } from '../data/scenarioLibrary'
import { addArchivedEntry } from '../data/scenarioLibrary'
import { singletonViewOfWorkspace } from '../engine/portfolioAdapter'
import { defaultAssumptions } from '../data/defaultScenario'
import { PRODUCT_REGISTRY } from '../engine/productRegistry'

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

/**
 * Has the user actually started a personal plan?
 *
 * A freshly-defaulted workspace (and the one synthesised from a legacy
 * compare-only v1 save) carries no contracts and no baseline edit stamp. The
 * `/` dispatch uses this to decide between the plan's "not started" state and
 * the populated plan, and `/vergleich` uses it to decide whether offering
 * "Angaben aus meinem Plan verwenden" makes sense.
 *
 * Pure and React-free so route dispatch and tests can call it directly.
 */
export function hasStartedPlan(workspace: Workspace): boolean {
  const wsa = workspace.baseline.assumptions
  for (const entry of PRODUCT_REGISTRY) {
    const raw = (wsa as unknown as Record<string, unknown>)[entry.assumptionsKey]
    if (Array.isArray(raw) && raw.length > 0) return true
  }
  return workspace.baseline.lastEditedAt !== undefined
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

// ---------------------------------------------------------------------------
// Undo, staleness and shape drift (pure; state contract §5)
// ---------------------------------------------------------------------------

/**
 * One level of undo for a workspace mutation.
 *
 * Deliberately a whole-workspace snapshot rather than an inverse operation:
 * removing a contract touches instance arrays, transfer events on *other*
 * contracts, pins, visibility and what-if staleness at once, and only a full
 * snapshot restores all of that together. In-memory and session-scoped — never
 * persisted (lead decision "Target and undo").
 */
export interface WorkspaceUndo {
  id: string
  /** German, supplied by the caller ("Vertrag entfernt"). */
  label: string
  createdAt: number
  /** The workspace as it was immediately before the mutation. */
  previous: Workspace
}

let undoCounter = 0

function newUndoId(): string {
  undoCounter += 1
  return `undo-${Date.now().toString(36)}-${undoCounter}`
}

/** Why `applyWhatIf` refused. */
export type WhatIfApplyFailure = 'stale' | 'shape-drift' | 'not-found'

export type ApplyWhatIfResult =
  | { ok: true; undo: WorkspaceUndo }
  | { ok: false; reason: WhatIfApplyFailure }

export type RebaseWhatIfResult =
  | { ok: true; undo: WorkspaceUndo }
  | { ok: false; reason: 'not-found' | 'shape-drift' }

/**
 * The point in time a what-if's frozen baseline snapshot represents.
 *
 * `forkBaselineScenario` clones the baseline wholesale, so the snapshot carries
 * the *baseline's* `createdAt` — which never moves. Re-basing replaces the
 * snapshot with a clone of the current baseline, and that clone carries the
 * baseline's `lastEditedAt`. Taking the later of the two is what makes "and has
 * not been rebased" work: without it a rebase could never clear staleness.
 */
export function whatIfSnapshotTime(whatIf: WhatIfScenario): number {
  const snapshot = whatIf.derivedFromBaselineSnapshot
  const createdAt = Date.parse(snapshot.createdAt)
  return Math.max(Number.isFinite(createdAt) ? createdAt : 0, snapshot.lastEditedAt ?? 0)
}

/**
 * `true` when the baseline moved after the what-if's snapshot was taken.
 *
 * Same convention as the existing `BaselineStaleBadge`: only a real timestamp
 * counts as an edit. Freezing does **not** clear staleness — keeping a snapshot
 * is a viewing decision, not an apply permission (journey map §2).
 */
export function whatIfIsStale(whatIf: WhatIfScenario, baseline: Scenario): boolean {
  const editedAt = baseline.lastEditedAt ?? 0
  if (editedAt <= 0) return false
  return editedAt > whatIfSnapshotTime(whatIf)
}

/**
 * `true` when both scenarios hold the same contracts, in the same order, in
 * every product array.
 *
 * `scenarioDiff` matches array entries **by index**, so a delta computed against
 * a snapshot with a different instance sequence would be written onto the wrong
 * contract. Apply and rebase both refuse rather than silently corrupting a
 * neighbouring contract.
 */
export function productArrayShapeMatches(a: Scenario, b: Scenario): boolean {
  for (const entry of PRODUCT_REGISTRY) {
    const key = entry.assumptionsKey as string
    const left = (a.assumptions as unknown as Record<string, unknown>)[key]
    const right = (b.assumptions as unknown as Record<string, unknown>)[key]
    if (!Array.isArray(left) || !Array.isArray(right)) continue
    if (left.length !== right.length) return false
    for (let i = 0; i < left.length; i++) {
      const leftId = (left[i] as { instanceId?: string } | undefined)?.instanceId
      const rightId = (right[i] as { instanceId?: string } | undefined)?.instanceId
      if (leftId !== rightId) return false
    }
  }
  return true
}

/**
 * Apply a what-if's user deltas onto the given baseline.
 *
 * The diff is taken against the what-if's own snapshot, never against the live
 * baseline, so only the fields the user actually changed are written. Baseline
 * identity (`id`, `label`, `createdAt`, `origin`) is preserved.
 */
export function applyWhatIfToBaseline(whatIf: WhatIfScenario, baseline: Scenario): Scenario {
  const deltas = scenarioDiff(whatIf.derivedFromBaselineSnapshot, whatIf)
  const applied = applyDiff(deepCloneScenario(baseline), deltas)
  return {
    ...applied,
    id: baseline.id,
    label: baseline.label,
    createdAt: baseline.createdAt,
    origin: baseline.origin,
    lastEditedAt: Date.now(),
  }
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
  /**
   * True when the last workspace persist attempt failed (quota exceeded,
   * storage disabled by the browser). `saveWorkspace` returns a boolean since
   * Phase 1; before that the failure was swallowed and the user silently lost
   * their edits on reload. The shell surfaces this as a visible warning.
   */
  storageError: boolean
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
  /** Remove a saved alternative. Returns the undo handle (§5). */
  removeWhatIf: (id: string) => WorkspaceUndo
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
   * Same as `rebaseWhatIf`, but reports what happened. Refuses with
   * `'shape-drift'` when the contract sequence moved since the snapshot was
   * taken — an index-matched diff would then be re-applied onto the wrong
   * contract. The plain `rebaseWhatIf` is a no-op in that case.
   */
  tryRebaseWhatIf: (id: string) => RebaseWhatIfResult
  /**
   * Apply a saved alternative's deltas onto the current baseline.
   *
   * Only the fields the user changed inside the what-if are written. Refuses
   * when the alternative is out of date (`'stale'` — rebase and review first)
   * or when the contract sequence drifted (`'shape-drift'`). A frozen snapshot
   * is not an apply permission.
   */
  applyWhatIf: (id: string) => ApplyWhatIfResult
  /** Restore the workspace captured in an undo handle. */
  undo: (handle: WorkspaceUndo) => void
  /**
   * The most recent undoable mutation, or `null`. One level, in memory, and
   * superseded by the next mutation — the status bar shows it until consumed.
   */
  lastUndo: WorkspaceUndo | null
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
  addPopulatedInstance: (
    productId: MultiInstanceProductId,
    instance: AnyInstance,
    status?: InputStatusMap,
  ) => { instanceId: string; undo: WorkspaceUndo }
  /**
   * Patch an existing instance in place. `patch` is shallow-merged, so nested
   * objects (`fees`, `eligibility`) must arrive complete — which is what
   * `draftToInstancePatch` produces. `status` is merged into the instance's
   * `inputStatus`; keys it does not mention survive untouched.
   */
  updateInstance: (
    productId: MultiInstanceProductId,
    instanceId: string,
    patch: Partial<AnyInstance>,
    status?: InputStatusMap,
  ) => void
  /**
   * Remove an instance from the baseline by productId + instanceId, cleaning up
   * every reference to it in the same transaction (see
   * `removeInstanceFromWorkspace`). Returns the undo handle.
   */
  removeInstance: (productId: MultiInstanceProductId, instanceId: string) => WorkspaceUndo
}

// ---------------------------------------------------------------------------
// One-level undo store (lead decision: "one level, in memory, shown until
// consumed or superseded by the next mutation. Not persisted.")
//
// The handle deliberately lives *outside* React state. Two hosts mount their
// own `usePortfolioState` (the plan, and `/vertrag/:id/bearbeiten`), and a
// contract removed in the editor redirects back to the plan — so a per-mount
// `useState` would drop the handle exactly when the user needs it. The store is
// module-level and never persisted, so a reload still discards it.
// ---------------------------------------------------------------------------

let lastUndoHandle: WorkspaceUndo | null = null
const lastUndoListeners = new Set<() => void>()

function subscribeLastUndo(listener: () => void): () => void {
  lastUndoListeners.add(listener)
  return () => { lastUndoListeners.delete(listener) }
}

function publishLastUndo(next: WorkspaceUndo | null): void {
  if (lastUndoHandle === next) return
  lastUndoHandle = next
  for (const listener of lastUndoListeners) listener()
}

/** Test seam: drops the pending handle so module state cannot leak between tests. */
export function clearWorkspaceUndo(): void {
  publishLastUndo(null)
}

export function usePortfolioState(): UsePortfolioStateApi {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadInitialWorkspace())

  // Skip the first-effect-run no-op write. On the mount tick `workspace`
  // equals the value we just lazy-initialised from storage, so writing it
  // back is purely a no-op — but the v2 load pipeline (`parseWorkspaceJson`
  // → `mergeDeep` against `defaultWorkspace`) only iterates keys present on
  // the *default* shape, so any saved field that is not enumerated in the
  // default (today: `baseline.lastEditedAt`, used by `BaselineStaleBadge` to
  // decide whether what-ifs are stale) gets dropped on the round trip and
  // re-persisted as `undefined`. That falsely invalidates every what-if as
  // soon as a `/eingaben` mount + the dashboard share the same workspace
  // (`AngabenProduktSection` + `Calculator`). Mirrors the same first-mount
  // skip in `useAngabenState`; pinned by `AngabenPage.test.tsx`
  // "does NOT bump baseline.lastEditedAt on mount".
  const isFirstEffectRun = useRef(true)
  const [storageError, setStorageError] = useState(false)
  const lastUndo = useSyncExternalStore(
    subscribeLastUndo,
    () => lastUndoHandle,
    () => null,
  )

  // Mutations that must return an undo handle synchronously need the workspace
  // they are about to replace, which a functional `setState` updater cannot
  // hand back. The ref tracks the latest committed workspace so those mutations
  // read a value and write a value in one atomic `setWorkspace` call. It is
  // synced in an effect (never during render) and written directly by `commit`,
  // so a second mutation in the same tick still sees the first one's result.
  const workspaceRef = useRef(workspace)
  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])

  /**
   * Commit a fully-formed workspace in exactly one `setWorkspace`, recording an
   * undo handle for the state it replaced. Every §5 mutation goes through here,
   * which is what makes the atomicity and one-level-undo rules structural
   * rather than a convention.
   */
  const commit = useCallback((label: string, next: Workspace): WorkspaceUndo => {
    const previous = workspaceRef.current
    workspaceRef.current = next
    const undo: WorkspaceUndo = { id: newUndoId(), label, createdAt: Date.now(), previous }
    setWorkspace(next)
    publishLastUndo(undo)
    return undo
  }, [])

  useEffect(() => {
    if (isFirstEffectRun.current) {
      isFirstEffectRun.current = false
      return
    }
    setStorageError(!saveWorkspace(workspace))
  }, [workspace])

  const replaceWorkspace = useCallback((next: Workspace) => {
    // Not a `commit`: no undo handle is recorded, so the pending one must go —
    // it snapshots a workspace that predates this write and undoing it would
    // silently discard the newer edit.
    publishLastUndo(null)
    setWorkspace(next)
  }, [])

  const setMode = useCallback((mode: Workspace['mode']) => {
    publishLastUndo(null)
    setWorkspace((w) => ({ ...w, mode }))
  }, [])

  const setBaseline = useCallback((scenario: Scenario) => {
    publishLastUndo(null)
    setWorkspace((w) => ({ ...w, baseline: scenario }))
  }, [])

  const patchBaseline = useCallback(
    (patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => {
      publishLastUndo(null)
      setWorkspace((w) => ({
        ...w,
        baseline: { ...w.baseline, ...patch, lastEditedAt: Date.now() },
      }))
    },
    [],
  )

  const addWhatIf = useCallback((whatIf: WhatIfScenario) => {
    publishLastUndo(null)
    setWorkspace((w) => ({ ...w, whatIfs: [...w.whatIfs, whatIf] }))
  }, [])

  const updateWhatIf = useCallback(
    (id: string, patch: Partial<Omit<WhatIfScenario, 'id'>>) => {
      publishLastUndo(null)
      setWorkspace((w) => ({
        ...w,
        whatIfs: w.whatIfs.map((wi) => (wi.id === id ? { ...wi, ...patch } : wi)),
      }))
    },
    [],
  )

  const removeWhatIf = useCallback(
    (id: string): WorkspaceUndo => {
      const w = workspaceRef.current
      return commit('Alternative entfernt', {
        ...w,
        whatIfs: w.whatIfs.filter((wi) => wi.id !== id),
        pinnedComparisonIds: w.pinnedComparisonIds.filter((p) => p !== id),
      })
    },
    [commit],
  )

  const forkBaseline = useCallback(
    (label: string, origin: Scenario['origin'] = 'manual'): WhatIfScenario => {
      const whatIf = forkBaselineScenario(workspace.baseline, label, origin)
      setWorkspace((w) => ({ ...w, whatIfs: [...w.whatIfs, whatIf] }))
      return whatIf
    },
    [workspace.baseline],
  )

  const tryRebaseWhatIfCallback = useCallback(
    (id: string): RebaseWhatIfResult => {
      const w = workspaceRef.current
      const whatIf = w.whatIfs.find((wi) => wi.id === id)
      if (!whatIf) return { ok: false, reason: 'not-found' }
      if (!productArrayShapeMatches(whatIf.derivedFromBaselineSnapshot, w.baseline)) {
        return { ok: false, reason: 'shape-drift' }
      }
      const undo = commit('Alternative neu berechnet', {
        ...w,
        whatIfs: w.whatIfs.map((wi) => (wi.id === id ? rebaseWhatIf(wi, w.baseline) : wi)),
      })
      return { ok: true, undo }
    },
    [commit],
  )

  const rebaseWhatIfCallback = useCallback(
    (id: string) => {
      tryRebaseWhatIfCallback(id)
    },
    [tryRebaseWhatIfCallback],
  )

  const applyWhatIfCallback = useCallback(
    (id: string): ApplyWhatIfResult => {
      const w = workspaceRef.current
      const whatIf = w.whatIfs.find((wi) => wi.id === id)
      if (!whatIf) return { ok: false, reason: 'not-found' }
      // Drift is reported ahead of staleness: it is the more specific failure
      // and the one a rebase cannot fix, so the user needs to hear it first.
      if (!productArrayShapeMatches(whatIf.derivedFromBaselineSnapshot, w.baseline)) {
        return { ok: false, reason: 'shape-drift' }
      }
      if (whatIfIsStale(whatIf, w.baseline)) return { ok: false, reason: 'stale' }
      const undo = commit('Alternative übernommen', {
        ...w,
        baseline: applyWhatIfToBaseline(whatIf, w.baseline),
      })
      return { ok: true, undo }
    },
    [commit],
  )

  const undo = useCallback((handle: WorkspaceUndo) => {
    workspaceRef.current = handle.previous
    setWorkspace(handle.previous)
    if (lastUndoHandle && lastUndoHandle.id === handle.id) publishLastUndo(null)
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
    publishLastUndo(null)
    setWorkspace((w) => addInstanceToWorkspace(w, productId))
  }, [])

  const addPopulatedInstance = useCallback(
    (
      productId: MultiInstanceProductId,
      instance: AnyInstance,
      status?: InputStatusMap,
    ): { instanceId: string; undo: WorkspaceUndo } => {
      const w = workspaceRef.current
      const wsa = w.baseline.assumptions
      const wsKey = INVENTORY_PRODUCT_REGISTRY[productId].wsKey
      const currentArray = (wsa[wsKey] ?? []) as unknown as AnyInstance[]
      const instanceId =
        instance.instanceId && instance.instanceId !== ''
          ? instance.instanceId
          : newInstanceId(productId)
      const labelled = applyDisambiguatingLabel(
        { ...instance, instanceId },
        currentArray.length + 1,
      )
      const withStatus: AnyInstance = status
        ? { ...labelled, inputStatus: { ...(labelled.inputStatus ?? {}), ...status } }
        : labelled
      const updated: WorkspaceAssumptionsV2 = {
        ...wsa,
        [wsKey]: [...currentArray, withStatus],
      }
      const undo = commit('Vertrag hinzugefügt', {
        ...w,
        baseline: { ...w.baseline, assumptions: updated, lastEditedAt: Date.now() },
      })
      return { instanceId, undo }
    },
    [commit],
  )

  const updateInstance = useCallback(
    (
      productId: MultiInstanceProductId,
      instanceId: string,
      patch: Partial<AnyInstance>,
      status?: InputStatusMap,
    ) => {
      const w = workspaceRef.current
      const wsa = w.baseline.assumptions
      const wsKey = INVENTORY_PRODUCT_REGISTRY[productId].wsKey
      const currentArray = (wsa[wsKey] ?? []) as unknown as AnyInstance[]
      if (!currentArray.some((i) => i.instanceId === instanceId)) return
      const nextArray = currentArray.map((existing) => {
        if (existing.instanceId !== instanceId) return existing
        // `instanceId` is identity, never patchable — a patch that carried a
        // different one would silently orphan every transfer event and pin
        // pointing at this contract.
        const merged = { ...existing, ...patch, instanceId } as AnyInstance
        return status
          ? { ...merged, inputStatus: { ...(existing.inputStatus ?? {}), ...status } }
          : merged
      })
      const updated: WorkspaceAssumptionsV2 = { ...wsa, [wsKey]: nextArray }
      commit('Vertrag geändert', {
        ...w,
        baseline: { ...w.baseline, assumptions: updated, lastEditedAt: Date.now() },
      })
    },
    [commit],
  )

  const removeInstance = useCallback(
    (productId: MultiInstanceProductId, instanceId: string): WorkspaceUndo =>
      commit(
        'Vertrag entfernt',
        removeInstanceFromWorkspace(workspaceRef.current, productId, instanceId),
      ),
    [commit],
  )


  return {
    workspace,
    storageError,
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
    tryRebaseWhatIf: tryRebaseWhatIfCallback,
    applyWhatIf: applyWhatIfCallback,
    undo,
    lastUndo,
    freezeWhatIf,
    archiveAndRestart,
    addInstance,
    addPopulatedInstance,
    updateInstance,
    removeInstance,
  }
}
