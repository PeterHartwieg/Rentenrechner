import type { ReturnScenario } from '../domain'
import type { BuildProductPolicy } from './buildResult'
import type { SimulationContext } from './simulationContext'

export function marketReturnAt(
  ctx: SimulationContext,
  scenario: ReturnScenario,
  yearIndex: number,
  yearOffset = 0,
): number {
  return ctx.marketReturnPath?.[yearIndex + yearOffset] ?? scenario.annualReturn
}

export function marketReturnPolicy(
  ctx: SimulationContext,
  scenario: ReturnScenario,
  yearOffset = 0,
): ((yearIndex: number) => number) | undefined {
  if (!ctx.marketReturnPath) return undefined
  return (yearIndex) => marketReturnAt(ctx, scenario, yearIndex, yearOffset)
}

export function withMarketReturnPolicy(
  ctx: SimulationContext,
  scenario: ReturnScenario,
  policy?: BuildProductPolicy,
  yearOffset = 0,
): BuildProductPolicy | undefined {
  const yearlyReturn = marketReturnPolicy(ctx, scenario, yearOffset)
  if (!yearlyReturn) return policy
  return {
    ...policy,
    yearlyReturn: policy?.yearlyReturn ?? yearlyReturn,
  }
}
