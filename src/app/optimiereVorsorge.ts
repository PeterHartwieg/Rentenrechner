/**
 * Pure helpers for the "Optimiere deine Vorsorge" modal (Group B issue B2).
 *
 * `simulateContractDecision` fills in `deltaMonthlyNetEUR` for a
 * `ContractDecision` by running a hypothetical simulation with the decision
 * applied and diffing the combined `monthlyNetIncome` against a baseline.
 *
 * `createDecisionSimulationCache` wraps that function with a simple
 * `Map<string, DecisionDelta>` keyed by `(workspaceFingerprint, decision.id)`.
 *
 * React-free: this module must not import React or anything from `src/features/`.
 */

import type { Workspace } from '../domain/workspace'
import type { GermanRules } from '../domain/rules'
import type { CombinedResult } from '../engine/portfolioCombine'
import { applyContractDecision, type ContractDecision } from './contractDecisions'
import { runCombineSimulation } from './useCombineSimulation'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DecisionDelta {
  /** Raw EUR/month change in combined Netto-Rente vs. baseline. Unrounded. */
  deltaMonthlyNetEUR: number
}

// ---------------------------------------------------------------------------
// Workspace fingerprint
// ---------------------------------------------------------------------------

/**
 * Produce a cache key for the workspace's baseline assumptions.
 *
 * We stringify the workspace's baseline assumptions because they are the sole
 * driver of simulation output — the profile also matters, but
 * `runCombineSimulation` reads it from `workspace.baseline.profile`, so
 * stringifying the whole `baseline` covers both.
 *
 * `JSON.stringify` is deterministic for plain objects (no Maps / Sets / dates
 * in assumptions), which is the case for our domain types. If the workspace
 * changes, the fingerprint changes, so cache keys from an old workspace are
 * automatically orphaned when the caller calls `invalidate()`.
 */
export function workspaceFingerprint(workspace: Workspace): string {
  return JSON.stringify(workspace.baseline)
}

// ---------------------------------------------------------------------------
// Core simulation helper
// ---------------------------------------------------------------------------

/**
 * Apply `decision` to `workspace`, re-run the combine simulation, and return
 * the EUR/month delta in combined Netto-Rente vs. `baselineCombined`.
 *
 * The baseline combined result for a specific scenarioId is compared against
 * the applied-decision result for the same scenarioId. The first return
 * scenario in the workspace is used as the reference (typically "basis").
 *
 * Engine values are returned raw; rounding belongs at the display layer
 * (`formatCurrency(delta.deltaMonthlyNetEUR, 0)`).
 */
export function simulateContractDecision(
  workspace: Workspace,
  decision: ContractDecision,
  rules: GermanRules,
  baselineCombined: CombinedResult,
): DecisionDelta {
  // 1. Apply the decision to produce a what-if workspace (deep-cloned).
  const applied = applyContractDecision(workspace, decision)

  // 2. Run the full combine simulation on the what-if workspace.
  const bundle = runCombineSimulation(applied, rules)

  // 3. Pick the first return scenario as the reference scenario (same as
  //    the UI default "basis" scenario). If the workspace has no scenarios
  //    we return a zero delta (degenerate case).
  const firstScenario = applied.baseline.assumptions.returnScenarios[0]
  if (!firstScenario) {
    return { deltaMonthlyNetEUR: 0 }
  }

  const appliedCombined = bundle.combinedByScenarioId[firstScenario.id]
  if (!appliedCombined) {
    return { deltaMonthlyNetEUR: 0 }
  }

  const delta = appliedCombined.monthlyNetIncome - baselineCombined.monthlyNetIncome
  return { deltaMonthlyNetEUR: delta }
}

// ---------------------------------------------------------------------------
// Decision simulation cache
// ---------------------------------------------------------------------------

/**
 * Create a per-modal memoisation cache for `simulateContractDecision`.
 *
 * Cache key: `(workspaceFingerprint, decision.id)`.
 *
 * The modal in B6 calls `cache.get(...)` lazily per decision card, so the
 * initial render is instant and simulation runs only when the user opens a
 * specific decision. Repeated calls with the same key return the same object
 * reference without re-running `runCombineSimulation`.
 *
 * `invalidate()` clears the entire cache — the B6 modal calls this whenever
 * the workspace changes underneath the modal (e.g. auto-refresh).
 *
 * No LRU, no expiry — the modal lifetime is short (~25 decisions worst-case).
 */
export function createDecisionSimulationCache(): {
  get: (
    workspace: Workspace,
    decision: ContractDecision,
    rules: GermanRules,
    baselineCombined: CombinedResult,
  ) => DecisionDelta
  invalidate: () => void
} {
  const cache = new Map<string, DecisionDelta>()

  return {
    get(
      workspace: Workspace,
      decision: ContractDecision,
      rules: GermanRules,
      baselineCombined: CombinedResult,
    ): DecisionDelta {
      const fingerprint = workspaceFingerprint(workspace)
      const key = `${fingerprint}::${decision.id}`
      const cached = cache.get(key)
      if (cached !== undefined) {
        return cached
      }
      const result = simulateContractDecision(workspace, decision, rules, baselineCombined)
      cache.set(key, result)
      return result
    },

    invalidate(): void {
      cache.clear()
    },
  }
}
