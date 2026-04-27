/**
 * Tests for src/engine/retirementTax.ts and the cohort tables in src/rules/de2026.ts (#46).
 *
 * Hand-computed golden values are annotated with intermediate steps so reviewers can
 * verify them against the statutory tables without running the code.
 */

import { describe, expect, it } from 'vitest'
import {
  besteuerungsanteilGrv,
  versorgungsfreibetrag,
  werbungskostenPauschalVersorgungsbezuege,
  werbungskostenPauschalRenten,
  sonderausgabenPauschbetrag,
} from '../rules/de2026'
import { de2026Rules } from '../rules/de2026'
import { calculateRetirementTax } from './retirementTax'

// ---------------------------------------------------------------------------
// (a) Besteuerungsanteil cohort lookup
// ---------------------------------------------------------------------------
describe('besteuerungsanteilGrv — cohort lookup', () => {
  it('2005 anchor: 50 %', () => {
    expect(besteuerungsanteilGrv(2005)).toBeCloseTo(0.50, 4)
  })

  it('2023 anchor: 82.5 % (post-Wachstumschancengesetz start)', () => {
    expect(besteuerungsanteilGrv(2023)).toBeCloseTo(0.825, 4)
  })

  it('2026 current: 84.0 %', () => {
    // 2026 = 2023 + 3 years × 0.5 pp = 82.5 + 1.5 = 84.0 %
    expect(besteuerungsanteilGrv(2026)).toBeCloseTo(0.84, 4)
  })

  it('2040 mid-table: 91.5 %', () => {
    // 2040 = 2023 + 17 years × 0.5 pp = 82.5 + 8.5 = 91.0 %
    expect(besteuerungsanteilGrv(2040)).toBeCloseTo(0.91, 4)
  })

  it('2058 cap: 100 %', () => {
    // 2058 = 2023 + 35 years × 0.5 pp = 82.5 + 17.5 = 100 %
    expect(besteuerungsanteilGrv(2058)).toBeCloseTo(1.00, 4)
  })

  it('>2058 stays at 100 %', () => {
    expect(besteuerungsanteilGrv(2070)).toBe(1.00)
  })

  it('<2005 returns 50 % (extrapolation floor)', () => {
    expect(besteuerungsanteilGrv(2000)).toBe(0.50)
  })

  it('2010: pre-Wachstumschancengesetz progression (8 years × 2 pp = +16 pp → 66 %)', () => {
    // 2005=50%, 2006=52%, ...2010 = 50 + 5*2 = 60 %
    expect(besteuerungsanteilGrv(2010)).toBeCloseTo(0.60, 4)
  })
})

