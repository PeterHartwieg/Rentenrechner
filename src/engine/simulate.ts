import type {
  GermanRules,
  PersonalProfile,
  ScenarioAssumptions,
  SimulationResult,
} from '../domain'
import { buildContext } from './simulationContext'
import { PRODUCT_REGISTRY } from './productRegistry'

export function simulateRetirementComparison(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  rules: GermanRules,
): SimulationResult {
  const ctx = buildContext(profile, assumptions, rules)

  const products = assumptions.returnScenarios.flatMap((scenario) =>
    PRODUCT_REGISTRY.map(product => product.simulate(ctx, scenario)),
  )

  return {
    bavFunding: ctx.bavFunding,
    products,
    statutoryPension: ctx.statutoryPension,
    basisrenteFunding: ctx.basisrenteFunding,
    altersvorsorgedepotFunding: ctx.altersvorsorgedepotFunding,
    riesterFunding: ctx.riesterFunding,
  }
}
