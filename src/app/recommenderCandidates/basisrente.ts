/**
 * Basisrente (Rürup-Rente) candidate generator.
 *
 * Always generates a NEW-instance candidate — the recommender does not top-up
 * an existing Basisrente contract because Basisrente contributions have no
 * per-contract minimum and a new contract can be opened at any time.
 *
 * Net-cost sizing uses `solveBasisrenteGrossFromNet` (bisection on the §10
 * Abs. 3 EStG Sonderausgabenabzug marginal saving). Gross is clamped to the
 * remaining Schicht-1 cap.
 *
 * Basisrente has no capital payout option (§10 Abs. 1 Nr. 2 b EStG), so
 * `afterTaxLumpSum` is always null and the candidate is flagged `payoutOnly`.
 */

import type { BasisrenteInstance } from '../../domain/instances'
import { defaultAssumptions } from '../../data/defaultScenario'
import { calculateBasisrenteFunding, solveBasisrenteGrossFromNet } from '../../engine/basisrente'
import { calculateSalaryResult } from '../../engine/salary'
import { newInstanceId } from '../workspaceIdentity'
import {
  type CandidateDraft,
  type GeneratorContext,
  projectMonthlyContributionFV,
  synthesizeProductResult,
} from './types'

export function makeBasisrenteCandidate(g: GeneratorContext): CandidateDraft | null {
  const profile = g.workspace.baseline.profile
  // Build a synthetic Basisrente assumption block from the default plus a
  // typical fee profile. The funding helper needs a SalaryResult — recompute
  // from the profile (no bAV conversion baked in; the recommender's bAV
  // candidate is independent).
  const salary = calculateSalaryResult(profile, g.rules, 0)
  const synthetic = {
    monthlyGrossContribution: 0,
    payoutMode: 'leibrente' as const,
    rentenfaktor: defaultAssumptions.basisrente.rentenfaktor,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
    fees: defaultAssumptions.basisrente.fees,
  }
  const isolatedGross = solveBasisrenteGrossFromNet(
    g.marginalMonthlyEUR,
    g.rules,
    salary,
    synthetic,
  )
  if (isolatedGross <= 0) return null

  // Clamp to remaining Schicht-1 cap.
  const fundingAtFull = calculateBasisrenteFunding(g.rules, salary, {
    ...synthetic,
    monthlyGrossContribution: isolatedGross,
  })
  const remainingMonthly = fundingAtFull.remainingSchicht1Cap / 12
  const cappedToRemaining = isolatedGross > remainingMonthly
  const gross = Math.min(isolatedGross, Math.max(0, remainingMonthly))
  if (gross <= 0) return null

  const fundingForGross = calculateBasisrenteFunding(g.rules, salary, {
    ...synthetic,
    monthlyGrossContribution: gross,
  })
  const netCash = Math.max(0, fundingForGross.monthlyNetCost)

  const fees = (synthetic.fees.wrapperAssetFee ?? 0) + (synthetic.fees.fundAssetFee ?? 0)
  const netReturn = Math.max(-0.5, g.basis.annualReturn - fees)
  const capital = projectMonthlyContributionFV(gross, netReturn, g.yearsToRetirement)
  const totalContributions = gross * 12 * g.yearsToRetirement
  const grossPayout = (capital / 10_000) * synthetic.rentenfaktor

  const newInstanceIdStr = newInstanceId('basisrente')
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

  const newInstance: BasisrenteInstance = {
    instanceId: newInstanceIdStr,
    label: 'Neue Rürup-Rente',
    status: 'active',
    contractStartYear: g.rules.year,
    evidenceMap: {},
    monthlyGrossContribution: gross,
    payoutMode: 'leibrente',
    rentenfaktor: synthetic.rentenfaktor,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
    fees: { ...synthetic.fees },
  }

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
