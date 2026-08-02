/**
 * Altersvorsorgedepot (AVD) candidate generator.
 *
 * Always generates a NEW-instance candidate. The marginal budget is sized
 * directly to the gross (no tax-phase deduction during accumulation), clamped
 * to the AltZertG per-contract annual contribution cap.
 *
 * AVD is a §22 Nr. 5 EStG certified pension product: at most 30 % of capital
 * may be taken as a partial lump sum; the remainder must be annuitised. To
 * avoid misleading the ranking, `afterTaxLumpSum` is null and the candidate
 * is flagged `payoutOnly` — the UI surfaces the contractual value with the
 * "annuitisiert" label.
 */

import type { AltersvorsorgedepotInstance } from '../../domain/instances'
import { defaultAssumptions } from '../../data/defaultScenario'
import { monthlyPayoutFromCapital } from '../../engine/payoutMath'
import { maxAvdMonthlyOwnContribution } from '../../engine/altersvorsorgedepot'
import { childBirthYearsUnder25InYear } from '../../engine/childEligibility'
import {
  buildPortfolioFunding,
  hasUsedCareerStarterBonus,
} from '../../engine/portfolioFunding'
import { newInstanceId } from '../workspaceIdentity'
import {
  type CandidateDraft,
  type GeneratorContext,
  projectMonthlyContributionFV,
  synthesizeProductResult,
} from './types'

export function makeAvdCandidate(g: GeneratorContext): CandidateDraft | null {
  const profile = g.workspace.baseline.profile
  const wsa = g.workspace.baseline.assumptions
  const gross = g.marginalMonthlyEUR
  if (gross <= 0) return null
  const baseAvd = defaultAssumptions.altersvorsorgedepot
  const careerStarterBonusAlreadyUsed = hasUsedCareerStarterBonus(wsa, g.rules)
  const effectiveEligibility = {
    ...baseAvd.eligibility,
    ageAtContractStart: profile.age,
    careerStarterBonusUsed: careerStarterBonusAlreadyUsed,
    eligibleChildren: childBirthYearsUnder25InYear(
      profile.childBirthYears,
      g.rules.year,
    ).length,
  }
  const newInstanceIdStr = newInstanceId('altersvorsorgedepot')
  const makeNewInstance = (monthlyOwnContribution: number): AltersvorsorgedepotInstance => ({
    instanceId: newInstanceIdStr,
    label: 'Neues Altersvorsorgedepot',
    status: 'active',
    contractStartYear: g.rules.year,
    evidenceMap: {},
    ...baseAvd,
    eligibility: effectiveEligibility,
    monthlyOwnContribution,
  })
  const capWithoutBonus = maxAvdMonthlyOwnContribution(
    effectiveEligibility,
    g.rules,
    false,
  )
  const capWithBonus = maxAvdMonthlyOwnContribution(
    effectiveEligibility,
    g.rules,
    true,
  )
  let candidateReceivesCareerStarterBonus = false
  if (!careerStarterBonusAlreadyUsed) {
    const prospectiveFundingAt = (monthlyOwnContribution: number) => {
      const probe = makeNewInstance(monthlyOwnContribution)
      return buildPortfolioFunding(
        {
          ...g.workspace,
          baseline: {
            ...g.workspace.baseline,
            assumptions: {
              ...wsa,
              altersvorsorgedepot: [...wsa.altersvorsorgedepot, probe],
            },
          },
        },
        g.rules,
      )
    }
    let prospectiveFunding = prospectiveFundingAt(Math.min(gross, capWithoutBonus))
    candidateReceivesCareerStarterBonus =
      prospectiveFunding.altersvorsorgedepotByInstanceId[newInstanceIdStr]
        ?.careerStarterBonusAnnual > 0
    const portfolioAllocatedCareerStarterBonus = [
      ...Object.values(prospectiveFunding.altersvorsorgedepotByInstanceId),
      ...Object.values(prospectiveFunding.riesterByInstanceId),
    ].some((funding) => funding.careerStarterBonusAnnual > 0)
    if (!candidateReceivesCareerStarterBonus && !portfolioAllocatedCareerStarterBonus) {
      prospectiveFunding = prospectiveFundingAt(Math.min(gross, capWithBonus))
      candidateReceivesCareerStarterBonus =
        prospectiveFunding.altersvorsorgedepotByInstanceId[newInstanceIdStr]
          ?.careerStarterBonusAnnual > 0
    }
  }
  const capMonthly = maxAvdMonthlyOwnContribution(
    effectiveEligibility,
    g.rules,
    candidateReceivesCareerStarterBonus,
  )
  const cappedToRemaining = gross > capMonthly
  const sized = Math.min(gross, capMonthly)
  if (sized <= 0) return null

  const fees = (baseAvd.fees.wrapperAssetFee ?? 0) + (baseAvd.fees.fundAssetFee ?? 0)
  const netReturn = Math.max(-0.5, g.basis.annualReturn - fees)
  const capital = projectMonthlyContributionFV(sized, netReturn, g.yearsToRetirement)
  const totalContributions = sized * 12 * g.yearsToRetirement
  const payoutYears = Math.max(1, wsa.retirementEndAge - profile.retirementAge)
  const grossPayout = monthlyPayoutFromCapital(capital, netReturn, payoutYears)

  // Net capital — issue 67. AVD is a §22 Nr. 5 EStG certified pension: at
  // most ~30 % of capital is permissible as a partial lump sum (the rest must
  // be annuitised). Representing the full capital as a net lump sum would
  // mislead the ranking, so the candidate is payoutOnly: the UI surfaces the
  // contractual value with the "annuitisiert" label.
  const candidateResult = synthesizeProductResult({
    productId: 'altersvorsorgedepot',
    instanceId: newInstanceIdStr,
    scenarioId: g.basis.scenarioId,
    scenarioLabel: 'Basis',
    annualReturn: g.basis.annualReturn,
    grossMonthlyPayout: grossPayout,
    capitalAtRetirement: capital,
    totalProductContributions: totalContributions,
    afterTaxLumpSum: null,
    label: 'Neues Altersvorsorgedepot',
  })

  const newInstance = makeNewInstance(sized)

  return {
    id: 'new_avd',
    label: 'Neues Altersvorsorgedepot',
    productId: 'altersvorsorgedepot',
    isNewInstance: true,
    grossMonthlyEUR: sized,
    netCashOutEUR: sized,
    cappedToRemaining,
    candidateResult,
    newInstance,
    mcInputs: { monthlyContribution: sized, totalFeeDecimal: fees },
  }
}
