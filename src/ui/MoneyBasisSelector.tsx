import type { MoneyBasis } from './moneyBasis'
import './MoneyBasisSelector.css'

interface Props {
  value: MoneyBasis
  onChange: (value: MoneyBasis) => void
  /** Makes repeated controls on one page distinguishable to screen readers. */
  label?: string
}

export function MoneyBasisSelector({ value, onChange, label = 'Beträge anzeigen' }: Props) {
  return <div className="money-basis-selector" role="group" aria-label={label}>
    <button type="button" aria-pressed={value === 'real'} onClick={() => onChange('real')}>Heutige Kaufkraft</button>
    <button type="button" aria-pressed={value === 'nominal'} onClick={() => onChange('nominal')}>Zum Rentenbeginn</button>
  </div>
}
