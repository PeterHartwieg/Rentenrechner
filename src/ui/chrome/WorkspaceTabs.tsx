import type { ComponentType, SVGProps } from 'react'
import { qaTargetAttrs, useQaMode } from '../../features/qa-feedback'

/**
 * Sober D segmented-control nav for the Calculator workspace (Eingaben /
 * Vergleich / Details & Export). Replaces the legacy `.workspace-tabs`
 * `<nav>` rendered inline in `Calculator.tsx`.
 *
 * The component is intentionally untyped over a specific `WorkspaceView`
 * union so it stays React-free of the App layer — the caller passes the
 * tab definitions plus an `activeId` and `onSelect` callback. The
 * `qaTargetAttrs` instrumentation matches the legacy pattern so existing
 * QA-feedback selectors (`workspace.tabs.<id>`) continue to resolve.
 *
 * Visual treatment consumes the `--rw-*` token catalogue defined at the
 * top of `src/App.css` (warm rule below the strip, oxblood accent on the
 * active tab's underline + label).
 */
export interface WorkspaceTabDef<Id extends string> {
  id: Id
  label: string
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
}

interface WorkspaceTabsProps<Id extends string> {
  tabs: ReadonlyArray<WorkspaceTabDef<Id>>
  activeId: Id
  onSelect: (id: Id) => void
}

export function WorkspaceTabs<Id extends string>({
  tabs,
  activeId,
  onSelect,
}: WorkspaceTabsProps<Id>) {
  const { enabled: qaEnabled } = useQaMode()
  return (
    <nav className="rw-workspace-tabs" aria-label="Ansicht wählen">
      <div className="rw-workspace-tabs__inner" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = tab.id === activeId
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`rw-workspace-tabs__tab${active ? ' rw-workspace-tabs__tab--active' : ''}`}
              onClick={() => onSelect(tab.id)}
              {...qaTargetAttrs(qaEnabled, { id: `workspace.tabs.${tab.id}` })}
            >
              {Icon && <Icon size={16} aria-hidden="true" />}
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
