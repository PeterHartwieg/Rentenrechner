/**
 * Tests for the inventory product registry (architecture-readability issue 09).
 *
 * Covers:
 *  - Every supported product has a registry entry.
 *  - Display name and label fallback are present and correct for all products.
 *  - Workspace array key maps correctly (incl. 'versicherung' → 'insurance').
 *  - createDefault produces a valid instance with the right instanceId format
 *    and label disambiguator for every product.
 *  - draftToInstance converts drafts correctly for every product.
 *  - Label fallback includes anbieter when provided, falls back to generic
 *    numbered label otherwise.
 *  - getInventoryProductEntry returns the entry for known ids and undefined
 *    for unknown ids.
 *  - draftToInstance helper throws for unknown productId.
 */

import { describe, it, expect } from 'vitest'
import {
  INVENTORY_PRODUCT_REGISTRY,
  getInventoryProductEntry,
  draftToInstance,
  type MultiInstanceProductId,
} from './inventoryProductRegistry'
import type {
  BavDraft,
  PavDraft,
  RiesterDraft,
  BasisrenteDraft,
  AvdDraft,
  EtfDraft,
} from './types'

// ---------------------------------------------------------------------------
// Helper: deterministic makeId for testing
// ---------------------------------------------------------------------------

function makeTestId(productId: string): string {
  return `${productId}-test1234`
}

const CURRENT_YEAR = new Date().getFullYear()

// ---------------------------------------------------------------------------
// All supported product ids
// ---------------------------------------------------------------------------

const ALL_PRODUCT_IDS: MultiInstanceProductId[] = [
  'bav',
  'versicherung',
  'riester',
  'basisrente',
  'altersvorsorgedepot',
  'etf',
]

// ---------------------------------------------------------------------------
// Registry completeness
// ---------------------------------------------------------------------------

describe('INVENTORY_PRODUCT_REGISTRY — completeness', () => {
  it('has an entry for every MultiInstanceProductId', () => {
    for (const id of ALL_PRODUCT_IDS) {
      expect(INVENTORY_PRODUCT_REGISTRY[id]).toBeDefined()
      expect(INVENTORY_PRODUCT_REGISTRY[id].id).toBe(id)
    }
  })

  it('every entry has a non-empty displayName', () => {
    for (const id of ALL_PRODUCT_IDS) {
      expect(typeof INVENTORY_PRODUCT_REGISTRY[id].displayName).toBe('string')
      expect(INVENTORY_PRODUCT_REGISTRY[id].displayName.length).toBeGreaterThan(0)
    }
  })

  it('every entry has a wsKey that is a non-empty string', () => {
    for (const id of ALL_PRODUCT_IDS) {
      expect(typeof INVENTORY_PRODUCT_REGISTRY[id].wsKey).toBe('string')
      expect((INVENTORY_PRODUCT_REGISTRY[id].wsKey as string).length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Workspace array key mapping
// ---------------------------------------------------------------------------

describe('workspace array key mapping', () => {
  it("'versicherung' maps to wsKey 'insurance'", () => {
    expect(INVENTORY_PRODUCT_REGISTRY.versicherung.wsKey).toBe('insurance')
  })

  it("'bav' maps to wsKey 'bav'", () => {
    expect(INVENTORY_PRODUCT_REGISTRY.bav.wsKey).toBe('bav')
  })

  it("'riester' maps to wsKey 'riester'", () => {
    expect(INVENTORY_PRODUCT_REGISTRY.riester.wsKey).toBe('riester')
  })

  it("'basisrente' maps to wsKey 'basisrente'", () => {
    expect(INVENTORY_PRODUCT_REGISTRY.basisrente.wsKey).toBe('basisrente')
  })

  it("'altersvorsorgedepot' maps to wsKey 'altersvorsorgedepot'", () => {
    expect(INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.wsKey).toBe('altersvorsorgedepot')
  })

  it("'etf' maps to wsKey 'etf'", () => {
    expect(INVENTORY_PRODUCT_REGISTRY.etf.wsKey).toBe('etf')
  })
})

// ---------------------------------------------------------------------------
// Label fallback behavior
// ---------------------------------------------------------------------------

describe('labelFallback', () => {
  it('bAV: uses anbieter when provided', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.bav.labelFallback(1, 'Allianz')).toBe('bAV – Allianz')
  })

  it('bAV: falls back to numbered label when no anbieter', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.bav.labelFallback(1)).toBe('bAV #1')
    expect(INVENTORY_PRODUCT_REGISTRY.bav.labelFallback(3)).toBe('bAV #3')
  })

  it('versicherung: uses anbieter when provided', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.versicherung.labelFallback(1, 'AXA')).toBe('pAV – AXA')
  })

  it('versicherung: falls back to numbered label', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.versicherung.labelFallback(2)).toBe('pAV #2')
  })

  it('riester: uses anbieter when provided', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.riester.labelFallback(1, 'DWS')).toBe('Riester – DWS')
  })

  it('riester: falls back to numbered label', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.riester.labelFallback(1)).toBe('Riester #1')
  })

  it('basisrente: uses anbieter when provided', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.basisrente.labelFallback(1, 'Rürup AG')).toBe('Basisrente – Rürup AG')
  })

  it('basisrente: falls back to numbered label', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.basisrente.labelFallback(2)).toBe('Basisrente #2')
  })

  it('altersvorsorgedepot: uses anbieter when provided', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.labelFallback(1, 'Scalable')).toBe('AVD – Scalable')
  })

  it('altersvorsorgedepot: falls back to numbered label', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.labelFallback(1)).toBe('AVD #1')
  })

  it('etf: uses anbieter when provided', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.etf.labelFallback(1, 'iShares')).toBe('ETF – iShares')
  })

  it('etf: falls back to numbered label', () => {
    expect(INVENTORY_PRODUCT_REGISTRY.etf.labelFallback(1)).toBe('ETF #1')
  })
})

