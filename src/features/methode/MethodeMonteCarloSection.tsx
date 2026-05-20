import { useEffect, useState } from 'react'
import { useCalculatorState } from '../../app/useCalculatorState'
import { useSimulationResult } from '../../app/useSimulationResult'
import { resolveEffectiveScenarioId } from '../../app/simulationSelectors'
import { MonteCarloPanel } from '../results/MonteCarloPanel'

// ---------------------------------------------------------------------------
// MethodeMonteCarloSection — relocated from the legacy Vergleich pane
// dispatcher into the `/methode` page's § 1 Renditeannahmen (PR 9 plan §4).
//
// Live block: subscribes to the same singleton compare-mode state as
// `Calculator.tsx` so the panel reflects the user's saved profile +
// assumptions. When Monte-Carlo is disabled in the user's assumptions, we
// render a short pointer paragraph rather than the panel — the panel itself
// returns null on an empty result, which would leave a confusing gap.
//
// SSR safety: `useCalculatorState` reads localStorage inside a try/catch and
// falls back to `defaultProfile` / `defaultAssumptions` when storage is
// unavailable (prerender / SSR). The simulation runs locally; no fetch.
// ---------------------------------------------------------------------------

export function MethodeMonteCarloSection() {
  const { profile, assumptions } = useCalculatorState()
  // Track the active scenario id locally — Methode is not a results surface,
  // so it does not share `useWorkspaceUiState`. Default to basis so the
  // panel renders the conventional 5 % scenario without user intervention.
  const initialId = resolveEffectiveScenarioId(assumptions, 'basis')
  const [selectedScenarioId] = useState<string>(initialId)
  const { monteCarloResult } = useSimulationResult(profile, assumptions, selectedScenarioId)

  // SSR / prerender guard: Recharts `ResponsiveContainer` cannot measure its
  // parent during static HTML emit and logs a `width(-1)/height(-1)` warning.
  // Defer rendering the chart panel to after hydration; the explainer paragraph
  // covers the SSR pass so the page still has meaningful content for crawlers.
  // The cascading-render lint rule fires on the one-shot mount flag — same
  // pattern as Calculator.tsx's pendingChoice handoff. Safe here because the
  // setState runs once on mount and the parent renders only after hydration.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  if (!mounted || !assumptions.monteCarlo.enabled || assumptions.visibleProducts.length === 0) {
    return (
      <p className="methode-section-lead" aria-live="polite">
        Monte-Carlo ist im Szenario-Toolbar deaktiviert. Aktiviere die Simulation
        in deinem Plan, um Risiko-Bandbreiten (P10 / P50 / P90) je Produkt zu sehen.
      </p>
    )
  }

  return <MonteCarloPanel result={monteCarloResult} />
}
