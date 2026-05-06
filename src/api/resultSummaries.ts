/**
 * Mapping helpers that project internal engine result types into the API-owned
 * summary DTOs.  This seam prevents domain types from leaking into downstream
 * consumers (CLI, future HTTP layer, SDK).
 */

import type { ProductResult, SimulationResult, EtfProductResult } from '../domain'
import type { StatutoryPensionResult } from '../domain/products/grv'
import type { MonteCarloResult } from '../engine/monteCarlo'

// ---------------------------------------------------------------------------
// DTO types (API-owned — do not re-export engine types)
// ---------------------------------------------------------------------------

export interface ProductResultSummary {
  productId: string
  instanceId?: string
  scenarioId: string
  label: string
  monthlyUserCost: number
  capitalAtRetirement: number
  realCapitalAtRetirement: number
  afterTaxLumpSum: number | null
  grossMonthlyPayout: number
  netMonthlyPayout: number
  taxAndSvSavings: number
  accumulationRiy: number
  totalUserCost: number
  totalFees: number
}

export interface StatutoryPensionSummary {
  grossMonthlyPension: number
  netMonthlyPension: number
}

export interface FundingSummaries {
  bav: {
    monthlyGrossConversion: number
    monthlyNetCost: number
    monthlyTaxAndSvSavings: number
    monthlyEmployerContribution: number
  }
  basisrente: {
    monthlyGross: number
    monthlyNet: number
    annualTaxBenefit: number
  }
  altersvorsorgedepot: {
    monthlyOwn: number
    monthlyAllowance: number
    annualTaxBenefit: number
  }
  riester: {
    monthlyOwn: number
    monthlyAllowance: number
    annualTaxBenefit: number
  }
}

// ---------------------------------------------------------------------------
// Yearly projection row (Full detail only)
// ---------------------------------------------------------------------------

export interface YearlyRowEntry {
  productId: string
  scenarioId: string
  year: number
  age: number
  balance: number
  realBalance?: number
  contribution: number
  fees: number
  returnAmount: number
}

// ---------------------------------------------------------------------------
// ETF payout schedule (Full detail only)
// ---------------------------------------------------------------------------

export interface EtfPayoutRowEntry {
  year: number
  age: number
  grossPayout: number
  netPayout: number
  remainingCapital: number
  taxPaid: number
}

// ---------------------------------------------------------------------------
// Monte Carlo API response DTOs
// ---------------------------------------------------------------------------

export interface MonteCarloPercentilesDto {
  p5: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  p95: number
}

export interface MonteCarloProductSummaryDto {
  productId: string
  label: string
  capital: MonteCarloPercentilesDto
  netMonthlyPayout: MonteCarloPercentilesDto
  expectedCapital: number
  expectedNetMonthlyPayout: number
  bestCapitalProbability: number
  bestPensionProbability: number
  belowUserCostProbability: number
}

export interface MonteCarloYearlyBandDto {
  productId: string
  year: number
  age: number
  p10: number
  p50: number
  p90: number
}

export interface MonteCarloSummaryResponse {
  scenarioId: string
  scenarioLabel: string
  annualReturn: number
  annualVolatility: number
  runs: number
  seed: number
  productSummaries: MonteCarloProductSummaryDto[]
  /** Only included at 'full' detail level. */
  yearlyBands?: MonteCarloYearlyBandDto[]
}

// ---------------------------------------------------------------------------
// Projection functions
// ---------------------------------------------------------------------------

export function toProductResultSummary(r: ProductResult): ProductResultSummary {
  const summary: ProductResultSummary = {
    productId: r.productId,
    scenarioId: r.scenarioId,
    label: r.label,
    monthlyUserCost: r.monthlyUserCost,
    capitalAtRetirement: r.capitalAtRetirement,
    realCapitalAtRetirement: r.realCapitalAtRetirement,
    afterTaxLumpSum: r.afterTaxLumpSum,
    grossMonthlyPayout: r.grossMonthlyPayout,
    netMonthlyPayout: r.netMonthlyPayout,
    taxAndSvSavings: r.taxAndSvSavings,
    accumulationRiy: r.accumulationRiy,
    totalUserCost: r.totalUserCost,
    totalFees: r.totalFees,
  }
  if (r.instanceId !== undefined) {
    summary.instanceId = r.instanceId
  }
  return summary
}

export function toStatutoryPensionSummary(
  sp: StatutoryPensionResult,
): StatutoryPensionSummary {
  return {
    grossMonthlyPension: sp.grossMonthlyPension,
    netMonthlyPension: sp.netMonthlyPension,
  }
}

