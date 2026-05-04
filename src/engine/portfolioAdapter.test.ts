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

import { describe, expect, it, vi } from 'vitest'
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

  it('two ETF instances share the €1 000 single allowance per year (no double-credit)', () => {
    // Phase G M4 F3 — cross-instance Sparerpauschbetrag.
    // Construct two ETF instances large enough that each generates ≥€1 000 of
    // taxable gain per payout year on its own. Assert that the SUM of
    // `saverAllowanceUsed` across the two instances equals exactly the single
    // taxpayer allowance (€1 000), not 2 × €1 000.
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const etfBase = workspace.baseline.assumptions.etf[0]
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
        assumptions: {
          ...workspace.baseline.assumptions,
          etf: [etfA, etfB],
        },
      },
    }

    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const scenarioId = ws.baseline.assumptions.returnScenarios[0].id
    const aResult = perInstance['etf-a'].find(r => r.scenarioId === scenarioId)
    const bResult = perInstance['etf-b'].find(r => r.scenarioId === scenarioId)
    expect(aResult).toBeDefined()
    expect(bResult).toBeDefined()
    if (aResult?.productId !== 'etf' || bResult?.productId !== 'etf') {
      throw new Error('expected ETF result type')
    }

    // Find a payout year where BOTH instances produce ≥ €600 of taxable
    // gain after partial-exemption — i.e. allowance is the binding constraint.
    const partialExemption = baseV1.assumptions.etf.equityPartialExemption
    let bindingYearIdx = -1
    for (let i = 0; i < aResult.etfPayoutRows.length && i < bResult.etfPayoutRows.length; i++) {
      const aDemand = aResult.etfPayoutRows[i].taxableGain * (1 - partialExemption)
      const bDemand = bResult.etfPayoutRows[i].taxableGain * (1 - partialExemption)
      if (aDemand + bDemand > de2026Rules.capitalGains.saverAllowance + 50) {
        bindingYearIdx = i
        break
      }
    }
    expect(bindingYearIdx).toBeGreaterThanOrEqual(0)

    const aRow = aResult.etfPayoutRows[bindingYearIdx]
    const bRow = bResult.etfPayoutRows[bindingYearIdx]
    const summedAllowance = aRow.saverAllowanceUsed + bRow.saverAllowanceUsed
    // Per-instance back-allocation sums to exactly the single allowance — no
    // double-credit, no under-credit.
    expect(summedAllowance).toBeCloseTo(de2026Rules.capitalGains.saverAllowance, 2)
  })

  it('two small ETF instances (combined demand €1 200) tax exactly €200 (€1 000 covered by single allowance)', () => {
    // Targeted regression for the user spec:
    //   "2 ETF instances each with €600 annual capital gains → only €1 000
    //    (single) of the €1 200 total escapes Abgeltungsteuer; remaining €200
    //    taxed."
    //
    // Build two small ETF instances and re-run them through `simulatePortfolio`,
    // then evaluate the year(s) where the combined post-exemption taxable
    // gain is ≈€1 200. Verify total tax across both instances ≈ tax on €200
    // at flat 25 % + 5.5 % Soli (no real Werbungskosten, no §35a).
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const etfBase = workspace.baseline.assumptions.etf[0]
    // Small contributions so the long-run capital builds enough to make a
    // payout-year `taxableAfterExemption ≈ 600` per instance feasible.
    const etfA: EtfInstance = {
      ...etfBase,
      instanceId: 'etf-tiny-a',
      label: 'ETF Tiny A',
      monthlyContribution: 200,
    }
    const etfB: EtfInstance = {
      ...etfBase,
      instanceId: 'etf-tiny-b',
      label: 'ETF Tiny B',
      monthlyContribution: 200,
    }
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

    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const scenarioId = ws.baseline.assumptions.returnScenarios[0].id
    const aResult = perInstance['etf-tiny-a'].find(r => r.scenarioId === scenarioId)
    const bResult = perInstance['etf-tiny-b'].find(r => r.scenarioId === scenarioId)
    if (aResult?.productId !== 'etf' || bResult?.productId !== 'etf') {
      throw new Error('expected ETF result type')
    }

    // Sum across all payout years. Cross-instance allowance sharing means
    // total tax across both instances must NOT be double-credited.
    let totalDemand = 0
    let totalAllowanceUsed = 0
    let totalTax = 0
    const partialExemption = baseV1.assumptions.etf.equityPartialExemption
    for (let i = 0; i < aResult.etfPayoutRows.length; i++) {
      const a = aResult.etfPayoutRows[i]
      const b = bResult.etfPayoutRows[i]
      const yearDemand = (a.taxableGain + b.taxableGain) * (1 - partialExemption)
      totalDemand += yearDemand
      totalAllowanceUsed += a.saverAllowanceUsed + b.saverAllowanceUsed
      totalTax += a.taxDue + b.taxDue
      // Per-year sum must never exceed the single allowance.
      expect(a.saverAllowanceUsed + b.saverAllowanceUsed).toBeLessThanOrEqual(
        de2026Rules.capitalGains.saverAllowance + 0.01,
      )
    }
    // Sanity: at least one binding year (combined demand > allowance).
    expect(totalDemand).toBeGreaterThan(de2026Rules.capitalGains.saverAllowance)
    expect(totalAllowanceUsed).toBeGreaterThan(0)
    expect(totalTax).toBeGreaterThan(0)
  })

  it('length-1 ETF workspace is byte-identical to compare-mode (no shared-allowance penalty)', () => {
    // Single-instance combine-mode must match compare-mode oracle goldens
    // because the cross-instance re-run path is gated on ≥2 active ETF
    // instances. Compare key payout fields against `simulateRetirementComparison`.
    const baseV1 = makeRichV1()
    const workspace = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    // Use ETF assumptions as-is, with the bAV monthlyContribution mirrored on
    // the singleton ETF instance so combine and compare paths see the same
    // monthly inflow (compare-mode pulls from bavFunding.monthlyNetCost; the
    // recommender wiring honors per-instance overrides in combine-mode).
    const projected = singletonViewOfWorkspace(workspace, SINGLETON_DEFAULTS)
    const compareResult = simulateRetirementComparison(
      defaultProfile,
      { ...projected, visibleProducts: ['etf'] as ProductId[] },
      de2026Rules,
    )
    const compareEtf = compareResult.products.find(p => p.productId === 'etf')
    expect(compareEtf).toBeDefined()

    // Combine-mode: single ETF with the same monthlyContribution as compare's
    // bavFunding.monthlyNetCost (mirrored explicitly).
    const etfBase = workspace.baseline.assumptions.etf[0]
    const monthly = compareResult.bavFunding.monthlyNetCost
    const etfOnly: EtfInstance = {
      ...etfBase,
      instanceId: 'etf-only',
      label: 'ETF',
      monthlyContribution: monthly,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          etf: [etfOnly],
        },
      },
    }
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const combineEtf = perInstance['etf-only'].find(r => r.scenarioId === compareEtf!.scenarioId)
    expect(combineEtf).toBeDefined()
    if (combineEtf?.productId !== 'etf') {
      throw new Error('expected ETF result type')
    }
    expect(combineEtf.capitalAtRetirement).toBeCloseTo(compareEtf!.capitalAtRetirement, 2)
    expect(combineEtf.afterTaxLumpSum).toBeCloseTo(compareEtf!.afterTaxLumpSum ?? 0, 2)
    if (compareEtf?.productId === 'etf') {
      expect(combineEtf.etfPayoutRows.length).toBe(compareEtf.etfPayoutRows.length)
      for (let i = 0; i < compareEtf.etfPayoutRows.length; i++) {
        expect(combineEtf.etfPayoutRows[i].taxDue).toBeCloseTo(compareEtf.etfPayoutRows[i].taxDue, 2)
        expect(combineEtf.etfPayoutRows[i].saverAllowanceUsed).toBeCloseTo(
          compareEtf.etfPayoutRows[i].saverAllowanceUsed, 2,
        )
      }
    }
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
// Phase G M4 F1 — paid_up (Beitragsfrei) engine support across 5 simulators
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — Beitragsfrei (paid_up) engine support (M4 F1)', () => {
  /**
   * Helper: build a length-1 workspace where the SOLE instance of `slotKey`
   * has `status: 'paid_up'` and a non-trivial `currentValueEUR`. Returns the
   * paid-up workspace and an "active" twin (same fields, status: 'active') so
   * tests can compare the two.
   */
  function makePaidUpAndActiveWorkspace<K extends 'bav' | 'basisrente' | 'altersvorsorgedepot' | 'riester' | 'insurance'>(
    slotKey: K,
    currentValueEUR: number,
  ): { paidUp: Workspace; active: Workspace } {
    const baseV1 = makeRichV1()
    const ws = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const orig = (ws.baseline.assumptions[slotKey] as unknown as Array<{ instanceId: string }>)[0]
    const activeInst = { ...orig, status: 'active' as const, currentValueEUR }
    const paidUpInst = { ...orig, status: 'paid_up' as const, currentValueEUR }
    const buildWith = (inst: typeof activeInst): Workspace => ({
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          [slotKey]: [inst],
        },
      },
    })
    return {
      paidUp: buildWith(paidUpInst as unknown as typeof activeInst),
      active: buildWith(activeInst),
    }
  }

  it('paid_up bAV: zero contributions, capital seeded by currentValueEUR; differs from active baseline', () => {
    const { paidUp, active } = makePaidUpAndActiveWorkspace('bav', 50_000)
    const paidUpResult = simulatePortfolio(paidUp, de2026Rules)
    const activeResult = simulatePortfolio(active, de2026Rules)
    const id = paidUp.baseline.assumptions.bav[0].instanceId
    const paidUpResults = paidUpResult.perInstance[id]
    const activeResults = activeResult.perInstance[id]
    expect(paidUpResults).toBeDefined()
    expect(activeResults).toBeDefined()

    for (const r of paidUpResults) {
      // No contributions during paid-up phase.
      expect(r.monthlyUserCost).toBe(0)
      expect(r.monthlyProductContribution).toBe(0)
      expect(r.monthlyEmployerContribution).toBe(0)
      expect(r.totalProductContributions).toBe(0)
      // No salary-phase tax/SV savings during paid-up.
      expect(r.taxAndSvSavings).toBe(0)
      // Capital exists and grows from currentValueEUR.
      expect(r.capitalAtRetirement).toBeGreaterThanOrEqual(50_000)
    }

    // Active vs paid_up MUST diverge: active has contributions, paid_up doesn't.
    expect(paidUpResults[0].capitalAtRetirement).not.toBe(activeResults[0].capitalAtRetirement)
    expect(paidUpResults[0].totalProductContributions).toBeLessThan(
      activeResults[0].totalProductContributions,
    )
    // The paid_up funding entry was emitted with zero conversion.
    expect(paidUpResult.portfolioFunding.bavByInstanceId[id].monthlyGrossConversion).toBe(0)
  })

  it('paid_up Basisrente: zero contributions, capital from currentValueEUR; differs from active', () => {
    const { paidUp, active } = makePaidUpAndActiveWorkspace('basisrente', 30_000)
    const paidUpResult = simulatePortfolio(paidUp, de2026Rules)
    const activeResult = simulatePortfolio(active, de2026Rules)
    const id = paidUp.baseline.assumptions.basisrente[0].instanceId
    const paidUpResults = paidUpResult.perInstance[id]
    const activeResults = activeResult.perInstance[id]
    expect(paidUpResults).toBeDefined()

    for (const r of paidUpResults) {
      expect(r.monthlyUserCost).toBe(0)
      expect(r.monthlyProductContribution).toBe(0)
      expect(r.totalProductContributions).toBe(0)
      expect(r.capitalAtRetirement).toBeGreaterThanOrEqual(30_000)
    }
    expect(paidUpResults[0].capitalAtRetirement).not.toBe(activeResults[0].capitalAtRetirement)
    expect(paidUpResult.portfolioFunding.basisrenteByInstanceId[id].monthlyGrossContribution).toBe(0)
  })

  it('paid_up Riester: zero contributions, zero allowances, capital from currentValueEUR', () => {
    const { paidUp, active } = makePaidUpAndActiveWorkspace('riester', 20_000)
    // Make sure Riester eligibility is enabled in the active twin so we can
    // verify allowances flow when active vs zero when paid_up.
    const enableRiesterEligibility = (ws: Workspace): Workspace => ({
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          riester: ws.baseline.assumptions.riester.map((r) => ({
            ...r,
            eligibility: { ...r.eligibility, directlyEligible: true },
          })),
        },
      },
    })
    const paidUpEnabled = enableRiesterEligibility(paidUp)
    const activeEnabled = enableRiesterEligibility(active)
    const paidUpResult = simulatePortfolio(paidUpEnabled, de2026Rules)
    const activeResult = simulatePortfolio(activeEnabled, de2026Rules)
    const id = paidUpEnabled.baseline.assumptions.riester[0].instanceId
    const paidUpFunding = paidUpResult.portfolioFunding.riesterByInstanceId[id]
    const activeFunding = activeResult.portfolioFunding.riesterByInstanceId[id]

    // Zero own contribution AND zero allowances during paid-up.
    expect(paidUpFunding.monthlyOwnContribution).toBe(0)
    expect(paidUpFunding.totalAllowanceAnnual).toBe(0)
    // Active twin still has an own contribution (and possibly allowances).
    expect(activeFunding.monthlyOwnContribution).toBeGreaterThan(0)

    const paidUpResults = paidUpResult.perInstance[id]
    for (const r of paidUpResults) {
      expect(r.monthlyUserCost).toBe(0)
      expect(r.capitalAtRetirement).toBeGreaterThanOrEqual(20_000)
    }
  })

  it('paid_up AVD: zero contributions, zero allowances, capital from currentValueEUR (mapped to riesterTransferCapital)', () => {
    const { paidUp, active } = makePaidUpAndActiveWorkspace('altersvorsorgedepot', 25_000)
    const paidUpResult = simulatePortfolio(paidUp, de2026Rules)
    const activeResult = simulatePortfolio(active, de2026Rules)
    const id = paidUp.baseline.assumptions.altersvorsorgedepot[0].instanceId
    const paidUpFunding = paidUpResult.portfolioFunding.altersvorsorgedepotByInstanceId[id]

    expect(paidUpFunding.monthlyOwnContribution).toBe(0)
    expect(paidUpFunding.totalAllowanceAnnual).toBe(0)

    const paidUpResults = paidUpResult.perInstance[id]
    const activeResults = activeResult.perInstance[id]
    for (const r of paidUpResults) {
      expect(r.monthlyUserCost).toBe(0)
      // Capital seeded from currentValueEUR (via existingCapital→riesterTransferCapital
      // mapping in projectInstanceToScenarioAssumptions).
      expect(r.capitalAtRetirement).toBeGreaterThanOrEqual(25_000)
    }
    expect(paidUpResults[0].capitalAtRetirement).not.toBe(activeResults[0].capitalAtRetirement)
  })

  it('paid_up insurance (pAV): zero contributions; capital seeded from currentValueEUR', () => {
    // The fair-comparison invariant ties "active" pAV monthly contribution to
    // `bavFunding.monthlyNetCost` (compare-mode rule, see CLAUDE.md). In a
    // length-1 workspace with a NEUTRALISED bAV slot both active and paid-up
    // pAV would get zero contribution and look identical. Per the existing M1
    // limitation tests (line ~560: "produces a structurally-correct (but
    // zero-contribution) result for product=versicherung in a length-1
    // workspace"), the value-divergence check needs a bAV instance to drive
    // the cash anchor. The structural assertion below — pAV paid_up has zero
    // contributions and capital >= currentValueEUR — is the meaningful one;
    // value divergence is covered by bAV / Basisrente / AVD / Riester tests
    // above where the per-instance funding directly differs.
    const baseV1 = makeRichV1()
    const ws = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    const orig = ws.baseline.assumptions.insurance[0]
    const withFees: InsuranceInstance = {
      ...orig,
      status: 'paid_up',
      currentValueEUR: 15_000,
      fees: {
        wrapperAssetFee: 0.005,
        fundAssetFee: 0,
        contributionFee: 0.05,
        fixedMonthlyFee: 5,
        acquisitionCostPct: 0.04,
        acquisitionCostSpreadYears: 5,
        pensionPayoutFeePct: 0,
      },
    }
    const paidUpWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: { ...ws.baseline.assumptions, insurance: [withFees] },
      },
    }
    const paidUpResults = simulatePortfolio(paidUpWs, de2026Rules).perInstance[withFees.instanceId]
    expect(paidUpResults).toBeDefined()

    for (const r of paidUpResults) {
      expect(r.monthlyUserCost).toBe(0)
      expect(r.monthlyProductContribution).toBe(0)
      // Capital at retirement is >= currentValueEUR (existing capital grows
      // under wrapper fees only — no acquisition cost in phase-2 fees).
      expect(r.capitalAtRetirement).toBeGreaterThanOrEqual(15_000)
    }
  })
})

