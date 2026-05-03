/**
 * Tests for the InventoryWizard (Group G issue 05).
 *
 * Coverage per spec:
 *  Unit
 *    - estimateEpFromYears helper computes EP from years + salary.
 *    - GrvDraft produces correct Entgeltpunkte on buildWorkspaceFromDraft.
 *    - Per-product draft → instance conversions (validated below via buildWorkspaceFromDraft).
 *
 *  Integration
 *    - Wizard exit produces a v2 Workspace with mode: 'combine'.
 *    - Baseline scenario contains the entered instances.
 *    - Zero-tick ("Anna") path produces an empty baseline (no product instances).
 *    - Four-product ("Bernd") path produces 4 instance slots populated.
 *
 * Anna path: no contracts → empty baseline (GRV only, no per-product instances).
 * Bernd path: GRV + bAV + Riester + ETF → baseline with those instances.
 */

import { describe, expect, it } from 'vitest'
import { estimateEpFromYears, buildWorkspaceFromDraft } from './inventoryHelpers'
import type { GrvDraft, BavDraft, RiesterDraft, EtfDraft } from './types'

// ---------------------------------------------------------------------------
// estimateEpFromYears
// ---------------------------------------------------------------------------

describe('estimateEpFromYears', () => {
  it('returns 0 for 0 years', () => {
    expect(estimateEpFromYears(0, 75_000)).toBe(0)
  })

  it('returns 0 for 0 salary', () => {
    expect(estimateEpFromYears(10, 0)).toBe(0)
  })

  it('scales linearly with years', () => {
    const ep5 = estimateEpFromYears(5, 47_079)
    const ep10 = estimateEpFromYears(10, 47_079)
    // At Durchschnittsentgelt salary, EP/year ≈ 1.0
    expect(ep10).toBeCloseTo(ep5 * 2, 5)
  })

  it('caps salary at BBG (101_400)', () => {
    const epAtBbg = estimateEpFromYears(1, 101_400)
    const epAboveBbg = estimateEpFromYears(1, 200_000)
    expect(epAboveBbg).toBeCloseTo(epAtBbg, 5)
  })

  it('returns a positive EP value for a typical mid-career person', () => {
    const ep = estimateEpFromYears(10, 75_000)
    expect(ep).toBeGreaterThan(0)
    expect(ep).toBeLessThan(20)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrvDraft(overrides?: Partial<GrvDraft>): GrvDraft {
  return {
    productId: 'grv',
    yearsWorked: 10,
    currentEntgeltpunkte: 12,
    useYearsEstimate: true,
    ...overrides,
  }
}

function makeBavDraft(overrides?: Partial<BavDraft>): BavDraft {
  return {
    productId: 'bav',
    status: 'active',
    contractStartYear: 2020,
    currentValueEUR: 15_000,
    monthlyContribution: 200,
    anbieter: 'Allianz',
    durchfuehrungsweg: 'direktversicherung_3_63',
    effektivkostenPct: 0.8,
    rentenfaktor: 30,
    payoutMode: 'leibrente',
    ...overrides,
  }
}

function makeRiesterDraft(overrides?: Partial<RiesterDraft>): RiesterDraft {
  return {
    productId: 'riester',
    status: 'active',
    contractStartYear: 2015,
    currentValueEUR: 8_000,
    monthlyContribution: 100,
    anbieter: undefined,
    payoutMode: 'leibrente',
    zulageStatus: '',
    ...overrides,
  }
}

function makeEtfDraft(overrides?: Partial<EtfDraft>): EtfDraft {
  return {
    productId: 'etf',
    status: 'active',
    contractStartYear: 2018,
    currentValueEUR: 25_000,
    monthlyContribution: 300,
    anbieter: undefined,
    terPct: 0.2,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Anna path: no contracts
// ---------------------------------------------------------------------------

describe('buildWorkspaceFromDraft — Anna (clean-slate, no contracts)', () => {
  it('produces a v2 Workspace with mode: combine', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: null,
      pavDraft: null,
      riesterDraft: null,
      basisrenteDraft: null,
      avdDraft: null,
      etfDraft: null,
      grossSalaryYear: 50_000,
    })

    expect(ws.schemaVersion).toBe(2)
    expect(ws.mode).toBe('combine')
  })

  it('baseline has no product instances (empty arrays for all products)', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: null,
      pavDraft: null,
      riesterDraft: null,
      basisrenteDraft: null,
      avdDraft: null,
      etfDraft: null,
      grossSalaryYear: 50_000,
    })

    const a = ws.baseline.assumptions
    expect(a.bav).toHaveLength(0)
    expect(a.etf).toHaveLength(0)
    expect(a.insurance).toHaveLength(0)
    expect(a.basisrente).toHaveLength(0)
    expect(a.altersvorsorgedepot).toHaveLength(0)
    expect(a.riester).toHaveLength(0)
  })

  it('baseline origin is baseline', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: null,
      pavDraft: null,
      riesterDraft: null,
      basisrenteDraft: null,
      avdDraft: null,
      etfDraft: null,
      grossSalaryYear: 50_000,
    })

    expect(ws.baseline.origin).toBe('baseline')
  })

  it('GRV EP is estimated from years worked when useYearsEstimate=true', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft({ yearsWorked: 10, useYearsEstimate: true }),
      bavDraft: null,
      pavDraft: null,
      riesterDraft: null,
      basisrenteDraft: null,
      avdDraft: null,
      etfDraft: null,
      grossSalaryYear: 47_079, // = Durchschnittsentgelt → 1 EP/year
    })

    const ep = ws.baseline.assumptions.statutoryPension.currentEntgeltpunkte
    // At Durchschnittsentgelt, 10 years ≈ 10 EP (±rounding)
    expect(ep).toBeCloseTo(10, 1)
  })

  it('GRV EP uses currentEntgeltpunkte when useYearsEstimate=false', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft({ currentEntgeltpunkte: 17.5, useYearsEstimate: false }),
      bavDraft: null,
      pavDraft: null,
      riesterDraft: null,
      basisrenteDraft: null,
      avdDraft: null,
      etfDraft: null,
      grossSalaryYear: 75_000,
    })

    expect(ws.baseline.assumptions.statutoryPension.currentEntgeltpunkte).toBe(17.5)
  })
})

