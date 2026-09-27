import type { GermanRules } from '../domain'
import type { Workspace } from '../domain/workspace'
import { buildContributionWhatIf } from './whatIfPreview'
import { runCombineSimulation } from './useCombineSimulation'
import { realDeflator, selectPlanSummary } from './planSummary'

export interface TargetContribution {
  monthlyContribution: number
  additionalMonthly: number
  achievedMonthlyReal: number
}

/** Solve an existing active ETF's contribution with the same simulation as a saved alternative. */
export function solveTargetContribution(
  workspace: Workspace,
  rules: GermanRules,
  instanceId: string,
  targetMonthlyReal: number,
  scenarioId = 'basis',
): TargetContribution | null {
  const target = workspace.baseline.assumptions.etf.find(i => i.instanceId === instanceId && i.status === 'active')
  if (!target || !Number.isFinite(targetMonthlyReal) || targetMonthlyReal <= 0) return null
  const baseline = runCombineSimulation(workspace, rules)
  const summary = selectPlanSummary(workspace, baseline, scenarioId, { rules })
  if (!summary.readiness.canShowHouseholdTotal || !baseline.combinedByScenarioId[scenarioId]) return null
  const current = target.monthlyContribution ?? 0
  const profile = workspace.baseline.profile
  const deflator = realDeflator(workspace.baseline.assumptions.inflationRate, profile.retirementAge - profile.age)
  const incomeAt = (monthly: number): number => {
    const alternative = buildContributionWhatIf(workspace, instanceId, { kind: 'contribution', monthly })
    if (!alternative) return NaN
    return runCombineSimulation({ ...workspace, baseline: alternative }, rules)
      .combinedByScenarioId[scenarioId].monthlyNetIncome * deflator
  }
  const currentIncome = baseline.combinedByScenarioId[scenarioId].monthlyNetIncome * deflator
  if (currentIncome >= targetMonthlyReal) return { monthlyContribution: current, additionalMonthly: 0, achievedMonthlyReal: currentIncome }
  // Search whole euros at the input boundary; engine projections remain full precision.
  let low = Math.ceil(current)
  let high = Math.max(low + 1, 500)
  while (high < 20_000 && incomeAt(high) < targetMonthlyReal) high = Math.min(20_000, high * 2)
  const ceilingIncome = incomeAt(high)
  if (!Number.isFinite(ceilingIncome) || ceilingIncome < targetMonthlyReal) return null
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    const income = incomeAt(mid)
    if (!Number.isFinite(income)) return null
    if (income >= targetMonthlyReal) high = mid
    else low = mid + 1
  }
  return { monthlyContribution: low, additionalMonthly: low - current, achievedMonthlyReal: incomeAt(low) }
}
