import type { InstanceCommon } from '../../domain/instances'
import type { ProductId } from '../../domain'
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

/**
 * Read only recorded markers. Evidence keys vary between input paths, so missing
 * registry keys cannot establish either a field count or an unknown origin.
 */
export function summarizeContractEvidence(slots: readonly {
  id: ProductId
  instances: readonly Pick<InstanceCommon, 'status' | 'evidenceMap'>[]
}[]) {
  let contracts = 0
  let hasExplicitEstimates = false
  let hasConfirmedInputs = false
  for (const slot of slots) {
    for (const instance of slot.instances) {
      if (instance.status !== 'active' && instance.status !== 'paid_up') continue
      contracts += 1
      for (const state of Object.values(instance.evidenceMap ?? {})) {
        const kind = evidenceStateToProvKind(state)
        if (kind === 'model') hasExplicitEstimates = true
        if (kind === 'confirmed') hasConfirmedInputs = true
      }
    }
  }
  return { contracts, hasExplicitEstimates, hasConfirmedInputs }
}
