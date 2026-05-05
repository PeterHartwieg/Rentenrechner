import { NumberField } from '../../../ui/NumberField'
import { formatCurrency } from '../../../utils/format'

/**
 * "Kapital lt. Angebot bei Rentenbeginn" comparison row. Used by bAV and pAV
 * input forms (UX7) so a user with a printed offer can sanity-check the model
 * against the provider's number side-by-side. Pure UI with local state owned
 * by the host component.
 */

interface Props {
  /** Modeled capital from the simulation. When 0, the field is hidden. */
  modelCapital: number
  /** Local state in the host component. `null` = not entered yet. */
  offerCapital: number | null
  onChangeOfferCapital: (n: number | null) => void
  /**
   * QA-feedback base id for this section instance. Passed through to the inner
   * NumberField, e.g. `inputs.bav.offerCapital` →
   * `inputs.bav.offerCapital.value`. When omitted, no feedback attributes
   * are applied.
   */
  feedbackBaseId?: string
}

export function OfferCapitalCompareField({
  modelCapital,
  offerCapital,
  onChangeOfferCapital,
  feedbackBaseId,
}: Props) {
  if (modelCapital <= 0) return null
  return (
    <>
      <NumberField
        label="Kapital lt. Angebot bei Rentenbeginn (optional)"
        feedbackTargetId={feedbackBaseId ? `${feedbackBaseId}.value` : undefined}
        value={offerCapital ?? 0}
        min={0}
        step={1000}
        suffix="EUR"
        onChange={(value) => {
          const v = Number(value)
          onChangeOfferCapital(v > 0 ? v : null)
        }}
      />
      {offerCapital !== null && offerCapital > 0 && (
        <p className="offer-capital-compare">
          Rechnerkapital (Basis-Szenario): {formatCurrency(modelCapital, 0)} ·{' '}
          Angebotskapital: {formatCurrency(offerCapital, 0)} ·{' '}
          Abweichung: {offerCapital >= modelCapital ? '+' : ''}
          {formatCurrency(offerCapital - modelCapital, 0)}{' '}
          ({(((offerCapital - modelCapital) / modelCapital) * 100).toFixed(1)} %)
        </p>
      )}
    </>
  )
}
