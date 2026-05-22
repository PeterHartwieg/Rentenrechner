import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import type { BavInstance } from '../domain/instances'
import type {
  Scenario,
  WhatIfScenario,
  Workspace,
  WorkspaceAssumptionsV2,
} from '../domain/workspace'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import {
  addArchivedEntry,
  type SavedScenario,
} from '../data/scenarioLibrary'
import {
  buildStateJson,
  defaultWorkspace,
  loadSavedState,
  loadSavedWorkspace,
  saveWorkspace,
  STORAGE_KEY_V1,
} from '../storage'
import { safeSetItem } from '../utils/safeStorage'
import { singletonViewOfWorkspace } from '../engine/portfolioProjection'
import { readUrlState } from '../utils/urlShare'
import {
  addInstanceToWorkspace,
  removeInstanceFromWorkspace,
} from './workspaceIdentity'
import { rebaseWhatIf as rebaseWhatIfPure } from './portfolioState'
import type { MultiInstanceProductId } from './portfolioState'
import {
  normalizeMonthlyNettoBelastung,
  syncMonthlyContributions,
} from './syncContributions'
import { detectSavedMode } from './useRoute'

/**
 * Active state-binding mode for `AngabenPage`. Captured once at mount via
 * `detectSavedMode()` and remains stable for the lifetime of the page.
 *
 * - `'compare'` — legacy singleton path; edits write to STORAGE_KEY_V1 (the
 *   same envelope `useCalculatorState` uses). Returning users with a v1 save,
 *   share-URL visitors, and brand-new visitors with no saved state are all in
 *   this bucket.
 * - `'combine'` — workspace path; edits write to STORAGE_KEY_V2 via the
 *   workspace `baseline.profile` / `baseline.assumptions`. Returning users
 *   whose v2 save carries `mode: 'combine'`.
 *
 * The page does NOT switch modes mid-session. `detectSavedMode()` is called
 * exactly once via the `useState` lazy initializer, and the resulting mode is
 * pinned for the page's lifetime. This is intentional: mode-switching usually
 * happens via a deliberate user action (the landing page CTA, a wizard, etc.)
 * which re-mounts the route shell.
 */
export type AngabenStateMode = 'compare' | 'combine'

/**
 * Shape returned by `useAngabenState`. Intentionally mirrors the
 * `{ profile, setProfile, assumptions, setAssumptions }` shape that
 * `useCalculatorState` exposes so the four `Angaben*Section` components stay
 * mode-agnostic — they receive the same prop interface whether the page is
 * bound to compare-mode singleton state or combine-mode workspace state.
 *
 * The extra `mode` field lets the page tailor disclosure copy (which storage
 * key gets written, which fields are persisted) without re-running the
 * detection itself.
 *
 * Codex R2 P1 fix: `AngabenProduktSection` (§ 5) historically mounted a
 * second `useCalculatorState` / `usePortfolioState` to source the per-product
 * inputs surface. Two parallel stores on the same storage key caused
 * last-write-wins data loss: a § 1 profile edit followed by a § 5 product
 * edit would silently revert the § 1 edit because the § 5 store wrote a stale
 * profile snapshot back to the same envelope. The fix is to expose ONE store
 * per mode via this hook and let `AngabenPage` thread the relevant slice
 * down to § 5 as props. The compare-mode-only and combine-mode-only fields
 * below carry the slice each branch needs; the section discriminates on
 * `mode` and consumes the matching subset.
 */
