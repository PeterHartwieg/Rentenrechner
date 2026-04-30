import type React from 'react'
import type { ScenarioAssumptions } from '../../domain'
import { formatPercent } from '../../utils/format'

interface ScenarioToolbarProps {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  selectedScenarioId: string
  onSelectScenario: (id: string) => void
  showRealValues: boolean
  onShowRealValuesChange: (v: boolean) => void
}

export function ScenarioToolbar({
  assumptions,
  onAssumptionsChange,
  selectedScenarioId,
  onSelectScenario,
  showRealValues,
  onShowRealValuesChange,
}: ScenarioToolbarProps) {
  const customScenario = assumptions.returnScenarios.find((s) => s.id === 'custom')

  function updateCustomRate(annualReturn: number) {
    onAssumptionsChange((current) => ({
      ...current,
      returnScenarios: current.returnScenarios.map((s) =>
        s.id === 'custom' ? { ...s, annualReturn } : s,
      ),
    }))
  }

  function addCustomScenario() {
    onAssumptionsChange((current) => ({
      ...current,
      returnScenarios: [
        ...current.returnScenarios,
        { id: 'custom', label: 'Eigenes', annualReturn: 0.06 },
      ],
    }))
    onSelectScenario('custom')
  }

  function removeCustomScenario() {
    onAssumptionsChange((current) => ({
      ...current,
      returnScenarios: current.returnScenarios.filter((s) => s.id !== 'custom'),
    }))
  }

  return (
    <div className="toolbar">
      <div className="scenario-controls">
        <div className="segmented" aria-label="Rendite-Szenario auswählen">
          {assumptions.returnScenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className={scenario.id === selectedScenarioId ? 'active' : ''}
              onClick={() => onSelectScenario(scenario.id)}
            >
              {scenario.label} {formatPercent(scenario.annualReturn)}
            </button>
          ))}
        </div>
        {customScenario ? (
          <div className="scenario-custom-edit">
            <label>
              <span>Eigene Rendite</span>
              <input
                type="number"
                min={-5}
                max={12}
                step={0.25}
                value={Number((customScenario.annualReturn * 100).toFixed(2))}
                onChange={(event) => updateCustomRate(Number(event.target.value) / 100)}
              />
              <em>%</em>
            </label>
            <button type="button" className="scenario-remove-btn" onClick={removeCustomScenario}>
              Entfernen
            </button>
          </div>
        ) : (
          <button type="button" className="scenario-add-btn" onClick={addCustomScenario}>
            + Eigenes Szenario
          </button>
        )}
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={showRealValues}
          onChange={(event) => onShowRealValuesChange(event.target.checked)}
        />
        inflationsbereinigt
      </label>
    </div>
  )
}
