/**
 * Shared test helpers for per-product candidate generator tests.
 *
 * Each generator test file builds a `GeneratorContext` directly to exercise
 * generator behavior in isolation (visible candidate, reasons, ranking inputs)
 * and routes via `recommendNextEuro` + `buildWhatIfFromCandidate` for the
 * materialized what-if assertions. Helpers here avoid duplicating workspace +
 * combine-context construction across files.
 */

import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { migrateV1ToV2 } from '../../storage'
import { runCombineSimulation } from '../useCombineSimulation'
import { buildCombineContext } from '../../engine/combineContext'
import {
  type GeneratorContext,
  type ResolvedBavOffer,
} from './types'

/**
 * Bernd-shape baseline: 28-year-old employee with €100/mo bAV, ETF + bAV
 * visible. Reuses the same shape as the broad `recommender.test.ts` so the
 * per-product tests share fixtures with the orchestration tests.
 */
export function buildBerndWorkspace() {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['bav', 'etf'],
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 100 },
  }
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
}

/** Anna-shape baseline: clean slate, ETF visible, no existing bAV. */
export function buildAnnaWorkspace() {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['etf'],
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 0 },
  }
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
}

export const DEFAULT_BAV_OFFER: ResolvedBavOffer = {
  hasOffer: false,
  standardAssumption: true,
  employerMatchPercent: 0.15,
  fixedMonthlyEUR: 0,
  monthlyCapEUR: undefined,
  effectiveCostAnnual: 0.012,
  durchfuehrungsweg: 'direktversicherung_3_63',
  payoutMode: 'leibrente',
  rentenfaktor: 30,
}

/**
 * Build a GeneratorContext directly. Mirrors `recommender.ts`'s
 * `recommendNextEuro` orchestration, but exposes the context so per-product
 * tests can call generators in isolation without going through ranking,
 * MC, or atom filtering.
 */
export function buildGeneratorContext(
  workspace: ReturnType<typeof buildBerndWorkspace>,
  marginalMonthlyEUR: number,
  bavOffer: ResolvedBavOffer = DEFAULT_BAV_OFFER,
): GeneratorContext {
  const profile = workspace.baseline.profile
  const yearsToRetirement = Math.max(1, profile.retirementAge - profile.age)
  const wsa = workspace.baseline.assumptions
  const basisScenario =
    wsa.returnScenarios.find((s) => s.id === 'basis') ?? wsa.returnScenarios[0]
  const basis = {
    scenarioId: basisScenario.id,
    annualReturn: basisScenario.annualReturn,
  }
  const bundle = runCombineSimulation(workspace, de2026Rules)
  const baselineCombined = bundle.combinedByScenarioId[basis.scenarioId]
  const combineCtx = buildCombineContext({
    profile,
    rules: de2026Rules,
    statutoryPension: wsa.statutoryPension,
    grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
  })
  return {
    workspace,
    rules: de2026Rules,
    marginalMonthlyEUR,
    basis,
    yearsToRetirement,
    baselinePerInstance: bundle.perInstance,
    baselineCombined,
    combineCtx,
    bavOffer,
  }
}
