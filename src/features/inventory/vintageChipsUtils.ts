/**
 * Non-React utilities shared between VintageChips.tsx and its consumers.
 * Kept separate to satisfy react-refresh/only-export-components.
 */

import type { AtomId } from '../../app/recommendations'

const PRIVILEGE_ATOM_IDS: ReadonlySet<AtomId> = new Set<AtomId>([
  'pre_2005_pav_taxfree_capital',
  'halbeinkuenfte_pav_eligible',
  'bav_40b_alt_eligible',
])

const CAVEAT_ATOM_IDS: ReadonlySet<AtomId> = new Set<AtomId>([
  'bav_40b_alt_conditions_unmet',
  'pre_2005_pav_high_garantiezins',
  'riester_pre_2008_zulage',
])

export const VINTAGE_ATOM_IDS: ReadonlySet<AtomId> = new Set<AtomId>([
  ...PRIVILEGE_ATOM_IDS,
  ...CAVEAT_ATOM_IDS,
  'bav_durchfuehrungsweg_direktzusage',
])

export function chipVariant(atomId: AtomId): 'privilege' | 'caveat' | 'info' {
  if (PRIVILEGE_ATOM_IDS.has(atomId)) return 'privilege'
  if (CAVEAT_ATOM_IDS.has(atomId)) return 'caveat'
  return 'info'
}

/** Returns true when the atom id is one of the vintage-detection atom ids. */
export function isVintageAtomId(id: AtomId): boolean {
  return VINTAGE_ATOM_IDS.has(id)
}
