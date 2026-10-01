// ---------------------------------------------------------------------------
// compareSeed — explicit, one-way seed from the combine-mode workspace into
// the compare-mode singleton state (state-contract §6, lead decision
// "Comparison without a plan").
//
// `/vergleich` is an independent journey. It never reads the workspace
// implicitly and never writes it back: the user presses "Angaben aus meinem
// Plan verwenden" and this helper copies the *person and economic frame*
// across — never the contracts and never the contributions.
//
// Copied:  profile, inflationRate, returnScenarios, retirementEndAge
// Left alone: every per-product block, `visibleProducts`, `equalInputAmountEUR`
//             and the whole contribution/funding surface of the compare state.
//
// Pure and React-free. The function deep-clones everything it takes, so the
// caller cannot alias workspace state into compare state (a shared
// `returnScenarios` array would let a compare-side scenario edit mutate the
// user's plan).
// ---------------------------------------------------------------------------

import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import type { Workspace } from '../domain/workspace'
import { defaultAssumptions } from '../data/defaultScenario'

export interface CompareSeed {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Build a compare-mode `{ profile, assumptions }` pair from the workspace
 * baseline.
 *
 * `base` is the compare state the seed is merged onto — pass the live
 * `assumptions` from `useCalculatorState` so the user's existing product
 * settings and product selection survive. It defaults to `defaultAssumptions`
 * so the documented single-argument form in the state contract works.
 *
 * Neither `workspace` nor `base` is mutated.
 */
export function seedCompareFromWorkspace(
  workspace: Workspace,
  base: ScenarioAssumptions = defaultAssumptions,
): CompareSeed {
  const baseline = workspace.baseline
  const wsa = baseline.assumptions

  return {
    profile: clone(baseline.profile),
    assumptions: {
      ...clone(base),
      inflationRate: wsa.inflationRate,
      returnScenarios: clone(wsa.returnScenarios) as ScenarioAssumptions['returnScenarios'],
      retirementEndAge: wsa.retirementEndAge,
    },
  }
}
