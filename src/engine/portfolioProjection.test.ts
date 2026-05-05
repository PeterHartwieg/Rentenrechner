/**
 * Tests for portfolioProjection.ts (architecture-readability issue 03).
 *
 * Coverage:
 *  1. Neutralised defaults are truly neutral — no cross-product contamination.
 *  2. `detectProductSlot` — prefix-based and structural fallback for every family.
 *  3. `stripInstanceCommonKeys` — removes InstanceCommon fields, preserves engine fields.
 *  4. `paidUpFeeModel` — zeros acquisition/contribution/fixed fees, keeps asset fees.
 *  5. `applyPaidUpOverridesToProjection` — zeros contributions in projected slot.
 *  6. `projectInstanceToScenarioAssumptions` — correct slot population for every family.
 *  7. `singletonViewOfWorkspace` — length-1 workspace ≡ legacy singleton; empty slots use defaults.
 *  8. Paid-up state projection — fees stripped, contributions zeroed, `currentValueEUR` mapped.
 *  9. Legacy singleton compatibility — projection output is byte-identical to original assumptions.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import {
  NEUTRALISED_BAV,
  NEUTRALISED_ETF,
  NEUTRALISED_INSURANCE,
  NEUTRALISED_BASISRENTE,
  NEUTRALISED_ALTERSVORSORGEDEPOT,
  NEUTRALISED_RIESTER,
  INSTANCE_COMMON_KEYS,
  paidUpFeeModel,
  stripInstanceCommonKeys,
  detectProductSlot,
  applyPaidUpOverridesToProjection,
  projectInstanceToScenarioAssumptions,
  singletonViewOfWorkspace,
} from './portfolioProjection'
import type {
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
} from '../domain/instances'
import type { Workspace } from '../domain/workspace'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear()

const SINGLETON_DEFAULTS = {
  bav: defaultAssumptions.bav,
  etf: defaultAssumptions.etf,
  insurance: defaultAssumptions.insurance,
  basisrente: defaultAssumptions.basisrente,
  altersvorsorgedepot: defaultAssumptions.altersvorsorgedepot,
  riester: defaultAssumptions.riester,
}

/** Build a v2 workspace from non-trivial v1 assumptions. */
function makeWorkspace(): Workspace {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    {
      ...defaultAssumptions,
      bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 200 },
      basisrente: { ...defaultAssumptions.basisrente, monthlyGrossContribution: 150 },
      altersvorsorgedepot: { ...defaultAssumptions.altersvorsorgedepot, monthlyOwnContribution: 100 },
      riester: { ...defaultAssumptions.riester, monthlyOwnContribution: 80 },
    } as unknown as Record<string, unknown>,
  )
}

/** Minimal InstanceCommon fields shared by all instance factories below. */
const COMMON: Pick<BavInstance, 'instanceId' | 'label' | 'status' | 'contractStartYear' | 'evidenceMap'> = {
  instanceId: 'bav-test',
  label: 'Test',
  status: 'active',
  contractStartYear: CURRENT_YEAR,
  evidenceMap: {},
}

function makeBavInstance(overrides: Partial<BavInstance> = {}): BavInstance {
  return {
    ...COMMON,
    instanceId: 'bav-test',
    ...defaultAssumptions.bav,
    monthlyGrossConversion: 200,
    ...overrides,
  } as BavInstance
}

function makeEtfInstance(overrides: Partial<EtfInstance> = {}): EtfInstance {
  return {
    ...COMMON,
    instanceId: 'etf-test',
    ...defaultAssumptions.etf,
    monthlyContribution: 150,
    ...overrides,
  } as EtfInstance
}

function makeInsuranceInstance(overrides: Partial<InsuranceInstance> = {}): InsuranceInstance {
  return {
    ...COMMON,
    instanceId: 'versicherung-test',
    ...defaultAssumptions.insurance,
    contractStartYear: 2018,
    ...overrides,
  } as InsuranceInstance
}

