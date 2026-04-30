import '../../ui/forms.css'
import type React from 'react'
import type { PersonalProfile } from '../../domain'
import { NumberField } from '../../ui/NumberField'
import { clampNumber, updateNumber } from '../../ui/formatting'
import { de2026Rules } from '../../rules/de2026'
import { formatCurrency } from '../../utils/format'

type Props = {
  profile: PersonalProfile
  onProfileChange: React.Dispatch<React.SetStateAction<PersonalProfile>>
  pkv257SubsidyMonthly: number
  pkvNetMonthlyCost: number
}

export function ProfileInputs({ profile, onProfileChange, pkv257SubsidyMonthly, pkvNetMonthlyCost }: Props) {
  return (
    <>
      <div className="field-grid">
        <NumberField
          label="Alter"
          value={profile.age}
          min={18}
          max={profile.retirementAge - 1}
          suffix="Jahre"
          onCommit={(value) =>
            onProfileChange((current) => ({
              ...current,
              age: clampNumber(Number(value), 18, current.retirementAge - 1),
            }))
          }
        />
        <NumberField
          label="Rentenbeginn"
          value={profile.retirementAge}
          min={Math.max(55, profile.age + 1)}
          max={75}
          suffix="Jahre"
          onCommit={(value) =>
            onProfileChange((current) => ({
              ...current,
              retirementAge: clampNumber(Number(value), current.age + 1, 75),
            }))
          }
        />
        <NumberField
          label="Jahresbrutto"
          value={profile.grossSalaryYear}
          min={0}
          step={500}
          suffix="EUR"
          onChange={(value) => updateNumber(onProfileChange, 'grossSalaryYear', value)}
        />
        <NumberField
          label="GKV-Zusatzbeitrag"
          value={profile.healthAdditionalContributionPct}
          min={0}
          max={5}
          step={0.1}
          suffix="%"
          onChange={(value) =>
            updateNumber(onProfileChange, 'healthAdditionalContributionPct', value)
          }
        />
        <div className="field">
          <span>Kinder (Geburtsjahr)</span>
          {profile.childBirthYears.map((year, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#667085', minWidth: '52px' }}>Kind {i + 1}</span>
              <div className="input-shell" style={{ flex: 1 }}>
                <input
                  type="number"
                  min={1900}
                  max={de2026Rules.year}
                  step={1}
                  value={year}
                  onChange={(e) => {
                    const val = Math.round(clampNumber(Number(e.target.value), 1900, de2026Rules.year))
                    onProfileChange((cur) => ({
                      ...cur,
                      childBirthYears: cur.childBirthYears.map((y, j) => (j === i ? val : y)),
                    }))
                  }}
                />
              </div>
              <button
                type="button"
                style={{ padding: '3px 7px', cursor: 'pointer' }}
                onClick={() =>
                  onProfileChange((cur) => ({
                    ...cur,
                    childBirthYears: cur.childBirthYears.filter((_, j) => j !== i),
                  }))
                }
              >
                ×
              </button>
            </div>
          ))}
          {profile.childBirthYears.length < 10 && (
            <button
              type="button"
              style={{ alignSelf: 'flex-start', fontSize: '0.82rem', padding: '3px 10px', cursor: 'pointer', marginTop: '2px' }}
              onClick={() =>
                onProfileChange((cur) => ({
                  ...cur,
                  childBirthYears: [...cur.childBirthYears, de2026Rules.year - 5],
                }))
              }
            >
              + Kind hinzufügen
            </button>
          )}
        </div>
      </div>

      <label className="field">
        <span>Krankenversicherung</span>
        <select
          value={profile.publicHealthInsurance ? 'gkv' : 'pkv'}
          onChange={(event) =>
            onProfileChange((current) => ({
              ...current,
              publicHealthInsurance: event.target.value === 'gkv',
            }))
          }
        >
          <option value="gkv">GKV (gesetzlich)</option>
          <option value="pkv">PKV (privat)</option>
        </select>
      </label>
      {!profile.publicHealthInsurance && (
        <div className="field-grid">
          <NumberField
            label="PKV-Prämie (KV)"
            value={profile.pkvMonthlyPremium}
            min={0}
            step={10}
            suffix="EUR mtl."
            onCommit={(value) =>
              onProfileChange((current) => ({
                ...current,
                pkvMonthlyPremium: Math.max(0, Number(value)),
              }))
            }
          />
          <NumberField
            label="pPV-Prämie"
            value={profile.pPVMonthlyPremium}
            min={0}
            step={5}
            suffix="EUR mtl."
            onCommit={(value) =>
              onProfileChange((current) => ({
                ...current,
                pPVMonthlyPremium: Math.max(0, Number(value)),
              }))
            }
          />
        </div>
      )}
      {!profile.publicHealthInsurance && (
        <p className="field-hint">
          AG-Zuschuss zur PKV (steuerfrei, §257 SGB V):{' '}
          {formatCurrency(pkv257SubsidyMonthly, 0)}/Monat.
          Netto-PKV-Kosten:{' '}
          {formatCurrency(pkvNetMonthlyCost, 0)}/Monat.
        </p>
      )}
    </>
  )
}
