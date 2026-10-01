/**
 * Constrained property tests for portfolioFunding.ts (issue #378).
 *
 * Complements `portfolioFunding.test.ts` with generated properties over the
 * cross-instance cap apportionment. Generators are constrained to the module's
 * documented input domain: active instances with non-negative finite monthly
 * contributions (paid-up / surrendered / offered instances follow their own
 * deterministic paths covered by the example-based suite).
 *
 * Properties under test:
 *   F1. bAV (§3 Nr. 63 / §1 SvEV): the aggregate accepted total bAV never
 *       exceeds the tax-free annual cap (bisection tolerance), the headroom
 *       snapshot reconciles (funded = min(cap, requested)), and the flags /
 *       ratios are consistent.
 *   F2. Basisrente (§10 Abs. 3): accepted product contributions never exceed
 *       the remaining Schicht-1 headroom after pension-system contributions;
 *       constrained flag iff scaling happened.
 *   F3. Riester (§10a / §86): own contribution + allowance per household and
 *       per accumulation year never exceeds the annual cap incl. allowances.
 *   F4. AVD (AltZertG): the per-contract contribution cap holds per instance
 *       and headroom stays non-negative.
 *   F5. Salary reconciliation: the household post-bAV salary baseline is
 *       derived from the sum of accepted employee conversions.
 *   F6. Order invariance where apportionment is proportional (bAV, Basisrente):
 *       rotating the instance array leaves each instance's funding result
 *       unchanged. Riester is deliberately excluded — its allowance-recipient
 *       allocation is max-selection, not proportional, and ties resolve by
 *       array order by design.
 *   F7. Determinism: identical workspaces produce identical funding snapshots.
 *
 * All `fc.assert` calls derive seed and run count from `propertyRunParams`
 * (`src/utils/propertyRunConfig.ts`): fixed seed base 378 and authored counts
 * by default, so CI failures are reproducible; PROPERTY_RUNS_MULTIPLIER /
 * PROPERTY_SEED scale the same properties for scheduled sweeps.
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { propertyRunParams } from '../utils/propertyRunConfig'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import { buildPortfolioFunding } from './portfolioFunding'
import { calculateSalaryResult } from './salary'
import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function closeTo(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))
}

/**
 * Base workspace whose singleton contributions are non-zero so every product
 * array carries a clone-able instance after migration.
 */
function makeSeedWorkspace(): Workspace {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
      basisrente: { ...defaultAssumptions.basisrente, monthlyGrossContribution: 100 },
      altersvorsorgedepot: { ...defaultAssumptions.altersvorsorgedepot, monthlyOwnContribution: 100 },
      riester: { ...defaultAssumptions.riester, monthlyOwnContribution: 50 },
    } as unknown as Record<string, unknown>,
  )
}

type InstanceSlot = 'bav' | 'basisrente' | 'altersvorsorgedepot' | 'riester'

type InstanceOf<S extends InstanceSlot> = WorkspaceAssumptionsV2[S][number]

const contributionKey: Record<InstanceSlot, string> = {
  bav: 'monthlyGrossConversion',
  basisrente: 'monthlyGrossContribution',
  altersvorsorgedepot: 'monthlyOwnContribution',
  riester: 'monthlyOwnContribution',
}

function makeInstance<S extends InstanceSlot>(
  slot: S,
  index: number,
  contribution: number,
): InstanceOf<S> {
  const base = makeSeedWorkspace().baseline.assumptions[slot][0] as InstanceOf<S>
  return {
    ...base,
    instanceId: `${slot}-${index}`,
    label: `${slot}-${index}`,
    status: 'active',
    transferEvents: undefined,
    evidenceMap: {},
    [contributionKey[slot]]: contribution,
  } as InstanceOf<S>
}

/** Shape of a generated portfolio: per-product monthly contributions, 0–2 active instances each. */
interface FundingShape {
  bav: number[]
  basisrente: number[]
  altersvorsorgedepot: number[]
  riester: number[]
}