// ---------------------------------------------------------------------------
// createDefault — all products produce valid instances
// ---------------------------------------------------------------------------

describe('createDefault — instanceId format', () => {
  it.each(ALL_PRODUCT_IDS)('%s: instanceId matches ${productId}-${random8} format', (id) => {
    const inst = INVENTORY_PRODUCT_REGISTRY[id].createDefault(CURRENT_YEAR, 1, makeTestId)
    expect((inst as { instanceId: string }).instanceId).toMatch(new RegExp(`^${id}-test1234$`))
  })
})

describe('createDefault — label has disambiguator', () => {
  it('bAV #2 label when n=2', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.bav.createDefault(CURRENT_YEAR, 2, makeTestId)
    expect(inst.label).toBe('bAV #2')
  })

  it('pAV #1 label when n=1', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.versicherung.createDefault(CURRENT_YEAR, 1, makeTestId)
    expect(inst.label).toBe('pAV #1')
  })

  it('Riester #3 label when n=3', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.riester.createDefault(CURRENT_YEAR, 3, makeTestId)
    expect(inst.label).toBe('Riester #3')
  })

  it('Basisrente #1 label when n=1', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.basisrente.createDefault(CURRENT_YEAR, 1, makeTestId)
    expect(inst.label).toBe('Basisrente #1')
  })

  it('AVD #1 label when n=1', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.createDefault(CURRENT_YEAR, 1, makeTestId)
    expect(inst.label).toBe('AVD #1')
  })

  it('ETF #2 label when n=2', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.etf.createDefault(CURRENT_YEAR, 2, makeTestId)
    expect(inst.label).toBe('ETF #2')
  })
})

