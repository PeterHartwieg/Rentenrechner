import type { MeinPlanPaneSlug } from './meinPlanPanes'
import { PaneSidebar, type GroupDef } from './PaneSidebar'

export type { MeinPlanPaneSlug }

type Props = {
  activePane: MeinPlanPaneSlug
  onPaneChange: (pane: MeinPlanPaneSlug) => void
}

const SIDEBAR_GROUPS: GroupDef<MeinPlanPaneSlug>[] = [
  {
    id: 'ueberblick',
    label: 'Überblick',
    paneSlug: 'ueberblick',
    leaves: [],
  },
  {
    id: 'mein-plan',
    label: 'Mein Plan',
    leaves: [
      { id: 'lifecycle', label: 'Kapital & Auszahlungen' },
      { id: 'einkommen', label: 'Einkommen' },
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
      { id: 'renteneintrittsalter', label: 'Renteneintrittsalter' },
    ],
  },
  {
    id: 'vertraege',
    label: 'Verträge',
    paneSlug: 'vertraege',
    leaves: [],
  },
]

export function MeinPlanSidebar({ activePane, onPaneChange }: Props) {
  return (
    <PaneSidebar
      groups={SIDEBAR_GROUPS}
      activePane={activePane}
      onPaneChange={onPaneChange}
      ariaLabel="Mein-Plan-Ansichten"
    />
  )
}
