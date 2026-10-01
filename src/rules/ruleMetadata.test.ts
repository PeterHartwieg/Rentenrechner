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
import { legalConstants, legalRuleData } from './legalConstants'
import type { LegalRuleData } from './legalConstants'
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
 * Mutable view over the readonly-typed catalog — mutations are restored
 * below. Primitives are widened because the `as const` literals (102, 0.3,
 * 23, …) must accept amendment values in the mutation tests.
 */
type MutableCatalog = {
  -readonly [K in keyof LegalRuleData]: LegalRuleData[K] extends object
    ? LegalRuleData[K]
    : number | string
}
const catalogRef = legalRuleData as MutableCatalog
const soliRef = legalConstants.soli as { rate: number; milderungszoneRate: number }
const capRef = legalConstants.payrollTax as { vorsorgepauschaleKvPvAvCap: number }
const bavRef = legalConstants.bav as { minimumEntitlementDivisor: number }
const originals = {
  slope: soliRef.milderungszoneRate,
  cap: capRef.vorsorgepauschaleKvPvAvCap,
  divisor: bavRef.minimumEntitlementDivisor,
  wkv: legalRuleData.werbungskostenPauschalVersorgungsbezuege,
  wkr: legalRuleData.werbungskostenPauschalRenten,
  pauschbetrag: legalRuleData.sonderausgabenPauschbetrag,
  teilfreistellung: legalRuleData.aktienfondsTeilfreistellungPrivat,
  kinderloseMinAge: legalRuleData.pvBeitragszuschlagKinderloseMinAge,
}
afterEach(() => {
  soliRef.milderungszoneRate = originals.slope
  capRef.vorsorgepauschaleKvPvAvCap = originals.cap
  bavRef.minimumEntitlementDivisor = originals.divisor
  catalogRef.werbungskostenPauschalVersorgungsbezuege = originals.wkv
  catalogRef.werbungskostenPauschalRenten = originals.wkr
  catalogRef.sonderausgabenPauschbetrag = originals.pauschbetrag
  catalogRef.aktienfondsTeilfreistellungPrivat = originals.teilfreistellung
  catalogRef.pvBeitragszuschlagKinderloseMinAge = originals.kinderloseMinAge
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
 * fingerprint covering the year rules AND every exported cross-year rule datum.
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
    // rate and Sparerpauschbetrag have no external capture, so they must not
    // ride on the golden pin. taxRate/saverAllowance carry their own literal
    // tripwires in src/engine/tax.test.ts ("statutory-pin"); the soli alias
    // is pinned through the same constant.
    const byArea = new Map(activeRulesMetadata.areas.map(area => [area.area, area]))
    expect(byArea.get('capitalGains.basiszins')?.pinnedBy).toBe('external-golden')
    expect(byArea.get('capitalGains.basiszins')?.effectiveFrom).toBe('2026-01-01')
    for (const area of [
      'capitalGains.taxRate',
      'capitalGains.saverAllowance',
      'capitalGains.solidarityRate',
    ]) {
      expect(byArea.get(area)?.pinnedBy, area).toBe('statutory-pin')
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

describe('rule-data catalog exhaustiveness (#376 review round 3)', () => {
  it('legalRuleData covers every exported non-function datum of legalConstants.ts', async () => {
    // The identity snapshot hashes the catalog — an exported value missing
    // from it would be amendable without moving the fingerprint. This guard
    // fails when a new `export const` appears without a catalog entry.
    const mod = (await import('./legalConstants')) as Record<string, unknown>
    const dataExports = Object.keys(mod)
      .filter(key => typeof mod[key] !== 'function')
      .filter(key => key !== 'legalRuleData') // the catalog itself
      .sort()
    expect(Object.keys(legalRuleData).sort()).toEqual(dataExports)
  })
})

describe('rule-set content identity (#376)', () => {
  it('stamps ruleSetId, ruleYear, revision, and a 16-hex fingerprint', () => {
    expect(activeRuleSetIdentity.ruleSetId).toBe(activeRulesMetadata.ruleSetId)
    expect(activeRuleSetIdentity.ruleYear).toBe(activeRulesMetadata.ruleYear)
    expect(activeRuleSetIdentity.revision).toBe(activeRulesMetadata.revision)
    expect(activeRuleSetIdentity.contentFingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(activeRuleSetIdentity.contentFingerprint).toBe(
      ruleSetFingerprint(activeRules, legalRuleData),
    )
  })

  it('fingerprint is deterministic and independent of key insertion order (both inputs)', () => {
    const reorderedRules = reversedKeyOrder(activeRules) as GermanRules
    const reorderedData = reversedKeyOrder(legalRuleData) as unknown as LegalRuleData
    expect(canonicalRuleSetSnapshot(reorderedRules, reorderedData)).toBe(
      canonicalRuleSetSnapshot(activeRules, legalRuleData),
    )
    expect(ruleSetFingerprint(reorderedRules, reorderedData)).toBe(
      ruleSetFingerprint(activeRules, legalRuleData),
    )
  })

  it('fingerprint changes when a year-rule value changes, including nested fields', () => {
    const base = ruleSetFingerprint(activeRules, legalRuleData)

    const shiftedAllowance: GermanRules = {
      ...activeRules,
      incomeTax: { ...activeRules.incomeTax, basicAllowance: activeRules.incomeTax.basicAllowance + 1 },
    }
    expect(ruleSetFingerprint(shiftedAllowance, legalRuleData)).not.toBe(base)

    const shiftedRentenwert: GermanRules = {
      ...activeRules,
      socialSecurity: {
        ...activeRules.socialSecurity,
        aktuellerRentenwert: activeRules.socialSecurity.aktuellerRentenwert + 0.01,
      },
    }
    expect(ruleSetFingerprint(shiftedRentenwert, legalRuleData)).not.toBe(base)
  })

  // The constants this slice made load-bearing are hashed via the catalog —
  // each amendment below must measurably move the fingerprint, or the
  // identity stamp is blind to exactly the changes the engine consumes.
  it('fingerprint moves when the soli Milderungszone slope (§4 SolzG) is amended', () => {
    const base = ruleSetFingerprint(activeRules, legalRuleData)
    soliRef.milderungszoneRate = originals.slope + 0.006
    expect(ruleSetFingerprint(activeRules, legalRuleData)).not.toBe(base)
  })

  it('fingerprint moves when the §39b KV/PV/AV cap is amended', () => {
    const base = ruleSetFingerprint(activeRules, legalRuleData)
    capRef.vorsorgepauschaleKvPvAvCap = originals.cap - 100
    expect(ruleSetFingerprint(activeRules, legalRuleData)).not.toBe(base)
  })

  it('fingerprint moves when the §1a BetrAVG divisor is amended', () => {
    const base = ruleSetFingerprint(activeRules, legalRuleData)
    bavRef.minimumEntitlementDivisor = originals.divisor * 2
    expect(ruleSetFingerprint(activeRules, legalRuleData)).not.toBe(base)
  })

  // The five standalone exports (outside the legalConstants object) that the
  // round-2 fingerprint missed — each must move the fingerprint now.
  it.each([
    ['werbungskostenPauschalVersorgungsbezuege', 104] as const,
    ['werbungskostenPauschalRenten', 104] as const,
    ['aktienfondsTeilfreistellungPrivat', 0.25] as const,
    ['pvBeitragszuschlagKinderloseMinAge', 25] as const,
  ])('fingerprint moves when legalRuleData.%s is amended', (field, amended) => {
    const base = ruleSetFingerprint(activeRules, legalRuleData)
    ;(catalogRef[field] as number) = amended
    expect(ruleSetFingerprint(activeRules, legalRuleData)).not.toBe(base)
  })

  it('fingerprint moves when sonderausgabenPauschbetrag is amended', () => {
    const base = ruleSetFingerprint(activeRules, legalRuleData)
    catalogRef.sonderausgabenPauschbetrag = { single: 36, married: 74 }
    expect(ruleSetFingerprint(activeRules, legalRuleData)).not.toBe(base)
  })

  it('ruleSetIdentity derives its fingerprint from the catalog it is handed', () => {
    const base = ruleSetIdentity(activeRules, legalRuleData, activeRulesMetadata)
    expect(base).toEqual(activeRuleSetIdentity)
    capRef.vorsorgepauschaleKvPvAvCap = originals.cap - 100
    const amended = ruleSetIdentity(activeRules, legalRuleData, activeRulesMetadata)
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
        contentFingerprint: ruleSetFingerprint(activeRules, legalRuleData),
      }
      expect(rulesMetadataById(restamped)).toBe(activeRulesMetadata)
    } finally {
      soliRef.milderungszoneRate = originals.slope
    }
    // Restored — the original stamp is valid again.
    expect(rulesMetadataById(activeRuleSetIdentity)).toBe(activeRulesMetadata)
  })

  it('an unannounced §20 InvStG Teilfreistellung amendment rejects pre-amendment stamps', () => {
    // The round-2 fingerprint missed this standalone export entirely — a
    // 30 % → 25 % amendment would have changed every ETF payout while
    // `rulesMetadataById` kept accepting old stamps. It must not.
    expect(rulesMetadataById(activeRuleSetIdentity)).toBe(activeRulesMetadata)
    catalogRef.aktienfondsTeilfreistellungPrivat = 0.25
    try {
      expect(rulesMetadataById(activeRuleSetIdentity)).toBeNull()
    } finally {
      catalogRef.aktienfondsTeilfreistellungPrivat = originals.teilfreistellung
    }
    expect(rulesMetadataById(activeRuleSetIdentity)).toBe(activeRulesMetadata)
  })
})
