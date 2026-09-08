import { afterEach, describe, expect, it } from 'vitest'
import type { GermanRules } from '../domain'
import {
  activeRuleSetIdentity,
  activeRules,
  activeRulesMetadata,
  canonicalRuleSetSnapshot,
  RULES_YEAR,
  ruleSetFingerprint,
  ruleSetIdentity,
  rulesMetadataById,
} from './index'
import { legalConstants } from './legalConstants'
import type { LegalConstants } from './legalConstants'
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

// Mutable views over the exported (readonly-typed) constant objects, restored
// after every test so mutations never leak into sibling tests in this file.
const soliRef = legalConstants.soli as { rate: number; milderungszoneRate: number }
const capRef = legalConstants.payrollTax as { vorsorgepauschaleKvPvAvCap: number }
const bavRef = legalConstants.bav as { minimumEntitlementDivisor: number }
const originals = {
  slope: soliRef.milderungszoneRate,
  cap: capRef.vorsorgepauschaleKvPvAvCap,
  divisor: bavRef.minimumEntitlementDivisor,
}
afterEach(() => {
  soliRef.milderungszoneRate = originals.slope
  capRef.vorsorgepauschaleKvPvAvCap = originals.cap
  bavRef.minimumEntitlementDivisor = originals.divisor
})

