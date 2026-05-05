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
import { calculateSalaryResult } from '../../engine/salary'
import { computeKinderzulagen } from '../recommendations'
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
  const salary = calculateSalaryResult(profile, g.rules, 0)

  const isolatedOwn = solveRiesterOwnFromNet(
    g.marginalMonthlyEUR,
    g.rules,
    salary,
    target,
    profile,
  )
  if (isolatedOwn <= 0) return null

  // Clamp to §10a annual cap (€2,100 incl. allowances). `usedAnnual` therefore
  // must include Grundzulage + Kinderzulagen so the comparison is apples-to-
  // apples with the cap (matches `riesterCapRemainingRule` in recommendations.ts).
  const capAnnual = g.rules.riester.annualCapInclAllowances
  const ownAnnual = wsa.riester
    .filter((r) => r.status !== 'surrendered' && r.status !== 'offered')
    .reduce((s, r) => s + (r.monthlyOwnContribution ?? 0) * 12, 0)
  const activeRiesterInstances = wsa.riester.filter((r) => r.status !== 'surrendered' && r.status !== 'offered')
  const grundzulageEligible = activeRiesterInstances.some(
    (inst) => inst.eligibility.directlyEligible === true || inst.eligibility.indirectSpouseEligible === true,
  )
  const grundzulage = grundzulageEligible ? g.rules.riester.grundzulage : 0
  const kinderzulageTotal = computeKinderzulagen(profile.childBirthYears, g.rules.riester)
  const usedAnnual = ownAnnual + grundzulage + kinderzulageTotal
  const remainingAnnual = Math.max(0, capAnnual - usedAnnual)
  const remainingMonthly = remainingAnnual / 12
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
