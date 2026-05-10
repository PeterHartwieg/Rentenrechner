/**
 * composeInstanceEvidenceMaps — flatten a workspace's per-instance evidenceMaps
 * across all product arrays into a single `instanceId → evidenceMap` lookup.
 *
 * Consumed by `CombineIncomePanel` so the "Teilweise geschätzt" badge predicate
 * can distinguish *explicit* `model_estimate` evidence from *absent* fields
 * (issue #111). Without this lookup the panel falls back to
 * `ProductResult.inputConfidence`, which `lowestConfidence` returns as
 * `model_estimate` for any absent field — causing false positives on
 * "übernommen" / zero-value instances.
 *
 * Pure, React-free.
 */

import type { Workspace } from '../domain/workspace'
import type { EvidenceState } from '../domain/instances'

export function composeInstanceEvidenceMaps(
  workspace: Workspace,
): Record<string, Record<string, EvidenceState>> {
  const a = workspace.baseline.assumptions
  const result: Record<string, Record<string, EvidenceState>> = {}
  for (const inst of [
    ...a.bav,
    ...a.etf,
    ...a.insurance,
    ...a.basisrente,
    ...a.altersvorsorgedepot,
    ...a.riester,
  ]) {
    result[inst.instanceId] = inst.evidenceMap
  }
  return result
}
