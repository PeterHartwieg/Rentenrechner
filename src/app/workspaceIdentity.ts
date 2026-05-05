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
import { INVENTORY_PRODUCT_REGISTRY } from '../features/inventory/inventoryProductRegistry'

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
  const newInst = entry.createDefault(CURRENT_YEAR, n, newInstanceId)

  const updated: WorkspaceAssumptionsV2 = {
    ...wsa,
    [wsKey]: [...currentArray, newInst],
  }

  return {
    ...workspace,
    baseline: { ...workspace.baseline, assumptions: updated },
  }
}

/**
 * Remove an instance from the baseline by productId + instanceId.  Returns a
 * new workspace without mutating the original.  A no-op if the id is not
 * found.
 *
 * Pinned comparison ids that referenced the removed instance are cleaned up.
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
  const currentArray = wsa[wsKey] as Array<{ instanceId: string }>
  const filtered = currentArray.filter((i) => i.instanceId !== instanceId)

  const updated: WorkspaceAssumptionsV2 = {
    ...wsa,
    [wsKey]: filtered,
  }

  return {
    ...workspace,
    baseline: { ...workspace.baseline, assumptions: updated },
    pinnedComparisonIds: workspace.pinnedComparisonIds.filter((id) => id !== instanceId),
  }
}
