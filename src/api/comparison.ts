/**
 * Comparison facade — single entry point for running a full retirement-product
 * comparison through the engine and returning a JSON-serializable response.
 *
 * This mirrors the pipeline of `useSimulationResult` + `useDerivedViews` so
 * that downstream consumers (CLI, future HTTP layer, SDK) get identical numbers
 * without depending on React hooks.
 */

import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import type { ApiProfile, ApiAssumptions, ApiProductManifestEntry } from './apiTypes'
import type { ApiResult, ApiDiagnostic } from './contracts'
import { API_VERSION, success, error } from './contracts'
import { resolveRuleYear } from './rules'
import { validateComparisonRequest } from './validation'
import { defaultProfile, defaultAssumptions, DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR } from '../data/defaultScenario'
import { PRODUCT_MANIFEST } from '../engine/productRegistry'
import { normalizeMonthlyNettoBelastung, syncMonthlyContributions } from '../utils/syncContributions'
import { simulateRetirementComparison } from '../engine/simulate'
import { runMonteCarlo } from '../engine/monteCarlo'
import {
  resolveEffectiveScenarioId,
  deriveSelectedResults,
  deriveVisibleProducts,
  deriveBestCapital,
  deriveBestPension,
  deriveTaxModes,
} from '../utils/simulationSelectors'
import {
  toProductResultSummary,
  toStatutoryPensionSummary,
  toFundingSummaries,
  toYearlyRowEntries,
  toEtfPayoutRowEntries,
  toMonteCarloSummaryResponse,
} from './resultSummaries'
import type {
  ProductResultSummary,
  StatutoryPensionSummary,
  FundingSummaries,
  YearlyRowEntry,
  EtfPayoutRowEntry,
  MonteCarloSummaryResponse,
} from './resultSummaries'

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export type DetailLevel = 'summary' | 'standard' | 'full'

export interface ComparisonRequest {
  ruleYear?: number
  profile?: Partial<ApiProfile>
  assumptions?: Partial<ApiAssumptions>
  selectedScenarioId?: string
  monthlyNettoBelastungEur?: number
  /** Controls the amount of data returned. Default: 'summary'. */
  detailLevel?: DetailLevel
  /** When true, includes Monte Carlo simulation results. Default: false. */
  includeMonteCarlo?: boolean
}

export interface TaxDiagnostics {
  insuranceTaxMode: string
  insuranceContractRuntime: number
  bavLumpSumTaxMode: string
  kvdrMember: boolean
}

export interface ComparisonResponse {
  detailLevel: DetailLevel
  effectiveScenarioId: string
  effectiveMonthlyNettoBelastungEur: number
  productManifest: readonly ApiProductManifestEntry[]
  statutoryPension: StatutoryPensionSummary
  fundingSummaries: FundingSummaries
  selectedResults: ProductResultSummary[]
  bestCapital: ProductResultSummary | null
  bestPension: ProductResultSummary | null
  taxDiagnostics: TaxDiagnostics

  /** Standard + Full: results for ALL scenarios (not just selected). */
  allScenarioResults?: ProductResultSummary[]

  /** Full only: yearly accumulation rows per product for selected scenario. */
  yearlyRows?: YearlyRowEntry[]

  /** Full only: ETF payout rows for selected scenario. */
  etfPayoutRows?: EtfPayoutRowEntry[]

  /** Monte Carlo — included based on detail level + includeMonteCarlo flag. */
  monteCarlo?: MonteCarloSummaryResponse | null
}

// ---------------------------------------------------------------------------
// Deep-merge utility (no lodash)
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)
}

/**
 * Recursively merge `overrides` on top of `defaults`.
 *
 * - Plain objects are merged recursively.
 * - Arrays are taken from the override when present (including empty `[]`).
 * - Primitive overrides (including `0`, `false`, `''`) replace the default.
 * - Only fields that are `undefined` in the override fall through to the default.
 */
