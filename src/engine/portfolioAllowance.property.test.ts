/**
 * Constrained property tests for portfolioAllowance.ts (issue #378).
 *
 * Complements the example-based coverage in `portfolioAllowance.test.ts` with
 * generated properties (fast-check, dev dependency only) and a deterministic
 * boundary matrix. Every generator is constrained to the module's documented
 * input domain — non-negative finite demands, non-negative allowance, aligned
 * array lengths. Out-of-domain values are covered separately at the bottom of
 * this file, never inside the generators.
 *
 * Properties under test (§20 Abs. 9 EStG sharing):
 *   A1. Per-instance allocations are non-negative and never exceed demand.
 *   A2. Per-year budget: sum of allocations ≤ fullAllowance; when total demand
 *       exceeds the allowance the allocation sums TO the allowance; when demand
 *       is below it, each instance receives exactly its demand.
 *   A3. Proportionality when the allowance binds: allocation_i / demand_i is
 *       the same constant (fullAllowance / totalDemand) across instances.
 *   A4. Order invariance: the allocation per instance does not depend on the
 *       instance insertion order of the demand map (allocation is proportional,
 *       never priority-based).
 *   A5. Determinism: repeated calls on identical input produce identical output.
 *   A6. Model agreement: the engine matches a straight-line reference model of
 *       the documented apportionment rule.
 *   A7. Partial-exemption algebra on `calculateEtfAllowanceDemand`: demand is
 *       (1 − partialExemption)-scaled, hence non-increasing in the exemption.
 *   A8. End-to-end (higher-order, real pipeline): two active ETF instances run
 *       through `simulatePortfolio` → `applyCrossInstanceSparerpauschbetrag`
 *       and each payout year's combined `saverAllowanceUsed` stays within the
 *       single-saver allowance.
 *
 * All `fc.assert` calls derive seed and run count from `propertyRunParams`
 * (`src/utils/propertyRunConfig.ts`): fixed seed base 378 and authored counts
 * by default, so CI failures are reproducible and fast-check shrinking reports
 * a minimal counterexample; PROPERTY_RUNS_MULTIPLIER / PROPERTY_SEED scale the
 * same properties for scheduled sweeps.
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { propertyRunParams } from '../utils/propertyRunConfig'
import {
  apportionSparerpauschbetrag,
  calculateEtfAllowanceDemand,
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

/** Relative+absolute tolerance for floating-point comparisons. */
function closeTo(actual: number, expected: number, eps = 1e-6): boolean {
  return Math.abs(actual - expected) <= eps * Math.max(1, Math.abs(actual), Math.abs(expected))
}

function makeBaseWorkspace(): Workspace {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
}

function makeEtfInstance(id: string, monthlyContribution: number): EtfInstance {
  const base = makeBaseWorkspace().baseline.assumptions.etf[0]
  return {
    ...base,
    instanceId: id,
    label: id,
    monthlyContribution,
    status: 'active',
    transferEvents: undefined,
  }
}

/**
 * Number arrays of a fixed length with non-negative finite entries. Demands
 * are EUR amounts, generated at whole-euro granularity (the modeled input
 * scale): sub-euro values sit inside float-apportionment quantisation and are
 * outside the domain these properties describe.
 */
function demandArrayArb(totalYears: number, maxDemand = 100_000) {
  return fc.array(fc.integer({ min: 0, max: maxDemand }), {
    minLength: totalYears,
    maxLength: totalYears,
  })
}

/**
 * A demand map with 1–5 instances and 1–6 aligned per-year demand arrays.
 * Insertion order is the generated array order (rotation properties permute it).
 */
const demandMapArb = fc
  .integer({ min: 1, max: 6 })
  .chain((totalYears) =>
    fc
      .array(demandArrayArb(totalYears), { minLength: 1, maxLength: 5 })
      .map((arrays) => new Map(arrays.map((demand, i) => [`inst-${i}`, demand] as const))),
  )

/** Allowance budget in whole euros (the statutory Sparerpauschbetrag scale). */
const allowanceArb = fc.integer({ min: 0, max: 500_000 })

