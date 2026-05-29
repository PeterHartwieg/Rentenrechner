import { describe, it, expect } from 'vitest'
import { pvBeitragszuschlagKinderloseMinAge } from './legalConstants'

/**
 * Tripwire tests for cross-year statutory constants in legalConstants.ts.
 *
 * These assertions exist to fail loudly if a constant is changed without an
 * accompanying law-amendment citation. They do NOT test business logic — they
 * pin externally-verified statutory facts.
 *
 * Note: AVD_EFFECTIVE_YEAR was removed in PR #346 R3 — the single source of
 * truth for the AVD availability year is `activeRules.altersvorsorgedepot.productStartYear`
 * (= 2027) in `de2026.ts`. Keeping a parallel constant here introduced a
 * parallel-constant problem and pointed to the enactment year (2026) rather
 * than the contract-availability year (2027).
 */
describe('legalConstants statutory pins', () => {
  describe('pvBeitragszuschlagKinderloseMinAge', () => {
    it('equals 23 — §55 Abs. 3 SGB XI minimum age for childless PV surcharge', () => {
      // Statutory basis: §55 Abs. 3 SGB XI.
      // Do NOT change this without a law-amendment citation.
      expect(pvBeitragszuschlagKinderloseMinAge).toBe(23)
    })
  })
})
