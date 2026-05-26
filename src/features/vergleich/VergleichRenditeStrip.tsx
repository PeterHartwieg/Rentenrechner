import type { ReturnScenario } from '../../domain'
import { formatPercent } from '../../utils/format'

interface Props {
  /** Scenario list from the active assumptions. */
  scenarios: ReadonlyArray<ReturnScenario>
  /** Currently selected scenario id (`'basis'` by default). */
  selectedId: string
  /** Callback when the user picks a scenario chip. */
  onSelect: (id: string) => void
}

/**
 * Sober D rendite-annahme chip strip for the Vergleich page (R1 rewrite).
 *
 * Terse rate-only display per `direction-d.jsx` `DirectionDVergleich`: each
 * chip shows the rate (e.g. "3 %"), the selected chip wraps its rate in
 * brackets ("[ 5 % ]"), monospace. No visible scenario labels (Konservativ /
 * Basis / Optimistisch), no inline meta line, no "RENDITE-ANNAHME:" prefix
 * — the design treats this as a numeric filter, not a labelled control.
 *
 * Button-group semantics (`role="group"` + `aria-pressed`), not tabs — this
 * is a single-select filter chip row. `aria-label` on each button preserves
 * accessible name (the scenario label) for screen readers, even though the
 * visible glyph is just the rate.
 */
export function VergleichRenditeStrip({
  scenarios,
  selectedId,
  onSelect,
}: Props) {
  if (scenarios.length === 0) return null
  return (
    <div className="vergleich-rendite-strip" role="group" aria-label="Rendite-Annahme wählen">
      {scenarios.map((scenario) => {
        const isActive = scenario.id === selectedId
        const rate = formatPercent(scenario.annualReturn, 0)
        return (
          <button
            key={scenario.id}
            type="button"
            aria-pressed={isActive}
            aria-label={`Rendite-Annahme: ${scenario.label} (${rate})`}
            className={`vergleich-rendite-chip${isActive ? ' vergleich-rendite-chip--active' : ''}`}
            onClick={() => onSelect(scenario.id)}
          >
            {isActive ? `[ ${rate} ]` : rate}
          </button>
        )
      })}
    </div>
  )
}
