import { describe, expect, it } from 'vitest'
import type { GermanRules } from '../domain'
import {
  activeRuleSetIdentity,
  activeRules,
  activeRulesMetadata,
  canonicalRuleSetSnapshot,
  RULES_YEAR,
  ruleSetFingerprint,
  rulesMetadataById,
} from './index'
import { PROJECTION_ASSUMPTION, REPLAY_LIMITATIONS, TAX_CALCULATION_MODEL } from './ruleMetadata'

/** Deep clone with every object's keys inserted in reverse order. */
function reversedKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeyOrder)
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).reverse()
    return Object.fromEntries(entries.map(([k, v]) => [k, reversedKeyOrder(v)]))
  }
  return value
}

/**
 * Tripwires for the rule-set provenance metadata (#376).
 *
 * The scenario runner and UI stamp `activeRulesMetadata` / `activeRuleSetIdentity`
 * onto results and use `rulesMetadataById` to judge stored results. These tests
 * pin the contract: metadata tracks the active year AND its same-year revision,
 * carries source/effective-date provenance for the covered tax areas only, keeps
 * the replay caveats honest (no implemented output preservation), and gives the
 * runner a deterministic content fingerprint.
 */
describe('active rule-set metadata (#376)', () => {
  it('tracks the active rule year — drift here means a year swap without metadata', () => {
    expect(activeRulesMetadata.ruleYear).toBe(activeRules.year)
    expect(activeRulesMetadata.ruleYear).toBe(RULES_YEAR)
    expect(activeRulesMetadata.ruleSetId).toBe(`de${activeRules.year}`)
  })

  it('carries a positive integer revision distinguishing same-year amendments', () => {
    expect(Number.isInteger(activeRulesMetadata.revision)).toBe(true)
    expect(activeRulesMetadata.revision).toBeGreaterThanOrEqual(1)
    // The ID names a year, not a revision — the revision field must exist
    // separately so two same-year value sets are distinguishable.
    expect(activeRulesMetadata.ruleSetId).toMatch(/^de\d{4}$/)
  })

  it('stamps a non-empty calculation model whose version is a positive integer', () => {
    expect(activeRulesMetadata.calculationModel.id).toBe(TAX_CALCULATION_MODEL.id)
    expect(TAX_CALCULATION_MODEL.id.length).toBeGreaterThan(0)
    expect(Number.isInteger(TAX_CALCULATION_MODEL.version)).toBe(true)
    expect(TAX_CALCULATION_MODEL.version).toBeGreaterThanOrEqual(1)
    expect(TAX_CALCULATION_MODEL.summary.length).toBeGreaterThan(0)
  })

  it('scopes provenance to the covered tax areas, not the whole engine', () => {
    expect(activeRulesMetadata.scope).toMatch(/src\/engine\/tax\.ts/)
    expect(activeRulesMetadata.scope).toMatch(/Not a snapshot of the whole engine/i)
  })

  it('carries source/effective-date provenance for each documented area', () => {
    expect(activeRulesMetadata.areas.length).toBeGreaterThan(0)
    for (const area of activeRulesMetadata.areas) {
      expect(area.area.length, area.area).toBeGreaterThan(0)
      expect(area.statute.length, area.area).toBeGreaterThan(0)
      expect(area.source.length, area.area).toBeGreaterThan(0)
      expect(['external-golden', 'statutory-pin', 'inline-citation'], area.area).toContain(
        area.pinnedBy,
      )
      if (area.effectiveFrom !== undefined) {
        expect(area.effectiveFrom, area.area).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })

  it('documents the tariff area with external-golden coverage', () => {
    const tariffArea = activeRulesMetadata.areas.find(area => area.area === 'incomeTax.tariff')
    expect(tariffArea).toBeDefined()
    expect(tariffArea?.pinnedBy).toBe('external-golden')
    expect(tariffArea?.effectiveFrom).toBe('2026-01-01')
  })

  it('states the projection assumption without denying modeled enacted schedules', () => {
    // Distinguish legislated multi-year schedules the engine models from the
    // rule-year holding assumption — retaining current rules is not a claim
    // that every future-year value is unchanged or non-legislative.
    expect(PROJECTION_ASSUMPTION).toMatch(/rule year/i)
    expect(PROJECTION_ASSUMPTION).toMatch(/enacted schedules/i)
    expect(PROJECTION_ASSUMPTION).toMatch(/holding assumption/i)
    expect(PROJECTION_ASSUMPTION).toMatch(/2058/)
  })

  it('keeps the replay limitations honest about what the application does', () => {
    expect(REPLAY_LIMITATIONS.length).toBeGreaterThan(0)
    for (const limitation of REPLAY_LIMITATIONS) {
      expect(limitation.length).toBeGreaterThan(0)
    }
    // Current behavior: inputs are stored, outputs are recalculated.
    expect(REPLAY_LIMITATIONS.some(l => /nothing in the application preserves/i.test(l))).toBe(true)
    // Exact replay needs the engine revision plus a full rule snapshot,
    // including cross-year constants and cohort algorithms.
    expect(REPLAY_LIMITATIONS.some(l => /exact engine revision/i.test(l))).toBe(true)
    expect(REPLAY_LIMITATIONS.some(l => /cohort algorithms/i.test(l))).toBe(true)
    // The ID names a year, not a within-year revision.
    expect(REPLAY_LIMITATIONS.some(l => /not revisions within it/i.test(l))).toBe(true)
    // Provenance is scoped, not a full-engine snapshot.
    expect(REPLAY_LIMITATIONS.some(l => /does not snapshot the whole engine/i.test(l))).toBe(true)
  })

  it('lookup returns null for rule sets this build cannot speak for', () => {
    expect(rulesMetadataById(activeRulesMetadata.ruleSetId)).toBe(activeRulesMetadata)
    expect(rulesMetadataById('de2025')).toBeNull()
    expect(rulesMetadataById('de2027')).toBeNull()
    expect(rulesMetadataById('')).toBeNull()
  })
})

describe('rule-set content identity (#376)', () => {
  it('stamps ruleSetId, ruleYear, revision, and a 16-hex fingerprint', () => {
    expect(activeRuleSetIdentity.ruleSetId).toBe(activeRulesMetadata.ruleSetId)
    expect(activeRuleSetIdentity.ruleYear).toBe(activeRulesMetadata.ruleYear)
    expect(activeRuleSetIdentity.revision).toBe(activeRulesMetadata.revision)
    expect(activeRuleSetIdentity.contentFingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(activeRuleSetIdentity.contentFingerprint).toBe(ruleSetFingerprint(activeRules))
  })

  it('fingerprint is deterministic and independent of key insertion order', () => {
    const reordered = reversedKeyOrder(activeRules) as GermanRules
    expect(canonicalRuleSetSnapshot(reordered)).toBe(canonicalRuleSetSnapshot(activeRules))
    expect(ruleSetFingerprint(reordered)).toBe(ruleSetFingerprint(activeRules))
  })

  it('fingerprint changes when any rule value changes, including nested fields', () => {
    const base = ruleSetFingerprint(activeRules)

    const shiftedAllowance: GermanRules = {
      ...activeRules,
      incomeTax: { ...activeRules.incomeTax, basicAllowance: activeRules.incomeTax.basicAllowance + 1 },
    }
    expect(ruleSetFingerprint(shiftedAllowance)).not.toBe(base)

    const shiftedRentenwert: GermanRules = {
      ...activeRules,
      socialSecurity: {
        ...activeRules.socialSecurity,
        aktuellerRentenwert: activeRules.socialSecurity.aktuellerRentenwert + 0.01,
      },
    }
    expect(ruleSetFingerprint(shiftedRentenwert)).not.toBe(base)

    // A same-year amendment (revision bump without value change) must be
    // detectable through the revision field, not only the fingerprint.
    const sameValuesNewRevision = { ...activeRulesMetadata, revision: activeRulesMetadata.revision + 1 }
    expect(sameValuesNewRevision.revision).not.toBe(activeRuleSetIdentity.revision)
    expect(ruleSetFingerprint(activeRules)).toBe(base)
  })
})
