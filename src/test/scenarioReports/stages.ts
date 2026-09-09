/**
 * Stage extraction for the scenario-report suite (issue #377).
 *
 * Each extractor feeds a frozen input into an EXISTING engine entry point and
 * flattens the available pipeline stages into a `StageMap`. Where the engine
 * does not expose a stage as a discrete number (e.g. the per-product marginal
 * tax of the monthly payout cascade), the stage is listed as UNSUPPORTED with
 * a reason instead of inventing a decomposition that could silently pin a
 * wrong derivation.
 *
 * Extraction order follows the engine pipeline so the report can name the
 * FIRST divergent stage:
 *
 *   funding → statutory baseline → salary phase → accumulation →
 *   payout (gross) → tax → KV/PV → net   (+ Monte-Carlo summaries)
 *
 * This module contains no expected values and no tolerances — it only reads
 * what the engine returns.
 */

import type {
  GermanRules,
  PersonalProfile,
  ProductResult,
  ReturnScenarioId,
  SimulationResult,
} from '../../domain'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { Workspace } from '../../domain/workspace'
import type {
  CaseInput,
  CompareCaseInput,
  MonteCarloCaseInput,
  StageMap,
  UnsupportedStage,
} from './types'
import {
  normalizeMonthlyNettoBelastung,
  syncMonthlyContributions,
} from '../../utils/syncContributions'
import { simulateRetirementComparison } from '../../engine/simulate'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { runMonteCarlo } from '../../engine/monteCarlo'

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type StageSink = {
  stages: StageMap
  add(path: string, value: number | boolean | null): void
  addNumbered(path: string, value: number | undefined | null): void
}

function createSink(): StageSink {
  const stages: StageMap = {}
  return {
    stages,
    add(path, value) {
      stages[path] = value
    },
    // Optional engine fields: `undefined` means "not applicable on this path"
    // and is recorded as an explicit null so shape changes surface as drift.
    addNumbered(path, value) {
      stages[path] = value === undefined || value === null ? null : value
    },
  }
}

const COMPARE_UNSUPPORTED_TAX: UnsupportedStage = {
  path: 'tax.<productId>.<scenarioId>.monthlyPayoutIncomeTax',
  reason:
    'simulateRetirementComparison does not persist the per-product marginal income tax of the ' +
    'monthly payout cascade (calculateMonthlyRetirementPayout returns marginalTaxAnnual, but ' +
    'ProductResult keeps only netMonthlyPayout + kvPvMonthly). The net stage pins gross − tax − ' +
    'KV/PV indirectly; the aggregate retirement-tax stages (taxable base, ESt, Soli) are pinned ' +
    'by the combine-mode scenarios and by the external retirement-tax golden tests.',
}

const COMBINE_UNSUPPORTED_TAX: UnsupportedStage = {
  path: 'tax.<instanceId>.<scenarioId>.ownTaxableBase',
  reason:
    'combinePortfolio aggregates retirement tax ONCE over the household and back-allocates ' +
    'marginal shares to instances (taxShareAnnual). Those shares are allocation outputs, not ' +
    'statutory per-contract taxes, so only the aggregate taxable base / ESt / Soli are pinned.',
}

const MC_UNSUPPORTED_BANDS: UnsupportedStage = {
  path: 'mc.<productId>.yearlyBands.<year>.{p10,p50,p90}',
  reason:
    'runMonteCarlo computes per-year percentile bands for the chart; only the terminal ' +
    'capital / payout percentiles are pinned here to keep the baseline compact. This is ' +
    'TERMINAL-ONLY coverage: a drift that stays confined to intermediate years (and exactly ' +
    'cancels by retirement) would NOT be detected by this suite.',
}

// ---------------------------------------------------------------------------
// Compare-mode extraction
// ---------------------------------------------------------------------------

const COMPARE_ACCUMULATION_FIELDS = [
  'monthlyUserCost',
  'monthlyEmployerContribution',
  'totalUserCost',
  'totalContributionsBeforeFees',
  'totalFees',
  'capitalAtRetirement',
  'realCapitalAtRetirement',
  'accumulationRiy',
] as const

