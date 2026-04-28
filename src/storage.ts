import type { PersonalProfile, ScenarioAssumptions } from './domain'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { validateState } from './utils/scenarioSchema'

export const STORAGE_KEY = 'rentenrechner-state-v1'
const CURRENT_VERSION = 1

// Recursively merge `saved` into `defaults`: primitives and arrays use the saved
// value when the type matches; object fields recurse; missing keys keep the default.
function mergeDeep<T>(saved: unknown, defaults: T): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(saved) && (saved as unknown[]).length > 0 ? saved : defaults) as T
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults
  const result = { ...(defaults as object) } as Record<string, unknown>
  const savedObj = saved as Record<string, unknown>
  for (const key of Object.keys(defaults as object)) {
    const savedVal = savedObj[key]
    if (savedVal === undefined || savedVal === null) continue
    const defaultVal = (defaults as Record<string, unknown>)[key]
    if (defaultVal !== null && typeof defaultVal === 'object' && !Array.isArray(defaultVal)) {
      result[key] = mergeDeep(savedVal, defaultVal)
    } else if (typeof savedVal === typeof defaultVal) {
      result[key] = savedVal
    }
    // type mismatch → keep default
  }
  return result as T
}

export function parseStateFromJson(
  raw: string,
): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>

  if (obj.version !== CURRENT_VERSION) return null
  if (!obj.profile || typeof obj.profile !== 'object' || Array.isArray(obj.profile)) return null
  if (!obj.assumptions || typeof obj.assumptions !== 'object' || Array.isArray(obj.assumptions)) return null

  // #55: migrate annualAssetFee → wrapperAssetFee + fundAssetFee before mergeDeep
  // so the user's old setting is preserved instead of being replaced by defaults.
  const migrateFeesFields = (productData: Record<string, unknown> | undefined) => {
    const fees = productData?.fees as Record<string, unknown> | undefined
    if (fees && typeof fees.annualAssetFee === 'number' && fees.wrapperAssetFee === undefined) {
      fees.wrapperAssetFee = fees.annualAssetFee
      fees.fundAssetFee = 0
    }
  }
  const rawAssumptions = obj.assumptions as Record<string, unknown>
  migrateFeesFields(rawAssumptions.bav as Record<string, unknown> | undefined)
  migrateFeesFields(rawAssumptions.insurance as Record<string, unknown> | undefined)

  const profile = mergeDeep(obj.profile, defaultProfile)
  const assumptions = mergeDeep(obj.assumptions, defaultAssumptions)

  // #51: migrate legacy extraEmployerContribution* fields onto contractualMatchPercent / contractualFixedMonthly.
  const savedBav = (obj.assumptions as Record<string, unknown>).bav as Record<string, unknown> | undefined
  if (savedBav) {
    if (
      typeof savedBav.extraEmployerContributionPct === 'number' &&
      assumptions.bav.contractualMatchPercent === defaultAssumptions.bav.contractualMatchPercent
    ) {
      assumptions.bav.contractualMatchPercent = savedBav.extraEmployerContributionPct
    }
    if (
      typeof savedBav.extraEmployerContributionMonthly === 'number' &&
      assumptions.bav.contractualFixedMonthly === defaultAssumptions.bav.contractualFixedMonthly
    ) {
      assumptions.bav.contractualFixedMonthly = savedBav.extraEmployerContributionMonthly
    }
  }

  return validateState(profile, assumptions)
}

export function buildStateJson(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
): string {
  return JSON.stringify({ version: CURRENT_VERSION, profile, assumptions })
}

export function loadSavedState(): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseStateFromJson(raw)
  } catch {
    return null
  }
}
