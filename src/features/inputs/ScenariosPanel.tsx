import { useState } from 'react'
import '../../ui/forms.css'
import './ScenarioPresetPanel.css'
import './ScenarioLibraryPanel.css'
import './ScenariosPanel.css'
import type { ScenarioAssumptions } from '../../domain'
import type { SavedScenario } from '../../data/scenarioLibrary'
import { SCENARIO_PRESETS } from '../../data/presets'

interface Props {
  // Presets
  onSelectPreset: (assumptions: ScenarioAssumptions) => void
  // User library
  library: SavedScenario[]
  onSave: (name: string) => void
  onLoad: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}

/**
 * Combined "Szenarien" panel — fuses the canned presets (Vorlagen) and the
 * user-saved library into a single collapsible. Both sections share the same
 * mental model ("load a complete assumption set") so collapsing them under
 * one menu reduces clutter in the Eingaben panel.
 */
export function ScenariosPanel({
  onSelectPreset,
  library,
  onSave,
  onLoad,
  onDuplicate,
  onDelete,
  onRename,
}: Props) {
  const [saveName, setSaveName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  function handleSave() {
    const trimmed = saveName.trim()
    if (!trimmed) return
    onSave(trimmed)
    setSaveName('')
  }

  function startRename(scenario: SavedScenario) {
    setRenamingId(scenario.id)
    setRenameValue(scenario.name)
  }

  function commitRename(id: string) {
    if (renameValue.trim()) onRename(id, renameValue.trim())
    setRenamingId(null)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  }

  const recap =
    library.length === 0
      ? `${SCENARIO_PRESETS.length} Vorlagen · leer`
      : `${SCENARIO_PRESETS.length} Vorlagen · ${library.length} gespeichert`

  return (
    <details className="disclosure-section scenarios-panel">
      <summary>
        <span className="disclosure-toggle">Szenarien</span>
        <span className="disclosure-recap">{recap}</span>
      </summary>

      {/* ── Sub-section: built-in presets ── */}
      <div className="scenarios-subsection">
        <h4 className="scenarios-subheading">Vorlagen anwenden</h4>
        <p className="preset-intro">
          Lädt eine Beispielkonfiguration und überschreibt alle Annahmen
          (Persönliches Profil bleibt erhalten).
        </p>
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
      </div>

      <div className="scenarios-divider" />

      {/* ── Sub-section: user library ── */}
      <div className="scenarios-subsection">
        <h4 className="scenarios-subheading">Eigene Szenarien</h4>

        <div className="library-save-row">
          <input
            className="library-name-input"
            type="text"
            placeholder="Name für aktuelles Szenario…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            maxLength={60}
          />
          <button
            type="button"
            className="library-save-btn"
            disabled={!saveName.trim()}
            onClick={handleSave}
          >
            Speichern
          </button>
        </div>

        {library.length === 0 ? (
          <p className="library-empty">Noch keine Szenarien gespeichert.</p>
        ) : (
          <ul className="library-list">
            {library.map((s) => (
              <li key={s.id} className="library-item">
                {renamingId === s.id ? (
                  <input
                    className="library-rename-input"
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(s.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    autoFocus
                    maxLength={60}
                  />
                ) : (
                  <button
                    type="button"
                    className="library-item-name"
                    title="Klicken zum Umbenennen"
                    onClick={() => startRename(s)}
                  >
                    <span className="library-item-label">{s.name}</span>
                    <span className="library-item-date">{formatDate(s.savedAt)}</span>
                  </button>
                )}
                <div className="library-item-actions">
                  <button
                    type="button"
                    className="lib-btn lib-btn-load"
                    onClick={() => onLoad(s.id)}
                  >
                    Laden
                  </button>
                  <button
                    type="button"
                    className="lib-btn lib-btn-copy"
                    onClick={() => onDuplicate(s.id)}
                  >
                    Kopie
                  </button>
                  <button
                    type="button"
                    className="lib-btn lib-btn-delete"
                    title="Löschen"
                    onClick={() => onDelete(s.id)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
