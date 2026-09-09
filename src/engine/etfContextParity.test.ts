/**
 * Issue #380 — ETF narrow typed calculation context: old/current parity.
 *
 * The ETF simulator migrated from the six-product `SimulationContext` to a
 * narrow `EtfCalculationContext`. Compare mode adapts the full context via
 * `etfContextFrom` (fair-comparison bAV anchor); combine mode builds the
 * narrow context directly from each instance (real contribution + capital
 * policy + shared saver allowance) with NO neutralised unrelated-product
 * inputs and no `buildContext` funding pre-pass.
 *
 * Every expectation below is a FROZEN PRE-CHANGE value (see
 * `etfContextParity.fixture.ts`): captured from the engine BEFORE the
 * migration, with full float precision. These are internal regression
 * anchors — do not regenerate to make a failing test pass. The combined
 * fixtures cover the interaction cases the issue calls out: multi-ETF
 * allowance sharing, transfer events (certified + surrender_reinvest), a
 * paid-up instance, and a seeded Monte-Carlo path.
 *
 * Fixture comparison uses `expectMatchesFixture` (below) rather than
 * `toEqual`: identical IEEE-754 double *operations* are not reproducible
 * bit-for-bit across platforms once transcendentals (`Math.pow` for compound
 * growth) are involved, so the same engine code yields last-digit differences
 * between macOS and Linux/Node 22. The comparator keeps structure, strings,
 * booleans, `null`, integers and structural zeros EXACT and allows only a
 * last-digit float drift (see `FLOAT_ULP_TOLERANCE`). Neither the engine nor
 * the fixture rounds anything.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { simulateRetirementComparison } from './simulate'
import { simulatePortfolio, NEUTRALISED_BAV } from './portfolioAdapter'
import { runMonteCarlo } from './monteCarlo'
import { migrateV1ToV2 } from '../storage'
import { calculateBavFunding } from './salary'
import {
  buildContext,
  buildEtfCalculationContext,
  etfContextFrom,
} from './simulationContext'
import {
  simulate as simulateViaRegistry,
  simulateEtf,
} from './products/etf'
import { ETF_PARITY_FIXTURE } from './etfContextParity.fixture'
import type { EtfInstance, InsuranceInstance, TransferEvent } from '../domain/instances'
import type { Workspace } from '../domain/workspace'
import type { EtfProductResult, ProductId, ProductResult } from '../domain'

// ---------------------------------------------------------------------------
// Portable fixture comparator
// ---------------------------------------------------------------------------

/**
 * Relative float tolerance, in units of `Number.EPSILON` (1 unit ≈ 1 ulp of
 * the mantissa). The largest drift actually observed between the macOS freeze
 * and Linux/Node 22 for these fixtures is ~19 units (a `taxDue` cent amount);
 * 64 leaves ~3× headroom while still rejecting anything above the 15th
 * significant digit. A euro amount of €100 000 may differ by ~1.5e-9 €.
 */
const FLOAT_ULP_TOLERANCE = 64

/**
 * Absolute floor for the tolerance, in the unit of the compared leaf (euros
 * for every monetary field here). It exists solely for values that are the
 * residual of catastrophic cancellation — e.g. the payout-phase
 * `capitalAtEnd` of the final year, ~4.5e-9 €, which is the difference of two
 * ~1.2e4 € numbers and therefore carries no significant digits at all (the
 * observed drift there is 1.4e-10 €). A billionth of a euro can never hide a
 * meaningful monetary error, and it stays below the relative bound for every
 * leaf above ~4.5e4 €.
 */
const FLOAT_ABSOLUTE_FLOOR = 1e-9

function numbersMatch(actual: number, expected: number): boolean {
  if (Object.is(actual, expected)) return true
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false
  // Discrete quantities — counts, ages, calendar/contract years, whole-euro
  // statutory constants such as the €1 000 Sparerpauschbetrag — are produced
  // by exact integer arithmetic and must reproduce exactly.
  if (Number.isInteger(actual) && Number.isInteger(expected)) return false
  // Structural zeros (no employer contribution, clamped cost basis) likewise.
  if (expected === 0) return false
  const tolerance = Math.max(
    FLOAT_ABSOLUTE_FLOOR,
    Math.max(Math.abs(actual), Math.abs(expected)) * FLOAT_ULP_TOLERANCE * Number.EPSILON,
  )
  return Math.abs(actual - expected) <= tolerance
}

