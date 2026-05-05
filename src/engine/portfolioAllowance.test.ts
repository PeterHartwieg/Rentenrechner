/**
 * Tests for portfolioAllowance.ts (architecture-readability issue 06).
 *
 * Coverage:
 *   1. calculateEtfAllowanceDemand — zero demand when no VP and no payout rows.
 *   2. calculateEtfAllowanceDemand — accumulation phase VP delta-decoded correctly.
 *   3. calculateEtfAllowanceDemand — payout phase taxable gain mapped to correct year.
 *   4. calculateEtfAllowanceDemand — partial exemption applied to both phases.
 *   5. apportionSparerpauschbetrag — single instance, demand below allowance → gets demand.
 *   6. apportionSparerpauschbetrag — two instances, demand below allowance → each gets demand.
 *   7. apportionSparerpauschbetrag — two instances, demand above allowance → proportional.
 *   8. apportionSparerpauschbetrag — zero demand year → zero allocation.
 *   9. applyCrossInstanceSparerpauschbetrag — single ETF instance skips re-run.
 *  10. applyCrossInstanceSparerpauschbetrag — surrendered/offered instances excluded.
 *  11. applyCrossInstanceSparerpauschbetrag — two active ETF instances trigger re-run; combined
 *      saverAllowanceUsed per payout year ≤ single allowance (€1 000).
 */

import { describe, expect, it } from 'vitest'
import {
  calculateEtfAllowanceDemand,
  apportionSparerpauschbetrag,
} from './portfolioAllowance'
import { de2026Rules } from '../rules/de2026'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import { simulatePortfolio } from './portfolioAdapter'
import type { EtfInstance } from '../domain/instances'
import type { EtfProductResult } from '../domain/results'
import type { Workspace } from '../domain/workspace'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseWorkspace(): Workspace {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
}

/** Minimal EtfProductResult stub with only the fields that calculateEtfAllowanceDemand reads. */
function makeEtfResultStub(
  rows: { year: number; cumulativeVorabpauschale: number }[],
  etfPayoutRows: { year: number; taxableGain: number }[],
): EtfProductResult {
  return {
    productId: 'etf',
    label: 'ETF',
    scenarioId: 'base',
    scenarioLabel: 'Base',
    annualReturn: 0.05,
    monthlyUserCost: 100,
    monthlyProductContribution: 100,
    monthlyEmployerContribution: 0,
    totalUserCost: 12000,
    totalProductContributions: 12000,
    totalEmployerContributions: 0,
    totalFees: 0,
    capitalAtRetirement: 100000,
    realCapitalAtRetirement: 80000,
    afterTaxLumpSum: 95000,
    grossMonthlyPayout: 500,
    netMonthlyPayout: 450,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: null,
    capitalMultipleAnnualized: 1.05,
    accumulationRiy: 0.002,
    rows: rows.map(r => ({
      year: r.year,
      age: 30 + r.year,
      productId: 'etf',
      scenarioId: 'base',
      balance: 0,
      realBalance: 0,
      yearlyUserCost: 0,
      yearlyProductContribution: 0,
      yearlyEmployerContribution: 0,
      yearlyFees: 0,
      cumulativeFees: 0,
      cumulativeProductContributions: 0,
      cumulativeVorabpauschale: r.cumulativeVorabpauschale,
    })),
    etfPayoutRows: etfPayoutRows.map(r => ({
      year: r.year,
      age: 65 + r.year - 1,
      capitalAtStart: 50000,
      grossAnnualPayout: 3000,
      taxableGain: r.taxableGain,
      saverAllowanceUsed: 0,
      taxDue: 0,
      netAnnualPayout: 3000,
      netMonthlyPayout: 250,
      capitalAtEnd: 48000,
      remainingCostBasis: 20000,
    })),
  } as unknown as EtfProductResult
}

// ---------------------------------------------------------------------------
// 1. calculateEtfAllowanceDemand — zero demand baseline
// ---------------------------------------------------------------------------

