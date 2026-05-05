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
import { evidenceStateToProvKind, formatEvidenceStateForExport } from './provenanceHelpers'
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

  it('undefined → "Unbekannt"', () => {
    expect(formatEvidenceStateForExport(undefined)).toBe('Unbekannt')
  })

  it('null → "Unbekannt"', () => {
    expect(formatEvidenceStateForExport(null)).toBe('Unbekannt')
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