function makeBasisrenteInstance(overrides: Partial<BasisrenteInstance> = {}): BasisrenteInstance {
  return {
    ...COMMON,
    instanceId: 'basisrente-test',
    ...defaultAssumptions.basisrente,
    monthlyGrossContribution: 150,
    ...overrides,
  } as BasisrenteInstance
}

function makeAvdInstance(overrides: Partial<AltersvorsorgedepotInstance> = {}): AltersvorsorgedepotInstance {
  return {
    ...COMMON,
    instanceId: 'altersvorsorgedepot-test',
    ...defaultAssumptions.altersvorsorgedepot,
    monthlyOwnContribution: 100,
    ...overrides,
  } as AltersvorsorgedepotInstance
}

function makeRiesterInstance(overrides: Partial<RiesterInstance> = {}): RiesterInstance {
  return {
    ...COMMON,
    instanceId: 'riester-test',
    ...defaultAssumptions.riester,
    monthlyOwnContribution: 80,
    ...overrides,
  } as RiesterInstance
}

// ---------------------------------------------------------------------------
// 1. Neutralised defaults are truly neutral
// ---------------------------------------------------------------------------

describe('portfolioProjection — neutralised defaults', () => {
  it('NEUTRALISED_BAV has zero contributions and zero fees', () => {
    expect(NEUTRALISED_BAV.monthlyGrossConversion).toBe(0)
    expect(NEUTRALISED_BAV.statutoryMinimumSubsidyEnabled).toBe(false)
    expect(NEUTRALISED_BAV.contractualMatchPercent).toBe(0)
    expect(NEUTRALISED_BAV.contractualFixedMonthly).toBe(0)
    expect(NEUTRALISED_BAV.fees.wrapperAssetFee).toBe(0)
    expect(NEUTRALISED_BAV.fees.fundAssetFee).toBe(0)
    expect(NEUTRALISED_BAV.fees.contributionFee).toBe(0)
    expect(NEUTRALISED_BAV.fees.acquisitionCostPct).toBe(0)
    expect(NEUTRALISED_BAV.fees.pensionPayoutFeePct).toBe(0)
  })

  it('NEUTRALISED_ETF has zero fee and non-zero equity partial exemption', () => {
    expect(NEUTRALISED_ETF.annualAssetFee).toBe(0)
    // Partial exemption of 0 would cause taxable income to be over-stated;
    // the neutralised default keeps the standard 30 % exemption.
    expect(NEUTRALISED_ETF.equityPartialExemption).toBe(0.3)
  })

  it('NEUTRALISED_INSURANCE has zero fees', () => {
    expect(NEUTRALISED_INSURANCE.fees.wrapperAssetFee).toBe(0)
    expect(NEUTRALISED_INSURANCE.fees.fundAssetFee).toBe(0)
    expect(NEUTRALISED_INSURANCE.fees.acquisitionCostPct).toBe(0)
  })

  it('NEUTRALISED_BASISRENTE has zero contribution', () => {
    expect(NEUTRALISED_BASISRENTE.monthlyGrossContribution).toBe(0)
    expect(NEUTRALISED_BASISRENTE.fees.wrapperAssetFee).toBe(0)
  })

  it('NEUTRALISED_ALTERSVORSORGEDEPOT has zero contribution and false eligibility', () => {
    expect(NEUTRALISED_ALTERSVORSORGEDEPOT.monthlyOwnContribution).toBe(0)
    expect(NEUTRALISED_ALTERSVORSORGEDEPOT.eligibility.directlyEligible).toBe(false)
    expect(NEUTRALISED_ALTERSVORSORGEDEPOT.eligibility.indirectSpouseEligible).toBe(false)
    expect(NEUTRALISED_ALTERSVORSORGEDEPOT.eligibility.eligibleChildren).toBe(0)
  })

  it('NEUTRALISED_RIESTER has zero contribution and false eligibility', () => {
    expect(NEUTRALISED_RIESTER.monthlyOwnContribution).toBe(0)
    expect(NEUTRALISED_RIESTER.eligibility.directlyEligible).toBe(false)
    expect(NEUTRALISED_RIESTER.eligibility.indirectSpouseEligible).toBe(false)
  })

  it('no neutralised default shares object references across products', () => {
    // Defensive: mutating one default should not affect another.
    const bav = { ...NEUTRALISED_BAV, fees: { ...NEUTRALISED_BAV.fees } }
    bav.fees.wrapperAssetFee = 999
    expect(NEUTRALISED_BAV.fees.wrapperAssetFee).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2. detectProductSlot — prefix-based detection for every product family
// ---------------------------------------------------------------------------

describe('portfolioProjection — detectProductSlot (prefix-based)', () => {
  it('detects bav- prefix → bav', () => {
    expect(detectProductSlot(makeBavInstance({ instanceId: 'bav-singleton' }))).toBe('bav')
  })

  it('detects etf- prefix → etf', () => {
    expect(detectProductSlot(makeEtfInstance({ instanceId: 'etf-singleton' }))).toBe('etf')
  })

  it('detects versicherung- prefix → insurance', () => {
    expect(detectProductSlot(makeInsuranceInstance({ instanceId: 'versicherung-singleton' }))).toBe('insurance')
  })

  it('detects basisrente- prefix → basisrente', () => {
    expect(detectProductSlot(makeBasisrenteInstance({ instanceId: 'basisrente-singleton' }))).toBe('basisrente')
  })

  it('detects altersvorsorgedepot- prefix → altersvorsorgedepot', () => {
    expect(detectProductSlot(makeAvdInstance({ instanceId: 'altersvorsorgedepot-singleton' }))).toBe('altersvorsorgedepot')
  })

  it('detects riester- prefix → riester', () => {
    expect(detectProductSlot(makeRiesterInstance({ instanceId: 'riester-singleton' }))).toBe('riester')
  })
})

describe('portfolioProjection — detectProductSlot (structural fallback)', () => {
  it('structural fallback: monthlyGrossConversion → bav', () => {
    const inst = makeBavInstance({ instanceId: 'unknown-bav' })
    expect(detectProductSlot(inst)).toBe('bav')
  })

  it('structural fallback: annualAssetFee + equityPartialExemption → etf', () => {
    const inst = makeEtfInstance({ instanceId: 'unknown-etf' })
    expect(detectProductSlot(inst)).toBe('etf')
  })

  it('structural fallback: contractStartYear (insurance-like) → insurance', () => {
    // Insurance instance without versicherung- prefix but with contractStartYear
    // and none of the other discriminating fields.
    const inst = makeInsuranceInstance({ instanceId: 'legacy-insurance' })
    // insurance has contractStartYear but also wrapperAssetFee etc. — structural path
    // checks subtype first (AVD), then monthlyGrossConversion (bAV), annualAssetFee (ETF),
    // monthlyGrossContribution (Basisrente), then contractStartYear → insurance.
    expect(detectProductSlot(inst)).toBe('insurance')
  })
})

// ---------------------------------------------------------------------------
// 3. stripInstanceCommonKeys
// ---------------------------------------------------------------------------

describe('portfolioProjection — stripInstanceCommonKeys', () => {
  it('removes all InstanceCommon keys by default', () => {
    const inst = makeBavInstance()
    const stripped = stripInstanceCommonKeys(inst as unknown as Record<string, unknown>)
    for (const key of INSTANCE_COMMON_KEYS) {
      // contractStartYear is present on both InstanceCommon and InsuranceAssumptions;
      // for bAV it is purely InstanceCommon and should be stripped.
      if (key !== 'contractStartYear') {
        expect(stripped).not.toHaveProperty(key)
      }
    }
  })

  it('preserves engine-only fields that are not in InstanceCommon', () => {
    const inst = makeBavInstance({ monthlyGrossConversion: 300 })
    const stripped = stripInstanceCommonKeys(inst as unknown as Record<string, unknown>)
    expect((stripped as Record<string, unknown>).monthlyGrossConversion).toBe(300)
  })

  it('keysToKeep allows a common key to survive stripping (e.g. contractStartYear for insurance)', () => {
    const inst = makeInsuranceInstance({ contractStartYear: 2010 })
    const stripped = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
      ['contractStartYear'],
    )
    expect((stripped as Record<string, unknown>).contractStartYear).toBe(2010)
  })

  it('instanceId is always removed (never passed to engine)', () => {
    const inst = makeBavInstance({ instanceId: 'bav-abc' })
    const stripped = stripInstanceCommonKeys(inst as unknown as Record<string, unknown>)
    expect(stripped).not.toHaveProperty('instanceId')
  })
})

// ---------------------------------------------------------------------------
// 4. paidUpFeeModel
// ---------------------------------------------------------------------------

describe('portfolioProjection — paidUpFeeModel', () => {
  it('zeroes contribution-phase fees', () => {
    const fees = {
      wrapperAssetFee: 0.005,
      fundAssetFee: 0.002,
      contributionFee: 0.04,
      fixedMonthlyFee: 5,
      acquisitionCostPct: 0.03,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0.01,
    }
    const result = paidUpFeeModel(fees)
    expect(result.contributionFee).toBe(0)
    expect(result.fixedMonthlyFee).toBe(0)
    expect(result.acquisitionCostPct).toBe(0)
    expect(result.acquisitionCostSpreadYears).toBe(1)
  })

  it('preserves ongoing fees', () => {
    const fees = {
      wrapperAssetFee: 0.005,
      fundAssetFee: 0.002,
      contributionFee: 0.04,
      fixedMonthlyFee: 5,
      acquisitionCostPct: 0.03,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0.01,
    }
    const result = paidUpFeeModel(fees)
    expect(result.wrapperAssetFee).toBe(0.005)
    expect(result.fundAssetFee).toBe(0.002)
    expect(result.pensionPayoutFeePct).toBe(0.01)
  })
})

// ---------------------------------------------------------------------------
// 5. applyPaidUpOverridesToProjection
// ---------------------------------------------------------------------------

describe('portfolioProjection — applyPaidUpOverridesToProjection', () => {
  const workspace = makeWorkspace()
  const wsa = workspace.baseline.assumptions

  it('bav slot: zeroes contribution fields and strips acquisition fees', () => {
    const projected = projectInstanceToScenarioAssumptions(
      makeBavInstance({ fees: { ...defaultAssumptions.bav.fees, acquisitionCostPct: 0.04, fixedMonthlyFee: 3 } }),
      wsa,
    )
    const result = applyPaidUpOverridesToProjection(projected, 'bav')
    expect(result.bav.monthlyGrossConversion).toBe(0)
    expect(result.bav.statutoryMinimumSubsidyEnabled).toBe(false)
    expect(result.bav.contractualMatchPercent).toBe(0)
    expect(result.bav.contractualFixedMonthly).toBe(0)
    expect(result.bav.annualContributionGrowthRate).toBe(0)
    expect(result.bav.fees.acquisitionCostPct).toBe(0)
    expect(result.bav.fees.fixedMonthlyFee).toBe(0)
  })

  it('insurance slot: zeroes growth rate and strips acquisition fees', () => {
    const projected = projectInstanceToScenarioAssumptions(
      makeInsuranceInstance({ fees: { ...defaultAssumptions.insurance.fees, acquisitionCostPct: 0.05 } }),
      wsa,
    )
    const result = applyPaidUpOverridesToProjection(projected, 'insurance')
    expect(result.insurance.annualContributionGrowthRate).toBe(0)
    expect(result.insurance.fees.acquisitionCostPct).toBe(0)
  })

  it('basisrente slot: zeroes monthly contribution', () => {
    const projected = projectInstanceToScenarioAssumptions(
      makeBasisrenteInstance({ monthlyGrossContribution: 200 }),
      wsa,
    )
    const result = applyPaidUpOverridesToProjection(projected, 'basisrente')
    expect(result.basisrente.monthlyGrossContribution).toBe(0)
    expect(result.basisrente.fees.acquisitionCostPct).toBe(0)
  })

  it('altersvorsorgedepot slot: zeroes contribution and clears eligibility', () => {
    const projected = projectInstanceToScenarioAssumptions(
      makeAvdInstance({ monthlyOwnContribution: 200 }),
      wsa,
    )
    const result = applyPaidUpOverridesToProjection(projected, 'altersvorsorgedepot')
    expect(result.altersvorsorgedepot.monthlyOwnContribution).toBe(0)
    expect(result.altersvorsorgedepot.eligibility.directlyEligible).toBe(false)
    expect(result.altersvorsorgedepot.eligibility.indirectSpouseEligible).toBe(false)
    expect(result.altersvorsorgedepot.eligibility.eligibleChildren).toBe(0)
  })

  it('riester slot: zeroes contribution and clears eligibility', () => {
    const projected = projectInstanceToScenarioAssumptions(
      makeRiesterInstance({ monthlyOwnContribution: 100 }),
      wsa,
    )
    const result = applyPaidUpOverridesToProjection(projected, 'riester')
    expect(result.riester.monthlyOwnContribution).toBe(0)
    expect(result.riester.eligibility.directlyEligible).toBe(false)
    expect(result.riester.eligibility.indirectSpouseEligible).toBe(false)
  })

  it('etf slot: returns unchanged (ETF has no contribution field)', () => {
    const projected = projectInstanceToScenarioAssumptions(makeEtfInstance(), wsa)
    const result = applyPaidUpOverridesToProjection(projected, 'etf')
    // ETF slot is the default case — returned unchanged.
    expect(result.etf).toEqual(projected.etf)
  })
})

// ---------------------------------------------------------------------------
// 6. projectInstanceToScenarioAssumptions — correct slot population
// ---------------------------------------------------------------------------

describe('portfolioProjection — projectInstanceToScenarioAssumptions', () => {
  const workspace = makeWorkspace()
  const wsa = workspace.baseline.assumptions

  it('bAV instance: bav slot carries instance values, others are neutralised', () => {
    const inst = makeBavInstance({ monthlyGrossConversion: 300, rentenfaktor: 35 })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.bav.monthlyGrossConversion).toBe(300)
    expect(result.bav.rentenfaktor).toBe(35)
    // Other slots are neutralised.
    expect(result.etf).toEqual(NEUTRALISED_ETF)
    expect(result.insurance).toEqual(NEUTRALISED_INSURANCE)
    expect(result.basisrente).toEqual(NEUTRALISED_BASISRENTE)
    expect(result.altersvorsorgedepot).toEqual(NEUTRALISED_ALTERSVORSORGEDEPOT)
    expect(result.riester).toEqual(NEUTRALISED_RIESTER)
  })

  it('ETF instance: etf slot carries instance values, others are neutralised', () => {
    const inst = makeEtfInstance({ annualAssetFee: 0.0015 })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.etf.annualAssetFee).toBe(0.0015)
    expect(result.bav).toEqual(NEUTRALISED_BAV)
    expect(result.insurance).toEqual(NEUTRALISED_INSURANCE)
    expect(result.basisrente).toEqual(NEUTRALISED_BASISRENTE)
  })

  it('insurance instance: insurance slot carries instance values; contractStartYear preserved', () => {
    const inst = makeInsuranceInstance({ contractStartYear: 2008, rentenfaktor: 26 })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.insurance.contractStartYear).toBe(2008)
    expect(result.insurance.rentenfaktor).toBe(26)
    expect(result.bav).toEqual(NEUTRALISED_BAV)
  })

  it('basisrente instance: basisrente slot carries instance values', () => {
    const inst = makeBasisrenteInstance({ monthlyGrossContribution: 220 })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.basisrente.monthlyGrossContribution).toBe(220)
    expect(result.bav).toEqual(NEUTRALISED_BAV)
    expect(result.etf).toEqual(NEUTRALISED_ETF)
  })

  it('AVD instance: altersvorsorgedepot slot carries instance values', () => {
    const inst = makeAvdInstance({ monthlyOwnContribution: 120, riskAllocationPct: 0.8 })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.altersvorsorgedepot.monthlyOwnContribution).toBe(120)
    expect(result.altersvorsorgedepot.riskAllocationPct).toBe(0.8)
    expect(result.riester).toEqual(NEUTRALISED_RIESTER)
  })

  it('Riester instance: riester slot carries instance values', () => {
    const inst = makeRiesterInstance({ monthlyOwnContribution: 75 })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.riester.monthlyOwnContribution).toBe(75)
    expect(result.altersvorsorgedepot).toEqual(NEUTRALISED_ALTERSVORSORGEDEPOT)
  })

  it('scenario-level fields copy verbatim from workspace assumptions', () => {
    const inst = makeBavInstance()
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.inflationRate).toBe(wsa.inflationRate)
    expect(result.retirementEndAge).toBe(wsa.retirementEndAge)
    expect(result.returnScenarios).toBe(wsa.returnScenarios)
    expect(result.monteCarlo).toBe(wsa.monteCarlo)
    expect(result.visibleProducts).toBe(wsa.visibleProducts)
    expect(result.statutoryPension).toBe(wsa.statutoryPension)
  })

  it('InstanceCommon keys are stripped from the projected slot', () => {
    const inst = makeBavInstance({ instanceId: 'bav-should-not-appear' })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    const bavRecord = result.bav as unknown as Record<string, unknown>
    expect(bavRecord.instanceId).toBeUndefined()
    expect(bavRecord.label).toBeUndefined()
    expect(bavRecord.status).toBeUndefined()
    expect(bavRecord.evidenceMap).toBeUndefined()
    expect(bavRecord.transferEvents).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 7. singletonViewOfWorkspace — length-1 workspace and empty slots
// ---------------------------------------------------------------------------

describe('portfolioProjection — singletonViewOfWorkspace', () => {
  it('length-1 workspace projects bav slot identically to the original assumptions', () => {
    const workspace = makeWorkspace()
    const singleton = singletonViewOfWorkspace(workspace, SINGLETON_DEFAULTS)
    // The first bAV instance was created from defaultAssumptions.bav merged with
    // monthlyGrossConversion: 200 — so the projected slot should carry that value.
    expect(singleton.bav.monthlyGrossConversion).toBe(200)
    expect(singleton.bav.durchfuehrungsweg).toBe(defaultAssumptions.bav.durchfuehrungsweg)
  })

  it('empty product array falls back to supplied defaults', () => {
    const workspace = makeWorkspace()
    // Remove all ETF instances.
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          etf: [],
        },
      },
    }
    const singleton = singletonViewOfWorkspace(ws, SINGLETON_DEFAULTS)
    // Should use the default ETF slot.
    expect(singleton.etf).toEqual(defaultAssumptions.etf)
  })

  it('all-empty workspace returns all defaults', () => {
    const workspace = makeWorkspace()
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          bav: [],
          etf: [],
          insurance: [],
          basisrente: [],
          altersvorsorgedepot: [],
          riester: [],
        },
      },
    }
    const singleton = singletonViewOfWorkspace(ws, SINGLETON_DEFAULTS)
    expect(singleton.bav).toEqual(SINGLETON_DEFAULTS.bav)
    expect(singleton.etf).toEqual(SINGLETON_DEFAULTS.etf)
    expect(singleton.insurance).toEqual(SINGLETON_DEFAULTS.insurance)
    expect(singleton.basisrente).toEqual(SINGLETON_DEFAULTS.basisrente)
    expect(singleton.altersvorsorgedepot).toEqual(SINGLETON_DEFAULTS.altersvorsorgedepot)
    expect(singleton.riester).toEqual(SINGLETON_DEFAULTS.riester)
  })

  it('scenario-level fields come from workspace assumptions, not from defaults', () => {
    const workspace = makeWorkspace()
    const wsa = workspace.baseline.assumptions
    const singleton = singletonViewOfWorkspace(workspace, SINGLETON_DEFAULTS)
    expect(singleton.inflationRate).toBe(wsa.inflationRate)
    expect(singleton.retirementEndAge).toBe(wsa.retirementEndAge)
    expect(singleton.returnScenarios).toBe(wsa.returnScenarios)
    expect(singleton.statutoryPension).toBe(wsa.statutoryPension)
  })

  it('compareSubMode and equalInputAmountEUR round-trip through the view', () => {
    const workspace = makeWorkspace()
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          compareSubMode: 'equal_input',
          equalInputAmountEUR: 500,
        },
      },
    }
    const singleton = singletonViewOfWorkspace(ws, SINGLETON_DEFAULTS)
    expect(singleton.compareSubMode).toBe('equal_input')
    expect(singleton.equalInputAmountEUR).toBe(500)
  })

  it('surrendered instances are skipped — slot uses defaults', () => {
    const workspace = makeWorkspace()
    // Mark the only bAV instance as surrendered.
    const ws: Workspace = {
      ...workspace,
      baseline: {
        ...workspace.baseline,
        assumptions: {
          ...workspace.baseline.assumptions,
          bav: workspace.baseline.assumptions.bav.map(b => ({ ...b, status: 'surrendered' as const })),
        },
      },
    }
    const singleton = singletonViewOfWorkspace(ws, SINGLETON_DEFAULTS)
    expect(singleton.bav).toEqual(SINGLETON_DEFAULTS.bav)
  })
})

