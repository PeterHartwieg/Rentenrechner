import { describe, expect, it } from 'vitest'
import {
  legalConstants,
  halbeinkuenfteMinAgeForContractStartYear,
} from '../../rules/legalConstants'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { getAvailabilityEntry } from './vergleichDetailAvailability'

// ---------------------------------------------------------------------------
// vergleichDetailAvailability — registry-driven Verfügbarkeit copy.
//
// Two non-negotiable invariants from the handoff brief:
//   (a) Every numeric age in the copy must trace back to legalConstants —
//       no naked numerals.
//   (b) Every product in PRODUCT_REGISTRY has an entry (the switch is
//       exhaustive; this is a runtime safety net).
// ---------------------------------------------------------------------------

describe('getAvailabilityEntry', () => {
  it('returns an entry for every registered product', () => {
    for (const entry of PRODUCT_REGISTRY) {
      const availability = getAvailabilityEntry(entry.metadata.id)
      expect(availability.label).toBeTruthy()
    }
  })

  it('uses the Basisrente §10 EStG / AltZertG minimum payout age', () => {
    const expectedAge = legalConstants.basisrente.minPayoutAge
    expect(getAvailabilityEntry('basisrente').label).toContain(String(expectedAge))
  })

  it('uses the §52 Abs. 28 Satz 7 EStG post-2011 minimum age for pAV / bAV / AVD / Riester', () => {
    const expectedAge = halbeinkuenfteMinAgeForContractStartYear(
      legalConstants.insurance.halbeinkuenfteRaisedMinAgeContractStartYear,
    )
    expect(getAvailabilityEntry('versicherung').label).toContain(String(expectedAge))
    expect(getAvailabilityEntry('bav').label).toContain(String(expectedAge))
    expect(getAvailabilityEntry('altersvorsorgedepot').label).toContain(String(expectedAge))
    expect(getAvailabilityEntry('riester').label).toContain(String(expectedAge))
  })

  it('describes ETF as "jederzeit" (no statutory floor applies)', () => {
    const etf = getAvailabilityEntry('etf')
    expect(etf.label.toLowerCase()).toContain('jederzeit')
  })
})
