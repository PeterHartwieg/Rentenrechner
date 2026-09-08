import type { InstanceCommon } from '../../domain/instances'
import type { ProductId } from '../../domain'
import { PRODUCT_EVIDENCE_FIELDS } from '../../utils/evidence'
import { evidenceStateToProvKind } from '../results/provenanceHelpers'
import type { SensitivityRowResult } from './sensitivitySelectors'

/** Uses existing, applied variants only; never starts a simulation. */
export function largestTestedChange<T extends { result: SensitivityRowResult }>(
  rows: readonly T[],
): T | undefined {
  let largest: T | undefined
  for (const row of rows) {
    const { headlineDelta, perturbedProjectedMonthly, note } = row.result
    // `unchanged` also represents unavailable scenario results in the existing
    // selectors. It is not sufficient evidence that a variant was tested.
    if (note && note !== 'retirement_age_clamped') continue
    if (!Number.isFinite(headlineDelta) || !Number.isFinite(perturbedProjectedMonthly)) continue
    if (!largest || Math.abs(headlineDelta) > Math.abs(largest.result.headlineDelta)) {
      largest = row
    }
  }
  return largest
}

/** Missing evidence remains unknown, distinct from an explicit model estimate. */
export function summarizeContractEvidence(slots: readonly {
  id: ProductId
  instances: readonly Pick<InstanceCommon, 'status' | 'evidenceMap'>[]
}[]) {
  let contracts = 0
  let estimated = 0
  let unknown = 0
  for (const slot of slots) {
    for (const instance of slot.instances) {
      if (instance.status !== 'active' && instance.status !== 'paid_up') continue
      contracts += 1
      for (const field of PRODUCT_EVIDENCE_FIELDS[slot.id]) {
        const kind = evidenceStateToProvKind(instance.evidenceMap?.[field])
        if (kind === 'model') estimated += 1
        if (kind === 'default') unknown += 1
      }
    }
  }
  return { contracts, estimated, unknown }
}
