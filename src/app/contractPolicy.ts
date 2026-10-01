/**
 * Shared contract-lifecycle policy that is independent of recommendation and
 * decision orchestration. Keeping these defaults here prevents those two app
 * modules from importing each other.
 */

export const DEFAULT_HAIRCUT_BY_PREFIX: Record<string, number> = {
  'versicherung-': 0.10,
  'bav-': 0.05,
  'riester-': 0.15,
  'altersvorsorgedepot-': 0.10,
  'etf-': 0.00,
}

export function defaultHaircutFor(instanceId: string): number {
  for (const [prefix, pct] of Object.entries(DEFAULT_HAIRCUT_BY_PREFIX)) {
    if (instanceId.startsWith(prefix)) return pct
  }
  return 0.10
}
