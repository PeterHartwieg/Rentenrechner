import { useMemo } from 'react'
import type { VergleichPaneSlug } from './vergleichPanes'
import { PaneSidebar, type GroupDef } from './PaneSidebar'

export type { VergleichPaneSlug }

type Props = {
  activePane: VergleichPaneSlug
  onPaneChange: (pane: VergleichPaneSlug) => void
  bavVisible: boolean
}

export function VergleichSidebar({ activePane, onPaneChange, bavVisible }: Props) {
  const groups = useMemo<GroupDef<VergleichPaneSlug>[]>(
    () => [
      {
        id: 'ueberblick',
        label: 'Überblick',
        paneSlug: 'ueberblick',
        leaves: [{ id: 'entscheidung', label: 'Entscheidung' }],
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
        leaves: [{ id: 'fairness', label: 'Fairness', hidden: !bavVisible }],
      },
    ],
    [bavVisible],
  )

  return (
    <PaneSidebar
      groups={groups}
      activePane={activePane}
      onPaneChange={onPaneChange}
      ariaLabel="Vergleich-Ansichten"
    />
  )
}
