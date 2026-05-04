/**
 * Shared types, state shapes, and primitive UI components for per-trigger
 * wizard components. Imported by each wizard and by GuidedSetup.tsx.
 */

import type React from 'react'
import type { PersonalProfile, ScenarioAssumptions } from '../../../domain'

export interface BasicInputs {
  age: number
  retirementAge: number
  grossSalaryYear: number
  publicHealthInsurance: boolean
}

export interface PathSpecific {
  bavGrossConversion: number
  /** Total AG-Zuschuss in % of Bruttoumwandlung — statutory 15 % plus any extra contractual share. */
  bavTotalMatchPct: number
  etfTerPct: number
  /**
   * Years already worked under the GRV. We back-calculate Entgeltpunkte from
   * `years × min(salary, BBG) / durchschnittsentgelt` — same formula the engine
   * uses for the future-EP projection. Direct EP entry is unfriendly to non-experts.
   */
  yearsWorked: number
  /** Wunschnetto: target net monthly pension. 0/undefined skips the Lücke card. */
  desiredNetMonthlyPension: number
}

export interface WizardProps {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  basics: BasicInputs
  setBasics: React.Dispatch<React.SetStateAction<BasicInputs>>
  extras: PathSpecific
  setExtras: React.Dispatch<React.SetStateAction<PathSpecific>>
  onApplyAndComplete: () => void
  onBack: () => void
}

export function SimpleNumber({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  hint,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  hint?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="guided-field">
      <span>{label}</span>
      <div className="guided-input-shell">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
      {hint && <small className="guided-field-hint">{hint}</small>}
    </label>
  )
}
