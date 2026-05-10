/**
 * Pure helpers for the "Optimiere deine Vorsorge" modal (Group B issue B2 + B4).
 *
 * `simulateContractDecision` fills in `deltaMonthlyNetEUR` for a
 * `ContractDecision` by running a hypothetical simulation with the decision
 * applied and diffing the combined `monthlyNetIncome` against a baseline.
 *
 * `createDecisionSimulationCache` wraps that function with a simple
 * `Map<string, DecisionDelta>` keyed by `(workspaceFingerprint, decision.id)`.
 *
 * `auditPortfolio` (B4) aggregates per-instance audit rows for the modal's
 * overview step. Returns one `InstanceAudit` per active/paid-up instance,
 * sorted worst-first by flag severity.
 *
 * React-free: this module must not import React or anything from `src/features/`.
 */

import type { Workspace } from '../domain/workspace'
import type { GermanRules } from '../domain/rules'
import type { CombinedResult } from '../engine/portfolioCombine'
import type { InstanceCommon } from '../domain/instances'
import {
  applyContractDecision,
  generateContractDecisions,
  beitragErhoehenWhatIf,
  defaultBeitragErhoehenEUR,
  type ContractDecision,
} from './contractDecisions'
import { runCombineSimulation } from './useCombineSimulation'
import { runRules, type Atom } from './recommendations'

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
 * `scenarioId` selects which scenario is read out of the applied bundle. The
 * caller MUST pass the same scenario id used to derive `baselineCombined` —
 * otherwise the applied and baseline results live on different return curves
 * and the delta sign-flips on identity decisions (gh#44 Bug A).
 *
 * Engine values are returned raw; rounding belongs at the display layer
 * (`formatCurrency(delta.deltaMonthlyNetEUR, 0)`).
 */
export function simulateContractDecision(
  workspace: Workspace,
  decision: ContractDecision,
  rules: GermanRules,
  baselineCombined: CombinedResult,
  scenarioId: string,
): DecisionDelta {
  // 1. Apply the decision to produce a what-if workspace (deep-cloned).
  const applied = applyContractDecision(workspace, decision)

  // 2. Run the full combine simulation on the what-if workspace.
  const bundle = runCombineSimulation(applied, rules)

  // 3. Read the applied result at the SAME scenarioId the caller used for the
  //    baseline. Falls back to 'basis' then returnScenarios[0] only if the
  //    caller's scenarioId is missing from the applied bundle (e.g. a custom
  //    scenario that didn't survive applyContractDecision) — this fallback
  //    preserves the old behaviour for edge cases but should not be hit in
  //    normal use, since baseline and applied share the same returnScenarios.
  const appliedCombined =
    bundle.combinedByScenarioId[scenarioId] ??
    bundle.combinedByScenarioId['basis'] ??
    bundle.combinedByScenarioId[applied.baseline.assumptions.returnScenarios[0]?.id ?? '']
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
 * Cache key: `(workspaceFingerprint, decision.id, scenarioId)`. The scenarioId
 * is part of the key because the same workspace+decision pair produces
 * different deltas on different return curves — sharing the entry would
 * resurrect the gh#44 sign-flip class as soon as the user switches scenarios
 * via the toolbar pill while the modal is open.
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
    scenarioId: string,
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
      scenarioId: string,
    ): DecisionDelta {
      const fingerprint = workspaceFingerprint(workspace)
      const key = `${fingerprint}::${decision.id}::${scenarioId}`
      const cached = cache.get(key)
      if (cached !== undefined) {
        return cached
      }
      const result = simulateContractDecision(
        workspace,
        decision,
        rules,
        baselineCombined,
        scenarioId,
      )
      cache.set(key, result)
      return result
    },

    invalidate(): void {
      cache.clear()
    },
  }
}

// ---------------------------------------------------------------------------
// B4: auditPortfolio
// ---------------------------------------------------------------------------

/**
 * One audit row per active or paid-up instance in the workspace.
 *
 * Consumed by the "Optimiere deine Vorsorge" modal overview step (B6) to
 * render an ordered list of contract cards with their flags and decisions.
 */
export interface InstanceAudit {
  instance: InstanceCommon
  /** Audit-flag atoms emitted for this specific instance (filtered by instanceId). */
  flags: Atom[]
  /**
   * Generated decisions for this instance.
   * `weiterfuehren | beitragsfrei (if applicable) | kuendigen | uebertragen... | beitrag-erhoehen`
   * `deltaNettoRente === 0` for all — populated by B6 modal via `simulateContractDecision`.
   */
  decisions: ContractDecision[]
}

