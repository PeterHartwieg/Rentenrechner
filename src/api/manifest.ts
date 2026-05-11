/**
 * Manifest endpoint — returns the full capability surface of the API in a single call.
 *
 * Downstream consumers use this for feature detection (supported products, rule years,
 * Monte Carlo ceiling) and for seeding default inputs without hardcoding them client-side.
 */

import type { ApiProductManifestEntry } from './apiTypes'
import type { ApiSuccess, ApiVersion } from './contracts'
import { API_VERSION, success } from './contracts'
import { activeRules } from '../rules'
import { PRODUCT_MANIFEST, PRODUCT_IDS } from '../engine/productRegistry'
import { defaultProfile, defaultAssumptions, DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR } from '../data/defaultScenario'

export interface ManifestData {
  apiVersion: ApiVersion
  activeRuleYear: number
  supportedRuleYears: number[]
  products: readonly ApiProductManifestEntry[]
  productIds: readonly string[]
  /** Deep-cloned snapshot of the built-in default profile. */
  defaultProfile: Record<string, unknown>
  /** Deep-cloned snapshot of the built-in default assumptions. */
  defaultAssumptions: Record<string, unknown>
  defaultMonthlyNettoBelastungEur: number
  comparisonCapabilities: {
    detailLevels: string[]
    /** Minimum Monte Carlo runs (matches storage schema). */
    monteCarloMinRuns: number
    /** Maximum Monte Carlo runs (matches storage schema). */
    monteCarloMaxRuns: number
    /** Maximum Monte Carlo annual volatility (matches storage schema). */
    monteCarloMaxVolatility: number
    /** Valid return-scenario ids (matches storage schema). */
    validScenarioIds: readonly string[]
  }
  ruleYearRetention: {
    policy: 'never_remove_supported_years'
    text: string
  }
  disclaimer: {
    type: 'not_advice'
    text: string
  }
}

export function getManifest(): ApiSuccess<ManifestData> {
  const meta = { apiVersion: API_VERSION, ruleYear: activeRules.year }

  // Deep-clone shared module-level objects so consumers cannot mutate
  // defaults that later API calls depend on.
  const clonedProfile = JSON.parse(JSON.stringify(defaultProfile)) as Record<string, unknown>
  const clonedAssumptions = JSON.parse(JSON.stringify(defaultAssumptions)) as Record<string, unknown>
  const clonedProducts = JSON.parse(JSON.stringify(PRODUCT_MANIFEST)) as ApiProductManifestEntry[]
  const clonedProductIds = [...PRODUCT_IDS] as string[]

  const data: ManifestData = {
    apiVersion: API_VERSION,
    activeRuleYear: activeRules.year,
    supportedRuleYears: [activeRules.year],
    products: clonedProducts,
    productIds: clonedProductIds,
    defaultProfile: clonedProfile,
    defaultAssumptions: clonedAssumptions,
    defaultMonthlyNettoBelastungEur: DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR,
    comparisonCapabilities: {
      detailLevels: ['summary', 'standard', 'full'],
      monteCarloMinRuns: 100,
      monteCarloMaxRuns: 5_000,
      monteCarloMaxVolatility: 0.6,
      validScenarioIds: ['konservativ', 'basis', 'optimistisch', 'custom'],
    },
    ruleYearRetention: {
      policy: 'never_remove_supported_years',
      text: 'Rule years are never removed once added to supportedRuleYears.',
    },
    disclaimer: {
      type: 'not_advice',
      text: 'Dieses Tool erstellt Illustrationen, keine Steuer-, Rechts- oder Anlageberatung.',
    },
  }

  return success(data, meta)
}
