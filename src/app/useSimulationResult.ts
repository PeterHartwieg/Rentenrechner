// Owns the expensive simulation pass and any tax-mode derivation that depends
// only on (profile, assumptions, rules). Re-runs only when those inputs change
// — UI state lives in `useWorkspaceUiState`.

import { useMemo } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { runMonteCarlo } from '../engine/monteCarlo'
import { simulateRetirementComparison } from '../engine/simulate'
import { activeRules } from '../rules'
import {
  deriveTaxModes,
  resolveEffectiveScenarioId,
  type TaxModeContext,
} from './simulationSelectors'
import { DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR } from '../data/defaultScenario'
import { normalizeMonthlyNettoBelastung, syncMonthlyContributions } from './syncContributions'

export interface SimulationResultBundle {
  /** Full simulation result (all scenarios, all products). */
  simulation: ReturnType<typeof simulateRetirementComparison>
  /** Monte Carlo run for the active scenario, or null when MC is disabled / empty. */
  monteCarloResult: ReturnType<typeof runMonteCarlo> | null
  /** Active scenario id (falls back to 'basis' when the user just removed a row). */
  effectiveScenarioId: string
  /** The matching scenario object, if any. */
  selectedScenario: ScenarioAssumptions['returnScenarios'][number] | undefined
  /** Tax-mode bundle (insurance era, KVdR, bAV lump-sum routing). */
  taxModes: TaxModeContext
}

/**
 * Run the retirement-comparison simulation and the Monte Carlo overlay.
 *
 * Inputs are intentionally narrow — `selectedScenarioId` is passed because we
 * also need the resolved scenario for derivation downstream, and re-running
 * Monte Carlo requires it. Monte Carlo and tax-mode derivation are inexpensive
 * compared to the main simulation; the dep arrays are tuned so UI-only changes
 * never re-trigger them.
 */
export function useSimulationResult(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  selectedScenarioId: string,
): SimulationResultBundle {
  const activeAssumptions = useMemo(
    () =>
      syncMonthlyContributions(
        normalizeMonthlyNettoBelastung(
          assumptions.equalInputAmountEUR ?? DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR,
        ),
        assumptions,
        profile,
        activeRules,
      ),
    [profile, assumptions],
  )

  const simulation = useMemo(
    () => simulateRetirementComparison(profile, activeAssumptions, activeRules),
    [profile, activeAssumptions],
  )

  const effectiveScenarioId = resolveEffectiveScenarioId(activeAssumptions, selectedScenarioId)
  const selectedScenario = activeAssumptions.returnScenarios.find(
    (scenario) => scenario.id === effectiveScenarioId,
  )

  const monteCarloResult = useMemo(
    () =>
      activeAssumptions.monteCarlo.enabled && activeAssumptions.visibleProducts.length > 0
        ? runMonteCarlo({
            profile,
            assumptions: activeAssumptions,
            rules: activeRules,
            scenarioId: effectiveScenarioId,
            visibleProducts: activeAssumptions.visibleProducts,
          })
        : null,
    [profile, activeAssumptions, effectiveScenarioId],
  )

  const taxModes = useMemo(
    () => deriveTaxModes(profile, activeAssumptions, activeRules),
    [profile, activeAssumptions],
  )

  return {
    simulation,
    monteCarloResult,
    effectiveScenarioId,
    selectedScenario,
    taxModes,
  }
}
