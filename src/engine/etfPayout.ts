import type { EtfPayoutRow, GermanRules } from '../domain'
import { monthlyRate } from './payoutMath'
import { calculateCapitalGainsTax } from './tax'

/** Taxable demand before allowance for a hypothetical full liquidation. */
export function etfLiquidationTaxableDemand(capital: number, costBasis: number,
  cumulativeVorabpauschale: number, partialExemption: number): number {
  return Math.max(0, capital - costBasis - cumulativeVorabpauschale) * (1 - partialExemption)
}

export function afterTaxInvestmentCapital(
  capital: number,
  totalContributions: number,
  rules: GermanRules,
  partialExemption: number,
  cumulativeVorabpauschale = 0,
  saverAllowance: number = rules.capitalGains.saverAllowance,
): number {
  // Vorabpauschale already taxed during accumulation reduces the remaining taxable exit gain (§19 InvStG).
  // Sparer-Pauschbetrag applies in the liquidation year (EStG §20 Abs. 9), consistent with etfPayoutSchedule.
  // `saverAllowance` defaults to the full statutory amount; combine-mode passes a
  // shared share so 2+ ETF instances do not each claim the full allowance.
  const demand = etfLiquidationTaxableDemand(capital, totalContributions, cumulativeVorabpauschale, partialExemption)
  return capital - calculateCapitalGainsTax(demand, rules, 0, saverAllowance)
}

// Year-by-year ETF payout schedule (#37). Tracks remaining capital, cost basis, and tax each year.
// grossMonthlyPayout must equal monthlyPayoutFromCapital(capitalAtRetirement, payoutReturn, payoutYears)
// so that capital depletes to ~0 at the end of the schedule.
// cumulativeVorabpauschale shifts the cost basis per §19 InvStG (already-taxed VP is not taxed again).
//
// `saverAllowanceOverride(yearIndex)` (0-based) lets combine-mode share the §20
// Abs. 9 EStG Sparerpauschbetrag across multiple ETF instances per year (Phase G
// M4 F3). When omitted, each call consumes the full per-taxpayer allowance —
// correct for compare-mode and length-1 portfolios.
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
  saverAllowanceOverride?: (yearIndex: number) => number,
): EtfPayoutRow[] {
  if (capitalAtRetirement <= 0 || payoutYears <= 0) return []

  let capital = capitalAtRetirement
  // Keep basis above market value for portfolios with unrealized losses. Already-taxed
  // VP extends basis; neither it nor losses disappear before the corresponding sale.
  let costBasis = Math.max(0, totalContributions + cumulativeVorabpauschale)
  // Match the return bound used by monthlyPayoutFromCapital.
  const monthlyReturn = monthlyRate(Math.max(-0.99, payoutReturn))
  const rows: EtfPayoutRow[] = []

  for (let year = 1; year <= payoutYears; year++) {
    const capitalAtStart = capital
    let annualWithdrawal = 0
    let rawTaxableGain = 0
    // Average-cost simplification (not FIFO): growth precedes each end-of-month
    // sale, whose proceeds and disposed basis use the same fraction of holdings.
    for (let month = 0; month < 12; month++) {
      capital *= 1 + monthlyReturn
      const withdrawal = Math.min(capital, Math.max(0, grossMonthlyPayout))
      const fractionSold = capital > 0 ? withdrawal / capital : 0
      const disposedBasis = costBasis * fractionSold
      rawTaxableGain += withdrawal - disposedBasis
      annualWithdrawal += withdrawal
      costBasis *= 1 - fractionSold
      capital = Math.max(0, capital - withdrawal)
    }
    // Net this year's realized losses against gains before the annual tax calculation.
    rawTaxableGain = Math.max(0, rawTaxableGain)
    const taxableAfterExemption = rawTaxableGain * (1 - partialExemption)
    const allowanceThisYear = saverAllowanceOverride
      ? saverAllowanceOverride(year - 1)
      : rules.capitalGains.saverAllowance
    const saverAllowanceUsed = Math.min(taxableAfterExemption, allowanceThisYear)
    const taxDue = calculateCapitalGainsTax(
      rawTaxableGain,
      rules,
      partialExemption,
      allowanceThisYear,
    )
    const netAnnualPayout = Math.max(0, annualWithdrawal - taxDue)

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
