/**
 * `/alternativen` flow state (simplification Phase 3).
 *
 * One hook that turns the Phase 3 mutation and preview primitives into the
 * props the alternatives surface renders from. The UI agent builds the
 * before/after flow purely from what this returns; it never reaches for
 * `portfolioState`, `runCombineSimulation` or `whatIfPreview` itself.
 *
 * Three rules this module exists to keep structural rather than conventional:
 *
 *  1. **Only `apply` writes to the plan.** Building a preview, saving an
 *     alternative and reopening one all leave `workspace.baseline` untouched.
 *     Saving appends a what-if; the baseline changes exactly once, when the
 *     user applies.
 *  2. **One money basis.** Both sides of a comparison are deflated with the
 *     *baseline's* deflator (state contract §4), so "Bisher", "Danach" and the
 *     delta stay comparable. `delta` is real-basis and `null` whenever either
 *     side may not show a household total — never an approximated number.
 *  3. **Two full simulations, never a second arithmetic path.** "Danach" comes
 *     from `runCombineSimulation` on the what-if, exactly like "Bisher" comes
 *     from it on the baseline. There is no shortcut estimate anywhere here.
 *
 * Heavy work is memoised: the baseline summary per simulation bundle, and each
 * saved alternative's frozen before/after per scenario object identity (a
 * `WeakMap`, so a rebased or re-frozen what-if recomputes and a removed one is
 * collected).
 */

import { useCallback, useMemo, useState } from 'react'
import type { GermanRules } from '../../domain'
import type { InputStatus } from '../../domain/inputStatus'
import type { Scenario, WhatIfScenario, Workspace } from '../../domain/workspace'
import { getProductMeta } from '../../engine/productManifest'
import type { ProductId } from '../../engine/productRegistry'
import { de2026Rules } from '../../rules/de2026'
import { resolveInputStatus } from '../results/provenanceHelpers'
import { generateContractDecisions } from '../../app/contractDecisions'
import { selectPlanSummary, type PlanSummary } from '../../app/planSummary'
import type {
  UsePortfolioStateApi,
  WhatIfApplyFailure,
  WorkspaceUndo,
} from '../../app/portfolioState'
import {
  CONTRIBUTION_FIELD_BY_PRODUCT,
  isCountedInstance,
  listWorkspaceInstances,
  type AnyWorkspaceInstance,
} from '../../app/resultReadiness'
import {
  runCombineSimulation,
  type CombineSimulationBundle,
  type CombineSimulationState,
} from '../../app/useCombineSimulation'
import {
  buildContributionWhatIf,
  describeWhatIf,
  whatIfStatus,
  type WhatIfChange,
  type WhatIfDescription,
} from '../../app/whatIfPreview'

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** The two changes this flow offers. Beitragsfrei is a real decision, not "0 €". */
export type AlternativeDecision = 'contribution' | 'paid_up'

/**
 * What the contract's monthly number actually *is*, so the UI can pick the
 * right label ("Neuer monatlicher Beitrag in €" vs "Neuer monatlicher
 * Bruttobeitrag zur bAV in €", journey map §4) without a product switch of its
 * own.
 */
export type ContributionKind =
  | 'netCost'
  | 'grossConversion'
  | 'grossContribution'
  | 'ownContribution'
  | 'savingsRate'

const CONTRIBUTION_KIND_BY_PRODUCT: Record<ProductId, ContributionKind> = {
  etf: 'savingsRate',
  versicherung: 'netCost',
  bav: 'grossConversion',
  basisrente: 'grossContribution',
  altersvorsorgedepot: 'ownContribution',
  riester: 'ownContribution',
}

export interface AlternativenContract {
  instanceId: string
  label: string
  productId: ProductId
  /** `null` when the product's contribution field is absent on this instance. */
  contributionMonthly: number | null
  contributionStatus: InputStatus
  contributionKind: ContributionKind
  /** Only the decisions this flow supports, filtered by what the contract allows. */
  allowedDecisions: AlternativeDecision[]
}

export interface AlternativenDraft {
  instanceId: string | null
  decision: AlternativeDecision
  newContribution: number | null
}