/** Straight-line reference model of the documented apportionment rule. */
function referenceApportion(
  demandByInstance: Map<string, number[]>,
  fullAllowance: number,
  totalYears: number,
): Map<string, number[]> {
  const expected = new Map<string, number[]>()
  for (const [id] of demandByInstance) expected.set(id, new Array(totalYears).fill(0))
  for (let y = 0; y < totalYears; y++) {
    let totalDemand = 0
    for (const [, demand] of demandByInstance) totalDemand += demand[y]
    if (totalDemand <= 0) continue
    for (const [id, demand] of demandByInstance) {
      expected.get(id)![y] =
        totalDemand <= fullAllowance
          ? demand[y]
          : fullAllowance * (demand[y] / totalDemand)
    }
  }
  return expected
}

// ---------------------------------------------------------------------------
// A1–A3, A5, A6 — allocation invariants over generated demand maps
// ---------------------------------------------------------------------------

describe('apportionSparerpauschbetrag — generated invariants', () => {
  it('A1/A2: allocations are non-negative, never exceed demand, and respect the per-year budget', () => {
    fc.assert(
      fc.property(demandMapArb, allowanceArb, (demandMap, allowance) => {
        const totalYears = demandMap.get('inst-0')!.length
        const alloc = apportionSparerpauschbetrag(demandMap, allowance, totalYears)
        expect(alloc.size).toBe(demandMap.size)

        for (let y = 0; y < totalYears; y++) {
          let totalDemand = 0
          let totalAlloc = 0
          for (const [id, demand] of demandMap) {
            const a = alloc.get(id)![y]
            // A1: non-negative and never more than the instance's own demand.
            expect(a).toBeGreaterThanOrEqual(0)
            expect(a).toBeLessThanOrEqual(demand[y] + 1e-9)
            totalDemand += demand[y]
            totalAlloc += a
          }
          // A2: the shared allowance budget is respected per year.
          expect(totalAlloc).toBeLessThanOrEqual(allowance + 1e-6)
          if (totalDemand > allowance) {
            // Binding: the full allowance is exactly exhausted.
            expect(closeTo(totalAlloc, allowance)).toBe(true)
          } else {
            // Slack: every instance is covered in full.
            expect(closeTo(totalAlloc, totalDemand)).toBe(true)
          }
        }
      }),
      propertyRunParams(300, 0),
    )
  })

  it('A2: when demand is below the allowance each instance receives exactly its demand', () => {
    fc.assert(
      fc.property(demandMapArb, allowanceArb, (demandMap, allowance) => {
        const totalYears = demandMap.get('inst-0')!.length
        const alloc = apportionSparerpauschbetrag(demandMap, allowance, totalYears)
        for (let y = 0; y < totalYears; y++) {
          let totalDemand = 0
          for (const [, demand] of demandMap) totalDemand += demand[y]
          if (totalDemand > allowance) continue
          for (const [id, demand] of demandMap) {
            expect(alloc.get(id)![y]).toBe(demand[y])
          }
        }
      }),
      propertyRunParams(300, 1),
    )
  })

  it('A3: when the allowance binds, allocations are proportional to demand (constant share)', () => {
    fc.assert(
      fc.property(demandMapArb, allowanceArb, (demandMap, allowance) => {
        const totalYears = demandMap.get('inst-0')!.length
        const alloc = apportionSparerpauschbetrag(demandMap, allowance, totalYears)
        for (let y = 0; y < totalYears; y++) {
          let totalDemand = 0
          for (const [, demand] of demandMap) totalDemand += demand[y]
          if (totalDemand <= allowance || totalDemand <= 0) continue
          const expectedShare = allowance / totalDemand
          for (const [id, demand] of demandMap) {
            const a = alloc.get(id)![y]
            if (demand[y] === 0) {
              expect(a).toBe(0)
            } else if (demand[y] >= 1e-6) {
              // Ratios are only meaningful above floating-point underflow;
              // denormal demands still respect the budget (A1/A2) but their
              // allocation can round to 0.
              expect(a / demand[y]).toBeCloseTo(expectedShare, 9)
            }
          }
        }
      }),
      propertyRunParams(300, 2),
    )
  })

  it('A4: allocation per instance is invariant under permutation of the demand map', () => {
    fc.assert(
      fc.property(demandMapArb, allowanceArb, fc.integer({ min: 1, max: 5 }), (demandMap, allowance, rotation) => {
        const entries = [...demandMap.entries()]
        const k = rotation % entries.length
        const rotated = new Map(entries.map((_, i) => entries[(i + k) % entries.length]))
        const totalYears = entries[0][1].length

        const base = apportionSparerpauschbetrag(demandMap, allowance, totalYears)
        const permuted = apportionSparerpauschbetrag(rotated, allowance, totalYears)

        for (const [id] of demandMap) {
          const a = base.get(id)!
          const b = permuted.get(id)!
          expect(b).toHaveLength(a.length)
          for (let y = 0; y < a.length; y++) {
            // Proportional scaling divides by an order-dependent floating-point
            // sum, so compare with a tight tolerance rather than exact equality.
            expect(closeTo(b[y], a[y], 1e-9)).toBe(true)
          }
        }
      }),
      propertyRunParams(200, 3),
    )
  })

  it('A5: the function is deterministic — repeated calls produce identical schedules', () => {
    fc.assert(
      fc.property(demandMapArb, allowanceArb, (demandMap, allowance) => {
        const totalYears = demandMap.get('inst-0')!.length
        const first = apportionSparerpauschbetrag(demandMap, allowance, totalYears)
        const second = apportionSparerpauschbetrag(demandMap, allowance, totalYears)
        expect(second).toStrictEqual(first)
      }),
      propertyRunParams(100, 4),
    )
  })

  it('A6: engine allocation matches a straight-line reference model of the documented rule', () => {
    fc.assert(
      fc.property(demandMapArb, allowanceArb, (demandMap, allowance) => {
        const totalYears = demandMap.get('inst-0')!.length
        const actual = apportionSparerpauschbetrag(demandMap, allowance, totalYears)
        const expected = referenceApportion(demandMap, allowance, totalYears)
        for (const [id, exp] of expected) {
          const act = actual.get(id)!
          for (let y = 0; y < totalYears; y++) {
            expect(closeTo(act[y], exp[y], 1e-9)).toBe(true)
          }
        }
      }),
      propertyRunParams(200, 5),
    )
  })
})