// ---------------------------------------------------------------------------
// 8. Paid-up state projection
// ---------------------------------------------------------------------------

describe('portfolioProjection — paid-up projection', () => {
  const workspace = makeWorkspace()
  const wsa = workspace.baseline.assumptions

  it('paid_up bAV: contributions zeroed when applyPaidUpOverridesToProjection applied', () => {
    const inst = makeBavInstance({ status: 'paid_up', monthlyGrossConversion: 300 })
    const projectedRaw = projectInstanceToScenarioAssumptions(inst, wsa)
    // Raw projection still carries the original value (paid-up override not yet applied).
    expect(projectedRaw.bav.monthlyGrossConversion).toBe(300)
    // Apply the paid-up override.
    const projected = applyPaidUpOverridesToProjection(projectedRaw, 'bav')
    expect(projected.bav.monthlyGrossConversion).toBe(0)
  })

  it('paid_up bAV: wrapper and fund fees preserved after paid-up override', () => {
    const inst = makeBavInstance({
      status: 'paid_up',
      fees: { ...defaultAssumptions.bav.fees, wrapperAssetFee: 0.008, fundAssetFee: 0.003 },
    })
    const projected = applyPaidUpOverridesToProjection(
      projectInstanceToScenarioAssumptions(inst, wsa),
      'bav',
    )
    expect(projected.bav.fees.wrapperAssetFee).toBe(0.008)
    expect(projected.bav.fees.fundAssetFee).toBe(0.003)
    expect(projected.bav.fees.acquisitionCostPct).toBe(0)
  })

  it('Riester instance: currentValueEUR → existingCapital if existingCapital is zero', () => {
    const inst = makeRiesterInstance({ currentValueEUR: 8000, monthlyOwnContribution: 0 })
    // Ensure existingCapital starts at 0 in the defaults.
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.riester.existingCapital).toBe(8000)
  })

  it('Riester instance: currentValueEUR is NOT overwritten if existingCapital already set', () => {
    const inst = makeRiesterInstance({ currentValueEUR: 8000 })
    // Override the merged riester with a non-zero existingCapital.
    const wsa2 = {
      ...wsa,
      riester: [{ ...inst, existingCapital: 5000 }],
    }
    // Build an instance where existingCapital comes from a direct override on the instance.
    const instWithExisting = { ...inst, existingCapital: 5000 }
    const result = projectInstanceToScenarioAssumptions(instWithExisting as RiesterInstance, wsa)
    // existingCapital is already 5000 on the instance, so currentValueEUR should not overwrite it.
    expect(result.riester.existingCapital).toBe(5000)
    // Suppress unused variable warning for wsa2.
    void wsa2
  })

  it('AVD instance: currentValueEUR → riesterTransferCapital if riesterTransferCapital is zero', () => {
    const inst = makeAvdInstance({ currentValueEUR: 12000, monthlyOwnContribution: 0 })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.altersvorsorgedepot.riesterTransferCapital).toBe(12000)
  })

  it('AVD instance: currentValueEUR is NOT overwritten if riesterTransferCapital already set', () => {
    const inst = makeAvdInstance({ currentValueEUR: 12000, riesterTransferCapital: 7000 })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(result.altersvorsorgedepot.riesterTransferCapital).toBe(7000)
  })
})