/**
 * Monthly contributions are generated at whole-euro granularity — the modeled
 * (UI) input domain, where the combine inputs step in whole euros.
 *
 * Test limitation (documented exclusion, not a verified engine defect): below
 * roughly 0.1 EUR/month a bAV conversion no longer lowers net payroll — the
 * statutory BMF-PAP wage rounding quantises the result, so a 1-cent conversion
 * can land a rounding step (~1 EUR/year) above the no-conversion baseline.
 * Properties that assume monotonicity (F5) therefore exclude sub-euro amounts.
 * Exact zero stays reachable for the degenerate boundaries.
 */
const monthlyArb = (max: number) => fc.integer({ min: 0, max })

const fundingShapeArb: fc.Arbitrary<FundingShape> = fc.record({
  bav: fc.array(monthlyArb(3_000), { maxLength: 2 }),
  basisrente: fc.array(monthlyArb(2_500), { maxLength: 2 }),
  altersvorsorgedepot: fc.array(monthlyArb(900), { maxLength: 2 }),
  riester: fc.array(monthlyArb(900), { maxLength: 2 }),
})

function makeFundingWorkspace(shape: FundingShape): Workspace {
  const ws = makeSeedWorkspace()
  const wsa = ws.baseline.assumptions
  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...wsa,
        bav: shape.bav.map((c, i) => makeInstance('bav', i, c)),
        basisrente: shape.basisrente.map((c, i) => makeInstance('basisrente', i, c)),
        altersvorsorgedepot: shape.altersvorsorgedepot.map(
          (c, i) => makeInstance('altersvorsorgedepot', i, c),
        ),
        riester: shape.riester.map((c, i) => makeInstance('riester', i, c)),
      },
    },
  }
}

/** Rotate an array by k (a cheap deterministic permutation). */
function rotate<T>(xs: T[], k: number): T[] {
  if (xs.length === 0) return xs
  const s = ((k % xs.length) + xs.length) % xs.length
  return xs.slice(s).concat(xs.slice(0, s))
}

/**
 * Clone `ws` with the instance array of `slot` rotated by `rotation`. The
 * instance OBJECTS are reused, so each instance keeps its id and contribution;
 * only their order in the array changes. (Rotating the generated amount shape
 * instead would reassign ids by position — the rotation properties would then
 * compare different contracts and fail for any two distinct contributions.)
 */
function rotateWorkspaceInstances<S extends InstanceSlot>(
  ws: Workspace,
  slot: S,
  rotation: number,
): Workspace {
  const wsa = ws.baseline.assumptions
  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...wsa,
        [slot]: rotate([...wsa[slot]], rotation),
      },
    },
  }
}