function fail(path: string, actual: unknown, expected: unknown, why: string): never {
  throw new Error(
    `parity mismatch at ${path}: ${why}\n  expected (frozen): ${String(expected)}\n  actual   (current): ${String(actual)}`,
  )
}

/**
 * Recursive fixture comparison. Structure, strings, booleans and `null` are
 * compared exactly; numbers via `numbersMatch`. The fixture was captured
 * through JSON, so keys whose value was `undefined` are absent from it — an
 * absent fixture key therefore requires the actual value to be `undefined`,
 * while a fixture key with a defined value that is missing (or `undefined`)
 * on the actual side fails.
 */
function expectMatchesFixture(actual: unknown, expected: unknown, path = '$'): void {
  if (expected === undefined) {
    if (actual !== undefined) fail(path, actual, expected, 'expected no value')
    return
  }
  if (expected === null) {
    if (actual !== null) fail(path, actual, expected, 'expected null')
    return
  }
  if (typeof expected === 'number') {
    if (typeof actual !== 'number') fail(path, actual, expected, 'expected a number')
    if (!numbersMatch(actual, expected)) fail(path, actual, expected, 'number differs beyond tolerance')
    return
  }
  if (typeof expected === 'string' || typeof expected === 'boolean') {
    if (!Object.is(actual, expected)) fail(path, actual, expected, `expected an exact ${typeof expected}`)
    return
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) fail(path, actual, '[array]', 'expected an array')
    if (actual.length !== expected.length) {
      fail(`${path}.length`, actual.length, expected.length, 'array length differs')
    }
    expected.forEach((item, i) => expectMatchesFixture(actual[i], item, `${path}[${i}]`))
    return
  }
  if (typeof expected === 'object') {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
      fail(path, actual, '[object]', 'expected an object')
    }
    const actualRecord = actual as Record<string, unknown>
    const expectedRecord = expected as Record<string, unknown>
    for (const key of Object.keys(expectedRecord)) {
      expectMatchesFixture(actualRecord[key], expectedRecord[key], `${path}.${key}`)
    }
    for (const key of Object.keys(actualRecord)) {
      if (key in expectedRecord) continue
      // JSON capture dropped `undefined`-valued optional fields; anything
      // else that appeared since the freeze is a real structural change.
      if (actualRecord[key] !== undefined) {
        fail(`${path}.${key}`, actualRecord[key], '<absent>', 'unexpected extra value')
      }
    }
    return
  }
  fail(path, actual, expected, 'unsupported fixture value type')
}

// ---------------------------------------------------------------------------
// Helpers — the exact workspaces the pre-change freeze ran
// ---------------------------------------------------------------------------

