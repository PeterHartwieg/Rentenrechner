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
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import './ContractDecisionMenu.css'
import type { Workspace, WhatIfScenario } from '../../domain/workspace'
import type { ContractDecision } from '../../app/contractDecisions'
import { generateContractDecisions, applyContractDecision } from '../../app/contractDecisions'
import { forkBaselineScenario, newScenarioId } from '../../app/portfolioState'
import { renderAtom } from '../../content/recommendationCopy'

// ---------------------------------------------------------------------------
// Chip variant mapping
// ---------------------------------------------------------------------------

const PRIVILEGE_IDS = new Set([
  'pre_2005_pav_taxfree_capital',
  'halbeinkuenfte_pav_eligible',
  'bav_40b_alt_eligible',
  'riester_to_avd_certified',
])

const CAVEAT_IDS = new Set([
  'lose_pre_2005_privilege',
  'paid_up_high_fee_warning',
  'bav_40b_alt_conditions_unmet',
  'pre_2005_pav_high_garantiezins',
  'bav_durchfuehrungsweg_direktzusage',
])

function chipVariant(atomId: string): 'privilege' | 'caveat' | 'info' {
  if (PRIVILEGE_IDS.has(atomId)) return 'privilege'
  if (CAVEAT_IDS.has(atomId)) return 'caveat'
  return 'info'
}

// ---------------------------------------------------------------------------
// Kind labels
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<ContractDecision['kind'], string> = {
  weiterfuehren: 'Weiterführen',
  beitragsfrei: 'Beitragsfrei stellen',
  kuendigen: 'Kündigen',
  uebertragen: 'Übertragen',
  'beitrag-erhoehen': 'Beitrag erhöhen',
}

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
      (d) => d.kind !== 'weiterfuehren' && checkedIds.has(d.id),
    )
    if (selected.length === 0) return

    const whatIfs: WhatIfScenario[] = selected.map((decision) => {
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
    (d) => d.kind !== 'weiterfuehren' && checkedIds.has(d.id),
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

      <div className="contract-decision-cards">
        {decisions.map((decision) => (
          <div
            key={decision.id}
            className={`contract-decision-card contract-decision-card--${decision.kind}`}
            data-kind={decision.kind}
          >
            <div className="contract-decision-card-header">
              <span className="contract-decision-kind">{KIND_LABELS[decision.kind]}</span>

              {/* Weiterfuehren has no checkbox — it is just the baseline reference. */}
              {decision.kind !== 'weiterfuehren' && (
                <label className="contract-decision-checkbox">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(decision.id)}
                    onChange={() => toggleChecked(decision.id)}
                    aria-label={`${KIND_LABELS[decision.kind]} auswählen`}
                  />
                  <span>Als Plan</span>
                </label>
              )}
            </div>

            <p className="contract-decision-description">{decision.description}</p>

            {decision.atoms.length > 0 && (
              <ul className="contract-decision-atoms">
                {decision.atoms.map((atom, idx) => {
                  const tpl = renderAtom(atom)
                  if (!tpl.headline) return null
                  const variant = chipVariant(atom.id)
                  return (
                    <li
                      key={`${atom.id}-${idx}`}
                      className={`contract-decision-atom contract-decision-atom--${variant}`}
                      title={tpl.body}
                    >
                      {tpl.headline}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="contract-decision-footer">
        <button
          type="button"
          className="contract-decision-save-btn"
          disabled={saveable.length === 0}
          onClick={handleCreatePlans}
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
