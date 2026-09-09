/**
 * Workspace identity and mutation Module (architecture-readability issue 01).
 *
 * Owns all workspace ID generation and pure workspace add/remove mutations so
 * that `portfolioState.ts` (React hook) and `inventoryHelpers.ts` (wizard
 * helpers) can each import from here rather than from each other.  Removing
 * that circular dependency was the primary goal.
 *
 * Nothing in this module imports React, DOM APIs, or any other `src/app` or
 * React-dependent file.  It imports only from `src/domain`, `src/data`, and
 * (for issue 09) `src/features/inventory/inventoryProductRegistry.ts` which is
 * also React-free.
 *
 * Public surface:
 *  - newScenarioId   — scenario ID (UUID-prefixed)
 *  - newInstanceId   — instance ID (${productId}-${random8})
 *  - deepCloneScenario — structural clone helper
 *  - addInstanceToWorkspace    — pure workspace mutation (routes via INVENTORY_PRODUCT_REGISTRY)
 *  - removeInstanceFromWorkspace — pure workspace mutation
 */

import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type {
  AltersvorsorgedepotInstance,
  InstanceCommon,
  RiesterInstance,
} from '../domain/instances'
import { INVENTORY_PRODUCT_REGISTRY } from '../features/inventory/inventoryProductRegistry'

/** Every per-product instance-array key on `WorkspaceAssumptionsV2`. */
const INSTANCE_ARRAY_KEYS = Object.values(INVENTORY_PRODUCT_REGISTRY).map(
  (entry) => entry.wsKey,
) as readonly (keyof WorkspaceAssumptionsV2)[]

/** Walk every instance in a workspace-assumptions object. */
function eachInstanceArray(
  wsa: WorkspaceAssumptionsV2,
): { key: keyof WorkspaceAssumptionsV2; instances: InstanceCommon[] }[] {
  return INSTANCE_ARRAY_KEYS.map((key) => ({
    key,
    instances: (Array.isArray(wsa[key]) ? wsa[key] : []) as unknown as InstanceCommon[],
  }))
}

