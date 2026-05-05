// @vitest-environment jsdom
/**
 * Component render tests for InstanceCard ETF vs. non-ETF copy (QA issue #02).
 *
 * Verifies:
 *   - ETF card hides Vertragsbeginn field.
 *   - ETF card shows Depot-flavored field labels (Depotwert, Sparrate, Depot/Broker).
 *   - Non-ETF card (e.g. bAV) shows Vertragsbeginn and Vertrag-flavored labels.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EtfCard, BavCard, RiesterCard } from './InstanceCard'
import type { EtfDraft, BavDraft, RiesterDraft } from './types'

afterEach(cleanup)

const BASE_ETF_DRAFT: EtfDraft = {
  productId: 'etf',
  status: 'active',
  contractStartYear: 2020,
  currentValueEUR: 10_000,
  monthlyContribution: 200,
  anbieter: undefined,
  terPct: 0.2,
}

const BASE_BAV_DRAFT: BavDraft = {
  productId: 'bav',
  status: 'active',
  contractStartYear: 2020,
  currentValueEUR: 5_000,
  monthlyContribution: 200,
  anbieter: undefined,
  durchfuehrungsweg: 'direktversicherung_3_63',
  effektivkostenPct: 0.8,
  rentenfaktor: 30,
  payoutMode: 'leibrente',
}

const BASE_RIESTER_DRAFT: RiesterDraft = {
  productId: 'riester',
  status: 'active',
  contractStartYear: 2024,
  currentValueEUR: 0,
  monthlyContribution: 100,
  anbieter: undefined,
  payoutMode: 'leibrente',
  zulageStatus: '',
}

// ---------------------------------------------------------------------------
// ETF card — Depot/Sparplan copy
// ---------------------------------------------------------------------------

describe('EtfCard — Depot/Sparplan-flavored copy', () => {
  it('does NOT render a Vertragsbeginn field', () => {
    render(<EtfCard draft={BASE_ETF_DRAFT} onChange={() => {}} />)
    expect(screen.queryByText(/Vertragsbeginn/i)).toBeNull()
  })

  it('renders "Aktueller Depotwert" instead of "Aktueller Vertragswert"', () => {
    render(<EtfCard draft={BASE_ETF_DRAFT} onChange={() => {}} />)
    expect(screen.getByText(/Aktueller Depotwert/i)).toBeDefined()
    expect(screen.queryByText(/Aktueller Vertragswert/i)).toBeNull()
  })

  it('renders "Monatliche Sparrate" instead of "Monatlicher Beitrag"', () => {
    render(<EtfCard draft={BASE_ETF_DRAFT} onChange={() => {}} />)
    expect(screen.getByText(/Monatliche Sparrate/i)).toBeDefined()
    expect(screen.queryByText(/Monatlicher Beitrag/i)).toBeNull()
  })

  it('renders "Depot / Broker" label for the provider field', () => {
    render(<EtfCard draft={BASE_ETF_DRAFT} onChange={() => {}} />)
    expect(screen.getByText(/Depot \/ Broker/i)).toBeDefined()
    expect(screen.queryByText(/Anbieter \/ Tarif/i)).toBeNull()
  })

  it('details stay ETF-specific and exclude insurance-wrapper fee labels', () => {
    render(<EtfCard draft={BASE_ETF_DRAFT} onChange={() => {}} />)

    expect(screen.getAllByText(/TER|Fondskosten/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Sparraten-Dynamik/i)).toBeDefined()
    expect(screen.queryByText(/Mantelgeb(?:ü|ue)hr/i)).toBeNull()
    expect(screen.queryByText(/Abschlusskosten/i)).toBeNull()
    expect(screen.queryByText(/Vertriebs-\/Abschlusskosten/i)).toBeNull()
    expect(screen.queryByText(/Nettotarif ETF/i)).toBeNull()
    expect(screen.queryByText(/Bruttotarif/i)).toBeNull()
  })

  it('allows clearing a lone 0 without writing NaN or immediately restoring 0 while focused', () => {
    const onChange = vi.fn()
    render(
      <EtfCard
        draft={{ ...BASE_ETF_DRAFT, currentValueEUR: 0 }}
        onChange={onChange}
      />,
    )
    const labelNode = screen.getByText(/Aktueller Depotwert/i)
    const field = labelNode.closest('.inventory-field')
    const input = field?.querySelector<HTMLInputElement>('input[type="number"]')
    expect(input).toBeTruthy()

    fireEvent.change(input!, { target: { value: '' } })
    expect(input!.value).toBe('')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.blur(input!)
    expect(input!.value).toBe('0')
    expect(onChange).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// bAV card — Vertrag-flavored copy unchanged
// ---------------------------------------------------------------------------

describe('BavCard — Vertrag-flavored copy preserved', () => {
  it('renders Vertragsbeginn field', () => {
    render(<BavCard draft={BASE_BAV_DRAFT} onChange={() => {}} />)
    expect(screen.getByText(/Vertragsbeginn/i)).toBeDefined()
  })

  it('renders "Aktueller Vertragswert" (not Depotwert)', () => {
    render(<BavCard draft={BASE_BAV_DRAFT} onChange={() => {}} />)
    expect(screen.getByText(/Aktueller Vertragswert/i)).toBeDefined()
    expect(screen.queryByText(/Aktueller Depotwert/i)).toBeNull()
  })

  it('renders "Monatlicher Beitrag" (not Sparrate)', () => {
    render(<BavCard draft={BASE_BAV_DRAFT} onChange={() => {}} />)
    expect(screen.getByText(/Monatlicher Beitrag/i)).toBeDefined()
    expect(screen.queryByText(/Monatliche Sparrate/i)).toBeNull()
  })

  it('renders "Anbieter / Tarif" (not Depot / Broker)', () => {
    render(<BavCard draft={BASE_BAV_DRAFT} onChange={() => {}} />)
    expect(screen.getByText(/Anbieter \/ Tarif/i)).toBeDefined()
    expect(screen.queryByText(/Depot \/ Broker/i)).toBeNull()
  })

  it('keeps insurance-wrapper fee details available for bAV', () => {
    render(<BavCard draft={BASE_BAV_DRAFT} onChange={() => {}} />)

    const einzelpostenTab = screen
      .getAllByText(/Einzelposten/i)
      .find((node) => node.textContent === 'Einzelposten')
    expect(einzelpostenTab).toBeDefined()
    fireEvent.click(einzelpostenTab!)

    expect(screen.getByText(/Mantelgeb(?:ü|ue)hr/i)).toBeDefined()
    expect(screen.getByText(/Vertriebs-\/Abschlusskosten/i)).toBeDefined()
    expect(screen.getByText(/Nettotarif ETF/i)).toBeDefined()
    expect(screen.getByText(/Bruttotarif/i)).toBeDefined()
  })
})

describe('RiesterCard — planned-child allowance copy', () => {
  it('does not count a planned future child as a current Kinderzulage', () => {
    const nextYear = new Date().getFullYear() + 1
    render(
      <RiesterCard
        draft={BASE_RIESTER_DRAFT}
        onChange={() => {}}
        childBirthYears={[nextYear]}
      />,
    )

    expect(screen.getByDisplayValue('Nur Grundzulage (175 EUR/Jahr)')).toBeDefined()
    expect(screen.queryByDisplayValue(/Kinderzulage/)).toBeNull()
  })
})
