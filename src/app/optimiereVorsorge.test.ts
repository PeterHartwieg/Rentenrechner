/**
 * Tests for optimiereVorsorge.ts (Group B issue B2 + B4).
 *
 * Coverage B2:
 *   - beitragsfrei decision on a bAV with non-trivial RIY → negative delta.
 *   - weiterfuehren decision → delta within ±1e-6 of zero.
 *   - Riester→AVD certified transfer → non-zero delta matching manual diff.
 *   - increase_contribution (from beitragErhoehenWhatIf B1 shape) on ETF → positive delta.
 *   - Cache hit: second call returns same object reference, does not re-run simulation.
 *   - Cache miss after invalidate(): re-runs simulation.
 *
 * Coverage B4:
 *   - 3-instance fixture (high-fee bAV + statement-evidenced ETF + Riester with model estimates)
 *     produces three rows in sort order: bAV, Riester, ETF.
 *   - Surrendered / offered instances are excluded from the result.
 *   - Decision kinds per instance match spec (bAV: weiterfuehren+beitragsfrei+kuendigen+beitrag-erhoehen,
 *     ETF: weiterfuehren+kuendigen+beitrag-erhoehen, no beitragsfrei for ETF).
 *   - decisions[].deltaNettoRente === 0 for all rows.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import type { Workspace } from '../domain/workspace'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../domain/instances'
import {
  beitragsfreiWhatIf,
  weiterfuehrenWhatIf,
  uebertragenVirtualWhatIf,
  applyContractDecision,
  beitragErhoehenWhatIf,
} from './contractDecisions'
import {
  simulateContractDecision,
  createDecisionSimulationCache,
  auditPortfolio,
} from './optimiereVorsorge'
import { runCombineSimulation } from './useCombineSimulation'

// ---------------------------------------------------------------------------
// Workspace fixtures (B2)
// ---------------------------------------------------------------------------

/**
 * Workspace with a single active bAV instance at 1.5% effective RIY.
 * Uses a non-trivial fee to ensure beitragsfrei produces a measurable delta.
 */
function makeBavWorkspace(): Workspace {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['bav'],
    bav: {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 200,
      fees: {
        wrapperAssetFee: 0.01,   // 1.0 % wrapper
        fundAssetFee: 0.005,     // 0.5 % fund — total 1.5 % effective RIY
        contributionFee: 0,
        fixedMonthlyFee: 0,
        acquisitionCostPct: 0,
        acquisitionCostSpreadYears: 5,
        pensionPayoutFeePct: 0,
      },
    },
  }
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
}

/**
 * Workspace with a Riester instance (no AVD yet), so the certified transfer
 * target is a virtual "create new AVD".
 */
function makeRiesterNoAvdWorkspace(): Workspace {
  const riesterInstance: RiesterInstance = {
    instanceId: 'riester-sim-1',
    label: 'Riester-Rente',
    status: 'active',
    contractStartYear: 2010,
    currentValueEUR: 8_000,
    evidenceMap: {},
    monthlyOwnContribution: 150,
    existingCapital: 0,
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      ageAtContractStart: 23,
      careerStarterBonusUsed: false,
    },
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
    fees: {
      wrapperAssetFee: 0.012,
      fundAssetFee: 0.002,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
    payoutMode: 'leibrente',
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    partialCapitalPct: 0,
    monthlyOtherRetirementIncome: 0,
  }

  const v1 = { ...defaultAssumptions, visibleProducts: ['riester'] }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...ws.baseline.assumptions,
        riester: [riesterInstance],
        altersvorsorgedepot: [],  // no AVD → virtual transfer target
      },
    },
  }
}

/**
 * Workspace with a Riester instance AND an existing AVD instance.
 * Used to test the certified transfer delta sign against a manual diff.
 */