describe('createDefault — instance has expected fields', () => {
  it('bAV default: status=active, monthlyGrossConversion=200, payoutMode=leibrente', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.bav.createDefault(CURRENT_YEAR, 1, makeTestId)
    expect(inst.status).toBe('active')
    expect(inst.contractStartYear).toBe(CURRENT_YEAR)
    expect(inst.currentValueEUR).toBe(0)
    expect(inst.monthlyGrossConversion).toBe(200)
    expect(inst.payoutMode).toBe('leibrente')
    expect(inst.rentenfaktor).toBe(30)
    expect(inst.durchfuehrungsweg).toBe('direktversicherung_3_63')
    expect(inst.fees.wrapperAssetFee).toBeCloseTo(0.008, 5)
    expect(inst.fees.fundAssetFee).toBe(0)
  })

  it('versicherung default: status=active, monthlyContribution=100', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.versicherung.createDefault(CURRENT_YEAR, 1, makeTestId)
    expect(inst.status).toBe('active')
    expect(inst.monthlyContribution).toBe(100)
    expect(inst.payoutMode).toBe('leibrente')
    expect(inst.rentenfaktor).toBe(28)
    expect(inst.oldContractTaxFreeEligible).toBe(false)
  })

  it('riester default: status=active, monthlyOwnContribution=100', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.riester.createDefault(CURRENT_YEAR, 1, makeTestId)
    expect(inst.status).toBe('active')
    expect(inst.monthlyOwnContribution).toBe(100)
    expect(inst.payoutMode).toBe('leibrente')
    expect(inst.existingCapital).toBe(0)
  })

  it('basisrente default: status=active, monthlyGrossContribution=200, payoutMode=leibrente', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.basisrente.createDefault(CURRENT_YEAR, 1, makeTestId)
    expect(inst.status).toBe('active')
    expect(inst.monthlyGrossContribution).toBe(200)
    // Basisrente capital payout is legally prohibited
    expect(inst.payoutMode).toBe('leibrente')
    expect(inst.rentenfaktor).toBe(28)
  })

  it('altersvorsorgedepot default: status=active, subtype=standarddepot', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.createDefault(CURRENT_YEAR, 1, makeTestId)
    expect(inst.status).toBe('active')
    expect(inst.subtype).toBe('standarddepot')
    expect(inst.monthlyOwnContribution).toBe(200)
  })

  it('etf default: status=active, monthlyContribution=200, annualAssetFee=0.002', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.etf.createDefault(CURRENT_YEAR, 1, makeTestId)
    expect(inst.status).toBe('active')
    expect(inst.monthlyContribution).toBe(200)
    expect(inst.annualAssetFee).toBeCloseTo(0.002, 5)
  })
})

// ---------------------------------------------------------------------------
// draftToInstance — conversion for each product
// ---------------------------------------------------------------------------

describe('draftToInstance — bAV', () => {
  const bavDraft: BavDraft = {
    productId: 'bav',
    status: 'active',
    contractStartYear: 2020,
    currentValueEUR: 10_000,
    monthlyContribution: 300,
    anbieter: 'Allianz',
    durchfuehrungsweg: 'direktversicherung_3_63',
    effektivkostenPct: 0.8,
    rentenfaktor: 30,
    payoutMode: 'leibrente',
  }

  it('maps monthlyContribution to monthlyGrossConversion', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.bav.draftToInstance(bavDraft, makeTestId)
    expect(inst.monthlyGrossConversion).toBe(300)
  })

  it('converts effektivkostenPct to wrapperAssetFee decimal', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.bav.draftToInstance(bavDraft, makeTestId)
    expect(inst.fees.wrapperAssetFee).toBeCloseTo(0.008, 5)
    expect(inst.fees.fundAssetFee).toBe(0)
  })

  it('sets currentValueEUR from draft', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.bav.draftToInstance(bavDraft, makeTestId)
    expect(inst.currentValueEUR).toBe(10_000)
  })

  it('builds label from anbieter', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.bav.draftToInstance(bavDraft, makeTestId)
    expect(inst.label).toBe('bAV – Allianz')
  })

  it('falls back to "bAV" label when no anbieter', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.bav.draftToInstance({ ...bavDraft, anbieter: undefined }, makeTestId)
    expect(inst.label).toBe('bAV')
  })
})

