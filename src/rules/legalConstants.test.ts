import { describe, it, expect } from 'vitest'
import {
  aktienfondsTeilfreistellungPrivat,
  legalConstants,
  legalRuleData,
  pvBeitragszuschlagKinderloseMinAge,
  sonderausgabenPauschbetrag,
  werbungskostenPauschalRenten,
  werbungskostenPauschalVersorgungsbezuege,
} from './legalConstants'

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

  describe('payrollTax.vorsorgepauschaleKvPvAvCap', () => {
    it('equals 1 900 — §39b EStG PAP cap on KV + PV + AV Teilbeträge', () => {
      // Statutory basis: §39b EStG (PAP), as described in
      // TAX_SOCIAL_SECURITY_2026_RESEARCH.md §2.
      // Do NOT change this without a law-amendment citation.
      expect(legalConstants.payrollTax.vorsorgepauschaleKvPvAvCap).toBe(1_900)
    })
  })

  describe('bav.minimumEntitlementDivisor', () => {
    it('equals 160 — §1a Abs. 1 S. 1 BetrAVG minimum-conversion divisor', () => {
      // Statutory basis: §1a Abs. 1 S. 1 BetrAVG — 1/160 of the annual
      // Bezugsgröße West (§18 Abs. 1 SGB IV supplies the yearly value).
      // Do NOT change this without a law-amendment citation.
      expect(legalConstants.bav.minimumEntitlementDivisor).toBe(160)
    })
  })

  describe('care group — §55 Abs. 3a SGB XI Beitragsabschlag', () => {
    it('discounts 0.25 pp per further child under 25, beyond the first', () => {
      // Statutory basis: §55 Abs. 3a SGB XI (as cited in this repo).
      // Do NOT change this without a law-amendment citation.
      expect(legalConstants.care.beitragsabschlagPerFurtherChild).toBe(0.0025)
    })

    it('caps the discount at 4 further children (1.0 pp total)', () => {
      // Statutory basis: §55 Abs. 3a SGB XI (as cited in this repo).
      // Do NOT change this without a law-amendment citation.
      expect(legalConstants.care.beitragsabschlagMaxFurtherChildren).toBe(4)
    })
  })

  describe('childEligibility.under25WindowYears', () => {
    it('equals 25 — children count only through the year they turn 25', () => {
      // Statutory basis: Kinderbegriff per §55 Abs. 3a SGB XI (as cited in
      // this repo); the same window gates child allowances in the
      // Riester/AVD funding paths. Value moved from
      // src/engine/childEligibility.ts (#376 review).
      // Do NOT change this without a law-amendment citation.
      expect(legalConstants.childEligibility.under25WindowYears).toBe(25)
    })
  })

  describe('standalone statutory data exports', () => {
    it('werbungskostenPauschalVersorgungsbezuege is 102 — §9a Satz 1 Nr. 1b EStG', () => {
      // Statutory basis: §9a Satz 1 Nr. 1b EStG (Versorgungsbezüge).
      // Do NOT change this without a law-amendment citation.
      expect(werbungskostenPauschalVersorgungsbezuege).toBe(102)
    })

    it('werbungskostenPauschalRenten is 102 — §9a Satz 1 Nr. 3 EStG', () => {
      // Statutory basis: §9a Satz 1 Nr. 3 EStG (sonstige Einkünfte / Renten).
      // Do NOT change this without a law-amendment citation.
      expect(werbungskostenPauschalRenten).toBe(102)
    })

    it('sonderausgabenPauschbetrag is 36 / 72 — §10c EStG', () => {
      // Statutory basis: §10c Satz 1 EStG (single) / Satz 2 (joint assessment).
      // Do NOT change this without a law-amendment citation.
      expect(sonderausgabenPauschbetrag.single).toBe(36)
      expect(sonderausgabenPauschbetrag.married).toBe(72)
    })

    it('aktienfondsTeilfreistellungPrivat is 30 % — §20 Abs. 1 Nr. 1 InvStG', () => {
      // Statutory basis: §20 Abs. 1 Nr. 1 InvStG (Aktienfonds im Privatvermögen).
      // Do NOT change this without a law-amendment citation.
      expect(aktienfondsTeilfreistellungPrivat).toBe(0.30)
    })

    it('the catalog mirrors the standalone exports (one value, two views)', () => {
      // legalRuleData is the fingerprint source; the standalone bindings are
      // what the engine imports. They must stay the same values.
      expect(legalRuleData.werbungskostenPauschalVersorgungsbezuege).toBe(
        werbungskostenPauschalVersorgungsbezuege,
      )
      expect(legalRuleData.werbungskostenPauschalRenten).toBe(werbungskostenPauschalRenten)
      expect(legalRuleData.sonderausgabenPauschbetrag).toBe(sonderausgabenPauschbetrag)
      expect(legalRuleData.aktienfondsTeilfreistellungPrivat).toBe(
        aktienfondsTeilfreistellungPrivat,
      )
      expect(legalRuleData.pvBeitragszuschlagKinderloseMinAge).toBe(
        pvBeitragszuschlagKinderloseMinAge,
      )
      expect(legalRuleData.legalConstants).toBe(legalConstants)
    })
  })
})