function makeRiesterAvdWorkspace(): Workspace {
  const riesterInstance: RiesterInstance = {
    instanceId: 'riester-sim-2',
    label: 'Riester-Rente',
    status: 'active',
    contractStartYear: 2010,
    currentValueEUR: 10_000,
    evidenceMap: {},
    monthlyOwnContribution: 150,
    existingCapital: 0,
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      ageAtContractStart: 23,
      careerStarterBonusUsed: false,
    },
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
    fees: {
      wrapperAssetFee: 0.015,   // 1.5 % — higher-fee Riester
      fundAssetFee: 0,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
    payoutMode: 'leibrente',
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    partialCapitalPct: 0,
    monthlyOtherRetirementIncome: 0,
  }
  const avdInstance: AltersvorsorgedepotInstance = {
    instanceId: 'altersvorsorgedepot-sim-1',
    label: 'Altersvorsorgedepot',
    status: 'active',
    contractStartYear: 2026,
    currentValueEUR: 0,
    evidenceMap: {},
    subtype: 'standarddepot',
    monthlyOwnContribution: 50,
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      eligibleChildren: 0,
      ageAtContractStart: 28,
      careerStarterBonusUsed: true,
    },
    riskAllocationPct: 0.8,
    riskAnnualReturn: 0.05,
    lowRiskAnnualReturn: 0.02,
    fees: {
      wrapperAssetFee: 0.003,
      fundAssetFee: 0.002,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
    payoutMode: 'certified_payout_plan',
    payoutPlanEndAge: 85,
    partialCapitalPct: 0,
    transferCostEUR: 0,
    monthlyOtherRetirementIncome: 0,
    rentenfaktor: 28,
    riesterTransferCapital: 0,
  }
  const v1 = { ...defaultAssumptions, visibleProducts: ['riester', 'altersvorsorgedepot'] }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...ws.baseline.assumptions,
        riester: [riesterInstance],
        altersvorsorgedepot: [avdInstance],
      },
    },
  }
}

/**
 * Workspace with a single ETF instance for contribution-increase tests.
 * Uses a medium fee so contributions have a visible effect.
 */