/** Full-precision projection of a result onto the frozen fixture slice. */
function frozenView(r: ProductResult) {
  const etf = r as EtfProductResult
  return {
    productId: r.productId,
    scenarioId: r.scenarioId,
    monthlyUserCost: r.monthlyUserCost,
    monthlyProductContribution: r.monthlyProductContribution,
    monthlyEmployerContribution: r.monthlyEmployerContribution,
    totalUserCost: r.totalUserCost,
    totalProductContributions: r.totalProductContributions,
    totalContributionsBeforeFees: r.totalContributionsBeforeFees,
    totalEmployerContributions: r.totalEmployerContributions,
    totalFees: r.totalFees,
    capitalAtRetirement: r.capitalAtRetirement,
    rawCapitalAtRetirement: r.rawCapitalAtRetirement,
    guaranteeFloorAtRetirement: r.guaranteeFloorAtRetirement,
    guaranteeApplied: r.guaranteeApplied,
    realCapitalAtRetirement: r.realCapitalAtRetirement,
    taxAndSvSavings: r.taxAndSvSavings,
    valueMultipleOnUserCost: r.valueMultipleOnUserCost,
    capitalMultipleAnnualized: r.capitalMultipleAnnualized,
    accumulationRiy: r.accumulationRiy,
    afterTaxLumpSum: r.afterTaxLumpSum,
    grossMonthlyPayout: r.grossMonthlyPayout,
    netMonthlyPayout: r.netMonthlyPayout,
    payoutEndAge: etf.payoutEndAge,
    rowCount: r.rows.length,
    rowFirst: r.rows[0],
    rowLast: r.rows[r.rows.length - 1],
    rowVorabPeak: r.rows.reduce((a, b) => (b.cumulativeVorabpauschale > a.cumulativeVorabpauschale ? b : a), r.rows[0]),
    payoutRowCount: etf.etfPayoutRows.length,
    payoutRowFirst: etf.etfPayoutRows[0],
    payoutRowLast: etf.etfPayoutRows[etf.etfPayoutRows.length - 1],
    instanceId: (r as ProductResult & { instanceId?: string }).instanceId,
    inputConfidence: (r as ProductResult & { inputConfidence?: string }).inputConfidence,
  }
}

function makeCompareDump(etfOverrides: Partial<EtfInstance>) {
  const assumptions = {
    ...defaultAssumptions,
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
    etf: { ...defaultAssumptions.etf, ...etfOverrides },
    visibleProducts: ['etf', 'bav'] as ProductId[],
  }
  const result = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
  return {
    bavMonthlyNetCost: result.bavFunding.monthlyNetCost,
    etf: result.products.filter(p => p.productId === 'etf').map(frozenView),
  }
}

function makeCombineWorkspace(): Workspace {
  const assumptions = {
    ...defaultAssumptions,
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
  }
  const ws = migrateV1ToV2(
    { ...defaultProfile } as unknown as Record<string, unknown>,
    assumptions as unknown as Record<string, unknown>,
  )
  const base = ws.baseline.assumptions.etf[0]

  const certifiedOut: TransferEvent = {
    type: 'certified',
    year: 2031,
    sourceInstanceId: 'etf-core',
    targetInstanceId: 'etf-side',
    amountEUR: 5000,
  }
  const certifiedIn: TransferEvent = { ...certifiedOut }
  const surrenderIn: TransferEvent = {
    type: 'surrender_reinvest',
    year: 2033,
    sourceInstanceId: 'ins-old',
    targetInstanceId: 'etf-side',
    amountEUR: 40000,
    surrenderHaircutPct: 0.05,
  }

  const core: EtfInstance = {
    ...base,
    instanceId: 'etf-core',
    label: 'ETF Core',
    status: 'active',
    contractStartYear: 2024,
    currentValueEUR: 12000,
    annualAssetFee: 0.002,
    equityPartialExemption: 0.3,
    annualContributionGrowthRate: 0,
    monthlyContribution: 250,
    evidenceMap: { annualAssetFee: 'user_confirmed' },
    transferEvents: [certifiedOut],
  }
  const side: EtfInstance = {
    ...base,
    instanceId: 'etf-side',
    label: 'ETF Side',
    status: 'active',
    contractStartYear: 2026,
    currentValueEUR: 3000,
    annualAssetFee: 0.0075,
    equityPartialExemption: 0.25,
    annualContributionGrowthRate: 0.03,
    monthlyContribution: 100,
    evidenceMap: { equityPartialExemption: 'statement' },
    transferEvents: [certifiedIn, surrenderIn],
  }
  const old: EtfInstance = {
    ...base,
    instanceId: 'etf-old',
    label: 'ETF Paid-up',
    status: 'paid_up',
    contractStartYear: 2016,
    currentValueEUR: 30000,
    annualAssetFee: 0.005,
    equityPartialExemption: 0.3,
    annualContributionGrowthRate: 0,
    monthlyContribution: 300, // must be ignored for paid_up
    evidenceMap: {},
    transferEvents: [],
  }
  const insBase = ws.baseline.assumptions.insurance[0]
  const insOld: InsuranceInstance = {
    ...insBase,
    instanceId: 'ins-old',
    label: 'Versicherung alt (gekündigt)',
    status: 'surrendered',
    currentValueEUR: 45000,
    evidenceMap: {},
    transferEvents: [],
  }

  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      partner: { ...defaultProfile, age: 29 },
      assumptions: {
        ...ws.baseline.assumptions,
        etf: [core, side, old],
        insurance: [insOld],
      },
    },
  }
}

