/**
 * Result readiness — one pure selector deciding whether a household result may
 * be shown, and what the user must fix first.
 *
 * Phase 1 of the simplification project
 * (`docs/redesign/simplification/notes/state-contract.md` §3). Pure and
 * React-free: `MeinPlanPage`, the alternatives before/after panel, the
 * comparison surface and both export builders consume this selector instead of
 * re-deriving the policy locally.
 *
 * Policy (binding):
 *  1. `error` when the simulation threw or the headline is non-finite. Never
 *     render a plausible zero for an invalid calculation.
 *  2. `incomplete` when any blocking reason exists.
 *  3. `estimated` when nothing blocks but at least one assumption reason exists.
 *  4. `available` otherwise.
 *  5. `pensionBaselineType === 'none'` is an explicit, complete answer — never
 *     a reason.
 *  6. `canShowHouseholdTotal === false` for `incomplete` and `error`; the total
 *     is suppressed, not approximated, in the UI and in exports.
 */

import type { InputStatus } from '../domain/inputStatus'
import type { InstanceCommon } from '../domain/instances'
import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type { ProductId } from '../engine/productRegistry'
import { PRODUCT_REGISTRY } from '../engine/productRegistry'
import { resolveInputStatus } from '../features/results/provenanceHelpers'
import type { CombineSimulationBundle } from './useCombineSimulation'
import { ROUTES, type Route } from './useRoute'

export type ReadinessStatus = 'available' | 'estimated' | 'incomplete' | 'error'

export type ReadinessCode =
  | 'statutory-pension-unknown'
  | 'pension-entry-skipped'
  | 'instance-capital-unknown'
  | 'instance-contribution-unknown'
  | 'pkv-premium-unknown'
  | 'retirement-age-unknown'
  | 'simulation-error'
  | 'assumed-fees'
  | 'assumed-payout-mode'
  | 'shared-drawdown-horizon'

export interface ReadinessReason {
  code: ReadinessCode
  severity: 'blocking' | 'assumption'
  /** One German line, ready to render. */
  label: string
  /** Where the user fixes it. */
  target: { route: Route; anchor?: string }
  instanceId?: string
}

export interface ResultReadiness {
  status: ReadinessStatus
  reasons: ReadinessReason[]
  blocking: ReadinessReason[]
  assumptions: ReadinessReason[]
  /** `false` for `incomplete` and `error` — suppress the total, never approximate it. */
  canShowHouseholdTotal: boolean
}

// ---------------------------------------------------------------------------
// Workspace instance walk (shared with planSummary)
// ---------------------------------------------------------------------------

/**
 * A workspace instance seen through the fields the non-product-specific
 * selectors need. Every field is optional because each product carries its own
 * subset; the selectors read them defensively by name.
 */
export type AnyWorkspaceInstance = InstanceCommon &
  Partial<{
    monthlyContribution: number
    monthlyGrossConversion: number
    monthlyGrossContribution: number
    monthlyOwnContribution: number
    payoutMode: string
    zeitrenteYears: number
    payoutPlanEndAge: number
  }>

export interface WorkspaceInstanceEntry {
  productId: ProductId
  instance: AnyWorkspaceInstance
}

/**
 * Every instance in the workspace, registry-ordered and tagged with its product
 * id. Registry-driven so a newly registered product is picked up automatically.
 */
export function listWorkspaceInstances(
  wsa: WorkspaceAssumptionsV2,
): WorkspaceInstanceEntry[] {
  const out: WorkspaceInstanceEntry[] = []
  for (const entry of PRODUCT_REGISTRY) {
    const raw = (wsa as unknown as Record<string, unknown>)[entry.assumptionsKey]
    if (!Array.isArray(raw)) continue
    for (const instance of raw as AnyWorkspaceInstance[]) {
      out.push({ productId: entry.metadata.id as ProductId, instance })
    }
  }
  return out
}

/** Instances that contribute to the household result (active or beitragsfrei). */
export function isCountedInstance(instance: AnyWorkspaceInstance): boolean {
  return instance.status === 'active' || instance.status === 'paid_up'
}