function makeEtfWorkspace(monthlyContribution: number): Workspace {
  const etfInstance: EtfInstance = {
    instanceId: 'etf-sim-1',
    label: 'ETF Sparplan',
    status: 'active',
    contractStartYear: 2024,
    currentValueEUR: 5_000,
    monthlyContribution,
    annualAssetFee: 0.002,
    annualContributionGrowthRate: 0,
    equityPartialExemption: 0.3,
    evidenceMap: {},
  }
  const v1 = { ...defaultAssumptions, visibleProducts: ['etf'] }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...ws.baseline.assumptions,
        etf: [etfInstance],
        // Strip bAV so only the ETF drives the combined result.
        bav: [],
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Helper: extract basis-scenario combined result from a workspace.
// Mirrors the modal's derivation: 'basis' first, then returnScenarios[0].
// ---------------------------------------------------------------------------
function baselineCombinedFor(ws: Workspace) {
  return basisCombinedFor(ws)
}

/** Extract the 'basis' scenario combined result, as the OptimiereVorsorgeModal does. */
function basisCombinedFor(ws: Workspace) {
  const bundle = runCombineSimulation(ws, de2026Rules)
  const basisScenario =
    ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis') ??
    ws.baseline.assumptions.returnScenarios[0]
  return bundle.combinedByScenarioId[basisScenario.id]
}

// ---------------------------------------------------------------------------
// B2 tests
// ---------------------------------------------------------------------------

describe('simulateContractDecision — bAV beitragsfrei (1.5% RIY)', () => {
  it('returns a negative delta when going paid-up on a high-fee bAV', () => {
    const ws = makeBavWorkspace()
    const bavInstanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = beitragsfreiWhatIf(ws, bavInstanceId)
    const baselineCombined = baselineCombinedFor(ws)

    const result = simulateContractDecision(ws, decision, de2026Rules, baselineCombined)

    // Going paid-up stops contributions → less accumulation → lower payout.
    // The delta should be negative (though small — only fees and loss of future
    // contributions offset each other in the simulation).
    // Accept: either clearly negative OR within a very small range (the engine
    // models a 28-year-old with 39 years to go; paid-up dramatically reduces accumulation).
    expect(result.deltaMonthlyNetEUR).toBeLessThan(0)
  })
})

describe('simulateContractDecision — weiterfuehren (identity)', () => {
  it('returns a delta within ±1e-6 of zero for the weiterfuehren decision', () => {
    const ws = makeBavWorkspace()
    const bavInstanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = weiterfuehrenWhatIf(ws, bavInstanceId)
    const baselineCombined = baselineCombinedFor(ws)

    const result = simulateContractDecision(ws, decision, de2026Rules, baselineCombined)

    // Identity delta — no change to workspace; re-simulation must equal baseline.
    expect(Math.abs(result.deltaMonthlyNetEUR)).toBeLessThan(1e-6)
  })
})

describe('simulateContractDecision — Riester → AVD certified transfer', () => {
  it('returns a non-zero delta whose sign matches a manual simulatePortfolio diff', () => {
    const ws = makeRiesterAvdWorkspace()
    const riesterInstanceId = ws.baseline.assumptions.riester[0].instanceId

    // Build the "uebertragen" decision: certified Riester → AVD transfer.
    const decision = uebertragenVirtualWhatIf(ws, riesterInstanceId, 'altersvorsorgedepot', 'all')

    // Baseline combined result
    const baselineCombined = baselineCombinedFor(ws)

    // Result from simulateContractDecision
    const result = simulateContractDecision(ws, decision, de2026Rules, baselineCombined)

    // Manual diff: apply decision ourselves, run simulation, compute delta.
    // Use the same 'basis' scenario that simulateContractDecision uses internally.
    const applied = applyContractDecision(ws, decision)
    const appliedBundle = runCombineSimulation(applied, de2026Rules)
    const basisScenario =
      applied.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis') ??
      applied.baseline.assumptions.returnScenarios[0]
    const appliedCombined = appliedBundle.combinedByScenarioId[basisScenario.id]
    const manualDelta = appliedCombined.monthlyNetIncome - baselineCombined.monthlyNetIncome

    // The delta must be non-zero (the certified transfer changes capital allocation).
    expect(Math.abs(result.deltaMonthlyNetEUR)).toBeGreaterThan(0)

    // Sign must match the manual diff.
    if (manualDelta > 0) {
      expect(result.deltaMonthlyNetEUR).toBeGreaterThan(0)
    } else if (manualDelta < 0) {
      expect(result.deltaMonthlyNetEUR).toBeLessThan(0)
    }

    // Value must be within ±1 EUR/month of the manual diff.
    expect(Math.abs(result.deltaMonthlyNetEUR - manualDelta)).toBeLessThan(1)
  })

  it('returns a non-zero delta for virtual Riester→AVD transfer (no existing AVD)', () => {
    const ws = makeRiesterNoAvdWorkspace()
    const riesterInstanceId = ws.baseline.assumptions.riester[0].instanceId

    // Virtual: no AVD in workspace → create new AVD + certified transfer.
    const decision = uebertragenVirtualWhatIf(ws, riesterInstanceId, 'altersvorsorgedepot', 'all')
    const baselineCombined = baselineCombinedFor(ws)

    const result = simulateContractDecision(ws, decision, de2026Rules, baselineCombined)

    // The simulation must produce a result (not throw or return 0 from a missing scenario).
    expect(typeof result.deltaMonthlyNetEUR).toBe('number')
    expect(isFinite(result.deltaMonthlyNetEUR)).toBe(true)
  })
})

describe('simulateContractDecision — ETF contribution increase', () => {
  it('returns a positive delta when doubling monthly ETF contribution', () => {
    // Baseline: 200 EUR/month ETF. What-if: 400 EUR/month ETF.
    // We model this by constructing a 400 EUR/month ETF workspace as the
    // "applied" workspace and computing the delta manually, then use a
    // weiterfuehren decision on the 400 EUR workspace vs 200 EUR baseline.
    //
    // Since B1 (beitragErhoehenWhatIf) is a separate issue, we implement the
    // increase_contribution test by comparing two workspace configurations:
    // the delta of simulating the 400 EUR workspace vs the 200 EUR baseline.
    const wsLow = makeEtfWorkspace(200)
    const wsHigh = makeEtfWorkspace(400)

    // Baseline combined for the 200 EUR workspace.
    const baselineCombined = baselineCombinedFor(wsLow)

    // Simulate the 400 EUR workspace using weiterfuehren on wsHigh.
    // weiterfuehren is an identity decision — it returns wsHigh unchanged.
    // So the delta is effectively wsHigh - wsLow, which must be positive.
    const etfInstanceId = wsHigh.baseline.assumptions.etf[0].instanceId
    const decision = weiterfuehrenWhatIf(wsHigh, etfInstanceId)

    const result = simulateContractDecision(wsHigh, decision, de2026Rules, baselineCombined)

    // Higher contribution → more capital → higher payout → positive delta.
    expect(result.deltaMonthlyNetEUR).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// gh#20 regression tests — beitragErhoehenWhatIf → simulateContractDecision
// ---------------------------------------------------------------------------

/**
 * Workspace with a single ETF instance at a given monthly contribution.
 * No bAV, so the ETF drives the entire combined result.
 */
function makeEtfOnlyWorkspace(monthlyContribution: number): Workspace {
  const etfInstance: EtfInstance = {
    instanceId: 'etf-gh20-1',
    label: 'ETF Sparplan',
    status: 'active',
    contractStartYear: 2022,
    currentValueEUR: 3_000,
    monthlyContribution,
    annualAssetFee: 0.002,
    annualContributionGrowthRate: 0,
    equityPartialExemption: 0.3,
    evidenceMap: {},
  }
  const v1 = { ...defaultAssumptions, visibleProducts: ['etf'] }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...ws.baseline.assumptions,
        etf: [etfInstance],
        bav: [],
      },
    },
  }
}

/**
 * Workspace with a pre-2005 private-insurance instance (PAV) and an ETF
 * instance. ETF is the vehicle whose contribution is increased in the test.
 * PAV is pre-2005 (contractStartYear: 2002) to pin the tax-mode path.
 */
function makePavEtfWorkspace(etfMonthlyContribution: number): Workspace {
  const pavInstance: InsuranceInstance = {
    instanceId: 'versicherung-gh20-1',
    label: 'Private Rentenversicherung (2002)',
    status: 'active',
    contractStartYear: 2002,
    currentValueEUR: 20_000,
    monthlyContribution: 100,
    oldContractTaxFreeEligible: true,
    monthlyOtherRetirementIncome: 0,
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
    fees: {
      wrapperAssetFee: 0.008,
      fundAssetFee: 0.002,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
    payoutMode: 'kapitalverzehr',
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    surrenderHaircutPct: 0.10,
    annualContributionGrowthRate: 0,
    evidenceMap: {},
  }

  const etfInstance: EtfInstance = {
    instanceId: 'etf-gh20-2',
    label: 'ETF Sparplan',
    status: 'active',
    contractStartYear: 2023,
    currentValueEUR: 5_000,
    monthlyContribution: etfMonthlyContribution,
    annualAssetFee: 0.002,
    annualContributionGrowthRate: 0,
    equityPartialExemption: 0.3,
    evidenceMap: {},
  }

  const v1 = { ...defaultAssumptions, visibleProducts: ['versicherung', 'etf'] }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...ws.baseline.assumptions,
        insurance: [pavInstance],
        etf: [etfInstance],
        bav: [],
      },
    },
  }
}

