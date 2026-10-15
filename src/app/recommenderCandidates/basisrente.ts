/**
 * Basisrente (Rürup-Rente) candidate generator.
 *
 * Always generates a NEW-instance candidate — the recommender does not top-up
 * an existing Basisrente contract because Basisrente contributions have no
 * per-contract minimum and a new contract can be opened at any time.
 *
 * Net-cost sizing bisects the actual incremental portfolio funding cost,
 * including any loss of existing AVD/Riester refunds after the new Basisrente
 * deduction. Gross stays within the remaining Schicht-1 cap.
 *
 * Basisrente has no capital payout option (§10 Abs. 1 Nr. 2 b EStG), so
 * `afterTaxLumpSum` is always null and the candidate is flagged `payoutOnly`.
 */

import type { BasisrenteInstance } from '../../domain/instances'
import { defaultAssumptions } from '../../data/defaultScenario'
import { buildPortfolioFunding } from '../../engine/portfolioFunding'
import type { PortfolioFunding } from '../../domain/workspace'
import { newInstanceId } from '../workspaceIdentity'
import {
  type CandidateDraft,
  type GeneratorContext,
  projectMonthlyContributionFV,
  synthesizeProductResult,
} from './types'

export function makeBasisrenteCandidate(g: GeneratorContext): CandidateDraft | null {
  // Build a synthetic Basisrente assumption block from the default plus a
  // typical fee profile. Use the same post-bAV salary and Schicht-1 headroom
  // snapshot as combine simulation.
  const synthetic = {
    monthlyGrossContribution: 0,
    payoutMode: 'leibrente' as const,
    rentenfaktor: defaultAssumptions.basisrente.rentenfaktor,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
    fees: defaultAssumptions.basisrente.fees,
  }
  const remainingMonthly = g.portfolioFunding.headroom.basisrente.remainingAnnual / 12
  if (g.marginalMonthlyEUR <= 0 || remainingMonthly <= 0) return null
  const newInstanceIdStr = newInstanceId('basisrente')
  const makeInstance = (monthlyGrossContribution: number): BasisrenteInstance => ({
    ...synthetic,
    instanceId: newInstanceIdStr,
    label: 'Neue Rürup-Rente',
    status: 'active',
    contractStartYear: g.rules.year,
    evidenceMap: {},
    monthlyGrossContribution,
    fees: { ...synthetic.fees },
  })
  const netFundingCost = (funding: PortfolioFunding): number => [
    funding.basisrenteByInstanceId,
    funding.altersvorsorgedepotByInstanceId,
    funding.riesterByInstanceId,
  ].flatMap((entries) => Object.values(entries))
    .reduce((sum, entry) => sum + entry.monthlyNetCost, 0)
  const baselineNetCost = netFundingCost(g.portfolioFunding)
  const incrementalCost = (monthlyGrossContribution: number): number => {
    const prospectiveFunding = buildPortfolioFunding({
      ...g.workspace,
      baseline: {
        ...g.workspace.baseline,
        assumptions: {
          ...g.workspace.baseline.assumptions,
          basisrente: [...g.workspace.baseline.assumptions.basisrente, makeInstance(monthlyGrossContribution)],
        },
      },
    }, g.rules)
    return Math.max(0, netFundingCost(prospectiveFunding) - baselineNetCost)
  }
  const maximumNetCost = incrementalCost(remainingMonthly)
  const cappedToRemaining = maximumNetCost < g.marginalMonthlyEUR
  let gross = remainingMonthly
  if (maximumNetCost > g.marginalMonthlyEUR) {
    let lo = 0
    let hi = remainingMonthly
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (incrementalCost(mid) <= g.marginalMonthlyEUR) lo = mid
      else hi = mid
    }
    gross = lo
  }
  if (gross <= 0) return null
  const netCash = incrementalCost(gross)

  const fees = (synthetic.fees.wrapperAssetFee ?? 0) + (synthetic.fees.fundAssetFee ?? 0)
  const netReturn = Math.max(-0.5, g.basis.annualReturn - fees)
  const capital = projectMonthlyContributionFV(gross, netReturn, g.yearsToRetirement)
  const totalContributions = gross * 12 * g.yearsToRetirement
  const grossPayout = (capital / 10_000) * synthetic.rentenfaktor

  const candidateResult = synthesizeProductResult({
    productId: 'basisrente',
    instanceId: newInstanceIdStr,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum: null,
    label: 'Neue Rürup-Rente',
  })

  const newInstance = makeInstance(gross)

  return {
    id: 'new_basisrente',
    label: 'Neue Rürup-Rente',
    productId: 'basisrente',
    isNewInstance: true,
    grossMonthlyEUR: gross,
    netCashOutEUR: netCash,
    cappedToRemaining,
    candidateResult,
    newInstance,
    mcInputs: { monthlyContribution: gross, totalFeeDecimal: fees },
  }
}
