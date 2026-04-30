import '../../ui/forms.css'
import './ScenarioPresetPanel.css'
import type { ScenarioAssumptions } from '../../domain'
import { SCENARIO_PRESETS } from '../../data/presets'

interface Props {
  onSelectPreset: (assumptions: ScenarioAssumptions) => void
}

export function ScenarioPresetPanel({ onSelectPreset }: Props) {
  return (
    <details className="disclosure-section scenario-presets-panel">
      <summary>
        <span className="disclosure-toggle">Szenarien-Vorlagen</span>
        <span className="disclosure-recap">{SCENARIO_PRESETS.length} Vorlagen</span>
      </summary>
      <p className="preset-intro">Lädt eine Beispielkonfiguration und überschreibt alle Annahmen (Persönliches Profil bleibt erhalten).</p>
      <div className="scenario-preset-buttons">
        {SCENARIO_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="scenario-preset-btn"
            title={preset.description}
            onClick={() => onSelectPreset(preset.assumptions)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </details>
  )
}
