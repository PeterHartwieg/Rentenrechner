import type { PayoutMode } from '../../../domain'
import { NumberField } from '../../../ui/NumberField'

/**
 * Reusable retirement-payout-form section for bAV and pAV. Identical structure
 * across both products today; designed to take generic value + onChange pairs
 * so it can plug into per-instance state in Group G without changes.
 *
 * Basisrente uses its own, narrower variant (no Kapitalverzehr, capital payout
 * legally prohibited) so it is not consumed here.
 */

const PAYOUT_HINTS: Record<PayoutMode, string> = {
  leibrente:
    'Lebenslange Rente nach Vertrags-Rentenfaktor; Kapitalverzehr-Endalter wird ignoriert.',
  zeitrente:
    'Vertraglich befristete Rente über die unten gewählte Anzahl Jahre.',
  kapitalverzehr:
    'Eigenverwaltete Entnahme bis zum globalen Endalter (Annuitätenformel).',
}

interface Props {
  /**
   * Short product label used in field captions (e.g. "bAV", "pAV"). Drives the
   * "Auszahlungsform (X)" / "Garantierter Rentenfaktor (X)" labels.
   */
  productLabel: string
  payoutMode: PayoutMode
  onChangePayoutMode: (mode: PayoutMode) => void
  rentenfaktor: number
  onChangeRentenfaktor: (n: number) => void
  /**
   * Product default for the Rentenfaktor (e.g. 30 for bAV, 28 for pAV). When
   * the current value still matches the default, a "Standardwert" hint is
   * shown so users know to override it from their offer.
   */
  rentenfaktorDefault: number
  zeitrenteYears: number
  onChangeZeitrenteYears: (n: number) => void
}

export function PayoutModeSection({
  productLabel,
  payoutMode,
  onChangePayoutMode,
  rentenfaktor,
  onChangeRentenfaktor,
  rentenfaktorDefault,
  zeitrenteYears,
  onChangeZeitrenteYears,
}: Props) {
  return (
    <>
      <label className="field">
        <span>Auszahlungsform ({productLabel})</span>
        <select
          value={payoutMode}
          onChange={(event) => onChangePayoutMode(event.target.value as PayoutMode)}
        >
          <option value="leibrente">Lebenslange Rente (Leibrente)</option>
          <option value="zeitrente">Zeitrente (befristete Auszahlung)</option>
          <option value="kapitalverzehr">Selbstgesteuerte Entnahme (Kapitalverzehr)</option>
        </select>
        <small className="field-hint">{PAYOUT_HINTS[payoutMode]}</small>
      </label>

      {payoutMode === 'leibrente' && (
        <>
          <NumberField
            label={`Garantierter Rentenfaktor (${productLabel})`}
            value={rentenfaktor}
            min={1}
            max={80}
            step={0.5}
            suffix="EUR/10k mtl."
            onChange={(value) => onChangeRentenfaktor(Number(value))}
          />
          {rentenfaktor === rentenfaktorDefault && (
            <p className="field-hint">
              Standardwert — für eine genaue Rentenberechnung den garantierten
              Rentenfaktor aus dem Angebot übernehmen (steht im PIB oder in der
              Beispielsrechnung).
            </p>
          )}
        </>
      )}

      {payoutMode === 'zeitrente' && (
        <NumberField
          label={`Zeitrente-Dauer (${productLabel})`}
          value={zeitrenteYears}
          min={1}
          max={50}
          step={1}
          suffix="Jahre"
          onChange={(value) => onChangeZeitrenteYears(Number(value))}
        />
      )}
    </>
  )
}
