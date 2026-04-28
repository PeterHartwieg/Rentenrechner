import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import type {
  PersonalProfile,
  ProductId,
  ProductResult,
  ReturnScenarioId,
  ScenarioAssumptions,
  SimulationResult,
} from '../domain/types'
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
