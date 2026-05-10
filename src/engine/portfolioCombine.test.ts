/**
 * Tests for `combinePortfolio` (Group G issue 08, milestone M2.6).
 *
 * Coverage map (per the issue 08 test plan):
 *   1. Oracle byte-identity      — single-instance combine equals
 *      `simulateRetirementComparison`'s per-product `netMonthlyPayout` for the
 *      same product slot. Ran for bAV, pAV, Basisrente, AVD, Riester, ETF.
 *   2. Combine oracle            — 2 bAV + 1 ETF baseline, hand-derived expected
 *      `monthlyNetIncome`.
 *   3. Why summing fails         — sum of per-instance compare-mode runs
 *      diverges from `combinePortfolio`'s aggregate (under-counts tax,
 *      over-counts §226(2) Freibetrag).
 *   4. BBG ceiling               — gross sum > BBG → KV/PV apportioned at the
 *      BBG cap, each source proportional.
 *   5. Mixed insurance tax modes — 2 pAV with halbeinkuenfte + abgeltungsteuer
 *      route through the new `privateInsuranceContributions` lane.
 *   6. Edge: empty baseline      — only GRV → GRV-only result, no errors.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import { simulateRetirementComparison } from './simulate'
import { simulatePortfolio } from './portfolioAdapter'
import { combinePortfolio, type CombineContext } from './portfolioCombine'
import { buildCombineContext } from './combineContext'
import { calculateRetirementTax } from './retirementTax'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  RiesterInstance,
} from '../domain/instances'
import type { Workspace } from '../domain/workspace'
import type { PersonalProfile, ProductResult } from '../domain'
import type { ScenarioAssumptions } from '../domain/results'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseCombineContext(
  profile: PersonalProfile = defaultProfile,
  grvGrossMonthlyPension = 0,
  filingStatus: 'single' | 'married' = 'single',
): CombineContext {
  return {
    profile,
    rules: de2026Rules,
    retirementYear: de2026Rules.year + (profile.retirementAge - profile.age),
    grvGrossMonthlyPension,
    statutoryPensionTaxChannel: grvGrossMonthlyPension > 0 ? 'statutory_pension' : 'none',
    statutoryPensionKvChannel: grvGrossMonthlyPension > 0 ? 'kvdr_half_rate' : 'none',
    retirementHealthStatus: 'kvdr',
    filingStatus,
  }
}

function makeWorkspaceFromV1(
  bavMonthly = 0,
  etfActive = false,
  insActive = false,
  basisMonthly = 0,
  avdMonthly = 0,
  riesterMonthly = 0,
): Workspace {
  const v1 = {
    ...defaultAssumptions,
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: bavMonthly },
    basisrente: { ...defaultAssumptions.basisrente, monthlyGrossContribution: basisMonthly },
    altersvorsorgedepot: {
      ...defaultAssumptions.altersvorsorgedepot,
      monthlyOwnContribution: avdMonthly,
    },
    riester: { ...defaultAssumptions.riester, monthlyOwnContribution: riesterMonthly },
  }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  // The migration emits length-1 arrays only when the singleton had non-zero
  // contribution. Drop unwanted instances (etf / insurance) when callers don't
  // want them in the test workspace.
  if (!etfActive) ws.baseline.assumptions.etf = []
  if (!insActive) ws.baseline.assumptions.insurance = []
  return ws
}

function findResult(
  results: ProductResult[],
  productId: ProductResult['productId'],
): ProductResult | undefined {
  return results.find((r) => r.productId === productId)
}

// ---------------------------------------------------------------------------
// 1. Oracle byte-identity — single-instance combine matches per-product net
// ---------------------------------------------------------------------------

describe('combinePortfolio — single-instance byte-identity', () => {
  it('single bAV instance: combine produces the same bAV net + GRV net as simulateRetirementComparison', () => {
    // Arrange: workspace with a single bAV instance (200 EUR/month) + GRV.
    const workspace = makeWorkspaceFromV1(200, false, false, 0, 0, 0)
    workspace.baseline.assumptions.visibleProducts = ['bav']
    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const bavInstanceId = workspace.baseline.assumptions.bav[0].instanceId
    const bavResults = perInstance[bavInstanceId]
    expect(bavResults?.length).toBe(defaultAssumptions.returnScenarios.length)
    // Pick the basis scenario.
    const bavBasis = bavResults!.find((r) => r.scenarioId === 'basis')!

    // Build the legacy comparison run for the same workspace projected to a
    // singleton-shaped ScenarioAssumptions, then read GRV gross + bAV net.
    const projectedSingleton: ScenarioAssumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
      visibleProducts: ['bav'],
    }
    const legacy = simulateRetirementComparison(defaultProfile, projectedSingleton, de2026Rules)
    const grvGross = legacy.statutoryPension.grossMonthlyPension
    const grvNet = legacy.statutoryPension.netMonthlyPension
    const legacyBavBasis = findResult(
      legacy.products.filter((p) => p.scenarioId === 'basis'),
      'bav',
    )!

    // Sanity: per-instance simulator output is byte-identical to the legacy
    // singleton run (M1 invariant).
    expect(bavBasis.netMonthlyPayout).toBe(legacyBavBasis.netMonthlyPayout)

    // Act: combine.
    const ctx = makeBaseCombineContext(defaultProfile, grvGross)
    const combined = combinePortfolio(workspace, [bavBasis], ctx)

    // Assert: combine's per-instance bAV share equals the legacy bAV net
    // exactly (single-instance byte-identity) and combined monthly net ≈
    // grvNet + bavNet.
    expect(combined.byInstance[bavInstanceId].monthlyNet).toBeCloseTo(
      legacyBavBasis.netMonthlyPayout,
      6,
    )
    expect(combined.statutoryPensionMonthlyNet).toBeCloseTo(grvNet, 6)
    expect(combined.monthlyNetIncome).toBeCloseTo(grvNet + legacyBavBasis.netMonthlyPayout, 6)
  })

  it('single Basisrente instance: combine produces the same Basisrente net + GRV net as simulateRetirementComparison', () => {
    const workspace = makeWorkspaceFromV1(0, false, false, 200, 0, 0)
    workspace.baseline.assumptions.visibleProducts = ['basisrente']
    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const basisInstanceId = workspace.baseline.assumptions.basisrente[0].instanceId
    const basisResults = perInstance[basisInstanceId]
    const basisBasis = basisResults!.find((r) => r.scenarioId === 'basis')!

    const projectedSingleton: ScenarioAssumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 0 },
      basisrente: { ...defaultAssumptions.basisrente, monthlyGrossContribution: 200 },
      visibleProducts: ['basisrente'],
    }
    const legacy = simulateRetirementComparison(defaultProfile, projectedSingleton, de2026Rules)
    const grvGross = legacy.statutoryPension.grossMonthlyPension
    const legacyBasis = findResult(
      legacy.products.filter((p) => p.scenarioId === 'basis'),
      'basisrente',
    )!

    const ctx = makeBaseCombineContext(defaultProfile, grvGross)
    const combined = combinePortfolio(workspace, [basisBasis], ctx)
    // Tightened from precision-4 to precision-6: drift investigation (Goal 3)
    // confirmed byte-identity — the diff is 0. Conservative precision-4 was
    // a placeholder during development; no engine change needed.
    expect(combined.byInstance[basisInstanceId].monthlyNet).toBeCloseTo(
      legacyBasis.netMonthlyPayout,
      6,
    )
  })

  it('single pAV instance (leibrente): combine net matches simulateRetirementComparison', () => {
    // pAV with leibrente → InsuranceTaxMode 'ertragsanteil'. The combine path
    // routes via privateInsuranceContributions with mode 'ertragsanteil';
    // the compare-mode path routes via privateInsuranceTaxableAnnual + mode.
    // Both call calculateRetirementTax with the same ertragsanteil fraction.
    const workspace = makeWorkspaceFromV1(0, false, true, 0, 0, 0)
    workspace.baseline.assumptions.visibleProducts = ['versicherung']
    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const insInstanceId = workspace.baseline.assumptions.insurance[0].instanceId
    const insResults = perInstance[insInstanceId]
    const insBasis = insResults!.find((r) => r.scenarioId === 'basis')!

    // Legacy singleton run: neutralised bAV (0 conversion) so the pAV gets the
    // full fair-comparison bAV net-cost as its investment budget (which is 0).
    const projectedSingleton: ScenarioAssumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 0 },
      visibleProducts: ['versicherung'],
    }
    const legacy = simulateRetirementComparison(defaultProfile, projectedSingleton, de2026Rules)
    const grvGross = legacy.statutoryPension.grossMonthlyPension
    const legacyPav = findResult(
      legacy.products.filter((p) => p.scenarioId === 'basis'),
      'versicherung',
    )!

    // Sanity: per-instance simulator output matches the legacy singleton.
    expect(insBasis.netMonthlyPayout).toBe(legacyPav.netMonthlyPayout)

    const ctx = makeBaseCombineContext(defaultProfile, grvGross)
    const combined = combinePortfolio(workspace, [insBasis], ctx)
    // Single-instance pAV byte-identity: precision-6 (~1e-6 EUR tolerance).
    expect(combined.byInstance[insInstanceId].monthlyNet).toBeCloseTo(
      legacyPav.netMonthlyPayout,
      6,
    )
    // pAV is not a Versorgungsbezug → no KV/PV for KVdR members.
    expect(combined.byInstance[insInstanceId].kvPvShare).toBe(0)
  })

  it('single AVD instance: combine net matches simulateRetirementComparison', () => {
    // AVD routes via taxChannel 'other_22_5' (§22 Nr. 5 EStG — full marginal),
    // no KV/PV for KVdR members. The marginal delta in instanceMarginalTax
    // subtracts from otherTaxableAnnual, matching the compare-mode marginal.
    const workspace = makeWorkspaceFromV1(0, false, false, 0, 200, 0)
    workspace.baseline.assumptions.visibleProducts = ['altersvorsorgedepot']
    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const avdInstanceId = workspace.baseline.assumptions.altersvorsorgedepot[0].instanceId
    const avdResults = perInstance[avdInstanceId]
    const avdBasis = avdResults!.find((r) => r.scenarioId === 'basis')!

    const projectedSingleton: ScenarioAssumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 0 },
      altersvorsorgedepot: {
        ...defaultAssumptions.altersvorsorgedepot,
        monthlyOwnContribution: 200,
      },
      visibleProducts: ['altersvorsorgedepot'],
    }
    const legacy = simulateRetirementComparison(defaultProfile, projectedSingleton, de2026Rules)
    const grvGross = legacy.statutoryPension.grossMonthlyPension
    const legacyAvd = findResult(
      legacy.products.filter((p) => p.scenarioId === 'basis'),
      'altersvorsorgedepot',
    )!

    // Sanity: per-instance output matches the legacy singleton.
    expect(avdBasis.netMonthlyPayout).toBe(legacyAvd.netMonthlyPayout)

    const ctx = makeBaseCombineContext(defaultProfile, grvGross)
    const combined = combinePortfolio(workspace, [avdBasis], ctx)
    // Single-instance AVD byte-identity.
    expect(combined.byInstance[avdInstanceId].monthlyNet).toBeCloseTo(
      legacyAvd.netMonthlyPayout,
      6,
    )
    // AVD is not a Versorgungsbezug → no KV/PV for KVdR members.
    expect(combined.byInstance[avdInstanceId].kvPvShare).toBe(0)
  })

  it('single Riester instance: combine net matches simulateRetirementComparison', () => {
    // Riester routes via taxChannel 'other_22_5' (§22 Nr. 5 EStG), same as AVD.
    // KVdR members owe no KV/PV on Riester payouts.
    const workspace = makeWorkspaceFromV1(0, false, false, 0, 0, 100)
    workspace.baseline.assumptions.visibleProducts = ['riester']
    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const riesterInstanceId = workspace.baseline.assumptions.riester[0].instanceId
    const riesterResults = perInstance[riesterInstanceId]
    const riesterBasis = riesterResults!.find((r) => r.scenarioId === 'basis')!

    const projectedSingleton: ScenarioAssumptions = {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 0 },
      riester: { ...defaultAssumptions.riester, monthlyOwnContribution: 100 },
      visibleProducts: ['riester'],
    }
    const legacy = simulateRetirementComparison(defaultProfile, projectedSingleton, de2026Rules)
    const grvGross = legacy.statutoryPension.grossMonthlyPension
    const legacyRiester = findResult(
      legacy.products.filter((p) => p.scenarioId === 'basis'),
      'riester',
    )!

    // Sanity: per-instance output matches the legacy singleton.
    expect(riesterBasis.netMonthlyPayout).toBe(legacyRiester.netMonthlyPayout)

    const ctx = makeBaseCombineContext(defaultProfile, grvGross)
    const combined = combinePortfolio(workspace, [riesterBasis], ctx)
    // Single-instance Riester byte-identity.
    expect(combined.byInstance[riesterInstanceId].monthlyNet).toBeCloseTo(
      legacyRiester.netMonthlyPayout,
      6,
    )
    // Riester is not a Versorgungsbezug → no KV/PV for KVdR members.
    expect(combined.byInstance[riesterInstanceId].kvPvShare).toBe(0)
  })

  it('single ETF instance: combine passes through netMonthlyPayout (Abgeltungsteuer flat tax)', () => {
    // The migration creates a length-1 ETF array because the ETF singleton is
    // always meaningful. Use that path directly.
    const workspace = makeWorkspaceFromV1(0, true, false, 0, 0, 0)
    workspace.baseline.assumptions.visibleProducts = ['etf']
    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const etfInstanceId = workspace.baseline.assumptions.etf[0].instanceId
    const etfResults = perInstance[etfInstanceId]
    const etfBasis = etfResults!.find((r) => r.scenarioId === 'basis')!

    const ctx = makeBaseCombineContext(defaultProfile, 0)
    const combined = combinePortfolio(workspace, [etfBasis], ctx)
    expect(combined.byInstance[etfInstanceId].monthlyNet).toBeCloseTo(
      etfBasis.netMonthlyPayout,
      6,
    )
    expect(combined.byInstance[etfInstanceId].kvPvShare).toBe(0)
    expect(combined.aggregateTax.zuVersteuerndesEinkommen).toBe(0) // ETF doesn't enter progressive base
  })
})

// ---------------------------------------------------------------------------
// 2. Combine oracle — 2 bAV + 1 ETF baseline
// ---------------------------------------------------------------------------

describe('combinePortfolio — 2 bAV + 1 ETF combine oracle', () => {
  it('two bAV instances aggregate Versorgungsbezüge and produce a deterministic combined net', () => {
    // Setup: start from a length-1 bAV migration (200 EUR/month), then APPEND
    // a second bAV instance at 100 EUR/month manually. ETF migrates to length-1
    // automatically.
    const workspace = makeWorkspaceFromV1(200, true, false, 0, 0, 0)
    workspace.baseline.assumptions.visibleProducts = ['bav', 'etf']
    const baseBav = workspace.baseline.assumptions.bav[0]
    const secondBav: BavInstance = {
      ...baseBav,
      instanceId: 'bav-second',
      label: 'bAV #2',
      monthlyGrossConversion: 100,
    }
    workspace.baseline.assumptions.bav = [baseBav, secondBav]

    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const bav1 = perInstance[baseBav.instanceId].find((r) => r.scenarioId === 'basis')!
    const bav2 = perInstance['bav-second'].find((r) => r.scenarioId === 'basis')!
    const etfInstanceId = workspace.baseline.assumptions.etf[0].instanceId
    const etfResult = perInstance[etfInstanceId].find((r) => r.scenarioId === 'basis')!

    const grvGross =
      simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
        .statutoryPension.grossMonthlyPension
    const ctx = makeBaseCombineContext(defaultProfile, grvGross)
    const combined = combinePortfolio(workspace, [bav1, bav2, etfResult], ctx)

    // Hand-verified properties (no separate "oracle number" — the engine itself
    // is the oracle, but we pin invariants):
    //
    // (a) Combined bAV gross = bav1.gross + bav2.gross.
    const bavSumGross = bav1.grossMonthlyPayout + bav2.grossMonthlyPayout
    expect(combined.monthlyGrossPayouts.bav).toBeCloseTo(bavSumGross, 6)

    // (b) Per-instance bAV nets sum to the combined bAV net (within 1 ct).
    const sumBavNets =
      combined.byInstance[baseBav.instanceId].monthlyNet +
      combined.byInstance['bav-second'].monthlyNet
    const combinedBavNet =
      bavSumGross -
      (combined.byInstance[baseBav.instanceId].taxShareAnnual +
        combined.byInstance['bav-second'].taxShareAnnual) /
        12 -
      (combined.byInstance[baseBav.instanceId].kvPvShare +
        combined.byInstance['bav-second'].kvPvShare)
    expect(sumBavNets).toBeCloseTo(combinedBavNet, 4)

    // (c) Aggregate tax = single calculateRetirementTax over (GRV + sumBav) gross.
    //    Pin the engine internal — combined.aggregateTax came from one call.
    const expectedTax = calculateRetirementTax(
      {
        statutoryPensionAnnual: grvGross * 12,
        bavPensionAnnual: bavSumGross * 12,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        otherTaxableAnnual: 0,
        retirementYear: ctx.retirementYear,
      },
      de2026Rules,
      'single',
    )
    expect(combined.aggregateTax.totalTaxAnnual).toBeCloseTo(expectedTax.totalTaxAnnual, 6)

    // (d) §226(2) Freibetrag applied ONCE on aggregate Versorgungsbezüge.
    //     bavKv was computed against (bav1+bav2) − single Freibetrag, scaled
    //     by healthRate (incl. user's additional contribution). Two
    //     individual calls would have applied the Freibetrag twice. The check:
    //     bavKvMonthly equals (bavSum − kvFreibetrag) × healthRate, NOT
    //     (bavSum − 2 × kvFreibetrag) × healthRate.
    const kvFreibetrag = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly
    const additionalRate = (defaultProfile.healthAdditionalContributionPct ?? 0) / 100
    const healthRate = de2026Rules.socialSecurity.healthGeneralRate + additionalRate
    const expectedBavKvOnce = Math.max(0, bavSumGross - kvFreibetrag) * healthRate
    // Allow up to 1% slack for BBG cap interaction at high gross.
    expect(combined.aggregateKvPv.bavKvMonthly).toBeCloseTo(expectedBavKvOnce, 0)

    // (e) ETF passthrough — combine.monthlyNet for ETF instance equals etfResult.netMonthlyPayout.
    expect(combined.byInstance[etfInstanceId].monthlyNet).toBeCloseTo(etfResult.netMonthlyPayout, 6)

    // (f) Aggregate monthly net is positive.
    expect(combined.monthlyNetIncome).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Why summing standalone runs would fail
// ---------------------------------------------------------------------------

describe('combinePortfolio — why summing standalone runs fails', () => {
  it('sum of per-instance compare-mode runs over-counts §226(2) Freibetrag and under-counts progressive tax', () => {
    // Setup: 3 bAV instances at 800 EUR/month each (aggregate 2400/month >>
    // §226(2) Freibetrag of ~187/month). High aggregate exposes both errors.
    const workspace = makeWorkspaceFromV1(800, false, false, 0, 0, 0)
    workspace.baseline.assumptions.visibleProducts = ['bav']
    const baseBav = workspace.baseline.assumptions.bav[0]
    const bav2: BavInstance = { ...baseBav, instanceId: 'bav-2', monthlyGrossConversion: 800 }
    const bav3: BavInstance = { ...baseBav, instanceId: 'bav-3', monthlyGrossConversion: 800 }
    workspace.baseline.assumptions.bav = [baseBav, bav2, bav3]

    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const bavRuns = [baseBav, bav2, bav3].map(
      (b) => perInstance[b.instanceId].find((r) => r.scenarioId === 'basis')!,
    )

    const grvGross =
      simulateRetirementComparison(defaultProfile, defaultAssumptions, de2026Rules)
        .statutoryPension.grossMonthlyPension
    const ctx = makeBaseCombineContext(defaultProfile, grvGross)
    const combined = combinePortfolio(workspace, bavRuns, ctx)

    // Sum of standalone bAV nets (each run thinks it's the only Versorgungsbezug —
    // each gets the §226(2) Freibetrag once → over-counted by 2x and each only
    // sees its own marginal tax bracket → under-counted progressivity).
    const sumStandalone = bavRuns.reduce((s, r) => s + r.netMonthlyPayout, 0)
    const sumCombined =
      combined.byInstance[baseBav.instanceId].monthlyNet +
      combined.byInstance['bav-2'].monthlyNet +
      combined.byInstance['bav-3'].monthlyNet

    // The standalone sum is HIGHER than the combined sum because the standalone
    // path applied the Freibetrag 3x (and missed progressive bracket creep).
    expect(sumStandalone).toBeGreaterThan(sumCombined)

    // Quantify: the difference must be at least the over-counted Freibetrag in
    // KV/PV terms — roughly 2 × kvFreibetragMonthly × healthRate
    // (very rough lower bound, since progressive tax adds another delta).
    const kvFreibetrag = de2026Rules.socialSecurity.kvFreibetragVersorgungMonthly
    const healthRate = de2026Rules.socialSecurity.healthGeneralRate
    const minExpectedDelta = 2 * kvFreibetrag * healthRate
    expect(sumStandalone - sumCombined).toBeGreaterThan(minExpectedDelta)
  })
})

// ---------------------------------------------------------------------------
// 4. BBG ceiling
// ---------------------------------------------------------------------------

describe('combinePortfolio — BBG ceiling', () => {
  it('aggregate gross > BBG → KV apportioned at the BBG cap × healthRate', () => {
    // Build a synthetic ProductResult set that pushes the aggregate gross above
    // the monthly KV/PV BBG (5,812.50 EUR in 2026). Use a bAV and a synthetic
    // pAV-like Versorgungsbezug. Simpler: a single bAV with very high gross.
    const ws = makeWorkspaceFromV1(2000, false, false, 0, 0, 0)
    const baseBav = ws.baseline.assumptions.bav[0]
    // Add 3 more bAV instances summing to gross monthly > BBG.
    ws.baseline.assumptions.bav = [
      baseBav,
      { ...baseBav, instanceId: 'bav-a', monthlyGrossConversion: 2000 },
      { ...baseBav, instanceId: 'bav-b', monthlyGrossConversion: 2000 },
    ]
    ws.baseline.assumptions.visibleProducts = ['bav']
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const bavRuns = ws.baseline.assumptions.bav.map(
      (b) => perInstance[b.instanceId].find((r) => r.scenarioId === 'basis')!,
    )

    // Synthesise a high-gross variant by overwriting `grossMonthlyPayout` to
    // force the aggregate over BBG without depending on simulator internals.
    const inflated: ProductResult[] = bavRuns.map((r) => ({
      ...r,
      grossMonthlyPayout: 2500, // 3 × 2500 = 7500/month >> BBG (5812.50)
    }))

    const ctx = makeBaseCombineContext(defaultProfile, 0)
    const combined = combinePortfolio(ws, inflated, ctx)

    const totalGross = inflated.reduce((s, r) => s + r.grossMonthlyPayout, 0)
    const bbg = de2026Rules.socialSecurity.healthAndCareCapMonth
    expect(totalGross).toBeGreaterThan(bbg)

    // The aggregate KV assessment base was scaled by `bbg / kvAggregateBase`
    // (since the bAV-only base equals total Versorgungsbezuege − Freibetrag,
    // which after BBG scaling sums to BBG). Hence total KV contributions
    // from bAV ≤ bbg × healthRate (within ulp).
    const additionalRate = (defaultProfile.healthAdditionalContributionPct ?? 0) / 100
    const healthRate = de2026Rules.socialSecurity.healthGeneralRate + additionalRate
    const kvCap = bbg * healthRate
    expect(combined.aggregateKvPv.bavKvMonthly).toBeLessThanOrEqual(kvCap + 1)

    // Each instance's per-source kvPvShare is proportional to its gross within
    // the same kvPvChannel — equal grosses → equal shares.
    const ids = inflated.map((r) => r.instanceId!)
    const shares = ids.map((id) => combined.byInstance[id].kvPvShare)
    expect(shares[0]).toBeCloseTo(shares[1], 6)
    expect(shares[1]).toBeCloseTo(shares[2], 6)
  })
})

// ---------------------------------------------------------------------------
// 5. Mixed insurance tax modes (multi-pAV halbeinkuenfte + abgeltungsteuer)
// ---------------------------------------------------------------------------

describe('combinePortfolio — mixed insurance tax modes', () => {
  it('two pAV instances with different tax modes route through privateInsuranceContributions independently', () => {
    // Build a workspace with 2 pAV instances: one halbeinkuenfte-eligible (≥12y,
    // start age ≥ 50 so retirementAge ≥ 62), one abgeltungsteuer (short runtime
    // <12y). The current portfolioAdapter does NOT thread bavFunding into pAV/ETF
    // instance simulation (each gets a neutralised bAV → cashflow=0), so we
    // synthesise the ProductResult inputs directly to exercise combine in
    // isolation. (The full adapter-+-combine wiring is exercised by the
    // single-instance byte-identity tests above.)
    const ws = makeWorkspaceFromV1(0, false, true, 0, 0, 0)
    const baseIns = ws.baseline.assumptions.insurance[0]
    const insHalb: InsuranceInstance = {
      ...baseIns,
      instanceId: 'versicherung-halb',
      contractStartYear: 2010,
      payoutMode: 'kapitalverzehr',
    }
    const insAbgelt: InsuranceInstance = {
      ...baseIns,
      instanceId: 'versicherung-abgelt',
      contractStartYear: 2058,
      payoutMode: 'kapitalverzehr',
    }
    ws.baseline.assumptions.insurance = [insHalb, insAbgelt]
    ws.baseline.assumptions.visibleProducts = ['versicherung']

    // Synthesise per-instance ProductResults with a non-trivial gain so the
    // mixed-mode tax routing has something to bite into.
    const synthRes = (instanceId: string): ProductResult => ({
      productId: 'versicherung',
      label: 'pAV',
      scenarioId: 'basis',
      scenarioLabel: 'Basis',
      instanceId,
      annualReturn: 0.05,
      monthlyUserCost: 200,
      monthlyProductContribution: 200,
      monthlyEmployerContribution: 0,
      totalUserCost: 200 * 12 * 39,
      totalProductContributions: 200 * 12 * 39,
      totalEmployerContributions: 0,
      totalFees: 0,
      capitalAtRetirement: 200_000, // 100% gain over 93,600 contributions
      realCapitalAtRetirement: 100_000,
      afterTaxLumpSum: 180_000,
      grossMonthlyPayout: 1_000,
      netMonthlyPayout: 850,
      taxAndSvSavings: 0,
      valueMultipleOnUserCost: null,
      capitalMultipleAnnualized: 0,
      accumulationRiy: 0,
      rows: [],
    })
    const r1 = synthRes('versicherung-halb')
    const r2 = synthRes('versicherung-abgelt')
    const ctx = makeBaseCombineContext(defaultProfile, 0)
    const combined = combinePortfolio(ws, [r1, r2], ctx)

    // Both modes produce non-negative net shares.
    expect(combined.byInstance['versicherung-halb'].monthlyNet).toBeGreaterThanOrEqual(0)
    expect(combined.byInstance['versicherung-abgelt'].monthlyNet).toBeGreaterThanOrEqual(0)

    // The aggregate Abgeltungsteuer line is non-zero (the abgeltungsteuer
    // contract paid flat 25 % + Soli on its gain). The personal-tax base
    // should also have a halbeinkuenfte contribution.
    expect(combined.aggregateTax.abgeltungsteuerOnPrivateInsurance).toBeGreaterThan(0)
    expect(combined.aggregateTax.privateInsuranceTaxable).toBeGreaterThan(0)

    // Sanity: combined monthly net is bounded by the aggregate gross.
    const sumGross = r1.grossMonthlyPayout + r2.grossMonthlyPayout
    expect(combined.monthlyNetIncome).toBeLessThanOrEqual(sumGross)
  })

  it('single halbeinkuenfte pAV instance produces non-zero personal-tax-base contribution', () => {
    // Direct test of `calculateRetirementTax` with the new
    // `privateInsuranceContributions` field — exercises the engine extension
    // in isolation (without the combine wrapper).
    const tax = calculateRetirementTax(
      {
        statutoryPensionAnnual: 0,
        bavPensionAnnual: 0,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'abgeltungsteuer',
        privateInsuranceContributions: [
          { amount: 10_000, mode: 'halbeinkuenfte' },
          { amount: 8_000, mode: 'abgeltungsteuer' },
        ],
        otherTaxableAnnual: 0,
        retirementYear: 2065,
      },
      de2026Rules,
      'single',
    )
    // Halbeinkünfte: half of 10000 = 5000 enters the personal base.
    expect(tax.privateInsuranceTaxable).toBeCloseTo(5_000, 6)
    // Abgeltungsteuer: 8000 × 0.25 × (1 + Soli) ≈ 2110.
    expect(tax.abgeltungsteuerOnPrivateInsurance).toBeGreaterThan(2_000)
    expect(tax.abgeltungsteuerOnPrivateInsurance).toBeLessThan(2_200)
  })
})

// ---------------------------------------------------------------------------
// 6. Edge — empty baseline
// ---------------------------------------------------------------------------

describe('combinePortfolio — edge cases', () => {
  it('empty instance list (only GRV) returns GRV-only result', () => {
    const ws = makeWorkspaceFromV1(0, false, false, 0, 0, 0)
    const grvGross = 1_500
    const ctx = makeBaseCombineContext(defaultProfile, grvGross)
    const combined = combinePortfolio(ws, [], ctx)
    expect(combined.monthlyGrossPayouts.statutoryPension).toBe(grvGross)
    expect(combined.byInstance).toEqual({})
    expect(combined.statutoryPensionMonthlyNet).toBeGreaterThan(0)
    expect(combined.statutoryPensionMonthlyNet).toBeLessThanOrEqual(grvGross)
    expect(combined.monthlyNetIncome).toBeCloseTo(combined.statutoryPensionMonthlyNet, 6)
  })

  it('clean-slate (no GRV, no instances) returns zero income', () => {
    const ws = makeWorkspaceFromV1(0, false, false, 0, 0, 0)
    const ctx = makeBaseCombineContext(defaultProfile, 0)
    const combined = combinePortfolio(ws, [], ctx)
    expect(combined.monthlyNetIncome).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 7. Regression — married vs. single filing (§32a Abs. 5 EStG Ehegattensplitting)
// ---------------------------------------------------------------------------

describe('combinePortfolio — married vs. single filing status', () => {
  it('married filing produces lower aggregate retirement tax than single for substantial GRV income', () => {
    // Use only GRV income (no instances) so we can check statutory tax directly.
    // A single pensioner with 2 400 EUR/month GRV is taxed at Grundtarif;
    // a married couple with the same combined gross benefits from Splittingtarif.
    const ws = makeWorkspaceFromV1(0, false, false, 0, 0, 0)
    const grvGross = 2_400

    const ctxSingle = makeBaseCombineContext(defaultProfile, grvGross, 'single')
    const ctxMarried = makeBaseCombineContext(defaultProfile, grvGross, 'married')

    const combinedSingle = combinePortfolio(ws, [], ctxSingle)
    const combinedMarried = combinePortfolio(ws, [], ctxMarried)

    // Married Splittingtarif must produce lower total tax.
    expect(combinedMarried.aggregateTax.totalTaxAnnual).toBeLessThan(
      combinedSingle.aggregateTax.totalTaxAnnual,
    )
    // Married net must be higher than single net.
    expect(combinedMarried.monthlyNetIncome).toBeGreaterThan(combinedSingle.monthlyNetIncome)
  })

  it('married filing produces lower aggregate retirement tax than single for bAV + GRV combined', () => {
    const ws = makeWorkspaceFromV1(300, false, false, 0, 0, 0)
    const grvGross = 1_500
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const bavInstanceId = ws.baseline.assumptions.bav[0].instanceId
    const bavResult = perInstance[bavInstanceId].find((r) => r.scenarioId === 'basis')!

    const ctxSingle = makeBaseCombineContext(defaultProfile, grvGross, 'single')
    const ctxMarried = makeBaseCombineContext(defaultProfile, grvGross, 'married')

    const combinedSingle = combinePortfolio(ws, [bavResult], ctxSingle)
    const combinedMarried = combinePortfolio(ws, [bavResult], ctxMarried)

    // Married Splittingtarif must produce lower total tax.
    expect(combinedMarried.aggregateTax.totalTaxAnnual).toBeLessThan(
      combinedSingle.aggregateTax.totalTaxAnnual,
    )
    // Higher net income for married.
    expect(combinedMarried.monthlyNetIncome).toBeGreaterThan(combinedSingle.monthlyNetIncome)
  })

  it('buildCombineContext with hasPartner=true sets filingStatus to married', () => {
    // Verify the context builder wires the flag correctly.
    const ctxWithPartner = buildCombineContext({
      profile: defaultProfile,
      rules: de2026Rules,
      statutoryPension: defaultAssumptions.statutoryPension,
      grvGrossMonthlyPension: 0,
      hasPartner: true,
    })
    expect(ctxWithPartner.filingStatus).toBe('married')

    const ctxNoPartner = buildCombineContext({
      profile: defaultProfile,
      rules: de2026Rules,
      statutoryPension: defaultAssumptions.statutoryPension,
      grvGrossMonthlyPension: 0,
      hasPartner: false,
    })
    expect(ctxNoPartner.filingStatus).toBe('single')

    const ctxDefault = buildCombineContext({
      profile: defaultProfile,
      rules: de2026Rules,
      statutoryPension: defaultAssumptions.statutoryPension,
      grvGrossMonthlyPension: 0,
    })
    expect(ctxDefault.filingStatus).toBe('single')
  })
})

// ---------------------------------------------------------------------------
// 8. Regression #65 — surrender/reinvest pAV: transferred principal excluded
//    from gain in combine path
// ---------------------------------------------------------------------------

describe('combinePortfolio — regression #65: pAV gain ratio uses totalContributionsBeforeFees', () => {
  it('transferred principal from surrender_reinvest is excluded from pAV gain (combine path)', () => {
    // Regression for issue #65.
    //
    // Scenario: a pAV (halbeinkuenfte mode) received a 50,000 EUR capital injection
    // from a surrender_reinvest transfer. Regular contributions are 50,000 EUR.
    // True cost basis (totalContributionsBeforeFees) = 100,000 EUR.
    // Capital at retirement = 100,000 EUR → zero real gain.
    //
    // The bug: portfolioCombine.ts computePavTaxableAnnual reads
    // `result.totalProductContributions` (= 50,000 EUR, regular contributions only)
    // as the cost basis. This gives gainRatio = 0.5, taxableAnnual = 6,000 EUR,
    // and privateInsuranceTaxable = 3,000 EUR (after halbeinkuenfte 0.5 factor).
    //
    // The fix: expose `totalContributionsBeforeFees` on ProductResult (sum of
    // totalProductContributions + injectedPrincipal from transfer events) and use
    // it in computePavTaxableAnnual. With totalContributionsBeforeFees = 100,000
    // (= capitalAtRetirement), gainRatio = 0 → taxableAnnual = 0.
    const ws = makeWorkspaceFromV1(0, false, true, 0, 0, 0)
    const baseIns = ws.baseline.assumptions.insurance[0]
    const insInstance: InsuranceInstance = {
      ...baseIns,
      instanceId: 'versicherung-transferred',
      contractStartYear: 2010, // runtime 55yr, retirementAge 67 → halbeinkuenfte mode
      payoutMode: 'kapitalverzehr',
    }
    ws.baseline.assumptions.insurance = [insInstance]
    ws.baseline.assumptions.visibleProducts = ['versicherung']

    // Synthetic ProductResult:
    //   totalProductContributions = 50,000 EUR (regular contributions only)
    //   totalContributionsBeforeFees = 100,000 EUR (includes 50k injected principal)
    //   capitalAtRetirement = 100,000 EUR → zero real gain (basis == capital)
    //
    // The field `totalContributionsBeforeFees` does not yet exist on ProductResult
    // (that is the type gap this issue must fix). Cast past the type system so the
    // test encodes the expected post-fix contract and fails at runtime today.
    const synthResult = {
      productId: 'versicherung' as const,
      label: 'pAV (surrendered contract reinvested)',
      scenarioId: 'basis' as const,
      scenarioLabel: 'Basis',
      instanceId: 'versicherung-transferred',
      annualReturn: 0.04,
      monthlyUserCost: 100,
      monthlyProductContribution: 100,
      monthlyEmployerContribution: 0,
      totalUserCost: 50_000,
      totalProductContributions: 50_000,      // regular contributions only
      totalContributionsBeforeFees: 100_000,  // includes 50k injected transfer principal
      totalEmployerContributions: 0,
      totalFees: 0,
      capitalAtRetirement: 100_000,           // zero real gain: true basis == capital
      realCapitalAtRetirement: 70_000,
      afterTaxLumpSum: 100_000,
      grossMonthlyPayout: 1_000,
      netMonthlyPayout: 950,
      taxAndSvSavings: 0,
      valueMultipleOnUserCost: null,
      capitalMultipleAnnualized: 0,
      accumulationRiy: 0,
      rows: [],
    } as unknown as ProductResult

    const ctx = makeBaseCombineContext(defaultProfile, 0)
    const combined = combinePortfolio(ws, [synthResult], ctx)

    // With zero real gain (true basis = capital), the private-insurance
    // progressive-base contribution must be 0.
    //
    // Bug (totalProductContributions used): gainRatio = (100k-50k)/100k = 0.5,
    //   taxableAnnual = 12,000 × 0.5 = 6,000 → privateInsuranceTaxable = 3,000.
    // Fix (totalContributionsBeforeFees used): gainRatio = (100k-100k)/100k = 0,
    //   taxableAnnual = 0 → privateInsuranceTaxable = 0.
    expect(combined.aggregateTax.privateInsuranceTaxable).toBeCloseTo(0, 4)
  })
})

// Suppress unused-import warnings for types kept for documentation completeness.
void undefined as void | EtfInstance | AltersvorsorgedepotInstance | BasisrenteInstance | RiesterInstance
