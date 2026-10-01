/**
 * Constrained property tests for portfolioCombine.ts (issue #378).
 *
 * Complements `portfolioCombine.test.ts` (which pins single-instance byte
 * identity against compare-mode oracles) with generated properties over the
 * household-level aggregation. Real pipeline end-to-end:
 * `simulatePortfolio` → `buildCombineContext` (the shared builder) →
 * `combinePortfolio`. Generators are constrained to structurally valid
 * portfolios: 0–2 active instances per product with non-negative finite
 * monthly contributions, and a non-negative projected statutory pension.
 *
 * Properties under test:
 *   C1. Household net reconciliation: `monthlyNetIncome` equals the statutory
 *       net plus the sum of per-instance net shares (the type-level contract
 *       documented on `CombinedResult.byInstance`).
 *   C2. Non-negativity: instance net shares, tax shares, KV/PV shares, and the
 *       statutory net are all non-negative.
 *   C3. Gross-channel reconciliation: the waterfall channel sum equals the
 *       statutory gross plus the sum of per-instance gross.
 *   C4. Per-instance net identity (non-ETF): net = max(0, gross − tax/12 −
 *       kvPv) with the instance's own allocated shares.
 *   C5. ETF pass-through: KV/PV share is zero and the tax share equals the
 *       instance-level Abgeltungsteuer (gross − net).
 *   C6. Determinism / seeded repeatability: identical workspaces simulate and
 *       combine to identical results.
 *   C7. Degenerate boundary: an empty portfolio reduces to the statutory-only
 *       result; zero-contribution instances add zero net.
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
import { simulatePortfolio } from './portfolioAdapter'
import { buildCombineContext } from './combineContext'
import { combinePortfolio, type CombinedResult } from './portfolioCombine'
import type { AnyInstance } from './portfolioTransfer'
import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type { ProductResult } from '../domain'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function closeTo(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))
}

/** Seed workspace with non-zero singletons so every product array is clone-able. */
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

type CombineSlot =
  | 'bav'
  | 'etf'
  | 'versicherung'
  | 'basisrente'
  | 'altersvorsorgedepot'
  | 'riester'

/**
 * Keys of `WorkspaceAssumptionsV2` that hold product instance arrays — derived
 * from the type, so the scalar/scenario keys (`statutoryPension`,
 * `returnScenarios`, …) are excluded by construction.
 */
type ProductArrayKey = {
  [K in keyof WorkspaceAssumptionsV2]-?: WorkspaceAssumptionsV2[K] extends AnyInstance[] ? K : never
}[keyof WorkspaceAssumptionsV2]

/** Workspace-array key per slot; also used as the label prefix. */
const slotArrayKey: Record<CombineSlot, ProductArrayKey> = {
  bav: 'bav',
  etf: 'etf',
  versicherung: 'insurance',
  basisrente: 'basisrente',
  altersvorsorgedepot: 'altersvorsorgedepot',
  riester: 'riester',
}

const slotContributionKey: Record<CombineSlot, string> = {
  bav: 'monthlyGrossConversion',
  etf: 'monthlyContribution',
  versicherung: 'monthlyContribution',
  basisrente: 'monthlyGrossContribution',
  altersvorsorgedepot: 'monthlyOwnContribution',
  riester: 'monthlyOwnContribution',
}

function makeInstance(slot: CombineSlot, index: number, contribution: number) {
  const base = makeSeedWorkspace().baseline.assumptions[slotArrayKey[slot]][0]
  return {
    ...base,
    instanceId: `${slot}-${index}`,
    label: `${slot}-${index}`,
    status: 'active',
    transferEvents: undefined,
    evidenceMap: {},
    [slotContributionKey[slot]]: contribution,
  }
}

/** Generated portfolio shape: 0–2 active instances per product, monthly EUR. */
interface PortfolioShape {
  bav: number[]
  etf: number[]
  versicherung: number[]
  basisrente: number[]
  altersvorsorgedepot: number[]
  riester: number[]
}

/**
 * Monthly contributions are generated at whole-euro granularity — the modeled
 * (UI) input domain, where the combine inputs step in whole euros.
 *
 * Test limitation (documented exclusion, not a verified engine defect):
 * sub-euro contributions sit inside statutory BMF-PAP wage-rounding
 * quantisation (see the same note in `portfolioFunding.property.test.ts`) and
 * are outside the domain these properties describe. Exact zero stays reachable
 * for the degenerate boundaries.
 */
const contributionArb = fc.integer({ min: 0, max: 800 })

