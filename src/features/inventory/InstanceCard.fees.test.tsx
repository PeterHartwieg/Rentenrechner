// @vitest-environment jsdom
/**
 * Behavior tests for the Layer-1 all-in cost field on the insurance-style
 * inventory cards (bAV, pAV, Basisrente).
 *
 * The scalar describes the accumulation phase. Editing it must behave like
 * `FeeSection`'s Effektivkosten path: fixed / contribution / acquisition
 * charges are replaced, an existing Auszahlungsgebühr is carried over, and a
 * payout fee alone never turns the field into "Laufende Kapitalgebühr" or
 * flips the Details section into Einzelposten mode.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { FeeModel } from '../../domain'
import { BasisrenteCard, BavCard, PavCard } from './InstanceCard'
import type { BasisrenteDraft, BavDraft, PavDraft } from './types'

afterEach(cleanup)

const BASE: Omit<BavDraft, 'productId' | 'durchfuehrungsweg'> = {
  status: 'active',
  contractStartYear: 2015,
  currentValueEUR: 12_000,
  monthlyContribution: 200,
  anbieter: undefined,
  effektivkostenPct: 1.0,
  rentenfaktor: 28,
  payoutMode: 'leibrente',
}

const fees = (overrides: Partial<FeeModel> = {}): FeeModel => ({
  wrapperAssetFee: 0.01,
  fundAssetFee: 0,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 5,
  pensionPayoutFeePct: 0,
  ...overrides,
})

type AnyDraft = BavDraft | PavDraft | BasisrenteDraft

const cards: Array<{ name: string; testId: string; make: (feeDetails?: FeeModel) => AnyDraft; render: (draft: AnyDraft, onChange: (d: AnyDraft) => void) => void }> = [
  {
    name: 'BavCard',
    testId: 'instance-card-bav',
    make: (feeDetails) => ({ ...BASE, productId: 'bav', durchfuehrungsweg: 'direktversicherung_3_63', feeDetails }),
    render: (draft, onChange) => { render(<BavCard draft={draft as BavDraft} onChange={onChange as (d: BavDraft) => void} />) },
  },
  {
    name: 'PavCard',
    testId: 'instance-card-versicherung',
    make: (feeDetails) => ({ ...BASE, productId: 'versicherung', feeDetails }),
    render: (draft, onChange) => { render(<PavCard draft={draft as PavDraft} onChange={onChange as (d: PavDraft) => void} />) },
  },
  {
    name: 'BasisrenteCard',
    testId: 'instance-card-basisrente',
    make: (feeDetails) => ({
      status: BASE.status,
      contractStartYear: BASE.contractStartYear,
      currentValueEUR: BASE.currentValueEUR,
      monthlyContribution: BASE.monthlyContribution,
      anbieter: BASE.anbieter,
      effektivkostenPct: BASE.effektivkostenPct,
      rentenfaktor: BASE.rentenfaktor,
      productId: 'basisrente',
      feeDetails,
    }),
    render: (draft, onChange) => { render(<BasisrenteCard draft={draft as BasisrenteDraft} onChange={onChange as (d: BasisrenteDraft) => void} />) },
  },
]

function mainCostInput(): HTMLInputElement {
  const label = screen.getByText(/^(Effektivkosten p\.a\. laut PIB\/KID \(all-in\)|Laufende Kapitalgebühr p\.a\. \(Mantel \+ Fonds\))$/)
  const input = label.closest('.inventory-field')?.querySelector<HTMLInputElement>('input[type="number"]')
  expect(input).toBeTruthy()
  return input!
}

function activeFeeTab(): string {
  return document.querySelector('.fee-mode-tab--active')!.textContent!
}

describe.each(cards)('$name — all-in cost field keeps the payout fee', ({ make, render: renderCard }) => {
  it('preserves an existing Auszahlungsgebühr when the main cost field is edited', () => {
    const onChange = vi.fn()
    renderCard(make(fees({ pensionPayoutFeePct: 0.015, fixedMonthlyFee: 3, acquisitionCostPct: 0.025 })), onChange)
    const input = mainCostInput()
    fireEvent.change(input, { target: { value: '1.2' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)![0] as AnyDraft
    expect(next.effektivkostenPct).toBeCloseTo(1.2)
    expect(next.feeDetails).toEqual(fees({
      wrapperAssetFee: 0.012,
      pensionPayoutFeePct: 0.015,
    }))
  })

  it('writes a zero payout fee when the draft had no fee details yet', () => {
    const onChange = vi.fn()
    renderCard(make(undefined), onChange)
    const input = mainCostInput()
    fireEvent.change(input, { target: { value: '0.9' } })
    fireEvent.blur(input)
    const next = onChange.mock.calls.at(-1)![0] as AnyDraft
    expect(next.feeDetails?.pensionPayoutFeePct).toBe(0)
    expect(next.feeDetails?.wrapperAssetFee).toBeCloseTo(0.009)
  })

  it('treats a payout-fee-only model as quoted Effektivkosten and starts Details in all-in mode', () => {
    renderCard(make(fees({ pensionPayoutFeePct: 0.015 })), vi.fn())
    expect(screen.getByText('Effektivkosten p.a. laut PIB/KID (all-in)')).toBeInTheDocument()
    expect(screen.queryByText('Laufende Kapitalgebühr p.a. (Mantel + Fonds)')).toBeNull()
    expect(activeFeeTab()).toBe('Effektivkosten (all-in)')
  })

  it('switches to the derived label and Einzelposten mode once accumulation extras exist', () => {
    renderCard(make(fees({ fixedMonthlyFee: 2 })), vi.fn())
    expect(screen.getByText('Laufende Kapitalgebühr p.a. (Mantel + Fonds)')).toBeInTheDocument()
    expect(screen.getByText(/ersetzt die Fix-, Beitrags- und Abschlusskosten der Ansparphase; eine Auszahlungsgebühr bleibt bestehen/)).toBeInTheDocument()
    expect(screen.queryByText(/ersetzt alle Einzelposten/)).toBeNull()
    expect(activeFeeTab()).toBe('Einzelposten')
  })
})
