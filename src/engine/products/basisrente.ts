import type { ProductResult, ReturnScenario } from '../../domain/types'
import type { SimulationContext } from '../simulationContext'
import { buildProductResult } from '../buildResult'

export const metadata = {
  id: 'basisrente' as const,
  label: 'Basisrente (Rürup, Schicht 1)',
  shortLabel: 'Basisrente',
  color: '#7c3aed',
  order: 3,
  lockedCapital: true,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): ProductResult {
  const { profile, assumptions, rules, bavFunding, basisrenteFunding, payoutYear } = ctx
  return buildProductResult({
    productId: 'basisrente',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    bavFunding,
    basisrenteFunding,
    monthlyUserCost: basisrenteFunding.monthlyNetCost,
    monthlyProductContribution: basisrenteFunding.monthlyGrossContribution,
    monthlyEmployerContribution: 0,
    fees: assumptions.basisrente.fees,
    taxMode: 'basisrente',
    retirementYear: payoutYear,
  })
}