/**
 * Minimal rules-engine input shape (same three lines used in contractDecisions.ts
 * for its internal `buildRulesInput`). Inlined here per spec to avoid coupling.
 */
function buildRulesInputForAudit(workspace: Workspace) {
  return {
    workspace,
    simulationResult: { products: [] },
    combinedResult: { monthlyNetIncome: 0 } as CombinedResult,
  }
}

/**
 * Severity score for sorting: 3 × high + 2 × medium + 1 × low.
 */
function severityScore(flags: Atom[]): number {
  let score = 0
  for (const flag of flags) {
    if (flag.priority === 'high') score += 3
    else if (flag.priority === 'medium') score += 2
    else score += 1
  }
  return score
}

/**
 * Collect all active and paid-up instances across the six product slots.
 * Excludes `surrendered` and `offered` instances per spec.
 */
function collectActiveInstances(workspace: Workspace): InstanceCommon[] {
  const wsa = workspace.baseline.assumptions
  const slots: readonly InstanceCommon[][] = [
    wsa.bav,
    wsa.etf,
    wsa.insurance,
    wsa.basisrente,
    wsa.altersvorsorgedepot,
    wsa.riester,
  ]
  const result: InstanceCommon[] = []
  for (const arr of slots) {
    for (const inst of arr) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      result.push(inst)
    }
  }
  return result
}

/**
 * Walk every active/paid-up contract in the workspace, attach audit-flag atoms
 * (B3) and decision generators (B1 + B-existing), and return one row per
 * instance sorted worst-first.
 *
 * Sort order:
 *   1. Severity score descending (3×high + 2×medium + 1×low).
 *   2. Tie: flags.length descending.
 *   3. Tie: instanceId ascending (stable alphabetic).
 *
 * `decisions[].deltaNettoRente === 0` for all rows — population is B6's job.
 */
export function auditPortfolio(workspace: Workspace, rules?: GermanRules): InstanceAudit[] {
  void rules  // reserved for future use (B6 simulation pass); rules not needed for flag/decision aggregation
  // Run all audit-flag rules once; filter per instance below.
  const allAtoms = runRules(buildRulesInputForAudit(workspace))

  const instances = collectActiveInstances(workspace)

  const rows: InstanceAudit[] = instances.map((instance) => {
    const instanceId = instance.instanceId

    // 1. Flags: atoms whose context.instanceId matches this instance.
    const flags = allAtoms.filter(
      (a) => (a.context as Record<string, unknown>).instanceId === instanceId,
    )

    // 2. Decisions: existing generators + beitrag-erhoehen appended last.
    const decisions = generateContractDecisions(workspace, instanceId)

    // Determine current monthly contribution for defaultBeitragErhoehenEUR.
    // Each slot stores the contribution under a different field name.
    let currentMonthly = 0
    const inst = instance as unknown as Record<string, unknown>
    // bAV uses monthlyGrossConversion; basisrente uses monthlyGrossContribution;
    // AVD and Riester use monthlyOwnContribution; ETF and insurance use monthlyContribution.
    if (typeof inst.monthlyGrossConversion === 'number') {
      currentMonthly = inst.monthlyGrossConversion
    } else if (typeof inst.monthlyGrossContribution === 'number') {
      currentMonthly = inst.monthlyGrossContribution
    } else if (typeof inst.monthlyOwnContribution === 'number') {
      currentMonthly = inst.monthlyOwnContribution
    } else if (typeof inst.monthlyContribution === 'number') {
      currentMonthly = inst.monthlyContribution
    }

    const newMonthly = defaultBeitragErhoehenEUR(currentMonthly)
    const beitragErhoehen = beitragErhoehenWhatIf(workspace, instanceId, newMonthly)
    if (beitragErhoehen !== null) {
      decisions.push(beitragErhoehen)
    }

    return { instance, flags, decisions }
  })

  // Sort worst-first.
  rows.sort((a, b) => {
    const scoreDiff = severityScore(b.flags) - severityScore(a.flags)
    if (scoreDiff !== 0) return scoreDiff
    const lenDiff = b.flags.length - a.flags.length
    if (lenDiff !== 0) return lenDiff
    return a.instance.instanceId.localeCompare(b.instance.instanceId)
  })

  return rows
}
