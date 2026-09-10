/**
 * Offered bAV contracts have no salary conversion. Apply after merging writes;
 * activation keeps the stored zero until the user enters the real amount.
 * Accepts complete instances and draft patches. Callers must select bAV first.
 */
export function normaliseOfferedBav<T extends object>(instance: T): T {
  return 'status' in instance && instance.status === 'offered'
    ? { ...instance, monthlyGrossConversion: 0 }
    : instance
}
