/**
 * Shared inventory field helpers and option tables.
 *
 * Non-component exports live here (separate file) so the
 * react-refresh/only-export-components ESLint rule is satisfied for
 * the component file (fields.tsx). Issue 10 (architecture-readability).
 */

import { useState, useCallback } from 'react'
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
// useDraftNumber
// ---------------------------------------------------------------------------

/**
 * Draft-before-commit pattern for numeric inputs.
 *
 * Keeps a transient string draft while the user is editing, and calls
 * `onCommit` only on blur or Enter (discarding empty / non-finite strings
 * so a mid-deletion empty field never commits zero to state).
 *
 * Usage:
 *   const { inputProps } = useDraftNumber({ value, onCommit: (n) => ... })
 *   <input type="number" {...inputProps} />
 */
export function useDraftNumber({
  value,
  onCommit,
}: {
  value: number
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = useCallback(() => {
    if (draft === null) return
    const raw = draft
    setDraft(null)
    // Discard empty or non-finite strings — the field reverts to the
    // canonical value and the engine value is preserved.
    if (raw.trim() === '' || !Number.isFinite(Number(raw))) return
    onCommit(Number(raw))
  }, [draft, onCommit])

  const displayValue = draft ?? String(value)

  const inputProps = {
    value: displayValue,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commit()
        e.currentTarget.blur()
      }
    },
  }

  return { inputProps }
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
