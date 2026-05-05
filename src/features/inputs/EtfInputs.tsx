import '../../ui/forms.css'
import type React from 'react'
import type { ScenarioAssumptions } from '../../domain'
import { NumberField } from '../../ui/NumberField'
import { BeitragsdynamikField } from './sections/BeitragsdynamikField'
import { useFeedbackTarget } from '../qa-feedback'

type Props = {
  assumptions: ScenarioAssumptions
  onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
}

/**
 * Inputs for the ETF product. Previously inlined in `InputsPanel`; extracted so
 * the per-product UI registry can dispatch every product the same way.
 */
export function EtfInputs({ assumptions, onAssumptionsChange }: Props) {
  const { targetProps: fondsTypProps } = useFeedbackTarget({
    id: 'inputs.etf.fondstyp',
    label: 'Fondstyp (für Teilfreistellung)',
    precision: 'exact',
  })
  return (
    <div className="field-grid">
      <NumberField
        label="ETF TER"
        feedbackTargetId="inputs.etf.annualAssetFee"
        value={assumptions.etf.annualAssetFee * 100}
        min={0}
        max={3}
        step={0.05}
        suffix="% p.a."
        onChange={(value) =>
          onAssumptionsChange((current) => ({
            ...current,
            etf: { ...current.etf, annualAssetFee: Number(value) / 100 },
          }))
        }
      />
      <label className="field" {...fondsTypProps}>
        <span>Fondstyp (für Teilfreistellung)</span>
        <select
          value={assumptions.etf.equityPartialExemption}
          onChange={(event) =>
            onAssumptionsChange((current) => ({
              ...current,
              etf: {
                ...current.etf,
                equityPartialExemption: Number(event.target.value),
              },
            }))
          }
        >
          <option value={0.3}>Aktienfonds (30% steuerfrei)</option>
          <option value={0.15}>Mischfonds (15% steuerfrei)</option>
          <option value={0.6}>Inl. Immobilienfonds (60% steuerfrei)</option>
          <option value={0.8}>Ausl. Immobilienfonds (80% steuerfrei)</option>
          <option value={0}>Anleihe-ETF / Sonstige (0% steuerfrei)</option>
        </select>
      </label>
      <BeitragsdynamikField
        rate={assumptions.etf.annualContributionGrowthRate}
        feedbackBaseId="inputs.etf.beitragsdynamik"
        onChangeRate={(rate) =>
          onAssumptionsChange((current) => ({
            ...current,
            etf: { ...current.etf, annualContributionGrowthRate: rate },
          }))
        }
      />
    </div>
  )
}
