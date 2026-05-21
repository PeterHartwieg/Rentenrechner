/**
 * Tests for the export projection layer (#209).
 *
 * Coverage targets named in the PR 12 implementation plan:
 *   1. Compare-mode per-product after-tax row equality vs. the direct engine
 *      helpers (bAV, ETF, insurance, AVD, Riester, Basisrente NULL).
 *   2. Combine-mode multi-instance: per-instance row carries the source
 *      `instanceId` and combine `netMonthlyPayout` reads from
 *      `CombinedResult.byInstance[id].monthlyNet`.
 *   3. Transfer-event-bearing combine workspace (surrender_reinvest): the
 *      projection still produces sane after-tax values for both surrendered
 *      source and reinvest target rows (CLAUDE.md cron-dispatch §2 paired
 *      assertion).
 *   4. Basisrente null-after-tax invariant (capital payout legally prohibited).
 *   5. Combine-without-tax-modes: `afterTaxBalance` is null (no throw) when
 *      `perInstanceTaxModes` is undefined or missing for an instance.
 */

import { describe, it, expect } from 'vitest'
import { afterTaxBavLumpSum } from './bavPayout'
import { afterTaxCertifiedPensionLumpSum } from './certifiedPensionPayout'
import { afterTaxInvestmentCapital } from './etfPayout'
import { afterTaxInsuranceLumpSum } from './insurancePayout'
import {
  buildCombineExportProjection,
  buildCompareExportProjection,
  type InstanceTaxModes,
} from './exportProjection'
import type { CombinedResult } from './portfolioCombine'
import { defaultProfile } from '../data/defaultScenario'
import type { EtfProductResult, ProductResult, YearlyProjection } from '../domain'
import { de2026Rules } from '../rules/de2026'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_YEARLY_ROW: YearlyProjection = {
  year: 20,
  age: 60,
  productId: 'etf',
  scenarioId: 'basis',
  balance: 50_000,
  realBalance: 40_000,
  yearlyUserCost: 1200,
  yearlyProductContribution: 1200,
  yearlyEmployerContribution: 0,
  yearlyFees: 60,
  cumulativeFees: 600,
  cumulativeProductContributions: 24_000,
  cumulativeVorabpauschale: 100,
}

const BASE_PRODUCT: ProductResult = {
  productId: 'etf',
  label: 'ETF',
  scenarioId: 'basis',
  scenarioLabel: 'Basis',
  annualReturn: 0.06,
  monthlyUserCost: 200,
  monthlyProductContribution: 200,
  monthlyEmployerContribution: 0,
  totalUserCost: 48_000,
  totalProductContributions: 48_000,
  totalEmployerContributions: 0,
  totalFees: 1000,
  capitalAtRetirement: 120_000,
  realCapitalAtRetirement: 90_000,
  afterTaxLumpSum: 110_000,
  grossMonthlyPayout: 500,
  netMonthlyPayout: 450,
  taxAndSvSavings: 0,
  valueMultipleOnUserCost: 2.5,
  capitalMultipleAnnualized: 1.05,
  accumulationRiy: 0.008,
  inputConfidence: 'model_estimate',
  rows: [],
  etfPayoutRows: [],
} as unknown as ProductResult

function makeProductWithRow(
  productId: ProductResult['productId'],
  label: string,
  row: YearlyProjection = BASE_YEARLY_ROW,
): ProductResult {
  return {
    ...BASE_PRODUCT,
    productId,
    label,
    rows: [{ ...row, productId }],
  } as unknown as ProductResult
}

const COMPARE_BASE_OPTS = {
  bavAnnualTaxSvSavings: 0,
  bavProfile: defaultProfile,
  bavKvdrMember: true,
  bavOtherAnnualIncome: 0,
  insuranceTaxMode: 'halbeinkuenfte' as const,
  equityPartialExemption: 0.3,
  insuranceOtherAnnualIncome: 0,
  rules: de2026Rules,
}

// ---------------------------------------------------------------------------
// 1. Compare-mode per-product after-tax row equality vs. direct engine call.
// ---------------------------------------------------------------------------