export interface AlternativenPreview {
  whatIf: WhatIfScenario
  before: PlanSummary
  after: PlanSummary
  /** Real-basis (heutige Euro) monthly change; `null` when either side is suppressed. */
  delta: number | null
  description: WhatIfDescription
}

export type SavedAlternativeStatus = ReturnType<typeof whatIfStatus>

export interface SavedAlternative {
  id: string
  label: string
  /** ISO stamp of the fork — "Stand beim Speichern". */
  savedAt: string
  status: SavedAlternativeStatus
  description: WhatIfDescription
  /** Frozen comparison basis: the snapshot the alternative was saved against. */
  before: PlanSummary | null
  /** The alternative itself, on the frozen snapshot's money basis. */
  after: PlanSummary | null
  canApply: boolean
  /** German reason `canApply` is false. Absent when it is true. */
  blockReason?: string
}

export type AlternativenApplyResult =
  | { ok: true; undo: WorkspaceUndo }
  | { ok: false; reason: WhatIfApplyFailure; message: string }

export type AlternativenRebaseResult =
  | { ok: true; undo: WorkspaceUndo }
  | { ok: false; reason: 'not-found' | 'shape-drift'; message: string }

export interface AlternativenNotification {
  message: string
  canUndo: boolean
}

/** German copy for every refusal and every mutation notice (journey map §4). */
export const ALTERNATIVEN_COPY = {
  stale:
    'Dein Plan hat sich seit dem Speichern geändert. Berechne die Alternative zuerst neu.',
  shapeDrift:
    'Die Verträge in deinem Plan haben sich verändert. Starte eine neue Änderung, damit vorher und nachher zusammenpassen.',
  notFound: 'Diese Alternative ist nicht mehr vorhanden.',
  missingSource: 'Diese Vorsorge ist nicht mehr in deinem Plan.',
  noContract: 'Wähle zuerst eine Vorsorge aus, die du verändern möchtest.',
  noContribution: 'Bitte gib einen neuen monatlichen Beitrag ein.',
  invalidChange: 'Diese Änderung lässt sich nicht berechnen. Bitte prüfe den neuen Beitrag.',
  simulationFailed:
    'Die Berechnung konnte nicht abgeschlossen werden. Bitte prüfe deine Angaben.',
  noPreview: 'Sieh dir die Änderung zuerst an, bevor du sie speicherst.',
  removed: 'Alternative entfernt.',
  applied: 'Änderung in den Plan übernommen.',
  rebased: 'Alternative neu berechnet.',
  undone: 'Rückgängig gemacht.',
} as const

export interface AlternativenFlow {
  /** Every contract in the plan that can be changed, in registry order. */
  contracts: AlternativenContract[]
  draft: AlternativenDraft
  selectContract: (instanceId: string | null) => void
  setDecision: (decision: AlternativeDecision) => void
  setContribution: (monthly: number | null) => void
  /** The computed before/after, or `null` until `runPreview` succeeds. */
  preview: AlternativenPreview | null
  previewError: string | null
  runPreview: () => void
  /** Drop the current preview. Draft edits already do this; exposed for the UI. */
  invalidatePreview: () => void
  /** Persist the previewed what-if. Returns its id, or `null` with an error set. */
  saveAlternative: (label?: string) => string | null
  saved: SavedAlternative[]
  openSaved: (id: string | null) => void
  openWhatIfId: string | null
  apply: (id: string) => AlternativenApplyResult
  rebase: (id: string) => AlternativenRebaseResult
  remove: (id: string) => WorkspaceUndo
  undo: () => void
  notification: AlternativenNotification | null
}