const portfolioShapeArb: fc.Arbitrary<PortfolioShape> = fc.record({
  bav: fc.array(contributionArb, { maxLength: 2 }),
  etf: fc.array(contributionArb, { maxLength: 2 }),
  versicherung: fc.array(contributionArb, { maxLength: 2 }),
  basisrente: fc.array(contributionArb, { maxLength: 2 }),
  altersvorsorgedepot: fc.array(contributionArb, { maxLength: 2 }),
  riester: fc.array(contributionArb, { maxLength: 2 }),
})

function makeWorkspace(shape: PortfolioShape): Workspace {
  const ws = makeSeedWorkspace()
  const wsa = ws.baseline.assumptions
  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...wsa,
        bav: shape.bav.map((c, i) => makeInstance('bav', i, c)),
        etf: shape.etf.map((c, i) => makeInstance('etf', i, c)),
        insurance: shape.versicherung.map((c, i) => makeInstance('versicherung', i, c)),
        basisrente: shape.basisrente.map((c, i) => makeInstance('basisrente', i, c)),
        altersvorsorgedepot: shape.altersvorsorgedepot.map(
          (c, i) => makeInstance('altersvorsorgedepot', i, c),
        ),
        riester: shape.riester.map((c, i) => makeInstance('riester', i, c)),
      } as WorkspaceAssumptionsV2,
    },
  }
}

/** Run the real pipeline for one scenario and return everything worth asserting on. */
function runCombine(shape: PortfolioShape, grvGrossMonthlyPension: number): {
  combined: CombinedResult
  instanceIds: string[]
} {
  const workspace = makeWorkspace(shape)
  const wsa = workspace.baseline.assumptions
  const { perInstance } = simulatePortfolio(workspace, de2026Rules)
  const instanceIds = [
    ...wsa.bav, ...wsa.etf, ...wsa.insurance,
    ...wsa.basisrente, ...wsa.altersvorsorgedepot, ...wsa.riester,
  ].map((i) => i.instanceId)

  const basisScenarioId =
    wsa.returnScenarios.find((s) => s.id === 'basis')?.id ?? wsa.returnScenarios[0].id
  const basisResults: ProductResult[] = instanceIds
    .map((id) => perInstance[id]?.find((r) => r.scenarioId === basisScenarioId))
    .filter((r): r is ProductResult => r !== undefined)

  const ctx = buildCombineContext({
    profile: workspace.baseline.profile,
    rules: de2026Rules,
    statutoryPension: wsa.statutoryPension,
    grvGrossMonthlyPension,
    hasPartner: false,
  })
  return { combined: combinePortfolio(workspace, basisResults, ctx), instanceIds }
}

// ---------------------------------------------------------------------------
// C1–C5 — reconciliation invariants over generated portfolios
// ---------------------------------------------------------------------------