const COMPARE_FUNDING_FIELDS: Record<string, readonly string[]> = {
  bav: [
    'annualGrossConversion',
    'annualEmployerContribution',
    'totalBavContributionAnnual',
    'monthlyNetCost',
    'annualNetCost',
    'monthlyTaxAndSvSavings',
    'taxFreePortionAnnual',
    'svFreePortionAnnual',
    'taxableOverflowAnnual',
    'svLiableOverflowAnnual',
    'monthlyStatutoryEmployerSubsidy',
    'monthlyStatutoryEmployerSubsidyUncapped',
    'monthlyStatutoryEmployerSubsidyCap',
    'monthlyContractualEmployerContribution',
    'estimatedMonthlyGrvReduction',
  ],
  basisrente: [
    'annualGrossContribution',
    'annualPensionContributionsTowardsCap',
    'remainingSchicht1Cap',
    'annualDeductible',
    'annualTaxSaving',
    'monthlyNetCost',
  ],
  altersvorsorgedepot: [
    'annualOwnContribution',
    'totalAllowanceAnnual',
    'careerStarterBonusAnnual',
    'totalContractContributionAnnual',
    'cappedAtContractMax',
    'guenstigerpruefungBenefitAnnual',
    'monthlyNetCost',
  ],
  riester: [
    'annualOwnContribution',
    'grundzulageAnnual',
    'childAllowanceAnnual',
    'careerStarterBonusAnnual',
    'totalAllowanceAnnual',
    'minEigenbeitragAnnual',
    'meetsMinContribution',
    'prorationFactor',
    'specialExpenseDeductibleAnnual',
    'guenstigerpruefungBenefitAnnual',
    'monthlyNetCost',
  ],
}

const COMPARE_FUNDING_RESULT_KEYS = {
  bav: 'bavFunding',
  basisrente: 'basisrenteFunding',
  altersvorsorgedepot: 'altersvorsorgedepotFunding',
  riester: 'riesterFunding',
} as const

function extractFundingStages(sink: StageSink, result: SimulationResult): void {
  for (const [key, fields] of Object.entries(COMPARE_FUNDING_FIELDS)) {
    const resultKey = COMPARE_FUNDING_RESULT_KEYS[key as keyof typeof COMPARE_FUNDING_RESULT_KEYS]
    const funding = result[resultKey] as unknown as Record<string, number | boolean> | undefined
    for (const field of fields) {
      sink.addNumbered(`funding.${key}.${field}`, (funding?.[field] as number | undefined) ?? null)
    }
  }
}

function extractProductStages(
  sink: StageSink,
  products: ProductResult[],
  scenarioId: ReturnScenarioId,
): void {
  for (const product of products) {
    if (product.scenarioId !== scenarioId) continue
    const p = `${product.productId}.${scenarioId}`
    for (const field of COMPARE_ACCUMULATION_FIELDS) {
      sink.addNumbered(`accumulation.${p}.${field}`, product[field] as number | undefined)
    }
    sink.addNumbered(`accumulation.${p}.guaranteeFloorAtRetirement`, product.guaranteeFloorAtRetirement)
    sink.add(`accumulation.${p}.guaranteeApplied`, product.guaranteeApplied ?? false)
    sink.addNumbered(`accumulation.${p}.rawCapitalAtRetirement`, product.rawCapitalAtRetirement)
    sink.addNumbered(`salaryPhase.${p}.taxAndSvSavings`, product.taxAndSvSavings)
    sink.addNumbered(`payout.${p}.grossMonthlyPayout`, product.grossMonthlyPayout)
    sink.addNumbered(`payout.${p}.payoutEndAge`, product.payoutEndAge)
    sink.addNumbered(`payout.${p}.leibrenteBreakEvenAge`, product.leibrenteBreakEvenAge)
    sink.addNumbered(`tax.lumpSum.${p}.afterTaxLumpSum`, product.afterTaxLumpSum)
    if (product.lumpSumDeductions) {
      sink.addNumbered(`tax.lumpSum.${p}.incomeTax`, product.lumpSumDeductions.incomeTax)
      sink.addNumbered(`tax.lumpSum.${p}.kvPv`, product.lumpSumDeductions.kvPv)
    }
    sink.addNumbered(`kvPv.${p}.kvPvMonthly`, product.kvPvMonthly)
    sink.addNumbered(`net.${p}.netMonthlyPayout`, product.netMonthlyPayout)
  }
}