/** `true` when any instance in the scenario carries the given id. */
function scenarioReferencesInstance(wsa: WorkspaceAssumptionsV2, instanceId: string): boolean {
  return eachInstanceArray(wsa).some(({ instances }) =>
    instances.some(
      (instance) =>
        instance.instanceId === instanceId ||
        (instance.transferEvents ?? []).some(
          (event) =>
            event.sourceInstanceId === instanceId || event.targetInstanceId === instanceId,
        ),
    ),
  )
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a UUID-style id for new scenarios.  Uses `crypto.randomUUID` when
 * available (browsers + Node 19+), with a fallback for older environments.
 *
 * Exported so tests and spawn flows can produce deterministic-shape ids
 * without pulling in the React hook.
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

/**
 * Generate a new stable instance id matching the documented format
 * `${productId}-${random8}` (e.g. `bav-7f2a91c4`).
 */
export function newInstanceId(productId: string): string {
  return `${productId}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------------------------------------------------------------------------
// Deep clone utility
// ---------------------------------------------------------------------------

/**
 * Structural clone for workspace objects.  Uses `structuredClone` when
 * available, falls back to JSON round-trip for older environments.
 */
export function deepCloneScenario<T>(v: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(v)
  }
  return JSON.parse(JSON.stringify(v)) as T
}

// ---------------------------------------------------------------------------
// Pure workspace mutations
// ---------------------------------------------------------------------------

/**
 * Add a new default instance of the given product type to the baseline
 * assumptions of the supplied workspace.  Returns a new workspace without
 * mutating the original.
 *
 * `productId` must be one of the per-product instance array keys on
 * `WorkspaceAssumptionsV2`.  GRV stays singleton and is not in scope.
 *
 * Default instance construction is delegated to
 * `INVENTORY_PRODUCT_REGISTRY[productId].createDefault` (issue 09), so new
 * fields or defaults only need to change in one place per product.
 */
export function addInstanceToWorkspace(
  workspace: Workspace,
  productId: 'bav' | 'versicherung' | 'riester' | 'basisrente' | 'altersvorsorgedepot' | 'etf',
): Workspace {
  const wsa = workspace.baseline.assumptions
  const CURRENT_YEAR = new Date().getFullYear()
  const entry = INVENTORY_PRODUCT_REGISTRY[productId]
  const wsKey = entry.wsKey as keyof WorkspaceAssumptionsV2
  const currentArray = wsa[wsKey] as unknown[]
  const n = currentArray.length + 1
  let newInst = entry.createDefault(CURRENT_YEAR, n, newInstanceId)
  if (productId === 'riester') {
    const riester = newInst as RiesterInstance
    newInst = {
      ...riester,
      eligibility: {
        ...riester.eligibility,
        ageAtContractStart: workspace.baseline.profile.age,
        careerStarterBonusUsed: false,
      },
    }
  } else if (productId === 'altersvorsorgedepot') {
    const avd = newInst as AltersvorsorgedepotInstance
    newInst = {
      ...avd,
      eligibility: {
        ...avd.eligibility,
        ageAtContractStart: workspace.baseline.profile.age,
        careerStarterBonusUsed: false,
      },
    }
  }

  const updated: WorkspaceAssumptionsV2 = {
    ...wsa,
    [wsKey]: [...currentArray, newInst],
  }

  return {
    ...workspace,
    baseline: { ...workspace.baseline, assumptions: updated, lastEditedAt: Date.now() },
  }
}

/**
 * Remove an instance from the baseline by productId + instanceId.  Returns a
 * new workspace without mutating the original.  A no-op if the id is not
 * found.
 *
 * Reference cleanup happens in this one transaction (state contract §5):
 *
 *  1. the instance leaves its product array;
 *  2. `transferEvents` on **every other** instance that named the removed id as
 *     source or target are dropped — otherwise they dangle until the next
 *     reload sweeps them via `isUsableTransferEvent`, and a re-added id could
 *     silently reactivate a transfer the user never asked for;
 *  3. `pinnedComparisonIds` and `visibleInstanceIds` lose the id;
 *  4. what-ifs that referenced the id are **marked stale, never deleted** — the
 *     `frozenAt` marker is cleared so the existing "Baseline hat sich geändert"
 *     badge fires and the user reviews before applying;
 *  5. `baseline.lastEditedAt` is stamped.
 *
 * The workspace array key is resolved via `INVENTORY_PRODUCT_REGISTRY` (issue 09)
 * so the product switch is eliminated here too.
 */
export function removeInstanceFromWorkspace(
  workspace: Workspace,
  productId: 'bav' | 'versicherung' | 'riester' | 'basisrente' | 'altersvorsorgedepot' | 'etf',
  instanceId: string,
): Workspace {
  const wsa = workspace.baseline.assumptions
  const entry = INVENTORY_PRODUCT_REGISTRY[productId]
  const wsKey = entry.wsKey as keyof WorkspaceAssumptionsV2

  const updated: WorkspaceAssumptionsV2 = { ...wsa }
  for (const { key, instances } of eachInstanceArray(wsa)) {
    const kept = key === wsKey ? instances.filter((i) => i.instanceId !== instanceId) : instances
    const cleaned = kept.map((instance) => {
      const events = instance.transferEvents
      if (!events || events.length === 0) return instance
      const remaining = events.filter(
        (event) =>
          event.sourceInstanceId !== instanceId && event.targetInstanceId !== instanceId,
      )
      return remaining.length === events.length ? instance : { ...instance, transferEvents: remaining }
    })
    ;(updated as unknown as Record<string, unknown>)[key as string] = cleaned
  }

  if (wsa.visibleInstanceIds) {
    updated.visibleInstanceIds = wsa.visibleInstanceIds.filter((id) => id !== instanceId)
  }

  return {
    ...workspace,
    baseline: { ...workspace.baseline, assumptions: updated, lastEditedAt: Date.now() },
    whatIfs: workspace.whatIfs.map((whatIf) =>
      whatIf.frozenAt !== undefined &&
      (scenarioReferencesInstance(whatIf.assumptions, instanceId) ||
        scenarioReferencesInstance(whatIf.derivedFromBaselineSnapshot.assumptions, instanceId))
        ? { ...whatIf, frozenAt: undefined }
        : whatIf,
    ),
    pinnedComparisonIds: workspace.pinnedComparisonIds.filter((id) => id !== instanceId),
  }
}
