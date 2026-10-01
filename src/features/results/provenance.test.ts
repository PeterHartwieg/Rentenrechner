/**
 * Tests for the shared evidence/provenance presentation vocabulary (issue 13).
 *
 * Coverage:
 *   - `evidenceStateToProvKind`: maps EvidenceState → ProvKind for all three
 *     domain values, plus undefined/null.
 *   - `formatEvidenceStateForExport`: produces German labels for all three
 *     domain values, plus undefined/null.
 *   - Guardrail: estimated values are never mapped to confirmed kind.
 *   - Guardrail: confirmed/statement values are never mapped to model kind.
 *   - Guardrail: raw English domain keys never appear in export output.
 */

import { describe, it, expect } from 'vitest'
import {
  evidenceStateToInputStatus,
  evidenceStateToProvKind,
  formatEvidenceStateForExport,
  formatExportProvenance,
  formatInputStatusForExport,
  inputStatusToEvidenceState,
  inputStatusToProvKind,
  resolveInputStatus,
} from './provenanceHelpers'
import type { EvidenceState } from '../../domain/instances'

// ---------------------------------------------------------------------------
// evidenceStateToProvKind
// ---------------------------------------------------------------------------

describe('evidenceStateToProvKind', () => {
  it('user_confirmed → confirmed', () => {
    expect(evidenceStateToProvKind('user_confirmed')).toBe('confirmed')
  })

  it('statement → confirmed (statement counts as confirmed tier)', () => {
    expect(evidenceStateToProvKind('statement')).toBe('confirmed')
  })

  it('model_estimate → model', () => {
    expect(evidenceStateToProvKind('model_estimate')).toBe('model')
  })

  it('undefined → default', () => {
    expect(evidenceStateToProvKind(undefined)).toBe('default')
  })

  it('null → default', () => {
    expect(evidenceStateToProvKind(null)).toBe('default')
  })

  // Guardrails: estimated ≠ confirmed, confirmed ≠ model.

  it('model_estimate is never mapped to confirmed kind', () => {
    expect(evidenceStateToProvKind('model_estimate')).not.toBe('confirmed')
  })

  it('user_confirmed is never mapped to model kind', () => {
    expect(evidenceStateToProvKind('user_confirmed')).not.toBe('model')
  })

  it('statement is never mapped to model kind', () => {
    expect(evidenceStateToProvKind('statement')).not.toBe('model')
  })

  it('all three domain values produce a non-default ProvKind', () => {
    const all: EvidenceState[] = ['user_confirmed', 'model_estimate', 'statement']
    for (const s of all) {
      expect(evidenceStateToProvKind(s)).not.toBe('default')
    }
  })
})

// ---------------------------------------------------------------------------
// formatEvidenceStateForExport
// ---------------------------------------------------------------------------

describe('formatEvidenceStateForExport', () => {
  it('user_confirmed → "Bestätigt"', () => {
    expect(formatEvidenceStateForExport('user_confirmed')).toBe('Bestätigt')
  })

  it('statement → "lt. Beleg"', () => {
    expect(formatEvidenceStateForExport('statement')).toBe('lt. Beleg')
  })

  it('model_estimate → "Schätzwert"', () => {
    expect(formatEvidenceStateForExport('model_estimate')).toBe('Schätzwert')
  })

  // Absent evidence is "we never asked", which must stay distinguishable from
  // an explicit "weiß ich nicht" (`InputStatus === 'unknown'` → 'Unbekannt').
  it('undefined → "Keine Angabe"', () => {
    expect(formatEvidenceStateForExport(undefined)).toBe('Keine Angabe')
  })

  it('null → "Keine Angabe"', () => {
    expect(formatEvidenceStateForExport(null)).toBe('Keine Angabe')
  })

  // Guardrail: raw English domain values must never leak into export output.

  it('does not emit raw English domain value for model_estimate', () => {
    expect(formatEvidenceStateForExport('model_estimate')).not.toBe('model_estimate')
  })

  it('does not emit raw English domain value for user_confirmed', () => {
    expect(formatEvidenceStateForExport('user_confirmed')).not.toBe('user_confirmed')
  })

  it('does not emit raw English domain value for statement', () => {
    expect(formatEvidenceStateForExport('statement')).not.toBe('statement')
  })

  it('outputs are non-empty strings for all domain values', () => {
    const all: EvidenceState[] = ['user_confirmed', 'model_estimate', 'statement']
    for (const s of all) {
      const label = formatEvidenceStateForExport(s)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })

  // Confirm that model ≠ confirmed in export labels (estimated ≠ confirmed guardrail).

  it('model_estimate and user_confirmed produce distinct export labels', () => {
    expect(formatEvidenceStateForExport('model_estimate')).not.toBe(
      formatEvidenceStateForExport('user_confirmed'),
    )
  })
})

// ---------------------------------------------------------------------------
// InputStatus bridge (simplification project, state contract §2.3)
// ---------------------------------------------------------------------------

describe('InputStatus ↔ EvidenceState bridge', () => {
  it('maps each status to the evidence state written alongside it', () => {
    expect(inputStatusToEvidenceState('entered')).toBe('user_confirmed')
    expect(inputStatusToEvidenceState('document')).toBe('statement')
    expect(inputStatusToEvidenceState('assumed')).toBe('model_estimate')
    // 'unknown' has no evidence counterpart — callers delete evidenceMap[key].
    expect(inputStatusToEvidenceState('unknown')).toBeUndefined()
  })

  it('falls back to "assumed" for legacy data — never "unknown", never "entered"', () => {
    expect(evidenceStateToInputStatus(undefined)).toBe('assumed')
    expect(evidenceStateToInputStatus('model_estimate')).toBe('assumed')
    expect(evidenceStateToInputStatus('user_confirmed')).toBe('entered')
    expect(evidenceStateToInputStatus('statement')).toBe('document')
  })

  it('maps statuses to display kinds, with a dedicated kind for explicit unknown', () => {
    expect(inputStatusToProvKind('unknown')).toBe('unknown')
    expect(inputStatusToProvKind('assumed')).toBe('model')
    expect(inputStatusToProvKind('entered')).toBe('confirmed')
    expect(inputStatusToProvKind('document')).toBe('confirmed')
  })

  it('keeps "Unbekannt" (explicit) and "Keine Angabe" (absent) apart in exports', () => {
    expect(formatInputStatusForExport('unknown')).toBe('Unbekannt')
    expect(formatInputStatusForExport('assumed')).toBe('Schätzwert')
    expect(formatInputStatusForExport('entered')).toBe('Bestätigt')
    expect(formatInputStatusForExport('document')).toBe('lt. Beleg')

    expect(formatExportProvenance(undefined, undefined)).toBe('Keine Angabe')
    expect(formatExportProvenance('unknown', undefined)).toBe('Unbekannt')
    // An explicit status wins over a stale evidence value.
    expect(formatExportProvenance('unknown', 'user_confirmed')).toBe('Unbekannt')
    expect(formatExportProvenance(undefined, 'statement')).toBe('lt. Beleg')
  })

  it('resolveInputStatus prefers inputStatus, then evidence, then "assumed"', () => {
    expect(resolveInputStatus({ a: 'unknown' }, 'user_confirmed', 'a')).toBe('unknown')
    expect(resolveInputStatus({ b: 'entered' }, undefined, 'a')).toBe('assumed')
    expect(resolveInputStatus(undefined, 'statement', 'a')).toBe('document')
    expect(resolveInputStatus(undefined, undefined, 'a')).toBe('assumed')
  })
})
