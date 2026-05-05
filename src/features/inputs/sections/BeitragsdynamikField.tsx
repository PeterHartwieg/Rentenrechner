import type { ReactNode } from 'react'
import { NumberField } from '../../../ui/NumberField'
// feedbackBaseId is passed through to NumberField — no direct QA hook needed here.

/**
 * Beitragsdynamik input field. Shared by bAV, pAV and ETF input panels — the
 * field shape is identical across products; the explanatory hint differs and
 * is passed in by the host. Range is the same 0–10 % p.a. validated in
 * `scenarioSchema.ts`.
 */

interface Props {
  /** Decimal rate (e.g. 0.02 = 2 %). Stored on the assumption shape as decimal. */
  rate: number
  onChangeRate: (decimal: number) => void
  /** Hint shown only when rate > 0. Product-specific copy. */
  activeHint?: ReactNode
  /**
   * QA-feedback base id for this section instance. Passed through to the inner
   * NumberField, e.g. `inputs.bav.beitragsdynamik` →
   * `inputs.bav.beitragsdynamik.rate`. When omitted, no feedback attributes
   * are applied.
   */
  feedbackBaseId?: string
}

export function BeitragsdynamikField({ rate, onChangeRate, activeHint, feedbackBaseId }: Props) {
  // Caller is responsible for wrapping in `<div className="field-grid">` if a
  // grid layout is desired — the field shape is the same in inline and grid
  // contexts (ETF inputs sit inside an existing grid; bAV/pAV give it its own
  // single-column row).
  return (
    <>
      <NumberField
        label="Beitragsdynamik p.a."
        feedbackTargetId={feedbackBaseId ? `${feedbackBaseId}.rate` : undefined}
        value={rate * 100}
        min={0}
        max={10}
        step={0.1}
        suffix="%"
        onChange={(value) => onChangeRate(Math.max(0, Number(value) / 100))}
      />
      {rate > 0 && activeHint && <p className="field-hint">{activeHint}</p>}
    </>
  )
}
