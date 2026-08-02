/**
 * Riester top-up candidate generator.
 *
 * Generates a candidate that adds the marginal budget to the user's first
 * active (non-surrendered, non-offered) Riester instance. Returns null when no
 * such instance exists — the recommender does not generate a brand-new Riester
 * instance because eligibility (direct / indirect) must be verified first.
 *
 * Net-cost sizing uses `solveRiesterOwnFromNet` (bisection accounting for
 * Grundzulage + Kinderzulagen). Own contribution is clamped to the remaining
 * §10a annual cap (€2,100 incl. allowances).
 *
 * Riester is a §22 Nr. 5 EStG certified pension: §93 Abs. 2 EStG limits the
 * partial lump sum to ≤30 % of capital at payout start; the remainder must
 * annuitise. `afterTaxLumpSum` is null → `payoutOnly` in the UI.
 */

import { calculateRiesterFunding, solveRiesterOwnFromNet } from '../../engine/riester'
import {
  type CandidateDraft,
  type GeneratorContext,
  projectMonthlyContributionFV,
  synthesizeProductResult,
} from './types'

export function makeRiesterTopUpCandidate(g: GeneratorContext): CandidateDraft | null {
  const wsa = g.workspace.baseline.assumptions
  const target = wsa.riester.find((r) => r.status !== 'surrendered' && r.status !== 'offered')
  if (!target) return null
  const profile = g.workspace.baseline.profile
  const salary = g.portfolioFunding.salaryForOtherFunding

  const isolatedOwn = solveRiesterOwnFromNet(
    g.marginalMonthlyEUR,
    g.rules,
    salary,
    target,
    profile,
  )
  if (isolatedOwn <= 0) return null

  // Clamp to the same household-level §10a headroom snapshot as simulation.
  const remainingMonthly = g.portfolioFunding.headroom.riester.remainingAnnual / 12
  const cappedToRemaining = isolatedOwn > remainingMonthly
  const own = Math.min(isolatedOwn, remainingMonthly)
  if (own <= 0) return null

  const fundingForOwn = calculateRiesterFunding(g.rules, salary, {
    ...target,
    monthlyOwnContribution: own,
  }, profile)
  const netCash = Math.max(0, fundingForOwn.monthlyNetCost)

  const totalMonthly = own + fundingForOwn.totalAllowanceAnnual / 12
  const fees = (target.fees?.wrapperAssetFee ?? 0) + (target.fees?.fundAssetFee ?? 0)
  const netReturn = Math.max(-0.5, g.basis.annualReturn - fees)
  const capital = projectMonthlyContributionFV(totalMonthly, netReturn, g.yearsToRetirement)
  const totalContributions = totalMonthly * 12 * g.yearsToRetirement
  const grossPayout = (capital / 10_000) * (target.rentenfaktor ?? 28)

  // Net capital — issue 67. Riester is a §22 Nr. 5 EStG certified pension:
  // §93 Abs. 2 EStG limits the partial lump sum to ≤30 % of capital at
  // payout start (rest must annuitise). Treating the full capital as a net
  // lump sum overstates user-accessible capital. Mark payoutOnly so the UI
  // surfaces the contractual value with the "annuitisiert" label.
  const candidateResult = synthesizeProductResult({
    productId: 'riester',
    instanceId: target.instanceId,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum: null,
    label: target.label ?? 'Riester',
  })

  return {
    id: 'add_to_existing_riester',
    label: `Aufstockung Riester (${target.label ?? 'Riester'})`,
    productId: 'riester',
    isNewInstance: false,
    targetInstanceId: target.instanceId,
    grossMonthlyEUR: own,
    netCashOutEUR: netCash,
    cappedToRemaining,
    candidateResult,
    mcInputs: { monthlyContribution: totalMonthly, totalFeeDecimal: fees },
  }
}