function syncAssumptions(
  input: Pick<CompareCaseInput, 'profile' | 'assumptions' | 'anchorNetPerMonth'>,
  rules: GermanRules,
): ReturnType<typeof syncMonthlyContributions> {
  // Mirror useSimulationResult: the UI never simulates raw assumptions — it
  // syncs all products onto the shared monthly net-cost anchor first.
  return syncMonthlyContributions(
    normalizeMonthlyNettoBelastung(input.anchorNetPerMonth),
    input.assumptions,
    input.profile,
    rules,
  )
}

export function extractCompareStages(
  input: CompareCaseInput,
  rules: GermanRules,
): { stages: StageMap; unsupported: UnsupportedStage[] } {
  const sink = createSink()
  const simulation = simulateRetirementComparison(
    input.profile,
    syncAssumptions(input, rules),
    rules,
  )

  extractFundingStages(sink, simulation)
  for (const field of [
    'grossMonthlyPension',
    'netMonthlyPension',
    'taxMonthly',
    'kvPvMonthly',
    'projectedEntgeltpunkte',
    'grvReductionApplied',
  ] as const) {
    sink.addNumbered(`baseline.statutoryPension.${field}`, simulation.statutoryPension[field])
  }

  const scenarioIds = input.assumptions.returnScenarios.map((scenario) => scenario.id)
  for (const scenarioId of scenarioIds) {
    extractProductStages(sink, simulation.products, scenarioId)
  }

  return { stages: sink.stages, unsupported: [COMPARE_UNSUPPORTED_TAX] }
}

// ---------------------------------------------------------------------------
// Combine-mode extraction
// ---------------------------------------------------------------------------

function headroomStages(
  sink: StageSink,
  prefix: string,
  headroom: {
    capAnnual: number
    requestedAnnual: number
    fundedAnnual: number
    remainingAnnual: number
    usedPct: number
    constrained: boolean
    allowanceAnnual?: number
  } | undefined,
): void {
  if (!headroom) {
    sink.add(`${prefix}.present`, false)
    return
  }
  sink.add(`${prefix}.present`, true)
  sink.addNumbered(`${prefix}.capAnnual`, headroom.capAnnual)
  sink.addNumbered(`${prefix}.requestedAnnual`, headroom.requestedAnnual)
  sink.addNumbered(`${prefix}.fundedAnnual`, headroom.fundedAnnual)
  sink.addNumbered(`${prefix}.remainingAnnual`, headroom.remainingAnnual)
  sink.addNumbered(`${prefix}.usedPct`, headroom.usedPct)
  sink.add(`${prefix}.constrained`, headroom.constrained)
  if ('allowanceAnnual' in headroom) {
    sink.addNumbered(`${prefix}.allowanceAnnual`, headroom.allowanceAnnual)
  }
}

const COMBINE_AGGREGATE_TAX_FIELDS = [
  'statutoryPensionTaxable',
  'bavPensionTaxable',
  'privateInsuranceTaxable',
  'otherTaxable',
  'werbungskostenVersorgung',
  'werbungskostenRenten',
  'sonderausgaben',
  'zuVersteuerndesEinkommen',
  'einkommensteuer',
  'solidaritaetszuschlag',
  'abgeltungsteuerOnPrivateInsurance',
  'totalTaxAnnual',
  'netRetirementIncomeAnnual',
] as const