export function toFundingSummaries(sim: SimulationResult): FundingSummaries {
  return {
    bav: {
      monthlyGrossConversion: sim.bavFunding.monthlyGrossConversion,
      monthlyNetCost: sim.bavFunding.monthlyNetCost,
      monthlyTaxAndSvSavings: sim.bavFunding.monthlyTaxAndSvSavings,
      monthlyEmployerContribution: sim.bavFunding.monthlyEmployerContribution,
    },
    basisrente: {
      monthlyGross: sim.basisrenteFunding.monthlyGrossContribution,
      monthlyNet: sim.basisrenteFunding.monthlyNetCost,
      annualTaxBenefit: sim.basisrenteFunding.annualTaxSaving,
    },
    altersvorsorgedepot: {
      monthlyOwn: sim.altersvorsorgedepotFunding.monthlyOwnContribution,
      monthlyAllowance: sim.altersvorsorgedepotFunding.totalAllowanceAnnual / 12,
      annualTaxBenefit: sim.altersvorsorgedepotFunding.guenstigerpruefungBenefitAnnual,
    },
    riester: {
      monthlyOwn: sim.riesterFunding.monthlyOwnContribution,
      monthlyAllowance: sim.riesterFunding.totalAllowanceAnnual / 12,
      annualTaxBenefit: sim.riesterFunding.guenstigerpruefungBenefitAnnual,
    },
  }
}

// ---------------------------------------------------------------------------
// Yearly row entries (Full detail)
// ---------------------------------------------------------------------------

/**
 * Extract yearly projection rows from product results into flat API DTOs.
 *
 * For each product result, iterates its `.rows` array and maps each
 * `YearlyProjection` to a `YearlyRowEntry`. The `returnAmount` is derived
 * as the year-over-year balance change minus contributions plus fees.
 */
export function toYearlyRowEntries(results: ProductResult[]): YearlyRowEntry[] {
  const entries: YearlyRowEntry[] = []
  for (const r of results) {
    let prevBalance = 0
    for (const row of r.rows) {
      const contribution = row.yearlyProductContribution + row.yearlyEmployerContribution
      // Return = balance change + fees - contribution
      const returnAmount = row.balance - prevBalance - contribution + row.yearlyFees
      entries.push({
        productId: r.productId,
        scenarioId: r.scenarioId,
        year: row.year,
        age: row.age,
        balance: row.balance,
        realBalance: row.realBalance,
        contribution,
        fees: row.yearlyFees,
        returnAmount,
      })
      prevBalance = row.balance
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// ETF payout row entries (Full detail)
// ---------------------------------------------------------------------------

/**
 * Extract ETF payout schedule rows from product results.
 *
 * Finds ETF product results (those with `etfPayoutRows`) and maps each row
 * into a flat `EtfPayoutRowEntry` DTO.
 */
export function toEtfPayoutRowEntries(results: ProductResult[]): EtfPayoutRowEntry[] {
  const entries: EtfPayoutRowEntry[] = []
  for (const r of results) {
    if (r.productId !== 'etf') continue
    const etfResult = r as EtfProductResult
    for (const row of etfResult.etfPayoutRows) {
      entries.push({
        year: row.year,
        age: row.age,
        grossPayout: row.grossAnnualPayout,
        netPayout: row.netAnnualPayout,
        remainingCapital: row.capitalAtEnd,
        taxPaid: row.taxDue,
      })
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// Monte Carlo response mapping
// ---------------------------------------------------------------------------

/**
 * Map the engine's `MonteCarloResult` into an API-owned DTO.
 *
 * When `includeYearlyBands` is true (full detail), the response includes
 * per-product yearly band data. Otherwise only the product summaries are
 * included.
 */
export function toMonteCarloSummaryResponse(
  mc: MonteCarloResult,
  includeYearlyBands: boolean,
): MonteCarloSummaryResponse {
  const productSummaries: MonteCarloProductSummaryDto[] = mc.summaries.map((s) => ({
    productId: s.productId,
    label: s.label,
    capital: { ...s.capital },
    netMonthlyPayout: { ...s.netMonthlyPayout },
    expectedCapital: s.expectedCapital,
    expectedNetMonthlyPayout: s.expectedNetMonthlyPayout,
    bestCapitalProbability: s.bestCapitalProbability,
    bestPensionProbability: s.bestPensionProbability,
    belowUserCostProbability: s.belowUserCostProbability,
  }))

  const response: MonteCarloSummaryResponse = {
    scenarioId: mc.scenarioId,
    scenarioLabel: mc.scenarioLabel,
    annualReturn: mc.annualReturn,
    annualVolatility: mc.annualVolatility,
    runs: mc.runs,
    seed: mc.seed,
    productSummaries,
  }

  if (includeYearlyBands) {
    response.yearlyBands = mc.yearlyBands.map((b) => ({
      productId: b.productId,
      year: b.year,
      age: b.age,
      p10: b.p10,
      p50: b.p50,
      p90: b.p90,
    }))
  }

  return response
}
