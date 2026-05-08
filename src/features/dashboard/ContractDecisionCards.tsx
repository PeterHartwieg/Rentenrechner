/**
 * ContractDecisionCards - pure presentational card grid for contract decisions.
 *
 * Consumed by:
 *   - ContractDecisionMenu (per-instance "Optionen" panel, B5)
 *   - OptimiereVorsorgeModal (portfolio-level modal, B6)
 *
 * Extracted from ContractDecisionMenu.tsx (Group G issue B5).
 * React-only; no engine imports.
 */

import './ContractDecisionCards.css'
import type { ContractDecision } from '../../app/contractDecisions'
import { renderAtom } from '../../content/recommendationCopy'
import { DECISION_KIND_DESCRIPTIONS } from '../../content/optimiereCopy'
import { formatCurrency } from '../../utils/format'
import { qaTarget, useQaMode } from '../../features/qa-feedback'

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
// Kind labels (must match original ContractDecisionMenu.tsx exactly)
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<ContractDecision['kind'], string> = {
  weiterfuehren: 'Weiterführen',
  beitragsfrei: 'Beitragsfrei stellen',
  kuendigen: 'Kündigen',
  uebertragen: 'Übertragen',
  'beitrag-erhoehen': 'Beitrag erhöhen',
}

// ---------------------------------------------------------------------------
// Delta chip subcomponent
// ---------------------------------------------------------------------------

function DeltaChip({ value }: { value: number | 'pending' | 'error' }) {
  if (value === 'pending') {
    return (
      <span className="contract-decision-delta-chip contract-decision-delta-chip--pending">
        {'…'}
      </span>
    )
  }
  if (value === 'error') {
    return (
      <span className="contract-decision-delta-chip contract-decision-delta-chip--error">
        {'—'}
      </span>
    )
  }
  const isPositive = value >= 0
  // formatCurrency already includes the currency symbol (e.g. "-23 €").
  // Append "/Monat" for the monthly delta context.
  const base = `${formatCurrency(value, 0)}/Monat`
  const formatted = isPositive ? `+ ${base}` : base
  return (
    <span
      className={`contract-decision-delta-chip ${isPositive ? 'contract-decision-delta-chip--positive' : 'contract-decision-delta-chip--negative'}`}
    >
      {formatted}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContractDecisionCardsProps {
  decisions: ContractDecision[]
  checkedIds: Set<string>
  onToggle: (id: string) => void
  /**
   * Optional delta Netto-Rente / Monat per decision id; consumed by the
   * Optimiere modal in B6. Per-key value:
   *   number    - display chip e.g. "+ 23 EUR/Monat"
   *   'pending' - loading skeleton
   *   'error'   - short error indicator
   * Undefined / missing key - no chip (current ContractDecisionMenu behaviour).
   */
  deltaByDecisionId?: Record<string, number | 'pending' | 'error'>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContractDecisionCards({
  decisions,
  checkedIds,
  onToggle,
  deltaByDecisionId,
}: ContractDecisionCardsProps) {
  const { enabled: qaEnabled } = useQaMode()
  return (
    <div className="contract-decision-cards">
      {decisions.map((decision) => {
        const deltaValue =
          deltaByDecisionId !== undefined ? deltaByDecisionId[decision.id] : undefined

        return (
          <div
            key={decision.id}
            className={`contract-decision-card contract-decision-card--${decision.kind}`}
            data-kind={decision.kind}
            {...qaTarget(qaEnabled, `dashboard.contractDecision.card.${decision.kind}`, {
              label: KIND_LABELS[decision.kind],
            })}
          >
            <div className="contract-decision-card-header">
              <span className="contract-decision-kind">{KIND_LABELS[decision.kind]}</span>

              {/* Weiterfuehren has no checkbox - it is just the baseline reference. */}
              {decision.kind !== 'weiterfuehren' && (
                <label className="contract-decision-checkbox">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(decision.id)}
                    onChange={() => onToggle(decision.id)}
                    aria-label={`${KIND_LABELS[decision.kind]} auswählen`}
                  />
                  <span>Als Plan</span>
                </label>
              )}
            </div>

            <p className="contract-decision-description">
              {decision.description || DECISION_KIND_DESCRIPTIONS[decision.kind]}
            </p>

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

            {deltaValue !== undefined && <DeltaChip value={deltaValue} />}
          </div>
        )
      })}
    </div>
  )
}