// ---------------------------------------------------------------------------
// 0. The comparator itself — it must still catch real regressions
// ---------------------------------------------------------------------------

describe('ETF parity comparator — still fails on real deviations', () => {
  const stage = ETF_PARITY_FIXTURE.compareDefault.etf[0]

  it('accepts only last-digit drift on a float leaf', () => {
    const capital = stage.capitalAtRetirement // ≈ 9.2e4 €
    // One ulp up: platform drift, tolerated.
    expectMatchesFixture(
      { ...stage, capitalAtRetirement: capital + Number.EPSILON * capital },
      stage,
    )
    // One cent: a meaningful numeric error, rejected.
    expect(() =>
      expectMatchesFixture({ ...stage, capitalAtRetirement: capital + 0.01 }, stage),
    ).toThrow(/capitalAtRetirement/)
    // Even 1e-8 € — a millionth of a cent — is already ~7× the €92 000 bound.
    expect(() =>
      expectMatchesFixture({ ...stage, capitalAtRetirement: capital + 1e-8 }, stage),
    ).toThrow(/beyond tolerance/)
  })

  it('rejects a missing defined stage, field or array element', () => {
    const withoutCapital: Record<string, unknown> = { ...stage }
    delete withoutCapital.capitalAtRetirement
    expect(() => expectMatchesFixture(withoutCapital, stage)).toThrow(/capitalAtRetirement/)
    expect(() => expectMatchesFixture({ ...stage, capitalAtRetirement: undefined }, stage))
      .toThrow(/capitalAtRetirement/)
    expect(() => expectMatchesFixture([], ETF_PARITY_FIXTURE.compareDefault.etf))
      .toThrow(/length/)
    expect(() => expectMatchesFixture(null, stage)).toThrow(/expected an object/)
  })

  it('keeps discrete values, structural zeros, strings and booleans exact', () => {
    expect(() => expectMatchesFixture({ ...stage, rowCount: stage.rowCount + 1 }, stage))
      .toThrow(/rowCount/)
    expect(() => expectMatchesFixture({ ...stage, totalEmployerContributions: 1e-12 }, stage))
      .toThrow(/totalEmployerContributions/)
    expect(() => expectMatchesFixture({ ...stage, scenarioId: 'basis' }, stage))
      .toThrow(/scenarioId/)
    expect(() => expectMatchesFixture({ ...stage, guaranteeApplied: true }, stage))
      .toThrow(/guaranteeApplied/)
  })

  it('treats absent optional fields as undefined, but not as free-form extras', () => {
    // The JSON-captured fixture has no `instanceId` key for compare mode.
    expect('instanceId' in stage).toBe(false)
    expectMatchesFixture({ ...stage, instanceId: undefined }, stage)
    expect(() => expectMatchesFixture({ ...stage, instanceId: 'etf-core' }, stage))
      .toThrow(/instanceId/)
  })
})

// ---------------------------------------------------------------------------
// 1. Compare mode — registry entry adapts the full SimulationContext
// ---------------------------------------------------------------------------

describe('ETF narrow context — compare-mode parity (frozen pre-change)', () => {
  it('default ETF assumptions reproduce the pre-change engine', () => {
    const actual = makeCompareDump({})
    expectMatchesFixture(
      actual.bavMonthlyNetCost,
      ETF_PARITY_FIXTURE.compareDefault.bavMonthlyNetCost,
      '$.bavMonthlyNetCost',
    )
    expectMatchesFixture(actual.etf, ETF_PARITY_FIXTURE.compareDefault.etf, '$.compareDefault.etf')
  })

  it('Beitragsdynamik + fee + Teilfreistellung variant reproduces the pre-change engine', () => {
    const actual = makeCompareDump({
      annualContributionGrowthRate: 0.03,
      annualAssetFee: 0.01,
      equityPartialExemption: 0.25,
    })
    expectMatchesFixture(actual.etf, ETF_PARITY_FIXTURE.compareGrowth.etf, '$.compareGrowth.etf')
  })
})