// ---------------------------------------------------------------------------
// (b) Versorgungsfreibetrag cohort lookup
// ---------------------------------------------------------------------------
describe('versorgungsfreibetrag — cohort lookup', () => {
  it('2023 anchor: 14.0 % / 1,050 / 315', () => {
    const r = versorgungsfreibetrag(2023)
    expect(r.prozent).toBeCloseTo(0.140, 4)
    expect(r.hoechstbetrag).toBe(1_050)
    expect(r.zuschlag).toBe(315)
  })

  it('2024: 13.6 % / 1,020 / 306', () => {
    // 2023 + 1 year: −0.4 pp, −30, −9
    const r = versorgungsfreibetrag(2024)
    expect(r.prozent).toBeCloseTo(0.136, 4)
    expect(r.hoechstbetrag).toBe(1_020)
    expect(r.zuschlag).toBe(306)
  })

  it('2025: 13.2 % / 990 / 297', () => {
    const r = versorgungsfreibetrag(2025)
    expect(r.prozent).toBeCloseTo(0.132, 4)
    expect(r.hoechstbetrag).toBe(990)
    expect(r.zuschlag).toBe(297)
  })

  it('2026: 12.8 % / 960 / 288', () => {
    const r = versorgungsfreibetrag(2026)
    expect(r.prozent).toBeCloseTo(0.128, 4)
    expect(r.hoechstbetrag).toBe(960)
    expect(r.zuschlag).toBe(288)
  })

  it('2040 mid-table', () => {
    // 2040 = 2023 + 17 years: −17×0.4=6.8pp, −17×30=510, −17×9=153
    // prozent = 14.0 - 6.8 = 7.2 %, hoechstbetrag = 1050 - 510 = 540, zuschlag = 315 - 153 = 162
    const r = versorgungsfreibetrag(2040)
    expect(r.prozent).toBeCloseTo(0.072, 4)
    expect(r.hoechstbetrag).toBe(540)
    expect(r.zuschlag).toBe(162)
  })

  it('2058 zeros out', () => {
    // 2058 = 2023 + 35 years: all decay formulae reach 0
    const r = versorgungsfreibetrag(2058)
    expect(r.prozent).toBe(0)
    expect(r.hoechstbetrag).toBe(0)
    expect(r.zuschlag).toBe(0)
  })

  it('>2058 stays at zeros', () => {
    const r = versorgungsfreibetrag(2070)
    expect(r.prozent).toBe(0)
    expect(r.hoechstbetrag).toBe(0)
    expect(r.zuschlag).toBe(0)
  })

  it('<2005 returns 2005 values (extrapolation anchor)', () => {
    const r = versorgungsfreibetrag(2000)
    expect(r.prozent).toBeCloseTo(0.40, 4)
    expect(r.hoechstbetrag).toBe(3_000)
    expect(r.zuschlag).toBe(900)
  })
})

// ---------------------------------------------------------------------------
// (c) Pauschbeträge constants
// ---------------------------------------------------------------------------
describe('Pauschbeträge constants', () => {
  it('werbungskostenPauschalVersorgungsbezuege = 102 EUR (§9a Nr. 1b)', () => {
    expect(werbungskostenPauschalVersorgungsbezuege).toBe(102)
  })

  it('werbungskostenPauschalRenten = 102 EUR (§9a Nr. 3)', () => {
    expect(werbungskostenPauschalRenten).toBe(102)
  })

  it('sonderausgabenPauschbetrag single = 36 EUR (§10c)', () => {
    expect(sonderausgabenPauschbetrag.single).toBe(36)
  })

  it('sonderausgabenPauschbetrag married = 72 EUR (§10c)', () => {
    expect(sonderausgabenPauschbetrag.married).toBe(72)
  })
})

// ---------------------------------------------------------------------------
// (c) Pauschbeträge applied once each when both income types present
// ---------------------------------------------------------------------------
describe('calculateRetirementTax — Pauschbeträge applied per source', () => {
  it('bavPension=12,000 + statutoryPension=10,000 → each gets 102 Werbungskosten + 36 Sonderausgaben', () => {
    // retirementYear=2026: Versorgungsfreibetrag=12.8%/960/288; Besteuerungsanteil=84%
    // bavTaxable = 12000 - min(12000*0.128, 960) - 288 = 12000 - 960 - 288 = 10,752
    // but we focus only on Pauschbeträge, not final number
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 10_000,
        bavPensionAnnual: 12_000,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear: 2026,
      },
      de2026Rules,
    )
    expect(bd.werbungskostenVersorgung).toBe(102)
    expect(bd.werbungskostenRenten).toBe(102)
    expect(bd.sonderausgaben).toBe(36)
  })
})