describe('combinePortfolio — generated household reconciliation', () => {
  it('C1: monthlyNetIncome reconciles with statutory net plus per-instance net shares', () => {
    fc.assert(
      fc.property(portfolioShapeArb, fc.integer({ min: 0, max: 2_200 }), (shape, grvGross) => {
        const { combined, instanceIds } = runCombine(shape, grvGross)
        const instanceNetSum = Object.values(combined.byInstance).reduce(
          (s, share) => s + share.monthlyNet,
          0,
        )
        expect(closeTo(
          combined.monthlyNetIncome,
          combined.statutoryPensionMonthlyNet + instanceNetSum,
          1e-9,
        )).toBe(true)
        // Every simulated instance has a share entry.
        expect(Object.keys(combined.byInstance).sort()).toEqual([...instanceIds].sort())
      }),
      propertyRunParams(30, 0),
    )
  })

  it('C2: net shares, tax shares, KV/PV shares and the statutory net are non-negative', () => {
    fc.assert(
      fc.property(portfolioShapeArb, fc.integer({ min: 0, max: 2_200 }), (shape, grvGross) => {
        const { combined } = runCombine(shape, grvGross)
        expect(combined.statutoryPensionMonthlyNet).toBeGreaterThanOrEqual(0)
        expect(combined.monthlyNetIncome).toBeGreaterThanOrEqual(0)
        for (const share of Object.values(combined.byInstance)) {
          expect(share.monthlyNet).toBeGreaterThanOrEqual(0)
          expect(share.taxShareAnnual).toBeGreaterThanOrEqual(0)
          expect(share.kvPvShare).toBeGreaterThanOrEqual(0)
          expect(share.monthlyGross).toBeGreaterThanOrEqual(0)
        }
      }),
      propertyRunParams(30, 1),
    )
  })

  it('C3: the waterfall channel sum reconciles with statutory + per-instance gross', () => {
    fc.assert(
      fc.property(portfolioShapeArb, fc.integer({ min: 0, max: 2_200 }), (shape, grvGross) => {
        const { combined } = runCombine(shape, grvGross)
        const channelSum =
          combined.monthlyGrossPayouts.statutoryPension +
          combined.monthlyGrossPayouts.bav +
          combined.monthlyGrossPayouts.privateInsurance +
          combined.monthlyGrossPayouts.basisrente +
          combined.monthlyGrossPayouts.altersvorsorgedepot +
          combined.monthlyGrossPayouts.riester +
          combined.monthlyGrossPayouts.etf
        const instanceGrossSum = Object.values(combined.byInstance).reduce(
          (s, share) => s + share.monthlyGross,
          0,
        )
        expect(closeTo(channelSum, combined.monthlyGrossPayouts.statutoryPension + instanceGrossSum)).toBe(true)
      }),
      propertyRunParams(30, 2),
    )
  })

  it('C4: non-ETF net shares equal gross − tax/12 − KV/PV of their own allocated shares', () => {
    fc.assert(
      fc.property(portfolioShapeArb, fc.integer({ min: 0, max: 2_200 }), (shape, grvGross) => {
        const { combined } = runCombine(shape, grvGross)
        for (const share of Object.values(combined.byInstance)) {
          if (share.productId === 'etf') continue
          const expectedNet = Math.max(
            0,
            share.monthlyGross - share.taxShareAnnual / 12 - share.kvPvShare,
          )
          expect(closeTo(share.monthlyNet, expectedNet, 1e-9)).toBe(true)
        }
      }),
      propertyRunParams(30, 3),
    )
  })

  it('C5: ETF shares pass the flat-taxed net through with zero KV/PV', () => {
    fc.assert(
      fc.property(portfolioShapeArb, fc.integer({ min: 0, max: 2_200 }), (shape, grvGross) => {
        const { combined } = runCombine(shape, grvGross)
        for (const share of Object.values(combined.byInstance)) {
          if (share.productId !== 'etf') continue
          expect(share.kvPvShare).toBe(0)
          expect(closeTo(share.taxShareAnnual, Math.max(0, (share.monthlyGross - share.monthlyNet) * 12))).toBe(true)
        }
      }),
      propertyRunParams(30, 4),
    )
  })

  it('C6: identical workspaces simulate and combine to identical results', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 800 }), (bavMonthly) => {
        const shape: PortfolioShape = { bav: [bavMonthly], etf: [300], versicherung: [], basisrente: [150], altersvorsorgedepot: [100], riester: [50] }
        const first = runCombine(shape, 1_400)
        const second = runCombine(shape, 1_400)
        expect(second.combined).toStrictEqual(first.combined)
      }),
      propertyRunParams(8, 5),
    )
  })
})

// ---------------------------------------------------------------------------
// C7 — deterministic degenerate boundaries
// ---------------------------------------------------------------------------

describe('combinePortfolio — boundary matrix (deterministic)', () => {
  it('empty portfolio: the household result reduces to the statutory-only net', () => {
    const { combined } = runCombine(
      { bav: [], etf: [], versicherung: [], basisrente: [], altersvorsorgedepot: [], riester: [] },
      1_800,
    )
    expect(Object.keys(combined.byInstance)).toHaveLength(0)
    expect(closeTo(combined.monthlyNetIncome, combined.statutoryPensionMonthlyNet, 1e-9)).toBe(true)
    expect(combined.monthlyGrossPayouts.statutoryPension).toBeCloseTo(1_800, 9)
    for (const [channel, value] of Object.entries(combined.monthlyGrossPayouts)) {
      if (channel === 'statutoryPension') continue
      expect(value).toBe(0)
    }
  })

  it('zero-contribution instances add zero net — the household result stays statutory-only', () => {
    const { combined } = runCombine(
      { bav: [0], etf: [0], versicherung: [0], basisrente: [0], altersvorsorgedepot: [0], riester: [0] },
      1_200,
    )
    for (const share of Object.values(combined.byInstance)) {
      expect(share.monthlyGross).toBe(0)
      expect(share.monthlyNet).toBe(0)
    }
    expect(closeTo(combined.monthlyNetIncome, combined.statutoryPensionMonthlyNet, 1e-9)).toBe(true)
  })

  it('GRV of zero: no statutory channel, household net equals the instance sum', () => {
    const { combined } = runCombine(
      { bav: [200], etf: [], versicherung: [], basisrente: [], altersvorsorgedepot: [], riester: [] },
      0,
    )
    expect(combined.statutoryPensionMonthlyNet).toBe(0)
    const instanceNetSum = Object.values(combined.byInstance).reduce((s, x) => s + x.monthlyNet, 0)
    expect(closeTo(combined.monthlyNetIncome, instanceNetSum, 1e-9)).toBe(true)
  })
})
