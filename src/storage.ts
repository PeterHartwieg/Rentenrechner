import type { PersonalProfile, ScenarioAssumptions } from './domain'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
import { validateState } from './utils/scenarioSchema'

export const STORAGE_KEY = 'rentenrechner-state-v1'
const CURRENT_VERSION = 1

// Recursively merge `saved` into `defaults`: primitives and arrays use the saved
// value when the type matches; object fields recurse; missing keys keep the default.
// Empty saved arrays are preserved (the user can explicitly clear, e.g.,
// visibleProducts or childBirthYears). Arrays that genuinely require a non-empty
// fallback — currently only returnScenarios — are normalized in
// applyPreMergeMigrations before mergeDeep runs.
function mergeDeep<T>(saved: unknown, defaults: T): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(saved) ? saved : defaults) as T
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

/**
 * Apply pre-merge field migrations on a mutable assumptions object. Migrations
 * here run *before* mergeDeep so the user's saved value survives instead of
 * being clobbered by the default. Idempotent for already-current shapes.
 */
function applyPreMergeMigrations(rawAssumptions: Record<string, unknown>): void {
  // #55: migrate annualAssetFee → wrapperAssetFee + fundAssetFee
  const migrateFeesFields = (productData: Record<string, unknown> | undefined) => {
    const fees = productData?.fees as Record<string, unknown> | undefined
    if (fees && typeof fees.annualAssetFee === 'number' && fees.wrapperAssetFee === undefined) {
      fees.wrapperAssetFee = fees.annualAssetFee
      fees.fundAssetFee = 0
    }
  }
  migrateFeesFields(rawAssumptions.bav as Record<string, unknown> | undefined)
  migrateFeesFields(rawAssumptions.insurance as Record<string, unknown> | undefined)

  // Group E step 3: Basisrente zeitrente → leibrente (legal compliance).
  const rawBasisrente = rawAssumptions.basisrente as Record<string, unknown> | undefined
  if (rawBasisrente?.payoutMode === 'zeitrente') {
    rawBasisrente.payoutMode = 'leibrente'
  }

  // Lock canonical baseline return scenarios; preserve custom row.
  const rawScenarios = rawAssumptions.returnScenarios
  if (Array.isArray(rawScenarios)) {
    const customRow = rawScenarios.find(
      (s): s is { id: 'custom'; label: string; annualReturn: number } =>
        !!s && typeof s === 'object' && (s as { id?: unknown }).id === 'custom',
    )
    rawAssumptions.returnScenarios = customRow
      ? [...defaultAssumptions.returnScenarios, customRow]
      : [...defaultAssumptions.returnScenarios]
  }
}

/**
 * Apply post-merge migrations that read raw legacy keys (only present in
 * pre-#51 saves) and copy them onto the current schema fields if they were
 * left at their defaults.
 */
function applyPostMergeMigrations(
  rawAssumptions: Record<string, unknown>,
  merged: ScenarioAssumptions,
): void {
  const savedBav = rawAssumptions.bav as Record<string, unknown> | undefined
  if (!savedBav) return
  if (
    typeof savedBav.extraEmployerContributionPct === 'number' &&
    merged.bav.contractualMatchPercent === defaultAssumptions.bav.contractualMatchPercent
  ) {
    merged.bav.contractualMatchPercent = savedBav.extraEmployerContributionPct
  }
  if (
    typeof savedBav.extraEmployerContributionMonthly === 'number' &&
    merged.bav.contractualFixedMonthly === defaultAssumptions.bav.contractualFixedMonthly
  ) {
    merged.bav.contractualFixedMonthly = savedBav.extraEmployerContributionMonthly
  }
}

/**
 * Migrate raw profile + assumptions through the same pipeline used by
 * `parseStateFromJson`, then validate. Shared between the main state loader
 * and the saved-scenario library so a malformed library entry can't bypass
 * the validator.
 *
 * Returns null if the inputs are not plain objects or if validation fails.
 */
export function migrateAndValidateState(
  rawProfile: unknown,
  rawAssumptions: unknown,
): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return null
  if (!rawAssumptions || typeof rawAssumptions !== 'object' || Array.isArray(rawAssumptions)) return null

  // Mutate a shallow copy so the caller's object is not affected.
  const assumptionsCopy = { ...(rawAssumptions as Record<string, unknown>) }
  applyPreMergeMigrations(assumptionsCopy)

  const profile = mergeDeep(rawProfile, defaultProfile)
  const assumptions = mergeDeep(assumptionsCopy, defaultAssumptions)

  applyPostMergeMigrations(rawAssumptions as Record<string, unknown>, assumptions)

  return validateState(profile, assumptions)
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
  return migrateAndValidateState(obj.profile, obj.assumptions)
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
