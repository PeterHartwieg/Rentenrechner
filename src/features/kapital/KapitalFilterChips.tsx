import { useViewport } from '../../ui/chrome/useViewport'
import type { KapitalChipOption } from './kapitalFilters'

interface Props {
  /** Chip options in display order. */
  options: KapitalChipOption[]
  /** Currently active chip id (single-select). */
  activeId: string | null
  /** Callback when the user picks a chip. */
  onSelect: (id: string) => void
}

/**
 * Single-select filter chip row for the `/kapital` page (PR 8).
 *
 * Mirrors the mock's "ANSICHT: Alle Verträge | …" header. Renders chips with
 * full labels on tablet / desktop and shorter labels on phone (chips wrap
 * via the parent flex container).
 *
 * Tap target: padding intentionally generous (≥44 px tall on phone) so the
 * chip row meets the redesign's 44 px tap-target floor without per-viewport
 * padding tweaks.
 */
export function KapitalFilterChips({ options, activeId, onSelect }: Props) {
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  if (options.length === 0) return null

  // Button-group semantics, not tabs: this is a single-select filter chip
  // row, not a tabbed content switcher. No arrow-key handling, no tabpanels,
  // no roving tabindex — `role="group"` + `aria-pressed` accurately reports
  // toggle-button behavior to assistive tech without misleading users into
  // expecting tab-key navigation.
  return (
    <div className="kapital-chips" role="group" aria-label="Ansicht: Auswahl">
      <span className="kapital-chips-label" aria-hidden="true">ANSICHT:</span>
      {options.map((option) => {
        const isActive = option.id === activeId
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            className={`kapital-chip${isActive ? ' kapital-chip--active' : ''}`}
            style={isActive ? { background: option.color, borderColor: option.color } : undefined}
            onClick={() => onSelect(option.id)}
          >
            {isPhone ? option.shortLabel : option.label}
          </button>
        )
      })}
    </div>
  )
}
