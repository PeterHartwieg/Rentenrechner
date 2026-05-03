/**
 * VintageChips — renders per-instance vintage-detection atoms as colored chips.
 *
 * Receives atoms pre-filtered to the relevant instance by the parent (option A
 * from the spec: host calls runRules once, filters per-instance via id +
 * context.instanceId, passes the relevant subset down). This component is
 * React-only and must NOT import from the engine directly.
 *
 * Chip variants:
 *   --privilege  green: pre_2005_pav_taxfree_capital, halbeinkuenfte_pav_eligible, bav_40b_alt_eligible
 *   --caveat     yellow: bav_40b_alt_conditions_unmet, pre_2005_pav_high_garantiezins, riester_pre_2008_zulage
 *   --info       neutral/blue: bav_durchfuehrungsweg_direktzusage
 */

import './VintageChips.css'
import type { Atom } from '../../app/recommendations'
import { renderAtom } from '../../app/recommendations'
import { InfoTip } from '../../ui/InfoTip'
import { VINTAGE_ATOM_IDS, chipVariant } from './vintageChipsUtils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VintageChipsProps {
  /** Pre-filtered atoms for this instance (caller selects by instanceId + vintage id). */
  atoms: Atom[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VintageChips({ atoms }: VintageChipsProps) {
  const vintageAtoms = atoms.filter((a) => VINTAGE_ATOM_IDS.has(a.id))
  if (vintageAtoms.length === 0) return null

  return (
    <div className="vintage-chips">
      {vintageAtoms.map((atom, i) => {
        const { headline, body } = renderAtom(atom)
        const variant = chipVariant(atom.id)
        return (
          <span
            key={`${atom.id}-${i}`}
            className={`vintage-chip vintage-chip--${variant}`}
          >
            <span className="vintage-chip-label">{headline}</span>
            <InfoTip icon="info" label={headline}>
              <span className="vintage-chip-body">{body}</span>
            </InfoTip>
          </span>
        )
      })}
    </div>
  )
}
