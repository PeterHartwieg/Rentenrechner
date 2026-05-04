// @vitest-environment jsdom
/**
 * Component render tests for InstanceCard ETF vs. non-ETF copy (QA issue #02).
 *
 * Verifies:
 *   - ETF card hides Vertragsbeginn field.
 *   - ETF card shows Depot-flavored field labels (Depotwert, Sparrate, Depot/Broker).
 *   - Non-ETF card (e.g. bAV) shows Vertragsbeginn and Vertrag-flavored labels.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EtfCard, BavCard } from './InstanceCard'
import type { EtfDraft, BavDraft } from './types'

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
})