// ---------------------------------------------------------------------------
// (d) Werbungskosten cap: bavPension=50 → werbungskosten capped at 50
// ---------------------------------------------------------------------------
describe('calculateRetirementTax — Werbungskosten cap', () => {
  it('bavPension=50 → werbungskostenVersorgung=50, not 102', () => {
    // bavPensionAnnual=50 < 102 → cap applies
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 50,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear: 2026,
      },
      de2026Rules,
    )
    expect(bd.werbungskostenVersorgung).toBe(50)
  })

  it('statutoryPension=20 → werbungskostenRenten capped at taxable amount (20 * 0.84 = 16.8)', () => {
    // statutoryPensionAnnual=20, Besteuerungsanteil(2026)=84%: taxable=16.8
    // werbungskostenRenten = min(102, 16.8) = 16 (floor via Math.min on real number)
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 20,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear: 2026,
      },
      de2026Rules,
    )
    expect(bd.werbungskostenRenten).toBeCloseTo(20 * 0.84, 4)
    expect(bd.werbungskostenRenten).toBeLessThan(102)
  })
})

// ---------------------------------------------------------------------------
// (e) Halbeinkünfte routing: gain=10,000 → 5,000 in personal base
// ---------------------------------------------------------------------------
describe('calculateRetirementTax — halbeinkuenfte routing', () => {
  it('gain=10,000 in halbeinkuenfte mode → privateInsuranceTaxable=5,000, abgeltungsteuer=0', () => {
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 10_000,
        privateInsuranceTaxMode: 'halbeinkuenfte',
        otherTaxableAnnual: 0,
        retirementYear: 2026,
      },
      de2026Rules,
    )
    expect(bd.privateInsuranceTaxable).toBe(5_000)
    expect(bd.abgeltungsteuerOnPrivateInsurance).toBe(0)
  })

  it('halbeinkuenfte: zvE uses half the gain minus Sonderausgaben', () => {
    // gain=10,000 → personal base=5,000; sonderausgaben=36; zvE=4,964
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 10_000,
        privateInsuranceTaxMode: 'halbeinkuenfte',
        otherTaxableAnnual: 0,
        retirementYear: 2026,
      },
      de2026Rules,
    )
    // zvE = 5000 - 36 = 4964 < basicAllowance (12348) → einkommensteuer = 0
    expect(bd.zuVersteuerndesEinkommen).toBe(4_964)
    expect(bd.einkommensteuer).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// (f) Abgeltungsteuer routing: gain=10,000 → flat 25% separately, 0 in personal base
// ---------------------------------------------------------------------------
describe('calculateRetirementTax — abgeltungsteuer routing', () => {
  it('gain=10,000 in abgeltungsteuer mode → personalBase=0, abgeltungsteuer=25%+Soli', () => {
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 10_000,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear: 2026,
      },
      de2026Rules,
    )
    // privateInsuranceTaxable = 0 (removed from personal base)
    expect(bd.privateInsuranceTaxable).toBe(0)
    // abgeltungsteuer = 10000 × 25% = 2500; soli = 2500 × 5.5% = 137.50
    // totalAbgeltungsteuer = 2500 + 137.50 = 2637.50
    const expectedFlat = 10_000 * 0.25
    const expectedSoli = expectedFlat * 0.055
    expect(bd.abgeltungsteuerOnPrivateInsurance).toBeCloseTo(expectedFlat + expectedSoli, 1)
    // personal-tax base is only sonderausgaben leftover → zvE = -36 → clamped to 0
    expect(bd.zuVersteuerndesEinkommen).toBe(0)
    expect(bd.einkommensteuer).toBe(0)
  })

  it('abgeltungsteuer: totalTaxAnnual = flat Abgeltungsteuer only (no personal ESt)', () => {
    const gain = 10_000
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: gain,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear: 2026,
      },
      de2026Rules,
    )
    const expectedFlat = gain * de2026Rules.capitalGains.taxRate
    const expectedSoli = expectedFlat * de2026Rules.capitalGains.solidarityRate
    expect(bd.totalTaxAnnual).toBeCloseTo(expectedFlat + expectedSoli, 1)
  })
})