export interface UseAngabenStateApi {
  profile: PersonalProfile
  setProfile: Dispatch<SetStateAction<PersonalProfile>>
  assumptions: ScenarioAssumptions
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>
  mode: AngabenStateMode
  // ------- Compare-mode-only convenience setters (mirror `useCalculatorState`) -------
  /** Reset profile + assumptions to defaults (compare-mode only). `undefined` in combine-mode. */
  resetToDefaults: (() => void) | undefined
  /**
   * Single entry point for every "monthly investment" field in compare-mode.
   * Back-solves ETF / private-insurance contributions so they share the same
   * out-of-pocket netto cash as bAV (the fair-comparison invariant). `undefined`
   * in combine-mode (per-instance `monthlyContribution` is the source of truth there).
   */
  setSyncedMonthlyContribution: ((targetNet: number) => void) | undefined
  // ------- Combine-mode-only workspace surface (mirror `usePortfolioState` subset) -------
  /** The full workspace (combine-mode only). `undefined` in compare-mode. */
  workspace: Workspace | undefined
  /** Baseline scenario (combine-mode only). */
  baseline: Scenario | undefined
  /** What-if scenarios (combine-mode only). */
  whatIfs: WhatIfScenario[] | undefined
  /** Patch the baseline scenario (combine-mode only). Stamps `lastEditedAt`. */
  patchBaseline: ((patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => void) | undefined
  /** Add a default instance of the given product type (combine-mode only). */
  addInstance: ((productId: MultiInstanceProductId) => void) | undefined
  /** Remove an instance by productId + instanceId (combine-mode only). */
  removeInstance:
    | ((productId: MultiInstanceProductId, instanceId: string) => void)
    | undefined
  /** Append a what-if scenario (combine-mode only). */
  addWhatIf: ((whatIf: WhatIfScenario) => void) | undefined
  /** Re-base a what-if against the current baseline (combine-mode only). */
  rebaseWhatIf: ((id: string) => void) | undefined
  /** Freeze a what-if to suppress the stale-badge until next baseline edit (combine-mode only). */
  freezeWhatIf: ((id: string) => void) | undefined
  /** Archive baseline + clear what-ifs (combine-mode only). Returns the archived entry. */
  archiveAndRestart: (() => SavedScenario) | undefined
}

/**
 * Defaults passed to `singletonViewOfWorkspace` when a product slot is empty
 * (length-0 instance array). The view always returns a full
 * `ScenarioAssumptions` shape so the section components can read every field
 * without null-guards; the defaults supply the slot values when no instance
 * exists for that product. Same shape `storage.workspaceToSingletonAssumptions`
 * supplies — keep them in sync.
 */
const SINGLETON_VIEW_DEFAULTS = {
  bav: defaultAssumptions.bav,
  etf: defaultAssumptions.etf,
  insurance: defaultAssumptions.insurance,
  basisrente: defaultAssumptions.basisrente,
  altersvorsorgedepot: defaultAssumptions.altersvorsorgedepot,
  riester: defaultAssumptions.riester,
} as const

/**
 * Project a singleton-shaped assumptions update back onto the workspace's
 * `baseline.assumptions` (a `WorkspaceAssumptionsV2`).
 *
 * Workspace-level fields (`inflationRate`, `retirementEndAge`, `monteCarlo`,
 * `statutoryPension`, `returnScenarios`, `visibleProducts`, the compareSubMode
 * legacy round-trip pair) map 1:1.
 *
 * The per-product slots are asymmetric: in compare-mode `assumptions.bav` is a
 * single `BavAssumptions` object; in combine-mode `assumptions.bav` is a
 * `BavInstance[]` (one element per contract the user owns). The page's
 * `AngabenEinkommenSection` reads/writes `assumptions.bav.monthlyGrossConversion`
 * — a per-instance field. We honour this by writing the field onto the *first*
 * active bAV instance when one exists. If the user has zero bAV instances the
 * edit is dropped silently (the field still renders with the
 * `defaultAssumptions.bav` value from `singletonViewOfWorkspace`, but the
 * workspace has no instance to receive the change). The storage copy on the
 * AngabenPage names this asymmetry honestly so the user is never surprised.
 *
 * No other per-product field is edited by the four `/eingaben` sections today,
 * so the projection only touches `bav.monthlyGrossConversion`. If future PRs
 * add per-instance edits (ETF contribution, Riester monthly, etc.), extend
 * this projection to cover them.
 */
function projectSingletonAssumptionsToWorkspace(
  next: ScenarioAssumptions,
  wsa: WorkspaceAssumptionsV2,
): WorkspaceAssumptionsV2 {
  // Workspace-level fields — direct mapping.
  let updated: WorkspaceAssumptionsV2 = {
    ...wsa,
    inflationRate: next.inflationRate,
    retirementEndAge: next.retirementEndAge,
    returnScenarios: next.returnScenarios,
    monteCarlo: next.monteCarlo,
    statutoryPension: next.statutoryPension,
    visibleProducts: next.visibleProducts,
    compareSubMode: next.compareSubMode ?? wsa.compareSubMode,
    equalInputAmountEUR: next.equalInputAmountEUR ?? wsa.equalInputAmountEUR,
  }

  // Per-instance asymmetric field: bAV-Brutto. Write to the first active bAV
  // instance if any. Mirrors `singletonViewOfWorkspace`'s `firstActive`
  // selector so the read+write paths agree on which instance is "the" bAV.
  const firstBavActiveIdx = wsa.bav.findIndex(
    (i) => i.status === 'active' || i.status === 'paid_up',
  )
  if (firstBavActiveIdx >= 0) {
    const existing = wsa.bav[firstBavActiveIdx]
    // Only rewrite when the value actually changed — avoids re-render thrash.
    if (existing.monthlyGrossConversion !== next.bav.monthlyGrossConversion) {
      const updatedInstance: BavInstance = {
        ...existing,
        monthlyGrossConversion: next.bav.monthlyGrossConversion,
      }
      updated = {
        ...updated,
        bav: updated.bav.map((inst, idx) =>
          idx === firstBavActiveIdx ? updatedInstance : inst,
        ),
      }
    }
  }
  // If no active bAV instance exists, the edit is dropped. The user sees the
  // field reset to the default on the next render via singletonViewOfWorkspace.
  // The storage copy on AngabenPage names this asymmetry.

  return updated
}

/**
 * Computed initial state for `useAngabenState`. Captures:
 *  - the active mode (pinned for the page's lifetime),
 *  - the initial `profile` + `assumptions` projected from whichever store the
 *    mode points at,
 *  - for combine-mode, the underlying `Workspace` so subsequent writes can
 *    preserve fields the singleton view does not expose (instance arrays for
 *    products other than bAV's first instance, scenario library entries via
 *    archived state, what-ifs, pinned comparisons, etc.),
 *  - `persistOnMount` — `true` only when the lazy initializer hydrated state
 *    from a source that is NOT yet reflected in the canonical write target
 *    (today: a valid `?s=` compare-mode share-URL). The persistence effect
 *    consults this on its first run to decide whether the mount-time write is
 *    a no-op (skip) or a load-bearing import (perform).
 *
 * Runs exactly once via the `useState` lazy initializer so reading
 * localStorage + URL state happens at most once per page mount.
 */
interface InitialAngabenState {
  mode: AngabenStateMode
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  /** Present only in combine-mode. */
  workspace: Workspace | null
  /**
   * `true` when initial state was hydrated from a source that the canonical
   * write target does not yet contain — currently only the compare-mode
   * share-URL `?s=` branch. The persistence effect performs the first write
   * unconditionally if this is `true`, and skips it otherwise.
   *
   * - combine-mode (always loaded from storage) → `false`
   * - compare-mode + URL state present                → `true`
   * - compare-mode + localStorage v1 envelope present → `false`
   * - compare-mode + no source (defaults)             → `false`
   */
  persistOnMount: boolean
}

function computeInitialAngabenState(): InitialAngabenState {
  // Mode detection — workspace presence is the canonical signal. Mirrors the
  // logic in `App.tsx` choosing landing vs compare vs combine dashboard for `/`.
  const detected = detectSavedMode()
  const mode: AngabenStateMode = detected === 'combine' ? 'combine' : 'compare'

  if (mode === 'combine') {
    const workspace = loadSavedWorkspace() ?? defaultWorkspace
    return {
      mode,
      profile: workspace.baseline.profile,
      assumptions: singletonViewOfWorkspace(workspace, SINGLETON_VIEW_DEFAULTS),
      workspace,
      // Combine-mode never hydrates from a URL; either the workspace already
      // contains these values, or we just fell back to `defaultWorkspace`
      // (which the user has not seen yet, so saving it on mount would also be
      // wrong — it would bump `lastEditedAt` and falsely invalidate any
      // what-if snapshots taken before the page open).
      persistOnMount: false,
    }
  }

  // Compare-mode initial load: URL state wins over localStorage (mirrors
  // `useCalculatorState.loadInitialState`). We inline the URL+v1 read here
  // rather than calling `useCalculatorState` so we can keep mode + storage
  // routing in a single place and avoid the unused-hook side-effect problem.
  const urlResult = readUrlState()
  if (urlResult.kind === 'valid') {
    // Share-URL import. STORAGE_KEY_V1 does NOT yet contain this state — the
    // user navigated to `/eingaben?s=…` from a shared link, and if we skip the
    // mount-time write the import is lost the moment the user navigates away
    // without editing anything. The first-run skip in the persistence effect
    // must NOT apply here. (Codex R2 P2 / CodeRabbit Major on PR #283.)
    return {
      mode,
      profile: urlResult.state.profile,
      assumptions: urlResult.state.assumptions,
      workspace: null,
      persistOnMount: true,
    }
  }
  const saved = loadSavedState()
  return {
    mode,
    profile: saved?.profile ?? defaultProfile,
    assumptions: saved?.assumptions ?? defaultAssumptions,
    workspace: null,
    // Either v1 already holds the seeded snapshot, or we fell back to defaults
    // (which the user has not actively chosen — writing them back on mount
    // would just be a no-op). In both cases the first-run skip is correct.
    persistOnMount: false,
  }
}

/**
 * Mode-aware state binding for `/eingaben` (issue #282).
 *
 * Detects the active session mode via `detectSavedMode()` and routes
 * `profile` + `assumptions` reads/writes to whichever store is authoritative:
 *
 * | Detected mode | Read source                              | Write target              |
 * |---------------|------------------------------------------|---------------------------|
 * | `'compare'`   | URL `?s=` ► STORAGE_KEY_V1 ► defaults    | STORAGE_KEY_V1            |
 * | `'combine'`   | STORAGE_KEY_V2 → singleton view          | STORAGE_KEY_V2 (baseline) |
 * | `null` (new)  | falls back to `'compare'`                | STORAGE_KEY_V1            |
 *
 * The detection runs once via the `useState` lazy initializer; the mode is
 * pinned for the page's lifetime. The page does not silently re-mount on
 * mode changes — switching modes is always a deliberate navigation action
 * (e.g. the landing page CTA or InventoryWizard) that triggers a new mount.
 *
 * Heuristic rationale (Option 1 / mode-aware binding per issue #282):
 *  - Workspace presence is the most user-friendly mode signal: returning
 *    combine-mode users do not need a URL flag or a session preference.
 *    `detectSavedMode` mirrors the same logic the rest of the app uses
 *    (`App.tsx` choosing landing vs compare vs combine dashboard for `/`).
 *  - We deliberately do NOT introduce a new storage key for "mode" — the
 *    workspace's `mode` field is already authoritative and adding a third key
 *    would create a fan-out problem (which key wins on conflict?).
 *  - Persisted edits round-trip: every keystroke writes to the right store
 *    so a refresh or navigation to `/` reads the matching state back.
 *
 * Combine-mode write strategy: profile maps 1:1 onto `baseline.profile`;
 * workspace-level assumptions fields (`inflationRate`, `retirementEndAge`,
 * `monteCarlo`, `statutoryPension`, `returnScenarios`, `visibleProducts`)
 * map 1:1 onto `baseline.assumptions`. The per-instance
 * `bav.monthlyGrossConversion` field writes onto the first active bAV
 * instance; with zero bAV instances the edit is dropped (the user has no
 * contract to receive the value). The page's storage copy names this
 * asymmetry.
 *
 * Storage shape: byte-identical with what the rest of the app reads/writes.
 * The v2 workspace `schemaVersion: 2` is unchanged; no new top-level fields
 * are added. The compare-mode singleton envelope (STORAGE_KEY_V1) is also
 * unchanged. `migrateAndValidateState` remains the single load/save funnel
 * for compare-mode; combine-mode goes through `parseWorkspaceJson` (which
 * runs `validateWorkspace`).
 */
export function useAngabenState(): UseAngabenStateApi {
  // Initial state — runs once. Captures mode, profile, assumptions, and the
  // underlying workspace (combine-mode only).
  const [initial] = useState<InitialAngabenState>(computeInitialAngabenState)

  // Compare-mode primary state — held as the canonical source. In combine-mode
  // these slots are unused (we derive the singleton view from `workspace`
  // below) but we keep them allocated unconditionally so React hooks order is
  // stable across renders.
  const [compareProfile, setCompareProfile] = useState<PersonalProfile>(initial.profile)
  const [compareAssumptions, setCompareAssumptions] = useState<ScenarioAssumptions>(
    initial.assumptions,
  )

  // Combine-mode primary state — the workspace IS the source of truth. The
  // singleton-view `profile` + `assumptions` returned to consumers are derived
  // freshly from this on every render, so a sidebar mutation in § 5 that
  // patches `baseline.assumptions.visibleProducts` (via `patchBaseline`) is
  // immediately reflected in the § 4 receipt without any extra synchronisation
  // effect. Codex R2 P1: this is what eliminates the parallel-store data loss
  // — there is exactly one store per mode, owned by this hook.
  const [workspace, setWorkspaceState] = useState<Workspace | null>(initial.workspace)

  const isCombine = initial.mode === 'combine'

  // Derive the canonical `profile` + `assumptions` for the active mode. In
  // combine-mode we re-derive on every render via `singletonViewOfWorkspace`;
  // the projection is pure + cheap so this is fine. In compare-mode we just
  // forward the `useState` values. `useMemo` keeps the singleton view stable
  // across renders that don't touch `workspace`.
  const assumptions = useMemo<ScenarioAssumptions>(() => {
    if (isCombine && workspace) {
      return singletonViewOfWorkspace(workspace, SINGLETON_VIEW_DEFAULTS)
    }
    return compareAssumptions
  }, [isCombine, workspace, compareAssumptions])
  const profile: PersonalProfile = isCombine && workspace
    ? workspace.baseline.profile
    : compareProfile

  // First-effect-run flag. Codex round-1 P1 (PR #283): the persistence effect
  // runs on initial mount. On the mount tick the React-visible state already
  // equals the value we just lazy-initialised from storage, so writing it back
  // is a no-op — but a no-op write in combine-mode still stamps
  // `baseline.lastEditedAt = Date.now()`, which `BaselineStaleBadge`
  // (CombineDashboardSidebar.tsx:1051) reads to decide whether what-if
  // snapshots are stale. We therefore skip the first effect run unless the
  // lazy initializer signalled that the mount-time write is load-bearing via
  // `initial.persistOnMount` (today only set for compare-mode share-URL
  // imports — Codex R2 P2 / CodeRabbit Major on PR #283).
  const isFirstEffectRun = useRef(true)

  // Persistence effect. Single dispatch by mode. Compare-mode writes a v1
  // envelope to STORAGE_KEY_V1; combine-mode writes the full workspace to
  // STORAGE_KEY_V2 via `saveWorkspace`. The dependency array picks up every
  // mutation that should trigger a save: in combine-mode it's `workspace`
  // (every mutator routes through `setWorkspaceState`); in compare-mode it's
  // `compareProfile` + `compareAssumptions`.
  useEffect(() => {
    if (isFirstEffectRun.current) {
      isFirstEffectRun.current = false
      if (!initial.persistOnMount) {
        return
      }
      // Fall through to perform the load-bearing first write (compare-mode
      // share-URL import). This is intentionally restricted to compare-mode:
      // the combine-mode branch always sets `persistOnMount: false`.
    }
    if (isCombine) {
      if (!workspace) return
      saveWorkspace(workspace)
      return
    }
    // Compare-mode: legacy v1 write, mirrors `useCalculatorState`.
    safeSetItem(STORAGE_KEY_V1, buildStateJson(compareProfile, compareAssumptions))
  }, [
    compareProfile,
    compareAssumptions,
    workspace,
    isCombine,
    initial.persistOnMount,
  ])

  // Setters: same shape as `useCalculatorState` so section components do not
  // change. In combine-mode they route through `setWorkspaceState` with the
  // singleton-view projection so the workspace stays the single source of
  // truth; in compare-mode they update the React-state directly.
  const setProfile: Dispatch<SetStateAction<PersonalProfile>> = useCallback(
    (action) => {
      if (isCombine) {
        setWorkspaceState((prev) => {
          if (!prev) return prev
          const nextProfile =
            typeof action === 'function'
              ? (action as (p: PersonalProfile) => PersonalProfile)(prev.baseline.profile)
              : action
          if (nextProfile === prev.baseline.profile) return prev
          return {
            ...prev,
            baseline: {
              ...prev.baseline,
              profile: nextProfile,
              lastEditedAt: Date.now(),
            },
          }
        })
        return
      }
      setCompareProfile(action)
    },
    [isCombine],
  )

  const setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>> = useCallback(
    (action) => {
      if (isCombine) {
        setWorkspaceState((prev) => {
          if (!prev) return prev
          const prevSingleton = singletonViewOfWorkspace(
            prev,
            SINGLETON_VIEW_DEFAULTS,
          )
          const nextSingleton =
            typeof action === 'function'
              ? (action as (a: ScenarioAssumptions) => ScenarioAssumptions)(
                  prevSingleton,
                )
              : action
          // CodeRabbit R3 Major: a no-op updater (`setAssumptions(prev => prev)`)
          // returned the same reference, but `projectSingletonAssumptionsToWorkspace`
          // always allocates a fresh object, so the workspace update + Date.now()
          // stamp fired unconditionally — falsely flagging every what-if as
          // stale even though no edit happened. Short-circuit on reference
          // equality before projection runs.
          if (nextSingleton === prevSingleton) return prev
          const updatedAssumptions = projectSingletonAssumptionsToWorkspace(
            nextSingleton,
            prev.baseline.assumptions,
          )
          if (updatedAssumptions === prev.baseline.assumptions) return prev
          return {
            ...prev,
            baseline: {
              ...prev.baseline,
              assumptions: updatedAssumptions,
              lastEditedAt: Date.now(),
            },
          }
        })
        return
      }
      setCompareAssumptions(action)
    },
    [isCombine],
  )

  // ----- Compare-mode convenience setters (used by § 5 `InputsPanel`) -----
  // These mirror the helpers `useCalculatorState` exposes. They are only
  // meaningful in compare-mode; in combine-mode they are `undefined` on the
  // returned API surface.
  const resetToDefaults = useCallback(() => {
    setCompareProfile(defaultProfile)
    setCompareAssumptions(
      syncMonthlyContributions(
        normalizeMonthlyNettoBelastung(
          defaultAssumptions.equalInputAmountEUR ?? 0,
        ),
        defaultAssumptions,
        defaultProfile,
        de2026Rules,
      ),
    )
  }, [])

  const setSyncedMonthlyContribution = useCallback(
    (targetNet: number) => {
      const target = normalizeMonthlyNettoBelastung(targetNet)
      setCompareAssumptions((current) =>
        syncMonthlyContributions(target, current, compareProfile, de2026Rules),
      )
    },
    [compareProfile],
  )

  // ----- Combine-mode workspace mutators (used by § 5 `CombineDashboardSidebar`) -----
  // Each mutator routes through `setWorkspaceState`. Because the singleton
  // `assumptions` returned to consumers is derived freshly from `workspace`
  // on every render, a sidebar mutation here is immediately visible to
  // § 1–§ 4 — no separate synchronisation step is needed. Patching the
  // baseline bumps `lastEditedAt` so `BaselineStaleBadge` can flag stale
  // what-ifs; instance edits + assumption patches both count as user edits.
  const patchBaseline = useCallback(
    (patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => {
      setWorkspaceState((w) =>
        w
          ? {
              ...w,
              baseline: { ...w.baseline, ...patch, lastEditedAt: Date.now() },
            }
          : w,
      )
    },
    [],
  )

  const addInstance = useCallback((productId: MultiInstanceProductId) => {
    setWorkspaceState((w) => (w ? addInstanceToWorkspace(w, productId) : w))
  }, [])

  const removeInstance = useCallback(
    (productId: MultiInstanceProductId, instanceId: string) => {
      setWorkspaceState((w) =>
        w ? removeInstanceFromWorkspace(w, productId, instanceId) : w,
      )
    },
    [],
  )

  const addWhatIf = useCallback((whatIf: WhatIfScenario) => {
    setWorkspaceState((w) =>
      w ? { ...w, whatIfs: [...w.whatIfs, whatIf] } : w,
    )
  }, [])

  const rebaseWhatIfCallback = useCallback((id: string) => {
    setWorkspaceState((w) =>
      w
        ? {
            ...w,
            whatIfs: w.whatIfs.map((wi) =>
              wi.id === id ? rebaseWhatIfPure(wi, w.baseline) : wi,
            ),
          }
        : w,
    )
  }, [])

  const freezeWhatIf = useCallback((id: string) => {
    setWorkspaceState((w) =>
      w
        ? {
            ...w,
            whatIfs: w.whatIfs.map((wi) =>
              wi.id === id ? { ...wi, frozenAt: Date.now() } : wi,
            ),
          }
        : w,
    )
  }, [])

  // `archiveAndRestart` returns the created `SavedScenario` (for callers that
  // want to display its name in a confirmation toast). The archived entry is
  // added to the scenario library synchronously, and the workspace is updated
  // via `setWorkspaceState`. Combine-mode-only.
  const archiveAndRestart = useCallback((): SavedScenario => {
    if (!workspace) {
      throw new Error(
        'useAngabenState.archiveAndRestart called without a workspace',
      )
    }
    const currentYear = new Date().getFullYear()
    const archiveName = `Baseline ${currentYear}`
    const projectedAssumptions = singletonViewOfWorkspace(
      workspace,
      SINGLETON_VIEW_DEFAULTS,
    )
    const archived = addArchivedEntry(
      archiveName,
      workspace.baseline.profile,
      projectedAssumptions,
    )
    setWorkspaceState((w) => (w ? { ...w, whatIfs: [] } : w))
    return archived
  }, [workspace])

  return {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    mode: initial.mode,
    // Compare-mode-only convenience setters
    resetToDefaults: isCombine ? undefined : resetToDefaults,
    setSyncedMonthlyContribution: isCombine ? undefined : setSyncedMonthlyContribution,
    // Combine-mode-only workspace surface
    workspace: isCombine && workspace ? workspace : undefined,
    baseline: isCombine && workspace ? workspace.baseline : undefined,
    whatIfs: isCombine && workspace ? workspace.whatIfs : undefined,
    patchBaseline: isCombine ? patchBaseline : undefined,
    addInstance: isCombine ? addInstance : undefined,
    removeInstance: isCombine ? removeInstance : undefined,
    addWhatIf: isCombine ? addWhatIf : undefined,
    rebaseWhatIf: isCombine ? rebaseWhatIfCallback : undefined,
    freezeWhatIf: isCombine ? freezeWhatIf : undefined,
    archiveAndRestart: isCombine ? archiveAndRestart : undefined,
  }
}