/** The field name each product uses for its own monthly contribution. */
export const CONTRIBUTION_FIELD_BY_PRODUCT: Record<ProductId, string> = {
  etf: 'monthlyContribution',
  versicherung: 'monthlyContribution',
  bav: 'monthlyGrossConversion',
  basisrente: 'monthlyGrossContribution',
  altersvorsorgedepot: 'monthlyOwnContribution',
  riester: 'monthlyOwnContribution',
}

/** The field name each product uses for its headline cost input. */
const FEE_FIELD_BY_PRODUCT: Record<ProductId, string> = {
  etf: 'fees',
  versicherung: 'effektivkostenPct',
  bav: 'effektivkostenPct',
  basisrente: 'fees',
  altersvorsorgedepot: 'fees',
  riester: 'fees',
}

function statusOf(instance: AnyWorkspaceInstance, key: string): InputStatus {
  return resolveInputStatus(instance.inputStatus, instance.evidenceMap?.[key], key)
}

function instanceLabel(instance: AnyWorkspaceInstance, productId: ProductId): string {
  const label = instance.label?.trim()
  return label && label.length > 0 ? label : productId
}

// ---------------------------------------------------------------------------
// selectResultReadiness
// ---------------------------------------------------------------------------

export function selectResultReadiness(
  workspace: Workspace,
  simulation: CombineSimulationBundle | null,
  simulationError?: unknown,
): ResultReadiness {
  const reasons: ReadinessReason[] = []
  const wsa = workspace.baseline.assumptions
  const profile = workspace.baseline.profile
  const scenarioStatus = (key: string): InputStatus =>
    resolveInputStatus(wsa.inputStatus, undefined, key)

  // 1. Hard error — a throw, a missing bundle, or a non-finite headline.
  const headlineFinite = simulation
    ? Object.values(simulation.combinedByScenarioId).every((c) =>
        Number.isFinite(c.monthlyNetIncome),
      )
    : false
  if (simulationError !== undefined && simulationError !== null) {
    reasons.push({
      code: 'simulation-error',
      severity: 'blocking',
      label: 'Die Berechnung konnte nicht abgeschlossen werden. Bitte prüfe deine Angaben.',
      target: { route: ROUTES.eingaben },
    })
  } else if (simulation === null || !headlineFinite) {
    reasons.push({
      code: 'simulation-error',
      severity: 'blocking',
      label: 'Es liegt noch kein gültiges Ergebnis vor. Bitte prüfe deine Angaben.',
      target: { route: ROUTES.eingaben },
    })
  }

  // 2. Profile-level blockers.
  if (scenarioStatus('profile.retirementAge') === 'unknown') {
    reasons.push({
      code: 'retirement-age-unknown',
      severity: 'blocking',
      label: 'Dein geplantes Renteneintrittsalter fehlt.',
      target: { route: ROUTES.eingaben, anchor: 'profile-retirementAge' },
    })
  }
  if (profile.publicHealthInsurance === false) {
    const pkvUnknown =
      scenarioStatus('profile.pkvMonthlyPremium') === 'unknown' ||
      scenarioStatus('profile.pPVMonthlyPremium') === 'unknown'
    if (pkvUnknown) {
      reasons.push({
        code: 'pkv-premium-unknown',
        severity: 'blocking',
        label: 'Dein PKV-Beitrag fehlt — ohne ihn lässt sich dein Netto nicht berechnen.',
        target: { route: ROUTES.eingaben, anchor: 'profile-pkvMonthlyPremium' },
      })
    }
  }

  // 3. Statutory pension. 'none' is an explicit, complete answer and never a
  //    reason — neither blocking nor an assumption.
  const pensionBaselineType = wsa.statutoryPension.pensionBaselineType ?? 'grv'
  if (pensionBaselineType !== 'none') {
    if (wsa.statutoryPension.pensionEntryMethod?.kind === 'skipped') {
      reasons.push({
        code: 'pension-entry-skipped',
        severity: 'blocking',
        label: 'Die Angaben zu deiner gesetzlichen Rente stehen noch aus.',
        target: { route: ROUTES.eingaben, anchor: 'statutory-pension' },
      })
    } else {
      const epUnknown = scenarioStatus('statutoryPension.currentEntgeltpunkte') === 'unknown'
      const grossUnknown = scenarioStatus('statutoryPension.manualMonthlyGross') === 'unknown'
      if (epUnknown || grossUnknown) {
        reasons.push({
          code: 'statutory-pension-unknown',
          severity: 'blocking',
          label: 'Deine gesetzliche Rente ist als „weiß ich nicht" markiert.',
          target: { route: ROUTES.eingaben, anchor: 'statutory-pension' },
        })
      }
    }
  }

  // 4. Per-contract blockers + assumptions.
  let anyAssumedFees = false
  let anyAssumedPayoutMode = false
  const drawdownInstanceIds: string[] = []

  for (const { productId, instance } of listWorkspaceInstances(wsa)) {
    if (!isCountedInstance(instance)) continue
    const label = instanceLabel(instance, productId)
    const target = { route: ROUTES.vertrag(instance.instanceId) }

    if (statusOf(instance, 'currentValueEUR') === 'unknown') {
      reasons.push({
        code: 'instance-capital-unknown',
        severity: 'blocking',
        label: `Aktueller Wert von „${label}" ist unbekannt.`,
        target,
        instanceId: instance.instanceId,
      })
    }
    const contributionField = CONTRIBUTION_FIELD_BY_PRODUCT[productId]
    if (instance.status !== 'paid_up' && statusOf(instance, contributionField) === 'unknown') {
      reasons.push({
        code: 'instance-contribution-unknown',
        severity: 'blocking',
        label: `Monatlicher Beitrag von „${label}" ist unbekannt.`,
        target,
        instanceId: instance.instanceId,
      })
    }

    if (statusOf(instance, FEE_FIELD_BY_PRODUCT[productId]) === 'assumed') {
      anyAssumedFees = true
    }
    if (statusOf(instance, 'payoutMode') === 'assumed') {
      anyAssumedPayoutMode = true
    }
    if (productId === 'etf' || instance.payoutMode === 'kapitalverzehr') {
      drawdownInstanceIds.push(instance.instanceId)
    }
  }

  if (anyAssumedFees) {
    reasons.push({
      code: 'assumed-fees',
      severity: 'assumption',
      label: 'Für mindestens einen Vertrag rechnen wir mit Modellkosten.',
      target: { route: ROUTES.eingabenProdukte },
    })
  }
  if (anyAssumedPayoutMode) {
    reasons.push({
      code: 'assumed-payout-mode',
      severity: 'assumption',
      label: 'Die Auszahlungsart ist für mindestens einen Vertrag angenommen.',
      target: { route: ROUTES.eingabenProdukte },
    })
  }
  if (drawdownInstanceIds.length > 0) {
    reasons.push({
      code: 'shared-drawdown-horizon',
      severity: 'assumption',
      label: `Entnahmen laufen bis zum gemeinsam angenommenen Alter ${wsa.retirementEndAge}.`,
      target: { route: ROUTES.kapital },
    })
  }

  const blocking = reasons.filter((r) => r.severity === 'blocking')
  const assumptions = reasons.filter((r) => r.severity === 'assumption')
  const hasError = blocking.some((r) => r.code === 'simulation-error')

  const status: ReadinessStatus = hasError
    ? 'error'
    : blocking.length > 0
      ? 'incomplete'
      : assumptions.length > 0
        ? 'estimated'
        : 'available'

  return {
    status,
    reasons,
    blocking,
    assumptions,
    canShowHouseholdTotal: status === 'available' || status === 'estimated',
  }
}

/**
 * German one-liners for a suppressed household total, ready for the export
 * Hinweis section (lead decision §10.3: blank cell + one Hinweis line, never a
 * zero and never a placeholder number).
 */
export function householdTotalBlockedLabels(readiness: ResultReadiness): string[] {
  return readiness.canShowHouseholdTotal ? [] : readiness.blocking.map((r) => r.label)
}
