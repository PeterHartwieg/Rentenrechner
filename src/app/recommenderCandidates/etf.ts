/**
 * ETF candidate generator.
 *
 * Generates a candidate that adds the marginal monthly budget on top of the
 * user's existing ETF depot. Returns null when no active/non-surrendered ETF
 * instance exists.
 *
 * Net-cost sizing: ETF has no tax deduction in the accumulation phase, so
 * gross = marginalMonthlyEUR exactly. Capital is projected via a simple
 * geometric FV. After-tax lump-sum uses `afterTaxInvestmentCapital`
 * (Abgeltungsteuer on gain with partial exemption).
 */

import { defaultAssumptions } from '../../data/defaultScenario'
import { afterTaxInvestmentCapital } from '../../engine/etfPayout'
import { monthlyPayoutFromCapital } from '../../engine/payoutMath'
import { MAX_LIFETIME_YEARS } from './constants'
import {
  type CandidateDraft,
  type GeneratorContext,
  projectMonthlyContributionFV,
  synthesizeProductResult,
} from './types'

export function makeEtfCandidate(g: GeneratorContext): CandidateDraft | null {
  const wsa = g.workspace.baseline.assumptions
  const target = wsa.etf.find((e) => e.status !== 'surrendered' && e.status !== 'offered')
  if (!target) return null
  const gross = g.marginalMonthlyEUR
  const annualFee = target.annualAssetFee ?? defaultAssumptions.etf.annualAssetFee
  const netReturn = Math.max(-0.5, g.basis.annualReturn - annualFee)
  const capital = projectMonthlyContributionFV(gross, netReturn, g.yearsToRetirement)
  const totalContributions = gross * 12 * g.yearsToRetirement
  const payoutYears = Math.max(
    1,
    Math.min(MAX_LIFETIME_YEARS, wsa.retirementEndAge - g.workspace.baseline.profile.retirementAge),
  )
  const grossPayout = monthlyPayoutFromCapital(capital, netReturn, payoutYears)
  const partialExemption = wsa.etf[0]?.equityPartialExemption ?? defaultAssumptions.etf.equityPartialExemption
  const afterTaxLumpSum = afterTaxInvestmentCapital(capital, totalContributions, g.rules, partialExemption, 0)
  // ETF payout is taxed via Abgeltungsteuer in the per-instance helper using a
  // FIFO cost-basis schedule (`etfPayoutSchedule`). The recommender's "what
  // does another €X buy" view does NOT need a year-by-year FIFO schedule for
  // ranking — we approximate `netMonthlyPayout` as
  //   grossPayout × (afterTaxLumpSum / capital)
  // (the post-exit-tax fraction of capital). This holds within ~3 % of the
  // engine's first-year netMonthlyPayout for typical horizons; combine-mode
  // production simulation is the source of truth once a candidate is saved as
  // a what-if (B4 parity test pins the gap on common shapes).
  const netRatio = capital > 0 ? Math.min(1, afterTaxLumpSum / capital) : 1
  const netPayout = grossPayout * netRatio
  const candidateResult = synthesizeProductResult({
    productId: 'etf',
    instanceId: target.instanceId,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    netMonthlyPayoutForEtf: netPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum,
    label: target.label ?? 'ETF-Depot',
  })
  return {
    id: 'add_to_existing_etf',
    label: `Zusatz auf bestehendes ETF-Depot (${target.label ?? 'ETF'})`,
    productId: 'etf',
    isNewInstance: false,
    targetInstanceId: target.instanceId,
    grossMonthlyEUR: gross,
    netCashOutEUR: gross,
    cappedToRemaining: false,
    candidateResult,
    mcInputs: { monthlyContribution: gross, totalFeeDecimal: annualFee },
  }
}
