import type { Dispatch, SetStateAction } from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../../../domain'
import { NumberField } from '../../../ui/NumberField'
import { clampNumber } from '../../../ui/formatting'
import { formatCurrency } from '../../../utils/format'

/**
 * `§ 2 Einkommen` for `/eingaben`. Extracted from `AngabenPage.tsx` so the
 * page shell stays a thin orchestrator and so the section conventions (one
 * file per § section, slice + setter props) match the rest of
 * `src/features/inputs/sections/`. Behaviour is byte-identical with the
 * inline implementation that shipped in PR 5; only the JSX scope changes.
 *
 * Numeric fields bound to engine-shaped state route through `<NumberField>`
 * per the CLAUDE.md "UI rounding boundary" rule.
 */

interface Props {
  profile: PersonalProfile
  setProfile: Dispatch<SetStateAction<PersonalProfile>>
  assumptions: ScenarioAssumptions
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>
  /** Derived from `activeRules.socialSecurity.pensionCapYear * activeRules.bav.taxFreePctOfPensionCap / 12`.
   *  Computed in `AngabenPage` and passed in so the rules dependency lives
   *  exactly once at the page boundary. */
  bavTaxFreeMonthly: number
  num: string
  id: string
  title: string
}

export function AngabenEinkommenSection({
  profile,
  setProfile,
  assumptions,
  setAssumptions,
  bavTaxFreeMonthly,
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
        Bruttogehalt steuert Lohnsteuer, Vorsorgepauschale und die
        Förderhöchstbeträge der betrieblichen Altersvorsorge.
      </p>

      <div className="angaben-fields">
        <div className="angaben-field">
          <NumberField
            label="Bruttoeinkommen pro Jahr"
            value={profile.grossSalaryYear}
            min={0}
            step={500}
            suffix="EUR p.a."
            onChange={(value) =>
              setProfile((p) => ({
                ...p,
                grossSalaryYear: Math.max(0, Number(value)),
              }))
            }
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Vorsorgepauschale § 39b EStG; § 3 Nr. 63 EStG / § 1 SvEV
            </span>
          </span>
        </div>

        <div className="angaben-field">
          <NumberField
            label="bAV-Brutto pro Monat"
            value={assumptions.bav.monthlyGrossConversion}
            min={0}
            step={10}
            suffix="EUR mtl."
            onChange={(value) =>
              setAssumptions((a) => ({
                ...a,
                bav: {
                  ...a.bav,
                  monthlyGrossConversion: Math.max(0, Number(value)),
                },
              }))
            }
          />
          <span className="angaben-field-meta">
            <span className="angaben-field-hint">
              Voll steuer- und SV-frei bis ca. {formatCurrency(bavTaxFreeMonthly, 0)}/Monat
              (§ 3 Nr. 63 EStG)
            </span>
          </span>
        </div>

        {profile.publicHealthInsurance && (
          <div className="angaben-field">
            <NumberField
              label="GKV-Zusatzbeitrag"
              value={profile.healthAdditionalContributionPct}
              min={0}
              max={5}
              step={0.1}
              decimals={1}
              suffix="% p.a."
              onChange={(value) =>
                setProfile((p) => ({
                  ...p,
                  // Clamp to the same UI bounds so out-of-range typed values
                  // never reach STORAGE_KEY_V1 (`<input type="number">` doesn't
                  // reject typed out-of-range). validateState's permissive
                  // 0..10 range catches anything above 10 anyway, but we
                  // mirror the UI bound for clarity.
                  healthAdditionalContributionPct: clampNumber(Number(value), 0, 5),
                }))
              }
            />
            <span className="angaben-field-meta">
              <span className="angaben-field-hint">
                Kassenindividuell; Lohnsteuer-PAP nutzt diesen Wert direkt
              </span>
            </span>
          </div>
        )}

        {!profile.publicHealthInsurance && (
          <div className="angaben-field">
            <NumberField
              label="PKV-Prämie (KV)"
              value={profile.pkvMonthlyPremium}
              min={0}
              step={10}
              suffix="EUR mtl."
              onChange={(value) =>
                setProfile((p) => ({
                  ...p,
                  pkvMonthlyPremium: Math.max(0, Number(value)),
                }))
              }
            />
            <span className="angaben-field-meta">
              <span className="angaben-field-hint">
                Beitragszuschuss § 257 SGB V; Teilbeträge gehen in die Vorsorgepauschale
              </span>
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
