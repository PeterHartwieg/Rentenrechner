/**
 * Shared inventory field helpers and option tables.
 *
 * Non-component exports live here (separate file) so the
 * react-refresh/only-export-components ESLint rule is satisfied for
 * the component file (fields.tsx). Issue 10 (architecture-readability).
 */

import type { BavDurchfuehrungsweg } from '../../domain/products/bav'

// ---------------------------------------------------------------------------
// toNumber
// ---------------------------------------------------------------------------

/**
 * Parse a string to number, returning `fallback` when the result is not
 * finite. Used by sidebar numeric inputs that don't need full commit logic.
 */
export function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// ---------------------------------------------------------------------------
// Shared option tables
// ---------------------------------------------------------------------------

export const PAYOUT_OPTIONS_FULL: readonly { value: string; label: string }[] = [
  { value: 'leibrente', label: 'Lebenslange Rente (Leibrente)' },
  { value: 'zeitrente', label: 'Zeitrente (befristet)' },
  { value: 'kapitalverzehr', label: 'Kapitalentnahme' },
] as const

export const PAYOUT_OPTIONS_NO_KAPITAL: readonly { value: string; label: string }[] = [
  { value: 'leibrente', label: 'Lebenslange Rente (Leibrente)' },
  { value: 'zeitrente', label: 'Zeitrente (befristet)' },
] as const

export const DFW_OPTIONS: readonly { value: BavDurchfuehrungsweg; label: string }[] = [
  { value: 'direktversicherung_3_63', label: 'Direktversicherung (§3 Nr. 63 EStG, ab 2005)' },
  { value: 'pensionskasse_3_63', label: 'Pensionskasse' },
  { value: 'pensionsfonds_3_63', label: 'Pensionsfonds' },
  { value: 'direktversicherung_40b_alt', label: 'Direktversicherung Altvertrag (vor 2005)' },
  { value: 'direktzusage', label: 'Direktzusage' },
  { value: 'unterstuetzungskasse', label: 'Unterstützungskasse' },
] as const
