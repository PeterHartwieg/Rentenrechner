import './ReturnScenarioEditor.css'
import type { ReturnScenario } from '../../domain'
import { NumberField } from '../../ui/NumberField'

type Props = {
  returnScenarios: ReturnScenario[]
  onScenariosChange: (scenarios: ReturnScenario[]) => void
}

export function ReturnScenarioEditor({ returnScenarios, onScenariosChange }: Props) {
  return (
    <div className="return-editor">
      <h3>Rendite-Szenarien</h3>
      {returnScenarios.map((scenario, index) => (
        <NumberField
          key={scenario.id}
          label={scenario.label}
          value={scenario.annualReturn * 100}
          min={-5}
          max={12}
          step={0.25}
          suffix="%"
          onChange={(value) => {
            const nextScenarios = [...returnScenarios]
            nextScenarios[index] = {
              ...scenario,
              annualReturn: Number(value) / 100,
            }
            onScenariosChange(nextScenarios)
          }}
        />
      ))}
    </div>
  )
}