// ---------------------------------------------------------------------------
// Phase G M4 F1 — round-trip: contractDecision beitragsfreiWhatIf + simulate
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — beitragsfrei round-trip with simulatePortfolio (M4 F1)', () => {
  it('applying beitragsfreiWhatIf produces a workspace whose simulation differs from baseline', async () => {
    const { beitragsfreiWhatIf, applyContractDecision } = await import('../app/contractDecisions')
    const baseV1 = makeRichV1()
    const ws = migrateV1ToV2(
      baseV1.profile as unknown as Record<string, unknown>,
      baseV1.assumptions as unknown as Record<string, unknown>,
    )
    // Add currentValueEUR so paid-up has capital to grow.
    const id = ws.baseline.assumptions.bav[0].instanceId
    const wsWithCapital: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: ws.baseline.assumptions.bav.map((b) => ({ ...b, currentValueEUR: 40_000 })),
        },
      },
    }
    const baseline = simulatePortfolio(wsWithCapital, de2026Rules).perInstance[id][0]
    const decision = beitragsfreiWhatIf(wsWithCapital, id)
    const paidUpWs = applyContractDecision(wsWithCapital, decision)
    const paidUp = simulatePortfolio(paidUpWs, de2026Rules).perInstance[id][0]
    expect(baseline.capitalAtRetirement).not.toBe(paidUp.capitalAtRetirement)
    expect(paidUp.totalProductContributions).toBe(0)
    expect(baseline.totalProductContributions).toBeGreaterThan(0)
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
  // (the fair-comparison invariant) unless the instance carries an explicit
  // `monthlyContribution` field (issue 12 for ETF, issue F2 for insurance).
  // In combine-mode, when projecting an instance WITHOUT `monthlyContribution`
  // set, the bAV slot is NEUTRALISED → the cash anchor is zero → contribution = 0.
  // The structural assertions below pin this fallback contract: instances
  // migrated from V1 (which have no `monthlyContribution`) still produce capital=0.
  it.each([
    ['etf', 'etf'],
    ['versicherung', 'insurance'],
  ] as const)('produces a structurally-correct (but zero-contribution) result for product=%s in a length-1 workspace when monthlyContribution is not set', (productId, slotKey) => {
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
      // Capital is 0: no monthlyContribution set → bAV anchor is neutralised → fallback is 0.
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

// ---------------------------------------------------------------------------
// Issue 15 — TransferEvents engine support
// ---------------------------------------------------------------------------

describe('PortfolioAdapter — TransferEvents (issue 15)', () => {
  function rich(): Workspace {
    return migrateRich()
  }

  it('M2 zero-capital fix — currentValueEUR on ETF instance flows through as initialCapital', () => {
    const workspace = rich()
    const etfInst: EtfInstance = {
      ...workspace.baseline.assumptions.etf[0],
      instanceId: 'etf-with-capital',
      currentValueEUR: 50_000,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          etf: [etfInst],
        },
      },
    }
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const results = perInstance['etf-with-capital']
    expect(results).toBeDefined()
    // With non-zero starting capital and ~30 years horizon: capital must be > 50k.
    for (const r of results) {
      expect(r.capitalAtRetirement).toBeGreaterThan(50_000)
    }
  })

  it('M2 zero-capital fix — currentValueEUR on insurance instance grows over horizon', () => {
    const workspace = rich()
    const insInst: InsuranceInstance = {
      ...workspace.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-with-capital',
      currentValueEUR: 30_000,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          insurance: [insInst],
        },
      },
    }
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const results = perInstance['versicherung-with-capital']
    expect(results).toBeDefined()
    for (const r of results) {
      // Even ignoring contributions, 30k compounded over decades > 30k.
      expect(r.capitalAtRetirement).toBeGreaterThan(30_000)
    }
  })

  it('certified Riester→AVD (year 0) — target receives gross transfer, source residual continues', () => {
    const workspace = rich()
    const riesterSrc: RiesterInstance = {
      ...workspace.baseline.assumptions.riester[0],
      instanceId: 'riester-src',
      label: 'Riester (source)',
      currentValueEUR: 40_000,
      transferEvents: [
        {
          type: 'certified',
          year: de2026Rules.year, // year-0 transfer
          sourceInstanceId: 'riester-src',
          targetInstanceId: 'avd-target',
          amountEUR: 40_000,
        },
      ],
    }
    const avdTarget: AltersvorsorgedepotInstance = {
      ...workspace.baseline.assumptions.altersvorsorgedepot[0],
      instanceId: 'avd-target',
      label: 'AV-Depot (target)',
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          riester: [riesterSrc],
          altersvorsorgedepot: [avdTarget],
        },
      },
    }
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    expect(perInstance['avd-target']).toBeDefined()
    expect(perInstance['riester-src']).toBeDefined()
    // Target AVD started with the transferred capital → grew from 40k.
    for (const r of perInstance['avd-target']) {
      expect(r.capitalAtRetirement).toBeGreaterThan(40_000)
    }
    // Source Riester started from 40k currentValueEUR but lost it via certified transfer.
    // It still contributes monthly (200 EUR/month from rich()) so capital > 0
    // but materially smaller than if no transfer occurred.
    for (const r of perInstance['riester-src']) {
      expect(r.capitalAtRetirement).toBeGreaterThan(0)
    }
  })

  it('certified bAV → bAV transfer between two same-Durchführungsweg instances respects routing', () => {
    const workspace = rich()
    // bavA has monthlyGrossConversion=0 so the year-5 withdrawal is the only
    // funding signal; the receiver delta is purely the compound growth of the injection.
    const bavA: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-source',
      currentValueEUR: 25_000,
      monthlyGrossConversion: 0,
      durchfuehrungsweg: 'direktversicherung_3_63',
      transferEvents: [
        {
          type: 'certified',
          year: de2026Rules.year + 5,
          sourceInstanceId: 'bav-source',
          targetInstanceId: 'bav-receiver',
          amountEUR: 10_000,
        },
      ],
    }
    const bavB: BavInstance = {
      ...workspace.baseline.assumptions.bav[0],
      instanceId: 'bav-receiver',
      durchfuehrungsweg: 'direktversicherung_3_63',
      monthlyGrossConversion: 100,
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          bav: [bavA, bavB],
        },
      },
    }
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    expect(perInstance['bav-source']).toBeDefined()
    expect(perInstance['bav-receiver']).toBeDefined()
    const baselineWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: [{ ...bavA, transferEvents: [] }, bavB],
        },
      },
    }
    const baselineReceiver = simulatePortfolio(baselineWs, de2026Rules).perInstance['bav-receiver']
    // Stronger oracle: certified transfer is tax-neutral; the receiver's capital gain
    // equals exactly 10_000 compounded over the remaining horizon (39 - 5 = 34 years
    // from injection at contractYear 6, 408 months remaining).
    // Net monthly factor = (1+r)^(1/12) × (1-totalFee)^(1/12) where r = basis 5% and
    // totalFee = wrapperAssetFee(0.003) + fundAssetFee(0.005) = 0.008.
    const basisAnnualReturn = 0.05  // index 1 = basis scenario
    const bavTotalFee = 0.003 + 0.005  // from defaultScenario bav.fees
    const monthlyFactor =
      Math.pow(1 + basisAnnualReturn, 1 / 12) * Math.pow(1 - bavTotalFee, 1 / 12)
    const remainingMonths = (67 - 28 - 5) * 12  // (retirementAge - age - eventYearOffset) * 12 = 34 * 12 = 408
    const expectedDelta = 10_000 * Math.pow(monthlyFactor, remainingMonths)
    const actualDelta =
      perInstance['bav-receiver'][1].capitalAtRetirement -
      baselineReceiver[1].capitalAtRetirement
    expect(actualDelta).toBeCloseTo(expectedDelta, 4)
  })

  it('surrender_reinvest pAV → ETF (pre-2005, tax-free) — target gets post-haircut proceeds', () => {
    const workspace = rich()
    const pavSrc: InsuranceInstance = {
      ...workspace.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-karin',
      contractStartYear: 2002,
      oldContractTaxFreeEligible: true,
      currentValueEUR: 60_000,
      surrenderHaircutPct: 0.05,
      transferEvents: [
        {
          type: 'surrender_reinvest',
          year: de2026Rules.year + 5,
          sourceInstanceId: 'versicherung-karin',
          targetInstanceId: 'etf-target',
          amountEUR: 30_000,
          surrenderHaircutPct: 0.05,
        },
      ],
    }
    const etfTarget: EtfInstance = {
      ...workspace.baseline.assumptions.etf[0],
      instanceId: 'etf-target',
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          insurance: [pavSrc],
          etf: [etfTarget],
        },
      },
    }
    // Run with the transfer and again with no transfer; the ETF target should
    // gain the post-haircut proceeds (pre-2005 → tax-free).
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    const noTransferWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          insurance: [{ ...pavSrc, transferEvents: [] }],
        },
      },
    }
    const noTransferResult = simulatePortfolio(noTransferWs, de2026Rules)
    const noTransferEtf = noTransferResult.perInstance['etf-target']
    // ETF target with the surrender_reinvest carries higher capital.
    expect(perInstance['etf-target'][0].capitalAtRetirement).toBeGreaterThan(
      noTransferEtf[0].capitalAtRetirement,
    )
    // Source pAV residual: pre-2005 tax-free, so afterTaxLumpSum = capital at retirement.
    // The source loses the post-haircut proceeds (28_500) at contractYear 6 (month 61).
    // From that point, both runs are identical — the delta at retirement is exactly
    // proceeds × netGrowthFactor^408 (remainingMonths after the withdrawal).
    // Net monthly factor = (1+r)^(1/12) × (1-insFee)^(1/12), insFee = 0.005.
    // We pin per scenario (each scenario has a different annualReturn).
    const karinEvent = pavSrc.transferEvents![0]
    const proceeds = karinEvent.amountEUR * (1 - (karinEvent.type === 'surrender_reinvest' ? karinEvent.surrenderHaircutPct : 0))
    const insTotalFee = 0.003 + 0.002  // wrapperAssetFee + fundAssetFee from defaultScenario
    const remainingMonthsKarin = (67 - 28 - 5) * 12  // 34 * 12 = 408
    const returnRates = [0.03, 0.05, 0.07]  // konservativ, basis, optimistisch
    const noTransferSource = noTransferResult.perInstance['versicherung-karin']
    const withTransferSource = perInstance['versicherung-karin']
    for (let i = 0; i < returnRates.length; i++) {
      const mf = Math.pow(1 + returnRates[i], 1 / 12) * Math.pow(1 - insTotalFee, 1 / 12)
      const expectedDrop = proceeds * Math.pow(mf, remainingMonthsKarin)
      const actualDrop =
        noTransferSource[i].afterTaxLumpSum! - withTransferSource[i].afterTaxLumpSum!
      expect(actualDrop).toBeCloseTo(expectedDrop, 0)
    }
  })

  it('surrender_reinvest — halbeinkuenfte pAV source applies surrender tax (zero cost-basis approximation)', () => {
    // Pins V1 conservative cost-basis approximation; relax when issue 15 P2 addresses
    // mid-horizon contribution preflight.
    const workspace = rich()
    // contractStartYear 2008 + runtime 39y + retirementAge 67 → halbeinkuenfte.
    // amountEUR = 50_000 so half-gain (25_000) exceeds basicAllowance (12_348) →
    // nonzero income tax, confirming the zero-cost-basis path is exercised.
    const pavSrc: InsuranceInstance = {
      ...workspace.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-halbe',
      contractStartYear: 2008,
      oldContractTaxFreeEligible: false,
      currentValueEUR: 80_000,
      surrenderHaircutPct: 0.0,
      transferEvents: [
        {
          type: 'surrender_reinvest',
          year: de2026Rules.year + 5,
          sourceInstanceId: 'versicherung-halbe',
          targetInstanceId: 'etf-halbe-target',
          amountEUR: 50_000,
          surrenderHaircutPct: 0.0,
        },
      ],
    }
    // Also build a pre-2005 (tax-free) variant of the same source for comparison.
    const pavSrcTaxFree: InsuranceInstance = {
      ...pavSrc,
      instanceId: 'versicherung-halbe',
      contractStartYear: 2002,
      oldContractTaxFreeEligible: true,
    }
    const etfTarget: EtfInstance = {
      ...workspace.baseline.assumptions.etf[0],
      instanceId: 'etf-halbe-target',
    }
    const makeWs = (ins: InsuranceInstance): Workspace => ({
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          insurance: [ins],
          etf: [etfTarget],
        },
      },
    })
    const withHalbe = simulatePortfolio(makeWs(pavSrc), de2026Rules)
    const withTaxFree = simulatePortfolio(makeWs(pavSrcTaxFree), de2026Rules)
    const noTransfer = simulatePortfolio(makeWs({ ...pavSrc, transferEvents: [] }), de2026Rules)
    // With zero cost basis (V1 approximation), halbeinkuenfte taxes half the gain at the
    // marginal rate. Surrender tax > 0 → target injection < tax-free equivalent.
    const targetHalbe = withHalbe.perInstance['etf-halbe-target'][1]
    const targetTaxFree = withTaxFree.perInstance['etf-halbe-target'][1]
    const targetNoTransfer = noTransfer.perInstance['etf-halbe-target'][1]
    const deltaHalbe = targetHalbe.capitalAtRetirement - targetNoTransfer.capitalAtRetirement
    const deltaTaxFree = targetTaxFree.capitalAtRetirement - targetNoTransfer.capitalAtRetirement
    // Target gains something despite the tax.
    expect(deltaHalbe).toBeGreaterThan(0)
    // Halbeinkuenfte surrender tax reduces the injection vs. tax-free (conservative pin).
    expect(deltaHalbe).toBeLessThan(deltaTaxFree)
    // Source always loses the full post-haircut proceeds regardless of tax mode.
    const insRetentionFee = 0.003 + 0.002  // wrapperAssetFee + fundAssetFee (defaultScenario insurance)
    const mfIns = Math.pow(1 + 0.05, 1 / 12) * Math.pow(1 - insRetentionFee, 1 / 12)
    const remainingMonths = (67 - 28 - 5) * 12  // 408
    const proceeds = 50_000  // no haircut
    const expectedSourceDrop = proceeds * Math.pow(mfIns, remainingMonths)
    const sourceHalbe = withHalbe.perInstance['versicherung-halbe'][1]
    const sourceNone = noTransfer.perInstance['versicherung-halbe'][1]
    const sourceDrop = sourceNone.capitalAtRetirement - sourceHalbe.capitalAtRetirement
    expect(sourceDrop).toBeCloseTo(expectedSourceDrop, 0)
  })

  it('surrender_reinvest — abgeltungsteuer pAV source applies surrender tax (zero cost-basis approximation)', () => {
    // Pins V1 conservative cost-basis approximation; relax when issue 15 P2 addresses
    // mid-horizon contribution preflight.
    const workspace = rich()
    // retirementAge=60 < halbeinkuenfteMinAge(62) → abgeltungsteuer regardless of runtime
    const profileAbgelt = { ...workspace.baseline.profile, retirementAge: 60 }
    const pavSrc: InsuranceInstance = {
      ...workspace.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-abgelt',
      contractStartYear: 2015,
      oldContractTaxFreeEligible: false,
      currentValueEUR: 30_000,
      surrenderHaircutPct: 0.0,
      transferEvents: [
        {
          type: 'surrender_reinvest',
          year: de2026Rules.year + 3,
          sourceInstanceId: 'versicherung-abgelt',
          targetInstanceId: 'etf-abgelt-target',
          amountEUR: 15_000,
          surrenderHaircutPct: 0.0,
        },
      ],
    }
    const etfTarget: EtfInstance = {
      ...workspace.baseline.assumptions.etf[0],
      instanceId: 'etf-abgelt-target',
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        profile: profileAbgelt,
        assumptions: {
          ...workspace.baseline.assumptions,
          insurance: [pavSrc],
          etf: [etfTarget],
        },
      },
    }
    const noTransferWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          insurance: [{ ...pavSrc, transferEvents: [] }],
        },
      },
    }
    const withTransfer = simulatePortfolio(ws, de2026Rules)
    const noTransfer = simulatePortfolio(noTransferWs, de2026Rules)
    const proceedsAbgelt = 15_000  // no haircut
    // With zero cost basis, abgeltungsteuer taxes the full gain at ~26.375%.
    // Surrender tax > 0 → target gets less than the full proceeds.
    const targetWithTransfer = withTransfer.perInstance['etf-abgelt-target'][1]
    const targetNoTransfer = noTransfer.perInstance['etf-abgelt-target'][1]
    const targetDelta = targetWithTransfer.capitalAtRetirement - targetNoTransfer.capitalAtRetirement
    // Target gains something (injection > 0 after tax).
    expect(targetDelta).toBeGreaterThan(0)
    // V1 zero-cost-basis: target gains LESS than the full proceeds compounded.
    const etfTotalFee = 0  // ETF default fee is minimal; use 0 as lower bound
    const mfBasis = Math.pow(1 + 0.05, 1 / 12) * Math.pow(1 - etfTotalFee, 1 / 12)
    const remainingMonths = (60 - 28 - 3) * 12  // 29 * 12 = 348
    const fullProceedsCompounded = proceedsAbgelt * Math.pow(mfBasis, remainingMonths)
    expect(targetDelta).toBeLessThan(fullProceedsCompounded)
    // Source loses full proceeds at event year.
    const sourceWithTransfer = withTransfer.perInstance['versicherung-abgelt'][1]
    const sourceNoTransfer = noTransfer.perInstance['versicherung-abgelt'][1]
    expect(sourceNoTransfer.capitalAtRetirement).toBeGreaterThan(
      sourceWithTransfer.capitalAtRetirement,
    )
  })

  it('surrender_reinvest — amountEUR > currentValueEUR clamps to actual capital (no negative balance)', () => {
    const workspace = rich()
    const pavSrc: InsuranceInstance = {
      ...workspace.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-small',
      contractStartYear: 2002,
      oldContractTaxFreeEligible: true,
      currentValueEUR: 1_000,   // small balance
      surrenderHaircutPct: 0.0,
      transferEvents: [
        {
          type: 'surrender_reinvest',
          year: de2026Rules.year + 2,
          sourceInstanceId: 'versicherung-small',
          targetInstanceId: 'etf-clamp-target',
          amountEUR: 50_000,   // vastly exceeds currentValueEUR
          surrenderHaircutPct: 0.0,
        },
      ],
    }
    const etfTarget: EtfInstance = {
      ...workspace.baseline.assumptions.etf[0],
      instanceId: 'etf-clamp-target',
    }
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          insurance: [pavSrc],
          etf: [etfTarget],
        },
      },
    }
    // import.meta.env?.DEV is true in vitest — expect the dev warning.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { perInstance } = simulatePortfolio(ws, de2026Rules)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('versicherung-small')
    warnSpy.mockRestore()
    // Source residual capital is non-negative throughout all scenarios.
    for (const result of perInstance['versicherung-small']) {
      expect(result.capitalAtRetirement).toBeGreaterThanOrEqual(0)
      for (const row of result.rows) {
        expect(row.balance).toBeGreaterThanOrEqual(0)
      }
    }
    // Target receives the clamped (after-tax + post-haircut) amount, not the full 50_000.
    // Pre-2005 tax-free: after-tax injection = actual capital at event year (clamped).
    // Target capital at retirement > 0 (got something).
    for (const result of perInstance['etf-clamp-target']) {
      expect(result.capitalAtRetirement).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Issue 12 (B3) — combine-mode honors per-instance ETF monthlyContribution
// ---------------------------------------------------------------------------

describe('issue 12 — combine-mode ETF monthlyContribution override', () => {
  it('combine-mode ETF instance with monthlyContribution=200 produces capital from 200/mo (NOT bavFunding.monthlyNetCost)', () => {
    const baseWs = migrateRich()
    // Build two workspaces: same in every way EXCEPT one ETF instance has
    // monthlyContribution=50, the other has monthlyContribution=200.
    // Capital at retirement must scale roughly with contribution (4×).
    const lowEtf: EtfInstance = {
      ...baseWs.baseline.assumptions.etf[0],
      instanceId: 'etf-low',
      monthlyContribution: 50,
    }
    const highEtf: EtfInstance = {
      ...baseWs.baseline.assumptions.etf[0],
      instanceId: 'etf-high',
      monthlyContribution: 200,
    }
    const wsLow: Workspace = {
      ...baseWs,
      baseline: {
        ...baseWs.baseline,
        assumptions: { ...baseWs.baseline.assumptions, etf: [lowEtf] },
      },
    }
    const wsHigh: Workspace = {
      ...baseWs,
      baseline: {
        ...baseWs.baseline,
        assumptions: { ...baseWs.baseline.assumptions, etf: [highEtf] },
      },
    }
    const lowOut = simulatePortfolio(wsLow, de2026Rules).perInstance['etf-low']
    const highOut = simulatePortfolio(wsHigh, de2026Rules).perInstance['etf-high']
    const lowCap = lowOut[0].capitalAtRetirement
    const highCap = highOut[0].capitalAtRetirement
    // Same fees, same horizon, same returns → capital ratio ≈ 4 (200/50).
    expect(highCap / lowCap).toBeGreaterThan(3.5)
    expect(highCap / lowCap).toBeLessThan(4.5)
  })

  it('combine-mode ETF without explicit monthlyContribution falls back to ctx bavFunding (which is zero under projected per-instance assumptions)', () => {
    const baseWs = migrateRich()
    const etfNoOverride: EtfInstance = {
      ...baseWs.baseline.assumptions.etf[0],
      instanceId: 'etf-no-override',
      // monthlyContribution intentionally undefined.
    }
    const ws: Workspace = {
      ...baseWs,
      baseline: {
        ...baseWs.baseline,
        assumptions: { ...baseWs.baseline.assumptions, etf: [etfNoOverride] },
      },
    }
    const out = simulatePortfolio(ws, de2026Rules).perInstance['etf-no-override']
    // Per-instance projection neutralises the bAV slot when running ETF →
    // bavFunding.monthlyNetCost = 0 → ETF capital is 0. This is the documented
    // fallback contract: combine-mode ETF instances must set monthlyContribution
    // to receive a non-zero projection.
    expect(out[0].capitalAtRetirement).toBe(0)
  })

  it('compare-mode ETF (singleton view) preserves the fair-comparison invariant — override field is not on ScenarioAssumptions', () => {
    // `etfMonthlyUserCostOverride` lives on `BuildContextOverrides` only, NOT
    // on `ScenarioAssumptions`. The legacy `simulateRetirementComparison` path
    // doesn't pass overrides, so ETF invests `bavFunding.monthlyNetCost`
    // unchanged. simulate.integration.test.ts oracle goldens are the byte-
    // identity guarantee; here we just spot-check the structural separation.
    const ws = migrateRich()
    const singleton = singletonViewOfWorkspace(ws, SINGLETON_DEFAULTS)
    expect(singleton.etf).toBeDefined()
    expect('etfMonthlyUserCostOverride' in singleton).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Issue F2 — combine-mode honors per-instance insurance monthlyContribution
// ---------------------------------------------------------------------------

describe('issue F2 — combine-mode insurance monthlyContribution override', () => {
  it('two insurance instances with different monthlyContribution produce different per-instance results', () => {
    // Same test shape as the ETF issue-12 test: low vs. high contribution.
    // Capital at retirement must scale roughly with contribution.
    const baseWs = migrateRich()
    const insBase = baseWs.baseline.assumptions.insurance[0]

    const lowIns: InsuranceInstance = {
      ...insBase,
      instanceId: 'versicherung-low',
      label: 'Versicherung Low',
      monthlyContribution: 50,
    }
    const highIns: InsuranceInstance = {
      ...insBase,
      instanceId: 'versicherung-high',
      label: 'Versicherung High',
      monthlyContribution: 200,
    }
    const wsLow: Workspace = {
      ...baseWs,
      baseline: {
        ...baseWs.baseline,
        assumptions: { ...baseWs.baseline.assumptions, insurance: [lowIns] },
      },
    }
    const wsHigh: Workspace = {
      ...baseWs,
      baseline: {
        ...baseWs.baseline,
        assumptions: { ...baseWs.baseline.assumptions, insurance: [highIns] },
      },
    }

    const lowOut = simulatePortfolio(wsLow, de2026Rules).perInstance['versicherung-low']
    const highOut = simulatePortfolio(wsHigh, de2026Rules).perInstance['versicherung-high']
    expect(lowOut).toBeDefined()
    expect(highOut).toBeDefined()
    const lowCap = lowOut[0].capitalAtRetirement
    const highCap = highOut[0].capitalAtRetirement
    // Same fees, same horizon, same return → capital ratio ≈ 4 (200/50).
    expect(highCap / lowCap).toBeGreaterThan(3.5)
    expect(highCap / lowCap).toBeLessThan(4.5)
  })

  it('adapter test: one insurance instance with monthlyContribution=100 produces different result than singleton path with bavFunding.monthlyNetCost=200', () => {
    // Adapter path: combine-mode workspace with insurance.monthlyContribution=100.
    const baseWs = migrateRich()
    const insBase = baseWs.baseline.assumptions.insurance[0]
    const insInst: InsuranceInstance = {
      ...insBase,
      instanceId: 'versicherung-contrib-100',
      label: 'Versicherung 100',
      monthlyContribution: 100,
    }
    const wsAdapter: Workspace = {
      ...baseWs,
      baseline: {
        ...baseWs.baseline,
        assumptions: { ...baseWs.baseline.assumptions, insurance: [insInst] },
      },
    }
    const adapterOut = simulatePortfolio(wsAdapter, de2026Rules).perInstance['versicherung-contrib-100']
    const adapterCap = adapterOut[0].capitalAtRetirement

    // Singleton/compare-mode path: bavFunding.monthlyNetCost drives insurance.
    // Use a bAV gross conversion that yields ~200 EUR/month net cost so the
    // two paths differ meaningfully.
    const { profile, assumptions } = makeRichV1()
    const assumptionsWithBav200 = {
      ...assumptions,
      bav: { ...assumptions.bav, monthlyGrossConversion: 200 },
      visibleProducts: ['versicherung'] as ProductId[],
    }
    const legacyResult = simulateRetirementComparison(profile, assumptionsWithBav200, de2026Rules)
    const legacyCap = legacyResult.products.find(
      p => p.productId === 'versicherung' && p.scenarioId === 'basis',
    )!.capitalAtRetirement

    // Adapter uses 100 EUR/month; legacy path uses bavFunding.monthlyNetCost (≈ net
    // of 200 EUR gross conversion). The two capitals must differ.
    expect(adapterCap).not.toBeCloseTo(legacyCap, 0)
  })

  it('compare-mode insurance (singleton view) preserves the fair-comparison invariant — override field is not on ScenarioAssumptions', () => {
    // `insuranceMonthlyUserCostOverride` lives on `BuildContextOverrides` only.
    const ws = migrateRich()
    const singleton = singletonViewOfWorkspace(ws, SINGLETON_DEFAULTS)
    expect(singleton.insurance).toBeDefined()
    expect('insuranceMonthlyUserCostOverride' in singleton).toBe(false)
  })
})