describe('calculateEtfAllowanceDemand', () => {
  it('returns all-zero array when no VP and no payout rows', () => {
    const result = makeEtfResultStub([], [])
    const demand = calculateEtfAllowanceDemand(result, 0.3, 30, 5)
    expect(demand).toHaveLength(5)
    expect(demand.every(d => d === 0)).toBe(true)
  })

  // 2. accumulation phase VP delta-decoded
  it('accumulation phase: delta-decodes cumulativeVorabpauschale into per-year demand', () => {
    // Years 1–3 accumulation: cumulative VP grows 200, 500, 700
    // → per-year deltas: 200, 300, 200
    const result = makeEtfResultStub(
      [
        { year: 1, cumulativeVorabpauschale: 200 },
        { year: 2, cumulativeVorabpauschale: 500 },
        { year: 3, cumulativeVorabpauschale: 700 },
      ],
      [],
    )
    const partialExemption = 0  // no exemption for clarity
    const demand = calculateEtfAllowanceDemand(result, partialExemption, 3, 3)
    expect(demand[0]).toBeCloseTo(200)
    expect(demand[1]).toBeCloseTo(300)
    expect(demand[2]).toBeCloseTo(200)
  })

  // 3. payout phase year mapping
  it('payout phase: maps retirement payout row to contract year = yearsToRetirement + (row.year - 1)', () => {
    // yearsToRetirement = 2, totalYears = 5
    // payout row year 1 → contract year 2 + 0 = 2 (0-based idx 2)
    // payout row year 2 → contract year 2 + 1 = 3 (0-based idx 3)
    const result = makeEtfResultStub(
      [],
      [
        { year: 1, taxableGain: 600 },
        { year: 2, taxableGain: 800 },
      ],
    )
    const partialExemption = 0
    const demand = calculateEtfAllowanceDemand(result, partialExemption, 2, 5)
    expect(demand[0]).toBe(0)
    expect(demand[1]).toBe(0)
    expect(demand[2]).toBeCloseTo(600)
    expect(demand[3]).toBeCloseTo(800)
    expect(demand[4]).toBe(0)
  })

  // 4. partial exemption applied
  it('applies partial exemption (0.3) to both accumulation VP and payout taxable gain', () => {
    const result = makeEtfResultStub(
      [{ year: 1, cumulativeVorabpauschale: 1000 }],
      [{ year: 1, taxableGain: 2000 }],
    )
    // yearsToRetirement = 1, totalYears = 2
    // accumulation idx 0: 1000 × (1 − 0.3) = 700
    // payout row year 1 → idx 1 + 0 = 1: 2000 × (1 − 0.3) = 1400
    const demand = calculateEtfAllowanceDemand(result, 0.3, 1, 2)
    expect(demand[0]).toBeCloseTo(700)
    expect(demand[1]).toBeCloseTo(1400)
  })
})

// ---------------------------------------------------------------------------
// 5–8. apportionSparerpauschbetrag
// ---------------------------------------------------------------------------

describe('apportionSparerpauschbetrag', () => {
  const FULL_ALLOWANCE = 1000

  // 5. Single instance, demand below allowance
  it('single instance below allowance: gets exactly its demand', () => {
    const demandByInstance = new Map([['inst-a', [300, 400]]])
    const alloc = apportionSparerpauschbetrag(demandByInstance, FULL_ALLOWANCE, 2)
    expect(alloc.get('inst-a')![0]).toBeCloseTo(300)
    expect(alloc.get('inst-a')![1]).toBeCloseTo(400)
  })

  // 6. Two instances, combined demand below allowance
  it('two instances combined demand below allowance: each gets its demand', () => {
    const demandByInstance = new Map([
      ['inst-a', [300, 200]],
      ['inst-b', [400, 350]],
    ])
    const alloc = apportionSparerpauschbetrag(demandByInstance, FULL_ALLOWANCE, 2)
    // Year 0: total = 700 ≤ 1000 → each gets full demand
    expect(alloc.get('inst-a')![0]).toBeCloseTo(300)
    expect(alloc.get('inst-b')![0]).toBeCloseTo(400)
    // Year 1: total = 550 ≤ 1000 → each gets full demand
    expect(alloc.get('inst-a')![1]).toBeCloseTo(200)
    expect(alloc.get('inst-b')![1]).toBeCloseTo(350)
  })

  // 7. Two instances, demand above allowance → proportional
  it('two instances demand above allowance: proportional allocation summing to fullAllowance', () => {
    // inst-a demands 600, inst-b demands 800 → total 1400 > 1000
    // inst-a gets 1000 × (600/1400) ≈ 428.57
    // inst-b gets 1000 × (800/1400) ≈ 571.43
    const demandByInstance = new Map([
      ['inst-a', [600]],
      ['inst-b', [800]],
    ])
    const alloc = apportionSparerpauschbetrag(demandByInstance, FULL_ALLOWANCE, 1)
    const aAlloc = alloc.get('inst-a')![0]
    const bAlloc = alloc.get('inst-b')![0]
    expect(aAlloc + bAlloc).toBeCloseTo(FULL_ALLOWANCE, 6)
    expect(aAlloc / bAlloc).toBeCloseTo(600 / 800, 6)
  })

  // 8. Zero demand year
  it('zero demand year: all instances get zero allocation', () => {
    const demandByInstance = new Map([
      ['inst-a', [0, 500]],
      ['inst-b', [0, 600]],
    ])
    const alloc = apportionSparerpauschbetrag(demandByInstance, FULL_ALLOWANCE, 2)
    expect(alloc.get('inst-a')![0]).toBe(0)
    expect(alloc.get('inst-b')![0]).toBe(0)
    // Year 1: total = 1100 > 1000 → proportional
    const aAlloc1 = alloc.get('inst-a')![1]
    const bAlloc1 = alloc.get('inst-b')![1]
    expect(aAlloc1 + bAlloc1).toBeCloseTo(FULL_ALLOWANCE, 6)
  })
})

