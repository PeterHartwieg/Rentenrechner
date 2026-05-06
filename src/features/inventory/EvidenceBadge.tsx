/**
 * EvidenceBadge — per-field confidence indicator for inventory cards.
 *
 * Renders a coloured badge showing the evidence state of a single field:
 *   - yellow "🤔 Schätzung" for model_estimate (with "Übernehmen" confirm button)
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
import { useFeedbackTarget } from '../qa-feedback'

interface EvidenceBadgeProps {
  state: EvidenceState
  onConfirm?: () => void
  /** Optional id suffix so each per-field badge can be uniquely targeted (e.g. `bav.0.contribution`). */
  feedbackTargetSuffix?: string
}

export function EvidenceBadge({ state, onConfirm, feedbackTargetSuffix }: EvidenceBadgeProps) {
  const idSuffix = feedbackTargetSuffix ? `.${feedbackTargetSuffix}` : ''
  const { targetProps: badgeProps } = useFeedbackTarget({
    id: `inventory.evidenceBadge.${state}${idSuffix}`,
    label: `Evidence-Badge ${state}`,
  })
  const { targetProps: confirmProps } = useFeedbackTarget({
    id: `inventory.evidenceBadge.confirm${idSuffix}`,
    label: 'Evidence-Badge Übernehmen-Button',
  })
  if (state === 'model_estimate') {
    return (
      <span className="evidence-badge evidence-badge--estimate" {...badgeProps}>
        {'🤔'} Schätzung
        {onConfirm && (
          <button
            type="button"
            className="evidence-badge-confirm-btn"
            onClick={onConfirm}
            title="Schätzwert übernehmen"
            {...confirmProps}
          >
            Übernehmen
          </button>
        )}
      </span>
    )
  }

  if (state === 'statement') {
    return (
      <span className="evidence-badge evidence-badge--statement" {...badgeProps}>
        {'📄'} lt. Beleg
      </span>
    )
  }

  return (
    <span className="evidence-badge evidence-badge--confirmed" {...badgeProps}>
      ✓ bestätigt
    </span>
  )
}
