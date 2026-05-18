import { useState } from 'react'
import { Menu, X } from 'lucide-react'

export type LeafDef<TSlug extends string> = {
  id: TSlug
  label: string
  hidden?: boolean
}

export type GroupDef<TSlug extends string> = {
  id: string
  label: string
  paneSlug?: TSlug
  leaves: LeafDef<TSlug>[]
}

type Props<TSlug extends string> = {
  groups: GroupDef<TSlug>[]
  activePane: TSlug
  onPaneChange: (pane: TSlug) => void
  ariaLabel: string
}

export function PaneSidebar<TSlug extends string>({
  groups,
  activePane,
  onPaneChange,
  ariaLabel,
}: Props<TSlug>) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const activePaneLabel =
    groups.find((g) => g.paneSlug === activePane)?.label ??
    groups.flatMap((g) => g.leaves).find((l) => l.id === activePane)?.label ??
    (activePane as string)

  function handleLeafClick(pane: TSlug) {
    onPaneChange(pane)
    setDrawerOpen(false)
  }

  const navContent = (
    <nav className="vergleich-sidebar" aria-label={ariaLabel}>
      {groups.map((group) => {
        const visibleLeaves = group.leaves.filter((leaf) => !leaf.hidden)
        if (visibleLeaves.length === 0 && !group.paneSlug) return null
        return (
          <div key={group.id} className="vergleich-sidebar-group">
            {group.paneSlug ? (
              <button
                type="button"
                className={`vergleich-sidebar-group-label vergleich-sidebar-group-label--selectable${activePane === group.paneSlug ? ' active' : ''}`}
                aria-current={activePane === group.paneSlug ? 'page' : undefined}
                onClick={() => handleLeafClick(group.paneSlug!)}
              >
                {group.label}
              </button>
            ) : (
              <span className="vergleich-sidebar-group-label">{group.label}</span>
            )}
            {visibleLeaves.map((leaf) => (
              <button
                key={leaf.id}
                type="button"
                aria-current={activePane === leaf.id ? 'page' : undefined}
                className={`vergleich-sidebar-leaf${activePane === leaf.id ? ' active' : ''}`}
                onClick={() => handleLeafClick(leaf.id)}
              >
                {leaf.label}
              </button>
            ))}
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Mobile toggle — visible only at ≤768px via CSS */}
      <button
        type="button"
        className="vergleich-sidebar-toggle"
        aria-label={drawerOpen ? 'Ansicht schließen' : 'Ansicht wählen'}
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((v) => !v)}
      >
        {drawerOpen ? <X size={16} aria-hidden="true" /> : <Menu size={16} aria-hidden="true" />}
        <span>{activePaneLabel}</span>
      </button>

      {/* Drawer overlay — mobile only */}
      {drawerOpen && (
        <div className="vergleich-sidebar-drawer">
          {navContent}
        </div>
      )}

      {/* Desktop sidebar — always visible */}
      <div className="vergleich-sidebar-desktop">
        {navContent}
      </div>
    </>
  )
}
