import { RefreshCw } from 'lucide-react'
import type { MonteCarloAssumptions, ReturnScenario } from '../../domain'
import { formatPercent } from '../../utils/format'

/**
 * Minimal shape of assumptions consumed by the toolbar.
 * Using a structural subtype (Pick-style) instead of the full
 * `ScenarioAssumptions` / `WorkspaceAssumptionsV2` lets the toolbar accept
 * both compare-mode singleton state and combine-mode workspace state without
 * a lossy cast. The toolbar only reads/writes `returnScenarios` + `monteCarlo`.
 */
interface ToolbarAssumptions {
  returnScenarios: ReturnScenario[]
  monteCarlo: MonteCarloAssumptions
}

interface ScenarioToolbarProps {
  assumptions: ToolbarAssumptions
  /**
   * Functional updater — receives the current assumptions (returnScenarios +
   * monteCarlo) and returns the next value. Kept as a functional-only signature
   * so the toolbar can be wired to both singleton state (`setAssumptions`) and
   * workspace state (`portfolioState.patchBaseline`) without requiring a
   * setState overload or a lossy type cast.
   */
  onAssumptionsChange: (updater: (current: ToolbarAssumptions) => ToolbarAssumptions) => void
  selectedScenarioId: string
  onSelectScenario: (id: string) => void
  showRealValues: boolean
  onShowRealValuesChange: (v: boolean) => void
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function nextSeed(seed: number): number {
  return Math.max(1, (seed * 48_271) % 2_147_483_647)
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

  function updateMonteCarlo(patch: Partial<MonteCarloAssumptions>) {
    onAssumptionsChange((current) => ({
      ...current,
      monteCarlo: { ...current.monteCarlo, ...patch },
    }))
  }

  return (
    <div className="toolbar">
      <div className="scenario-controls">
        <div className="segmented" aria-label="Rendite-Szenario auswaehlen">
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

      <details className="toolbar-advanced">
        <summary>
          <span>Darstellung & Risiko</span>
          {assumptions.monteCarlo.enabled && (
            <span className="toolbar-risk-summary">
              MC {assumptions.monteCarlo.runs}x | Vol {formatPercent(assumptions.monteCarlo.annualVolatility)}
            </span>
          )}
        </summary>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showRealValues}
            onChange={(event) => onShowRealValuesChange(event.target.checked)}
          />
          inflationsbereinigt
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={assumptions.monteCarlo.enabled}
            onChange={(event) => updateMonteCarlo({ enabled: event.target.checked })}
          />
          Monte Carlo
        </label>
        {assumptions.monteCarlo.enabled && (
          <div className="monte-carlo-toolbar-fields">
            <label>
              <span>Laeufe</span>
              <input
                type="number"
                min={100}
                max={5000}
                step={100}
                value={assumptions.monteCarlo.runs}
                onChange={(event) =>
                  updateMonteCarlo({ runs: Math.round(clamp(Number(event.target.value), 100, 5000)) })
                }
              />
            </label>
            <label>
              <span>Schwankung</span>
              <input
                type="number"
                min={0}
                max={60}
                step={1}
                value={Number((assumptions.monteCarlo.annualVolatility * 100).toFixed(1))}
                onChange={(event) =>
                  updateMonteCarlo({
                    annualVolatility: clamp(Number(event.target.value), 0, 60) / 100,
                  })
                }
              />
              <em>%</em>
            </label>
            <label>
              <span>Seed</span>
              <input
                type="number"
                min={1}
                max={2147483647}
                step={1}
                value={assumptions.monteCarlo.seed}
                onChange={(event) =>
                  updateMonteCarlo({ seed: Math.round(clamp(Number(event.target.value), 1, 2147483647)) })
                }
              />
            </label>
            <button
              type="button"
              className="monte-carlo-seed-btn"
              title="Seed neu"
              aria-label="Seed neu"
              onClick={() => updateMonteCarlo({ seed: nextSeed(assumptions.monteCarlo.seed) })}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </details>
    </div>
  )
}
