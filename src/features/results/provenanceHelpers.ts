/**
 * Shared evidence/provenance presentation vocabulary (architecture-readability issue 13).
 *
 * Pure module — no React imports, no DOM access.
 *
 * This module is the **single mapping layer** between the domain
 * `EvidenceState` type (from `src/domain/instances.ts`) and the display-layer
 * concepts used across the UI:
 *
 *   - `evidenceStateToProvKind` — maps EvidenceState → ProvKind for use by
 *     `ProvLabel`, `CombineDetailView`, and any future evidence-bearing surface.
 *   - `formatEvidenceStateForExport` — maps EvidenceState → a short German
 *     string for CSV/PDF exports (never the raw English domain key).
 *
 * ## Shared confidence vocabulary
 *
 * `EvidenceState` (domain type in `src/domain/instances.ts`):
 *   - `'user_confirmed'` — user explicitly entered or confirmed this value.
 *   - `'model_estimate'`  — value was defaulted by the model; not yet reviewed.
 *   - `'statement'`       — value was read from a document (Renteninformation,
 *                           PIB, etc.); counts as confirmed.
 *
 * `ProvKind` (display type in `provenance.tsx`):
 *   - `'user'`      — user explicitly modified the field away from default.
 *   - `'confirmed'` — user confirmed (or statement) without modifying.
 *   - `'model'`     — model estimate, not yet reviewed.
 *   - `'default'`   — system default, no evidence at all.
 */

import type { EvidenceState } from '../../domain/instances'
import type { ProvKind } from './provenance'

// ---------------------------------------------------------------------------
// evidenceStateToProvKind
// ---------------------------------------------------------------------------

/**
 * Map a domain `EvidenceState` to its display-layer `ProvKind`.
 *
 * `'user_confirmed'` and `'statement'` both produce `'confirmed'` because
 * from the user's perspective both mean "this value is trustworthy."
 * `'model_estimate'` produces `'model'`.
 *
 * The `'default'` kind is reserved for result-side fields that have no
 * evidence at all (no instance, legacy compare-mode). Pass `undefined` or
 * `null` to get `'default'`.
 *
 * All surfaces (inventory badges, result provenance pills, combine-detail
 * table, CSV export) should route through this function rather than
 * implementing their own ad-hoc mapping.
 */
export function evidenceStateToProvKind(
  state: EvidenceState | undefined | null,
): ProvKind {
  if (state === 'user_confirmed' || state === 'statement') return 'confirmed'
  if (state === 'model_estimate') return 'model'
  return 'default'
}

// ---------------------------------------------------------------------------
// formatEvidenceStateForExport
// ---------------------------------------------------------------------------

/**
 * Format an `EvidenceState` as a short German label for export surfaces
 * (CSV columns, PDF headers).
 *
 * Returns a human-readable German string — never the raw English domain value.
 *
 * | EvidenceState     | German label  |
 * |-------------------|---------------|
 * | `user_confirmed`  | `Bestätigt`   |
 * | `statement`       | `lt. Beleg`   |
 * | `model_estimate`  | `Schätzwert`  |
 * | undefined / null  | `Unbekannt`   |
 */
export function formatEvidenceStateForExport(
  state: EvidenceState | undefined | null,
): string {
  if (state === 'user_confirmed') return 'Bestätigt'
  if (state === 'statement') return 'lt. Beleg'
  if (state === 'model_estimate') return 'Schätzwert'
  return 'Unbekannt'
}
