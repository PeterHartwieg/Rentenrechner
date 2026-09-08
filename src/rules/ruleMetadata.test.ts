import { describe, expect, it } from 'vitest'
import {
  activeRules,
  activeRulesMetadata,
  RULES_YEAR,
  rulesMetadataById,
} from './index'
import { PROJECTION_ASSUMPTION, REPLAY_LIMITATIONS, TAX_CALCULATION_MODEL } from './ruleMetadata'

/**
 * Tripwires for the rule-set provenance metadata (#376).
 *
 * The scenario runner and UI stamp `activeRulesMetadata` onto results and use
 * `rulesMetadataById` to judge stored results. These tests pin the contract:
 * metadata tracks the active year, carries source/effective-date provenance,
 * and keeps the replay caveats that stop an ID from masquerading as history.
 */
describe('active rule-set metadata (#376)', () => {
  it('tracks the active rule year — drift here means a year swap without metadata', () => {
    expect(activeRulesMetadata.ruleYear).toBe(activeRules.year)
    expect(activeRulesMetadata.ruleYear).toBe(RULES_YEAR)
    expect(activeRulesMetadata.ruleSetId).toBe(`de${activeRules.year}`)
  })

  it('stamps a non-empty calculation model whose version is a positive integer', () => {
    expect(activeRulesMetadata.calculationModel.id).toBe(TAX_CALCULATION_MODEL.id)
    expect(TAX_CALCULATION_MODEL.id.length).toBeGreaterThan(0)
    expect(Number.isInteger(TAX_CALCULATION_MODEL.version)).toBe(true)
    expect(TAX_CALCULATION_MODEL.version).toBeGreaterThanOrEqual(1)
    expect(TAX_CALCULATION_MODEL.summary.length).toBeGreaterThan(0)
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

  it('keeps the projection assumption distinct from the rule year', () => {
    // The projection horizon runs decades past the rule year; the caveat must
    // say so instead of implying future legislation is modelled.
    expect(PROJECTION_ASSUMPTION).toMatch(/rule year/i)
    expect(PROJECTION_ASSUMPTION).toMatch(/holding assumption/i)
  })

  it('keeps the replay limitations non-empty and explicit', () => {
    expect(REPLAY_LIMITATIONS.length).toBeGreaterThan(0)
    for (const limitation of REPLAY_LIMITATIONS) {
      expect(limitation.length).toBeGreaterThan(0)
    }
    // The core caveat: an ID identifies, it does not reconstruct.
    expect(REPLAY_LIMITATIONS.some(l => /does not reconstruct/i.test(l))).toBe(true)
  })

  it('lookup returns null for rule sets this build cannot speak for', () => {
    expect(rulesMetadataById(activeRulesMetadata.ruleSetId)).toBe(activeRulesMetadata)
    expect(rulesMetadataById('de2025')).toBeNull()
    expect(rulesMetadataById('de2027')).toBeNull()
    expect(rulesMetadataById('')).toBeNull()
  })
})