describe('draftToInstance — pAV (versicherung)', () => {
  const pavDraft: PavDraft = {
    productId: 'versicherung',
    status: 'active',
    contractStartYear: 2003,
    currentValueEUR: 20_000,
    monthlyContribution: 150,
    anbieter: 'AXA',
    effektivkostenPct: 1.2,
    rentenfaktor: 28,
    payoutMode: 'leibrente',
  }

  it('pre-2005 contract sets oldContractTaxFreeEligible=true', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.versicherung.draftToInstance(pavDraft, makeTestId)
    expect(inst.oldContractTaxFreeEligible).toBe(true)
  })

  it('post-2004 contract sets oldContractTaxFreeEligible=false', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.versicherung.draftToInstance(
      { ...pavDraft, contractStartYear: 2010 },
      makeTestId,
    )
    expect(inst.oldContractTaxFreeEligible).toBe(false)
  })

  it('converts effektivkostenPct 1.2 to wrapperAssetFee 0.012', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.versicherung.draftToInstance(pavDraft, makeTestId)
    expect(inst.fees.wrapperAssetFee).toBeCloseTo(0.012, 5)
  })

  it('label uses anbieter', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.versicherung.draftToInstance(pavDraft, makeTestId)
    expect(inst.label).toBe('pAV – AXA')
  })

  it('falls back to "Private Rentenversicherung" when no anbieter', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.versicherung.draftToInstance(
      { ...pavDraft, anbieter: undefined },
      makeTestId,
    )
    expect(inst.label).toBe('Private Rentenversicherung')
  })
})

describe('draftToInstance — Riester', () => {
  const riesterDraft: RiesterDraft = {
    productId: 'riester',
    status: 'active',
    contractStartYear: 2015,
    currentValueEUR: 8_000,
    monthlyContribution: 100,
    anbieter: undefined,
    payoutMode: 'leibrente',
    zulageStatus: '',
  }

  it('maps monthlyContribution to monthlyOwnContribution', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.riester.draftToInstance(riesterDraft, makeTestId)
    expect(inst.monthlyOwnContribution).toBe(100)
  })

  it('sets existingCapital from currentValueEUR', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.riester.draftToInstance(riesterDraft, makeTestId)
    expect(inst.existingCapital).toBe(8_000)
  })

  it('falls back to "Riester-Rente" when no anbieter', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.riester.draftToInstance(riesterDraft, makeTestId)
    expect(inst.label).toBe('Riester-Rente')
  })

  it('uses anbieter in label', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.riester.draftToInstance(
      { ...riesterDraft, anbieter: 'DWS' },
      makeTestId,
    )
    expect(inst.label).toBe('Riester – DWS')
  })
})

describe('draftToInstance — Basisrente', () => {
  const basisrenteDraft: BasisrenteDraft = {
    productId: 'basisrente',
    status: 'active',
    contractStartYear: 2022,
    currentValueEUR: 10_000,
    monthlyContribution: 300,
    anbieter: 'Rürup AG',
    effektivkostenPct: 1.4,
    rentenfaktor: 27,
  }

  it('payoutMode is always leibrente (legal constraint)', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.basisrente.draftToInstance(basisrenteDraft, makeTestId)
    expect(inst.payoutMode).toBe('leibrente')
  })

  it('maps monthlyContribution to monthlyGrossContribution', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.basisrente.draftToInstance(basisrenteDraft, makeTestId)
    expect(inst.monthlyGrossContribution).toBe(300)
  })

  it('converts effektivkostenPct 1.4 to wrapperAssetFee 0.014', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.basisrente.draftToInstance(basisrenteDraft, makeTestId)
    expect(inst.fees.wrapperAssetFee).toBeCloseTo(0.014, 5)
  })

  it('label uses anbieter', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.basisrente.draftToInstance(basisrenteDraft, makeTestId)
    expect(inst.label).toBe('Basisrente – Rürup AG')
  })

  it('falls back to "Basisrente" when no anbieter', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.basisrente.draftToInstance(
      { ...basisrenteDraft, anbieter: undefined },
      makeTestId,
    )
    expect(inst.label).toBe('Basisrente')
  })
})