// ---------------------------------------------------------------------------
// F1–F5 — cap and reconciliation invariants over generated portfolios
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — generated cap invariants', () => {
  it('F1: accepted bAV never exceeds the §3 Nr. 63 cap and the headroom snapshot reconciles', () => {
    fc.assert(
      fc.property(fundingShapeArb, (shape) => {
        const funding = buildPortfolioFunding(makeFundingWorkspace(shape), de2026Rules)
        const headroom = funding.headroom.bav
        const cap = headroom.capAnnual

        const totalBav = Object.values(funding.bavByInstanceId).reduce(
          (s, f) => s + f.totalBavContributionAnnual,
          0,
        )
        // Bisection converges to ≤ 0.01 EUR/year of the cap (early-exit threshold).
        expect(totalBav).toBeLessThanOrEqual(cap + 0.05)
        expect(closeTo(headroom.fundedAnnual, Math.min(cap, totalBav), 1e-6)).toBe(true)
        expect(headroom.remainingAnnual).toBeGreaterThanOrEqual(0)
        expect(headroom.usedPct).toBeGreaterThanOrEqual(0)
        expect(headroom.usedPct).toBeLessThanOrEqual(1)
        // Scaling happened iff the request exceeded the cap.
        expect(headroom.constrained).toBe(headroom.requestedAnnual > cap)
        if (!headroom.constrained) {
          expect(closeTo(totalBav, headroom.requestedAnnual, 1e-9)).toBe(true)
        }
        // Monthly net cost of the bAV can never be negative.
        expect(headroom.monthlyNetCost).toBeGreaterThanOrEqual(0)
      }),
      propertyRunParams(40, 0),
    )
  })

  it('F2: accepted Basisrente stays within the remaining Schicht-1 headroom', () => {
    fc.assert(
      fc.property(fundingShapeArb, (shape) => {
        const funding = buildPortfolioFunding(makeFundingWorkspace(shape), de2026Rules)
        const headroom = funding.headroom.basisrente
        const cap = headroom.capAnnual

        const totalProduct = Object.values(funding.basisrenteByInstanceId).reduce(
          (s, f) => s + f.annualGrossContribution,
          0,
        )
        // Proportional pre-scaling keeps the product share inside the headroom
        // the pension-system contributions left (tiny fp tolerance).
        expect(
          headroom.pensionSystemAnnual + totalProduct,
        ).toBeLessThanOrEqual(cap + 0.01)
        expect(headroom.remainingAnnual).toBeGreaterThanOrEqual(0)
        expect(headroom.usedPct).toBeLessThanOrEqual(1)
        // Scaling happened iff the product request exceeded the remaining headroom.
        const requestedProduct = headroom.requestedAnnual - headroom.pensionSystemAnnual
        const remainingCap = Math.max(0, cap - headroom.pensionSystemAnnual)
        expect(headroom.constrained).toBe(requestedProduct > remainingCap && requestedProduct > 0)
      }),
      propertyRunParams(40, 1),
    )
  })

  it('F3: accepted Riester own + allowance stays within the §10a cap in every accumulation year', () => {
    fc.assert(
      fc.property(fundingShapeArb, (shape) => {
        const funding = buildPortfolioFunding(makeFundingWorkspace(shape), de2026Rules)
        const headroom = funding.headroom.riester
        const cap = headroom.capAnnual

        const yearly = Object.values(funding.riesterYearlyByInstanceId)
        if (yearly.length > 0) {
          const horizon = yearly[0].length
          expect(horizon).toBeGreaterThan(0)
          for (let y = 0; y < horizon; y++) {
            let aggregate = 0
            for (const schedule of yearly) {
              const f = schedule[y]
              aggregate += f.annualOwnContribution + f.totalAllowanceAnnual
            }
            expect(aggregate).toBeLessThanOrEqual(cap + 0.01)
          }
        }
        expect(headroom.fundedAnnual).toBeLessThanOrEqual(cap + 0.01)
        expect(headroom.remainingAnnual).toBeGreaterThanOrEqual(0)
        expect(headroom.usedPct).toBeLessThanOrEqual(1)
        expect(headroom.constrained).toBe(headroom.requestedAnnual > cap)
      }),
      propertyRunParams(40, 2),
    )
  })

  it('F4: AVD respects the per-contract contribution cap per instance', () => {
    fc.assert(
      fc.property(fundingShapeArb, (shape) => {
        const funding = buildPortfolioFunding(makeFundingWorkspace(shape), de2026Rules)
        const cap = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual
        for (const [instanceId, headroom] of Object.entries(
          funding.headroom.altersvorsorgedepotByInstanceId,
        )) {
          expect(headroom.capAnnual).toBe(cap)
          const f = funding.altersvorsorgedepotByInstanceId[instanceId]
          expect(f).toBeDefined()
          expect(f!.totalContractContributionAnnual).toBeLessThanOrEqual(cap + 1e-6)
          expect(headroom.fundedAnnual).toBeLessThanOrEqual(cap + 1e-6)
          expect(headroom.requestedAnnual).toBeGreaterThanOrEqual(headroom.fundedAnnual - 1e-9)
          expect(headroom.remainingAnnual).toBeGreaterThanOrEqual(0)
          expect(headroom.usedPct).toBeLessThanOrEqual(1)
        }
      }),
      propertyRunParams(40, 3),
    )
  })

  it('F5: the household salary baseline reflects the full accepted bAV conversion', () => {
    fc.assert(
      fc.property(fundingShapeArb, (shape) => {
        const funding = buildPortfolioFunding(makeFundingWorkspace(shape), de2026Rules)
        const headroom = funding.headroom.bav
        // employeeAnnual is the aggregate accepted gross conversion.
        const sumAccepted = Object.values(funding.bavByInstanceId).reduce(
          (s, f) => s + f.annualGrossConversion,
          0,
        )
        expect(closeTo(headroom.employeeAnnual, sumAccepted, 1e-9)).toBe(true)
        // The downstream salary baseline is the no-bAV salary shifted by the
        // household net cost of exactly those conversions.
        const hasBav = Object.keys(funding.bavByInstanceId).length > 0
        if (!hasBav) {
          expect(headroom.monthlyNetCost).toBe(0)
        } else {
          const profile = makeSeedWorkspace().baseline.profile
          const withoutBav = calculateSalaryResult(profile, de2026Rules, 0)
          expect(closeTo(
            headroom.monthlyNetCost,
            Math.max(0, withoutBav.annualNet - funding.salaryForOtherFunding.annualNet) / 12,
            1e-9,
          )).toBe(true)
          expect(funding.salaryForOtherFunding.annualNet).toBeLessThanOrEqual(withoutBav.annualNet)
        }
      }),
      propertyRunParams(40, 4),
    )
  })

  it('F7: identical workspaces produce identical funding snapshots', () => {
    fc.assert(
      fc.property(fundingShapeArb, (shape) => {
        const ws = makeFundingWorkspace(shape)
        const first = buildPortfolioFunding(ws, de2026Rules)
        const second = buildPortfolioFunding(ws, de2026Rules)
        expect(second).toStrictEqual(first)
      }),
      propertyRunParams(15, 5),
    )
  })
})

