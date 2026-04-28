import type {
  GermanRules,
  PersonalProfile,
  ScenarioAssumptions,
  SimulationResult,
} from '../domain'
import { buildContext } from './simulationContext'
import { projectStatutoryPension } from './grv'
import { simulate as simulateEtf } from './products/etf'
import { simulate as simulateBav } from './products/bav'
import { simulate as simulateInsurance } from './products/insurance'
import { simulate as simulateBasisrente } from './products/basisrente'
import { simulate as simulateAvd } from './products/altersvorsorgedepot'
import { simulate as simulateRiester } from './products/riester'

export function simulateRetirementComparison(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  rules: GermanRules,
): SimulationResult {
  const ctx = buildContext(profile, assumptions, rules)

  const products = assumptions.returnScenarios.flatMap((scenario) => [
    simulateEtf(ctx, scenario),
    simulateBav(ctx, scenario),
    simulateInsurance(ctx, scenario),
    simulateBasisrente(ctx, scenario),
    simulateAvd(ctx, scenario),
    simulateRiester(ctx, scenario),
  ])

  const statutoryPension = projectStatutoryPension(
    profile,
    rules,
    assumptions.statutoryPension,
    ctx.bavFunding.estimatedMonthlyGrvReduction,
    ctx.payoutYear,
  )

  return {
    bavFunding: ctx.bavFunding,
    products,
    statutoryPension,
    basisrenteFunding: ctx.basisrenteFunding,
    altersvorsorgedepotFunding: ctx.altersvorsorgedepotFunding,
    riesterFunding: ctx.riesterFunding,
  }
}
