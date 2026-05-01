import type { EtfPayoutRow, GermanRules } from '../domain'
import { monthlyRate } from './payoutMath'
import { calculateCapitalGainsTax } from './tax'

export function afterTaxInvestmentCapital(
  capital: number,
  totalContributions: number,
  rules: GermanRules,
  partialExemption: number,
  cumulativeVorabpauschale = 0,
): number {
  // Vorabpauschale already taxed during accumulation reduces the remaining taxable exit gain (§19 InvStG).
  // Sparer-Pauschbetrag applies in the liquidation year (EStG §20 Abs. 9), consistent with etfPayoutSchedule.
  const gain = Math.max(0, capital - totalContributions - cumulativeVorabpauschale)
  return capital - calculateCapitalGainsTax(gain, rules, partialExemption, rules.capitalGains.saverAllowance)
}

// Year-by-year ETF payout schedule (#37). Tracks remaining capital, cost basis, and tax each year.
// grossMonthlyPayout must equal monthlyPayoutFromCapital(capitalAtRetirement, payoutReturn, payoutYears)
// so that capital depletes to ~0 at the end of the schedule.
// cumulativeVorabpauschale shifts the cost basis per §19 InvStG (already-taxed VP is not taxed again).
export function etfPayoutSchedule(
  capitalAtRetirement: number,
  totalContributions: number,
  cumulativeVorabpauschale: number,
  grossMonthlyPayout: number,
  payoutYears: number,
  payoutReturn: number,
  retirementAge: number,
  rules: GermanRules,
  partialExemption: number,
): EtfPayoutRow[] {
  if (capitalAtRetirement <= 0 || payoutYears <= 0) return []

  const annualWithdrawal = grossMonthlyPayout * 12
  let capital = capitalAtRetirement
  // VP already taxed during accumulation extends the cost basis — double-tax protection §19 InvStG.
  let costBasis = Math.min(totalContributions + cumulativeVorabpauschale, capitalAtRetirement)

  // Annuity factor r/r_m aligns the yearly capital formula with monthlyPayoutFromCapital.
  // C_end = C_start*(1+r) − PMT*(r/r_m) depletes to 0 in exactly payoutYears years when
  // PMT = monthlyPayoutFromCapital(C0, r, payoutYears).
  const r_m = Math.abs(payoutReturn) < 1e-9 ? 0 : monthlyRate(payoutReturn)
  const annuityFactor = Math.abs(r_m) < 1e-9 ? 12 : payoutReturn / r_m

  const rows: EtfPayoutRow[] = []

  for (let year = 1; year <= payoutYears; year++) {
    const capitalAtStart = Math.max(0, capital)
    const gainRatio = capitalAtStart > 0
      ? Math.max(0, (capitalAtStart - costBasis) / capitalAtStart)
      : 0
    const rawTaxableGain = annualWithdrawal * gainRatio
    const taxableAfterExemption = rawTaxableGain * (1 - partialExemption)
    const saverAllowanceUsed = Math.min(taxableAfterExemption, rules.capitalGains.saverAllowance)
    const taxDue = calculateCapitalGainsTax(
      rawTaxableGain,
      rules,
      partialExemption,
      rules.capitalGains.saverAllowance,
    )
    const netAnnualPayout = Math.max(0, annualWithdrawal - taxDue)

    const fractionWithdrawn = capitalAtStart > 0 ? Math.min(1, annualWithdrawal / capitalAtStart) : 0
    costBasis = Math.max(0, costBasis * (1 - fractionWithdrawn))
    capital = Math.max(0, capitalAtStart * (1 + payoutReturn) - grossMonthlyPayout * annuityFactor)

    rows.push({
      year,
      age: retirementAge + year - 1,
      capitalAtStart,
      grossAnnualPayout: annualWithdrawal,
      taxableGain: rawTaxableGain,
      saverAllowanceUsed,
      taxDue,
      netAnnualPayout,
      netMonthlyPayout: netAnnualPayout / 12,
      capitalAtEnd: capital,
      remainingCostBasis: costBasis,
    })
  }

  return rows
}