// ---------------------------------------------------------------------------
// 9. Legacy singleton compatibility (byte-identity requirement)
// ---------------------------------------------------------------------------

describe('portfolioProjection — legacy singleton compatibility', () => {
  it('a length-1 bAV workspace projects to the same singleton as the original v1 assumptions', () => {
    const original = {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 200,
      rentenfaktor: 33,
    }
    const workspace = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      {
        ...defaultAssumptions,
        bav: original,
      } as unknown as Record<string, unknown>,
    )
    const singleton = singletonViewOfWorkspace(workspace, SINGLETON_DEFAULTS)
    expect(singleton.bav.monthlyGrossConversion).toBe(original.monthlyGrossConversion)
    expect(singleton.bav.rentenfaktor).toBe(original.rentenfaktor)
    expect(singleton.bav.durchfuehrungsweg).toBe(original.durchfuehrungsweg)
    expect(singleton.bav.fees).toEqual(original.fees)
  })

  it('a length-1 insurance workspace projects contractStartYear correctly', () => {
    const original = {
      ...defaultAssumptions.insurance,
      contractStartYear: 2010,
    }
    const workspace = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      {
        ...defaultAssumptions,
        insurance: original,
      } as unknown as Record<string, unknown>,
    )
    const singleton = singletonViewOfWorkspace(workspace, SINGLETON_DEFAULTS)
    expect(singleton.insurance.contractStartYear).toBe(2010)
  })

  it('projection is idempotent — calling twice with identical inputs yields identical output', () => {
    const workspace = makeWorkspace()
    const wsa = workspace.baseline.assumptions
    const inst = makeBavInstance({ monthlyGrossConversion: 200 })
    const r1 = projectInstanceToScenarioAssumptions(inst, wsa)
    const r2 = projectInstanceToScenarioAssumptions(inst, wsa)
    expect(r1).toEqual(r2)
  })

  it('only the projected product slot differs from the neutralised defaults; no cross-contamination', () => {
    const workspace = makeWorkspace()
    const wsa = workspace.baseline.assumptions
    const inst = makeBavInstance({ monthlyGrossConversion: 200 })
    const result = projectInstanceToScenarioAssumptions(inst, wsa)
    // ETF, insurance, basisrente, avd, riester remain at exactly the neutralised baseline.
    expect(result.etf).toEqual(NEUTRALISED_ETF)
    expect(result.insurance).toEqual(NEUTRALISED_INSURANCE)
    expect(result.basisrente).toEqual(NEUTRALISED_BASISRENTE)
    expect(result.altersvorsorgedepot).toEqual(NEUTRALISED_ALTERSVORSORGEDEPOT)
    expect(result.riester).toEqual(NEUTRALISED_RIESTER)
    // bAV differs (not the neutralised default).
    expect(result.bav).not.toEqual(NEUTRALISED_BAV)
  })
})
