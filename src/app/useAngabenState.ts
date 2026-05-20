import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import type { BavInstance } from '../domain/instances'
import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
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
 */
export interface UseAngabenStateApi {
  profile: PersonalProfile
  setProfile: Dispatch<SetStateAction<PersonalProfile>>
  assumptions: ScenarioAssumptions
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>
  mode: AngabenStateMode
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
 *    archived state, what-ifs, pinned comparisons, etc.).
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
    }
  }

  // Compare-mode initial load: URL state wins over localStorage (mirrors
  // `useCalculatorState.loadInitialState`). We inline the URL+v1 read here
  // rather than calling `useCalculatorState` so we can keep mode + storage
  // routing in a single place and avoid the unused-hook side-effect problem.
  const urlResult = readUrlState()
  if (urlResult.kind === 'valid') {
    return {
      mode,
      profile: urlResult.state.profile,
      assumptions: urlResult.state.assumptions,
      workspace: null,
    }
  }
  const saved = loadSavedState()
  return {
    mode,
    profile: saved?.profile ?? defaultProfile,
    assumptions: saved?.assumptions ?? defaultAssumptions,
    workspace: null,
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

  const [profile, setProfileState] = useState<PersonalProfile>(initial.profile)
  const [assumptions, setAssumptionsState] = useState<ScenarioAssumptions>(
    initial.assumptions,
  )

  // Underlying workspace ref (combine-mode only). Held in a ref because it is
  // a persistence buffer, not a React-visible value — the React-visible value
  // is the projected singleton `assumptions`. Refs are not part of the
  // re-render trigger, so updating it inside the effect does not loop.
  const workspaceRef = useRef<Workspace | null>(initial.workspace)

  // First-effect-run flag. Codex round-1 P1 (PR #283): the persistence effect
  // runs on initial mount alongside every subsequent `profile` / `assumptions`
  // change. On the mount tick the React-visible state already equals the value
  // we just lazy-initialised from storage, so writing it back is a no-op — but
  // a no-op write in combine-mode still stamps `baseline.lastEditedAt =
  // Date.now()`, which `BaselineStaleBadge` (CombineDashboardSidebar.tsx:1051)
  // reads to decide whether what-if snapshots are stale. The mount-time stamp
  // would invalidate every what-if as soon as the user opens `/eingaben`,
  // surfacing false "Baseline hat sich geändert" prompts. We skip the first
  // effect run so only real user mutations (later `setProfile` /
  // `setAssumptions` dispatches from form interaction) reach the write path.
  // Compare-mode is also skipped for symmetry and to avoid redundant mount-time
  // localStorage writes; the v1 envelope is already loaded into state, so
  // writing it back on mount changes nothing.
  const isFirstEffectRun = useRef(true)

  // Persistence effect. Branches on `initial.mode` (captured at mount; stable
  // for the page's lifetime). Compare-mode writes a v1 envelope to
  // STORAGE_KEY_V1; combine-mode projects the singleton assumptions back onto
  // the workspace and writes STORAGE_KEY_V2 via `saveWorkspace` (which runs
  // through `buildWorkspaceJson` → idempotent JSON serialisation).
  //
  // The first effect run (mount-time synchronisation between the lazy-init
  // state and storage) is skipped via `isFirstEffectRun`. See the ref's
  // declaration above for the full rationale.
  useEffect(() => {
    if (isFirstEffectRun.current) {
      isFirstEffectRun.current = false
      return
    }
    if (initial.mode === 'combine') {
      const prev = workspaceRef.current
      if (!prev) return
      const updatedAssumptions = projectSingletonAssumptionsToWorkspace(
        assumptions,
        prev.baseline.assumptions,
      )
      const next: Workspace = {
        ...prev,
        baseline: {
          ...prev.baseline,
          profile,
          assumptions: updatedAssumptions,
          lastEditedAt: Date.now(),
        },
      }
      workspaceRef.current = next
      saveWorkspace(next)
      return
    }
    // Compare-mode: legacy v1 write, mirrors `useCalculatorState`.
    safeSetItem(STORAGE_KEY_V1, buildStateJson(profile, assumptions))
  }, [profile, assumptions, initial.mode])

  // Setters: identical shape to `useCalculatorState` so section components do
  // not change.
  const setProfile: Dispatch<SetStateAction<PersonalProfile>> = useCallback(
    (action) => setProfileState(action),
    [],
  )
  const setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>> = useCallback(
    (action) => setAssumptionsState(action),
    [],
  )

  return {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    mode: initial.mode,
  }
}
