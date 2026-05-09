/**
 * OptimiereVorsorgeModal — portfolio-level "Optimiere deine Vorsorge" modal.
 *
 * Group G issue B6: full step machine + entry trigger.
 *
 * Step state machine (component-local, never persisted):
 *   disclaimer -> overview -> instance -> confirm -> saved
 *
 * Cancel from any step calls `onClose` without state mutation.
 * Re-mounting the component always lands on `disclaimer` (invariant: the
 * acknowledge state is modal-scoped, never persisted).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FocusTrap } from '../../ui/FocusTrap'
import { X } from 'lucide-react'
import type { Workspace, WhatIfScenario } from '../../domain/workspace'
import { useFeedbackTarget, qaTarget, useQaMode } from '../../features/qa-feedback'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { GermanRules } from '../../domain/rules'
import type { ContractDecision } from '../../app/contractDecisions'
import {
  auditPortfolio,
  createDecisionSimulationCache,
  type DecisionDelta,
  type InstanceAudit,
} from '../../app/optimiereVorsorge'
import {
  beitragErhoehenWhatIf,
  applyContractDecision,
} from '../../app/contractDecisions'
import { forkBaselineScenario, newScenarioId } from '../../app/portfolioState'
import { getProductMeta } from '../../engine/productRegistry'
import { evidenceStateToProvKind } from '../results/provenanceHelpers'
import { ContractDecisionCards } from './ContractDecisionCards'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency } from '../../utils/format'
import {
  OPTIMIERE_DISCLAIMER_HEADING,
  OPTIMIERE_DISCLAIMER_PARAGRAPHS,
  OPTIMIERE_BUTTON_ACCEPT,
  OPTIMIERE_BUTTON_CANCEL,
  OPTIMIERE_BANNER,
  OPTIMIERE_OVERVIEW_HEADING,
  OPTIMIERE_OVERVIEW_INTRO,
  OPTIMIERE_CONFIRM_HEADING,
  OPTIMIERE_CONFIRM_SAVE,
  OPTIMIERE_CONFIRM_BACK,
  OPTIMIERE_SAVED_HEADING,
  OPTIMIERE_SAVED_CLOSE,
  AUDIT_FLAG_LABELS,
  defaultScenarioName,
  type ScenarioNameContext,
} from '../../content/optimiereCopy'
import './OptimiereVorsorgeModal.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'disclaimer' | 'overview' | 'instance' | 'confirm' | 'saved'

interface Props {
  workspace: Workspace
  baselineCombined: CombinedResult
  rules: GermanRules
  onClose: () => void
  onCreatePlans: (whatIfs: WhatIfScenario[]) => void
}

interface TickedDecision {
  instanceId: string
  decisionId: string
  decision: ContractDecision
  scenarioName: string
}

// ---------------------------------------------------------------------------
// Helper: detect productId from instanceId prefix
// ---------------------------------------------------------------------------

function productIdFromInstanceId(instanceId: string): string {
  if (instanceId.startsWith('bav-')) return 'bav'
  if (instanceId.startsWith('etf-')) return 'etf'
  if (instanceId.startsWith('versicherung-')) return 'versicherung'
  if (instanceId.startsWith('basisrente-')) return 'basisrente'
  if (instanceId.startsWith('altersvorsorgedepot-')) return 'altersvorsorgedepot'
  if (instanceId.startsWith('riester-')) return 'riester'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OptimiereVorsorgeModal({
  workspace,
  baselineCombined,
  rules,
  onClose,
  onCreatePlans,
}: Props) {
  const [step, setStep] = useState<Step>('disclaimer')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [ticked, setTicked] = useState<Map<string, TickedDecision>>(new Map())
  const [savedNames, setSavedNames] = useState<string[]>([])

  const { enabled: qaEnabled } = useQaMode()
  const { targetProps: modalTargetProps } = useFeedbackTarget({
    id: 'dashboard.optimiereModal.dialog',
    label: 'Optimiere deine Vorsorge',
    precision: 'section',
  })
  const { targetProps: stepHeadingTargetProps } = useFeedbackTarget({
    id: `dashboard.optimiereModal.step.${step}.heading`,
    label: `Schritt: ${step}`,
  })
  const { targetProps: primaryCtaTargetProps } = useFeedbackTarget({
    id: `dashboard.optimiereModal.step.${step}.primaryCta`,
    label: 'Primäre Aktion',
  })

  // Beitrag-erhoehen overrides per instance (user-typed values).
  const [beitragOverrides, setBeitragOverrides] = useState<Map<string, number>>(new Map())

  // Confirm step: editable scenario names keyed by decision id.
  const [editedNames, setEditedNames] = useState<Map<string, string>>(new Map())

  // Simulation cache — modal-scoped, reset on unmount. Held in state so React
  // lifecycle handles cleanup; the initialiser runs once (never re-created).
  const [cache] = useState(() => createDecisionSimulationCache())
  useEffect(() => {
    return () => { cache.invalidate() }
  }, [cache])

  // Audit rows (memoised by workspace identity)
  const auditRows = useMemo(
    () => auditPortfolio(workspace, rules),
    [workspace, rules],
  )

  // ---------------------------------------------------------------------------
  // Instance step: decisions + delta computation
  // ---------------------------------------------------------------------------

  const selectedAudit = useMemo(
    () => auditRows.find((row) => row.instance.instanceId === selectedInstanceId) ?? null,
    [auditRows, selectedInstanceId],
  )

  // Regenerate beitrag-erhoehen decision if user overrode the EUR value.
  const instanceDecisions = useMemo((): ContractDecision[] => {
    if (!selectedAudit) return []
    const override = selectedInstanceId ? beitragOverrides.get(selectedInstanceId) : undefined
    if (override === undefined) return selectedAudit.decisions

    // Replace the existing beitrag-erhoehen decision with one using the override value.
    const newDecision = beitragErhoehenWhatIf(workspace, selectedInstanceId!, override)
    if (!newDecision) return selectedAudit.decisions
    return selectedAudit.decisions.map((d) =>
      d.kind === 'beitrag-erhoehen' ? newDecision : d,
    )
  }, [selectedAudit, selectedInstanceId, beitragOverrides, workspace])

  // Compute deltas lazily for visible decisions.
  const deltaByDecisionId = useMemo((): Record<string, number | 'pending' | 'error'> => {
    const result: Record<string, number | 'pending' | 'error'> = {}
    for (const decision of instanceDecisions) {
      if (decision.kind === 'weiterfuehren') {
        result[decision.id] = 0
        continue
      }
      try {
        const delta: DecisionDelta = cache.get(
          workspace, decision, rules, baselineCombined,
        )
        result[decision.id] = delta.deltaMonthlyNetEUR
      } catch {
        result[decision.id] = 'error'
      }
    }
    return result
  }, [instanceDecisions, workspace, rules, baselineCombined, cache])

  // Checked decisions for ContractDecisionCards (this instance only).
  const instanceCheckedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [key] of ticked) {
      if (key.startsWith(`${selectedInstanceId}:::`)) {
        const decisionId = key.slice((`${selectedInstanceId}:::`).length)
        ids.add(decisionId)
      }
    }
    return ids
  }, [ticked, selectedInstanceId])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleToggleDecision(decisionId: string) {
    if (!selectedInstanceId) return
    const key = `${selectedInstanceId}:::${decisionId}`
    setTicked((prev) => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        const decision = instanceDecisions.find((d) => d.id === decisionId)
        if (!decision || decision.kind === 'weiterfuehren') return prev
        const contractLabel = selectedAudit?.instance.label ?? 'Vertrag'
        const scenarioName = defaultScenarioName(decision, buildNameContext(decision, contractLabel))
        next.set(key, {
          instanceId: selectedInstanceId,
          decisionId,
          decision,
          scenarioName,
        })
      }
      return next
    })
  }

  function buildNameContext(decision: ContractDecision, contractLabel: string): ScenarioNameContext {
    const ctx: ScenarioNameContext = { contractLabel }
    if (decision.workspaceDelta.kind === 'increase_contribution') {
      ctx.neuerEUR = decision.workspaceDelta.newMonthlyEUR
    }
    if (decision.workspaceDelta.kind === 'paid_up') {
      ctx.age = decision.workspaceDelta.paidUpAtAge
    }
    if (decision.workspaceDelta.kind === 'transfer' && decision.targetInstanceId) {
      const targetInst = findInstanceLabel(decision.targetInstanceId)
      ctx.targetLabel = targetInst
    }
    if (decision.workspaceDelta.kind === 'transfer_to_new') {
      const meta = getProductMeta(decision.workspaceDelta.targetProductId)
      ctx.productLabel = meta?.label ?? decision.workspaceDelta.targetProductId
    }
    if (decision.workspaceDelta.kind === 'surrender' && decision.workspaceDelta.reallocateToInstanceId) {
      ctx.targetLabel = findInstanceLabel(decision.workspaceDelta.reallocateToInstanceId)
    }
    return ctx
  }

  function findInstanceLabel(instanceId: string): string {
    const wsa = workspace.baseline.assumptions
    const all = [...wsa.bav, ...wsa.etf, ...wsa.insurance, ...wsa.basisrente, ...wsa.altersvorsorgedepot, ...wsa.riester]
    const inst = all.find((i) => i.instanceId === instanceId)
    return inst?.label ?? instanceId
  }

  function handleBeitragChange(newEUR: number) {
    if (!selectedInstanceId) return
    setBeitragOverrides((prev) => {
      const next = new Map(prev)
      next.set(selectedInstanceId, newEUR)
      return next
    })
    // Remove any previously ticked beitrag-erhoehen for this instance since the amount changed.
    setTicked((prev) => {
      const next = new Map(prev)
      for (const [key, entry] of next) {
        if (entry.instanceId === selectedInstanceId && entry.decision.kind === 'beitrag-erhoehen') {
          next.delete(key)
        }
      }
      return next
    })
  }

  const handleSave = useCallback(() => {
    const whatIfs: WhatIfScenario[] = []
    const names: string[] = []

    for (const [, entry] of ticked) {
      const name = editedNames.get(entry.decisionId) ?? entry.scenarioName
      const fork = forkBaselineScenario(workspace.baseline, name, 'recommender')
      const applied = applyContractDecision(workspace, entry.decision)
      const whatIf: WhatIfScenario = {
        ...fork,
        id: newScenarioId('whatif'),
        assumptions: applied.baseline.assumptions,
      }
      whatIfs.push(whatIf)
      names.push(name)
    }

    onCreatePlans(whatIfs)
    setSavedNames(names)
    setStep('saved')
  }, [ticked, editedNames, workspace, onCreatePlans])

  const hasAnyTicks = ticked.size > 0

  // Step counter: 4 post-disclaimer steps (overview=1, instance=2, confirm=3, saved=4).
  const STEP_NUMBERS: Partial<Record<Step, number>> = {
    overview: 1,
    instance: 2,
    confirm: 3,
    saved: 4,
  }
  const stepNumber = STEP_NUMBERS[step]
  const stepCounterText = stepNumber !== undefined ? `Schritt ${stepNumber} von 4` : null

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <FocusTrap onEscape={onClose}>
    <div className="optimiere-modal-backdrop" role="presentation">
      <section
        className="optimiere-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="optimiere-modal-title"
        {...modalTargetProps}
      >
        <header className="optimiere-modal__header">
          <h2 id="optimiere-modal-title">Optimiere deine Vorsorge</h2>
          {stepCounterText !== null && (
            <span className="optimiere-modal__step-counter" aria-label={stepCounterText}>
              {stepCounterText}
            </span>
          )}
          <button
            type="button"
            className="optimiere-modal__close"
            onClick={onClose}
            aria-label="Dialog schließen"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {/* ── Disclaimer step ── */}
        {step === 'disclaimer' && (
          <div className="optimiere-modal__body">
            <h3 {...stepHeadingTargetProps}>{OPTIMIERE_DISCLAIMER_HEADING}</h3>
            {OPTIMIERE_DISCLAIMER_PARAGRAPHS.map((para, idx) => (
              <p key={idx} className="optimiere-modal__disclaimer-para">
                {renderMarkdownBold(para)}
              </p>
            ))}
            <div className="optimiere-modal__actions">
              <button
                type="button"
                className="optimiere-modal__secondary"
                onClick={onClose}
              >
                {OPTIMIERE_BUTTON_CANCEL}
              </button>
              <button
                type="button"
                className="optimiere-modal__primary"
                onClick={() => setStep('overview')}
                {...primaryCtaTargetProps}
              >
                {OPTIMIERE_BUTTON_ACCEPT}
              </button>
            </div>
          </div>
        )}

        {/* ── Overview step ── */}
        {step === 'overview' && (
          <div className="optimiere-modal__body">
            <div className="optimiere-modal__banner" role="status">
              {OPTIMIERE_BANNER}
            </div>
            <h3 {...stepHeadingTargetProps}>{OPTIMIERE_OVERVIEW_HEADING}</h3>
            <p className="optimiere-modal__overview-intro">{OPTIMIERE_OVERVIEW_INTRO}</p>
            <div className="optimiere-modal__overview-list">
              {auditRows.map((row) => {
                const productId = productIdFromInstanceId(row.instance.instanceId)
                const meta = getProductMeta(productId)
                // Derive overall evidence state from the instance's evidenceMap.
                // If any field is 'model_estimate', surface that; otherwise 'confirmed'.
                const evidenceMap = row.instance.evidenceMap ?? {}
                const evidenceValues = Object.values(evidenceMap)
                const hasModelEstimate = evidenceValues.some((v) => v === 'model_estimate')
                const overallEvidence = hasModelEstimate ? 'model_estimate' as const : (evidenceValues.length > 0 ? 'user_confirmed' as const : undefined)
                const provKind = overallEvidence ? evidenceStateToProvKind(overallEvidence) : undefined

                return (
                  <div
                    key={row.instance.instanceId}
                    className="optimiere-modal__overview-row"
                    {...qaTarget(qaEnabled, `dashboard.optimiereModal.overview.row.${row.instance.instanceId}`, {
                      label: row.instance.label,
                    })}
                  >
                    <div className="optimiere-modal__overview-info">
                      <span className="optimiere-modal__contract-label">
                        {row.instance.label}
                      </span>
                      {meta && (
                        <span
                          className="optimiere-modal__product-chip"
                          style={{ borderColor: meta.color, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      )}
                      {getMonthlyContribution(row) > 0 && (
                        <span className="optimiere-modal__contribution">
                          {formatCurrency(getMonthlyContribution(row), 0)}/Monat
                        </span>
                      )}
                      {provKind && (
                        <span className={`optimiere-modal__prov-chip optimiere-modal__prov-chip--${provKind}`}>
                          {provKind === 'confirmed' ? 'Bestätigt' : provKind === 'model' ? 'Schätzwert' : provKind}
                        </span>
                      )}
                    </div>
                    <div className="optimiere-modal__overview-flags">
                      {row.flags.map((flag, idx) => (
                        <span
                          key={`${flag.id}-${idx}`}
                          className={`optimiere-modal__flag-chip optimiere-modal__flag-chip--${flag.priority}`}
                        >
                          {AUDIT_FLAG_LABELS[flag.id] ?? flag.id}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="optimiere-modal__anpassen-btn"
                      onClick={() => {
                        setSelectedInstanceId(row.instance.instanceId)
                        setStep('instance')
                      }}
                    >
                      Anpassen
                      {row.decisions.length > 0 && (
                        <span className="optimiere-modal__option-count">
                          {row.decisions.length} {row.decisions.length === 1 ? 'Option' : 'Optionen'}
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}
              {auditRows.length === 0 && (
                <p className="optimiere-modal__empty">Keine aktiven Verträge gefunden.</p>
              )}
            </div>
            <div className="optimiere-modal__actions">
              <button
                type="button"
                className="optimiere-modal__secondary"
                onClick={onClose}
              >
                {OPTIMIERE_BUTTON_CANCEL}
              </button>
              {hasAnyTicks && (
                <button
                  type="button"
                  className="optimiere-modal__primary"
                  onClick={() => {
                    // Seed editedNames from current ticked entries.
                    setEditedNames(new Map(
                      Array.from(ticked.values()).map((t) => [t.decisionId, t.scenarioName]),
                    ))
                    setStep('confirm')
                  }}
                  {...primaryCtaTargetProps}
                >
                  Weiter ({ticked.size})
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Instance step ── */}
        {step === 'instance' && selectedAudit && (
          <div className="optimiere-modal__body">
            <div className="optimiere-modal__banner" role="status">
              {OPTIMIERE_BANNER}
            </div>
            <h3 className="optimiere-modal__instance-heading" {...stepHeadingTargetProps}>
              {selectedAudit.instance.label}
            </h3>

            {/* Beitrag erhoehen NumberField if applicable */}
            {instanceDecisions.some((d) => d.kind === 'beitrag-erhoehen') && (
              <div className="optimiere-modal__beitrag-input">
                <NumberField
                  label="Neuer Beitrag"
                  value={
                    beitragOverrides.get(selectedInstanceId!) ??
                    getBeitragErhoehenDefault(instanceDecisions)
                  }
                  min={0}
                  max={50_000}
                  step={10}
                  decimals={0}
                  suffix="€/Mon."
                  onCommit={(raw) => {
                    const parsed = Math.max(0, Number(raw) || 0)
                    handleBeitragChange(parsed)
                  }}
                />
              </div>
            )}

            <ContractDecisionCards
              decisions={instanceDecisions}
              checkedIds={instanceCheckedIds}
              onToggle={handleToggleDecision}
              deltaByDecisionId={deltaByDecisionId}
            />

            <div className="optimiere-modal__actions">
              <button
                type="button"
                className="optimiere-modal__secondary"
                onClick={() => setStep('overview')}
              >
                Zurück
              </button>
              <button
                type="button"
                className="optimiere-modal__primary"
                disabled={!hasAnyTicks}
                onClick={() => {
                  setEditedNames(new Map(
                    Array.from(ticked.values()).map((t) => [t.decisionId, t.scenarioName]),
                  ))
                  setStep('confirm')
                }}
                {...primaryCtaTargetProps}
              >
                Weiter
              </button>
            </div>
          </div>
        )}

        {/* ── Confirm step ── */}
        {step === 'confirm' && (
          <div className="optimiere-modal__body">
            <div className="optimiere-modal__banner" role="status">
              {OPTIMIERE_BANNER}
            </div>
            <h3 {...stepHeadingTargetProps}>{OPTIMIERE_CONFIRM_HEADING}</h3>
            <ul className="optimiere-modal__confirm-list">
              {Array.from(ticked.values()).map((entry) => (
                <li key={entry.decisionId} className="optimiere-modal__confirm-row">
                  <input
                    type="text"
                    className="optimiere-modal__name-input"
                    value={editedNames.get(entry.decisionId) ?? entry.scenarioName}
                    onChange={(e) => {
                      setEditedNames((prev) => {
                        const next = new Map(prev)
                        next.set(entry.decisionId, e.target.value)
                        return next
                      })
                    }}
                    aria-label={`Name für ${entry.scenarioName}`}
                  />
                </li>
              ))}
            </ul>
            <div className="optimiere-modal__actions">
              <button
                type="button"
                className="optimiere-modal__secondary"
                onClick={() => setStep('overview')}
              >
                {OPTIMIERE_CONFIRM_BACK}
              </button>
              <button
                type="button"
                className="optimiere-modal__primary"
                onClick={handleSave}
                {...primaryCtaTargetProps}
              >
                {OPTIMIERE_CONFIRM_SAVE}
              </button>
            </div>
          </div>
        )}

        {/* ── Saved step ── */}
        {step === 'saved' && (
          <div className="optimiere-modal__body" role="status" aria-live="polite">
            <div className="optimiere-modal__banner" role="status">
              {OPTIMIERE_BANNER}
            </div>
            <h3 {...stepHeadingTargetProps}>{OPTIMIERE_SAVED_HEADING}</h3>
            <ul className="optimiere-modal__saved-list">
              {savedNames.map((name, idx) => (
                <li key={idx}>{name}</li>
              ))}
            </ul>
            <p className="optimiere-modal__note">
              Die Basisplanung bleibt unverändert. Die Szenarien findest du unter Meine Verträge.
            </p>
            <div className="optimiere-modal__actions">
              <button
                type="button"
                className="optimiere-modal__primary"
                onClick={onClose}
                {...primaryCtaTargetProps}
              >
                {OPTIMIERE_SAVED_CLOSE}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
    </FocusTrap>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMonthlyContribution(row: InstanceAudit): number {
  const inst = row.instance as unknown as Record<string, unknown>
  if (typeof inst.monthlyGrossConversion === 'number') return inst.monthlyGrossConversion
  if (typeof inst.monthlyGrossContribution === 'number') return inst.monthlyGrossContribution
  if (typeof inst.monthlyOwnContribution === 'number') return inst.monthlyOwnContribution
  if (typeof inst.monthlyContribution === 'number') return inst.monthlyContribution
  return 0
}

function getBeitragErhoehenDefault(decisions: ContractDecision[]): number {
  const d = decisions.find((dec) => dec.kind === 'beitrag-erhoehen')
  if (!d) return 0
  if (d.workspaceDelta.kind === 'increase_contribution') return d.workspaceDelta.newMonthlyEUR
  return 0
}

/**
 * Very basic markdown bold rendering: replaces **text** with <strong> elements.
 */
function renderMarkdownBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}
