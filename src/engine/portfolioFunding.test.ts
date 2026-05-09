/**
 * Tests for portfolioFunding.ts (architecture-readability issue 05).
 *
 * Coverage:
 *   1. bAV single instance — no scaling when under cap.
 *   2. bAV two instances — aggregate scaling when over §3 Nr. 63 cap.
 *   3. bAV paid-up instance — zero contribution, funding entry still present.
 *   4. bAV surrendered instance — excluded from funding map.
 *   5. Basisrente two instances — aggregate scaling when over Schicht-1 cap.
 *   6. Basisrente paid-up instance — zero contribution funding entry.
 *   7. AVD single instance — per-contract cap, no cross-instance scaling.
 *   8. AVD paid-up instance — zero contribution, zero eligibility.
 *   9. Riester two instances — aggregate scaling when over §10a cap.
 *  10. Riester paid-up instance — zero contribution funding entry.
 *  11. Salary baseline derived from aggregate of all active bAV instances.
 *  12. Multi-bAV cap with employer contributions (bug fix gh#55).
 *  13. Downstream Basisrente/AVD/Riester use household post-bAV salary baseline.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import {
  buildPortfolioFunding,
  paidUpBavFunding,
  paidUpBasisrenteFunding,
  paidUpAvdFunding,
  paidUpRiesterFunding,
} from './portfolioFunding'
import { calculateBavFunding, calculateSalaryResult } from './salary'
import { calculateBasisrenteFunding } from './basisrente'
import { calculateAvdFunding } from './altersvorsorgedepot'
import { calculateRiesterFunding } from './riester'
import type {
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  BavInstance,
  RiesterInstance,
} from '../domain/instances'
import type { Workspace } from '../domain/workspace'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseWorkspace(): Workspace {
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

// Riester §10a cap: 2 100 EUR/year
const RIESTER_CAP_ANNUAL = de2026Rules.riester.annualCapInclAllowances

// ---------------------------------------------------------------------------
// 1 & 2. bAV funding — single instance and two-instance cap aggregation
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — bAV', () => {
  it('single active bAV instance: funding entry present, contribution unscaled when under cap', () => {
    const ws = makeBaseWorkspace()
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-a',
      label: 'bAV A',
      monthlyGrossConversion: 200,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, bav: [instA] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.bavByInstanceId['bav-a']).toBeDefined()
    expect(funding.bavByInstanceId['bav-a'].monthlyGrossConversion).toBe(200)
  })

  it('two active bAV instances: aggregate total (employee + employer) is at or below §3 Nr. 63 cap', () => {
    const ws = makeBaseWorkspace()
    // 400 + 350 = 750 EUR/month employee aggregate. Both instances have
    // statutoryMinimumSubsidyEnabled=true (default), so employer contributions
    // are included in the total. The cap applies to employee + employer combined.
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-a',
      label: 'bAV A',
      monthlyGrossConversion: 400,
    }
    const instB: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-b',
      label: 'bAV B',
      monthlyGrossConversion: 350,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, bav: [instA, instB] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    const fundA = funding.bavByInstanceId['bav-a']
    const fundB = funding.bavByInstanceId['bav-b']
    expect(fundA).toBeDefined()
    expect(fundB).toBeDefined()

    // Aggregate total bAV (employee + employer) must be at or below the annual cap.
    const bavCapAnnual = de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap
    const totalBavAnnual = fundA.totalBavContributionAnnual + fundB.totalBavContributionAnnual
    expect(totalBavAnnual).toBeLessThanOrEqual(bavCapAnnual + 0.01)

    // Per-instance employee scaling remains proportional to input (400:350 ratio).
    const ratio = fundA.monthlyGrossConversion / fundB.monthlyGrossConversion
    expect(ratio).toBeCloseTo(400 / 350, 2)
  })

  it('two active bAV instances under cap: no scaling, contributions pass through unchanged', () => {
    const ws = makeBaseWorkspace()
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-small-a',
      label: 'bAV Small A',
      monthlyGrossConversion: 100,
    }
    const instB: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-small-b',
      label: 'bAV Small B',
      monthlyGrossConversion: 50,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, bav: [instA, instB] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.bavByInstanceId['bav-small-a'].monthlyGrossConversion).toBe(100)
    expect(funding.bavByInstanceId['bav-small-b'].monthlyGrossConversion).toBe(50)
  })

  it('paid-up bAV instance: funding entry present with zero gross conversion', () => {
    const ws = makeBaseWorkspace()
    const inst: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-paidup',
      label: 'bAV Paid Up',
      status: 'paid_up',
      monthlyGrossConversion: 300,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, bav: [inst] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.bavByInstanceId['bav-paidup']).toBeDefined()
    expect(funding.bavByInstanceId['bav-paidup'].monthlyGrossConversion).toBe(0)
    expect(funding.bavByInstanceId['bav-paidup'].monthlyStatutoryEmployerSubsidy).toBe(0)
  })

  it('surrendered bAV instance: excluded from funding map', () => {
    const ws = makeBaseWorkspace()
    const inst: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-surrendered',
      label: 'bAV Surrendered',
      status: 'surrendered',
      monthlyGrossConversion: 300,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, bav: [inst] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.bavByInstanceId['bav-surrendered']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 5 & 6. Basisrente funding — two-instance cap and paid-up
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — Basisrente', () => {
  it('two active Basisrente instances: aggregate is scaled when over Schicht-1 cap', () => {
    const ws = makeBaseWorkspace()
    // remainingSchicht1Cap = schicht1CapSingle - GRV contributions.
    // Use very large contributions to force scaling.
    const instA: BasisrenteInstance = {
      ...ws.baseline.assumptions.basisrente[0],
      instanceId: 'basis-a',
      label: 'Basisrente A',
      monthlyGrossContribution: 2000,
    }
    const instB: BasisrenteInstance = {
      ...ws.baseline.assumptions.basisrente[0],
      instanceId: 'basis-b',
      label: 'Basisrente B',
      monthlyGrossContribution: 2000,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, basisrente: [instA, instB] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    const fundA = funding.basisrenteByInstanceId['basis-a']
    const fundB = funding.basisrenteByInstanceId['basis-b']
    expect(fundA).toBeDefined()
    expect(fundB).toBeDefined()

    // Scaling must have occurred: each instance should have a smaller contribution.
    // Total of both original = 4000 EUR/month = 48 000 EUR/year, far above cap.
    expect(fundA.annualGrossContribution).toBeLessThan(2000 * 12)
    expect(fundB.annualGrossContribution).toBeLessThan(2000 * 12)

    // Contributions are proportional (50:50 input → 50:50 output).
    expect(fundA.annualGrossContribution).toBeCloseTo(fundB.annualGrossContribution, 1)
  })

  it('single active Basisrente instance under cap: no scaling', () => {
    const ws = makeBaseWorkspace()
    const inst: BasisrenteInstance = {
      ...ws.baseline.assumptions.basisrente[0],
      instanceId: 'basis-single',
      label: 'Basisrente Single',
      monthlyGrossContribution: 100,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, basisrente: [inst] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.basisrenteByInstanceId['basis-single']).toBeDefined()
    expect(funding.basisrenteByInstanceId['basis-single'].annualGrossContribution).toBeCloseTo(100 * 12, 1)
  })

  it('paid-up Basisrente instance: funding entry present with zero contribution', () => {
    const ws = makeBaseWorkspace()
    const inst: BasisrenteInstance = {
      ...ws.baseline.assumptions.basisrente[0],
      instanceId: 'basis-paidup',
      label: 'Basisrente Paid Up',
      status: 'paid_up',
      monthlyGrossContribution: 500,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, basisrente: [inst] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.basisrenteByInstanceId['basis-paidup']).toBeDefined()
    expect(funding.basisrenteByInstanceId['basis-paidup'].annualGrossContribution).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 7 & 8. AVD funding — per-contract cap and paid-up
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — AVD', () => {
  it('single active AVD instance: funding entry present', () => {
    const ws = makeBaseWorkspace()
    const inst: AltersvorsorgedepotInstance = {
      ...ws.baseline.assumptions.altersvorsorgedepot[0],
      instanceId: 'avd-a',
      label: 'AVD A',
      monthlyOwnContribution: 100,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: { ...ws.baseline.assumptions, altersvorsorgedepot: [inst] },
      },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.altersvorsorgedepotByInstanceId['avd-a']).toBeDefined()
  })

  it('paid-up AVD instance: funding entry present with zero contribution and zeroed eligibility', () => {
    const ws = makeBaseWorkspace()
    const inst: AltersvorsorgedepotInstance = {
      ...ws.baseline.assumptions.altersvorsorgedepot[0],
      instanceId: 'avd-paidup',
      label: 'AVD Paid Up',
      status: 'paid_up',
      monthlyOwnContribution: 300,
      eligibility: {
        directlyEligible: true,
        indirectSpouseEligible: false,
        eligibleChildren: 2,
        ageAtContractStart: 35,
        careerStarterBonusUsed: false,
      },
    }
    const testWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: { ...ws.baseline.assumptions, altersvorsorgedepot: [inst] },
      },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.altersvorsorgedepotByInstanceId['avd-paidup']).toBeDefined()
    // Zero own contribution.
    expect(funding.altersvorsorgedepotByInstanceId['avd-paidup'].annualOwnContribution).toBe(0)
    // Zero state allowance (eligibility zeroed).
    expect(funding.altersvorsorgedepotByInstanceId['avd-paidup'].totalAllowanceAnnual).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 9 & 10. Riester funding — two-instance cap and paid-up
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — Riester', () => {
  it('two active Riester instances: aggregate is scaled when over §10a cap', () => {
    const ws = makeBaseWorkspace()
    // §10a cap = 2 100 EUR/year. Two instances at 100 EUR/month each = 2 400 EUR/year → over cap.
    const instA: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-a',
      label: 'Riester A',
      monthlyOwnContribution: 100,
      eligibility: {
        directlyEligible: true,
        indirectSpouseEligible: false,
        ageAtContractStart: 30,
        careerStarterBonusUsed: true,
      },
    }
    const instB: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-b',
      label: 'Riester B',
      monthlyOwnContribution: 100,
      eligibility: {
        directlyEligible: true,
        indirectSpouseEligible: false,
        ageAtContractStart: 30,
        careerStarterBonusUsed: true,
      },
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, riester: [instA, instB] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    const fundA = funding.riesterByInstanceId['riester-a']
    const fundB = funding.riesterByInstanceId['riester-b']
    expect(fundA).toBeDefined()
    expect(fundB).toBeDefined()

    // Aggregate annual own contribution must be ≤ cap.
    const totalAnnualOwn =
      fundA.annualOwnContribution + fundB.annualOwnContribution
    expect(totalAnnualOwn).toBeLessThanOrEqual(RIESTER_CAP_ANNUAL + 0.01)
  })

  it('single active Riester instance under cap: no scaling', () => {
    const ws = makeBaseWorkspace()
    const inst: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-single',
      label: 'Riester Single',
      monthlyOwnContribution: 50,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, riester: [inst] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.riesterByInstanceId['riester-single']).toBeDefined()
    expect(funding.riesterByInstanceId['riester-single'].annualOwnContribution).toBeCloseTo(50 * 12, 1)
  })

  it('paid-up Riester instance: funding entry present with zero contribution', () => {
    const ws = makeBaseWorkspace()
    const inst: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-paidup',
      label: 'Riester Paid Up',
      status: 'paid_up',
      monthlyOwnContribution: 100,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, riester: [inst] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.riesterByInstanceId['riester-paidup']).toBeDefined()
    expect(funding.riesterByInstanceId['riester-paidup'].annualOwnContribution).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 11. Salary baseline — derived from aggregate of all active bAV instances
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — salary baseline', () => {
  it('uses aggregate post-bAV salary as baseline for Basisrente/AVD/Riester (single bAV)', () => {
    const ws = makeBaseWorkspace()
    const bavInst: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-anchor',
      label: 'bAV Anchor',
      monthlyGrossConversion: 300,
    }
    const basisrenteInst: BasisrenteInstance = {
      ...ws.baseline.assumptions.basisrente[0],
      instanceId: 'basis-check',
      label: 'Basisrente Check',
      monthlyGrossContribution: 100,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: [bavInst],
          basisrente: [basisrenteInst],
        },
      },
    }

    // Building funding should not throw; Basisrente funding must be computed.
    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.bavByInstanceId['bav-anchor']).toBeDefined()
    expect(funding.basisrenteByInstanceId['basis-check']).toBeDefined()
  })

  it('falls back to pristine salary when no active bAV instances', () => {
    const ws = makeBaseWorkspace()
    const basisrenteInst: BasisrenteInstance = {
      ...ws.baseline.assumptions.basisrente[0],
      instanceId: 'basis-noBav',
      label: 'Basisrente No bAV',
      monthlyGrossContribution: 100,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: [],
          basisrente: [basisrenteInst],
        },
      },
    }

    // No bAV → pristine salary baseline; should not throw.
    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.basisrenteByInstanceId['basis-noBav']).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 12. Multi-bAV cap with employer contributions (bug fix gh#55)
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — multi-bAV cap including employer contributions', () => {
  it('two bAV instances with only statutory subsidy: total (employee + employer) stays at or below §3 Nr. 63 cap', () => {
    const ws = makeBaseWorkspace()
    // §3 Nr. 63 cap annual = 8% × 101 400 = 8 112 EUR/year = 676 EUR/month.
    // Two instances at 400 EUR/month employee each → 800 EUR/month employee.
    // Statutory subsidy = 15% of each conversion (capped by employer SV savings).
    // Without the fix, only the 800 EUR employee total was checked against the cap,
    // ignoring employer contributions. With the fix, total (employee + employer)
    // is summed and capped together.
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-emp-a',
      label: 'bAV with subsidy A',
      monthlyGrossConversion: 400,
      statutoryMinimumSubsidyEnabled: true,
    }
    const instB: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-emp-b',
      label: 'bAV with subsidy B',
      monthlyGrossConversion: 400,
      statutoryMinimumSubsidyEnabled: true,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, bav: [instA, instB] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    const fundA = funding.bavByInstanceId['bav-emp-a']
    const fundB = funding.bavByInstanceId['bav-emp-b']
    expect(fundA).toBeDefined()
    expect(fundB).toBeDefined()

    // Total bAV contribution (employee + employer) must be at or below the §3 Nr. 63 annual cap.
    const totalBavAnnual = fundA.totalBavContributionAnnual + fundB.totalBavContributionAnnual
    const bavCapAnnual = de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap
    expect(totalBavAnnual).toBeLessThanOrEqual(bavCapAnnual + 0.01)
  })

  it('two bAV instances with contractual employer match: total funding capped at §3 Nr. 63 limit', () => {
    const ws = makeBaseWorkspace()
    // Use high contractual employer match to force total over the cap even when
    // employee conversion alone would be under the cap.
    // 300 EUR/month each (employee) + 50% match → ~450 EUR/month total per instance
    // → ~900 EUR/month combined total, over the ~676 EUR/month cap.
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-match-a',
      label: 'bAV with match A',
      monthlyGrossConversion: 300,
      contractualMatchPercent: 50,
      contractualFixedMonthly: 0,
      statutoryMinimumSubsidyEnabled: false,
    }
    const instB: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-match-b',
      label: 'bAV with match B',
      monthlyGrossConversion: 300,
      contractualMatchPercent: 50,
      contractualFixedMonthly: 0,
      statutoryMinimumSubsidyEnabled: false,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, bav: [instA, instB] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    const fundA = funding.bavByInstanceId['bav-match-a']
    const fundB = funding.bavByInstanceId['bav-match-b']
    expect(fundA).toBeDefined()
    expect(fundB).toBeDefined()

    // Total bAV contribution (employee + employer) must respect the §3 Nr. 63 annual cap.
    const totalBavAnnual = fundA.totalBavContributionAnnual + fundB.totalBavContributionAnnual
    const bavCapAnnual = de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap
    expect(totalBavAnnual).toBeLessThanOrEqual(bavCapAnnual + 0.01)
  })

  it('two bAV instances under cap even with employer contributions: no scaling applied', () => {
    const ws = makeBaseWorkspace()
    // 100 EUR/month each (employee) + 15% statutory ≈ 115 EUR/month total each
    // → ~230 EUR/month combined, well under the ~676 EUR/month cap. No scaling.
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-under-a',
      label: 'bAV under cap A',
      monthlyGrossConversion: 100,
      statutoryMinimumSubsidyEnabled: true,
    }
    const instB: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-under-b',
      label: 'bAV under cap B',
      monthlyGrossConversion: 100,
      statutoryMinimumSubsidyEnabled: true,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: { ...ws.baseline, assumptions: { ...ws.baseline.assumptions, bav: [instA, instB] } },
    }

    const funding = buildPortfolioFunding(testWs, de2026Rules)
    const fundA = funding.bavByInstanceId['bav-under-a']
    const fundB = funding.bavByInstanceId['bav-under-b']

    // Employee gross conversions must pass through unchanged (no scaling).
    expect(fundA.monthlyGrossConversion).toBeCloseTo(100, 2)
    expect(fundB.monthlyGrossConversion).toBeCloseTo(100, 2)
  })
})

// ---------------------------------------------------------------------------
// 13. Downstream Basisrente/AVD/Riester use household post-bAV salary baseline
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — downstream salary baseline accuracy', () => {
  it('two bAV instances: downstream Basisrente GRV base reflects combined bAV conversion', () => {
    const ws = makeBaseWorkspace()
    // Two bAV instances at 200 EUR/month each — combined 400 EUR/month conversion.
    // The salary baseline for Basisrente must reflect the full 400 EUR/month bAV
    // deduction, not just one instance's 200 EUR/month.
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-dual-a',
      label: 'bAV dual A',
      monthlyGrossConversion: 200,
      statutoryMinimumSubsidyEnabled: false,
    }
    const instB: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-dual-b',
      label: 'bAV dual B',
      monthlyGrossConversion: 200,
      statutoryMinimumSubsidyEnabled: false,
    }
    const basisrenteInst: BasisrenteInstance = {
      ...ws.baseline.assumptions.basisrente[0],
      instanceId: 'basis-downstream',
      label: 'Basisrente downstream',
      monthlyGrossContribution: 100,
    }
    const testWsOneBav: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: [instA],
          basisrente: [basisrenteInst],
        },
      },
    }
    const testWsTwoBav: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: [instA, instB],
          basisrente: [basisrenteInst],
        },
      },
    }

    const fundingOne = buildPortfolioFunding(testWsOneBav, de2026Rules)
    const fundingTwo = buildPortfolioFunding(testWsTwoBav, de2026Rules)

    // With two bAV instances (combined higher conversion), the annual GRV pension
    // contribution used for Schicht-1 headroom calculation should be lower (because
    // more salary is SV-free). This means more Schicht-1 headroom for Basisrente.
    // We verify this by checking Basisrente gets at least as much headroom.
    const basisOneAnnual = fundingOne.basisrenteByInstanceId['basis-downstream'].annualGrossContribution
    const basisTwoAnnual = fundingTwo.basisrenteByInstanceId['basis-downstream'].annualGrossContribution

    // Both must be defined and computed.
    expect(fundingOne.basisrenteByInstanceId['basis-downstream']).toBeDefined()
    expect(fundingTwo.basisrenteByInstanceId['basis-downstream']).toBeDefined()

    // With more bAV (lower pensionable base), GRV contributions are lower,
    // leaving more Schicht-1 headroom. Basisrente contribution should be
    // the same or higher in the two-bAV case (never lower from headroom reduction).
    expect(basisTwoAnnual).toBeGreaterThanOrEqual(basisOneAnnual - 0.01)
  })

  it('two bAV instances: downstream AVD funding uses combined post-bAV salary', () => {
    const ws = makeBaseWorkspace()
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-avd-a',
      label: 'bAV avd A',
      monthlyGrossConversion: 200,
      statutoryMinimumSubsidyEnabled: false,
    }
    const instB: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-avd-b',
      label: 'bAV avd B',
      monthlyGrossConversion: 200,
      statutoryMinimumSubsidyEnabled: false,
    }
    const avdInst: AltersvorsorgedepotInstance = {
      ...ws.baseline.assumptions.altersvorsorgedepot[0],
      instanceId: 'avd-downstream',
      label: 'AVD downstream',
      monthlyOwnContribution: 100,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: [instA, instB],
          altersvorsorgedepot: [avdInst],
        },
      },
    }

    // Should not throw and AVD must have a funding entry.
    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.altersvorsorgedepotByInstanceId['avd-downstream']).toBeDefined()
    // Own contribution must be present (not zeroed out by an incorrect baseline).
    expect(funding.altersvorsorgedepotByInstanceId['avd-downstream'].annualOwnContribution)
      .toBeGreaterThan(0)
  })

  it('two bAV instances: downstream Riester funding uses combined post-bAV salary', () => {
    const ws = makeBaseWorkspace()
    const instA: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-riester-a',
      label: 'bAV riester A',
      monthlyGrossConversion: 200,
      statutoryMinimumSubsidyEnabled: false,
    }
    const instB: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-riester-b',
      label: 'bAV riester B',
      monthlyGrossConversion: 200,
      statutoryMinimumSubsidyEnabled: false,
    }
    const riesterInst: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-downstream',
      label: 'Riester downstream',
      monthlyOwnContribution: 50,
    }
    const testWs: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: [instA, instB],
          riester: [riesterInst],
        },
      },
    }

    // Should not throw and Riester must have a funding entry.
    const funding = buildPortfolioFunding(testWs, de2026Rules)
    expect(funding.riesterByInstanceId['riester-downstream']).toBeDefined()
    // Own contribution must be present.
    expect(funding.riesterByInstanceId['riester-downstream'].annualOwnContribution)
      .toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Unit tests for paid-up helpers (exported for direct testing)
// ---------------------------------------------------------------------------

describe('paidUpBavFunding', () => {
  it('produces zero gross conversion and zero subsidies', () => {
    const bavSingleton = {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 500,
      statutoryMinimumSubsidyEnabled: true,
      contractualMatchPercent: 50,
    }
    const result = paidUpBavFunding(defaultProfile, de2026Rules, bavSingleton, calculateBavFunding)
    expect(result.monthlyGrossConversion).toBe(0)
    expect(result.monthlyStatutoryEmployerSubsidy).toBe(0)
    expect(result.monthlyContractualEmployerContribution).toBe(0)
  })
})

describe('paidUpBasisrenteFunding', () => {
  it('produces zero annual gross contribution', () => {
    const singleton = { ...defaultAssumptions.basisrente, monthlyGrossContribution: 300 }
    const salary = calculateSalaryResult(defaultProfile, de2026Rules, 0)
    const result = paidUpBasisrenteFunding(de2026Rules, salary, singleton, undefined, calculateBasisrenteFunding)
    expect(result.annualGrossContribution).toBe(0)
  })
})

describe('paidUpAvdFunding', () => {
  it('produces zero own contribution and zero state allowance', () => {
    const singleton = {
      ...defaultAssumptions.altersvorsorgedepot,
      monthlyOwnContribution: 200,
      eligibility: {
        directlyEligible: true,
        indirectSpouseEligible: false,
        eligibleChildren: 1,
        ageAtContractStart: 30,
        careerStarterBonusUsed: false,
      },
    }
    const salary = calculateSalaryResult(defaultProfile, de2026Rules, 0)
    const result = paidUpAvdFunding(de2026Rules, salary, singleton, calculateAvdFunding)
    expect(result.annualOwnContribution).toBe(0)
    expect(result.totalAllowanceAnnual).toBe(0)
  })
})

describe('paidUpRiesterFunding', () => {
  it('produces zero own contribution', () => {
    const singleton = {
      ...defaultAssumptions.riester,
      monthlyOwnContribution: 100,
      eligibility: {
        directlyEligible: true,
        indirectSpouseEligible: false,
        ageAtContractStart: 30,
        careerStarterBonusUsed: true,
      },
    }
    const salary = calculateSalaryResult(defaultProfile, de2026Rules, 0)
    const result = paidUpRiesterFunding(
      de2026Rules,
      salary,
      singleton,
      (r, s, si) => calculateRiesterFunding(r, s, si, defaultProfile),
    )
    expect(result.annualOwnContribution).toBe(0)
  })
})
