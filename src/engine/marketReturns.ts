import type { ReturnScenario } from '../domain'
import type { BuildProductPolicy } from './buildResult'
import type { SimulationContext } from './simulationContext'

export type SequenceOfReturnsPath = {
  id: 'good-early' | 'bad-early' | 'shuffled-baseline'
  returns: readonly number[]
}

/**
 * Builds three deterministic return paths with identical arithmetic means:
 * - good-early: high returns first, declining (favorable sequence)
 * - bad-early:  low returns first, rising (unfavorable sequence)
 * - shuffled-baseline: uniform returns equal to the mean
 */
export function buildSequenceOfReturnsPaths(params: {
  annualReturn: number
  years: number
}): SequenceOfReturnsPath[] {
  const { annualReturn, years } = params

  if (years <= 1) {
    return [
      { id: 'good-early', returns: [annualReturn] },
      { id: 'bad-early', returns: [annualReturn] },
      { id: 'shuffled-baseline', returns: [annualReturn] },
    ]
  }

  const delta = 0.04
  const spread = (delta * 2) / (years - 1)

  const goodEarly: number[] = Array.from({ length: years }, (_, i) =>
    annualReturn + delta - i * spread,
  )

  const badEarly: number[] = Array.from({ length: years }, (_, i) =>
    annualReturn - delta + i * spread,
  )

  const shuffledBaseline: number[] = Array.from({ length: years }, () => annualReturn)

  return [
    { id: 'good-early', returns: goodEarly },
    { id: 'bad-early', returns: badEarly },
    { id: 'shuffled-baseline', returns: shuffledBaseline },
  ]
}

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
  const merged = mergeInstanceCapitalPolicy(ctx, policy)
  if (!yearlyReturn) return merged
  return {
    ...merged,
    yearlyReturn: merged?.yearlyReturn ?? yearlyReturn,
  }
}

/**
 * Issue 15 — fold the per-instance capital policy (initialCapital, transfer-
 * event injections / withdrawals / cost-basis bumps) into a `BuildProductPolicy`.
 *
 * Caller-supplied `initialCapital` wins over the instance value (Riester paid-up,
 * insurance phase-2 paid-up etc. set their own initialCapital from a prior phase).
 * Caller-supplied transfer arrays concatenate with instance ones — there should
 * be at most one source today, but concatenation is safer than precedence.
 */
export function mergeInstanceCapitalPolicy(
  ctx: SimulationContext,
  policy?: BuildProductPolicy,
): BuildProductPolicy | undefined {
  const inst = ctx.instanceCapitalPolicy
  if (!inst) return policy
  const result: BuildProductPolicy = { ...(policy ?? {}) }
  if (inst.initialCapital !== undefined && result.initialCapital === undefined) {
    result.initialCapital = inst.initialCapital
  }
  if (inst.capitalInjections && inst.capitalInjections.length > 0) {
    result.capitalInjections = [...(result.capitalInjections ?? []), ...inst.capitalInjections]
  }
  if (inst.capitalWithdrawals && inst.capitalWithdrawals.length > 0) {
    result.capitalWithdrawals = [...(result.capitalWithdrawals ?? []), ...inst.capitalWithdrawals]
  }
  if (inst.costBasisInjections && inst.costBasisInjections.length > 0) {
    result.costBasisInjections = [...(result.costBasisInjections ?? []), ...inst.costBasisInjections]
  }
  return result
}