const COMBINE_KVPV_FIELDS = [
  'bavKvMonthly',
  'bavPvMonthly',
  'otherVersorgungsbezuegeKvMonthly',
  'otherVersorgungsbezuegePvMonthly',
  'statutoryPensionKvMonthly',
  'statutoryPensionPvMonthly',
  'freiwilligOtherKvMonthly',
  'freiwilligOtherPvMonthly',
  'totalKvMonthly',
  'totalPvMonthly',
] as const

const COMBINE_GROSS_CHANNELS = [
  'statutoryPension',
  'bav',
  'privateInsurance',
  'basisrente',
  'altersvorsorgedepot',
  'riester',
  'etf',
] as const

function extractCombinedResult(sink: StageSink, scenarioId: string, combined: CombinedResult): void {
  for (const channel of COMBINE_GROSS_CHANNELS) {
    sink.addNumbered(`payout.${scenarioId}.grossByChannel.${channel}`, combined.monthlyGrossPayouts[channel])
  }
  for (const field of COMBINE_AGGREGATE_TAX_FIELDS) {
    sink.addNumbered(`tax.${scenarioId}.aggregate.${field}`, combined.aggregateTax[field])
  }
  for (const field of COMBINE_KVPV_FIELDS) {
    sink.addNumbered(`kvPv.${scenarioId}.aggregate.${field}`, combined.aggregateKvPv[field])
  }
  for (const [instanceId, share] of Object.entries(combined.byInstance)) {
    sink.addNumbered(`tax.${scenarioId}.byInstance.${instanceId}.taxShareAnnual`, share.taxShareAnnual)
    sink.addNumbered(`kvPv.${scenarioId}.byInstance.${instanceId}.kvPvShare`, share.kvPvShare)
    sink.addNumbered(`net.${scenarioId}.byInstance.${instanceId}.monthlyNet`, share.monthlyNet)
  }
  sink.addNumbered(`net.${scenarioId}.statutoryPensionMonthlyNet`, combined.statutoryPensionMonthlyNet)
  sink.addNumbered(`net.${scenarioId}.monthlyNetIncome`, combined.monthlyNetIncome)
}

export function extractCombineStages(
  workspace: Workspace,
  rules: GermanRules,
): { stages: StageMap; unsupported: UnsupportedStage[] } {
  const sink = createSink()
  const bundle = runCombineSimulation(workspace, rules)

  const headroom = bundle.portfolioFunding.headroom
  headroomStages(sink, 'funding.headroom.bav', headroom.bav)
  headroomStages(sink, 'funding.headroom.basisrente', headroom.basisrente)
  headroomStages(sink, 'funding.headroom.riester', headroom.riester)
  for (const [instanceId, avdHeadroom] of Object.entries(headroom.altersvorsorgedepotByInstanceId)) {
    headroomStages(sink, `funding.headroom.altersvorsorgedepot.${instanceId}`, avdHeadroom)
  }
  sink.addNumbered('funding.salary.annualGross', bundle.portfolioFunding.salaryForOtherFunding.annualGross)
  sink.addNumbered('funding.salary.annualNet', bundle.portfolioFunding.salaryForOtherFunding.annualNet)
  sink.addNumbered('funding.salary.incomeTax', bundle.portfolioFunding.salaryForOtherFunding.incomeTax)

  for (const field of [
    'grossMonthlyPension',
    'netMonthlyPension',
    'taxMonthly',
    'kvPvMonthly',
    'projectedEntgeltpunkte',
    'grvReductionApplied',
  ] as const) {
    sink.addNumbered(`baseline.statutoryPension.${field}`, bundle.statutoryPension[field])
  }

  // Per-instance accumulation, sorted by instance id for stable stage order.
  const instanceIds = Object.keys(bundle.perInstance).sort()
  for (const instanceId of instanceIds) {
    for (const result of bundle.perInstance[instanceId]) {
      const p = `${instanceId}.${result.scenarioId}`
      sink.addNumbered(`accumulation.${p}.monthlyUserCost`, result.monthlyUserCost)
      sink.addNumbered(`accumulation.${p}.totalUserCost`, result.totalUserCost)
      sink.addNumbered(`accumulation.${p}.totalContributionsBeforeFees`, result.totalContributionsBeforeFees)
      sink.addNumbered(`accumulation.${p}.totalFees`, result.totalFees)
      sink.addNumbered(`accumulation.${p}.capitalAtRetirement`, result.capitalAtRetirement)
      sink.addNumbered(`payout.${result.scenarioId}.byInstance.${instanceId}.grossMonthlyPayout`, result.grossMonthlyPayout)
      sink.addNumbered(`net.${result.scenarioId}.byInstance.${instanceId}.productNetMonthly`, result.netMonthlyPayout)
    }
  }

  const scenarioIds = workspace.baseline.assumptions.returnScenarios.map((scenario) => scenario.id)
  for (const scenarioId of scenarioIds) {
    const combined = bundle.combinedByScenarioId[scenarioId]
    if (!combined) {
      sink.add(`net.${scenarioId}.present`, false)
      continue
    }
    extractCombinedResult(sink, scenarioId, combined)
  }

  return { stages: sink.stages, unsupported: [COMBINE_UNSUPPORTED_TAX] }
}

