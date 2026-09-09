/**
 * What-if preview construction — the "try a change" flow (Phase 3).
 *
 * Pure and React-free. Builds the *alternative* side of a before/after preview
 * as a real `WhatIfScenario` forked from the baseline. Nothing here simulates:
 * the caller runs `runCombineSimulation` twice, once on the baseline and once
 * on the returned what-if, so both sides come from the same engine and the same
 * money basis. That separation is what keeps the preview honest — there is no
 * second, approximate arithmetic path for "after".
 *
 * The baseline is never touched. `forkBaselineScenario` deep-clones it, and the
 * paid-up branch goes through `applyContractDecision`, which also deep-clones.
 * Returning to the plan therefore cannot apply anything; only
 * `usePortfolioState().applyWhatIf` writes to the baseline.
 */

import type { ProductId } from '../domain'
import type { Scenario, WhatIfScenario, Workspace } from '../domain/workspace'
import { formatCurrency } from '../utils/format'
import { applyContractDecision, beitragsfreiWhatIf } from './contractDecisions'
import {
  forkBaselineScenario,
  productArrayShapeMatches,
  whatIfIsStale,
  whatIfSnapshotTime,
} from './portfolioState'
import {
  CONTRIBUTION_FIELD_BY_PRODUCT,
  listWorkspaceInstances,
  type AnyWorkspaceInstance,
} from './resultReadiness'

/** The two changes the "try a change" flow offers (implementation plan, "Alternatives"). */
export type WhatIfChange =
  | { kind: 'contribution'; monthly: number }
  | { kind: 'paid_up' }

function findEntry(
  workspace: Workspace,
  instanceId: string,
): { productId: ProductId; instance: AnyWorkspaceInstance } | null {
  for (const entry of listWorkspaceInstances(workspace.baseline.assumptions)) {
    if (entry.instance.instanceId === instanceId) return entry
  }
  return null
}

function contributionOf(
  productId: ProductId,
  instance: AnyWorkspaceInstance,
): number | null {
  const field = CONTRIBUTION_FIELD_BY_PRODUCT[productId]
  const value = (instance as unknown as Record<string, unknown>)[field]
  return typeof value === 'number' ? value : null
}

/** German label for a preview, per the §4 copy table. */
export function whatIfLabel(instanceLabel: string, change: WhatIfChange): string {
  return change.kind === 'paid_up'
    ? `${instanceLabel}: keine weiteren Beiträge`
    : `${instanceLabel}: ${formatCurrency(change.monthly)} Beitrag / Monat`
}

/**
 * Fork a what-if that applies one contract change.
 *
 * Returns `null` when the instance is not in the plan, or when a contribution
 * change carries a value the engine cannot use (non-finite or negative). A
 * contribution of `0` is allowed and is *not* the same as beitragsfrei: it
 * leaves the contract active with no inflow, whereas `paid_up` switches the
 * simulators to the paid-up fee model.
 */
export function buildContributionWhatIf(
  workspace: Workspace,
  instanceId: string,
  change: WhatIfChange,
): WhatIfScenario | null {
  const entry = findEntry(workspace, instanceId)
  if (!entry) return null
  const label = whatIfLabel(entry.instance.label || instanceId, change)

  if (change.kind === 'paid_up') {
    // Reuse the shipped decision rather than re-deriving what "beitragsfrei"
    // means: `applyContractDecision` owns the status flip, the paid-up fee
    // model and the carried capital.
    const decision = beitragsfreiWhatIf(workspace, instanceId)
    const applied = applyContractDecision(workspace, decision)
    const whatIf = forkBaselineScenario(workspace.baseline, label, 'manual')
    return { ...whatIf, assumptions: applied.baseline.assumptions }
  }

  if (!Number.isFinite(change.monthly) || change.monthly < 0) return null

  const whatIf = forkBaselineScenario(workspace.baseline, label, 'manual')
  const field = CONTRIBUTION_FIELD_BY_PRODUCT[entry.productId]
  let written = false
  for (const candidate of listWorkspaceInstances(whatIf.assumptions)) {
    if (candidate.instance.instanceId !== instanceId) continue
    ;(candidate.instance as unknown as Record<string, unknown>)[field] = change.monthly
    written = true
  }
  return written ? whatIf : null
}