function mergeDefaults<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<T> | undefined,
): T {
  if (overrides === undefined) return defaults

  const result: Record<string, unknown> = {}

  // Start with every key from defaults.
  for (const key of Object.keys(defaults)) {
    const defVal = (defaults as Record<string, unknown>)[key]
    const ovrVal = (overrides as Record<string, unknown>)[key]

    if (ovrVal === undefined) {
      result[key] = defVal
    } else if (isPlainObject(defVal) && isPlainObject(ovrVal)) {
      result[key] = mergeDefaults(defVal, ovrVal)
    } else {
      result[key] = ovrVal
    }
  }

  // Copy keys that exist only in the override (not in defaults).
  for (const key of Object.keys(overrides)) {
    if (!(key in defaults)) {
      result[key] = (overrides as Record<string, unknown>)[key]
    }
  }

  return result as T
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export function runComparison(
  request: ComparisonRequest,
): ApiResult<ComparisonResponse> {
  // 1. Resolve rules
  const ruleResult = resolveRuleYear(request.ruleYear)
  if (!ruleResult.ok) return ruleResult
  const { rules, ruleYear } = ruleResult.data
  const meta = { apiVersion: API_VERSION, ruleYear }

  // 2 + 3. Merge defaults
  const mergedProfile = mergeDefaults(
    defaultProfile as unknown as Record<string, unknown>,
    request.profile as unknown as Partial<Record<string, unknown>> | undefined,
  ) as unknown as PersonalProfile

  const mergedAssumptions = mergeDefaults(
    defaultAssumptions as unknown as Record<string, unknown>,
    request.assumptions as unknown as Partial<Record<string, unknown>> | undefined,
  ) as unknown as ScenarioAssumptions

  // CRITICAL: preserve explicit visibleProducts array (including empty [])
  if (request.assumptions !== undefined && Array.isArray(request.assumptions.visibleProducts)) {
    ;(mergedAssumptions as unknown as Record<string, unknown>).visibleProducts = request.assumptions.visibleProducts
  }
  // Similarly preserve explicit returnScenarios if provided
  if (request.assumptions !== undefined && Array.isArray(request.assumptions.returnScenarios)) {
    ;(mergedAssumptions as unknown as Record<string, unknown>).returnScenarios = request.assumptions.returnScenarios
  }

  // 4. Validate
  const diagnostics = validateComparisonRequest({
    profile: mergedProfile,
    assumptions: mergedAssumptions,
    ruleYear: request.ruleYear,
  })

  const errors = diagnostics.filter((d) => d.severity === 'error')
  const warnings: ApiDiagnostic[] = diagnostics.filter((d) => d.severity === 'warning')

  if (errors.length > 0) {
    return error(errors, meta, warnings)
  }

  // 5. Resolve monthly Netto-Belastung
  const nettoBelastung =
    request.monthlyNettoBelastungEur ??
    mergedAssumptions.equalInputAmountEUR ??
    DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR

  // 6. Sync contributions
  const syncedAssumptions = syncMonthlyContributions(
    normalizeMonthlyNettoBelastung(nettoBelastung),
    mergedAssumptions,
    mergedProfile,
    rules,
  )

  // 7. Run simulation
  const simulation = simulateRetirementComparison(mergedProfile, syncedAssumptions, rules)

  // 8. Resolve effective scenario
  const effectiveScenarioId = resolveEffectiveScenarioId(
    syncedAssumptions,
    request.selectedScenarioId ?? 'basis',
  )

  // 9. Derive selected results
  const selectedResults = deriveSelectedResults(
    simulation,
    syncedAssumptions.visibleProducts,
    effectiveScenarioId,
  )

  // 10. Best capital / pension
  const bestCapitalResult = deriveBestCapital(selectedResults)
  const bestPensionResult = deriveBestPension(selectedResults)

  // 11. Tax modes
  const taxModes = deriveTaxModes(mergedProfile, syncedAssumptions, rules)

  // 12. Detail level resolution
  const detailLevel: DetailLevel = request.detailLevel ?? 'summary'

  // 13. Assemble base response
  const selectedSummaries = selectedResults.map(toProductResultSummary)

  // Clone the module-level manifest so callers cannot mutate shared state.
  const clonedManifest = JSON.parse(JSON.stringify(PRODUCT_MANIFEST)) as ApiProductManifestEntry[]

  const data: ComparisonResponse = {
    detailLevel,
    effectiveScenarioId,
    effectiveMonthlyNettoBelastungEur: normalizeMonthlyNettoBelastung(nettoBelastung),
    productManifest: clonedManifest,
    statutoryPension: toStatutoryPensionSummary(simulation.statutoryPension),
    fundingSummaries: toFundingSummaries(simulation),
    selectedResults: selectedSummaries,
    bestCapital: bestCapitalResult ? toProductResultSummary(bestCapitalResult) : null,
    bestPension: bestPensionResult ? toProductResultSummary(bestPensionResult) : null,
    taxDiagnostics: {
      insuranceTaxMode: taxModes.insuranceTaxMode,
      insuranceContractRuntime: taxModes.insuranceContractRuntime,
      bavLumpSumTaxMode: taxModes.bavLumpSumTaxMode,
      kvdrMember: taxModes.kvdrMember,
    },
  }

  // 14. All scenario results (Standard + Full)
  if (detailLevel === 'standard' || detailLevel === 'full') {
    const allVisible = deriveVisibleProducts(simulation, syncedAssumptions.visibleProducts)
    data.allScenarioResults = allVisible.map(toProductResultSummary)
  }

  // 15. Yearly rows + ETF payout rows (Full only)
  if (detailLevel === 'full') {
    data.yearlyRows = toYearlyRowEntries(selectedResults, simulation.bavFunding)
    data.etfPayoutRows = toEtfPayoutRowEntries(selectedResults)
  }

  // 16. Monte Carlo — only when explicitly requested; detail level controls
  //     response shape (yearlyBands at full), not whether MC runs.
  const mcRequested = request.includeMonteCarlo === true

  if (mcRequested) {
    const canRun =
      syncedAssumptions.monteCarlo.enabled !== false &&
      syncedAssumptions.visibleProducts.length > 0

    if (canRun) {
      const mcResult = runMonteCarlo({
        profile: mergedProfile,
        assumptions: syncedAssumptions,
        rules,
        scenarioId: effectiveScenarioId,
        visibleProducts: syncedAssumptions.visibleProducts,
      })

      if (mcResult) {
        const includeYearlyBands = detailLevel === 'full'
        data.monteCarlo = toMonteCarloSummaryResponse(mcResult, includeYearlyBands)
      } else {
        data.monteCarlo = null
      }
    } else {
      data.monteCarlo = null
    }
  }

  return success(data, meta, warnings)
}
