/**
 * Shared salary-phase tax-delta helper.
 *
 * Encapsulates the repeated pattern across Basisrente, Altersvorsorgedepot,
 * and Riester:
 *   taxWithout = incomeTax(zvE) + soli(zvE)
 *   taxWith    = incomeTax(max(0, zvE − deduction)) + soli(max(0, zvE − deduction))
 *   taxSaving  = max(0, taxWithout − taxWith)
 *
 * Does NOT touch bAV funding — that code path lives in salary.ts and uses the
 * two-pass salary conversion instead of a simple deductible subtraction.
 */

import type { GermanRules } from '../domain'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'

/**
 * Compute the income-tax + soli saving from a salary-phase Sonderausgaben deduction.
 *
 * @param rules           - Year-specific German rules (income-tax brackets, soli threshold).
 * @param taxableIncome   - Salary-phase zvE before the deduction (from SalaryResult.taxableIncome).
 * @param deductionAnnual - Annual deductible amount (already capped/fraction-adjusted by caller).
 * @param filingStatus    - 'married' applies §32a Abs. 5 EStG Splittingtarif; defaults to 'single'.
 */
export function calculateSalaryPhaseTaxDelta(
  rules: GermanRules,
  taxableIncome: number,
  deductionAnnual: number,
  filingStatus: 'single' | 'married' = 'single',
): {
  taxableIncomeWithout: number
  taxableIncomeWith: number
  taxWithout: number
  taxWith: number
  taxSavingAnnual: number
} {
  const taxableIncomeWithout = taxableIncome
  const taxableIncomeWith = Math.max(0, taxableIncome - deductionAnnual)

  const computeTax = (zvE: number): number => {
    const ist =
      filingStatus === 'married'
        ? 2 * calculateIncomeTax2026(zvE / 2, rules)
        : calculateIncomeTax2026(zvE, rules)
    return ist + calculateSolidarityTax(ist, rules, filingStatus)
  }

  const taxWithout = computeTax(taxableIncomeWithout)
  const taxWith = computeTax(taxableIncomeWith)
  const taxSavingAnnual = Math.max(0, taxWithout - taxWith)

  return {
    taxableIncomeWithout,
    taxableIncomeWith,
    taxWithout,
    taxWith,
    taxSavingAnnual,
  }
}

/**
 * For Günstigerprüfung products (AVD, Riester): the additional cash benefit the
 * saver receives above the allowances already flowing into the contract.
 *
 * The allowances fund the contract directly; only the excess tax saving above
 * the allowance value constitutes an extra refund that reduces the saver's
 * out-of-pocket cost.
 *
 * @param taxSavingAnnual   - Total tax saving from §10a deduction (from calculateSalaryPhaseTaxDelta).
 * @param allowanceAnnual   - Total annual allowances (Grundzulage + Kinderzulage + bonus).
 */
export function calculateAllowanceExcessBenefit(
  taxSavingAnnual: number,
  allowanceAnnual: number,
): number {
  return Math.max(0, taxSavingAnnual - allowanceAnnual)
}
