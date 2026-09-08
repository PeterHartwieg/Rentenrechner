import type { Dispatch, SetStateAction } from 'react'
import type { PersonalProfile } from '../../../domain'
import { RULES_YEAR } from '../../../rules'
import { NumberField } from '../../../ui/NumberField'
import { clampNumber } from '../../../ui/formatting'

/**
 * `§ 1 Person` for `/eingaben`. Extracted from `AngabenPage.tsx` so the page
 * shell stays a thin orchestrator and so the section conventions (one file
 * per § section, slice + setter props) match the rest of `src/features/inputs/
 * sections/`.
 *
 * Numeric fields bound to engine-shaped state (`profile.age`,
 * `profile.childBirthYears.length`) route through `<NumberField>` per the
 * CLAUDE.md "UI rounding boundary" rule.
 *
 * **Only supported controls** (input-followups plan 1): every control here is
 * bound to a `PersonalProfile` field the engine actually consumes. The former
 * Familienstand and Bundesland dropdowns changed page-local strings that never
 * reached the engine while their hints promised splitting and regional church
 * tax — they are gone. The Kirchensteuer checkbox is gone too: the stored
 * `profile.churchTax` field (and its saved values) remain valid for
 * compatibility, but no calculation path consumes it, so this surface no
 * longer offers it. The salary **Steuerklasse** select replaces the marital
 * status dropdown — `profile.taxClass` drives the § 39b EStG Lohnsteuer in
 * `calculateSalaryResult`. Steuerklasse is a payroll-tax input, not a marital
 * status: selecting III must not be read as joint retirement taxation
 * (retirement filing status derives from `calculateRetirementTax` /
 * `buildCombineContext`, not from the tax class).
 */

/** § 38b EStG salary tax classes I–VI. Neutral labels per the agreed plan —
 *  the class drives the payroll Lohnsteuer only; it neither infers a marital
 *  status for the retirement calculation nor promises splitting. */
const TAX_CLASS_OPTIONS: ReadonlyArray<{
  value: PersonalProfile['taxClass']
  label: string
}> = [
  { value: 1, label: 'Steuerklasse I' },
  { value: 2, label: 'Steuerklasse II' },
  { value: 3, label: 'Steuerklasse III' },
  { value: 4, label: 'Steuerklasse IV' },
  { value: 5, label: 'Steuerklasse V' },
  { value: 6, label: 'Steuerklasse VI' },
]

const KV_OPTIONS = [
  { value: 'gkv', label: 'Gesetzlich (GKV)' },
  { value: 'pkv', label: 'Privat (PKV)' },
] as const

interface Props {
  profile: PersonalProfile
  setProfile: Dispatch<SetStateAction<PersonalProfile>>
  /** Section heading + § kicker — provided by the parent so the SECTIONS
   *  array stays the single source of truth for ordering and slug ids. */
  num: string
  id: string
  title: string
}

export function AngabenPersonSection({
  profile,
  setProfile,
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
        Alter, Steuerklasse und Krankenversicherung. Das Alter fixiert die
        Kohortenwerte für Versorgungsfreibetrag und Besteuerungsanteil, die
        Steuerklasse die Lohnsteuer in der Ansparphase.
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
              setProfile((p) => ({
                ...p,
                // Clamp so validateState's `retirementAge >= age` invariant
                // (scenarioSchema.ts:32) is never violated — otherwise the
                // next-load reader silently falls back to defaults.
                age: clampNumber(Number(value), 18, p.retirementAge - 1),
              }))
            }
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Geburtsjahr fixiert Kohortenwerte (§ 22 Nr. 1, § 19 Abs. 2 EStG)
            </span>
          </span>
        </div>

        <label className="angaben-field">
          <span className="angaben-field-label">Steuerklasse (Lohnsteuer)</span>
          <span className="angaben-field-shell">
            <select
              value={profile.taxClass}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  taxClass: Number(e.target.value) as PersonalProfile['taxClass'],
                }))
              }
            >
              {TAX_CLASS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="angaben-field-caret" aria-hidden="true">▾</span>
          </span>
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Wirkt auf die Lohnsteuer in der Ansparphase (§ 39b EStG) und damit
              auf Nettolohn und Förderhöchstbeträge. Die gemeinsame
              Veranlagung im Ruhestand (Ehegattensplitting) und die
              Kirchensteuer werden nicht berechnet.
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
      </div>

      {/* Honest-scope note (input-followups plan 1): one concise line instead
          of the removed Familienstand/Bundesland/Kirchensteuer hints. */}
      <p className="angaben-field-hint" data-testid="angaben-person-limitation">
        Diese Rechnung erstellt keine vollständige gemeinsame
        Steuererklärung des Haushalts — Ehegattensplitting und Kirchensteuer
        sind nicht enthalten.
      </p>
    </section>
  )
}
