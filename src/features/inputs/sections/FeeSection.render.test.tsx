// @vitest-environment jsdom
/**
 * Label guardrails for FeeSection (browser audit F05): the wrapper + fund sum
 * is never called "Effektivkosten", the computed RIY line only appears when a
 * host supplies one, and the all-in mode flags itemized extras that survive
 * in the model.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { FeeModel } from '../../../domain'
import { FeeSection } from './FeeSection'
import { describeNonAssetFees, hasNonAssetFees } from './feeModelHelpers'

afterEach(() => cleanup())

const ASSET_ONLY: FeeModel = {
  wrapperAssetFee: 0.01,
  fundAssetFee: 0.002,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 5,
  pensionPayoutFeePct: 0,
}

const WITH_EXTRAS: FeeModel = {
  ...ASSET_ONLY,
  fixedMonthlyFee: 3,
  acquisitionCostPct: 0.025,
}

describe('hasNonAssetFees / describeNonAssetFees', () => {
  it('is false for a pure asset-charge model and true once any other charge exists', () => {
    expect(hasNonAssetFees(ASSET_ONLY)).toBe(false)
    expect(hasNonAssetFees(WITH_EXTRAS)).toBe(true)
    expect(hasNonAssetFees({ ...ASSET_ONLY, contributionFee: 0.01 })).toBe(true)
    expect(hasNonAssetFees({ ...ASSET_ONLY, pensionPayoutFeePct: 0.015 })).toBe(true)
  })

  it('lists only the charges that are present', () => {
    const text = describeNonAssetFees(WITH_EXTRAS)
    expect(text).toContain('Fixkosten')
    expect(text).toContain('Abschlusskosten')
    expect(text).not.toContain('Kosten je Beitrag')
    expect(text).not.toContain('Auszahlungsgebühr')
  })
})

describe('FeeSection labels', () => {
  it('itemized mode without riy shows the asset-charge sum and no Effektivkosten line', () => {
    const { container } = render(
      <FeeSection
        fees={ASSET_ONLY}
        onChangeFees={vi.fn()}
        presets={[]}
        feeInputMode="aufgeschluesselt"
        setFeeInputMode={vi.fn()}
      />,
    )
    const summary = container.querySelector('.fee-summary')!.textContent ?? ''
    expect(summary).toContain('Laufende Kapitalgebühr (Mantel + Fonds)')
    expect(summary).not.toContain('Effektivkosten')
  })

  it('itemized mode with riy labels the computed value as Effektivkosten, separate from the sum', () => {
    const { container } = render(
      <FeeSection
        fees={ASSET_ONLY}
        onChangeFees={vi.fn()}
        presets={[]}
        riy={0.0151}
        feeInputMode="aufgeschluesselt"
        setFeeInputMode={vi.fn()}
      />,
    )
    const summary = container.querySelector('.fee-summary')!.textContent ?? ''
    expect(summary).toContain('Laufende Kapitalgebühr (Mantel + Fonds)')
    expect(summary).toContain('Effektivkosten (berechnete Renditeminderung der Ansparphase)')
  })

  it('all-in mode warns when itemized extras still exist in the model', () => {
    const { container } = render(
      <FeeSection
        fees={WITH_EXTRAS}
        onChangeFees={vi.fn()}
        presets={[]}
        feeInputMode="effektivkosten"
        setFeeInputMode={vi.fn()}
      />,
    )
    const note = container.querySelector('[data-testid="fee-allin-itemized-note"]')
    expect(note).not.toBeNull()
    expect(note!.textContent).toContain('nicht die Effektivkostenquote')
    expect(note!.textContent).toContain('Abschlusskosten')
  })

  it('all-in mode shows no itemized warning for a pure all-in model', () => {
    const { container } = render(
      <FeeSection
        fees={ASSET_ONLY}
        onChangeFees={vi.fn()}
        presets={[]}
        feeInputMode="effektivkosten"
        setFeeInputMode={vi.fn()}
      />,
    )
    expect(container.querySelector('[data-testid="fee-allin-itemized-note"]')).toBeNull()
  })
})

 it('replacing accumulation costs with a quote preserves the separate payout fee', () => {
    const onChangeFees = vi.fn()
    const { getByRole } = render(<FeeSection fees={{ ...WITH_EXTRAS, pensionPayoutFeePct: 0.015 }}
      onChangeFees={onChangeFees} presets={[]} feeInputMode="effektivkosten" setFeeInputMode={vi.fn()} />)
    const input = getByRole('spinbutton', { name: /Effektivkostenquote laut/ })
    fireEvent.change(input, { target: { value: '1.5' } })
    fireEvent.blur(input)
    expect(onChangeFees).toHaveBeenLastCalledWith(expect.objectContaining({ wrapperAssetFee: 0.015,
      fundAssetFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, pensionPayoutFeePct: 0.015 }))
  })
