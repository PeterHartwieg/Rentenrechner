import { useQaMode } from './useQaMode'

/**
 * Persistent "QA-Modus aktiv" chip (PRD US-3).
 *
 * Sits in a fixed corner whenever QA mode is on so testers cannot mistake
 * the QA build for the normal calculator. Renders nothing when QA mode is
 * disabled — preserving the inert-when-disabled guarantee.
 *
 * The German user-facing copy matches the calculator's overall language
 * (DECISIONS / PRD note: "UI copy for QA mode should be German").
 */
export function QaModeIndicator() {
  const { enabled, deactivate } = useQaMode()
  if (!enabled) return null

  return (
    <div className="qa-indicator" role="status" aria-live="polite" data-testid="qa-indicator">
      <span className="qa-indicator__dot" aria-hidden="true" />
      <span>QA-Modus aktiv</span>
      <button
        type="button"
        className="qa-indicator__deactivate"
        onClick={deactivate}
        aria-label="QA-Modus beenden"
        title="QA-Modus beenden"
      >
        Beenden
      </button>
    </div>
  )
}