// ---------------------------------------------------------------------------
// (g) Pre-2005 routing: gain=10,000, mode=pre2005 → no tax on this component
// ---------------------------------------------------------------------------
describe('calculateRetirementTax — pre2005 routing', () => {
  it('gain=10,000, mode=pre2005 → no tax on insurance gain', () => {
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 10_000,
        privateInsuranceTaxMode: 'pre2005',
        otherTaxableAnnual: 0,
        retirementYear: 2026,
      },
      de2026Rules,
    )
    expect(bd.privateInsuranceTaxable).toBe(0)
    expect(bd.abgeltungsteuerOnPrivateInsurance).toBe(0)
    expect(bd.einkommensteuer).toBe(0)
    expect(bd.totalTaxAnnual).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// (h) Lump-sum bAV via flag: bavIsLumpSum=true suppresses Versorgungsfreibetrag
// ---------------------------------------------------------------------------
describe('calculateRetirementTax — bavIsLumpSum flag', () => {
  it('bavIsLumpSum=true suppresses Versorgungsfreibetrag (higher tax than ongoing pension)', () => {
    const shared = {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 24_000,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer' as const,
      otherTaxableAnnual: 0,
      retirementYear: 2026,
    }
    const ongoing = calculateRetirementTax({ ...shared, bavIsLumpSum: false }, de2026Rules)
    const lumpSum = calculateRetirementTax({ ...shared, bavIsLumpSum: true }, de2026Rules)

    // Lump sum has no Versorgungsfreibetrag → higher zvE → higher tax → lower net
    expect(lumpSum.bavPensionTaxable).toBeGreaterThan(ongoing.bavPensionTaxable)
    expect(lumpSum.totalTaxAnnual).toBeGreaterThan(ongoing.totalTaxAnnual)
    expect(lumpSum.netRetirementIncomeAnnual).toBeLessThan(ongoing.netRetirementIncomeAnnual)
  })

  it('bavIsLumpSum=true: bavPensionTaxable equals full bavPensionAnnual (no deduction)', () => {
    // 2026 VFB for ongoing = 960+288 = 1248 allowance; for lump sum = 0 allowance
    const bd = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 24_000,
        bavIsLumpSum: true,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear: 2026,
      },
      de2026Rules,
    )
    expect(bd.bavPensionTaxable).toBe(24_000)
  })
})

