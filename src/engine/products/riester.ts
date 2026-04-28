import type { ProductResult, ReturnScenario } from '../../domain/types'
import type { SimulationContext } from '../simulationContext'
import { buildProductResult } from '../buildResult'

export const metadata = {
  id: 'riester' as const,
  label: 'Riester (Schicht 2, Altvertrag)',
  shortLabel: 'Riester',
  color: '#be185d',
  order: 5,
  lockedCapital: true,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): ProductResult {
  const { profile, assumptions, rules, bavFunding, riesterFunding, payoutYear } = ctx
  return buildProductResult({
    productId: 'riester',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    bavFunding,
    riesterFunding,
    monthlyUserCost: riesterFunding.monthlyNetCost,
    monthlyProductContribution:
      riesterFunding.monthlyOwnContribution + riesterFunding.totalAllowanceAnnual / 12,
    monthlyEmployerContribution: 0,
    fees: assumptions.riester.fees,
    taxMode: 'riester',
    retirementYear: payoutYear,
    initialCapital: assumptions.riester.existingCapital > 0
      ? assumptions.riester.existingCapital
      : undefined,
  })
}
