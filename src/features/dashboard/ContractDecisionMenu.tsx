/**
 * ContractDecisionMenu — per-instance "Optionen für diesen Vertrag" panel.
 *
 * Group G issue 14, milestone M3.5.
 *
 * Opened from the InstanceCard "Optionen" button on active or paid-up instances
 * in the combine-mode dashboard sidebar. Surrendered instances are excluded —
 * those are terminal.
 *
 * Renders up to 4 decision cards side-by-side:
 *   - Weiterführen (always first — identity, no save action)
 *   - Beitragsfrei stellen
 *   - Kündigen (excluded for Basisrente)
 *   - Übertragen (one card per compatible target, capped at 2)
 *
 * Bottom: "Plan(s) erstellen" button — saves each checked decision as a
 * named what-if with `origin: 'recommender'`.
 *
 * Thin wrapper: owns modal shell + checkedIds state + save dispatch.
 * Card rendering delegated to <ContractDecisionCards> (B5).
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import './ContractDecisionMenu.css'
import type { Workspace, WhatIfScenario } from '../../domain/workspace'
import type { ContractDecision } from '../../app/contractDecisions'
import { generateContractDecisions, applyContractDecision } from '../../app/contractDecisions'
import { forkBaselineScenario, newScenarioId } from '../../app/portfolioState'
import { ContractDecisionCards } from './ContractDecisionCards'
import { useFeedbackTarget } from '../../features/qa-feedback'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  workspace: Workspace
  instanceId: string
  /** Called for each selected decision when the user clicks "Plan(s) erstellen". */
  onCreatePlans: (whatIfs: WhatIfScenario[]) => void
  /** Called to close the menu (user clicks × or outside). */
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContractDecisionMenu({
  workspace,
  instanceId,
  onCreatePlans,
  onClose,
}: Props) {
  const decisions = generateContractDecisions(workspace, instanceId)

  // Track which non-identity decisions are checked.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  // QA targets for modal container and actions.
  const { targetProps: dialogTargetProps } = useFeedbackTarget({
    id: 'dashboard.contractDecisionMenu.dialog',
    label: 'Optionen für diesen Vertrag',
    precision: 'section',
  })
  const { targetProps: saveBtnTargetProps } = useFeedbackTarget({
    id: 'dashboard.contractDecisionMenu.saveBtn',
    label: 'Plan erstellen',
  })

  // Ref for the inner dialog card — click-outside detection compares against it.
  const dialogRef = useRef<HTMLDivElement>(null)

  // Keyboard: Escape closes the menu (mirrors InventoryWizard pattern).
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    },
    [onClose],
  )

  // Click-outside: clicking the backdrop overlay closes the menu.
  // The overlay is the outermost element; the inner dialog card is `dialogRef`.
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    },
    [onClose],
  )

  // Ensure focus stays within the dialog while it is open (basic focus trap via tabIndex on wrapper).
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCreatePlans() {
    const selected = decisions.filter(
      (d: ContractDecision) => d.kind !== 'weiterfuehren' && checkedIds.has(d.id),
    )
    if (selected.length === 0) return

    const whatIfs: WhatIfScenario[] = selected.map((decision: ContractDecision) => {
      const fork = forkBaselineScenario(
        workspace.baseline,
        decision.label,
        'recommender',
      )
      const applied = applyContractDecision(workspace, decision)
      return {
        ...fork,
        id: newScenarioId('whatif'),
        assumptions: applied.baseline.assumptions,
      }
    })

    onCreatePlans(whatIfs)
    onClose()
  }

  const saveable = decisions.filter(
    (d: ContractDecision) => d.kind !== 'weiterfuehren' && checkedIds.has(d.id),
  )

  return (
    <div
      className="contract-decision-menu-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
    <div
      className="contract-decision-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Optionen für diesen Vertrag"
      ref={dialogRef}
      tabIndex={-1}
      {...dialogTargetProps}
    >
      <div className="contract-decision-menu-header">
        <h3>Optionen für diesen Vertrag</h3>
        <button
          type="button"
          className="contract-decision-menu-close"
          onClick={onClose}
          aria-label="Schließen"
        >
          ×
        </button>
      </div>

      <ContractDecisionCards
        decisions={decisions}
        checkedIds={checkedIds}
        onToggle={toggleChecked}
      />

      <div className="contract-decision-footer">
        <button
          type="button"
          className="contract-decision-save-btn"
          disabled={saveable.length === 0}
          onClick={handleCreatePlans}
          {...saveBtnTargetProps}
        >
          {saveable.length === 0
            ? 'Plan erstellen'
            : saveable.length === 1
            ? '1 Plan erstellen'
            : `${saveable.length} Pläne erstellen`}
        </button>
        <button type="button" className="contract-decision-cancel-btn" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
    </div>
  )
}
