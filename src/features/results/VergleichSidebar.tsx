import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import type { VergleichPaneSlug } from './vergleichPanes'

export type { VergleichPaneSlug }


type LeafDef = {
  id: VergleichPaneSlug
  label: string
  requiresBav?: true
}

type GroupDef = {
  id: string
  label: string
  paneSlug?: VergleichPaneSlug
  leaves: LeafDef[]
}

const SIDEBAR_GROUPS: GroupDef[] = [
  {
    id: 'ueberblick',
    label: 'Überblick',
    paneSlug: 'ueberblick',
    leaves: [
      { id: 'entscheidung', label: 'Entscheidung' },
    ],
  },
  {
    id: 'charts',
    label: 'Charts',
    leaves: [
      { id: 'kapital', label: 'Kapital' },
      { id: 'rente', label: 'Monatliche Rente' },
      { id: 'break-even', label: 'Break-Even' },
      { id: 'lifetime-einkommen', label: 'Lifetime-Einkommen' },
    ],
  },
  {
    id: 'kosten-steuern',
    label: 'Kosten & Steuern',
    leaves: [
      { id: 'fee-drag', label: 'Fee Drag' },
      { id: 'steuer-wasserfall', label: 'Steuer-Wasserfall' },
      { id: 'kv-pv-last', label: 'KV/PV-Last' },
    ],
  },
  {
    id: 'risiko',
    label: 'Risiko',
    leaves: [
      { id: 'monte-carlo', label: 'Monte-Carlo' },
      { id: 'sequence-of-returns', label: 'Sequence-of-Returns' },
      { id: 'inflations-stress', label: 'Inflations-Stress' },
    ],
  },
  {
    id: 'sensitivitaet',
    label: 'Sensitivität',
    leaves: [
      { id: 'rendite', label: 'Rendite' },
      { id: 'beitrag', label: 'Beitrag' },
      { id: 'lebenserwartung', label: 'Lebenserwartung' },
      { id: 'sens-retirement-age', label: 'Renteneintrittsalter' },
    ],
  },
  {
    id: 'spezial',
    label: 'Spezial',
    leaves: [{ id: 'fairness', label: 'Fairness', requiresBav: true }],
  },
]

type Props = {
  activePane: VergleichPaneSlug
  onPaneChange: (pane: VergleichPaneSlug) => void
  bavVisible: boolean
}

export function VergleichSidebar({ activePane, onPaneChange, bavVisible }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const activePaneLabel =
    SIDEBAR_GROUPS.find((g) => g.paneSlug === activePane)?.label ??
    SIDEBAR_GROUPS.flatMap((g) => g.leaves).find((l) => l.id === activePane)?.label ??
    activePane

  function handleLeafClick(pane: VergleichPaneSlug) {
    onPaneChange(pane)
    setDrawerOpen(false)
  }

  const navContent = (
    <nav className="vergleich-sidebar" aria-label="Vergleich-Ansichten">
      {SIDEBAR_GROUPS.map((group) => {
        const visibleLeaves = group.leaves.filter(
          (leaf) => !leaf.requiresBav || bavVisible,
        )
        if (visibleLeaves.length === 0) return null
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
