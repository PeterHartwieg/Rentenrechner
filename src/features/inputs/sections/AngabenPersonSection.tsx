import type { Dispatch, SetStateAction } from 'react'
import type { PersonalProfile } from '../../../domain'
import { RULES_YEAR } from '../../../rules'
import { NumberField } from '../../../ui/NumberField'

/**
 * `§ 1 Person` for `/eingaben`. Extracted from `AngabenPage.tsx` so the page
 * shell stays a thin orchestrator and so the section conventions (one file
 * per § section, slice + setter props) match the rest of `src/features/inputs/
 * sections/`. Behaviour is byte-identical with the inline implementation that
 * shipped in PR 5; only the JSX scope changes.
 *
 * Numeric fields bound to engine-shaped state (`profile.age`,
 * `profile.childBirthYears.length`) route through `<NumberField>` per the
 * CLAUDE.md "UI rounding boundary" rule, even though this page does not yet
 * feed `simulateRetirementComparison`. Engine and storage wiring lands in a
 * later PR; using `NumberField` now prevents the storage hookup from
 * accidentally regressing display rounding.
 */

const FAMILIENSTAND_OPTIONS = [
  { value: 'ledig', label: 'ledig' },
  { value: 'verheiratet', label: 'verheiratet (Splitting)' },
  { value: 'eingetragene-partnerschaft', label: 'eingetragene Lebenspartnerschaft' },
] as const

const KV_OPTIONS = [
  { value: 'gkv', label: 'Gesetzlich (GKV)' },
  { value: 'pkv', label: 'Privat (PKV)' },
] as const

interface Props {
  profile: PersonalProfile
  setProfile: Dispatch<SetStateAction<PersonalProfile>>
  familienstand: string
  setFamilienstand: Dispatch<SetStateAction<string>>
  bundesland: string
  setBundesland: Dispatch<SetStateAction<string>>
  /** Section heading + § kicker — provided by the parent so the SECTIONS
   *  array stays the single source of truth for ordering and slug ids. */
  num: string
  id: string
  title: string
}

export function AngabenPersonSection({
  profile,
  setProfile,
  familienstand,
  setFamilienstand,
  bundesland,
  setBundesland,
  num,
  id,
  title,
}: Props) {
  return (
    <section className="angaben-section">
      <div className="angaben-section-head">
        <span className="angaben-section-num">{num}</span>
        <h2 id={id} className="angaben-section-title">
          {title}
        </h2>
      </div>
      <p className="angaben-section-lead">
        Geburtsjahr, Familienstand und Krankenversicherung. Treiben die
        Kohortenwerte für Versorgungsfreibetrag und Besteuerungsanteil
        sowie den Splittingtarif.
      </p>

      <div className="angaben-fields">
        <div className="angaben-field">
          <NumberField
            label="Alter"
            value={profile.age}
            min={18}
            max={profile.retirementAge - 1}
            step={1}
            suffix="Jahre"
            onChange={(value) =>
              setProfile((p) => ({ ...p, age: Number(value) }))
            }
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Geburtsjahr fixiert Kohortenwerte (§ 22 Nr. 1, § 19 Abs. 2 EStG)
            </span>
          </span>
        </div>

        <label className="angaben-field">
          <span className="angaben-field-label">Familienstand</span>
          <span className="angaben-field-shell">
            <select
              value={familienstand}
              onChange={(e) => setFamilienstand(e.target.value)}
            >
              {FAMILIENSTAND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="angaben-field-caret" aria-hidden="true">▾</span>
          </span>
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Ehegattensplitting nach § 32a Abs. 5 EStG
            </span>
          </span>
        </label>

        <label className="angaben-field">
          <span className="angaben-field-label">Bundesland</span>
          <span className="angaben-field-shell">
            {/* Free-text Bundesland — not bound to engine state. Kept as a
                hand-rolled <input type="text"> because it is a string label,
                not a numeric quantity. */}
            <input
              type="text"
              value={bundesland}
              onChange={(e) => setBundesland(e.target.value)}
            />
          </span>
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Kirchensteuersatz Bayern/BW vs. übrige Länder
            </span>
          </span>
        </label>

        <div className="angaben-field">
          <span className="angaben-field-label">Krankenversicherung</span>
          <div className="angaben-radio-group">
            {KV_OPTIONS.map((opt) => (
              <label key={opt.value} className="angaben-radio">
                <input
                  type="radio"
                  name="kv"
                  checked={
                    opt.value === (profile.publicHealthInsurance ? 'gkv' : 'pkv')
                  }
                  onChange={() =>
                    setProfile((p) => ({
                      ...p,
                      publicHealthInsurance: opt.value === 'gkv',
                    }))
                  }
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="angaben-field">
          <NumberField
            label="Kinder (Anzahl)"
            value={profile.childBirthYears.length}
            min={0}
            max={10}
            step={1}
            suffix="Kinder"
            onChange={(value) => {
              const n = Math.max(0, Math.min(10, Number(value)))
              setProfile((p) => {
                const current = p.childBirthYears
                if (n === current.length) return p
                if (n > current.length) {
                  // Default to 5 years before RULES_YEAR for new entries.
                  const extra = Array.from(
                    { length: n - current.length },
                    () => RULES_YEAR - 5,
                  )
                  return { ...p, childBirthYears: [...current, ...extra] }
                }
                return { ...p, childBirthYears: current.slice(0, n) }
              })
            }}
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Pflegebeiträge-Zuschlag (§ 55 SGB XI) und Riester-Kinderzulagen
            </span>
          </span>
        </div>

        <label className="angaben-field">
          <span className="angaben-field-label">Kirchensteuer</span>
          <span className="angaben-check">
            <input
              type="checkbox"
              checked={profile.churchTax}
              onChange={(e) =>
                setProfile((p) => ({ ...p, churchTax: e.target.checked }))
              }
            />
            <span>kirchensteuerpflichtig</span>
          </span>
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Auf Einkommen- und Kapitalertragsteuer; Satz je Bundesland
            </span>
          </span>
        </label>
      </div>
    </section>
  )
}