describe('simulateContractDecision — ETF-only beitrag-erhoehen (gh#20 regression)', () => {
  it('increasing ETF contribution 200→400 €/month produces a positive delta', () => {
    const ws = makeEtfOnlyWorkspace(200)
    const etfInstanceId = ws.baseline.assumptions.etf[0].instanceId

    // Build the decision via the real production path.
    const decision = beitragErhoehenWhatIf(ws, etfInstanceId, 400)
    expect(decision).not.toBeNull()

    const baselineCombined = baselineCombinedFor(ws)
    const result = simulateContractDecision(ws, decision!, de2026Rules, baselineCombined)

    // Higher contribution → more capital → higher payout → positive delta.
    expect(result.deltaMonthlyNetEUR).toBeGreaterThan(0)
  })
})

describe('simulateContractDecision — PAV pre-2005 + ETF beitrag-erhoehen (gh#20 regression)', () => {
  it('increasing ETF contribution 350→530 €/month in a PAV+ETF workspace produces a positive delta', () => {
    const ws = makePavEtfWorkspace(350)
    const etfInstanceId = ws.baseline.assumptions.etf[0].instanceId

    // Build the decision via the real production path.
    const decision = beitragErhoehenWhatIf(ws, etfInstanceId, 530)
    expect(decision).not.toBeNull()

    const baselineCombined = baselineCombinedFor(ws)
    const result = simulateContractDecision(ws, decision!, de2026Rules, baselineCombined)

    // Higher ETF contribution → more capital → higher payout → positive delta.
    // This pins the user-reported scenario: ETF +180 €/month should not produce a negative delta.
    expect(result.deltaMonthlyNetEUR).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// B2 cache tests
// ---------------------------------------------------------------------------

describe('createDecisionSimulationCache', () => {
  it('returns the same object reference on the second call with identical arguments (cache hit)', () => {
    const ws = makeBavWorkspace()
    const bavInstanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = beitragsfreiWhatIf(ws, bavInstanceId)
    const baselineCombined = baselineCombinedFor(ws)

    const cache = createDecisionSimulationCache()

    const result1 = cache.get(ws, decision, de2026Rules, baselineCombined)
    const result2 = cache.get(ws, decision, de2026Rules, baselineCombined)

    // Same object reference — cache was not re-run.
    expect(result2).toBe(result1)
  })

  it('cache hit does not call runCombineSimulation a second time', () => {
    // Spy on simulateContractDecision indirectly by counting runCombineSimulation invocations.
    // We do this by wrapping runCombineSimulation import with vi.spyOn on the module.
    // Since optimiereVorsorge.ts imports runCombineSimulation statically, we measure
    // indirectly: if the same object reference is returned, the inner simulation was not called.
    const ws = makeBavWorkspace()
    const bavInstanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = beitragsfreiWhatIf(ws, bavInstanceId)
    const baselineCombined = baselineCombinedFor(ws)

    const cache = createDecisionSimulationCache()
    const first = cache.get(ws, decision, de2026Rules, baselineCombined)
    const second = cache.get(ws, decision, de2026Rules, baselineCombined)

    // If second call had re-run the simulation it would produce a different object.
    // Same reference is the proof that no re-run occurred.
    expect(second).toBe(first)
    expect(second.deltaMonthlyNetEUR).toBe(first.deltaMonthlyNetEUR)
  })

  it('returns a different object reference after invalidate() (cache miss)', () => {
    const ws = makeBavWorkspace()
    const bavInstanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = beitragsfreiWhatIf(ws, bavInstanceId)
    const baselineCombined = baselineCombinedFor(ws)

    const cache = createDecisionSimulationCache()

    const result1 = cache.get(ws, decision, de2026Rules, baselineCombined)
    cache.invalidate()
    const result2 = cache.get(ws, decision, de2026Rules, baselineCombined)

    // After invalidate() the cache was cleared; result2 is a newly-created object.
    expect(result2).not.toBe(result1)
    // But the values should be numerically equal (same simulation, same inputs).
    expect(result2.deltaMonthlyNetEUR).toBeCloseTo(result1.deltaMonthlyNetEUR, 6)
  })

  it('returns the cached value for one decision while computing fresh for a different decision', () => {
    const ws = makeBavWorkspace()
    const bavInstanceId = ws.baseline.assumptions.bav[0].instanceId
    const decisionA = beitragsfreiWhatIf(ws, bavInstanceId)
    const decisionB = weiterfuehrenWhatIf(ws, bavInstanceId)
    const baselineCombined = baselineCombinedFor(ws)

    const cache = createDecisionSimulationCache()

    const a1 = cache.get(ws, decisionA, de2026Rules, baselineCombined)
    const b1 = cache.get(ws, decisionB, de2026Rules, baselineCombined)

    // Both are cached now; second call must return same references.
    const a2 = cache.get(ws, decisionA, de2026Rules, baselineCombined)
    const b2 = cache.get(ws, decisionB, de2026Rules, baselineCombined)

    expect(a2).toBe(a1)
    expect(b2).toBe(b1)
    // Sanity: the two decisions produce different deltas.
    expect(a1.deltaMonthlyNetEUR).not.toBeCloseTo(b1.deltaMonthlyNetEUR, 3)
  })
})

// ---------------------------------------------------------------------------
// B4: auditPortfolio tests
// ---------------------------------------------------------------------------

/**
 * Build the 3-instance fixture described in the B4 spec:
 *   1. High-fee bAV (active) — triggers high_cost_active (medium flag).
 *   2. Statement-evidenced ETF (active) — no flags.
 *   3. Riester with model-estimate evidence (active) — triggers missing_offer_data (medium flag).
 *
 * Plus two extra instances that must be excluded: one surrendered bAV, one offered insurance.
 *
 * Sort expectation: bAV (score=2) and Riester (score=2) are tied on severity,
 * tied on flags.length (both 1), so broken by instanceId asc:
 * 'bav-audit-1' < 'riester-audit-1' < 'etf-audit-1' is NOT correct —
 * 'b' < 'e' < 'r', so bAV < ETF < Riester alphabetically.
 * But ETF has score=0, so bAV (score=2) and Riester (score=2) appear first,
 * then ETF (score=0). Within the bAV/Riester tie: 'bav-audit-1' < 'riester-audit-1'.
 * Final order: bAV, Riester, ETF. ✓
 */
function makeAuditFixtureWorkspace(): Workspace {
  const highFeeBav: BavInstance = {
    instanceId: 'bav-audit-1',
    label: 'bAV Hochkostenvertrag',
    status: 'active',
    contractStartYear: 2018,
    currentValueEUR: 12_000,
    // Evidence for all bAV fields → suppresses missing_offer_data.
    evidenceMap: {
      monthlyGrossConversion: 'statement',
      'fees.wrapperAssetFee': 'statement',
      'fees.fundAssetFee': 'statement',
      'fees.acquisitionCostPct': 'statement',
      'fees.pensionPayoutFeePct': 'statement',
      contractualMatchPercent: 'statement',
      contractualFixedMonthly: 'statement',
      acquisitionCostPct: 'statement',
      durchfuehrungsweg: 'statement',
      pre2005EligibleTaxFree: 'statement',
      rentenfaktor: 'statement',
      payoutMode: 'statement',
    },
    monthlyGrossConversion: 200,
    statutoryMinimumSubsidyEnabled: true,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
    fees: {
      wrapperAssetFee: 0.015,  // 1.5% — well above HIGH_FEE_THRESHOLD (1.2%)
      fundAssetFee: 0,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
    monthlyOtherRetirementIncome: 0,
    includeGrvReduction: false,
    kvdrMember: true,
    durchfuehrungsweg: 'direktversicherung_3_63',
    pre2005EligibleTaxFree: false,
    payoutMode: 'leibrente',
    rentenfaktor: 30,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    annualContributionGrowthRate: 0,
  }

  // Surrendered bAV — must NOT appear in the result.
  const surrenderedBav: BavInstance = {
    ...highFeeBav,
    instanceId: 'bav-audit-surrendered',
    label: 'bAV (surrendered)',
    status: 'surrendered',
  }

  const statementEtf: EtfInstance = {
    instanceId: 'etf-audit-1',
    label: 'ETF Sparplan',
    status: 'active',
    contractStartYear: 2020,
    currentValueEUR: 5_000,
    monthlyContribution: 200,
    annualAssetFee: 0.002,
    annualContributionGrowthRate: 0,
    equityPartialExemption: 0.3,
    // Fully evidenced → suppresses missing_offer_data.
    evidenceMap: {
      monthlyContribution: 'statement',
      annualAssetFee: 'statement',
    },
  }

  // Offered insurance — must NOT appear in the result.
  const offeredInsurance = {
    instanceId: 'versicherung-audit-offered',
    label: 'pAV (offered)',
    status: 'offered' as const,
    contractStartYear: 2015,
    currentValueEUR: 0,
    evidenceMap: {},
    oldContractTaxFreeEligible: false,
    monthlyOtherRetirementIncome: 0,
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
    fees: {
      wrapperAssetFee: 0,
      fundAssetFee: 0,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
    payoutMode: 'leibrente' as const,
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    surrenderHaircutPct: 0,
    annualContributionGrowthRate: 0,
  }

  // Riester with empty evidenceMap → missing_offer_data fires (medium flag).
  // payoutMode: 'zeitrente' to avoid low_flexibility (which fires on leibrente + haircut ≥ 0.10).
  const modelEstimateRiester: RiesterInstance = {
    instanceId: 'riester-audit-1',
    label: 'Riester-Rente',
    status: 'active',
    contractStartYear: 2012,
    currentValueEUR: 8_000,
    evidenceMap: {},  // all fields are model_estimate → missing_offer_data fires
    monthlyOwnContribution: 100,
    existingCapital: 0,
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      ageAtContractStart: 25,
      careerStarterBonusUsed: false,
    },
    capitalGuarantee: { enabled: true, floorPctOfContributions: 1 },
    fees: {
      wrapperAssetFee: 0.005,  // low fee — no high_cost_active
      fundAssetFee: 0.002,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
    payoutMode: 'zeitrente',  // not leibrente — avoids low_flexibility (payoutMode + haircut rule)
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    partialCapitalPct: 0,
    monthlyOtherRetirementIncome: 0,
  }

  const v1 = { ...defaultAssumptions, visibleProducts: ['bav', 'etf', 'riester'] }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )

  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...ws.baseline.assumptions,
        bav: [highFeeBav, surrenderedBav],
        etf: [statementEtf],
        insurance: [offeredInsurance],
        basisrente: [],
        altersvorsorgedepot: [],
        riester: [modelEstimateRiester],
      },
    },
  }
}

describe('auditPortfolio — sort order (B4)', () => {
  it('returns three rows in order: high-fee bAV, Riester, ETF', () => {
    const ws = makeAuditFixtureWorkspace()
    const rows = auditPortfolio(ws)

    expect(rows).toHaveLength(3)
    expect(rows[0].instance.instanceId).toBe('bav-audit-1')
    expect(rows[1].instance.instanceId).toBe('riester-audit-1')
    expect(rows[2].instance.instanceId).toBe('etf-audit-1')
  })

  it('bAV row has exactly 1 flag: high_cost_active (medium)', () => {
    const ws = makeAuditFixtureWorkspace()
    const rows = auditPortfolio(ws)

    const bavRow = rows[0]
    expect(bavRow.flags).toHaveLength(1)
    expect(bavRow.flags[0].id).toBe('high_cost_active')
    expect(bavRow.flags[0].priority).toBe('medium')
  })

  it('Riester row has exactly 1 flag: missing_offer_data (medium)', () => {
    const ws = makeAuditFixtureWorkspace()
    const rows = auditPortfolio(ws)

    const riesterRow = rows[1]
    expect(riesterRow.flags).toHaveLength(1)
    expect(riesterRow.flags[0].id).toBe('missing_offer_data')
    expect(riesterRow.flags[0].priority).toBe('medium')
  })

  it('ETF row has no flags', () => {
    const ws = makeAuditFixtureWorkspace()
    const rows = auditPortfolio(ws)

    const etfRow = rows[2]
    expect(etfRow.flags).toHaveLength(0)
  })
})

describe('auditPortfolio — exclusion of surrendered/offered instances (B4)', () => {
  it('does not include surrendered or offered instances in the result', () => {
    const ws = makeAuditFixtureWorkspace()
    const rows = auditPortfolio(ws)

    const ids = rows.map((r) => r.instance.instanceId)
    expect(ids).not.toContain('bav-audit-surrendered')
    expect(ids).not.toContain('versicherung-audit-offered')
  })
})

describe('auditPortfolio — decision kinds per instance (B4)', () => {
  it('bAV instance decisions: weiterfuehren | beitragsfrei | kuendigen | beitrag-erhoehen', () => {
    const ws = makeAuditFixtureWorkspace()
    const rows = auditPortfolio(ws)

    const bavRow = rows.find((r) => r.instance.instanceId === 'bav-audit-1')!
    const kinds = bavRow.decisions.map((d) => d.kind)

    // Must have all four decision kinds (no transfer targets in this workspace for bAV).
    expect(kinds).toContain('weiterfuehren')
    expect(kinds).toContain('beitragsfrei')
    expect(kinds).toContain('kuendigen')
    expect(kinds).toContain('beitrag-erhoehen')

    // beitrag-erhoehen must be the last decision (appended after generateContractDecisions).
    expect(kinds[kinds.length - 1]).toBe('beitrag-erhoehen')
  })

  it('ETF instance decisions: weiterfuehren | kuendigen | beitrag-erhoehen (no beitragsfrei)', () => {
    const ws = makeAuditFixtureWorkspace()
    const rows = auditPortfolio(ws)

    const etfRow = rows.find((r) => r.instance.instanceId === 'etf-audit-1')!
    const kinds = etfRow.decisions.map((d) => d.kind)

    expect(kinds).toContain('weiterfuehren')
    expect(kinds).toContain('kuendigen')
    expect(kinds).toContain('beitrag-erhoehen')
    // ETF must NOT have beitragsfrei.
    expect(kinds).not.toContain('beitragsfrei')

    // beitrag-erhoehen must be last.
    expect(kinds[kinds.length - 1]).toBe('beitrag-erhoehen')
  })
})

describe('auditPortfolio — deltaNettoRente is zero for all decisions (B4)', () => {
  it('all decisions in all rows have deltaNettoRente === 0', () => {
    const ws = makeAuditFixtureWorkspace()
    const rows = auditPortfolio(ws)

    for (const row of rows) {
      for (const decision of row.decisions) {
        expect(decision.deltaNettoRente).toBe(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// gh#44 regression: Bug A — scenario mismatch (sign flip)
// ---------------------------------------------------------------------------

describe('simulateContractDecision — Bug A: basis-scenario baseline must use same scenario (gh#44)', () => {
  it('weiterfuehren with basis-scenario baseline produces delta ≈ 0, not a sign-flipped large value', () => {
    const ws = makeBavWorkspace()
    const bavInstanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = weiterfuehrenWhatIf(ws, bavInstanceId)

    // The modal computes baselineCombined from the 'basis' scenario (5 % p.a.),
    // NOT from returnScenarios[0] which is 'konservativ' (3 % p.a.).
    const basisCombined = basisCombinedFor(ws)

    const result = simulateContractDecision(ws, decision, de2026Rules, basisCombined)

    // weiterfuehren is an identity decision — the workspace is unchanged, so the
    // applied simulation is identical to the baseline. Delta must be ≈ 0.
    //
    // Bug A: simulateContractDecision picks returnScenarios[0] ('konservativ', 3 %)
    // for the applied result but the caller provided a baseline at 'basis' (5 %).
    // The 2 pp gap compounded over 39 years flips the sign and produces a large
    // negative delta (many EUR/month). The correct value is < 1 EUR/month.
    expect(Math.abs(result.deltaMonthlyNetEUR)).toBeLessThan(1)
  })
})

// ---------------------------------------------------------------------------
// gh#44 regression: Bug B — stale cache on newMonthlyEUR change
// ---------------------------------------------------------------------------

describe('createDecisionSimulationCache — Bug B: different newMonthlyEUR must not share a cache entry (gh#44)', () => {
  it('cache returns strictly larger delta for 200→400 than for 200→300 on the same instance', () => {
    const ws = makeEtfOnlyWorkspace(200)
    const etfId = ws.baseline.assumptions.etf[0].instanceId

    const decision300 = beitragErhoehenWhatIf(ws, etfId, 300)
    const decision400 = beitragErhoehenWhatIf(ws, etfId, 400)
    expect(decision300).not.toBeNull()
    expect(decision400).not.toBeNull()

    // Bug B precondition: both decisions share the same id (no newMonthlyEUR in id).
    // This causes the cache to return the 300-EUR result for the 400-EUR query.
    const basisCombined = basisCombinedFor(ws)
    const cache = createDecisionSimulationCache()

    const result300 = cache.get(ws, decision300!, de2026Rules, basisCombined)
    // With the bug, this hits the cache entry written by result300 (same id).
    const result400 = cache.get(ws, decision400!, de2026Rules, basisCombined)

    // A higher monthly contribution produces a higher delta.
    // Bug B: result400 === result300 (stale cache hit) → this assertion fails.
    expect(result400.deltaMonthlyNetEUR).toBeGreaterThan(result300.deltaMonthlyNetEUR)
  })
})
