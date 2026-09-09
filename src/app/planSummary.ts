/**
 * Plan summary — the household headline, its source rows, their payout
 * durations, and one shared "heutige Euro" deflator.
 *
 * Phase 1 of the simplification project
 * (`docs/redesign/simplification/notes/state-contract.md` §4). Pure and
 * React-free.
 *
 * Two invariants this module exists to protect:
 *
 *  1. **Never re-sum independently taxed product headlines.** The total comes
 *     from `CombinedResult.monthlyNetIncome`; the rows come from
 *     `CombinedResult.byInstance` plus the separate scalar
 *     `statutoryPensionMonthlyNet`. Per-instance `netMonthlyPayout` ignores
 *     progressive §32a EStG aggregation and KV/PV BBG apportionment.
 *  2. **One deflator.** The total, every row and the Wunschrente target use the
 *     same `realDeflator`, so the numbers on screen stay comparable. Both sides
 *     of an alternative comparison must use the *baseline's* deflator.
 *
 * Payout duration is read from the real payout mode of each contract — never a
 * blanket "lebenslang" and never a hardcoded end age. `retirementEndAge` is a
 * shared drawdown assumption, not an annuity's death date.
 */

import type { GermanRules } from '../domain'
import type { InputStatus } from '../domain/inputStatus'
import type { Workspace } from '../domain/workspace'
import type { CombinedResult } from '../engine/portfolioCombine'
import type { ProductId } from '../engine/productRegistry'
import { getProductMeta } from '../engine/productManifest'
import { de2026Rules } from '../rules/de2026'
import { resolveInputStatus } from '../features/results/provenanceHelpers'
import {
  CONTRIBUTION_FIELD_BY_PRODUCT,
  isCountedInstance,
  listWorkspaceInstances,
  selectResultReadiness,
  type AnyWorkspaceInstance,
  type ResultReadiness,
} from './resultReadiness'
import type { CombineSimulationBundle } from './useCombineSimulation'
import { ROUTES, type Route } from './useRoute'

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

export type DurationDescriptor =
  | { kind: 'lifelong' }
  | { kind: 'fixed-term'; endAge: number; years: number }
  /** Shared drawdown horizon — `sharedWith` lists the OTHER instance ids on it. */
  | { kind: 'drawdown-shared-horizon'; endAge: number; sharedWith: string[] }
  | { kind: 'avd-plan'; endAge: number }

/**
 * Derive the payout duration of one contract from its real payout mode.
 *
 * `sharedWith` is filled in by `selectPlanSummary`, which knows every other
 * drawdown instance; this helper returns an empty list.
 */
export function durationOfInstance(
  productId: ProductId,
  instance: AnyWorkspaceInstance,
  retirementAge: number,
  retirementEndAge: number,
  rules: GermanRules = de2026Rules,
): DurationDescriptor {
  const payoutMode = instance.payoutMode
  switch (productId) {
    case 'basisrente':
      // Capital payout is legally prohibited; the mode is a literal 'leibrente'.
      return { kind: 'lifelong' }
    case 'altersvorsorgedepot': {
      if (payoutMode === 'certified_payout_plan') {
        const endAge = Math.max(
          instance.payoutPlanEndAge ?? 0,
          rules.altersvorsorgedepot.payoutPlanMinEndAge,
        )
        return { kind: 'avd-plan', endAge }
      }
      return { kind: 'lifelong' }
    }
    case 'etf':
      return { kind: 'drawdown-shared-horizon', endAge: retirementEndAge, sharedWith: [] }
    case 'riester':
    case 'bav':
    case 'versicherung': {
      if (payoutMode === 'zeitrente') {
        const years = Math.max(0, instance.zeitrenteYears ?? 0)
        return { kind: 'fixed-term', endAge: retirementAge + years, years }
      }
      if (payoutMode === 'kapitalverzehr') {
        return { kind: 'drawdown-shared-horizon', endAge: retirementEndAge, sharedWith: [] }
      }
      return { kind: 'lifelong' }
    }
    default: {
      const _exhaustive: never = productId
      return _exhaustive
    }
  }
}

// ---------------------------------------------------------------------------
// Deflator
// ---------------------------------------------------------------------------

/**
 * Multiply a nominal figure by this to get "heutige Euro".
 *
 * Negative inflation assumptions are floored at 0 so the deflator never
 * *inflates* the headline; `yearsUntilRetirement` is floored at 0 so a user
 * already past their retirement age sees the nominal figure.
 */
