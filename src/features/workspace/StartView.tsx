import { FileSpreadsheet, HelpCircle, Pencil } from 'lucide-react'
import type { WorkspaceView } from '../../app/useWorkspace'

type Action = {
  id: WorkspaceView
  label: string
  icon: typeof Pencil
}

const ACTIONS: readonly Action[] = [
  { id: 'angebot', label: 'Eingaben', icon: Pencil },
  { id: 'warum', label: 'Warum?', icon: HelpCircle },
  { id: 'details', label: 'Details & Export', icon: FileSpreadsheet },
]

interface Props {
  activeView: WorkspaceView
  onNavigate: (view: WorkspaceView) => void
  onReopenGuidedSetup: () => void
}

/**
 * Slim toolbar embedded at the top of the Vergleich view. Replaces the standalone
 * Start tab — gives one-click jumps to the secondary views and the guided setup
 * without consuming a full-screen landing tab.
 */
export function StartActionsToolbar({ activeView, onNavigate, onReopenGuidedSetup }: Props) {
  return (
    <div className="start-actions-toolbar" aria-label="Schnellzugriff">
      <div className="start-actions-group">
        {ACTIONS.map((action) => {
          const Icon = action.icon
          const isActive = action.id === activeView
          return (
            <button
              key={action.id}
              type="button"
              className={isActive ? 'start-action-btn active' : 'start-action-btn'}
              onClick={() => onNavigate(action.id)}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className="start-actions-link"
        onClick={onReopenGuidedSetup}
      >
        Geführter Einstieg
      </button>
    </div>
  )
}
