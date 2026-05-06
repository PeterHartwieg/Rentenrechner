// @vitest-environment node
/**
 * Tests for the retirement-phase tax/KV/PV and diagnostic API facade.
 */
import { describe, it, expect } from 'vitest'
import {
  calculateRetirementTaxApi,
  calculateRetirementKvPvApi,
  deriveInsuranceTaxModeApi,
  deriveBavLumpSumTaxModeApi,
} from './retirement'
import type {
  RetirementTaxResponse,
  RetirementKvPvResponse,
} from './retirement'

// ---------------------------------------------------------------------------
// 1. Retirement tax with typical GRV + bAV components
// ---------------------------------------------------------------------------

describe('calculateRetirementTaxApi', () => {
  it('produces expected breakdown structure for typical GRV + bAV components', () => {
    const result = calculateRetirementTaxApi({
      components: {
        statutoryPensionAnnual: 18_000,
        bavPensionAnnual: 6_000,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'halbeinkuenfte',
        otherTaxableAnnual: 0,
        retirementYear: 2063,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.meta.apiVersion).toBe('v1')
    expect(typeof result.meta.ruleYear).toBe('number')

    const d = result.data
    expect(typeof d.statutoryPensionTaxable).toBe('number')
    expect(typeof d.bavPensionTaxable).toBe('number')
    expect(typeof d.privateInsuranceTaxable).toBe('number')
    expect(typeof d.otherTaxable).toBe('number')
    expect(typeof d.werbungskostenVersorgung).toBe('number')
    expect(typeof d.werbungskostenRenten).toBe('number')
    expect(typeof d.sonderausgaben).toBe('number')
    expect(typeof d.zuVersteuerndesEinkommen).toBe('number')
    expect(typeof d.einkommensteuer).toBe('number')
    expect(typeof d.solidaritaetszuschlag).toBe('number')
    expect(typeof d.abgeltungsteuerOnPrivateInsurance).toBe('number')
    expect(typeof d.totalTaxAnnual).toBe('number')
    expect(typeof d.netRetirementIncomeAnnual).toBe('number')

    // Sanity: with 18k GRV + 6k bAV, there should be some tax
    expect(d.einkommensteuer).toBeGreaterThan(0)
    expect(d.totalTaxAnnual).toBeGreaterThan(0)
    // Net should be less than total gross
    expect(d.netRetirementIncomeAnnual).toBeLessThan(18_000 + 6_000)
    expect(d.netRetirementIncomeAnnual).toBeGreaterThan(0)

    // GRV taxable should be at most gross (Besteuerungsanteil applied)
    expect(d.statutoryPensionTaxable).toBeLessThanOrEqual(18_000)
    // bAV taxable should be at most gross (Versorgungsfreibetrag may be 0 for late retirement years)
    expect(d.bavPensionTaxable).toBeLessThanOrEqual(6_000)
  })

  it('returns INVALID_INPUT when components is undefined', () => {
    const result = calculateRetirementTaxApi({
      components: undefined as never,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })

  it('returns INVALID_INPUT when a numeric field is a string', () => {
    const result = calculateRetirementTaxApi({
      components: {
        statutoryPensionAnnual: 'bad' as unknown as number,
        bavPensionAnnual: 6_000,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'halbeinkuenfte',
        otherTaxableAnnual: 0,
        retirementYear: 2063,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
    expect(result.errors.some((e) => e.path.includes('statutoryPensionAnnual'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. Retirement KV/PV with typical source channels
// ---------------------------------------------------------------------------

describe('calculateRetirementKvPvApi', () => {
  it('produces expected breakdown for typical sources', () => {
    const result = calculateRetirementKvPvApi({
      context: {
        bavMonthlyVersorgungsbezuege: 500,
        otherMonthlyVersorgungsbezuege: 0,
        monthlyStatutoryPension: 1_500,
        freiwilligOtherMonthlyIncome: 0,
        isFreiwilligVersichert: false,
        kvFreibetragVersorgungMonthly: 176.75,
        pvFreigrenzeVersorgungMonthly: 176.75,
        monthlyKvPvBbg: 5_512.50,
        healthRate: 0.169,
        careRate: 0.034,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const d = result.data
    expect(typeof d.bavKvMonthly).toBe('number')
    expect(typeof d.bavPvMonthly).toBe('number')
    expect(typeof d.statutoryPensionKvMonthly).toBe('number')
    expect(typeof d.statutoryPensionPvMonthly).toBe('number')
    expect(typeof d.freiwilligOtherKvMonthly).toBe('number')
    expect(typeof d.freiwilligOtherPvMonthly).toBe('number')
    expect(typeof d.totalKvMonthly).toBe('number')
    expect(typeof d.totalPvMonthly).toBe('number')
    expect(typeof d.uncappedKvMonthly).toBe('number')
    expect(typeof d.uncappedPvMonthly).toBe('number')

    // KVdR member with bAV Versorgungsbezuege should have KV and PV contributions
    expect(d.bavKvMonthly).toBeGreaterThan(0)
    expect(d.statutoryPensionKvMonthly).toBeGreaterThan(0)
    expect(d.totalKvMonthly).toBeGreaterThan(0)
    expect(d.totalPvMonthly).toBeGreaterThan(0)

    // Not freiwillig versichert -> freiwillig other should be 0
    expect(d.freiwilligOtherKvMonthly).toBe(0)
    expect(d.freiwilligOtherPvMonthly).toBe(0)
  })

  it('returns INVALID_INPUT when context is undefined', () => {
    const result = calculateRetirementKvPvApi({
      context: undefined as never,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })

  it('returns INVALID_INPUT when a numeric field is NaN', () => {
    const result = calculateRetirementKvPvApi({
      context: {
        bavMonthlyVersorgungsbezuege: NaN,
        otherMonthlyVersorgungsbezuege: 0,
        monthlyStatutoryPension: 1_500,
        freiwilligOtherMonthlyIncome: 0,
        isFreiwilligVersichert: false,
        kvFreibetragVersorgungMonthly: 176.75,
        pvFreigrenzeVersorgungMonthly: 176.75,
        monthlyKvPvBbg: 5_512.50,
        healthRate: 0.169,
        careRate: 0.034,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. Insurance tax mode: contract 2020, runtime 12, retirement 67 -> 'halbeinkuenfte'
// ---------------------------------------------------------------------------

describe('deriveInsuranceTaxModeApi', () => {
  it('returns halbeinkuenfte for 2020 contract, 12y runtime, age 67', () => {
    const result = deriveInsuranceTaxModeApi({
      contractStartYear: 2020,
      contractRuntimeYears: 12,
      retirementAge: 67,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.taxMode).toBe('halbeinkuenfte')
    expect(result.data.contractStartYear).toBe(2020)
    expect(result.data.contractRuntimeYears).toBe(12)
    expect(result.data.retirementAge).toBe(67)
  })

  // ---------------------------------------------------------------------------
  // 4. Insurance tax mode: contract started 1995 -> 'pre2005'
  // ---------------------------------------------------------------------------

  it('returns pre2005 for 1995 contract with eligible flag', () => {
    const result = deriveInsuranceTaxModeApi({
      contractStartYear: 1995,
      contractRuntimeYears: 30,
      retirementAge: 67,
      oldContractTaxFreeEligible: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.taxMode).toBe('pre2005')
  })

  it('returns abgeltungsteuer for short contract', () => {
    const result = deriveInsuranceTaxModeApi({
      contractStartYear: 2020,
      contractRuntimeYears: 5,
      retirementAge: 67,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.taxMode).toBe('abgeltungsteuer')
  })

  it('returns INVALID_INPUT when contractStartYear is not a number', () => {
    const result = deriveInsuranceTaxModeApi({
      contractStartYear: 'bad' as unknown as number,
      contractRuntimeYears: 12,
      retirementAge: 67,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. bAV lump sum tax mode: direktversicherung_3_63 -> 'voll_versorgungsbezug'
// ---------------------------------------------------------------------------

describe('deriveBavLumpSumTaxModeApi', () => {
  it('returns voll_versorgungsbezug for direktversicherung_3_63', () => {
    const result = deriveBavLumpSumTaxModeApi({
      durchfuehrungsweg: 'direktversicherung_3_63',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.taxMode).toBe('voll_versorgungsbezug')
    expect(result.data.durchfuehrungsweg).toBe('direktversicherung_3_63')
  })

  // ---------------------------------------------------------------------------
  // 6. bAV lump sum tax mode: direktversicherung_40b_alt with pre2005 -> 'pre2005_steuerfrei'
  // ---------------------------------------------------------------------------

  it('returns pre2005_steuerfrei for 40b_alt with pre2005 eligible', () => {
    const result = deriveBavLumpSumTaxModeApi({
      durchfuehrungsweg: 'direktversicherung_40b_alt',
      pre2005EligibleTaxFree: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.taxMode).toBe('pre2005_steuerfrei')
  })

  it('returns fuenftelregelung for direktzusage', () => {
    const result = deriveBavLumpSumTaxModeApi({
      durchfuehrungsweg: 'direktzusage',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.taxMode).toBe('fuenftelregelung')
  })

  it('returns INVALID_INPUT when durchfuehrungsweg is not a string', () => {
    const result = deriveBavLumpSumTaxModeApi({
      durchfuehrungsweg: 123 as unknown as 'direktversicherung_3_63',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'INVALID_INPUT')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. Invalid rule year returns error
// ---------------------------------------------------------------------------

describe('invalid rule year', () => {
  it('retirement tax returns error for unsupported rule year', () => {
    const result = calculateRetirementTaxApi({
      ruleYear: 9999,
      components: {
        statutoryPensionAnnual: 18_000,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'halbeinkuenfte',
        otherTaxableAnnual: 0,
        retirementYear: 2063,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_RULE_YEAR')).toBe(true)
  })

  it('retirement KV/PV returns error for unsupported rule year', () => {
    const result = calculateRetirementKvPvApi({
      ruleYear: 9999,
      context: {
        bavMonthlyVersorgungsbezuege: 0,
        otherMonthlyVersorgungsbezuege: 0,
        monthlyStatutoryPension: 1_500,
        freiwilligOtherMonthlyIncome: 0,
        isFreiwilligVersichert: false,
        kvFreibetragVersorgungMonthly: 176.75,
        pvFreigrenzeVersorgungMonthly: 176.75,
        monthlyKvPvBbg: 5_512.50,
        healthRate: 0.169,
        careRate: 0.034,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_RULE_YEAR')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 8. JSON serializable responses
// ---------------------------------------------------------------------------

describe('JSON serializable', () => {
  it('retirement tax round-trips through JSON', () => {
    const result = calculateRetirementTaxApi({
      components: {
        statutoryPensionAnnual: 18_000,
        bavPensionAnnual: 6_000,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'halbeinkuenfte',
        otherTaxableAnnual: 0,
        retirementYear: 2063,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = JSON.parse(JSON.stringify(result.data)) as RetirementTaxResponse
    expect(parsed.einkommensteuer).toBe(result.data.einkommensteuer)
    expect(parsed.totalTaxAnnual).toBe(result.data.totalTaxAnnual)
    expect(parsed.netRetirementIncomeAnnual).toBe(result.data.netRetirementIncomeAnnual)
  })

  it('retirement KV/PV round-trips through JSON', () => {
    const result = calculateRetirementKvPvApi({
      context: {
        bavMonthlyVersorgungsbezuege: 500,
        otherMonthlyVersorgungsbezuege: 0,
        monthlyStatutoryPension: 1_500,
        freiwilligOtherMonthlyIncome: 0,
        isFreiwilligVersichert: false,
        kvFreibetragVersorgungMonthly: 176.75,
        pvFreigrenzeVersorgungMonthly: 176.75,
        monthlyKvPvBbg: 5_512.50,
        healthRate: 0.169,
        careRate: 0.034,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = JSON.parse(JSON.stringify(result.data)) as RetirementKvPvResponse
    expect(parsed.totalKvMonthly).toBe(result.data.totalKvMonthly)
    expect(parsed.totalPvMonthly).toBe(result.data.totalPvMonthly)
  })

  it('insurance tax mode response round-trips through JSON', () => {
    const result = deriveInsuranceTaxModeApi({
      contractStartYear: 2020,
      contractRuntimeYears: 12,
      retirementAge: 67,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = JSON.parse(JSON.stringify(result.data))
    expect(parsed.taxMode).toBe(result.data.taxMode)
  })

  it('bAV lump sum tax mode response round-trips through JSON', () => {
    const result = deriveBavLumpSumTaxModeApi({
      durchfuehrungsweg: 'direktversicherung_3_63',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = JSON.parse(JSON.stringify(result.data))
    expect(parsed.taxMode).toBe(result.data.taxMode)
  })
})
