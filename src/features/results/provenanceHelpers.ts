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
import type { InputStatus, InputStatusMap } from '../../domain/inputStatus'
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
 * | undefined / null  | `Keine Angabe`|
 *
 * `undefined` means *no metadata at all* and exports as `Keine Angabe`. An
 * explicit "weiß ich nicht" is a different thing and exports as `Unbekannt`
 * via `formatInputStatusForExport` (state contract §2.3 / lead decision §10.4).
 */
export function formatEvidenceStateForExport(
  state: EvidenceState | undefined | null,
): string {
  if (state === 'user_confirmed') return 'Bestätigt'
  if (state === 'statement') return 'lt. Beleg'
  if (state === 'model_estimate') return 'Schätzwert'
  return 'Keine Angabe'
}

// ---------------------------------------------------------------------------
// InputStatus bridge (state contract §2.3)
//
// `inputStatus` is authoritative when present; `evidenceMap` is the fallback.
// `evidenceMap` stays the write target for the existing evidence surfaces, so
// nothing regresses while both live side by side.
// ---------------------------------------------------------------------------

/**
 * Map an `InputStatus` to the `EvidenceState` that should be written alongside
 * it. `'unknown'` has no evidence counterpart — callers must **delete**
 * `evidenceMap[key]` when they write an `'unknown'` status.
 */
export function inputStatusToEvidenceState(status: InputStatus): EvidenceState | undefined {
  if (status === 'entered') return 'user_confirmed'
  if (status === 'document') return 'statement'
  if (status === 'assumed') return 'model_estimate'
  return undefined
}

/**
 * Map a legacy `EvidenceState` to an `InputStatus`.
 *
 * Binding legacy fallback rule: absent evidence resolves to `'assumed'` —
 * never `'unknown'` (which would claim the user declined) and never
 * `'entered'` (which would claim a default is user-supplied).
 */
export function evidenceStateToInputStatus(
  evidence: EvidenceState | undefined | null,
): InputStatus {
  if (evidence === 'statement') return 'document'
  if (evidence === 'user_confirmed') return 'entered'
  return 'assumed'
}

/**
 * Map an `InputStatus` to the display-layer `ProvKind`.
 *
 * `'document'` and `'entered'` both read as trustworthy (`'confirmed'`), which
 * matches `evidenceStateToProvKind`'s treatment of `'statement'` /
 * `'user_confirmed'`.
 */
export function inputStatusToProvKind(status: InputStatus): ProvKind {
  if (status === 'unknown') return 'unknown'
  if (status === 'assumed') return 'model'
  return 'confirmed'
}

/**
 * German export label for an `InputStatus`.
 *
 * | InputStatus | Label        |
 * |-------------|--------------|
 * | `unknown`   | `Unbekannt`  |
 * | `assumed`   | `Schätzwert` |
 * | `entered`   | `Bestätigt`  |
 * | `document`  | `lt. Beleg`  |
 *
 * Absent metadata is the caller's `formatEvidenceStateForExport(undefined)`
 * case and prints `Keine Angabe`.
 */
export function formatInputStatusForExport(status: InputStatus): string {
  if (status === 'unknown') return 'Unbekannt'
  if (status === 'assumed') return 'Schätzwert'
  if (status === 'document') return 'lt. Beleg'
  return 'Bestätigt'
}

/**
 * Single export-label entry point for a field that may carry either the new
 * `InputStatus` metadata, a legacy `EvidenceState`, or nothing at all.
 *
 * | input                        | label          |
 * |------------------------------|----------------|
 * | explicit status `'unknown'`  | `Unbekannt`    |
 * | explicit status / evidence   | its own label  |
 * | neither                      | `Keine Angabe` |
 *
 * The `Keine Angabe` / `Unbekannt` split is the whole point: an export must not
 * make "we never asked" look like "the user said they don't know"
 * (lead decision §10.4). CSV and PDF both route through this function.
 */
export function formatExportProvenance(
  status: InputStatus | undefined,
  evidence: EvidenceState | undefined | null,
): string {
  if (status !== undefined) return formatInputStatusForExport(status)
  if (evidence === undefined || evidence === null) return 'Keine Angabe'
  return formatInputStatusForExport(evidenceStateToInputStatus(evidence))
}

/**
 * Resolve the effective status of one field.
 *
 * Precedence: explicit `inputStatus[key]` → mapped `evidenceMap` value →
 * `'assumed'`. Reading never writes; opening a screen must not stamp metadata.
 */
export function resolveInputStatus(
  map: InputStatusMap | undefined,
  evidence: EvidenceState | undefined,
  key: string,
): InputStatus {
  const explicit = map?.[key]
  if (explicit !== undefined) return explicit
  return evidenceStateToInputStatus(evidence)
}
