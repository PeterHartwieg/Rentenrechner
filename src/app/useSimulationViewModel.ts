// Thin facade composing the three focused hooks. Kept so legacy or test code
// that imports `useSimulationViewModel` keeps working — new consumers should
// call `useSimulationResult` + `useWorkspaceUiState` + `useDerivedViews`
// directly so React can render only the slice that changed.

import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { useDerivedViews } from './useDerivedViews'
import { useSimulationResult } from './useSimulationResult'
import { useWorkspaceUiState } from './useWorkspaceUiState'

export function useSimulationViewModel(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
) {
  const ui = useWorkspaceUiState()
  const result = useSimulationResult(profile, assumptions, ui.selectedScenarioId)
  const views = useDerivedViews(profile, assumptions, result, {
    showRealValues: ui.showRealValues,
    cashflowProductId: ui.cashflowProductId,
  })
  return {
    // UI state — `selectedScenarioId` and `cashflowProductId` are surfaced as
    // their *resolved* values so callers don't have to re-resolve them.
    selectedScenarioId: result.effectiveScenarioId,
    setSelectedScenarioId: ui.setSelectedScenarioId,
    showRealValues: ui.showRealValues,
    setShowRealValues: ui.setShowRealValues,
    cashflowProductId: views.effectiveCashflowProductId,
    setCashflowProductId: ui.setCashflowProductId,
    tarifgebunden: ui.tarifgebunden,
    setTarifgebunden: ui.setTarifgebunden,
    showAssumptions: ui.showAssumptions,
    setShowAssumptions: ui.setShowAssumptions,
    linkCopied: views.linkCopied,
    // Simulation
    simulation: result.simulation,
    visibleProducts: views.visibleProducts,
    // Derived display data
    selectedScenario: result.selectedScenario,
    monteCarloResult: result.monteCarloResult,
    selectedResults: views.selectedResults,
    capitalChartData: views.capitalChartData,
    pensionBars: views.pensionBars,
    bestCapital: views.bestCapital,
    bestPension: views.bestPension,
    cashflowResult: views.cashflowResult,
    insuranceResult: views.insuranceResult,
    cashflowAnnualTaxSvSavings: views.cashflowAnnualTaxSvSavings,
    // Tax helpers
    insurancePayoutYear: result.taxModes.insurancePayoutYear,
    insuranceContractRuntime: result.taxModes.insuranceContractRuntime,
    insuranceTaxMode: result.taxModes.insuranceTaxMode,
    kvdrMember: result.taxModes.kvdrMember,
    bavLumpSumTaxMode: result.taxModes.bavLumpSumTaxMode,
    // Callbacks
    rowAfterTaxBalance: views.rowAfterTaxBalance,
    handleCopyLink: views.handleCopyLink,
    handleExportCsv: views.handleExportCsv,
  }
}
