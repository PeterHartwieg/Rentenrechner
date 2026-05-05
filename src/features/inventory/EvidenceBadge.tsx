/**
 * EvidenceBadge — per-field confidence indicator for inventory cards.
 *
 * Renders a coloured badge showing the evidence state of a single field:
 *   - yellow "🤔 Schätzung" for model_estimate (with "Uebernehmen" confirm button)
 *   - green "✓ bestätigt" for user_confirmed
 *   - blue "📄 lt. Beleg" for statement
 *
 * The "🤔" emoji is spec-mandated UX copy (issue 09 acceptance criterion).
 *
 * Stable CSS selectors:
 *   .evidence-badge
 *   .evidence-badge--estimate
 *   .evidence-badge--confirmed
 *   .evidence-badge--statement
 */

import type { EvidenceState } from '../../domain/instances'

interface EvidenceBadgeProps {
  state: EvidenceState
  onConfirm?: () => void
}

export function EvidenceBadge({ state, onConfirm }: EvidenceBadgeProps) {
  if (state === 'model_estimate') {
    return (
      <span className="evidence-badge evidence-badge--estimate">
        {'🤔'} Schätzung
        {onConfirm && (
          <button
            type="button"
            className="evidence-badge-confirm-btn"
            onClick={onConfirm}
            title="Schaetzwert uebernehmen"
          >
            Uebernehmen
          </button>
        )}
      </span>
    )
  }

  if (state === 'statement') {
    return (
      <span className="evidence-badge evidence-badge--statement">
        {'📄'} lt. Beleg
      </span>
    )
  }

  return (
    <span className="evidence-badge evidence-badge--confirmed">
      ✓ bestätigt
    </span>
  )
}
