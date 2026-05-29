import { describe, it, expect } from 'vitest'
import { AVD_EFFECTIVE_YEAR } from './legalConstants'

/**
 * Tripwire tests for cross-year statutory constants in legalConstants.ts.
 *
 * These assertions exist to fail loudly if a constant is changed without an
 * accompanying law-amendment citation. They do NOT test business logic — they
 * pin externally-verified statutory facts.
 */
describe('legalConstants statutory pins', () => {
  describe('AVD_EFFECTIVE_YEAR', () => {
    it('equals 2026 — the year the Altersvorsorgereformgesetz entered into force', () => {
      // Statutory basis: Altersvorsorgereformgesetz, Bundestag 2026-03-27.
      // Do NOT change this without a BGBl. citation showing a different enactment year.
      expect(AVD_EFFECTIVE_YEAR).toBe(2026)
    })
  })
})
