import type { InstanceCommon } from './instances'

/**
 * Offered bAV contracts have no salary conversion. Apply after merging writes,
 * including metadata: the model zero cannot inherit the discarded value's
 * provenance. Activation keeps it assumed until the user enters a real amount.
 * Accepts complete instances and draft patches. Callers must select bAV first.
 */
export function normaliseOfferedBav<T extends {
  status?: unknown
  inputStatus?: InstanceCommon['inputStatus']
  evidenceMap?: InstanceCommon['evidenceMap']
}>(instance: T): T {
  if (instance.status !== 'offered') return instance
  const normalised = { ...instance, monthlyGrossConversion: 0 }
  if (instance.inputStatus) {
    normalised.inputStatus = { ...instance.inputStatus }
    delete normalised.inputStatus.monthlyGrossConversion
  }
  if (instance.evidenceMap) {
    normalised.evidenceMap = { ...instance.evidenceMap }
    delete normalised.evidenceMap.monthlyGrossConversion
  }
  return normalised
}
