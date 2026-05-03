import type {
  GermanRules,
  PersonalProfile,
  ProductId,
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
  // buildContext is always eager: ctx.bavFunding is the cash anchor for ETF and
  // private insurance even when bAV is hidden. Do not gate this on visibleProducts.
  const ctx = buildContext(profile, assumptions, rules)

  // Empty visibleProducts means "no product selected" (matches Monte Carlo semantics
  // and the UX10 empty-state in useSimulationViewModel). Simulate none in that case.
  const visible = new Set<ProductId>(assumptions.visibleProducts)
  const productsToSimulate =
    visible.size === 0
      ? []
      : PRODUCT_REGISTRY.filter((entry) => visible.has(entry.metadata.id as ProductId))

  const products = assumptions.returnScenarios.flatMap((scenario) =>
    productsToSimulate.map(product => product.simulate(ctx, scenario)),
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