// ---------------------------------------------------------------------------
// Monte-Carlo extraction (seeded, small runs)
// ---------------------------------------------------------------------------

const MC_PERCENTILE_FIELDS = ['p10', 'p50', 'p90'] as const

export function extractMonteCarloStages(
  input: MonteCarloCaseInput,
  rules: GermanRules,
): { stages: StageMap; unsupported: UnsupportedStage[] } {
  const sink = createSink()
  const syncedAssumptions = syncAssumptions(input, rules)

  const mc = runMonteCarlo({
    profile: input.profile,
    assumptions: syncedAssumptions,
    rules,
    scenarioId: input.scenarioId,
    visibleProducts: syncedAssumptions.visibleProducts,
  })
  if (!mc) {
    throw new Error(
      `Monte-Carlo case produced no result (runs <= 0 or no visible products): scenarioId=${input.scenarioId}`,
    )
  }

  sink.add('mc.runs', mc.runs)
  sink.add('mc.seed', mc.seed)
  sink.addNumbered('mc.annualReturn', mc.annualReturn)
  sink.addNumbered('mc.annualVolatility', mc.annualVolatility)
  for (const field of MC_PERCENTILE_FIELDS) {
    sink.addNumbered(`mc.marketAnnualReturn.${field}`, mc.marketAnnualReturn[field])
  }
  for (const summary of mc.summaries) {
    const p = summary.productId
    for (const field of MC_PERCENTILE_FIELDS) {
      sink.addNumbered(`mc.${p}.capital.${field}`, summary.capital[field])
      sink.addNumbered(`mc.${p}.netMonthlyPayout.${field}`, summary.netMonthlyPayout[field])
    }
    sink.addNumbered(`mc.${p}.capital.expected`, summary.expectedCapital)
    sink.addNumbered(`mc.${p}.netMonthlyPayout.expected`, summary.expectedNetMonthlyPayout)
    sink.addNumbered(`mc.${p}.bestCapitalProbability`, summary.bestCapitalProbability)
    sink.addNumbered(`mc.${p}.bestPensionProbability`, summary.bestPensionProbability)
    sink.addNumbered(`mc.${p}.belowUserCostProbability`, summary.belowUserCostProbability)
    sink.addNumbered(`mc.${p}.guaranteeAppliedProbability`, summary.guaranteeAppliedProbability)
  }

  return { stages: sink.stages, unsupported: [MC_UNSUPPORTED_BANDS] }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Baseline profile identity for sanity messages (not a stage). */
export function describeProfile(profile: PersonalProfile): string {
  return `age ${profile.age}→${profile.retirementAge}, salary ${profile.grossSalaryYear} EUR`
}

export function extractStages(
  input: CaseInput,
  rules: GermanRules,
): { stages: StageMap; unsupported: UnsupportedStage[] } {
  switch (input.kind) {
    case 'compare':
      return extractCompareStages(input, rules)
    case 'combine':
      return extractCombineStages(input.workspace, rules)
    case 'monte-carlo':
      return extractMonteCarloStages(input, rules)
  }
}