/**
 * Tripwires for the rule-set provenance metadata (#376).
 *
 * The scenario runner and UI stamp `activeRulesMetadata` / `activeRuleSetIdentity`
 * onto results and use `rulesMetadataById` to judge stored results. These tests
 * pin the contract: metadata tracks the active year AND its same-year revision,
 * carries source/effective-date provenance for the covered tax areas only (per
 * field where the golden pins a single field), keeps the replay caveats honest
 * (no implemented output preservation), and gives the runner a content
 * fingerprint that covers BOTH the year rules and the cross-year legalConstants.
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

  it('narrows capitalGains golden coverage to the basiszins field (#376 review)', () => {
    // capitalGains2026GoldenValues pins ONLY basiszins — the Abgeltungsteuer
    // rate, Sparerpauschbetrag, and soli alias have no external capture, so
    // they must not ride on the golden pin.
    const byArea = new Map(activeRulesMetadata.areas.map(area => [area.area, area]))
    expect(byArea.get('capitalGains.basiszins')?.pinnedBy).toBe('external-golden')
    expect(byArea.get('capitalGains.basiszins')?.effectiveFrom).toBe('2026-01-01')
    for (const area of [
      'capitalGains.taxRate',
      'capitalGains.saverAllowance',
      'capitalGains.solidarityRate',
    ]) {
      expect(byArea.get(area)?.pinnedBy, area).not.toBe('external-golden')
    }
    // The old coarse whole-group entry must not come back.
    expect(byArea.has('capitalGains')).toBe(false)
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
    // The removed "old outputs stay bound to the model version" claim must not
    // come back — nothing in the app preserves outputs to bind.
    expect(REPLAY_LIMITATIONS.some(l => /stay bound/i.test(l))).toBe(false)
  })

  it('lookup rejects unknown rule-set IDs instead of passing them through', () => {
    expect(rulesMetadataById(activeRuleSetIdentity)).toBe(activeRulesMetadata)
    expect(rulesMetadataById({ ...activeRuleSetIdentity, ruleSetId: 'de2025' })).toBeNull()
    expect(rulesMetadataById({ ...activeRuleSetIdentity, ruleSetId: 'de2027' })).toBeNull()
    expect(rulesMetadataById({ ...activeRuleSetIdentity, ruleSetId: '' })).toBeNull()
  })
})

describe('rule-set content identity (#376)', () => {
  it('stamps ruleSetId, ruleYear, revision, and a 16-hex fingerprint', () => {
    expect(activeRuleSetIdentity.ruleSetId).toBe(activeRulesMetadata.ruleSetId)
    expect(activeRuleSetIdentity.ruleYear).toBe(activeRulesMetadata.ruleYear)
    expect(activeRuleSetIdentity.revision).toBe(activeRulesMetadata.revision)
    expect(activeRuleSetIdentity.contentFingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(activeRuleSetIdentity.contentFingerprint).toBe(
      ruleSetFingerprint(activeRules, legalConstants),
    )
  })

  it('fingerprint is deterministic and independent of key insertion order (both inputs)', () => {
    const reorderedRules = reversedKeyOrder(activeRules) as GermanRules
    const reorderedConstants = reversedKeyOrder(legalConstants) as unknown as LegalConstants
    expect(canonicalRuleSetSnapshot(reorderedRules, reorderedConstants)).toBe(
      canonicalRuleSetSnapshot(activeRules, legalConstants),
    )
    expect(ruleSetFingerprint(reorderedRules, reorderedConstants)).toBe(
      ruleSetFingerprint(activeRules, legalConstants),
    )
  })

  it('fingerprint changes when a year-rule value changes, including nested fields', () => {
    const base = ruleSetFingerprint(activeRules, legalConstants)

    const shiftedAllowance: GermanRules = {
      ...activeRules,
      incomeTax: { ...activeRules.incomeTax, basicAllowance: activeRules.incomeTax.basicAllowance + 1 },
    }
    expect(ruleSetFingerprint(shiftedAllowance, legalConstants)).not.toBe(base)

    const shiftedRentenwert: GermanRules = {
      ...activeRules,
      socialSecurity: {
        ...activeRules.socialSecurity,
        aktuellerRentenwert: activeRules.socialSecurity.aktuellerRentenwert + 0.01,
      },
    }
    expect(ruleSetFingerprint(shiftedRentenwert, legalConstants)).not.toBe(base)
  })

  // The constants this slice made load-bearing (§4 SolzG slope, §39b cap,
  // §1a BetrAVG divisor) are hashed via the `legalConstants` object — each
  // amendment below must measurably move the fingerprint, or the identity
  // stamp is blind to exactly the changes the engine consumes.
  it('fingerprint moves when the soli Milderungszone slope (§4 SolzG) is amended', () => {
    const base = ruleSetFingerprint(activeRules, legalConstants)
    soliRef.milderungszoneRate = originals.slope + 0.006
    expect(ruleSetFingerprint(activeRules, legalConstants)).not.toBe(base)
  })

  it('fingerprint moves when the §39b KV/PV/AV cap is amended', () => {
    const base = ruleSetFingerprint(activeRules, legalConstants)
    capRef.vorsorgepauschaleKvPvAvCap = originals.cap - 100
    expect(ruleSetFingerprint(activeRules, legalConstants)).not.toBe(base)
  })

  it('fingerprint moves when the §1a BetrAVG divisor is amended', () => {
    const base = ruleSetFingerprint(activeRules, legalConstants)
    bavRef.minimumEntitlementDivisor = originals.divisor * 2
    expect(ruleSetFingerprint(activeRules, legalConstants)).not.toBe(base)
  })

  it('ruleSetIdentity derives its fingerprint from the constants it is handed', () => {
    const base = ruleSetIdentity(activeRules, legalConstants, activeRulesMetadata)
    expect(base).toEqual(activeRuleSetIdentity)
    capRef.vorsorgepauschaleKvPvAvCap = originals.cap - 100
    const amended = ruleSetIdentity(activeRules, legalConstants, activeRulesMetadata)
    expect(amended.contentFingerprint).not.toBe(base.contentFingerprint)
    expect(amended.revision).toBe(base.revision) // revision alone did not move — the fingerprint did
  })
})

describe('rulesMetadataById judges a full stamp (#376 review)', () => {
  it('accepts the current build identity', () => {
    expect(rulesMetadataById(activeRuleSetIdentity)).toBe(activeRulesMetadata)
  })

  it('rejects a stamp from a different revision, even with the right year and ID', () => {
    // A same-year amendment that bumped revision means old revision-1 stamps
    // must not resolve to the new metadata.
    const stale = { ...activeRuleSetIdentity, revision: activeRuleSetIdentity.revision + 1 }
    expect(rulesMetadataById(stale)).toBeNull()
    const older = { ...activeRuleSetIdentity, revision: activeRuleSetIdentity.revision - 1 }
    expect(rulesMetadataById(older)).toBeNull()
  })

  it('rejects a stamp with a tampered fingerprint', () => {
    const forged = {
      ...activeRuleSetIdentity,
      contentFingerprint: 'deadbeefdeadbeef',
    }
    expect(rulesMetadataById(forged)).toBeNull()
  })

  it('rejects a stamp whose ruleYear drifted', () => {
    const drifted = { ...activeRuleSetIdentity, ruleYear: activeRuleSetIdentity.ruleYear - 1 }
    expect(rulesMetadataById(drifted)).toBeNull()
  })

  it('an unannounced legalConstants amendment invalidates previously stamped identities', () => {
    // Simulate the failure mode the fingerprint exists for: the engine
    // consumes an amended constant, but nobody bumped `revision`. Stamps
    // produced before the amendment carry the old fingerprint, so this build
    // must refuse to speak for them — same ID, same year, same revision.
    expect(rulesMetadataById(activeRuleSetIdentity)).toBe(activeRulesMetadata)
    soliRef.milderungszoneRate = originals.slope + 0.006
    try {
      expect(rulesMetadataById(activeRuleSetIdentity)).toBeNull()

      // Boundary of the protection: a stamp re-derived from the amended
      // content IS accepted, because it matches what this build compiles
      // right now. The fingerprint cannot resurrect history — it only
      // refuses stamps that predate the current content. Distinguishing the
      // amended value set from the original one is exactly what the
      // mandatory `revision` bump in the same commit is for.
      const restamped = {
        ...activeRuleSetIdentity,
        contentFingerprint: ruleSetFingerprint(activeRules, legalConstants),
      }
      expect(rulesMetadataById(restamped)).toBe(activeRulesMetadata)
    } finally {
      soliRef.milderungszoneRate = originals.slope
    }
    // Restored — the original stamp is valid again.
    expect(rulesMetadataById(activeRuleSetIdentity)).toBe(activeRulesMetadata)
  })
})
