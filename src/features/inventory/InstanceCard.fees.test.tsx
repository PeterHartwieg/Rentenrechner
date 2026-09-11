// @vitest-environment jsdom
/**
 * Behavior tests for the Layer-1 all-in cost field on the insurance-style
 * inventory cards (bAV, pAV, Basisrente).
 *
 * What an edit of the scalar does depends on what is itemised under Details:
 *   - with fixed / contribution / acquisition extras the field is the asset
 *     charge only ("Laufende Kapitalgebühr"); editing it replaces wrapper +
 *     fund and keeps every extra plus the Auszahlungsgebühr;
 *   - without extras it is the quoted all-in Effektivkosten (mirrors
 *     `FeeSection`'s all-in path): accumulation fields collapse to the asset
 *     charge, an existing Auszahlungsgebühr is carried over.
 * A payout fee alone never turns the field into "Laufende Kapitalgebühr" or
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

describe.each(cards)('$name — Layer-1 cost field edits', ({ make, render: renderCard }) => {
  it('asset-only edit: replaces wrapper + fund and keeps itemised extras plus the payout fee', () => {
    const onChange = vi.fn()
    renderCard(
      make(fees({
        wrapperAssetFee: 0.007,
        fundAssetFee: 0.003,
        fixedMonthlyFee: 3,
        contributionFee: 0.04,
        acquisitionCostPct: 0.025,
        acquisitionCostSpreadYears: 8,
        pensionPayoutFeePct: 0.015,
      })),
      onChange,
    )
    expect(screen.getByText('Laufende Kapitalgebühr p.a. (Mantel + Fonds)')).toBeInTheDocument()
    const input = mainCostInput()
    fireEvent.change(input, { target: { value: '1.2' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)![0] as AnyDraft
    expect(next.effektivkostenPct).toBeCloseTo(1.2)
    expect(next.feeDetails).toEqual(fees({
      wrapperAssetFee: 0.012,
      fundAssetFee: 0,
      fixedMonthlyFee: 3,
      contributionFee: 0.04,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 8,
      pensionPayoutFeePct: 0.015,
    }))
  })

  it('pure all-in edit: collapses accumulation fields and preserves the Auszahlungsgebühr', () => {
    const onChange = vi.fn()
    renderCard(make(fees({ wrapperAssetFee: 0.007, fundAssetFee: 0.003, pensionPayoutFeePct: 0.015 })), onChange)
    expect(screen.getByText('Effektivkosten p.a. laut PIB/KID (all-in)')).toBeInTheDocument()
    const input = mainCostInput()
    fireEvent.change(input, { target: { value: '1.2' } })
    fireEvent.blur(input)
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
    expect(screen.getByText(/ändert nur die laufende Kapitalgebühr; die Fix-, Beitrags-, Abschluss- und Auszahlungskosten unter „Details" bleiben erhalten/)).toBeInTheDocument()
    expect(screen.queryByText(/ersetzt/)).toBeNull()
    expect(activeFeeTab()).toBe('Einzelposten')
  })
})