// ---------------------------------------------------------------------------
// F6 — order invariance where apportionment is proportional
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — order invariance (proportional apportionment only)', () => {
  it('rotating the bAV array leaves every instance’s bAV funding unchanged', () => {
    fc.assert(
      fc.property(
        fundingShapeArb,
        fc.integer({ min: 1, max: 4 }),
        (shape, rotation) => {
          const wsA = makeFundingWorkspace(shape)
          const wsB = rotateWorkspaceInstances(wsA, 'bav', rotation)
          const fundingA = buildPortfolioFunding(wsA, de2026Rules)
          const fundingB = buildPortfolioFunding(wsB, de2026Rules)

          expect(Object.keys(fundingB.bavByInstanceId).sort()).toEqual(
            Object.keys(fundingA.bavByInstanceId).sort(),
          )
          for (const [id, fA] of Object.entries(fundingA.bavByInstanceId)) {
            const fB = fundingB.bavByInstanceId[id]
            expect(closeTo(fB.totalBavContributionAnnual, fA.totalBavContributionAnnual, 1e-9)).toBe(true)
            expect(closeTo(fB.annualGrossConversion, fA.annualGrossConversion, 1e-9)).toBe(true)
            expect(closeTo(fB.annualEmployerContribution, fA.annualEmployerContribution, 1e-9)).toBe(true)
            expect(closeTo(fB.monthlyNetCost, fA.monthlyNetCost, 1e-9)).toBe(true)
          }
          // Downstream salary baseline is order-invariant too.
          expect(closeTo(
            fundingB.salaryForOtherFunding.annualNet,
            fundingA.salaryForOtherFunding.annualNet,
            1e-9,
          )).toBe(true)
        },
      ),
      propertyRunParams(25, 6),
    )
  })

  it('rotating the Basisrente array leaves every instance’s Basisrente funding unchanged', () => {
    fc.assert(
      fc.property(
        fundingShapeArb,
        fc.integer({ min: 1, max: 4 }),
        (shape, rotation) => {
          const wsA = makeFundingWorkspace(shape)
          const wsB = rotateWorkspaceInstances(wsA, 'basisrente', rotation)
          const fundingA = buildPortfolioFunding(wsA, de2026Rules)
          const fundingB = buildPortfolioFunding(wsB, de2026Rules)

          for (const [id, fA] of Object.entries(fundingA.basisrenteByInstanceId)) {
            const fB = fundingB.basisrenteByInstanceId[id]
            expect(closeTo(fB.annualGrossContribution, fA.annualGrossContribution, 1e-9)).toBe(true)
            expect(closeTo(fB.annualTaxSaving, fA.annualTaxSaving, 1e-9)).toBe(true)
            expect(closeTo(fB.monthlyNetCost, fA.monthlyNetCost, 1e-9)).toBe(true)
          }
        },
      ),
      propertyRunParams(25, 7),
    )
  })
})

