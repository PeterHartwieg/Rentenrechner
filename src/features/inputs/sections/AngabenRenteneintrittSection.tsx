import type { Dispatch, SetStateAction } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../../../domain'
import { NumberField } from '../../../ui/NumberField'
import { clampNumber } from '../../../ui/formatting'

/**
 * `§ 3 Renteneintritt` for `/eingaben`. Extracted from `AngabenPage.tsx` so
 * the page shell stays a thin orchestrator and so the section conventions
 * (one file per § section, slice + setter props) match the rest of
 * `src/features/inputs/sections/`. Behaviour is byte-identical with the
 * inline implementation that shipped in PR 5; only the JSX scope changes.
 *
 * Numeric fields bound to engine-shaped state route through `<NumberField>`
 * per the CLAUDE.md "UI rounding boundary" rule.
 *
 * Setters defensively clamp to the same min/max bounds the `<NumberField>`
 * declares so that out-of-range *typed* values never reach `useCalculatorState`.
 * `<input type="number">` does not reject typed out-of-range values; if an
 * out-of-range `retirementAge` (e.g. age=30, retirementAge=25) hits
 * STORAGE_KEY_V1, the next-load `validateState` rejects the snapshot and the
 * app silently falls back to defaults, discarding all of the user's edits.
 * Mirrors `ProfileInputs`' `clampNumber` pattern.
 */

const RETIREMENT_HEALTH_OPTIONS = [
  { value: 'kvdr', label: 'KVdR (§ 226 SGB V)' },
  { value: 'freiwillig_gkv', label: 'freiwillige GKV (§ 240 SGB V)' },
  { value: 'pkv', label: 'PKV in der Rente' },
] as const

type RetirementHealthStatus = 'kvdr' | 'freiwillig_gkv' | 'pkv'

interface Props {
  profile: PersonalProfile
  setProfile: Dispatch<SetStateAction<PersonalProfile>>
  assumptions: ScenarioAssumptions
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>
  retirementHealthStatus: RetirementHealthStatus
  setRetirementHealthStatus: Dispatch<SetStateAction<RetirementHealthStatus>>
  num: string
  id: string
  title: string
}

export function AngabenRenteneintrittSection({
  profile,
  setProfile,
  assumptions,
  setAssumptions,
  retirementHealthStatus,
  setRetirementHealthStatus,
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
        Renteneintrittsalter und Status in der Krankenversicherung der
        Rentner fixieren Besteuerungsanteil und Versorgungsfreibetrag —
        beide sind kohortengebunden.
      </p>

      <div className="angaben-fields">
        <div className="angaben-field">
          <NumberField
            label="Renteneintrittsalter"
            value={profile.retirementAge}
            min={Math.max(55, profile.age + 1)}
            max={75}
            step={1}
            suffix="Jahre"
            onChange={(value) =>
              setProfile((p) => ({
                ...p,
                // Clamp so validateState's `retirementAge >= age` invariant
                // (scenarioSchema.ts:32) is never violated — otherwise the
                // next-load reader silently falls back to defaults.
                retirementAge: clampNumber(Number(value), Math.max(55, p.age + 1), 75),
              }))
            }
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Renteneintrittsjahr fixiert Kohortenwerte zum Renteneintritt
            </span>
          </span>
        </div>

        <div className="angaben-field">
          <NumberField
            label="Kapital aufgebraucht bis"
            value={assumptions.retirementEndAge}
            min={profile.retirementAge + 1}
            max={110}
            step={1}
            suffix="Jahre"
            onChange={(value) =>
              setAssumptions((a) => ({
                ...a,
                // Clamp so validateState's cross-object invariant
                // (`retirementEndAge > retirementAge`, scenarioSchema.ts:125)
                // is never violated. The min depends on the current profile's
                // retirementAge — read it from `profile` so the latest edit
                // wins.
                retirementEndAge: clampNumber(
                  Number(value),
                  profile.retirementAge + 1,
                  110,
                ),
              }))
            }
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Nur für Kapitalverzehr (ETF, bAV/pAV in „selbstgesteuert"-Modus)
            </span>
          </span>
        </div>

        <div className="angaben-field">
          <span className="angaben-field-label">Status KV in der Rente</span>
          <div className="angaben-radio-group">
            {RETIREMENT_HEALTH_OPTIONS.map((opt) => (
              <label key={opt.value} className="angaben-radio">
                <input
                  type="radio"
                  name="retirementHealth"
                  checked={retirementHealthStatus === opt.value}
                  onChange={() => setRetirementHealthStatus(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="angaben-field">
          <NumberField
            label="Wunsch-Nettorente pro Monat"
            // `PersonalProfile.desiredNetMonthlyPension` is optional — render 0
            // as the "no target" sentinel so the field never shows an empty
            // value while keeping the engine type intact.
            value={profile.desiredNetMonthlyPension ?? 0}
            min={0}
            step={50}
            suffix="EUR mtl."
            onChange={(value) =>
              setProfile((p) => ({
                ...p,
                desiredNetMonthlyPension: Math.max(0, Number(value)),
              }))
            }
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Optional — leeren oder 0 setzen, falls keine Zielmarke gesetzt
            </span>
          </span>
        </div>
      </div>
    </section>
  )
}