// ---------------------------------------------------------------------------
// 2. Combine mode — narrow per-instance path (multi-ETF + transfers + paid-up)
// ---------------------------------------------------------------------------

describe('ETF narrow context — combine-mode parity (frozen pre-change)', () => {
  it('multi-ETF workspace with transfers and a paid-up contract reproduces the pre-change engine', () => {
    const { perInstance } = simulatePortfolio(makeCombineWorkspace(), de2026Rules)
    for (const id of ['etf-core', 'etf-side', 'etf-old'] as const) {
      const actual = (perInstance[id] ?? []).map(frozenView)
      expectMatchesFixture(actual, ETF_PARITY_FIXTURE.combineEtf[id], `$.combineEtf.${id}`)
    }
  })

  it('paid-up ETF stops contributions but keeps growing from currentValueEUR', () => {
    const { perInstance } = simulatePortfolio(makeCombineWorkspace(), de2026Rules)
    const paidUp = perInstance['etf-old'][0]
    expect(paidUp.monthlyUserCost).toBe(0)
    expect(paidUp.totalUserCost).toBe(0)
    expect(paidUp.capitalAtRetirement).toBeGreaterThan(0)
  })

  it('certified transfer moves capital between ETF instances (outbound withdrawal + inbound injection)', () => {
    const ws = makeCombineWorkspace()
    const withTransfer = simulatePortfolio(ws, de2026Rules).perInstance
    // Same workspace minus both transfer-event records.
    const withoutTransfer = simulatePortfolio({
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          etf: ws.baseline.assumptions.etf.map((e) => ({ ...e, transferEvents: [] })),
        },
      },
    }, de2026Rules).perInstance

    const sideBase = withTransfer['etf-side'][0]
    const sideNoTransfer = withoutTransfer['etf-side'][0]
    // Target received the certified €5 000 injection (no cost-basis bump).
    expect(sideBase.capitalAtRetirement).toBeGreaterThan(sideNoTransfer.capitalAtRetirement)

    const coreBase = withTransfer['etf-core'][0]
    const coreNoTransfer = withoutTransfer['etf-core'][0]
    // Source paid out the €5 000.
    expect(coreBase.capitalAtRetirement).toBeLessThan(coreNoTransfer.capitalAtRetirement)
  })

  it('surrender_reinvest target receives after-tax proceeds AND a cost-basis injection', () => {
    const ws = makeCombineWorkspace()
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const sideBasis = perInstance['etf-side'][0]
    // Contributions basis: monthly €100 over 39y + €3 000 initial + certified €5 000
    // + after-tax surrender injection — strictly more than the cash total.
    expect(sideBasis.totalContributionsBeforeFees).toBeGreaterThan(100 * 12 * 39)
  })
})

// ---------------------------------------------------------------------------
// 3. Seeded Monte Carlo — shared market path flows through the narrow context
// ---------------------------------------------------------------------------

describe('ETF narrow context — seeded Monte Carlo parity (frozen pre-change)', () => {
  it('ETF percentiles and yearly bands reproduce the pre-change engine', () => {
    const mc = runMonteCarlo({
      profile: defaultProfile,
      assumptions: {
        ...defaultAssumptions,
        bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
        monteCarlo: { ...defaultAssumptions.monteCarlo, runs: 40, seed: 4242, annualVolatility: 0.18 },
      },
      rules: de2026Rules,
      scenarioId: 'basis',
      visibleProducts: ['etf', 'bav'],
    })
    expect(mc?.seed).toBe(ETF_PARITY_FIXTURE.monteCarlo.seed)
    expect(mc?.runs).toBe(ETF_PARITY_FIXTURE.monteCarlo.runs)
    expectMatchesFixture(
      mc?.summaries.find(s => s.productId === 'etf') ?? null,
      ETF_PARITY_FIXTURE.monteCarlo.etfSummary,
      '$.monteCarlo.etfSummary',
    )
    expectMatchesFixture(
      (mc?.yearlyBands ?? []).filter(b => b.productId === 'etf' && [1, 20, 39].includes(b.year)),
      ETF_PARITY_FIXTURE.monteCarlo.etfBands,
      '$.monteCarlo.etfBands',
    )
  })
})

