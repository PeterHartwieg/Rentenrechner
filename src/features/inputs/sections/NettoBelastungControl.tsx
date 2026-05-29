import './NettoBelastungControl.css'
import { NumberField } from '../../../ui/NumberField'
import { useFeedbackTarget } from '../../qa-feedback'

const NETTO_BELASTUNG_PRESETS = [100, 200, 400] as const

interface Props {
  /** Current monthly net-burden anchor (EUR/month). */
  amountEUR: number
  /** Called when the user commits a new value (input blur / preset click). */
  onAmountChange: (value: number) => void
}

/**
 * `NettoBelastungControl` — single public "Netto-Beitrag" input plus three
 * preset chips. Relocated in PR 3 from `<InputsPanel>` (compare-mode panel)
 * to Schritt 1 § 4 Annahmen so the shared monthly comparison anchor is
 * available before the user reaches the per-product Schritt 2 surface.
 *
 * The control is the single public surface for `ScenarioAssumptions
 * .equalInputAmountEUR` (see `compareSubMode` deprecation docstring in
 * `domain/results.ts`). Engine math depends on this value being kept in sync
 * with `bavFunding.monthlyNetCost` via the caller's
 * `onSyncMonthlyContribution(target)` callback — compare-mode invariant.
 */
export function NettoBelastungControl({ amountEUR, onAmountChange }: Props) {
  const { targetProps: nettoSectionProps } = useFeedbackTarget({
    id: 'inputs.nettoBelastung.section',
    label: 'Netto-Beitrag',
    precision: 'section',
  })
  return (
    <section
      className="netto-belastung-control"
      aria-label="Monatlicher Vergleichsbetrag"
      {...nettoSectionProps}
    >
      <div className="netto-belastung-row">
        <NumberField
          label="Netto-Beitrag"
          feedbackTargetId="inputs.nettoBelastung.amount"
          value={amountEUR}
          min={0}
          max={10_000}
          step={10}
          suffix="EUR mtl."
          onCommit={(value) => onAmountChange(Number(value))}
        />
        <div className="netto-belastung-presets" aria-label="Presets">
          {NETTO_BELASTUNG_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={
                Math.abs(amountEUR - preset) < 0.01
                  ? 'netto-belastung-preset active'
                  : 'netto-belastung-preset'
              }
              onClick={() => onAmountChange(preset)}
            >
              {preset} EUR
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
