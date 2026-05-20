import type { ReturnScenario } from '../../domain'
import { formatCurrency, formatPercent } from '../../utils/format'

interface Props {
  /** Scenario list from the active assumptions. */
  scenarios: ReadonlyArray<ReturnScenario>
  /** Currently selected scenario id (`'basis'` by default). */
  selectedId: string
  /** Callback when the user picks a scenario chip. */
  onSelect: (id: string) => void
  /** Monthly net cash committed per scenario, in EUR. */
  monthlyContribution: number
  /** Number of full years between the user's current age and the retirement age. */
  runtimeYears: number
}

/**
 * Sober D rendite-annahme strip for the Vergleich page (PR 9).
 *
 * Replaces the legacy `ScenarioToolbar` segmented control for the Vergleich
 * surface. The control is intentionally tightened to one row: scenario chips
 * + a short metadata line for Beitrag / Laufzeit. Monte-Carlo configuration
 * has moved to the `/methode` page's Renditeannahmen section (PR 9 plan §4).
 *
 * Button-group semantics (`role="group"` + `aria-pressed`), not tabs — this
 * is a single-select filter chip row, not a tabbed content switcher. The
 * pattern mirrors `KapitalFilterChips`.
 */
export function VergleichRenditeStrip({
  scenarios,
  selectedId,
  onSelect,
  monthlyContribution,
  runtimeYears,
}: Props) {
  if (scenarios.length === 0) return null
  return (
    <div className="vergleich-rendite-strip">
      <div className="vergleich-rendite-strip__row" role="group" aria-label="Rendite-Annahme wählen">
        <span className="vergleich-rendite-strip__label" aria-hidden="true">RENDITE:</span>
        {scenarios.map((scenario) => {
          const isActive = scenario.id === selectedId
          return (
            <button
              key={scenario.id}
              type="button"
              aria-pressed={isActive}
              className={`vergleich-rendite-chip${isActive ? ' vergleich-rendite-chip--active' : ''}`}
              onClick={() => onSelect(scenario.id)}
            >
              {scenario.label}
              <span className="vergleich-rendite-chip__rate">{formatPercent(scenario.annualReturn, 1)}</span>
            </button>
          )
        })}
      </div>
      <div className="vergleich-rendite-strip__meta">
        BEITRAG: <strong>{formatEuroPerMonth(monthlyContribution)}</strong>
        {' · '}
        LAUFZEIT: <strong>{runtimeYears} J.</strong>
      </div>
    </div>
  )
}

function formatEuroPerMonth(value: number): string {
  // formatCurrency(value, 0) returns e.g. "1.234 €" — append only the time
  // suffix so the euro sign appears exactly once.
  return `${formatCurrency(value, 0)}/Mon.`
}