// ---------------------------------------------------------------------------
// 4. Adapter convergence — full context and narrow context agree
// ---------------------------------------------------------------------------

describe('ETF narrow context — adapter convergence', () => {
  const overrides = {
    etfMonthlyUserCostOverride: 333,
    instanceCapitalPolicy: {
      initialCapital: 8000,
      capitalInjections: [{ year: 4, amount: 1500 }],
    },
    etfSaverAllowanceOverride: (yearIndex: number) => (yearIndex < 5 ? 250 : 1000),
  }
  const scenario = defaultAssumptions.returnScenarios.find(s => s.id === 'basis')!

  it('registry entry (full context) and narrow simulator produce identical results', () => {
    const ctx = buildContext(defaultProfile, defaultAssumptions, de2026Rules, overrides)
    expect(simulateEtf(etfContextFrom(ctx), scenario))
      .toEqual(simulateViaRegistry(ctx, scenario))
  })

  it('direct narrow builder (combine-style) matches the full-context adapter', () => {
    const ctx = buildContext(defaultProfile, defaultAssumptions, de2026Rules, overrides)
    const narrow = buildEtfCalculationContext({
      profile: defaultProfile,
      rules: de2026Rules,
      assumptions: {
        etf: defaultAssumptions.etf,
        inflationRate: defaultAssumptions.inflationRate,
        retirementEndAge: defaultAssumptions.retirementEndAge,
      },
      monthlyUserCost: 333,
      instanceCapitalPolicy: overrides.instanceCapitalPolicy,
      saverAllowanceOverride: overrides.etfSaverAllowanceOverride,
    })
    expect(simulateEtf(narrow, scenario)).toEqual(simulateViaRegistry(ctx, scenario))
  })

  it('compare adapter resolves the fair-comparison bAV anchor when no override is set', () => {
    const ctx = buildContext(defaultProfile, defaultAssumptions, de2026Rules)
    const narrow = etfContextFrom(ctx)
    expect(narrow.monthlyUserCost).toBe(ctx.bavFunding.monthlyNetCost)
    expect(narrow.monthlyUserCost).toBeGreaterThan(0)
  })

  it('narrow builder derives yearsToRetirement with the same formula as buildContext', () => {
    const ctx = buildContext(defaultProfile, defaultAssumptions, de2026Rules)
    expect(buildEtfCalculationContext({
      profile: defaultProfile,
      rules: de2026Rules,
      assumptions: defaultAssumptions,
      monthlyUserCost: 100,
    }).yearsToRetirement).toBe(ctx.yearsToRetirement)
  })
})

// ---------------------------------------------------------------------------
// 5. Documented fallback contract — why `monthlyContribution ?? 0` is parity
// ---------------------------------------------------------------------------

describe('ETF narrow context — undefined monthlyContribution fallback', () => {
  it('neutralised bAV funding yields a zero net-cost anchor, so `?? 0` is byte-identical', () => {
    // Before the migration, a combine-mode ETF instance without
    // `monthlyContribution` fell back to `bavFunding.monthlyNetCost` computed
    // from the NEUTRALISED bAV projection. That anchor is exactly 0 — the
    // narrow path hardcodes the same 0 (pinned by
    // portfolioAdapter.test.ts "falls back to ctx bavFunding").
    expect(calculateBavFunding(defaultProfile, de2026Rules, NEUTRALISED_BAV).monthlyNetCost).toBe(0)
  })
})