// ---------------------------------------------------------------------------
// Describing a saved alternative
// ---------------------------------------------------------------------------

export type WhatIfDecisionKind = 'contribution' | 'paid_up' | 'other'

export interface WhatIfDescription {
  instanceId: string | null
  instanceLabel: string | null
  productId: ProductId | null
  decision: WhatIfDecisionKind
  /** Monthly contribution in the frozen baseline snapshot. */
  beforeContributionMonthly: number | null
  /** Monthly contribution inside the alternative. */
  afterContributionMonthly: number | null
  /**
   * The plan revision the frozen before/after was computed on — the
   * "Stand beim Speichern" the saved-alternatives list shows.
   */
  sourceRevision: {
    baselineId: string
    /** ISO timestamp of the fork. */
    createdAt: string
    /** Millisecond stamp of the snapshot; compare against `baseline.lastEditedAt`. */
    snapshotTime: number
    /** Set when the user chose "Snapshot beibehalten". */
    frozenAt?: number
  }
}

/**
 * Recover what a saved alternative actually changed, by diffing it against its
 * own frozen snapshot.
 *
 * Reading it back out of the scenario rather than storing a parallel "decision"
 * record means a rebased alternative still describes itself correctly, and a
 * hand-edited one cannot claim a change it does not contain.
 */
export function describeWhatIf(whatIf: WhatIfScenario): WhatIfDescription {
  const snapshot = whatIf.derivedFromBaselineSnapshot
  const before = new Map(
    listWorkspaceInstances(snapshot.assumptions).map((e) => [e.instance.instanceId, e]),
  )

  const sourceRevision = {
    baselineId: whatIf.derivedFromBaselineId,
    createdAt: whatIf.createdAt,
    snapshotTime: whatIfSnapshotTime(whatIf),
    frozenAt: whatIf.frozenAt,
  }

  for (const after of listWorkspaceInstances(whatIf.assumptions)) {
    const previous = before.get(after.instance.instanceId)
    if (!previous) continue

    const beforeContribution = contributionOf(previous.productId, previous.instance)
    const afterContribution = contributionOf(after.productId, after.instance)
    const paidUp =
      previous.instance.status !== 'paid_up' && after.instance.status === 'paid_up'
    const contributionChanged =
      beforeContribution !== null &&
      afterContribution !== null &&
      beforeContribution !== afterContribution

    if (!paidUp && !contributionChanged) continue

    return {
      instanceId: after.instance.instanceId,
      instanceLabel: after.instance.label || previous.instance.label || null,
      productId: after.productId,
      decision: paidUp ? 'paid_up' : 'contribution',
      beforeContributionMonthly: beforeContribution,
      afterContributionMonthly: afterContribution,
      sourceRevision,
    }
  }

  return {
    instanceId: null,
    instanceLabel: null,
    productId: null,
    decision: 'other',
    beforeContributionMonthly: null,
    afterContributionMonthly: null,
    sourceRevision,
  }
}

/**
 * How a saved alternative relates to the plan as it stands now.
 *
 *  - `missing-source`  — the contract it changes is gone from the plan
 *    ("Diese Vorsorge ist nicht mehr in deinem Plan.", §4 copy).
 *  - `shape-drift`     — contracts were added or removed, so the index-matched
 *    diff can no longer be trusted. Neither apply nor rebase is safe.
 *  - `stale`           — the plan moved since the alternative was saved
 *    ("Dein Plan hat sich seit dem Speichern geändert."). Rebase, then review.
 *  - `current`         — safe to apply.
 *
 * Reported in that order: the most specific, least recoverable condition wins,
 * because that is the one the user has to act on.
 */
export function whatIfStatus(
  whatIf: WhatIfScenario,
  workspace: Workspace,
): 'current' | 'stale' | 'shape-drift' | 'missing-source' {
  const baseline: Scenario = workspace.baseline
  const description = describeWhatIf(whatIf)
  if (description.instanceId !== null && findEntry(workspace, description.instanceId) === null) {
    return 'missing-source'
  }
  if (!productArrayShapeMatches(whatIf.derivedFromBaselineSnapshot, baseline)) {
    return 'shape-drift'
  }
  if (whatIfIsStale(whatIf, baseline)) return 'stale'
  return 'current'
}