// ---------------------------------------------------------------------------
// Bernd path: GRV + bAV + Riester + ETF
// ---------------------------------------------------------------------------

describe('buildWorkspaceFromDraft — Bernd (4-product path)', () => {
  function buildBerndWorkspace() {
    return buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft({ yearsWorked: 14, useYearsEstimate: true }),
      bavDraft: makeBavDraft(),
      pavDraft: null,
      riesterDraft: makeRiesterDraft(),
      basisrenteDraft: null,
      avdDraft: null,
      etfDraft: makeEtfDraft(),
      grossSalaryYear: 85_000,
    })
  }

  it('has 4-product baseline: bAV, Riester, ETF each length 1; others empty', () => {
    const a = buildBerndWorkspace().baseline.assumptions
    expect(a.bav).toHaveLength(1)
    expect(a.riester).toHaveLength(1)
    expect(a.etf).toHaveLength(1)
    expect(a.insurance).toHaveLength(0)
    expect(a.basisrente).toHaveLength(0)
    expect(a.altersvorsorgedepot).toHaveLength(0)
  })

  it('bAV instance has correct Layer-1 fields', () => {
    const bav = buildBerndWorkspace().baseline.assumptions.bav[0]
    expect(bav.monthlyGrossConversion).toBe(200)
    expect(bav.currentValueEUR).toBe(15_000)
    expect(bav.durchfuehrungsweg).toBe('direktversicherung_3_63')
    expect(bav.payoutMode).toBe('leibrente')
    expect(bav.rentenfaktor).toBe(30)
    // Effektivkosten 0.8% → stored as wrapperAssetFee 0.008
    expect(bav.fees.wrapperAssetFee).toBeCloseTo(0.008, 4)
    expect(bav.fees.fundAssetFee).toBe(0)
  })

  it('bAV instance has empty evidenceMap (Layer 2 deferred to issue 09)', () => {
    const bav = buildBerndWorkspace().baseline.assumptions.bav[0]
    expect(bav.evidenceMap).toEqual({})
  })

  it('Riester instance has correct contractStartYear and monthlyOwnContribution', () => {
    const riester = buildBerndWorkspace().baseline.assumptions.riester[0]
    expect(riester.contractStartYear).toBe(2015)
    expect(riester.monthlyOwnContribution).toBe(100)
    expect(riester.existingCapital).toBe(8_000)
  })

  it('ETF instance has correct TER', () => {
    const etf = buildBerndWorkspace().baseline.assumptions.etf[0]
    expect(etf.annualAssetFee).toBeCloseTo(0.002, 5)
  })

  it('produces a v2 Workspace with mode: combine', () => {
    const ws = buildBerndWorkspace()
    expect(ws.schemaVersion).toBe(2)
    expect(ws.mode).toBe('combine')
  })

  it('baseline label is Mein Plan', () => {
    const ws = buildBerndWorkspace()
    expect(ws.baseline.label).toBe('Mein Plan')
  })

  it('whatIfs is empty on fresh wizard exit', () => {
    const ws = buildBerndWorkspace()
    expect(ws.whatIfs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Per-product card Layer-1 field presence (unit tests for card behaviour)
// These tests verify the data layer; the component tests would use @testing-library/react.
// ---------------------------------------------------------------------------

describe('per-product draft → instance Layer-1 fields', () => {
  it('bAV: effektivkostenPct 0 → wrapperAssetFee 0', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: makeBavDraft({ effektivkostenPct: 0 }),
      pavDraft: null, riesterDraft: null, basisrenteDraft: null,
      avdDraft: null, etfDraft: null, grossSalaryYear: 75_000,
    })
    expect(ws.baseline.assumptions.bav[0].fees.wrapperAssetFee).toBe(0)
  })

  it('pAV: pre-2005 contractStartYear sets oldContractTaxFreeEligible=true', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: null,
      pavDraft: {
        productId: 'versicherung',
        status: 'active',
        contractStartYear: 2003,
        currentValueEUR: 20_000,
        monthlyContribution: 150,
        anbieter: 'AXA',
        effektivkostenPct: 1.2,
        rentenfaktor: 28,
        payoutMode: 'leibrente',
      },
      riesterDraft: null, basisrenteDraft: null, avdDraft: null, etfDraft: null,
      grossSalaryYear: 75_000,
    })
    const ins = ws.baseline.assumptions.insurance[0]
    expect(ins.oldContractTaxFreeEligible).toBe(true)
    expect(ins.contractStartYear).toBe(2003)
  })

  it('pAV: post-2004 contractStartYear sets oldContractTaxFreeEligible=false', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: null,
      pavDraft: {
        productId: 'versicherung',
        status: 'active',
        contractStartYear: 2010,
        currentValueEUR: 5_000,
        monthlyContribution: 100,
        anbieter: undefined,
        effektivkostenPct: 0.5,
        rentenfaktor: 28,
        payoutMode: 'kapitalverzehr',
      },
      riesterDraft: null, basisrenteDraft: null, avdDraft: null, etfDraft: null,
      grossSalaryYear: 75_000,
    })
    const ins = ws.baseline.assumptions.insurance[0]
    expect(ins.oldContractTaxFreeEligible).toBe(false)
  })

  it('Basisrente: payoutMode is always leibrente (legal constraint)', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: null, pavDraft: null, riesterDraft: null,
      basisrenteDraft: {
        productId: 'basisrente',
        status: 'active',
        contractStartYear: 2022,
        currentValueEUR: 10_000,
        monthlyContribution: 300,
        anbieter: 'Rürup AG',
        effektivkostenPct: 1.4,
        rentenfaktor: 27,
      },
      avdDraft: null, etfDraft: null,
      grossSalaryYear: 120_000,
    })
    const br = ws.baseline.assumptions.basisrente[0]
    expect(br.payoutMode).toBe('leibrente')
    expect(br.monthlyGrossContribution).toBe(300)
  })

  it('AVD: useGlidepath=false sets riskAllocationPct to 1.0', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: null, pavDraft: null, riesterDraft: null, basisrenteDraft: null,
      avdDraft: {
        productId: 'altersvorsorgedepot',
        status: 'active',
        contractStartYear: 2026,
        currentValueEUR: 0,
        monthlyContribution: 200,
        anbieter: undefined,
        subtype: 'depot_no_guarantee',
        useGlidepath: false,
      },
      etfDraft: null,
      grossSalaryYear: 75_000,
    })
    const avd = ws.baseline.assumptions.altersvorsorgedepot[0]
    expect(avd.riskAllocationPct).toBe(1.0)
    expect(avd.subtype).toBe('depot_no_guarantee')
  })

  it('ETF: terPct 0.07 → annualAssetFee 0.0007', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: null, pavDraft: null, riesterDraft: null, basisrenteDraft: null,
      avdDraft: null,
      etfDraft: { ...makeEtfDraft(), terPct: 0.07 },
      grossSalaryYear: 75_000,
    })
    expect(ws.baseline.assumptions.etf[0].annualAssetFee).toBeCloseTo(0.0007, 5)
  })
})