describe('draftToInstance — AVD', () => {
  const avdDraft: AvdDraft = {
    productId: 'altersvorsorgedepot',
    status: 'active',
    contractStartYear: 2026,
    currentValueEUR: 0,
    monthlyContribution: 200,
    anbieter: undefined,
    subtype: 'depot_no_guarantee',
    useGlidepath: false,
  }

  it('useGlidepath=false sets riskAllocationPct to 1.0', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.draftToInstance(avdDraft, makeTestId)
    expect(inst.riskAllocationPct).toBe(1.0)
  })

  it('useGlidepath=true preserves default riskAllocationPct', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.draftToInstance(
      { ...avdDraft, useGlidepath: true },
      makeTestId,
    )
    expect(inst.riskAllocationPct).toBeGreaterThan(0)
    expect(inst.riskAllocationPct).toBeLessThanOrEqual(1)
  })

  it('subtype is preserved', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.draftToInstance(avdDraft, makeTestId)
    expect(inst.subtype).toBe('depot_no_guarantee')
  })

  it('falls back to "Altersvorsorgedepot" when no anbieter', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.draftToInstance(avdDraft, makeTestId)
    expect(inst.label).toBe('Altersvorsorgedepot')
  })
})

describe('draftToInstance — ETF', () => {
  const etfDraft: EtfDraft = {
    productId: 'etf',
    status: 'active',
    contractStartYear: 2018,
    currentValueEUR: 25_000,
    monthlyContribution: 300,
    anbieter: undefined,
    terPct: 0.2,
  }

  it('converts terPct 0.2 to annualAssetFee 0.002', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.etf.draftToInstance(etfDraft, makeTestId)
    expect(inst.annualAssetFee).toBeCloseTo(0.002, 5)
  })

  it('terPct 0.07 → annualAssetFee 0.0007', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.etf.draftToInstance(
      { ...etfDraft, terPct: 0.07 },
      makeTestId,
    )
    expect(inst.annualAssetFee).toBeCloseTo(0.0007, 5)
  })

  it('annualContributionGrowthRate clamps negative to 0', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.etf.draftToInstance(
      { ...etfDraft, annualContributionGrowthRate: -0.1 },
      makeTestId,
    )
    expect(inst.annualContributionGrowthRate).toBe(0)
  })

  it('falls back to "ETF-Depot" when no anbieter', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.etf.draftToInstance(etfDraft, makeTestId)
    expect(inst.label).toBe('ETF-Depot')
  })

  it('uses anbieter in label', () => {
    const inst = INVENTORY_PRODUCT_REGISTRY.etf.draftToInstance(
      { ...etfDraft, anbieter: 'iShares' },
      makeTestId,
    )
    expect(inst.label).toBe('ETF – iShares')
  })
})

// ---------------------------------------------------------------------------
// getInventoryProductEntry
// ---------------------------------------------------------------------------

describe('getInventoryProductEntry', () => {
  it('returns entry for known product ids', () => {
    for (const id of ALL_PRODUCT_IDS) {
      const entry = getInventoryProductEntry(id)
      expect(entry).toBeDefined()
      expect(entry?.id).toBe(id)
    }
  })

  it('returns undefined for unknown ids', () => {
    expect(getInventoryProductEntry('grv')).toBeUndefined()
    expect(getInventoryProductEntry('unknown-product')).toBeUndefined()
    expect(getInventoryProductEntry('')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// draftToInstance dispatch helper
// ---------------------------------------------------------------------------

describe('draftToInstance dispatch helper', () => {
  it('converts a bAV draft correctly', () => {
    const draft: BavDraft = {
      productId: 'bav',
      status: 'active',
      contractStartYear: 2020,
      monthlyContribution: 200,
      anbieter: undefined,
      durchfuehrungsweg: 'direktversicherung_3_63',
      effektivkostenPct: 0.8,
      rentenfaktor: 30,
      payoutMode: 'leibrente',
    }
    const inst = draftToInstance(draft, makeTestId)
    expect((inst as { monthlyGrossConversion: number }).monthlyGrossConversion).toBe(200)
  })

  it('throws for unknown productId', () => {
    expect(() =>
      draftToInstance({ productId: 'grv', status: 'active', contractStartYear: 2020, monthlyContribution: 0 } as never, makeTestId),
    ).toThrow(/unknown productId "grv"/)
  })
})
