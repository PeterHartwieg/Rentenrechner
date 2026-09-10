import { describe, expect, it } from 'vitest'
import {
  calculateAllowanceExcessBenefit,
  calculateSalaryPhaseTaxDelta,
  isSection10aEligible,
} from './salaryPhaseFunding'
import { de2026Rules } from '../rules/de2026'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'

const rules = de2026Rules

// Helper: expected combined tax (income + soli) for a given zvE.
function combinedTax(zvE: number) {
  const it = calculateIncomeTax2026(zvE, rules)
  return it + calculateSolidarityTax(it, rules)
}

describe('calculateSalaryPhaseTaxDelta', () => {
  it('returns correct taxable-income values', () => {
    const result = calculateSalaryPhaseTaxDelta(rules, 60_000, 5_000)
    expect(result.taxableIncomeWithout).toBe(60_000)
    expect(result.taxableIncomeWith).toBe(55_000)
  })

  it('taxWithout and taxWith match direct calculation', () => {
    const result = calculateSalaryPhaseTaxDelta(rules, 60_000, 5_000)
    expect(result.taxWithout).toBeCloseTo(combinedTax(60_000), 5)
    expect(result.taxWith).toBeCloseTo(combinedTax(55_000), 5)
  })

  it('taxSavingAnnual equals taxWithout − taxWith', () => {
    const result = calculateSalaryPhaseTaxDelta(rules, 60_000, 5_000)
    expect(result.taxSavingAnnual).toBeCloseTo(result.taxWithout - result.taxWith, 5)
  })

  it('taxSavingAnnual is positive for a typical income and nonzero deduction', () => {
    const result = calculateSalaryPhaseTaxDelta(rules, 50_000, 3_000)
    expect(result.taxSavingAnnual).toBeGreaterThan(0)
  })

  it('zero deduction → zero saving', () => {
    const result = calculateSalaryPhaseTaxDelta(rules, 50_000, 0)
    expect(result.taxSavingAnnual).toBe(0)
    expect(result.taxableIncomeWith).toBe(result.taxableIncomeWithout)
  })

  it('deduction larger than income clamps taxableIncomeWith to 0', () => {
    const result = calculateSalaryPhaseTaxDelta(rules, 5_000, 100_000)
    expect(result.taxableIncomeWith).toBe(0)
    // taxWith should be 0 or very small (within the Grundfreibetrag)
    expect(result.taxWith).toBe(0)
  })

  it('zero income → zero saving regardless of deduction', () => {
    const result = calculateSalaryPhaseTaxDelta(rules, 0, 2_000)
    expect(result.taxSavingAnnual).toBe(0)
  })

  it('taxSavingAnnual is never negative', () => {
    // Edge case: deduction = 0, large income
    const a = calculateSalaryPhaseTaxDelta(rules, 200_000, 0)
    expect(a.taxSavingAnnual).toBeGreaterThanOrEqual(0)
    // Edge case: income below Grundfreibetrag
    const b = calculateSalaryPhaseTaxDelta(rules, 1_000, 500)
    expect(b.taxSavingAnnual).toBeGreaterThanOrEqual(0)
  })
})

describe('calculateAllowanceExcessBenefit', () => {
  it('returns 0 when tax saving equals allowance (Günstigerprüfung not beneficial)', () => {
    expect(calculateAllowanceExcessBenefit(540, 540)).toBe(0)
  })

  it('returns 0 when tax saving is less than allowance', () => {
    expect(calculateAllowanceExcessBenefit(300, 540)).toBe(0)
  })

  it('returns the excess when tax saving exceeds allowance', () => {
    expect(calculateAllowanceExcessBenefit(800, 540)).toBeCloseTo(260, 5)
  })

  it('returns full tax saving when allowance is zero (no allowances)', () => {
    expect(calculateAllowanceExcessBenefit(500, 0)).toBeCloseTo(500, 5)
  })

  it('returns 0 when both inputs are zero', () => {
    expect(calculateAllowanceExcessBenefit(0, 0)).toBe(0)
  })
})

describe('isSection10aEligible (#363)', () => {
  it('accepts a directly eligible saver', () => {
    expect(isSection10aEligible({ directlyEligible: true, indirectSpouseEligible: false })).toBe(true)
  })

  it('accepts the mittelbar spouse (§79 Satz 2 EStG)', () => {
    expect(isSection10aEligible({ directlyEligible: false, indirectSpouseEligible: true })).toBe(true)
  })

  it('rejects a saver outside the begünstigter Personenkreis', () => {
    expect(isSection10aEligible({ directlyEligible: false, indirectSpouseEligible: false })).toBe(false)
  })

  it('treats an omitted indirectSpouseEligible as false (Riester stored state)', () => {
    expect(isSection10aEligible({ directlyEligible: false })).toBe(false)
    expect(isSection10aEligible({ directlyEligible: false, indirectSpouseEligible: undefined })).toBe(false)
  })
})
