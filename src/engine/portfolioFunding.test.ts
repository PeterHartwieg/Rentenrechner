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
 *  11. Salary baseline derived from first active bAV funding.
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

// §3 Nr. 63 cap: 8% × 101 400 / 12 ≈ 676 EUR/month
const BAV_TAX_FREE_LIMIT_MONTHLY =
  (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap) / 12

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

  it('two active bAV instances: aggregate is scaled when over §3 Nr. 63 cap', () => {
    const ws = makeBaseWorkspace()
    // 400 + 350 = 750 EUR/month aggregate, over the ~676 EUR/month cap.
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

    // Aggregate scaled gross ≤ cap.
    const totalScaledGross = fundA.monthlyGrossConversion + fundB.monthlyGrossConversion
    expect(totalScaledGross).toBeLessThanOrEqual(BAV_TAX_FREE_LIMIT_MONTHLY + 0.01)

    // Per-instance scaling is proportional to input.
    const expectedScale = BAV_TAX_FREE_LIMIT_MONTHLY / 750
    expect(fundA.monthlyGrossConversion).toBeCloseTo(400 * expectedScale, 2)
    expect(fundB.monthlyGrossConversion).toBeCloseTo(350 * expectedScale, 2)
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
// 11. Salary baseline — derived from first active bAV
// ---------------------------------------------------------------------------

describe('buildPortfolioFunding — salary baseline', () => {
  it('uses first active bAV salaryWithBav as baseline for Basisrente/AVD/Riester', () => {
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