// ---------------------------------------------------------------------------
// 9–11. applyCrossInstanceSparerpauschbetrag (via simulatePortfolio integration)
// ---------------------------------------------------------------------------

describe('applyCrossInstanceSparerpauschbetrag', () => {
  // 9. Single ETF instance: re-run skipped (length < 2 active)
  it('single active ETF instance: result unchanged (re-run skipped)', () => {
    const workspace = makeBaseWorkspace()
    const etfBase = workspace.baseline.assumptions.etf[0]
    const etfA: EtfInstance = {
      ...etfBase,
      instanceId: 'etf-solo',
      label: 'ETF Solo',
      monthlyContribution: 300,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: { ...workspace.baseline.assumptions, etf: [etfA] },
      },
    }
    // simulatePortfolio should complete without errors — the single-instance path
    // is a no-op for the cross-instance allowance step.
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const results = perInstance['etf-solo']
    expect(results).toBeDefined()
    expect(results.length).toBeGreaterThan(0)
  })

  // 10. Surrendered/offered ETF instances excluded
  it('surrendered and offered ETF instances excluded from cross-instance re-run', () => {
    const workspace = makeBaseWorkspace()
    const etfBase = workspace.baseline.assumptions.etf[0]
    const etfActive: EtfInstance = {
      ...etfBase,
      instanceId: 'etf-active',
      label: 'ETF Active',
      monthlyContribution: 300,
      status: 'active',
    }
    const etfSurrendered: EtfInstance = {
      ...etfBase,
      instanceId: 'etf-surrendered',
      label: 'ETF Surrendered',
      monthlyContribution: 300,
      status: 'surrendered',
    }
    const etfOffered: EtfInstance = {
      ...etfBase,
      instanceId: 'etf-offered',
      label: 'ETF Offered',
      monthlyContribution: 300,
      status: 'offered',
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          etf: [etfActive, etfSurrendered, etfOffered],
        },
      },
    }
    // Only one active instance → re-run skipped. No errors expected.
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    // Active instance has results; surrendered/offered have none.
    expect(perInstance['etf-active']).toBeDefined()
    expect(perInstance['etf-surrendered']).toBeUndefined()
    expect(perInstance['etf-offered']).toBeUndefined()
  })

  // 11. Two active ETF instances: combined saverAllowanceUsed ≤ €1 000 per year
  it('two large ETF instances: combined saverAllowanceUsed in each payout year ≤ single allowance (€1 000)', () => {
    const workspace = makeBaseWorkspace()
    const etfBase = workspace.baseline.assumptions.etf[0]
    // Large enough contributions that each instance alone would exceed the €1 000 allowance.
    const etfA: EtfInstance = {
      ...etfBase,
      instanceId: 'etf-a',
      label: 'ETF A',
      monthlyContribution: 800,
    }
    const etfB: EtfInstance = {
      ...etfBase,
      instanceId: 'etf-b',
      label: 'ETF B',
      monthlyContribution: 800,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: { ...workspace.baseline.assumptions, etf: [etfA, etfB] },
      },
    }
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const scenarioId = ws.baseline.assumptions.returnScenarios[0].id
    const aResult = perInstance['etf-a'].find(r => r.scenarioId === scenarioId)
    const bResult = perInstance['etf-b'].find(r => r.scenarioId === scenarioId)
    expect(aResult).toBeDefined()
    expect(bResult).toBeDefined()
    if (aResult?.productId !== 'etf' || bResult?.productId !== 'etf') {
      throw new Error('expected ETF product type')
    }

    const SINGLE_ALLOWANCE = de2026Rules.capitalGains.saverAllowance  // €1 000
    const aRows = (aResult as EtfProductResult).etfPayoutRows
    const bRows = (bResult as EtfProductResult).etfPayoutRows
    const commonLen = Math.min(aRows.length, bRows.length)
    expect(commonLen).toBeGreaterThan(0)

    for (let i = 0; i < commonLen; i++) {
      const combined = aRows[i].saverAllowanceUsed + bRows[i].saverAllowanceUsed
      // Allow a tiny floating-point tolerance.
      expect(combined).toBeLessThanOrEqual(SINGLE_ALLOWANCE + 0.01)
    }

    // At least one year where the combined demand exceeds the allowance (binding).
    const partialExemption = etfBase.equityPartialExemption
    const hasBindingYear = aRows.some((aRow, i) => {
      if (i >= bRows.length) return false
      const bRow = bRows[i]
      const combinedDemand =
        aRow.taxableGain * (1 - partialExemption) +
        bRow.taxableGain * (1 - partialExemption)
      return combinedDemand > SINGLE_ALLOWANCE
    })
    expect(hasBindingYear).toBe(true)
  })
})