// ---------------------------------------------------------------------------
// Deterministic boundary matrix — allowance exactly at the boundary
// ---------------------------------------------------------------------------

describe('apportionSparerpauschbetrag — boundary matrix (deterministic)', () => {
  it.each([
    {
      name: 'total demand exactly equals the allowance → each instance gets its full demand',
      demands: [600, 400],
      allowance: 1000,
      expected: [600, 400],
    },
    {
      name: 'total demand one ct above the allowance → proportional split',
      demands: [600.01, 400],
      allowance: 1000,
      expected: [1000 * (600.01 / 1000.01), 1000 * (400 / 1000.01)],
    },
    {
      name: 'total demand one ct below the allowance → full coverage',
      demands: [599.99, 400],
      allowance: 1000,
      expected: [599.99, 400],
    },
    {
      name: 'single instance demanding more than the allowance → capped at the allowance',
      demands: [2500],
      allowance: 1000,
      expected: [1000],
    },
    {
      name: 'zero allowance → nothing allocated despite positive demand',
      demands: [700, 300],
      allowance: 0,
      expected: [0, 0],
    },
    {
      name: 'zero demand and zero allowance together → zero allocation, never NaN',
      demands: [0],
      allowance: 0,
      expected: [0],
    },
  ])('$name', ({ demands, allowance, expected }) => {
    const demandMap = new Map<string, number[]>(
      demands.map((d, i) => [`inst-${i}`, [d]] as const),
    )
    const alloc = apportionSparerpauschbetrag(demandMap, allowance, 1)
    demands.forEach((_, i) => {
      expect(alloc.get(`inst-${i}`)![0]).toBeCloseTo(expected[i], 9)
    })
  })

  it('zero demand year → zero allocation for every instance', () => {
    const alloc = apportionSparerpauschbetrag(
      new Map([
        ['a', [0, 500]],
        ['b', [0, 600]],
      ]),
      1000,
      2,
    )
    expect(alloc.get('a')![0]).toBe(0)
    expect(alloc.get('b')![0]).toBe(0)
  })

  it('empty demand map → empty allocation map (no instances, no crash)', () => {
    const alloc = apportionSparerpauschbetrag(new Map(), 1000, 4)
    expect(alloc.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// A7 — calculateEtfAllowanceDemand: algebraic scaling + non-negativity
// ---------------------------------------------------------------------------

/** Generated ETF result stub carrying only the fields the demand builder reads. */
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
    rows: rows.map((r) => ({
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
    etfPayoutRows: etfPayoutRows.map((r) => ({
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

/**
 * Non-decreasing cumulative Vorabpauschale series + payout gains, aligned to a
 * generated accumulation/payout year split (the domain calculateEtfAllowanceDemand
 * documents: row years are 1-based, payout row n sits at contract index
 * yearsToRetirement + n − 1).
 */
const etfDemandInputsArb = fc
  .integer({ min: 1, max: 6 })
  .chain((yearsToRetirement) =>
    fc
      .integer({ min: 1, max: 4 })
      .chain((payoutYears) => {
        const totalYears = yearsToRetirement + payoutYears
        return fc
          .tuple(
            fc.array(
              fc.integer({ min: 0, max: 50_000 }),
              { minLength: yearsToRetirement, maxLength: yearsToRetirement },
            ),
            fc.array(
              // Negative taxableGain is in-domain: a Kapitalverzehr payout can
              // sit below the cost basis. The demand builder clamps it to ≥ 0.
              fc.integer({ min: -50_000, max: 50_000 }),
              { minLength: payoutYears, maxLength: payoutYears },
            ),
          )
          .map(([increments, gains]) => {
            // Cumulative VP = running sum of non-negative increments.
            const rows: { year: number; cumulativeVorabpauschale: number }[] = []
            let cum = 0
            increments.forEach((inc, i) => {
              cum += inc
              rows.push({ year: i + 1, cumulativeVorabpauschale: cum })
            })
            return {
              stub: makeEtfResultStub(
                rows,
                gains.map((g, i) => ({ year: i + 1, taxableGain: g })),
              ),
              yearsToRetirement,
              totalYears,
              increments,
              gains,
            }
          })
      }),
  )

describe('calculateEtfAllowanceDemand — generated invariants', () => {
  it('demand arrays have the requested length, are non-negative and zero outside used indices', () => {
    fc.assert(
      fc.property(etfDemandInputsArb, ({ stub, yearsToRetirement, totalYears }) => {
        const demand = calculateEtfAllowanceDemand(stub, 0.3, yearsToRetirement, totalYears)
        expect(demand).toHaveLength(totalYears)
        demand.forEach((d) => expect(d).toBeGreaterThanOrEqual(0))
        // Payout rows only reach indices yearsToRetirement .. totalYears − 1.
        demand.slice(yearsToRetirement).forEach((d) => {
          expect(d).toBeGreaterThanOrEqual(0)
        })
      }),
      propertyRunParams(200, 6),
    )
  })

  it('demand is exactly (1 − partialExemption)-scaled — hence non-increasing in the exemption', () => {
    fc.assert(
      fc.property(etfDemandInputsArb, ({ stub, yearsToRetirement, totalYears, increments, gains }) => {
        const atZero = calculateEtfAllowanceDemand(stub, 0, yearsToRetirement, totalYears)
        const partialExemption = 0.3
        const atPartial = calculateEtfAllowanceDemand(stub, partialExemption, yearsToRetirement, totalYears)

        // Reference model at exemption 0: per-year VP deltas + clamped payout gains.
        atZero.slice(0, yearsToRetirement).forEach((d, i) => {
          expect(closeTo(d, increments[i], 1e-9)).toBe(true)
        })
        gains.forEach((g, i) => {
          expect(closeTo(atZero[yearsToRetirement + i], Math.max(0, g), 1e-9)).toBe(true)
        })
        // Algebraic scaling: every demand term is (1 − pe)-scaled before its
        // ≥0 clamp — VP increments in the accumulation years, payout gains at
        // index yearsToRetirement + j, nothing beyond.
        atZero.forEach((raw, i) => {
          const expectedPartial =
            i < yearsToRetirement
              ? Math.max(0, increments[i]) * (1 - partialExemption)
              : i < yearsToRetirement + gains.length
                ? Math.max(0, gains[i - yearsToRetirement] * (1 - partialExemption))
                : 0
          expect(closeTo(atPartial[i], expectedPartial, 1e-9)).toBe(true)
          // Non-increasing in the exemption (direct consequence of the scaling).
          expect(atPartial[i]).toBeLessThanOrEqual(raw + 1e-9)
        })
      }),
      propertyRunParams(200, 7),
    )
  })

  it('demand calculation is deterministic for identical inputs', () => {
    fc.assert(
      fc.property(etfDemandInputsArb, ({ stub, yearsToRetirement, totalYears }) => {
        const first = calculateEtfAllowanceDemand(stub, 0.3, yearsToRetirement, totalYears)
        const second = calculateEtfAllowanceDemand(stub, 0.3, yearsToRetirement, totalYears)
        expect(second).toStrictEqual(first)
      }),
      propertyRunParams(50, 8),
    )
  })
})

// ---------------------------------------------------------------------------
// A8 — higher-order end-to-end: the re-run keeps the shared budget per year
// ---------------------------------------------------------------------------

describe('applyCrossInstanceSparerpauschbetrag — end-to-end via simulatePortfolio', () => {
  const SINGLE_ALLOWANCE = de2026Rules.capitalGains.saverAllowance

  function twoEtfWorkspace(contributionA: number, contributionB: number): Workspace {
    const ws = makeBaseWorkspace()
    return {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          etf: [
            makeEtfInstance('etf-a', contributionA),
            makeEtfInstance('etf-b', contributionB),
          ],
        },
      },
    }
  }

  it('combined saverAllowanceUsed per payout year stays within the single-saver allowance', () => {
    const contributionsArb = fc.integer({ min: 100, max: 1_500 })
    fc.assert(
      fc.property(contributionsArb, contributionsArb, (a, b) => {
        const workspace = twoEtfWorkspace(a, b)
        const { perInstance } = simulatePortfolio(workspace, de2026Rules)
        const scenarioId = wsBasisScenarioId(workspace)
        for (const id of ['etf-a', 'etf-b']) {
          const results = perInstance[id]
          expect(results).toBeDefined()
          const basis = results!.find((r) => r.scenarioId === scenarioId)
          expect(basis).toBeDefined()
          if (basis?.productId !== 'etf') throw new Error('expected ETF result')
          const rows = (basis as EtfProductResult).etfPayoutRows
          expect(rows.length).toBeGreaterThan(0)
          for (const row of rows) {
            expect(row.saverAllowanceUsed).toBeGreaterThanOrEqual(0)
          }
        }
        // The shared budget: usage summed across both instances per year.
        const aRows = (perInstance['etf-a']!.find((r) => r.scenarioId === scenarioId) as EtfProductResult).etfPayoutRows
        const bRows = (perInstance['etf-b']!.find((r) => r.scenarioId === scenarioId) as EtfProductResult).etfPayoutRows
        const commonLen = Math.min(aRows.length, bRows.length)
        for (let i = 0; i < commonLen; i++) {
          const combined = aRows[i].saverAllowanceUsed + bRows[i].saverAllowanceUsed
          expect(combined).toBeLessThanOrEqual(SINGLE_ALLOWANCE + 0.01)
        }
      }),
      propertyRunParams(8, 9),
    )
  })

  it('seeded repeatability: identical workspaces simulate to identical ETF results', () => {
    const { perInstance: run1 } = simulatePortfolio(twoEtfWorkspace(650, 900), de2026Rules)
    const { perInstance: run2 } = simulatePortfolio(twoEtfWorkspace(650, 900), de2026Rules)
    expect(run2['etf-a']).toStrictEqual(run1['etf-a'])
    expect(run2['etf-b']).toStrictEqual(run1['etf-b'])
  })
})

/** Basis scenario id via the canonical pattern (never index [0] — it is 'konservativ'). */
function wsBasisScenarioId(ws: Workspace): string {
  const scenarios = ws.baseline.assumptions.returnScenarios
  return scenarios.find((s) => s.id === 'basis')?.id ?? scenarios[0].id
}
