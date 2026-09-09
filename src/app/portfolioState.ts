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

import { useCallback, useSyncExternalStore } from 'react'
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
  defaultInstanceLabel,
  isGeneratedInstanceLabel,
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
 * Give a freshly added contract the label it should carry once it lands in the
 * workspace.
 *
 * The rule (browser-verification finding 1, which produced "ETF #1 #1"):
 *
 *  - a provider name wins — "ETF – Trade Republic" is never numbered;
 *  - a label the user typed is never rewritten;
 *  - a generated label is the plain product name for the only contract of that
 *    product, and gains " #N" from the second one on.
 */
export function applyDisambiguatingLabel<T extends AnyInstance>(
  productId: MultiInstanceProductId,
  instance: T,
  count: number,
): T {
  if (instance.anbieter && instance.anbieter.trim() !== '') return instance
  if (!isGeneratedInstanceLabel(productId, instance.label ?? '')) return instance
  return { ...instance, label: defaultInstanceLabel(productId, count) }
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
  /**
   * Restore the workspace captured in an undo handle.
   *
   * Undo is one level deep, so only the newest handle is honoured: returns
   * `false` (and changes nothing) when a later mutation has superseded
   * `handle` — restoring it would silently discard that mutation. `true` when
   * the workspace was restored.
   */
  undo: (handle: WorkspaceUndo) => boolean
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

// ---------------------------------------------------------------------------
// Workspace store (module-level, write-through)
//
// The workspace used to live in per-mount `useState` with a persist `useEffect`.
// Every route that mounts `usePortfolioState` (`/`, `/vorsorge/neu`,
// `/vertrag/:id/bearbeiten`, `/alternativen`, `/eingaben`) therefore owned a
// private copy, and a handler that committed and then navigated in the same
// tick unmounted before its persist effect ran — the next route's fresh mount
// re-read the *stale* storage value and its own effect wrote that back, eating
// the commit ("Vertrag hinzugefügt" with an empty plan).
//
// One module-level store fixes both halves: every mount observes the same
// value via `useSyncExternalStore`, and each mutation persists synchronously
// inside the setter, so no commit depends on the committing component still
// being mounted. `storageError` rides along as a published flag rather than
// per-mount state. Mirrors the `lastUndo` store above.
// ---------------------------------------------------------------------------

let workspaceStore: Workspace | null = null
let storageErrorFlag = false
const workspaceListeners = new Set<() => void>()

function emitWorkspace(): void {
  for (const listener of workspaceListeners) listener()
}

export function subscribeWorkspace(listener: () => void): () => void {
  workspaceListeners.add(listener)
  return () => { workspaceListeners.delete(listener) }
}

/**
 * The live workspace. Lazily initialised from storage once per page load —
 * later mounts reuse the in-memory value rather than re-reading localStorage,
 * which is what makes a commit survive an immediate route change.
 */
export function getWorkspaceSnapshot(): Workspace {
  if (workspaceStore === null) workspaceStore = loadInitialWorkspace()
  return workspaceStore
}

function getStorageErrorSnapshot(): boolean {
  return storageErrorFlag
}

/**
 * Publish a new workspace and persist it synchronously. `storageError` is
 * derived from `saveWorkspace`'s boolean, exactly as the old persist effect
 * did.
 */
export function setWorkspaceStore(next: Workspace): void {
  if (next === getWorkspaceSnapshot()) return
  workspaceStore = next
  storageErrorFlag = !saveWorkspace(next)
  emitWorkspace()
}

/** Read-modify-write against the live workspace, in one atomic step. */
export function updateWorkspaceStore(updater: (prev: Workspace) => Workspace): Workspace {
  const next = updater(getWorkspaceSnapshot())
  setWorkspaceStore(next)
  return next
}

/**
 * Test seam: drop the in-memory workspace (and the pending undo handle) so a
 * test that seeds localStorage in `beforeEach` gets a store hydrated from its
 * own fixture. Called globally from `src/vitest.setup.ts`.
 */
export function resetPortfolioStore(): void {
  // Deliberately silent: notifying here would make any component still mounted
  // from the previous test re-read `getWorkspaceSnapshot()`, which re-hydrates
  // the store from the localStorage the test is about to clear. Dropping the
  // value is enough — the next mount reads the fresh fixture.
  workspaceStore = null
  storageErrorFlag = false
  lastUndoHandle = null
}

/** Subscribe to the shared workspace. */
export function useWorkspaceValue(): Workspace {
  return useSyncExternalStore(subscribeWorkspace, getWorkspaceSnapshot, getWorkspaceSnapshot)
}

export function usePortfolioState(): UsePortfolioStateApi {
  const workspace = useWorkspaceValue()
  const storageError = useSyncExternalStore(
    subscribeWorkspace,
    getStorageErrorSnapshot,
    getStorageErrorSnapshot,
  )
  const lastUndo = useSyncExternalStore(
    subscribeLastUndo,
    () => lastUndoHandle,
    () => null,
  )

  /**
   * Commit a fully-formed workspace in exactly one store write, recording an
   * undo handle for the state it replaced. Every §5 mutation goes through here,
   * which is what makes the atomicity and one-level-undo rules structural
   * rather than a convention.
   */
  const commit = useCallback((label: string, next: Workspace): WorkspaceUndo => {
    const previous = getWorkspaceSnapshot()
    const undo: WorkspaceUndo = { id: newUndoId(), label, createdAt: Date.now(), previous }
    setWorkspaceStore(next)
    publishLastUndo(undo)
    return undo
  }, [])

  const replaceWorkspace = useCallback((next: Workspace) => {
    // Not a `commit`: no undo handle is recorded, so the pending one must go —
    // it snapshots a workspace that predates this write and undoing it would
    // silently discard the newer edit.
    publishLastUndo(null)
    setWorkspaceStore(next)
  }, [])

  const setMode = useCallback((mode: Workspace['mode']) => {
    publishLastUndo(null)
    updateWorkspaceStore((w) => ({ ...w, mode }))
  }, [])

  const setBaseline = useCallback((scenario: Scenario) => {
    publishLastUndo(null)
    updateWorkspaceStore((w) => ({ ...w, baseline: scenario }))
  }, [])

  const patchBaseline = useCallback(
    (patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => {
      publishLastUndo(null)
      updateWorkspaceStore((w) => ({
        ...w,
        baseline: { ...w.baseline, ...patch, lastEditedAt: Date.now() },
      }))
    },
    [],
  )

  const addWhatIf = useCallback((whatIf: WhatIfScenario) => {
    publishLastUndo(null)
    updateWorkspaceStore((w) => ({ ...w, whatIfs: [...w.whatIfs, whatIf] }))
  }, [])

  const updateWhatIf = useCallback(
    (id: string, patch: Partial<Omit<WhatIfScenario, 'id'>>) => {
      publishLastUndo(null)
      updateWorkspaceStore((w) => ({
        ...w,
        whatIfs: w.whatIfs.map((wi) => (wi.id === id ? { ...wi, ...patch } : wi)),
      }))
    },
    [],
  )

  const removeWhatIf = useCallback(
    (id: string): WorkspaceUndo => {
      const w = getWorkspaceSnapshot()
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
      updateWorkspaceStore((w) => ({ ...w, whatIfs: [...w.whatIfs, whatIf] }))
      return whatIf
    },
    [workspace.baseline],
  )

  const tryRebaseWhatIfCallback = useCallback(
    (id: string): RebaseWhatIfResult => {
      const w = getWorkspaceSnapshot()
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
      const w = getWorkspaceSnapshot()
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

  // Only the newest handle may be undone. A surface that holds a handle across
  // a later mutation (the contract editor keeps one while it shows "entfernt")
  // would otherwise restore a snapshot taken *before* that mutation and discard
  // it silently. Undo is one level deep, so a superseded handle is refused.
  const undo = useCallback((handle: WorkspaceUndo): boolean => {
    if (!lastUndoHandle || lastUndoHandle.id !== handle.id) return false
    setWorkspaceStore(handle.previous)
    publishLastUndo(null)
    return true
  }, [])

  const freezeWhatIf = useCallback((id: string) => {
    updateWorkspaceStore((w) => ({
      ...w,
      whatIfs: w.whatIfs.map((wi) =>
        wi.id === id ? { ...wi, frozenAt: Date.now() } : wi,
      ),
    }))
  }, [])

  const archiveAndRestart = useCallback((): SavedScenario => {
    const currentYear = new Date().getFullYear()
    const archiveName = `Baseline ${currentYear}`
    // Read the live workspace from the store rather than this render's
    // closure, so an archive that follows another mutation in the same tick
    // still sees that mutation's result.
    const currentWorkspace = getWorkspaceSnapshot()
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
    updateWorkspaceStore((w) => ({
      ...w,
      whatIfs: [],
    }))
    return archived
  }, [])

  const addInstance = useCallback((productId: MultiInstanceProductId) => {
    publishLastUndo(null)
    updateWorkspaceStore((w) => addInstanceToWorkspace(w, productId))
  }, [])

  const addPopulatedInstance = useCallback(
    (
      productId: MultiInstanceProductId,
      instance: AnyInstance,
      status?: InputStatusMap,
    ): { instanceId: string; undo: WorkspaceUndo } => {
      const w = getWorkspaceSnapshot()
      const wsa = w.baseline.assumptions
      const wsKey = INVENTORY_PRODUCT_REGISTRY[productId].wsKey
      const currentArray = (wsa[wsKey] ?? []) as unknown as AnyInstance[]
      const instanceId =
        instance.instanceId && instance.instanceId !== ''
          ? instance.instanceId
          : newInstanceId(productId)
      const labelled = applyDisambiguatingLabel(
        productId,
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
      const w = getWorkspaceSnapshot()
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
        removeInstanceFromWorkspace(getWorkspaceSnapshot(), productId, instanceId),
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
