import type { ProductResult, ReturnScenario } from '../../domain/types'
import type { SimulationContext } from '../simulationContext'
import { buildProductResult, zeroFeeModel } from '../buildResult'

export const metadata = {
  id: 'etf' as const,
  label: 'ETF-Depot',
  shortLabel: 'ETF',
  color: '#2563eb',
  order: 0,
  lockedCapital: false,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): ProductResult {
  return buildProductResult({
    productId: 'etf',
    label: metadata.label,
    scenario,
    profile: ctx.profile,
    rules: ctx.rules,
    assumptions: ctx.assumptions,
    bavFunding: ctx.bavFunding,
    monthlyUserCost: ctx.bavFunding.monthlyNetCost,
    monthlyProductContribution: ctx.bavFunding.monthlyNetCost,
    monthlyEmployerContribution: 0,
    fees: { ...zeroFeeModel, fundAssetFee: ctx.assumptions.etf.annualAssetFee },
    taxMode: 'etf',
    partialExemption: ctx.assumptions.etf.equityPartialExemption,
    retirementYear: ctx.payoutYear,
  })
}