describe('buildCompareExportProjection — per-product after-tax row equality', () => {
  it('bAV row matches afterTaxBavLumpSum(balance, profile, rules, otherIncome, kvdr)', () => {
    const product = makeProductWithRow('bav', 'bAV')
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [product],
    })
    expect(projection.yearly).toHaveLength(1)
    const directly = afterTaxBavLumpSum(
      BASE_YEARLY_ROW.balance,
      defaultProfile,
      de2026Rules,
      0,
      true,
    )
    expect(projection.yearly[0].afterTaxBalance).toBe(directly)
  })

  it('ETF row matches afterTaxInvestmentCapital(balance, costBasis, rules, equityExemption, Vorabpauschale)', () => {
    const product = makeProductWithRow('etf', 'ETF')
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [product],
    })
    expect(projection.yearly).toHaveLength(1)
    const directly = afterTaxInvestmentCapital(
      BASE_YEARLY_ROW.balance,
      BASE_YEARLY_ROW.cumulativeProductContributions,
      de2026Rules,
      COMPARE_BASE_OPTS.equityPartialExemption,
      BASE_YEARLY_ROW.cumulativeVorabpauschale,
    )
    expect(projection.yearly[0].afterTaxBalance).toBe(directly)
  })

  it('Versicherung row matches afterTaxInsuranceLumpSum(balance, costBasis, taxMode, rules, otherIncome)', () => {
    const product = makeProductWithRow('versicherung', 'Versicherung')
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [product],
    })
    expect(projection.yearly).toHaveLength(1)
    const directly = afterTaxInsuranceLumpSum(
      BASE_YEARLY_ROW.balance,
      BASE_YEARLY_ROW.cumulativeProductContributions,
      COMPARE_BASE_OPTS.insuranceTaxMode,
      de2026Rules,
      0,
    )
    expect(projection.yearly[0].afterTaxBalance).toBe(directly)
  })

  it('AVD row matches afterTaxCertifiedPensionLumpSum(balance, rules, avdOtherAnnualIncome)', () => {
    const product = makeProductWithRow('altersvorsorgedepot', 'AVD')
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [product],
      avdOtherAnnualIncome: 12_000,
    })
    expect(projection.yearly).toHaveLength(1)
    const directly = afterTaxCertifiedPensionLumpSum(
      BASE_YEARLY_ROW.balance,
      de2026Rules,
      12_000,
    )
    expect(projection.yearly[0].afterTaxBalance).toBe(directly)
  })

  it('Riester row matches afterTaxCertifiedPensionLumpSum(balance, rules, riesterOtherAnnualIncome)', () => {
    const product = makeProductWithRow('riester', 'Riester')
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [product],
      riesterOtherAnnualIncome: 6_000,
    })
    expect(projection.yearly).toHaveLength(1)
    const directly = afterTaxCertifiedPensionLumpSum(
      BASE_YEARLY_ROW.balance,
      de2026Rules,
      6_000,
    )
    expect(projection.yearly[0].afterTaxBalance).toBe(directly)
  })

  it('Basisrente row emits null afterTaxBalance (capital payout legally prohibited)', () => {
    const product = makeProductWithRow('basisrente', 'Basisrente')
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [product],
    })
    expect(projection.yearly).toHaveLength(1)
    expect(projection.yearly[0].afterTaxBalance).toBeNull()
    expect(projection.yearly[0].realAfterTaxBalance).toBeNull()
  })

  it('Real-after-tax tracks the real-to-nominal ratio when after-tax is set', () => {
    const product = makeProductWithRow('etf', 'ETF')
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [product],
    })
    const row = projection.yearly[0]
    expect(row.afterTaxBalance).not.toBeNull()
    expect(row.realAfterTaxBalance).not.toBeNull()
    const expected =
      row.afterTaxBalance! * (BASE_YEARLY_ROW.realBalance / BASE_YEARLY_ROW.balance)
    expect(row.realAfterTaxBalance).toBeCloseTo(expected, 6)
  })

  it('annualTaxSvSavings is the bAV-only field; 0 for other products in compare-mode', () => {
    const bav = makeProductWithRow('bav', 'bAV')
    const etf = makeProductWithRow('etf', 'ETF')
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [bav, etf],
      bavAnnualTaxSvSavings: 750,
    })
    expect(projection.yearly).toHaveLength(2)
    const bavRow = projection.yearly.find((r) => r.productId === 'bav')
    const etfRow = projection.yearly.find((r) => r.productId === 'etf')
    expect(bavRow?.annualTaxSvSavings).toBe(750)
    expect(etfRow?.annualTaxSvSavings).toBe(0)
  })

  it('summary row carries inputConfidence, value-multiple, and instanceId is undefined in compare', () => {
    const product = makeProductWithRow('etf', 'ETF')
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [product],
    })
    expect(projection.summary).toHaveLength(1)
    expect(projection.summary[0].instanceId).toBeUndefined()
    expect(projection.summary[0].inputConfidence).toBe('model_estimate')
    expect(projection.summary[0].valueMultipleOnUserCost).toBe(2.5)
  })

  it('ETF payout rows surface in etfPayouts (instanceId undefined in compare)', () => {
    const product: EtfProductResult = {
      ...BASE_PRODUCT,
      productId: 'etf',
      label: 'ETF',
      rows: [{ ...BASE_YEARLY_ROW, productId: 'etf' }],
      etfPayoutRows: [
        {
          year: 1,
          age: 67,
          capitalAtStart: 120_000,
          grossAnnualPayout: 6000,
          taxableGain: 3000,
          saverAllowanceUsed: 1000,
          taxDue: 500,
          netAnnualPayout: 5500,
          netMonthlyPayout: 458.33,
          capitalAtEnd: 114_000,
          remainingCostBasis: 60_000,
        },
      ],
    } as unknown as EtfProductResult
    const projection = buildCompareExportProjection({
      ...COMPARE_BASE_OPTS,
      products: [product],
    })
    expect(projection.etfPayouts).toHaveLength(1)
    expect(projection.etfPayouts[0].instanceId).toBeUndefined()
    expect(projection.etfPayouts[0].age).toBe(67)
    expect(projection.etfPayouts[0].capitalAtStart).toBe(120_000)
  })
})

