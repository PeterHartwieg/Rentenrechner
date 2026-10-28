/**
 * Riester top-up candidate generator.
 *
 * Generates a candidate that adds the marginal budget to the user's first
 * active (non-surrendered, non-offered) Riester instance. Returns null when no
 * such instance exists — the recommender does not generate a brand-new Riester
 * instance because eligibility (direct / indirect) must be verified first.
 *
 * Net-cost sizing bisects the change in household cost through
 * `buildPortfolioFunding`. Own contribution is clamped to the target owner's remaining
 * §10a annual cap (€2,100 incl. allowances).
 *
 * Riester is a §22 Nr. 5 EStG certified pension: §93 Abs. 2 EStG limits the
 * partial lump sum to ≤30 % of capital at payout start; the remainder must
 * annuitise. `afterTaxLumpSum` is null → `payoutOnly` in the UI.
 */

import { buildPortfolioFunding } from '../../engine/portfolioFunding'
import { riesterHouseholdInputIssues } from '../../engine/riesterHousehold'
import {
  type CandidateDraft,
  type GeneratorContext,
  candidateAnnualReturn,
  projectMonthlyContributionFV,
  synthesizeProductResult,
} from './types'

export function makeRiesterTopUpCandidate(g: GeneratorContext): CandidateDraft | null {
  const wsa = g.workspace.baseline.assumptions
  const target = wsa.riester.find((r) => r.status === 'active')
  if (!target) return null
  if (riesterHouseholdInputIssues(g.workspace.baseline).length > 0) return null
  const remainingMonthly = g.portfolioFunding.headroom.riester.remainingAnnual / 12
  if (remainingMonthly <= 0) return null
  const sum = (f: typeof g.portfolioFunding, field: 'monthlyNetCost' | 'totalAllowanceAnnual') =>
    Object.values(f.riesterByInstanceId).reduce((total, row) => total + row[field], 0)
  const baselineCost = sum(g.portfolioFunding, 'monthlyNetCost')
  const fundingAt = (additionalMonthly: number) => {
    const workspace = { ...g.workspace, baseline: { ...g.workspace.baseline,
      assumptions: { ...wsa, riester: wsa.riester.map(r => r.instanceId === target.instanceId
        ? { ...r, monthlyOwnContribution: r.monthlyOwnContribution + additionalMonthly } : r) },
    } }
    return buildPortfolioFunding(workspace, g.rules)
  }
  let lo = 0
  let hi = remainingMonthly
  for (let i = 0; i < 35; i++) {
    const mid = (lo + hi) / 2
    if (sum(fundingAt(mid), 'monthlyNetCost') - baselineCost <= g.marginalMonthlyEUR) lo = mid
    else hi = mid
  }
  const own = lo
  if (own <= 1e-8) return null
  const funding = fundingAt(own)
  const netCash = sum(funding, 'monthlyNetCost') - baselineCost
  const cappedToRemaining = remainingMonthly - own < 0.01
  const totalMonthly = own + (sum(funding, 'totalAllowanceAnnual') - sum(g.portfolioFunding, 'totalAllowanceAnnual')) / 12
  const fees = (target.fees?.wrapperAssetFee ?? 0) + (target.fees?.fundAssetFee ?? 0)
  const annualReturn = candidateAnnualReturn(g.basis, target)
  const netReturn = Math.max(-0.5, annualReturn - fees)
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
    annualReturn,
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