export interface UseAlternativenFlowInput {
  workspace: Workspace
  portfolioState: UsePortfolioStateApi
  /** The already-running baseline simulation — the "Bisher" side. */
  baselineSimulation: CombineSimulationState
  /** Which return scenario both sides are read on. */
  scenarioId: string
  /**
   * The id from `?id=`, when the container reads one. Kept in step with the
   * hook's own selection so browser back/forward stays authoritative.
   */
  requestedWhatIfId?: string | null
  /** Called by `openSaved` so the container can push the query string. */
  onOpenSaved?: (id: string | null) => void
  rules?: GermanRules
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function contributionOf(productId: ProductId, instance: AnyWorkspaceInstance): number | null {
  const field = CONTRIBUTION_FIELD_BY_PRODUCT[productId]
  const value = (instance as unknown as Record<string, unknown>)[field]
  return typeof value === 'number' ? value : null
}

/**
 * Which of this flow's two decisions the contract allows.
 *
 * `generateContractDecisions` stays the authority on beitragsfrei — re-deriving
 * "which products can go paid-up" here is exactly the drift the registry exists
 * to prevent. The extra `productId !== 'etf'` guard is not a second rule: it
 * repairs the id-prefix `detectSlot` heuristic inside that helper, which
 * classifies an ETF instance whose id lacks the `etf-` prefix as insurance and
 * would then offer beitragsfrei for a contract that has no contributions to
 * stop. Here the product id comes from the registry walk, so it is exact.
 */
function allowedDecisionsFor(
  workspace: Workspace,
  productId: ProductId,
  instance: AnyWorkspaceInstance,
): AlternativeDecision[] {
  const allowed: AlternativeDecision[] = []
  if (instance.status !== 'paid_up') allowed.push('contribution')

  const structurallyPaidUpCapable = productId !== 'etf' && instance.status !== 'paid_up'
  if (!structurallyPaidUpCapable) return allowed

  let offersBeitragsfrei: boolean
  try {
    offersBeitragsfrei = generateContractDecisions(workspace, instance.instanceId).some(
      (decision) => decision.kind === 'beitragsfrei',
    )
  } catch {
    // A decision generator that throws (an incomplete contract, a transfer
    // target it cannot price) must not remove a legitimate option; fall back to
    // the structural rule.
    offersBeitragsfrei = true
  }
  if (offersBeitragsfrei) allowed.push('paid_up')
  return allowed
}

/**
 * Re-deflate a summary onto another summary's money basis.
 *
 * `selectPlanSummary` derives its own deflator from the scenario it is handed.
 * For a comparison that is wrong: both sides must use the *baseline's*
 * deflator (state contract §4), or a what-if that touched nothing about
 * inflation could still move the "in heutigen Euro" figure. `planSummary.ts`
 * takes no external deflator today, so the override happens here — nominal
 * figures are untouched, only the real ones are recomputed.
 */
export function withDeflator(summary: PlanSummary, deflator: number): PlanSummary {
  return {
    ...summary,
    deflator,
    netMonthlyTotalReal: summary.netMonthlyTotalNominal * deflator,
    rows: summary.rows.map((row) => ({
      ...row,
      netMonthlyReal: row.netMonthlyNominal * deflator,
    })),
    gap: summary.gap
      ? {
          targetMonthly: summary.gap.targetMonthly,
          gapNominal: summary.gap.targetMonthly / deflator - summary.netMonthlyTotalNominal,
          gapReal: summary.gap.targetMonthly - summary.netMonthlyTotalNominal * deflator,
        }
      : undefined,
  }
}

/** A workspace whose baseline *is* the given scenario. Nothing is mutated. */
function workspaceViewOf(workspace: Workspace, scenario: Scenario): Workspace {
  return {
    ...workspace,
    baseline: {
      ...workspace.baseline,
      profile: scenario.profile,
      partner: scenario.partner,
      assumptions: scenario.assumptions,
    },
  }
}

/**
 * Simulate one scenario as if it were the plan, and summarise it.
 *
 * Returns `null` when the engine throws: a failed alternative must read as
 * "noch offen", never as a plausible zero (lead decision §10.3).
 */
function summariseScenario(
  workspace: Workspace,
  scenario: Scenario,
  scenarioId: string,
  rules: GermanRules,
): PlanSummary | null {
  const view = workspaceViewOf(workspace, scenario)
  let bundle: CombineSimulationBundle
  try {
    bundle = runCombineSimulation(view, rules)
  } catch {
    return null
  }
  return selectPlanSummary(view, bundle, scenarioId, { rules })
}

function blockReasonFor(status: SavedAlternativeStatus): string | undefined {
  switch (status) {
    case 'stale':
      return ALTERNATIVEN_COPY.stale
    case 'shape-drift':
      return ALTERNATIVEN_COPY.shapeDrift
    case 'missing-source':
      return ALTERNATIVEN_COPY.missingSource
    default:
      return undefined
  }
}

function applyFailureMessage(reason: WhatIfApplyFailure): string {
  switch (reason) {
    case 'stale':
      return ALTERNATIVEN_COPY.stale
    case 'shape-drift':
      return ALTERNATIVEN_COPY.shapeDrift
    default:
      return ALTERNATIVEN_COPY.notFound
  }
}

/**
 * The undo labels `portfolioState.commit` stamps, mapped to the user-facing
 * sentence. An unmapped label (a mutation from another surface that happens to
 * be the newest one) still renders rather than swallowing the undo offer.
 */
function notificationMessage(label: string): string {
  switch (label) {
    case 'Alternative entfernt':
      return ALTERNATIVEN_COPY.removed
    case 'Alternative übernommen':
      return ALTERNATIVEN_COPY.applied
    case 'Alternative neu berechnet':
      return ALTERNATIVEN_COPY.rebased
    default:
      return `${label}.`
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface PreviewState {
  /** The baseline the preview was computed against; a new one invalidates it. */
  basedOn: Scenario
  preview: AlternativenPreview
}

interface FrozenPair {
  before: PlanSummary | null
  after: PlanSummary | null
}

/**
 * Frozen before/after pairs, keyed by everything the pair is computed from:
 * the what-if object, the rules table, and the return-scenario id.
 *
 * A `WeakMap` rather than a hook-local ref: it is read while the `saved` memo
 * runs, the entries are a pure function of those three inputs, and a removed
 * or rebased what-if is collected with its entry. A rebase or a freeze
 * produces a new object and therefore a fresh, correct computation.
 *
 * The nesting is what keeps the cache honest: keyed on the what-if alone, a
 * switch to another return scenario (or another rules year) returned the pair
 * computed for the previous one. The two outer levels are weak so entries die
 * with their what-if / rules object; only the innermost `scenarioId` map is
 * strong, and it is bounded by the handful of return-scenario ids.
 */
const frozenPairCache = new WeakMap<
  WhatIfScenario,
  WeakMap<GermanRules, Map<string, FrozenPair>>
>()

/** Read the memoised pair for (whatIf, rules, scenarioId), computing it once. */
function frozenPairFor(
  whatIf: WhatIfScenario,
  rules: GermanRules,
  scenarioId: string,
  compute: () => FrozenPair,
): FrozenPair {
  let byRules = frozenPairCache.get(whatIf)
  if (!byRules) {
    byRules = new WeakMap<GermanRules, Map<string, FrozenPair>>()
    frozenPairCache.set(whatIf, byRules)
  }
  let byScenarioId = byRules.get(rules)
  if (!byScenarioId) {
    byScenarioId = new Map<string, FrozenPair>()
    byRules.set(rules, byScenarioId)
  }
  const cached = byScenarioId.get(scenarioId)
  if (cached) return cached
  const computed = compute()
  byScenarioId.set(scenarioId, computed)
  return computed
}

const EMPTY_DRAFT: AlternativenDraft = {
  instanceId: null,
  decision: 'contribution',
  newContribution: null,
}

export function useAlternativenFlow({
  workspace,
  portfolioState,
  baselineSimulation,
  scenarioId,
  requestedWhatIfId,
  onOpenSaved,
  rules = de2026Rules,
}: UseAlternativenFlowInput): AlternativenFlow {
  const [draft, setDraft] = useState<AlternativenDraft>(EMPTY_DRAFT)
  const [previewState, setPreviewState] = useState<PreviewState | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [locallySelectedId, setLocallySelectedId] = useState<string | null>(null)
  /** The undo handle already consumed, so "Rückgängig gemacht." can be shown. */
  const [undoneHandleId, setUndoneHandleId] = useState<string | null>(null)

  // The URL stays authoritative whenever the container reads one: a
  // back/forward that rewrites `?id=` wins over whatever the hook last
  // selected, and `openSaved` reaches the selection by pushing that query
  // string (`onOpenSaved`). Without a container-supplied id the hook keeps the
  // selection itself, which is what the hook tests exercise.
  const selectedSavedId =
    requestedWhatIfId !== undefined ? requestedWhatIfId : locallySelectedId

  // -------------------------------------------------------------------------
  // Contracts
  // -------------------------------------------------------------------------

  const contracts = useMemo<AlternativenContract[]>(() => {
    const wsa = workspace.baseline.assumptions
    return listWorkspaceInstances(wsa)
      .filter(({ instance }) => isCountedInstance(instance))
      .map(({ productId, instance }) => {
        const field = CONTRIBUTION_FIELD_BY_PRODUCT[productId]
        const label = instance.label?.trim()
        return {
          instanceId: instance.instanceId,
          label:
            label && label.length > 0
              ? label
              : (getProductMeta(productId)?.label ?? productId),
          productId,
          contributionMonthly: contributionOf(productId, instance),
          contributionStatus: resolveInputStatus(
            instance.inputStatus,
            instance.evidenceMap?.[field],
            field,
          ),
          contributionKind: CONTRIBUTION_KIND_BY_PRODUCT[productId],
          allowedDecisions: allowedDecisionsFor(workspace, productId, instance),
        }
      })
  }, [workspace])

  // -------------------------------------------------------------------------
  // Draft
  // -------------------------------------------------------------------------

  const invalidatePreview = useCallback(() => {
    setPreviewState(null)
    setPreviewError(null)
  }, [])

  const selectContract = useCallback(
    (instanceId: string | null) => {
      invalidatePreview()
      if (instanceId === null) {
        setDraft(EMPTY_DRAFT)
        return
      }
      const contract = contracts.find((c) => c.instanceId === instanceId)
      setDraft({
        instanceId,
        // Prefer the contribution change; a paid-up contract offers only
        // beitragsfrei, and picking an unavailable decision would dead-end the
        // preview button.
        decision: contract?.allowedDecisions.includes('contribution')
          ? 'contribution'
          : (contract?.allowedDecisions[0] ?? 'contribution'),
        newContribution: contract?.contributionStatus === 'unknown' ? null : contract?.contributionMonthly ?? null,
      })
    },
    [contracts, invalidatePreview],
  )

  const setDecision = useCallback(
    (decision: AlternativeDecision) => {
      invalidatePreview()
      setDraft((d) => ({ ...d, decision }))
    },
    [invalidatePreview],
  )

  const setContribution = useCallback(
    (monthly: number | null) => {
      invalidatePreview()
      setDraft((d) => ({ ...d, newContribution: monthly }))
    },
    [invalidatePreview],
  )

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  const baselineSummary = useMemo(
    () =>
      selectPlanSummary(workspace, baselineSimulation, scenarioId, {
        simulationError: baselineSimulation.error ?? undefined,
        rules,
      }),
    [workspace, baselineSimulation, scenarioId, rules],
  )

  const runPreview = useCallback(() => {
    setPreviewState(null)
    if (!draft.instanceId) {
      setPreviewError(ALTERNATIVEN_COPY.noContract)
      return
    }
    let change: WhatIfChange
    if (draft.decision === 'paid_up') {
      change = { kind: 'paid_up' }
    } else {
      if (draft.newContribution === null) {
        setPreviewError(ALTERNATIVEN_COPY.noContribution)
        return
      }
      change = { kind: 'contribution', monthly: draft.newContribution }
    }

    const whatIf = buildContributionWhatIf(workspace, draft.instanceId, change)
    if (!whatIf) {
      setPreviewError(ALTERNATIVEN_COPY.invalidChange)
      return
    }

    const after = summariseScenario(workspace, whatIf, scenarioId, rules)
    if (!after) {
      setPreviewError(ALTERNATIVEN_COPY.simulationFailed)
      return
    }

    const before = baselineSummary
    const rebased = withDeflator(after, before.deflator)
    const delta =
      before.readiness.canShowHouseholdTotal && rebased.readiness.canShowHouseholdTotal
        ? rebased.netMonthlyTotalReal - before.netMonthlyTotalReal
        : null

    setPreviewError(null)
    setPreviewState({
      basedOn: workspace.baseline,
      preview: { whatIf, before, after: rebased, delta, description: describeWhatIf(whatIf) },
    })
  }, [baselineSummary, draft, rules, scenarioId, workspace])

  // A baseline edit made after the preview was computed invalidates it — the
  // "Danach" on screen would otherwise be measured against a plan that moved.
  const preview =
    previewState !== null && previewState.basedOn === workspace.baseline
      ? previewState.preview
      : null

  // -------------------------------------------------------------------------
  // Saved alternatives
  // -------------------------------------------------------------------------

  const saved = useMemo<SavedAlternative[]>(() => {
    return workspace.whatIfs.map((whatIf) => {
      const frozen = frozenPairFor(whatIf, rules, scenarioId, () => {
        const before = summariseScenario(
          workspace,
          whatIf.derivedFromBaselineSnapshot,
          scenarioId,
          rules,
        )
        const afterRaw = summariseScenario(workspace, whatIf, scenarioId, rules)
        return {
          before,
          after:
            afterRaw && before ? withDeflator(afterRaw, before.deflator) : afterRaw,
        }
      })
      const status = whatIfStatus(whatIf, workspace)
      return {
        id: whatIf.id,
        label: whatIf.label,
        savedAt: whatIf.createdAt,
        status,
        description: describeWhatIf(whatIf),
        before: frozen.before,
        after: frozen.after,
        canApply: status === 'current',
        blockReason: blockReasonFor(status),
      }
    })
  }, [rules, scenarioId, workspace])

  const openWhatIfId = workspace.whatIfs.some((w) => w.id === selectedSavedId)
    ? selectedSavedId
    : null

  const openSaved = useCallback(
    (id: string | null) => {
      setLocallySelectedId(id)
      onOpenSaved?.(id)
    },
    [onOpenSaved],
  )

  const saveAlternative = useCallback(
    (label?: string): string | null => {
      if (!preview) {
        setPreviewError(ALTERNATIVEN_COPY.noPreview)
        return null
      }
      const trimmed = label?.trim()
      const whatIf: WhatIfScenario =
        trimmed && trimmed.length > 0 ? { ...preview.whatIf, label: trimmed } : preview.whatIf
      portfolioState.addWhatIf(whatIf)
      // "Stand beim Speichern" is a fixed point: freezing stamps `frozenAt` so
      // the saved comparison basis stays the snapshot it was computed on until
      // the user rebases.
      portfolioState.freezeWhatIf(whatIf.id)
      return whatIf.id
    },
    [portfolioState, preview],
  )

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const apply = useCallback(
    (id: string): AlternativenApplyResult => {
      const result = portfolioState.applyWhatIf(id)
      setUndoneHandleId(null)
      if (result.ok) return result
      return { ok: false, reason: result.reason, message: applyFailureMessage(result.reason) }
    },
    [portfolioState],
  )

  const rebase = useCallback(
    (id: string): AlternativenRebaseResult => {
      const result = portfolioState.tryRebaseWhatIf(id)
      setUndoneHandleId(null)
      if (result.ok) return result
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === 'shape-drift'
            ? ALTERNATIVEN_COPY.shapeDrift
            : ALTERNATIVEN_COPY.notFound,
      }
    },
    [portfolioState],
  )

  const remove = useCallback(
    (id: string): WorkspaceUndo => {
      setUndoneHandleId(null)
      if (selectedSavedId === id) openSaved(null)
      return portfolioState.removeWhatIf(id)
    },
    [openSaved, portfolioState, selectedSavedId],
  )

  const { lastUndo } = portfolioState
  const undo = useCallback(() => {
    if (!lastUndo) return
    setUndoneHandleId(lastUndo.id)
    portfolioState.undo(lastUndo)
  }, [lastUndo, portfolioState])

  // `portfolioState.undo` clears `lastUndo`, so the confirmation cannot be
  // derived from it — the consumed handle id carries it until the next
  // mutation supersedes the notification.
  const notification: AlternativenNotification | null = lastUndo
    ? { message: notificationMessage(lastUndo.label), canUndo: true }
    : undoneHandleId !== null
      ? { message: ALTERNATIVEN_COPY.undone, canUndo: false }
      : null

  return {
    contracts,
    draft,
    selectContract,
    setDecision,
    setContribution,
    preview,
    previewError,
    runPreview,
    invalidatePreview,
    saveAlternative,
    saved,
    openSaved,
    openWhatIfId,
    apply,
    rebase,
    remove,
    undo,
    notification,
  }
}
