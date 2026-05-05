import { useQaMode } from './useQaMode'

/**
 * Persistent "QA-Modus aktiv" chip (PRD US-3).
 *
 * Sits in a fixed corner whenever QA mode is on so testers cannot mistake
 * the QA build for the normal calculator. Renders nothing when QA mode is
 * disabled — preserving the inert-when-disabled guarantee.
 *
 * Lane C (issue 06) changes:
 *   - The entire chip is now a `<button type="button">` so it is Tab-reachable
 *     and activatable via keyboard. Clicking it deactivates QA mode.
 *   - `aria-label` is explicit German text describing the current state and
 *     the action a keyboard user would take.
 *   - The embedded "Beenden" text is kept as visible copy; the button's
 *     aria-label overrides it for screen readers so they get the full sentence.
 *
 * The German user-facing copy matches the calculator's overall language
 * (DECISIONS / PRD note: "UI copy for QA mode should be German").
 */
export function QaModeIndicator() {
  const { enabled, deactivate } = useQaMode()
  if (!enabled) return null

  return (
    <button
      type="button"
      className="qa-indicator"
      role="status"
      aria-live="polite"
      aria-label="QA-Modus aktiv. Klicken zum Deaktivieren oder Beenden."
      data-testid="qa-indicator"
      onClick={deactivate}
    >
      <span className="qa-indicator__dot" aria-hidden="true" />
      <span aria-hidden="true">QA-Modus aktiv</span>
      <span className="qa-indicator__deactivate" aria-hidden="true">
        Beenden
      </span>
    </button>
  )
}