// ---------------------------------------------------------------------------
// 2. Combine-mode multi-instance: byInstance.monthlyNet + instanceId tagging.
// ---------------------------------------------------------------------------

describe('buildCombineExportProjection — multi-instance byInstance and instanceId', () => {
  // Two-instance fixture: one bAV instance + one ETF instance.
  // The bAV instance's per-instance netMonthlyPayout (400) differs from the
  // aggregate-allocated value in byInstance.monthlyNet (350) to verify the
  // projection reads the aggregate value (CLAUDE.md retirement-tax invariant).
  const BAV_PER_INSTANCE_NET = 400
  const BAV_AGGREGATE_NET = 350
  const ETF_PER_INSTANCE_NET = 450

  const bavResult: ProductResult = {
    ...BASE_PRODUCT,
    productId: 'bav',
    label: 'bAV Hauptvertrag',
    instanceId: 'bav-1',
    netMonthlyPayout: BAV_PER_INSTANCE_NET,
    rows: [{ ...BASE_YEARLY_ROW, productId: 'bav' }],
  } as unknown as ProductResult

  const etfResult: ProductResult = {
    ...BASE_PRODUCT,
    productId: 'etf',
    label: 'ETF Depot',
    instanceId: 'etf-1',
    netMonthlyPayout: ETF_PER_INSTANCE_NET,
    rows: [{ ...BASE_YEARLY_ROW, productId: 'etf' }],
  } as unknown as ProductResult

  const combined: CombinedResult = {
    monthlyNetIncome: BAV_AGGREGATE_NET + ETF_PER_INSTANCE_NET + 1100,
    monthlyGrossPayouts: {
      statutoryPension: 1200,
      bav: 500,
      privateInsurance: 0,
      basisrente: 0,
      altersvorsorgedepot: 0,
      riester: 0,
      etf: 500,
    },
    aggregateTax: { totalTaxAnnual: 0 } as unknown as CombinedResult['aggregateTax'],
    aggregateKvPv: {} as unknown as CombinedResult['aggregateKvPv'],
    byInstance: {
      'bav-1': {
        instanceId: 'bav-1',
        productId: 'bav',
        monthlyGross: 500,
        monthlyNet: BAV_AGGREGATE_NET,
        taxShareAnnual: 600,
        kvPvShare: 50,
      },
      'etf-1': {
        instanceId: 'etf-1',
        productId: 'etf',
        monthlyGross: 500,
        monthlyNet: ETF_PER_INSTANCE_NET,
        taxShareAnnual: 600,
        kvPvShare: 0,
      },
    },
    statutoryPensionMonthlyNet: 1100,
    notes: [],
  }

  const baseOpts = {
    perInstance: {
      'bav-1': [bavResult],
      'etf-1': [etfResult],
    },
    combinedByScenarioId: { basis: combined },
    scenarioLabels: { basis: 'Basis' },
  }

  it('summary rows carry the source instanceId for each instance', () => {
    const projection = buildCombineExportProjection(baseOpts)
    expect(projection.summary).toHaveLength(2)
    const ids = projection.summary.map((r) => r.instanceId).sort()
    expect(ids).toEqual(['bav-1', 'etf-1'])
  })

  it('netMonthlyPayout reads from byInstance.monthlyNet (not r.netMonthlyPayout)', () => {
    const projection = buildCombineExportProjection(baseOpts)
    const bavRow = projection.summary.find((r) => r.instanceId === 'bav-1')
    expect(bavRow).toBeDefined()
    expect(bavRow!.netMonthlyPayout).toBe(BAV_AGGREGATE_NET)
    expect(bavRow!.netMonthlyPayout).not.toBe(BAV_PER_INSTANCE_NET)
  })

  it('falls back to r.netMonthlyPayout when byInstance has no entry for the instance', () => {
    const combinedEmptyByInstance: CombinedResult = {
      ...combined,
      byInstance: {},
    }
    const projection = buildCombineExportProjection({
      ...baseOpts,
      combinedByScenarioId: { basis: combinedEmptyByInstance },
    })
    const bavRow = projection.summary.find((r) => r.instanceId === 'bav-1')
    expect(bavRow!.netMonthlyPayout).toBe(BAV_PER_INSTANCE_NET)
  })

  it('summary rows are sorted by instanceId for stable output', () => {
    const projection = buildCombineExportProjection(baseOpts)
    const ids = projection.summary.map((r) => r.instanceId)
    expect(ids).toEqual([...ids].sort())
  })

  it('yearly rows tag each row with the source instanceId', () => {
    const projection = buildCombineExportProjection(baseOpts)
    expect(projection.yearly).toHaveLength(2)
    const ids = projection.yearly.map((r) => r.instanceId).sort()
    expect(ids).toEqual(['bav-1', 'etf-1'])
  })

  it('combine yearly rows emit null annualTaxSvSavings (column not exported in combine)', () => {
    const projection = buildCombineExportProjection(baseOpts)
    for (const row of projection.yearly) {
      expect(row.annualTaxSvSavings).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Transfer-event-bearing combine case (surrender_reinvest).
// ---------------------------------------------------------------------------

describe('buildCombineExportProjection — transfer-event (surrender_reinvest) case', () => {
  // A surrender_reinvest event in production produces two ProductResults that
  // share a scenario but represent the surrendered source contract and the
  // reinvest target ETF instance. The projection must surface sane after-tax
  // values for both, with the correct per-instance tax modes.
  const surrenderedInsurance: ProductResult = {
    ...BASE_PRODUCT,
    productId: 'versicherung',
    label: 'Versicherung (gekündigt)',
    instanceId: 'ins-surrendered',
    rows: [{ ...BASE_YEARLY_ROW, productId: 'versicherung', balance: 30_000, realBalance: 24_000 }],
  } as unknown as ProductResult

  const reinvestEtf: ProductResult = {
    ...BASE_PRODUCT,
    productId: 'etf',
    label: 'ETF (Reinvest Empfänger)',
    instanceId: 'etf-reinvest',
    rows: [{ ...BASE_YEARLY_ROW, productId: 'etf', balance: 35_000, realBalance: 28_000 }],
  } as unknown as ProductResult

  const combined: CombinedResult = {
    monthlyNetIncome: 1500,
    monthlyGrossPayouts: {
      statutoryPension: 1100,
      bav: 0,
      privateInsurance: 0,
      basisrente: 0,
      altersvorsorgedepot: 0,
      riester: 0,
      etf: 500,
    },
    aggregateTax: { totalTaxAnnual: 0 } as unknown as CombinedResult['aggregateTax'],
    aggregateKvPv: {} as unknown as CombinedResult['aggregateKvPv'],
    byInstance: {
      'ins-surrendered': {
        instanceId: 'ins-surrendered',
        productId: 'versicherung',
        monthlyGross: 0,
        monthlyNet: 0,
        taxShareAnnual: 0,
        kvPvShare: 0,
      },
      'etf-reinvest': {
        instanceId: 'etf-reinvest',
        productId: 'etf',
        monthlyGross: 500,
        monthlyNet: 420,
        taxShareAnnual: 0,
        kvPvShare: 0,
      },
    },
    statutoryPensionMonthlyNet: 1100,
    notes: [],
  }

  it('produces sane after-tax balances for both source and reinvest target', () => {
    const taxModes: Record<string, InstanceTaxModes> = {
      'ins-surrendered': { insuranceTaxMode: 'halbeinkuenfte' },
      'etf-reinvest': { equityPartialExemption: 0.3 },
    }
    const projection = buildCombineExportProjection({
      perInstance: {
        'ins-surrendered': [surrenderedInsurance],
        'etf-reinvest': [reinvestEtf],
      },
      combinedByScenarioId: { basis: combined },
      scenarioLabels: { basis: 'Basis' },
      perInstanceTaxModes: taxModes,
      rules: de2026Rules,
      profile: defaultProfile,
    })
    expect(projection.yearly).toHaveLength(2)
    for (const row of projection.yearly) {
      expect(row.afterTaxBalance).not.toBeNull()
      expect(row.afterTaxBalance).toBeGreaterThan(0)
      // Tax is deducted, so after-tax must be strictly less than gross balance
      // for the source contract (gain present); for the reinvest target the
      // basis is large enough that after-tax may equal balance — we only
      // assert ≤ here.
      expect(row.afterTaxBalance).toBeLessThanOrEqual(row.balance)
    }
  })

  it('reinvest ETF instance routes through afterTaxInvestmentCapital with its equity exemption', () => {
    const projection = buildCombineExportProjection({
      perInstance: { 'etf-reinvest': [reinvestEtf] },
      combinedByScenarioId: { basis: combined },
      scenarioLabels: { basis: 'Basis' },
      perInstanceTaxModes: { 'etf-reinvest': { equityPartialExemption: 0.3 } },
      rules: de2026Rules,
    })
    const row = projection.yearly[0]
    const directly = afterTaxInvestmentCapital(
      row.balance,
      BASE_YEARLY_ROW.cumulativeProductContributions,
      de2026Rules,
      0.3,
      BASE_YEARLY_ROW.cumulativeVorabpauschale,
    )
    expect(row.afterTaxBalance).toBe(directly)
  })
})

// ---------------------------------------------------------------------------
// 4. Basisrente null-after-tax invariant in combine-mode.
// ---------------------------------------------------------------------------

describe('buildCombineExportProjection — Basisrente null-after-tax invariant', () => {
  it('Basisrente instance emits null afterTaxBalance even with rules + tax modes supplied', () => {
    const basisrente = makeProductWithRow('basisrente', 'Basisrente')
    const projection = buildCombineExportProjection({
      perInstance: { 'br-1': [{ ...basisrente, instanceId: 'br-1' } as ProductResult] },
      combinedByScenarioId: {
        basis: {
          monthlyNetIncome: 100,
          monthlyGrossPayouts: {
            statutoryPension: 0,
            bav: 0,
            privateInsurance: 0,
            basisrente: 100,
            altersvorsorgedepot: 0,
            riester: 0,
            etf: 0,
          },
          aggregateTax: { totalTaxAnnual: 0 } as unknown as CombinedResult['aggregateTax'],
          aggregateKvPv: {} as unknown as CombinedResult['aggregateKvPv'],
          byInstance: {},
          statutoryPensionMonthlyNet: 0,
          notes: [],
        },
      },
      scenarioLabels: { basis: 'Basis' },
      perInstanceTaxModes: { 'br-1': {} },
      rules: de2026Rules,
      profile: defaultProfile,
    })
    expect(projection.yearly).toHaveLength(1)
    expect(projection.yearly[0].afterTaxBalance).toBeNull()
    expect(projection.yearly[0].realAfterTaxBalance).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. Combine-without-tax-modes: afterTaxBalance null, no throw.
// ---------------------------------------------------------------------------

describe('buildCombineExportProjection — without per-instance tax modes', () => {
  const bav = makeProductWithRow('bav', 'bAV')
  const bavWithId = { ...bav, instanceId: 'bav-1' } as ProductResult

  const combined: CombinedResult = {
    monthlyNetIncome: 1000,
    monthlyGrossPayouts: {
      statutoryPension: 500,
      bav: 500,
      privateInsurance: 0,
      basisrente: 0,
      altersvorsorgedepot: 0,
      riester: 0,
      etf: 0,
    },
    aggregateTax: { totalTaxAnnual: 0 } as unknown as CombinedResult['aggregateTax'],
    aggregateKvPv: {} as unknown as CombinedResult['aggregateKvPv'],
    byInstance: {},
    statutoryPensionMonthlyNet: 500,
    notes: [],
  }

  it('afterTaxBalance is null when perInstanceTaxModes is omitted entirely', () => {
    const projection = buildCombineExportProjection({
      perInstance: { 'bav-1': [bavWithId] },
      combinedByScenarioId: { basis: combined },
      scenarioLabels: { basis: 'Basis' },
      // No perInstanceTaxModes
      rules: de2026Rules,
      profile: defaultProfile,
    })
    expect(projection.yearly).toHaveLength(1)
    expect(projection.yearly[0].afterTaxBalance).toBeNull()
    expect(projection.yearly[0].realAfterTaxBalance).toBeNull()
  })

  it('afterTaxBalance is null when perInstanceTaxModes is provided but missing for this instance', () => {
    const projection = buildCombineExportProjection({
      perInstance: { 'bav-1': [bavWithId] },
      combinedByScenarioId: { basis: combined },
      scenarioLabels: { basis: 'Basis' },
      perInstanceTaxModes: { 'other-id': { equityPartialExemption: 0.3 } },
      rules: de2026Rules,
      profile: defaultProfile,
    })
    expect(projection.yearly).toHaveLength(1)
    expect(projection.yearly[0].afterTaxBalance).toBeNull()
  })

  it('afterTaxBalance is null when rules are omitted', () => {
    const projection = buildCombineExportProjection({
      perInstance: { 'bav-1': [bavWithId] },
      combinedByScenarioId: { basis: combined },
      scenarioLabels: { basis: 'Basis' },
      perInstanceTaxModes: { 'bav-1': { bavTaxMode: 'fuenftelregelung' } },
      // No rules
      profile: defaultProfile,
    })
    expect(projection.yearly).toHaveLength(1)
    expect(projection.yearly[0].afterTaxBalance).toBeNull()
  })

  it('bAV afterTaxBalance is null when profile is omitted (combine path requires profile for bAV)', () => {
    const projection = buildCombineExportProjection({
      perInstance: { 'bav-1': [bavWithId] },
      combinedByScenarioId: { basis: combined },
      scenarioLabels: { basis: 'Basis' },
      perInstanceTaxModes: { 'bav-1': { bavTaxMode: 'fuenftelregelung' } },
      rules: de2026Rules,
      // No profile — bAV branch needs profile, must short-circuit to null
      // rather than throw.
    })
    expect(projection.yearly).toHaveLength(1)
    expect(projection.yearly[0].afterTaxBalance).toBeNull()
  })
})
