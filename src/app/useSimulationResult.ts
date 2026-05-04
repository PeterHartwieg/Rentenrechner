// Owns the expensive simulation pass and any tax-mode derivation that depends
// only on (profile, assumptions, rules). Re-runs only when those inputs change
// — UI state lives in `useWorkspaceUiState`.

import { useMemo } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { runMonteCarlo } from '../engine/monteCarlo'
import { simulateRetirementComparison } from '../engine/simulate'
import { simulateEqualInputComparison } from '../engine/equalInputComparator'
import { de2026Rules } from '../rules/de2026'
import {
  deriveTaxModes,
  resolveEffectiveScenarioId,
  type TaxModeContext,
} from './simulationSelectors'

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
  const simulation = useMemo(
    () => {
      // Issue 16 — compare-mode sub-mode dispatch. Equal-cash (default) keeps
      // today's fair-comparison invariant (ETF + pAV invest bAV's net cost).
      // Equal-input swaps to the broker view: ETF + pAV both invest the
      // user-supplied nominal monthly contribution while bAV still flows
      // through the salary calc so tax-deferral stays computed.
      if (assumptions.compareSubMode === 'equal_input') {
        return simulateEqualInputComparison(
          profile,
          assumptions,
          de2026Rules,
          assumptions.equalInputAmountEUR ?? 200,
        )
      }
      return simulateRetirementComparison(profile, assumptions, de2026Rules)
    },
    [profile, assumptions],
  )

  const effectiveScenarioId = resolveEffectiveScenarioId(assumptions, selectedScenarioId)
  const selectedScenario = assumptions.returnScenarios.find(
    (scenario) => scenario.id === effectiveScenarioId,
  )

  const monteCarloResult = useMemo(
    () =>
      assumptions.monteCarlo.enabled && assumptions.visibleProducts.length > 0
        ? runMonteCarlo({
            profile,
            assumptions,
            rules: de2026Rules,
            scenarioId: effectiveScenarioId,
            visibleProducts: assumptions.visibleProducts,
          })
        : null,
    [profile, assumptions, effectiveScenarioId],
  )

  const taxModes = useMemo(
    () => deriveTaxModes(profile, assumptions, de2026Rules),
    [profile, assumptions],
  )

  return {
    simulation,
    monteCarloResult,
    effectiveScenarioId,
    selectedScenario,
    taxModes,
  }
}
