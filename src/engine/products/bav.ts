import type { BavProductResult, ReturnScenario } from '../../domain/types'
import type { SimulationContext } from '../simulationContext'
import { buildProductResult } from '../buildResult'

export const metadata = {
  id: 'bav' as const,
  label: 'bAV',
  shortLabel: 'bAV',
  color: '#0f766e',
  order: 1,
  lockedCapital: true,
  hasFees: true,
  hasEmployerContribution: true,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): BavProductResult {
  const { profile, assumptions, rules, bavFunding, bavLumpSumTaxMode, payoutYear } = ctx
  return buildProductResult({
    productId: 'bav',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    bavFunding,
    monthlyUserCost: bavFunding.monthlyNetCost,
    monthlyProductContribution:
      bavFunding.monthlyGrossConversion + bavFunding.monthlyEmployerContribution,
    monthlyEmployerContribution: bavFunding.monthlyEmployerContribution,
    fees: assumptions.bav.fees,
    taxMode: 'bav',
    retirementYear: payoutYear,
    bavLumpSumTaxMode,
  }) as BavProductResult
}