export function realDeflator(inflationRate: number, yearsUntilRetirement: number): number {
  const rate = Math.max(0, Number.isFinite(inflationRate) ? inflationRate : 0)
  const years = Math.max(0, Number.isFinite(yearsUntilRetirement) ? yearsUntilRetirement : 0)
  return (1 + rate) ** -years
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface PlanSourceRow {
  /** `'statutory'` for the pension baseline, otherwise the instance id. */
  key: string
  instanceId?: string
  productId?: ProductId
  label: string
  netMonthlyNominal: number
  netMonthlyReal: number
  /** Worst input status across the row's inputs. */
  status: InputStatus
  duration: DurationDescriptor
  target?: Route
}

export interface PlanSummary {
  netMonthlyTotalNominal: number
  netMonthlyTotalReal: number
  /** Multiply nominal by this to get "heutige Euro". */
  deflator: number
  yearsUntilRetirement: number
  rows: PlanSourceRow[]
  gap?: { targetMonthly: number; gapNominal: number; gapReal: number }
  readiness: ResultReadiness
}

const STATUS_RANK: Record<InputStatus, number> = {
  unknown: 0,
  assumed: 1,
  entered: 2,
  document: 3,
}

function worstStatus(statuses: InputStatus[]): InputStatus {
  return statuses.reduce<InputStatus>(
    (worst, s) => (STATUS_RANK[s] < STATUS_RANK[worst] ? s : worst),
    'document',
  )
}

function statusOfInstanceField(instance: AnyWorkspaceInstance, key: string): InputStatus {
  return resolveInputStatus(instance.inputStatus, instance.evidenceMap?.[key], key)
}

function statutoryRowLabel(
  baselineType: Workspace['baseline']['assumptions']['statutoryPension']['pensionBaselineType'],
): string {
  switch (baselineType) {
    case 'versorgungswerk':
      return 'Versorgungswerk'
    case 'beamtenpension':
      return 'Beamtenpension'
    case 'none':
      return 'Keine Pflichtrente'
    default:
      return 'Gesetzliche Rente'
  }
}

/**
 * Build the plan summary for one return scenario.
 *
 * `scenarioId` selects the `CombinedResult`; when the id is unknown the summary
 * falls back to an empty result rather than to another scenario, so a stale id
 * can never silently show optimistic numbers.
 */
export function selectPlanSummary(
  workspace: Workspace,
  bundle: CombineSimulationBundle,
  scenarioId: string,
  options: { simulationError?: unknown; rules?: GermanRules } = {},
): PlanSummary {
  const rules = options.rules ?? de2026Rules
  const wsa = workspace.baseline.assumptions
  const profile = workspace.baseline.profile
  const combined: CombinedResult | undefined = bundle.combinedByScenarioId[scenarioId]

  const readiness = selectResultReadiness(workspace, bundle, options.simulationError)

  const yearsUntilRetirement = Math.max(0, profile.retirementAge - profile.age)
  const deflator = realDeflator(wsa.inflationRate, yearsUntilRetirement)

  const netMonthlyTotalNominal = combined?.monthlyNetIncome ?? 0
  const scenarioStatus = (key: string): InputStatus =>
    resolveInputStatus(wsa.inputStatus, undefined, key)

  const rows: PlanSourceRow[] = []

  // Statutory pension — a separate scalar, never a `byInstance` row.
  const baselineType = wsa.statutoryPension.pensionBaselineType ?? 'grv'
  const statutoryNominal = combined?.statutoryPensionMonthlyNet ?? 0
  const statutoryStatus: InputStatus =
    baselineType === 'none'
      ? 'entered'
      : wsa.statutoryPension.pensionEntryMethod?.kind === 'skipped'
        ? 'unknown'
        : worstStatus([
            scenarioStatus('statutoryPension.currentEntgeltpunkte'),
            scenarioStatus('statutoryPension.manualMonthlyGross'),
          ])
  rows.push({
    key: 'statutory',
    label: statutoryRowLabel(baselineType),
    netMonthlyNominal: statutoryNominal,
    netMonthlyReal: statutoryNominal * deflator,
    status: statutoryStatus,
    duration: { kind: 'lifelong' },
    target: ROUTES.eingaben,
  })

  // Contract rows — nets exclusively from the aggregate `byInstance` map.
  const counted = listWorkspaceInstances(wsa).filter(({ instance }) =>
    isCountedInstance(instance),
  )
  const durations = counted.map(({ productId, instance }) =>
    durationOfInstance(
      productId,
      instance,
      profile.retirementAge,
      wsa.retirementEndAge,
      rules,
    ),
  )
  const drawdownIds = counted
    .filter((_, i) => durations[i].kind === 'drawdown-shared-horizon')
    .map(({ instance }) => instance.instanceId)

  counted.forEach(({ productId, instance }, i) => {
    let duration = durations[i]
    if (duration.kind === 'drawdown-shared-horizon') {
      duration = {
        ...duration,
        sharedWith: drawdownIds.filter((id) => id !== instance.instanceId),
      }
    }
    const share = combined?.byInstance[instance.instanceId]
    const nominal = share?.monthlyNet ?? 0
    const label = instance.label?.trim().length
      ? instance.label
      : (getProductMeta(productId)?.label ?? productId)
    const statuses: InputStatus[] = [statusOfInstanceField(instance, 'currentValueEUR')]
    if (instance.status !== 'paid_up') {
      statuses.push(statusOfInstanceField(instance, CONTRIBUTION_FIELD_BY_PRODUCT[productId]))
    }
    rows.push({
      key: instance.instanceId,
      instanceId: instance.instanceId,
      productId,
      label,
      netMonthlyNominal: nominal,
      netMonthlyReal: nominal * deflator,
      status: worstStatus(statuses),
      duration,
      target: ROUTES.vertrag(instance.instanceId),
    })
  })

  // Wunschrente gap — only against an explicit user target and only when the
  // total is actually shown. Never derived from a replacement ratio
  // (`RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO` stays confined to the legacy
  // Rentenlücke dashboard).
  //
  // `desiredNetMonthlyPension` is a wish stated in today's money, so the two
  // gaps compare like with like: the real gap against the deflated total, and
  // the nominal gap against the target re-inflated to the retirement year.
  const targetMonthly = profile.desiredNetMonthlyPension ?? 0
  const gap =
    targetMonthly > 0 && readiness.canShowHouseholdTotal
      ? {
          targetMonthly,
          gapNominal: targetMonthly / deflator - netMonthlyTotalNominal,
          gapReal: targetMonthly - netMonthlyTotalNominal * deflator,
        }
      : undefined

  return {
    netMonthlyTotalNominal,
    netMonthlyTotalReal: netMonthlyTotalNominal * deflator,
    deflator,
    yearsUntilRetirement,
    rows,
    gap,
    readiness,
  }
}
