import { BarChart3, FileSpreadsheet, HelpCircle, Pencil } from 'lucide-react'
import type { WorkspaceView } from '../../app/useWorkspace'

type TabDef = {
  id: WorkspaceView
  label: string
  icon: typeof BarChart3
}

const TABS: readonly TabDef[] = [
  { id: 'vergleich', label: 'Vergleich', icon: BarChart3 },
  { id: 'angebot', label: 'Einstellungen', icon: Pencil },
  { id: 'warum', label: 'Warum?', icon: HelpCircle },
  { id: 'details', label: 'Details & Export', icon: FileSpreadsheet },
] as const

type WorkspaceTabsProps = {
  activeView: WorkspaceView
  onSelect: (view: WorkspaceView) => void
}

export function WorkspaceTabs({ activeView, onSelect }: WorkspaceTabsProps) {
  return (
    <nav className="workspace-tabs" aria-label="Ansicht wählen">
      <div className="workspace-tabs-inner" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = tab.id === activeView
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? 'workspace-tab active' : 'workspace-tab'}
              onClick={() => onSelect(tab.id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