// ---------------------------------------------------------------------------
// Deterministic boundary matrix — at and beyond the caps
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — boundary matrix (deterministic)', () => {
  it('zero contributions everywhere → nothing funded, nothing constrained', () => {
    const funding = buildPortfolioFunding(
      makeFundingWorkspace({
        bav: [0],
        basisrente: [0],
        altersvorsorgedepot: [0],
        riester: [0],
      }),
      de2026Rules,
    )
    expect(funding.headroom.bav.fundedAnnual).toBe(0)
    expect(funding.headroom.bav.constrained).toBe(false)
    expect(funding.headroom.basisrente.constrained).toBe(false)
    expect(funding.headroom.riester.constrained).toBe(false)
    const riester = Object.values(funding.riesterByInstanceId)[0]
    expect(riester.annualOwnContribution).toBe(0)
  })

  it('a single huge bAV conversion is capped exactly at the statutory limit', () => {
    const funding = buildPortfolioFunding(
      makeFundingWorkspace({
        bav: [10_000],
        basisrente: [],
        altersvorsorgedepot: [],
        riester: [],
      }),
      de2026Rules,
    )
    const headroom = funding.headroom.bav
    expect(headroom.constrained).toBe(true)
    expect(headroom.fundedAnnual).toBeCloseTo(headroom.capAnnual, 2)
    expect(headroom.remainingAnnual).toBeGreaterThanOrEqual(0)
  })

  it('a single huge Basisrente contribution is scaled into the remaining Schicht-1 headroom', () => {
    const funding = buildPortfolioFunding(
      makeFundingWorkspace({
        bav: [],
        basisrente: [5_000],
        altersvorsorgedepot: [],
        riester: [],
      }),
      de2026Rules,
    )
    const headroom = funding.headroom.basisrente
    expect(headroom.constrained).toBe(true)
    expect(headroom.pensionSystemAnnual + headroom.productAnnual).toBeLessThanOrEqual(
      headroom.capAnnual + 0.01,
    )
    expect(headroom.remainingAnnual).toBeGreaterThanOrEqual(0)
  })

  it('Riester at the suggested 5 €/month-style contribution stays unconstrained; an oversized one binds', () => {
    const relaxed = buildPortfolioFunding(
      makeFundingWorkspace({
        bav: [],
        basisrente: [],
        altersvorsorgedepot: [],
        riester: [50],
      }),
      de2026Rules,
    )
    expect(relaxed.headroom.riester.constrained).toBe(false)

    const binding = buildPortfolioFunding(
      makeFundingWorkspace({
        bav: [],
        basisrente: [],
        altersvorsorgedepot: [],
        riester: [500],
      }),
      de2026Rules,
    )
    expect(binding.headroom.riester.constrained).toBe(true)
    expect(binding.headroom.riester.fundedAnnual).toBeLessThanOrEqual(
      de2026Rules.riester.annualCapInclAllowances + 0.01,
    )
  })

  it('an AVD own contribution above the per-contract cap is capped at the contract maximum', () => {
    const funding = buildPortfolioFunding(
      makeFundingWorkspace({
        bav: [],
        basisrente: [],
        altersvorsorgedepot: [1_000],
        riester: [],
      }),
      de2026Rules,
    )
    const cap = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual
    const headroom = Object.values(funding.headroom.altersvorsorgedepotByInstanceId)[0]
    expect(headroom.constrained).toBe(true)
    expect(headroom.fundedAnnual).toBeLessThanOrEqual(cap + 1e-6)
  })
})
