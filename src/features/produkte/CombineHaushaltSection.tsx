import { useState } from 'react'
import type { Scenario } from '../../domain/workspace'
import { InfoTip } from '../../ui/InfoTip'
import { CombineField, CombineNativeInput } from './instances/_shared'

/**
 * `CombineHaushaltSection` — combine-mode household fields that must stay
 * editable on `/eingaben/produkte` after the initial wizard.
 *
 * PR 4 retired `CombineDashboardSidebar`, whose `PersonalProfileSection` was
 * the only UI wired to `baseline.partner` (Ehegattensplitting) and to the
 * exact `childBirthYears`. Schritt 1 covers age/income/retirement and the
 * child *count*, but its Familienstand dropdown is session-only (ephemeral)
 * and never writes `baseline.partner`, and it cannot set individual birth
 * years. Both feed the engine: `baseline.partner !== undefined` drives §32a
 * Abs. 5 Ehegattensplitting, and `childBirthYears` drives Riester/AVD
 * Kinderzulagen (pre/post-2008 allowances, under-25 window) + Pflege. Without
 * this section married users get wrong income/retirement tax and child
 * allowances until they restart the workspace (Codex PR #347 R3: P1 + P2).
 * Field semantics are ported verbatim from the deleted sidebar.
 */
export function CombineHaushaltSection({
  baseline,
  onPatchBaseline,
}: {
  baseline: Scenario
  onPatchBaseline: (patch: Partial<Omit<Scenario, 'id' | 'createdAt'>>) => void
}) {
  const profile = baseline.profile
  const partnerEnabled = Boolean(baseline.partner)
  // Local draft for the child-birth-years field so partial edits aren't
  // normalised away on every keystroke (typing "2008," would otherwise snap
  // back to "2008"). Parse + commit on blur / Enter (CR PR #347 R5).
  const [childYearsDraft, setChildYearsDraft] = useState<string | null>(null)
  const commitChildYears = () => {
    if (childYearsDraft === null) return
    const childBirthYears = childYearsDraft
      .split(/[,\s;]+/)
      .map((part) => Number(part))
      .filter((year) => Number.isInteger(year) && year > 1900)
    setChildYearsDraft(null)
    onPatchBaseline({ profile: { ...profile, childBirthYears } })
  }
  return (
    <section className="produkte-haushalt" aria-label="Haushalt">
      <h2 className="produkte-haushalt__heading">Haushalt</h2>
      <div className="combine-instance-fields">
        <CombineField
          label="Ehegattensplitting"
          labelSuffix={
            <InfoTip text="Bei aktiviertem Splitting wird das gemeinsam zu versteuernde Einkommen nach §32a Abs. 5 EStG halbiert besteuert. Eine Steuerklassen-Auswahl ist bei Zusammenveranlagung nicht erforderlich. Die Auswirkungen erscheinen automatisch in den Ergebnissen unten." />
          }
        >
          <label className="combine-checkbox-field">
            <CombineNativeInput
              type="checkbox"
              checked={partnerEnabled}
              onChange={(e) =>
                onPatchBaseline({
                  partner: (e.target as HTMLInputElement).checked
                    ? { ...profile, grossSalaryYear: 0 }
                    : undefined,
                })
              }
            />
            gemeinsam veranlagen
          </label>
        </CombineField>
        <CombineField label="Geburtsjahre Kinder">
          <CombineNativeInput
            type="text"
            value={childYearsDraft ?? profile.childBirthYears.join(', ')}
            onChange={(e) => setChildYearsDraft(e.target.value)}
            onBlur={commitChildYears}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitChildYears()
                e.currentTarget.blur()
              }
            }}
          />
        </CombineField>
      </div>
    </section>
  )
}
