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
  | { kind: 'contribution'; monthly: number; /** Set by `buildContributionWhatIf`. */ unchanged?: boolean }
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

/** Review the named offer at its quoted contribution; never activate the baseline. */
export function buildOfferActivationWhatIf(workspace: Workspace, instanceId: string): WhatIfScenario | null {
  const entry = findEntry(workspace, instanceId)
  if (!entry || entry.instance.status !== 'offered') return null
  const alternative = forkBaselineScenario(workspace.baseline, `${entry.instance.label}: Angebot aufnehmen`, 'manual')
  const target = listWorkspaceInstances(alternative.assumptions).find(item => item.instance.instanceId === instanceId)
  if (!target) return null
  target.instance.status = 'active'
  return alternative
}

/** German label for a preview, per the §4 copy table. */
export function whatIfLabel(instanceLabel: string, change: WhatIfChange): string {
  if (change.kind === 'paid_up') return `${instanceLabel}: keine weiteren Beiträge`
  const amount = `${formatCurrency(change.monthly)} Beitrag / Monat`
  return `${instanceLabel}: ${amount}${change.unchanged ? ' (unverändert)' : ''}`
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
  const unchanged =
    change.kind === 'contribution' &&
    contributionOf(entry.productId, entry.instance) === change.monthly
  const label = whatIfLabel(
    entry.instance.label || instanceId,
    change.kind === 'contribution' ? { ...change, unchanged } : change,
  )

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

export type WhatIfDecisionKind = 'contribution' | 'paid_up' | 'activate_offer' | 'new_contract' | 'other'

export interface WhatIfDescription {
  instanceId: string | null
  instanceLabel: string | null
  productId: ProductId | null
  decision: WhatIfDecisionKind
  /**
   * Whether the alternative actually differs from its snapshot. `false` for an
   * alternative that re-states the contribution the contract already has — the
   * decision kind is still reported, so the UI can say "unverändert" instead of
   * "unbekannt".
   */
  changed: boolean
  /** Monthly contribution in the frozen baseline snapshot. */
  beforeContributionMonthly: number | null
  /** Monthly contribution inside the alternative. */
  afterContributionMonthly: number | null
  /** Original quoted contribution when activating an unsigned offer. */
  quotedContributionMonthly?: number | null
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

interface WhatIfSubject {
  instanceId: string
  instanceLabel: string | null
  decision: Exclude<WhatIfDecisionKind, 'other'>
}

/**
 * Which contract a saved alternative is about.
 *
 * A real diff identifies it unambiguously, so that is tried first. When the
 * alternative changes nothing — the user re-stated the contribution they
 * already pay — there is no diff to read, and the subject is recovered from the
 * fork label (`whatIfLabel` writes `"<Vertrag>: …"`). That fallback is what
 * keeps an unchanged alternative from degrading to "unbekannt / unbekannt".
 */
function findSubject(
  whatIf: WhatIfScenario,
  before: Map<string, { productId: ProductId; instance: AnyWorkspaceInstance }>,
  after: Map<string, { productId: ProductId; instance: AnyWorkspaceInstance }>,
): WhatIfSubject | null {
  for (const [instanceId, entry] of after) {
    const previous = before.get(instanceId)
    if (!previous) return { instanceId, instanceLabel: entry.instance.label ?? null, decision: 'new_contract' }
    if (previous.instance.status === 'offered' && entry.instance.status === 'active') {
      return { instanceId, instanceLabel: entry.instance.label ?? null, decision: 'activate_offer' }
    }
  }
  for (const [instanceId, entry] of after) {
    const previous = before.get(instanceId)
    if (!previous) continue
    if (previous.instance.status !== 'paid_up' && entry.instance.status === 'paid_up') {
      return { instanceId, instanceLabel: entry.instance.label ?? null, decision: 'paid_up' }
    }
  }
  for (const [instanceId, entry] of after) {
    const previous = before.get(instanceId)
    if (!previous) continue
    const from = contributionOf(previous.productId, previous.instance)
    const to = contributionOf(entry.productId, entry.instance)
    if (from !== null && to !== null && from !== to) {
      return { instanceId, instanceLabel: entry.instance.label ?? null, decision: 'contribution' }
    }
  }

  const label = whatIf.label ?? ''
  for (const [instanceId, entry] of after) {
    const name = entry.instance.label || instanceId
    if (!name || !label.startsWith(`${name}:`)) continue
    return {
      instanceId,
      instanceLabel: entry.instance.label ?? null,
      decision: label.includes('keine weiteren Beiträge') ? 'paid_up' : 'contribution',
    }
  }
  return null
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
  const after = new Map(
    listWorkspaceInstances(whatIf.assumptions).map((e) => [e.instance.instanceId, e]),
  )

  const sourceRevision = {
    baselineId: whatIf.derivedFromBaselineId,
    createdAt: whatIf.createdAt,
    snapshotTime: whatIfSnapshotTime(whatIf),
    frozenAt: whatIf.frozenAt,
  }

  const subject = findSubject(whatIf, before, after)
  if (!subject) {
    return {
      instanceId: null,
      instanceLabel: null,
      productId: null,
      decision: 'other',
      changed: false,
      beforeContributionMonthly: null,
      afterContributionMonthly: null,
      sourceRevision,
    }
  }

  // Both amounts are read straight off the two instances, never off the diff:
  // an alternative that re-states the current contribution (150 -> 150) still
  // has a before and an after to show, it just has not changed anything.
  const previous = before.get(subject.instanceId) ?? null
  const current = after.get(subject.instanceId) ?? null
  const beforeContribution = subject.decision === 'activate_offer' || subject.decision === 'new_contract'
    ? 0 : previous
    ? contributionOf(previous.productId, previous.instance)
    : null
  const afterContribution = current ? contributionOf(current.productId, current.instance) : null
  const changed =
    subject.decision === 'paid_up' || subject.decision === 'activate_offer' || subject.decision === 'new_contract' ||
    (beforeContribution !== null &&
      afterContribution !== null &&
      beforeContribution !== afterContribution)

  return {
    instanceId: subject.instanceId,
    instanceLabel:
      current?.instance.label || previous?.instance.label || subject.instanceLabel || null,
    productId: current?.productId ?? previous?.productId ?? null,
    decision: subject.decision,
    changed,
    beforeContributionMonthly: beforeContribution,
    afterContributionMonthly: afterContribution,
    ...(subject.decision === 'activate_offer' && previous
      ? { quotedContributionMonthly: contributionOf(previous.productId, previous.instance) } : {}),
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
  if (description.decision !== 'new_contract' && description.instanceId !== null && findEntry(workspace, description.instanceId) === null) {
    return 'missing-source'
  }
  if (!productArrayShapeMatches(whatIf.derivedFromBaselineSnapshot, baseline)) {
    return 'shape-drift'
  }
  if (whatIfIsStale(whatIf, baseline)) return 'stale'
  return 'current'
}
