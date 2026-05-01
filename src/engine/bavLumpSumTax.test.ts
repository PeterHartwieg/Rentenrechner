/**
 * Tests for #48: bAV lump-sum income-tax routing by Durchführungsweg.
 *
 * Covers:
 * a. deriveBavLumpSumTaxMode truth table — one case per Durchführungsweg + 40b conditional cases
 * b. afterTaxBavLumpSum voll_versorgungsbezug routing — lower net than Fünftelregelung
 * c. afterTaxBavLumpSum pre2005_steuerfrei — income tax = 0, KV/PV still applied
 * d. afterTaxBavLumpSum fuenftelregelung regression — existing behavior preserved
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import type { PersonalProfile } from '../domain'
import { afterTaxBavLumpSum, deriveBavLumpSumTaxMode } from './bavPayout'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'

// PKV profile: no KV/PV deductions — isolates income tax effect
const pkvProfile: PersonalProfile = { ...defaultProfile, publicHealthInsurance: false }

// ============================================================
// a. deriveBavLumpSumTaxMode truth table
// ============================================================
describe('deriveBavLumpSumTaxMode — truth table (#48)', () => {
  it('direktversicherung_3_63 → voll_versorgungsbezug', () => {
    expect(deriveBavLumpSumTaxMode('direktversicherung_3_63', false)).toBe('voll_versorgungsbezug')
    expect(deriveBavLumpSumTaxMode('direktversicherung_3_63', true)).toBe('voll_versorgungsbezug')
  })

  it('pensionskasse_3_63 → voll_versorgungsbezug', () => {
    expect(deriveBavLumpSumTaxMode('pensionskasse_3_63', false)).toBe('voll_versorgungsbezug')
    expect(deriveBavLumpSumTaxMode('pensionskasse_3_63', true)).toBe('voll_versorgungsbezug')
  })

  it('pensionsfonds_3_63 → voll_versorgungsbezug', () => {
    expect(deriveBavLumpSumTaxMode('pensionsfonds_3_63', false)).toBe('voll_versorgungsbezug')
    expect(deriveBavLumpSumTaxMode('pensionsfonds_3_63', true)).toBe('voll_versorgungsbezug')
  })

  it('direktversicherung_40b_alt + pre2005EligibleTaxFree=true → pre2005_steuerfrei', () => {
    expect(deriveBavLumpSumTaxMode('direktversicherung_40b_alt', true)).toBe('pre2005_steuerfrei')
  })

  it('direktversicherung_40b_alt + pre2005EligibleTaxFree=false → voll_versorgungsbezug (conditions not met)', () => {
    expect(deriveBavLumpSumTaxMode('direktversicherung_40b_alt', false)).toBe('voll_versorgungsbezug')
  })

  it('direktzusage → fuenftelregelung', () => {
    expect(deriveBavLumpSumTaxMode('direktzusage', false)).toBe('fuenftelregelung')
    expect(deriveBavLumpSumTaxMode('direktzusage', true)).toBe('fuenftelregelung')
  })

  it('unterstuetzungskasse → fuenftelregelung', () => {
    expect(deriveBavLumpSumTaxMode('unterstuetzungskasse', false)).toBe('fuenftelregelung')
    expect(deriveBavLumpSumTaxMode('unterstuetzungskasse', true)).toBe('fuenftelregelung')
  })
})

// ============================================================
// b. afterTaxBavLumpSum voll_versorgungsbezug vs fuenftelregelung
// ============================================================
describe('afterTaxBavLumpSum — voll_versorgungsbezug vs fuenftelregelung routing (#48)', () => {
  it('voll_versorgungsbezug net is materially lower than fuenftelregelung net for a large lump sum', () => {
    // Use a large lump sum where the Fünftelregelung advantage is significant.
    // PKV profile to isolate income tax from KV/PV.
    const lumpSum = 200_000

    const netVoll = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, 0, true, de2026Rules.year, 'voll_versorgungsbezug')
    const netFuenftel = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, 0, true, de2026Rules.year, 'fuenftelregelung')

    // Fünftelregelung spreads the income spike — lower effective rate → higher net
    expect(netFuenftel).toBeGreaterThan(netVoll)

    // The difference should be material (thousands of EUR for a 200k lump sum).
    // voll_versorgungsbezug: tax on 200k at full marginal rate
    // fuenftelregelung: 5 × tax(40k) which is a much lower rate
    // Conservative lower bound: difference should be at least 5,000 EUR
    expect(netFuenftel - netVoll).toBeGreaterThan(5_000)
  })

  it('voll_versorgungsbezug: 100k lump sum, zero other income — income tax is marginal tax on full amount', () => {
    const lumpSum = 100_000
    const netVoll = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, 0, true, de2026Rules.year, 'voll_versorgungsbezug')

    // Expected: tax(otherIncome + lumpSum) − tax(otherIncome), with bavIsLumpSum=true
    // This routes through calculateRetirementTax with bavPensionAnnual = lumpSum, bavIsLumpSum=true
    // Werbungskosten 102 + Sonderausgaben 36 = 138 EUR deducted → zvE = 100_000 - 138 = 99_862
    // Tax on 99_862 via de2026 formula
    // Baseline: tax on 0 → zvE = max(0, 0 - 36) = 0 → tax = 0
    // So incomeTax ≈ tax(99_862) (marginal on lump sum)
    const zvE = lumpSum - 102 - 36 // 99_862
    const estTax = calculateIncomeTax2026(zvE, de2026Rules) + calculateSolidarityTax(calculateIncomeTax2026(zvE, de2026Rules), de2026Rules)
    const expectedNet = lumpSum - estTax

    expect(netVoll).toBeCloseTo(expectedNet, 0)
  })

  it('voll_versorgungsbezug: small lump sum below Grundfreibetrag — no income tax', () => {
    // lumpSum = 10_000: zvE = 10_000 - 102 - 36 = 9_862 < Grundfreibetrag 12_348 → tax = 0
    // Baseline: zvE = max(0, 0 - 36) = 0 → tax = 0
    // So incomeTax = 0; with GKV KVdR, KV/PV still apply via 1/120 rule
    const lumpSum = 10_000
    const netVoll = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, 0, true, de2026Rules.year, 'voll_versorgungsbezug')
    expect(netVoll).toBeCloseTo(lumpSum, 0) // no income tax (below basic allowance)
  })

  it('voll_versorgungsbezug: other income context raises marginal rate', () => {
    const lumpSum = 50_000
    const noOther = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, 0, true, de2026Rules.year, 'voll_versorgungsbezug')
    const withOther = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, 36_000, true, de2026Rules.year, 'voll_versorgungsbezug')
    // Higher other income → higher marginal rate on the lump sum → lower net
    expect(withOther).toBeLessThan(noOther)
  })
})

// ============================================================
// c. afterTaxBavLumpSum pre2005_steuerfrei
// ============================================================
describe('afterTaxBavLumpSum — pre2005_steuerfrei (#48)', () => {
  it('PKV member: income tax = 0; full lump sum returned', () => {
    const lumpSum = 100_000
    const net = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, 0, true, de2026Rules.year, 'pre2005_steuerfrei')
    // PKV: no KV/PV; income tax = 0 → net = lumpSum
    expect(net).toBeCloseTo(lumpSum, 0)
  })

  it('GKV KVdR: income tax = 0 but KV/PV via §229 SGB V 1/120 still applied', () => {
    const lumpSum = 120_000
    const steuerfrei = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true, de2026Rules.year, 'pre2005_steuerfrei')
    const fuenftelregOlder = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true, de2026Rules.year, 'fuenftelregelung')

    // pre2005_steuerfrei should be higher than fuenftelregelung (no income tax)
    expect(steuerfrei).toBeGreaterThan(fuenftelregOlder)

    // But KV/PV is still applied, so it should be less than lumpSum
    expect(steuerfrei).toBeLessThan(lumpSum)
  })

  it('GKV freiwillig: KV/PV applied at higher rate than KVdR (no Freibetrag)', () => {
    const lumpSum = 100_000
    const kvdrNet = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true, de2026Rules.year, 'pre2005_steuerfrei')
    const freiwilligNet = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, false, de2026Rules.year, 'pre2005_steuerfrei')
    // freiwillig versichert: no KV Freibetrag → higher KV deduction → lower net
    expect(freiwilligNet).toBeLessThan(kvdrNet)
  })
})

// ============================================================
// d. afterTaxBavLumpSum fuenftelregelung regression
// ============================================================
describe('afterTaxBavLumpSum — fuenftelregelung regression (#48)', () => {
  it('returns 0 for a zero lump sum', () => {
    expect(afterTaxBavLumpSum(0, defaultProfile, de2026Rules, 0, true, de2026Rules.year, 'fuenftelregelung')).toBe(0)
  })

  it('exactly at threshold × 120: no KV and no income tax', () => {
    const threshold = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly
    const lumpSum = threshold * 120 // 23,730 EUR; lumpSum/5 = 4,746 < basicAllowance → no income tax
    const result = afterTaxBavLumpSum(lumpSum, defaultProfile, de2026Rules, 0, true, de2026Rules.year, 'fuenftelregelung')
    expect(result).toBeCloseTo(lumpSum, 0) // no deductions
  })

  it('large lump sum: Fünftelregelung gives lower effective tax rate than simple marginal', () => {
    const lumpSum = 200_000
    const otherAnnual = 36_000
    const fuenftelNet = afterTaxBavLumpSum(lumpSum, pkvProfile, de2026Rules, otherAnnual, true, de2026Rules.year, 'fuenftelregelung')

    // Without Fünftelregelung (simple marginal via tax function):
    const totalTax = (income: number) => {
      const it = calculateIncomeTax2026(income, de2026Rules)
      return it + calculateSolidarityTax(it, de2026Rules)
    }
    const simpleTax = totalTax(otherAnnual + lumpSum) - totalTax(otherAnnual)
    const simpleNet = lumpSum - simpleTax

    // Fünftelregelung should result in higher net (lower effective tax rate on the spike)
    expect(fuenftelNet).toBeGreaterThan(simpleNet)
  })

  it('default scenario goldens: fuenftelregelung values match pre-#48 expectations for basis scenario', () => {
    // Regression: when explicitly using fuenftelregelung, the results should match
    // the pre-#48 defaultAssumptions behavior (before default changed to voll_versorgungsbezug).
    // The bav.basis capitalAtRetirement ≈ 379,719 EUR.
    // Using the pre-existing golden from simulate.test.ts for fuenftelregelung:
    const bavCapital = 379_719 // from simulate.test.ts
    const otherAnnual = defaultAssumptions.bav.monthlyOtherRetirementIncome * 12
    const netFuenftel = afterTaxBavLumpSum(
      bavCapital,
      defaultProfile,
      de2026Rules,
      otherAnnual,
      defaultAssumptions.bav.kvdrMember,
      de2026Rules.year + (defaultProfile.retirementAge - defaultProfile.age),
      'fuenftelregelung',
    )
    // Pre-#48 expected value for basis scenario (from simulate.test.ts): 197,753 EUR
    expect(Math.round(netFuenftel)).toBeCloseTo(197_753, -1)
  })
})

// ============================================================
// e. simulate integration: default profile now uses voll_versorgungsbezug → afterTaxLumpSum drops
// ============================================================
describe('default-profile bAV lump-sum snapshot update (#48)', () => {
  // The default durchfuehrungsweg is now direktversicherung_3_63 → voll_versorgungsbezug.
  // The lump-sum net drops materially compared to the pre-#48 Fünftelregelung golden.
  it('voll_versorgungsbezug produces lower afterTaxLumpSum than fuenftelregelung for basis scenario', () => {
    const bavCapital = 379_719
    const otherAnnual = defaultAssumptions.bav.monthlyOtherRetirementIncome * 12
    const retirementYear = de2026Rules.year + (defaultProfile.retirementAge - defaultProfile.age)

    const netVoll = afterTaxBavLumpSum(bavCapital, defaultProfile, de2026Rules, otherAnnual, defaultAssumptions.bav.kvdrMember, retirementYear, 'voll_versorgungsbezug')
    const netFuenftel = afterTaxBavLumpSum(bavCapital, defaultProfile, de2026Rules, otherAnnual, defaultAssumptions.bav.kvdrMember, retirementYear, 'fuenftelregelung')

    expect(netVoll).toBeLessThan(netFuenftel)
    // The difference should be material — Fünftelregelung saves significant tax on a ~380k payout
    expect(netFuenftel - netVoll).toBeGreaterThan(10_000)
  })
})
