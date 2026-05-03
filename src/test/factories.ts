import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import type {
  PersonalProfile,
  ProductId,
  ProductResult,
  ReturnScenarioId,
  ScenarioAssumptions,
  SimulationResult,
} from '../domain'
import type { CombinedResult } from '../engine/portfolioCombine'
import { simulateRetirementComparison } from '../engine/simulate'

export function makeProfile(overrides?: Partial<PersonalProfile>): PersonalProfile {
  return { ...defaultProfile, ...overrides }
}

export function makeAssumptions(overrides?: Partial<ScenarioAssumptions>): ScenarioAssumptions {
  return { ...defaultAssumptions, ...overrides }
}

export function simulateDefault(overrides?: {
  profile?: Partial<PersonalProfile>
  assumptions?: Partial<ScenarioAssumptions>
}): SimulationResult {
  return simulateRetirementComparison(
    makeProfile(overrides?.profile),
    makeAssumptions(overrides?.assumptions),
    de2026Rules,
  )
}

export function resultFor(
  products: ProductResult[],
  productId: ProductId,
  scenarioId: ReturnScenarioId,
): ProductResult {
  const r = products.find(p => p.productId === productId && p.scenarioId === scenarioId)
  if (!r) throw new Error(`No result for product=${productId} scenario=${scenarioId}`)
  return r
}

/**
 * Minimal `CombinedResult` stub for rule-engine tests.
 * Cap rules only check for the *presence* of `combinedResult` to guard compare-mode.
 * Pass overrides when a test needs specific fields.
 */
export function makeCombinedResult(overrides: Partial<CombinedResult> = {}): CombinedResult {
  return { monthlyNetIncome: 1_000, ...overrides } as CombinedResult
}
