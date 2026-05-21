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
// Three non-negotiable invariants from the handoff brief:
//   (a) Every numeric age in the copy must trace back to legalConstants —
//       no naked numerals.
//   (b) Every product in PRODUCT_REGISTRY has an entry (the registry is
//       exhaustive; this is a runtime safety net).
//   (c) PR 290 Codex P2 — the `versicherung` entry dispatches on the live
//       `assumptions.insurance.contractStartYear`. Pre-2012 contracts
//       resolve to age 60 (§20 Abs. 1 Nr. 6 EStG original text), post-2011
//       contracts to age 62 (§52 Abs. 28 Satz 7 EStG).
// ---------------------------------------------------------------------------

// Default context = post-2011 boundary, which preserves the historic test
// expectations (label = "ab 62 J." for `versicherung`, bAV, AVD, Riester).
const DEFAULT_CTX = {
  insuranceContractStartYear:
    legalConstants.insurance.halbeinkuenfteRaisedMinAgeContractStartYear,
}

describe('getAvailabilityEntry', () => {
  it('returns an entry for every registered product', () => {
    for (const entry of PRODUCT_REGISTRY) {
      const availability = getAvailabilityEntry(entry.metadata.id, DEFAULT_CTX)
      expect(availability.label).toBeTruthy()
    }
  })

  it('uses the Basisrente §10 EStG / AltZertG minimum payout age', () => {
    const expectedAge = legalConstants.basisrente.minPayoutAge
    expect(getAvailabilityEntry('basisrente', DEFAULT_CTX).label).toContain(
      String(expectedAge),
    )
  })

  it('uses the §52 Abs. 28 Satz 7 EStG post-2011 minimum age for pAV / bAV / AVD / Riester', () => {
    const expectedAge = halbeinkuenfteMinAgeForContractStartYear(
      legalConstants.insurance.halbeinkuenfteRaisedMinAgeContractStartYear,
    )
    expect(getAvailabilityEntry('versicherung', DEFAULT_CTX).label).toContain(
      String(expectedAge),
    )
    expect(getAvailabilityEntry('bav', DEFAULT_CTX).label).toContain(String(expectedAge))
    expect(getAvailabilityEntry('altersvorsorgedepot', DEFAULT_CTX).label).toContain(
      String(expectedAge),
    )
    expect(getAvailabilityEntry('riester', DEFAULT_CTX).label).toContain(String(expectedAge))
  })

  it('describes ETF as "jederzeit" (no statutory floor applies)', () => {
    const etf = getAvailabilityEntry('etf', DEFAULT_CTX)
    expect(etf.label.toLowerCase()).toContain('jederzeit')
  })

  // ---------------------------------------------------------------------
  // PR 290 Codex P2 — `versicherung` honours the live contractStartYear.
  //
  // The canonical resolver `halbeinkuenfteMinAgeForContractStartYear`
  // returns 60 for years < `halbeinkuenfteRaisedMinAgeContractStartYear`
  // (currently 2012) and 62 for years ≥ that boundary. The card footer
  // must mirror that dispatch so a pre-2012 Altvertrag does not falsely
  // read "ab 62 J."
  // ---------------------------------------------------------------------
  it('versicherung with a pre-2012 contractStartYear surfaces the §20 Abs. 1 Nr. 6 EStG original 60-year minimum', () => {
    const pre2012 = getAvailabilityEntry('versicherung', { insuranceContractStartYear: 2008 })
    const expectedAge = halbeinkuenfteMinAgeForContractStartYear(2008)
    expect(expectedAge).toBe(legalConstants.insurance.halbeinkuenfteMinAgePre2012Contracts)
    expect(pre2012.label).toContain(String(expectedAge))
    // Sanity: the label must NOT carry the post-2011 raised age.
    expect(pre2012.label).not.toContain(
      String(legalConstants.insurance.halbeinkuenfteMinAgePost2011Contracts),
    )
  })

  it('versicherung with a post-2011 contractStartYear surfaces the §52 Abs. 28 Satz 7 EStG raised 62-year minimum', () => {
    const post2011 = getAvailabilityEntry('versicherung', { insuranceContractStartYear: 2015 })
    const expectedAge = halbeinkuenfteMinAgeForContractStartYear(2015)
    expect(expectedAge).toBe(legalConstants.insurance.halbeinkuenfteMinAgePost2011Contracts)
    expect(post2011.label).toContain(String(expectedAge))
  })

  it('versicherung note copy is invariant across contractStartYear (only the age changes)', () => {
    // Defensive: the function form must not accidentally diverge the note
    // text between contract eras. Only the headline label depends on the
    // age boundary; the explanatory note stays stable.
    const pre = getAvailabilityEntry('versicherung', { insuranceContractStartYear: 2008 })
    const post = getAvailabilityEntry('versicherung', { insuranceContractStartYear: 2015 })
    expect(pre.note).toBe(post.note)
  })

  it.each(['etf', 'bav', 'basisrente', 'altersvorsorgedepot', 'riester'] as const)(
    '%s ignores insuranceContractStartYear (only versicherung dispatches on it)',
    (productId) => {
      // Defensive: changing the insurance contract year must not bleed into
      // any other product's label. The registry's other entries are static
      // values that the resolver returns unchanged regardless of ctx.
      const pre = getAvailabilityEntry(productId, { insuranceContractStartYear: 2008 })
      const post = getAvailabilityEntry(productId, { insuranceContractStartYear: 2015 })
      expect(pre.label).toBe(post.label)
      expect(pre.note).toBe(post.note)
    },
  )
})
