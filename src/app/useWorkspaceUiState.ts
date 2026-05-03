// Workspace UI toggles. None of these flags belong to the simulation inputs
// — toggling them must NOT trigger a re-run of `simulateRetirementComparison`.
// Kept as a separate hook so the dependency graph in App.tsx is obvious.

import { useState } from 'react'
import type { ProductId } from '../domain'

export interface WorkspaceUiState {
  selectedScenarioId: string
  setSelectedScenarioId: (id: string) => void
  showRealValues: boolean
  setShowRealValues: (v: boolean | ((prev: boolean) => boolean)) => void
  cashflowProductId: ProductId
  setCashflowProductId: (id: ProductId) => void
  tarifgebunden: boolean
  setTarifgebunden: (v: boolean | ((prev: boolean) => boolean)) => void
  showAssumptions: boolean
  setShowAssumptions: (v: boolean | ((prev: boolean) => boolean)) => void
}

export function useWorkspaceUiState(): WorkspaceUiState {
  const [selectedScenarioId, setSelectedScenarioId] = useState('basis')
  const [showRealValues, setShowRealValues] = useState(false)
  const [cashflowProductId, setCashflowProductId] = useState<ProductId>('bav')
  const [tarifgebunden, setTarifgebunden] = useState(false)
  const [showAssumptions, setShowAssumptions] = useState(false)
  return {
    selectedScenarioId,
    setSelectedScenarioId,
    showRealValues,
    setShowRealValues,
    cashflowProductId,
    setCashflowProductId,
    tarifgebunden,
    setTarifgebunden,
    showAssumptions,
    setShowAssumptions,
  }
}