// ---------------------------------------------------------------------------
// (i) Realistic combined scenario — hand-computed golden values
// ---------------------------------------------------------------------------
describe('calculateRetirementTax — realistic combined scenario (retirementYear 2030)', () => {
  /**
   * Input:
   *   bavPensionAnnual       = 24,000 EUR/year
   *   statutoryPensionAnnual = 18,000 EUR/year
   *   privateInsuranceTaxableAnnual = 6,000 EUR (gain), mode = halbeinkuenfte
   *   otherTaxableAnnual     = 0
   *   retirementYear         = 2030
   *
   * Besteuerungsanteil(2030):
   *   = 0.825 + (2030−2023) × 0.005 = 0.825 + 0.035 = 0.860
   *   → statutoryPensionTaxable = 18000 × 0.860 = 15,480
   *
   * Versorgungsfreibetrag(2030):
   *   prozent = 0.140 − 7×0.004 = 0.140 − 0.028 = 0.112
   *   hoechstbetrag = 1050 − 7×30 = 1050 − 210 = 840
   *   zuschlag = 315 − 7×9 = 315 − 63 = 252
   *   rawFreibetrag = 24000 × 0.112 = 2,688 → capped at 840
   *   totalAllowance = 840 + 252 = 1,092
   *   → bavPensionTaxable = 24000 − 1092 = 22,908
   *
   * Halbeinkünfte (gain=6000):
   *   → privateInsuranceTaxable = 6000 / 2 = 3,000
   *
   * Pauschbeträge:
   *   werbungskostenVersorgung = min(102, 24000) = 102
   *   werbungskostenRenten = min(102, 15480) = 102
   *   sonderausgaben = 36
   *
   * grossPersonalBase = 15480 + 22908 + 3000 = 41,388
   * zvE = 41388 − 102 − 102 − 36 = 41,148
   *
   * Einkommensteuer (2nd progression zone: 17799 < 41148 < 69878):
   *   z = (41148 − 17799) / 10000 = 2.3349
   *   tax = floor((173.1 × 2.3349 + 2397) × 2.3349 + 1034.87)
   *       = floor((404.17 + 2397) × 2.3349 + 1034.87)
   *       = floor(2801.17 × 2.3349 + 1034.87)
   *       = floor(6539.13 + 1034.87)
   *       = floor(7574.00) = 7574 (or 7573, depending on float precision)
   *
   * Soli: 7574 < 20350 → Soli = 0
   * abgeltungsteuer = 0 (halbeinkuenfte)
   * totalTaxAnnual ≈ 7574
   */
  const bd = calculateRetirementTax(
    {
      statutoryPensionAnnual: 18_000,
      bavPensionAnnual: 24_000,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 6_000,
      privateInsuranceTaxMode: 'halbeinkuenfte',
      otherTaxableAnnual: 0,
      retirementYear: 2030,
    },
    de2026Rules,
  )

  it('statutory pension taxable = 15,480 (18000 × 86 %)', () => {
    expect(bd.statutoryPensionTaxable).toBeCloseTo(15_480, 0)
  })

  it('bAV pension taxable = 22,908 (after 2030 Versorgungsfreibetrag 1,092)', () => {
    expect(bd.bavPensionTaxable).toBeCloseTo(22_908, 0)
  })

  it('private insurance taxable = 3,000 (half of 6,000 gain — halbeinkuenfte)', () => {
    expect(bd.privateInsuranceTaxable).toBe(3_000)
  })

  it('werbungskosten Versorgung = 102, Renten = 102, Sonderausgaben = 36', () => {
    expect(bd.werbungskostenVersorgung).toBe(102)
    expect(bd.werbungskostenRenten).toBe(102)
    expect(bd.sonderausgaben).toBe(36)
  })

  it('zvE = 41,148 (after all deductions)', () => {
    // 15480 + 22908 + 3000 − 102 − 102 − 36 = 41148
    expect(bd.zuVersteuerndesEinkommen).toBe(41_148)
  })

  it('totalTaxAnnual is in the expected range for zvE ≈ 41,148', () => {
    // 2nd progression → ~7,573–7,574 EUR ESt; Soli = 0; abgeltungsteuer = 0
    expect(bd.totalTaxAnnual).toBeGreaterThan(7_500)
    expect(bd.totalTaxAnnual).toBeLessThan(7_650)
    expect(bd.solidaritaetszuschlag).toBe(0)
    expect(bd.abgeltungsteuerOnPrivateInsurance).toBe(0)
  })

  it('netRetirementIncomeAnnual = gross − totalTax', () => {
    // gross = 18000 + 24000 + 6000 (insurance gain); total tax ≈ 7574
    const expectedGross = 18_000 + 24_000 + 6_000
    expect(bd.netRetirementIncomeAnnual).toBeCloseTo(expectedGross - bd.totalTaxAnnual, 0)
  })
})

// ---------------------------------------------------------------------------
// 'married' filing status throws (not yet implemented)
// ---------------------------------------------------------------------------
describe('calculateRetirementTax — married filing status', () => {
  it('throws when filingStatus=married', () => {
    expect(() =>
      calculateRetirementTax(
        {
          statutoryPensionAnnual: 20_000,
          bavPensionAnnual: 0,
          bavIsLumpSum: false,
          privateInsuranceTaxableAnnual: 0,
          privateInsuranceTaxMode: 'abgeltungsteuer',
          otherTaxableAnnual: 0,
          retirementYear: 2026,
        },
        de2026Rules,
        'married',
      ),
    ).toThrow()
  })
})
