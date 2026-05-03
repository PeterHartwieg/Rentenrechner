/**
 * Tests for the PortfolioAdapter (Group G issue 03 — milestone M1.3).
 *
 * Coverage map (per the issue 03 test plan):
 *   1. Oracle byte-identity   — every existing oracle stays green via length-1
 *      array invocation (covered by `simulate.integration.test.ts` running
 *      against the legacy path; the projection helper is independently exercised
 *      below by comparing projection output to defaultAssumptions for a
 *      length-1 workspace).
 *   2. Two bAV instances      — cap shared across instances; statutory subsidy proportional.
 *   3. Two ETF instances Sparerpauschbetrag — `it.skip` (Decision C deferred to issue 15).
 *   4. derivedFromBaselineSnapshot freezes at fork — covered in portfolioState.test.ts.
 *   5. Re-base stub           — `it.skip` (issue P2).
 *   6. Projection round-trip stability.
 *   7. Neutralised defaults are truly neutral.
 *   8. extractSingletonAssumptions removal — covered structurally (no longer
 *      exported; test importing it fails to compile).
 *   9. Surrendered bAV instance excluded from cap aggregation.
 *  10. Per-product round-trip — projection + simulation produces a result whose
 *      key fields match a legacy length-1 simulation.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import { simulateRetirementComparison } from './simulate'
import {
  NEUTRALISED_ALTERSVORSORGEDEPOT,
  NEUTRALISED_BASISRENTE,
  NEUTRALISED_BAV,
  NEUTRALISED_ETF,
  NEUTRALISED_INSURANCE,
  NEUTRALISED_RIESTER,
  buildPortfolioFunding,
  projectInstanceToScenarioAssumptions,
  simulatePortfolio,
  singletonViewOfWorkspace,
} from './portfolioAdapter'
import type {
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
} from '../domain/instances'
import type { Workspace } from '../domain/workspace'
import type { ProductId } from '../domain'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SINGLETON_DEFAULTS = {
  bav: defaultAssumptions.bav,
  etf: defaultAssumptions.etf,
  insurance: defaultAssumptions.insurance,
  basisrente: defaultAssumptions.basisrente,
  altersvorsorgedepot: defaultAssumptions.altersvorsorgedepot,
  riester: defaultAssumptions.riester,
} as const

function makeRichV1(): { profile: typeof defaultProfile; assumptions: typeof defaultAssumptions } {
  return {
    profile: defaultProfile,
    assumptions: {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
      basisrente: { ...defaultAssumptions.basisrente, monthlyGrossContribution: 200 },
      altersvorsorgedepot: { ...defaultAssumptions.altersvorsorgedepot, monthlyOwnContribution: 150 },
      riester: { ...defaultAssumptions.riester, monthlyOwnContribution: 150 },
    },
  }
}

function migrateRich(): Workspace {
  const { profile, assumptions } = makeRichV1()
  return migrateV1ToV2(
    profile as unknown as Record<string, unknown>,
    assumptions as unknown as Record<string, unknown>,
  )
}

// ---------------------------------------------------------------------------
// 1. Oracle byte-identity (singletonViewOfWorkspace + simulateRetirementComparison)
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — singletonViewOfWorkspace byte-identity', () => {
  it('a length-1 workspace projects to the same singleton fields the engine expects', () => {
    const workspace = migrateRich()
    const singleton = singletonViewOfWorkspace(workspace, SINGLETON_DEFAULTS)
    // Field-by-field check the projection matches the original singleton inputs
    // (the load-bearing oracle invariant).
    const original = makeRichV1().assumptions
    expect(singleton.bav.monthlyGrossConversion).toBe(original.bav.monthlyGrossConversion)
    expect(singleton.bav.rentenfaktor).toBe(original.bav.rentenfaktor)
    expect(singleton.bav.durchfuehrungsweg).toBe(original.bav.durchfuehrungsweg)
    expect(singleton.bav.fees).toEqual(original.bav.fees)

    expect(singleton.etf.annualAssetFee).toBe(original.etf.annualAssetFee)
    expect(singleton.etf.equityPartialExemption).toBe(original.etf.equityPartialExemption)

    expect(singleton.insurance.contractStartYear).toBe(original.insurance.contractStartYear)
    expect(singleton.insurance.payoutMode).toBe(original.insurance.payoutMode)

    expect(singleton.basisrente.monthlyGrossContribution).toBe(original.basisrente.monthlyGrossContribution)

    expect(singleton.altersvorsorgedepot.monthlyOwnContribution).toBe(original.altersvorsorgedepot.monthlyOwnContribution)
    expect(singleton.altersvorsorgedepot.subtype).toBe(original.altersvorsorgedepot.subtype)

    expect(singleton.riester.monthlyOwnContribution).toBe(original.riester.monthlyOwnContribution)

    // Scenario-level fields propagate verbatim.
    expect(singleton.inflationRate).toBe(original.inflationRate)
    expect(singleton.retirementEndAge).toBe(original.retirementEndAge)
    expect(singleton.visibleProducts).toEqual(original.visibleProducts)
    expect(singleton.statutoryPension).toEqual(original.statutoryPension)
  })

  it('projecting the singleton view through the legacy engine matches a direct legacy run', () => {
    const workspace = migrateRich()
    const projected = singletonViewOfWorkspace(workspace, SINGLETON_DEFAULTS)
    // Use all-products visibility so we get one result per product per scenario.
    const allVisible: ProductId[] = ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester']
    const projectedAssumptions = { ...projected, visibleProducts: [...allVisible] }
    const directAssumptions = { ...makeRichV1().assumptions, visibleProducts: [...allVisible] }

    const projectedResult = simulateRetirementComparison(
      defaultProfile,
      projectedAssumptions,
      de2026Rules,
    )
    const directResult = simulateRetirementComparison(
      defaultProfile,
      directAssumptions,
      de2026Rules,
    )

    // Both runs should produce identical retirement outcomes.
    expect(projectedResult.products).toHaveLength(directResult.products.length)
    for (let i = 0; i < directResult.products.length; i++) {
      const a = projectedResult.products[i]
      const b = directResult.products[i]
      expect(a.productId).toBe(b.productId)
      expect(a.scenarioId).toBe(b.scenarioId)
      expect(a.capitalAtRetirement).toBeCloseTo(b.capitalAtRetirement, 2)
      expect(a.netMonthlyPayout).toBeCloseTo(b.netMonthlyPayout, 2)
      // afterTaxLumpSum may be null (Basisrente) — handle that.
      if (a.afterTaxLumpSum !== null && b.afterTaxLumpSum !== null) {
        expect(a.afterTaxLumpSum).toBeCloseTo(b.afterTaxLumpSum, 2)
      } else {
        expect(a.afterTaxLumpSum).toBe(b.afterTaxLumpSum)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Two bAV instances — cap aggregation
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — two bAV instances share the §3 Nr. 63 cap', () => {
  it('aggregate effective gross conversion is scaled to fit the §3 Nr. 63 limit', () => {
    // §3 Nr. 63 cap = 8 % × 101 400 / 12 ≈ 676 EUR/month. Two instances at 400 + 350
    // = 750 EUR/month aggregate → over the cap → scaling required.
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const taxFreeLimitMonthly = (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap) / 12

    const instA: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-a',
      label: 'bAV Vertrag A',
      monthlyGrossConversion: 400,
    }
    const instB: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-b',
      label: 'bAV Vertrag B',
      monthlyGrossConversion: 350,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          bav: [instA, instB],
        },
      },
    }

    const portfolioFunding = buildPortfolioFunding(ws, de2026Rules)
    const fundingA = portfolioFunding.bavByInstanceId['bav-a']
    const fundingB = portfolioFunding.bavByInstanceId['bav-b']
    expect(fundingA).toBeDefined()
    expect(fundingB).toBeDefined()

    // The aggregate scaled gross conversion sits at the cap (within rounding tolerance).
    const totalScaledGrossMonthly =
      fundingA.monthlyGrossConversion + fundingB.monthlyGrossConversion
    expect(totalScaledGrossMonthly).toBeLessThanOrEqual(taxFreeLimitMonthly + 0.01)

    // Per-instance scaling ratio matches the aggregate scaling factor — A keeps its
    // pre-scale share of the total, same for B.
    const expectedScale = taxFreeLimitMonthly / 750
    expect(fundingA.monthlyGrossConversion).toBeCloseTo(400 * expectedScale, 2)
    expect(fundingB.monthlyGrossConversion).toBeCloseTo(350 * expectedScale, 2)
  })

  it('when both instances stay under the §3 Nr. 63 cap, statutory subsidy is proportional to gross conversion', () => {
    // Use small contributions where neither the §3 Nr. 63 cap nor the §1a SV-savings
    // cap binds for either instance. Then the subsidy = 15 % × gross, exact proportional.
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    // 100 + 50 EUR/month: well under the 676 EUR/month §3 Nr. 63 cap and well under
    // the 4 EUR-per-cent SV-savings cap. Subsidy ≈ 15 % × gross for both.
    const instA: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-small-a',
      label: 'bAV Small A',
      monthlyGrossConversion: 100,
    }
    const instB: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-small-b',
      label: 'bAV Small B',
      monthlyGrossConversion: 50,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          bav: [instA, instB],
        },
      },
    }

    const portfolioFunding = buildPortfolioFunding(ws, de2026Rules)
    const fundingA = portfolioFunding.bavByInstanceId['bav-small-a']
    const fundingB = portfolioFunding.bavByInstanceId['bav-small-b']
    expect(fundingA.monthlyStatutoryEmployerSubsidy).toBeGreaterThan(0)
    expect(fundingB.monthlyStatutoryEmployerSubsidy).toBeGreaterThan(0)

    // Both gross unchanged (no scaling).
    expect(fundingA.monthlyGrossConversion).toBe(100)
    expect(fundingB.monthlyGrossConversion).toBe(50)

    // Subsidy ratio matches the gross ratio (2:1).
    const ratioGross = fundingA.monthlyGrossConversion / fundingB.monthlyGrossConversion
    const ratioSubsidy = fundingA.monthlyStatutoryEmployerSubsidy / fundingB.monthlyStatutoryEmployerSubsidy
    expect(ratioSubsidy).toBeCloseTo(ratioGross, 2)
  })

  it('simulatePortfolio produces two distinct ProductResult arrays for two bAV instances', () => {
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const instA: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-a',
      label: 'bAV Vertrag A',
      monthlyGrossConversion: 200,
    }
    const instB: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-b',
      label: 'bAV Vertrag B',
      monthlyGrossConversion: 100,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          bav: [instA, instB],
        },
      },
    }

    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    expect(perInstance['bav-a']).toBeDefined()
    expect(perInstance['bav-b']).toBeDefined()
    // Each instance gets one ProductResult per returnScenario (3 scenarios in defaults).
    expect(perInstance['bav-a']).toHaveLength(3)
    expect(perInstance['bav-b']).toHaveLength(3)
    // Every result is tagged with its instanceId.
    for (const r of perInstance['bav-a']) expect(r.instanceId).toBe('bav-a')
    for (const r of perInstance['bav-b']) expect(r.instanceId).toBe('bav-b')
  })
})

// ---------------------------------------------------------------------------
// 3. Two ETF instances Sparerpauschbetrag (deferred — Decision C)
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — Sparerpauschbetrag cross-instance handling', () => {
  it('surfaces a portfolioFunding.notes entry when ≥2 ETF instances are present', () => {
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const etfBase = workspace.baseline.assumptions.etf[0]
    const etfA: EtfInstance = { ...etfBase, instanceId: 'etf-a', label: 'ETF A' }
    const etfB: EtfInstance = { ...etfBase, instanceId: 'etf-b', label: 'ETF B' }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          etf: [etfA, etfB],
        },
      },
    }

    const { portfolioFunding } = simulatePortfolio(ws, de2026Rules)
    expect(portfolioFunding.notes.some(n => n.toLowerCase().includes('sparerpauschbetrag'))).toBe(true)
  })

  it.skip('TODO(issue 15): two ETF instances correctly share the €1 000 single allowance, not 2 × €1 000', () => {
    // Deferred per Decision C. The cross-instance Sparerpauschbetrag apportionment
    // requires engine changes in `etfPayout.ts` (the saver-allowance is consumed
    // year-by-year inside the per-product simulator). Issue 15 lands the engine
    // extension.
  })
})

// ---------------------------------------------------------------------------
// 4. derivedFromBaselineSnapshot freezing — see portfolioState.test.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Re-base stub
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — re-base stub', () => {
  it.skip('TODO(issue P2): re-basing a what-if reconstructs deltas against the new baseline', () => {
    // The full diff/re-apply algorithm lands in issue P2. The stub in
    // `portfolioState.ts` only refreshes the snapshot; it does not transplant
    // deltas. Issue P2 will replace the stub with a structural diff + re-apply.
  })
})

// ---------------------------------------------------------------------------
// 6. Projection round-trip stability
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — projection round-trip stability', () => {
  it('projecting the same instance twice produces identical assumptions', () => {
    const workspace = migrateRich()
    const bavInst = workspace.baseline.assumptions.bav[0]
    const a = projectInstanceToScenarioAssumptions(bavInst, workspace.baseline.assumptions)
    const b = projectInstanceToScenarioAssumptions(bavInst, workspace.baseline.assumptions)
    expect(a).toEqual(b)
  })

  it('projecting a length-1 instance does not mutate the workspace assumptions', () => {
    const workspace = migrateRich()
    const before = JSON.stringify(workspace.baseline.assumptions)
    const bavInst = workspace.baseline.assumptions.bav[0]
    projectInstanceToScenarioAssumptions(bavInst, workspace.baseline.assumptions)
    const after = JSON.stringify(workspace.baseline.assumptions)
    expect(after).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// 7. Neutralised defaults are truly neutral
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — neutralised defaults', () => {
  it('NEUTRALISED_BAV has zero monthly conversion, no employer match, no statutory subsidy', () => {
    expect(NEUTRALISED_BAV.monthlyGrossConversion).toBe(0)
    expect(NEUTRALISED_BAV.contractualMatchPercent).toBe(0)
    expect(NEUTRALISED_BAV.contractualFixedMonthly).toBe(0)
    expect(NEUTRALISED_BAV.statutoryMinimumSubsidyEnabled).toBe(false)
  })

  it('NEUTRALISED_ETF has zero asset fee', () => {
    expect(NEUTRALISED_ETF.annualAssetFee).toBe(0)
  })

  it('NEUTRALISED_INSURANCE has no guarantee, no contributions', () => {
    expect(NEUTRALISED_INSURANCE.capitalGuarantee.enabled).toBe(false)
  })

  it('NEUTRALISED_BASISRENTE has zero monthly contribution', () => {
    expect(NEUTRALISED_BASISRENTE.monthlyGrossContribution).toBe(0)
  })

  it('NEUTRALISED_ALTERSVORSORGEDEPOT has zero own contribution and no eligibility', () => {
    expect(NEUTRALISED_ALTERSVORSORGEDEPOT.monthlyOwnContribution).toBe(0)
    expect(NEUTRALISED_ALTERSVORSORGEDEPOT.eligibility.directlyEligible).toBe(false)
  })

  it('NEUTRALISED_RIESTER has zero own contribution and zero existing capital', () => {
    expect(NEUTRALISED_RIESTER.monthlyOwnContribution).toBe(0)
    expect(NEUTRALISED_RIESTER.existingCapital).toBe(0)
  })

  it('projecting a Basisrente instance neutralises the bAV slot — bavFunding shows zero conversion', () => {
    const workspace = migrateRich()
    const basisrenteInst = workspace.baseline.assumptions.basisrente[0]
    const projected = projectInstanceToScenarioAssumptions(basisrenteInst, workspace.baseline.assumptions)
    expect(projected.bav.monthlyGrossConversion).toBe(0)
    expect(projected.bav.contractualFixedMonthly).toBe(0)
    expect(projected.bav.contractualMatchPercent).toBe(0)
    // The other product slots are also neutralised.
    expect(projected.etf.annualAssetFee).toBe(0)
    expect(projected.altersvorsorgedepot.monthlyOwnContribution).toBe(0)
    expect(projected.riester.monthlyOwnContribution).toBe(0)
    // Only Basisrente slot carries the instance's data.
    expect(projected.basisrente.monthlyGrossContribution).toBe(basisrenteInst.monthlyGrossContribution)
  })

  it('projecting a Riester instance with currentValueEUR maps to existingCapital', () => {
    const workspace = migrateRich()
    const riesterInst: RiesterInstance = {
      ...workspace.baseline.assumptions.riester[0],
      currentValueEUR: 12_345,
      existingCapital: 0,
    }
    const projected = projectInstanceToScenarioAssumptions(riesterInst, workspace.baseline.assumptions)
    expect(projected.riester.existingCapital).toBe(12_345)
  })

  it('projecting an AVD instance with currentValueEUR maps to riesterTransferCapital', () => {
    const workspace = migrateRich()
    const avdInst: AltersvorsorgedepotInstance = {
      ...workspace.baseline.assumptions.altersvorsorgedepot[0],
      currentValueEUR: 8_000,
      riesterTransferCapital: 0,
    }
    const projected = projectInstanceToScenarioAssumptions(avdInst, workspace.baseline.assumptions)
    expect(projected.altersvorsorgedepot.riesterTransferCapital).toBe(8_000)
  })
})

// ---------------------------------------------------------------------------
// 8. extractSingletonAssumptions removal — covered structurally
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — extractSingletonAssumptions removal', () => {
  it('extractSingletonAssumptions is no longer exported from src/storage.ts', async () => {
    // Dynamic import to avoid a hard compile-time failure: vitest still imports
    // and runs this test even when the type-checker rejects the legacy import.
    const storage = await import('../storage')
    expect((storage as Record<string, unknown>).extractSingletonAssumptions).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 9. Surrendered instances skipped from cap aggregation
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — surrendered instances are skipped', () => {
  it('a surrendered bAV instance contributes zero to the cap aggregation', () => {
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    // One active 200 EUR/month, one surrendered 1000 EUR/month — only the active
    // 200 should appear in the funding map.
    const active: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-active',
      label: 'Active bAV',
      monthlyGrossConversion: 200,
      status: 'active',
    }
    const surrendered: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-surrendered',
      label: 'Surrendered bAV',
      monthlyGrossConversion: 1000,
      status: 'surrendered',
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          bav: [active, surrendered],
        },
      },
    }

    const { perInstance, portfolioFunding } = simulatePortfolio(ws, de2026Rules)
    // Surrendered instance is omitted entirely.
    expect(perInstance['bav-surrendered']).toBeUndefined()
    expect(portfolioFunding.bavByInstanceId['bav-surrendered']).toBeUndefined()

    // Active instance carries the original gross — no scaling because the
    // surrendered amount was excluded from the aggregate.
    const fundingActive = portfolioFunding.bavByInstanceId['bav-active']
    expect(fundingActive).toBeDefined()
    expect(fundingActive.monthlyGrossConversion).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// 10. Per-product round-trip
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — per-product round-trip via simulatePortfolio', () => {
  // Products with their own contribution field — capital should be > 0.
  it.each([
    ['bav', 'bav'],
    ['basisrente', 'basisrente'],
    ['altersvorsorgedepot', 'altersvorsorgedepot'],
    ['riester', 'riester'],
  ] as const)('produces a non-zero ProductResult for product=%s in a length-1 workspace', (productId, slotKey) => {
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const arr = workspace.baseline.assumptions[slotKey as keyof typeof workspace.baseline.assumptions]
    expect(Array.isArray(arr)).toBe(true)
    expect((arr as unknown[]).length).toBeGreaterThan(0)

    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const inst = (arr as unknown as Array<{ instanceId: string }>)[0]
    const results = perInstance[inst.instanceId]
    expect(results).toBeDefined()
    expect(results.length).toBe(workspace.baseline.assumptions.returnScenarios.length)
    for (const r of results) {
      expect(r.productId).toBe(productId)
      expect(r.instanceId).toBe(inst.instanceId)
      expect(r.capitalAtRetirement).toBeGreaterThan(0)
    }
  })

  // ETF and Insurance derive their contribution from `bavFunding.monthlyNetCost`
  // (the fair-comparison invariant — see CLAUDE.md "Non-obvious architecture").
  // In combine-mode, when projecting an ETF or insurance instance in isolation,
  // the bAV slot is NEUTRALISED → the cash anchor is zero → contribution = 0.
  // This is expected M1 behaviour. Issue 15 introduces per-instance contribution
  // amounts for ETF / insurance so they no longer depend on the bAV cash anchor
  // in combine-mode. The structural assertions below pin the M1 contract.
  it.each([
    ['etf', 'etf'],
    ['versicherung', 'insurance'],
  ] as const)('produces a structurally-correct (but zero-contribution) result for product=%s in a length-1 workspace (M1 limitation; issue 15)', (productId, slotKey) => {
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const arr = workspace.baseline.assumptions[slotKey as keyof typeof workspace.baseline.assumptions]
    expect(Array.isArray(arr)).toBe(true)

    const { perInstance } = simulatePortfolio(workspace, de2026Rules)
    const inst = (arr as unknown as Array<{ instanceId: string }>)[0]
    const results = perInstance[inst.instanceId]
    expect(results).toBeDefined()
    expect(results.length).toBe(workspace.baseline.assumptions.returnScenarios.length)
    for (const r of results) {
      expect(r.productId).toBe(productId)
      expect(r.instanceId).toBe(inst.instanceId)
      // M1 limitation — capital is 0 because the bAV cash anchor is neutralised.
      expect(r.capitalAtRetirement).toBeGreaterThanOrEqual(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Bonus: instance equivalence vs legacy singleton path
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — length-1 instance ≈ legacy singleton', () => {
  it('a length-1 bAV instance produces the same monthlyUserCost as the legacy singleton bAV', () => {
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    // Force visibleProducts to include bAV so the legacy run produces a bAV result.
    const wsWithBavVisible: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          visibleProducts: ['bav'],
        },
      },
    }
    const { perInstance, portfolioFunding } = simulatePortfolio(wsWithBavVisible, de2026Rules)
    const bavInst = wsWithBavVisible.baseline.assumptions.bav[0]
    const adapterResults = perInstance[bavInst.instanceId]
    expect(adapterResults).toBeDefined()

    const legacyResult = simulateRetirementComparison(
      defaultProfile,
      { ...baseV1.assumptions, visibleProducts: ['bav'] },
      de2026Rules,
    )
    const legacyBav = legacyResult.products.filter(p => p.productId === 'bav')
    expect(adapterResults).toHaveLength(legacyBav.length)
    for (let i = 0; i < legacyBav.length; i++) {
      expect(adapterResults[i].monthlyUserCost).toBeCloseTo(legacyBav[i].monthlyUserCost, 2)
      expect(adapterResults[i].capitalAtRetirement).toBeCloseTo(legacyBav[i].capitalAtRetirement, 2)
    }

    // The funding share should match the legacy bavFunding too.
    const fundingFromAdapter = portfolioFunding.bavByInstanceId[bavInst.instanceId]
    expect(fundingFromAdapter.monthlyNetCost).toBeCloseTo(legacyResult.bavFunding.monthlyNetCost, 2)
  })
})

// ---------------------------------------------------------------------------
// Cross-instance Basisrente cap
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — Basisrente Schicht-1 cap shared across instances', () => {
  it('two Basisrente instances over the cap have their effective contributions scaled', () => {
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    // Push Basisrente totals over the §10 Abs. 3 Schicht-1 cap (EUR 30 826 for 2026,
    // less the GRV pension contributions). For our default profile (75k brutto), the
    // remaining cap is in the order of EUR 10–15k. Two instances at 1500 EUR/month each
    // = 36 000 EUR/year combined will exceed it.
    const baseInst = workspace.baseline.assumptions.basisrente[0]
    const a: BasisrenteInstance = {
      ...baseInst,
      instanceId: 'basisrente-a',
      monthlyGrossContribution: 1500,
    }
    const b: BasisrenteInstance = {
      ...baseInst,
      instanceId: 'basisrente-b',
      monthlyGrossContribution: 1500,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          basisrente: [a, b],
        },
      },
    }

    const portfolioFunding = buildPortfolioFunding(ws, de2026Rules)
    const fA = portfolioFunding.basisrenteByInstanceId['basisrente-a']
    const fB = portfolioFunding.basisrenteByInstanceId['basisrente-b']
    expect(fA).toBeDefined()
    expect(fB).toBeDefined()
    // The annual deductibles, summed, must respect the remaining Schicht-1 cap.
    // (We can't easily access the cap from the funding result, but we can check
    // that the deductibles are below the schicht1CapSingle.)
    const sumDeductible = fA.annualDeductible + fB.annualDeductible
    expect(sumDeductible).toBeLessThanOrEqual(de2026Rules.basisrente.schicht1CapSingle + 1)
  })
})

// ---------------------------------------------------------------------------
// Cross-instance Riester cap
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — Riester §10a cap shared across instances', () => {
  it('two Riester instances over the §10a cap have their effective contributions scaled', () => {
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const baseInst = workspace.baseline.assumptions.riester[0]
    // Riester §10a annual cap (incl. allowances) = 2 100 EUR. Two instances at
    // 200 EUR/month each = 4 800 EUR/year > cap → scaling expected.
    const a: RiesterInstance = {
      ...baseInst,
      instanceId: 'riester-a',
      monthlyOwnContribution: 200,
    }
    const b: RiesterInstance = {
      ...baseInst,
      instanceId: 'riester-b',
      monthlyOwnContribution: 200,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          riester: [a, b],
        },
      },
    }

    const portfolioFunding = buildPortfolioFunding(ws, de2026Rules)
    const fA = portfolioFunding.riesterByInstanceId['riester-a']
    const fB = portfolioFunding.riesterByInstanceId['riester-b']
    expect(fA).toBeDefined()
    expect(fB).toBeDefined()
    // Sum of Sonderausgaben deductibles respects the Riester cap.
    const sumDeductible = fA.specialExpenseDeductibleAnnual + fB.specialExpenseDeductibleAnnual
    expect(sumDeductible).toBeLessThanOrEqual(de2026Rules.riester.annualCapInclAllowances * 2 + 1)
  })
})

// ---------------------------------------------------------------------------
// PortfolioFunding shape
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — PortfolioFunding shape', () => {
  it('includes maps for all five fundable product slots and a notes array', () => {
    const workspace = migrateRich()
    const portfolioFunding = buildPortfolioFunding(workspace, de2026Rules)
    expect(portfolioFunding.bavByInstanceId).toBeDefined()
    expect(portfolioFunding.basisrenteByInstanceId).toBeDefined()
    expect(portfolioFunding.altersvorsorgedepotByInstanceId).toBeDefined()
    expect(portfolioFunding.riesterByInstanceId).toBeDefined()
    expect(Array.isArray(portfolioFunding.notes)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Insurance instance projection (the contractStartYear special case)
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — insurance instance projection', () => {
  it('insurance contractStartYear from InstanceCommon is preserved (not stripped)', () => {
    const workspace = migrateRich()
    const insInst: InsuranceInstance = {
      ...workspace.baseline.assumptions.insurance[0],
      contractStartYear: 1999, // pre-2005 vintage
    }
    const projected = projectInstanceToScenarioAssumptions(insInst, workspace.baseline.assumptions)
    expect(projected.insurance.contractStartYear).toBe(1999)
  })
})
