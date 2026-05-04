/**
 * Unit tests for contractDecisions.ts (Group G issue 14, Phase G M4 F1).
 *
 * Coverage:
 *   - weiterfuehrenWhatIf: identity delta, zero atoms.
 *   - beitragsfreiWhatIf: paid_up delta, high-fee warning for pAV.
 *   - kuendigenWhatIf: surrender delta, atoms for pre-2005 privilege loss.
 *   - kuendigenWhatIf: returns null for Basisrente (legally prohibited).
 *   - uebertragenWhatIf: transfer delta, Riester→AVD certified atom.
 *   - compatibleTransferTargets: Riester→AVD ✓ (certified).
 *   - compatibleTransferTargets: AVD→Riester ✗ (rejected per AltZertG).
 *   - compatibleTransferTargets: pAV→ETF ✓ (surrender_reinvest).
 *   - compatibleTransferTargets: Riester→AVD virtual target when no AVD exists.
 *   - compatibleTransferTargets: no validator-rejected pairings emitted (B2 regression).
 *   - Karin's 2002 pAV: kuendigen surfaces `lose_pre_2005_privilege` atom.
 *   - generateContractDecisions: Beitragsfrei is included for active non-ETF instances (M4 F1).
 *   - generateContractDecisions: ETF and already-paid-up instances skip Beitragsfrei.
 *   - applyContractDecision: identity, paid_up, surrender, transfer, transfer_to_new mutations.
 *   - applyContractDecision transfer: source gets "capital left" + target gets "capital received" (manual path).
 *   - applyContractDecision surrender-reinvest: source gets "capital left" + target gets "capital received" (#16).
 *   - generateContractDecisions: Basisrente kuendigen excluded.
 *   - Round-trip validation: applyContractDecision output survives migrateAndValidateState.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import type { Workspace } from '../domain/workspace'
import type { BasisrenteInstance, AltersvorsorgedepotInstance, RiesterInstance, EtfInstance } from '../domain/instances'
import {
  weiterfuehrenWhatIf,
  beitragsfreiWhatIf,
  kuendigenWhatIf,
  uebertragenWhatIf,
  uebertragenVirtualWhatIf,
  compatibleTransferTargets,
  applyContractDecision,
  generateContractDecisions,
} from './contractDecisions'
import { validateWorkspace } from '../utils/scenarioSchema'

// ---------------------------------------------------------------------------
// Workspace fixtures
// ---------------------------------------------------------------------------

/** Minimal workspace with a single active bAV instance. */
function makeDilanWorkspace(): Workspace {
  // Dilan: employee with an old §40b bAV (pre-2005 Direktversicherung).
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['bav', 'etf'],
    bav: {
      ...defaultAssumptions.bav,
      monthlyGrossConversion: 150,
      durchfuehrungsweg: 'direktversicherung_40b_alt',
      pre2005EligibleTaxFree: true,
    },
  }
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
}

/** Karin: 2002 private Rentenversicherung — pre-2005 tax-free eligible. */
function makeKarinWorkspace(): Workspace {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['versicherung'],
    insurance: {
      ...defaultAssumptions.insurance,
      contractStartYear: 2002,
      oldContractTaxFreeEligible: true,
      fees: {
        wrapperAssetFee: 0.015, // >1.2 % — triggers paid_up_high_fee_warning
        fundAssetFee: 0,
        contributionFee: 0,
        fixedMonthlyFee: 0,
        acquisitionCostPct: 0,
        acquisitionCostSpreadYears: 5,
        pensionPayoutFeePct: 0,
      },
    },
  }
  return migrateV1ToV2(
    { ...defaultProfile, age: 45, retirementAge: 67 } as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
}

/** Workspace with a Riester instance and an AVD instance. */
function makeRiesterAvdWorkspace(): Workspace {
  const riesterInstance: RiesterInstance = {
    instanceId: 'riester-test-1',
    label: 'Riester-Rente',
    status: 'active',
    contractStartYear: 2010,
    evidenceMap: {},
    monthlyOwnContribution: 100,
    existingCapital: 5000,
    eligibility: { directlyEligible: true, indirectSpouseEligible: false, ageAtContractStart: 30, careerStarterBonusUsed: false },
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
    fees: { wrapperAssetFee: 0.01, fundAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 5, pensionPayoutFeePct: 0 },
    payoutMode: 'leibrente',
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    partialCapitalPct: 0,
    monthlyOtherRetirementIncome: 0,
  }
  const avdInstance: AltersvorsorgedepotInstance = {
    instanceId: 'altersvorsorgedepot-test-1',
    label: 'Altersvorsorgedepot',
    status: 'active',
    contractStartYear: 2026,
    evidenceMap: {},
    subtype: 'depot_no_guarantee',
    monthlyOwnContribution: 50,
    eligibility: { directlyEligible: true, indirectSpouseEligible: false, eligibleChildren: 0, ageAtContractStart: 35, careerStarterBonusUsed: false },
    riskAllocationPct: 1,
    riskAnnualReturn: 0.07,
    lowRiskAnnualReturn: 0.02,
    fees: { wrapperAssetFee: 0.005, fundAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 5, pensionPayoutFeePct: 0 },
    payoutMode: 'certified_payout_plan',
    payoutPlanEndAge: 85,
    partialCapitalPct: 0,
    transferCostEUR: 0,
    monthlyOtherRetirementIncome: 0,
    rentenfaktor: 28,
    riesterTransferCapital: 0,
  }
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['riester', 'altersvorsorgedepot'],
  }
  const ws = migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  // Replace the auto-created instances with our test fixtures.
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

/** Workspace with a Basisrente instance. */
function makeBasisrenteWorkspace(): Workspace {
  const basisrenteInstance: BasisrenteInstance = {
    instanceId: 'basisrente-test-1',
    label: 'Rürup-Rente',
    status: 'active',
    contractStartYear: 2020,
    evidenceMap: {},
    monthlyGrossContribution: 200,
    payoutMode: 'leibrente',
    rentenfaktor: 28,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
    fees: { wrapperAssetFee: 0.01, fundAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 5, pensionPayoutFeePct: 0 },
  }
  const v1 = { ...defaultAssumptions, visibleProducts: ['basisrente'] }
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
        basisrente: [basisrenteInstance],
      },
    },
  }
}

// ---------------------------------------------------------------------------
// weiterfuehrenWhatIf
// ---------------------------------------------------------------------------

describe('weiterfuehrenWhatIf', () => {
  it('returns identity delta and zero atoms', () => {
    const ws = makeDilanWorkspace()
    const instanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = weiterfuehrenWhatIf(ws, instanceId)
    expect(decision.kind).toBe('weiterfuehren')
    expect(decision.workspaceDelta.kind).toBe('identity')
    expect(decision.deltaNettoRente).toBe(0)
    expect(decision.atoms).toHaveLength(0)
    expect(decision.sourceInstanceId).toBe(instanceId)
  })
})

// ---------------------------------------------------------------------------
// beitragsfreiWhatIf
// ---------------------------------------------------------------------------

describe('beitragsfreiWhatIf', () => {
  it('returns paid_up delta with correct instanceId', () => {
    const ws = makeDilanWorkspace()
    const instanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = beitragsfreiWhatIf(ws, instanceId)
    expect(decision.kind).toBe('beitragsfrei')
    expect(decision.workspaceDelta.kind).toBe('paid_up')
    if (decision.workspaceDelta.kind === 'paid_up') {
      expect(decision.workspaceDelta.instanceId).toBe(instanceId)
      expect(decision.workspaceDelta.paidUpAtAge).toBe(ws.baseline.profile.age)
    }
  })

  it('surfaces paid_up_high_fee_warning for Karin high-fee pAV', () => {
    const ws = makeKarinWorkspace()
    const instanceId = ws.baseline.assumptions.insurance[0].instanceId
    const decision = beitragsfreiWhatIf(ws, instanceId)
    const atomIds = decision.atoms.map((a) => a.id)
    expect(atomIds).toContain('paid_up_high_fee_warning')
  })

  it('surfaces paid_up_high_fee_warning when pensionPayoutFeePct alone pushes total over threshold', () => {
    // wrapperAssetFee + fundAssetFee = 0.010 (below 1.2 %), but pensionPayoutFeePct = 0.005
    // → combined 0.015 > 0.012 → warning fires
    const ws = makeKarinWorkspace()
    const inst = ws.baseline.assumptions.insurance[0]
    inst.fees.wrapperAssetFee = 0.008
    inst.fees.fundAssetFee = 0.002
    inst.fees.pensionPayoutFeePct = 0.005
    const decision = beitragsfreiWhatIf(ws, inst.instanceId)
    const atomIds = decision.atoms.map((a) => a.id)
    expect(atomIds).toContain('paid_up_high_fee_warning')
  })

  it('does NOT surface paid_up_high_fee_warning when all three fees sum to ≤1.2 %', () => {
    const ws = makeKarinWorkspace()
    const inst = ws.baseline.assumptions.insurance[0]
    inst.fees.wrapperAssetFee = 0.006
    inst.fees.fundAssetFee = 0.003
    inst.fees.pensionPayoutFeePct = 0.003
    const decision = beitragsfreiWhatIf(ws, inst.instanceId)
    const atomIds = decision.atoms.map((a) => a.id)
    expect(atomIds).not.toContain('paid_up_high_fee_warning')
  })

  it('uses supplied paidUpAtAge', () => {
    const ws = makeDilanWorkspace()
    const instanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = beitragsfreiWhatIf(ws, instanceId, 55)
    if (decision.workspaceDelta.kind === 'paid_up') {
      expect(decision.workspaceDelta.paidUpAtAge).toBe(55)
    }
  })
})

// ---------------------------------------------------------------------------
// kuendigenWhatIf
// ---------------------------------------------------------------------------

describe('kuendigenWhatIf', () => {
  it('returns surrender delta with default haircut for bAV (5 %)', () => {
    const ws = makeDilanWorkspace()
    const instanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = kuendigenWhatIf(ws, instanceId)
    expect(decision).not.toBeNull()
    expect(decision!.kind).toBe('kuendigen')
    if (decision!.workspaceDelta.kind === 'surrender') {
      expect(decision!.workspaceDelta.haircutPct).toBeCloseTo(0.05)
    }
  })

  it('returns null for Basisrente (legally prohibited)', () => {
    const ws = makeBasisrenteWorkspace()
    const instanceId = ws.baseline.assumptions.basisrente[0].instanceId
    const decision = kuendigenWhatIf(ws, instanceId)
    expect(decision).toBeNull()
  })

  it("Karin's 2002 pAV: surfaces lose_pre_2005_privilege caveat atom", () => {
    const ws = makeKarinWorkspace()
    const instanceId = ws.baseline.assumptions.insurance[0].instanceId
    const decision = kuendigenWhatIf(ws, instanceId)
    expect(decision).not.toBeNull()
    const atomIds = decision!.atoms.map((a) => a.id)
    expect(atomIds).toContain('lose_pre_2005_privilege')
  })

  it('accepts custom haircut', () => {
    const ws = makeKarinWorkspace()
    const instanceId = ws.baseline.assumptions.insurance[0].instanceId
    const decision = kuendigenWhatIf(ws, instanceId, 0.2)
    if (decision!.workspaceDelta.kind === 'surrender') {
      expect(decision!.workspaceDelta.haircutPct).toBeCloseTo(0.2)
    }
  })
})

// ---------------------------------------------------------------------------
// compatibleTransferTargets
// ---------------------------------------------------------------------------

describe('compatibleTransferTargets', () => {
  it('Riester → AVD: returns certified event type (existing target)', () => {
    const ws = makeRiesterAvdWorkspace()
    const riesterInst = ws.baseline.assumptions.riester[0]
    const targets = compatibleTransferTargets(ws, riesterInst)
    const avdTarget = targets.find(
      (t) => t.kind === 'existing' && t.targetInstance.instanceId.startsWith('altersvorsorgedepot-'),
    )
    expect(avdTarget).toBeDefined()
    expect(avdTarget!.eventType).toBe('certified')
  })

  it('Riester → AVD: virtual target when no AVD exists', () => {
    const ws = makeRiesterAvdWorkspace()
    // Remove all AVD instances.
    const wsNoAvd: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: { ...ws.baseline.assumptions, altersvorsorgedepot: [] },
      },
    }
    const riesterInst = wsNoAvd.baseline.assumptions.riester[0]
    const targets = compatibleTransferTargets(wsNoAvd, riesterInst)
    const virtualTarget = targets.find((t) => t.kind === 'create_new')
    expect(virtualTarget).toBeDefined()
    expect(virtualTarget!.eventType).toBe('certified')
    if (virtualTarget && virtualTarget.kind === 'create_new') {
      expect(virtualTarget.productId).toBe('altersvorsorgedepot')
    }
  })

  it('AVD → Riester: NOT included in compatible targets (AltZertG restriction)', () => {
    const ws = makeRiesterAvdWorkspace()
    const avdInst = ws.baseline.assumptions.altersvorsorgedepot[0]
    const targets = compatibleTransferTargets(ws, avdInst)
    // AVD → Riester should NOT be in the list.
    expect(targets).toHaveLength(0)
  })

  it('pAV → ETF: returns surrender_reinvest event type', () => {
    const karinWs = makeKarinWorkspace()
    // Add an ETF instance for pAV to transfer to.
    const etfInst: EtfInstance = {
      instanceId: 'etf-test-1',
      label: 'ETF-Depot',
      status: 'active',
      contractStartYear: 2020,
      evidenceMap: {},
      annualAssetFee: 0.002,
      equityPartialExemption: 0.3,
      annualContributionGrowthRate: 0,
      monthlyContribution: 100,
    }
    const ws: Workspace = {
      ...karinWs,
      baseline: {
        ...karinWs.baseline,
        assumptions: {
          ...karinWs.baseline.assumptions,
          etf: [etfInst],
        },
      },
    }
    const pavInst = ws.baseline.assumptions.insurance[0]
    const targets = compatibleTransferTargets(ws, pavInst)
    const etfTarget = targets.find(
      (t) => t.kind === 'existing' && t.targetInstance.instanceId === 'etf-test-1',
    )
    expect(etfTarget).toBeDefined()
    expect(etfTarget!.eventType).toBe('surrender_reinvest')
  })

  it('B2 regression: no emitted pairing is validator-rejected (surrender_reinvest into certified products)', () => {
    // Every pairing emitted must NOT target a certified product via surrender_reinvest.
    const CERTIFIED_TARGETS = new Set(['bav', 'altersvorsorgedepot', 'riester', 'basisrente'])
    const ws = makeRiesterAvdWorkspace()
    const allInstances: import('../domain/instances').InstanceCommon[] = [
      ...ws.baseline.assumptions.bav,
      ...ws.baseline.assumptions.insurance,
      ...ws.baseline.assumptions.etf,
      ...ws.baseline.assumptions.basisrente,
      ...ws.baseline.assumptions.altersvorsorgedepot,
      ...ws.baseline.assumptions.riester,
    ]
    for (const source of allInstances) {
      const targets = compatibleTransferTargets(ws, source)
      for (const t of targets) {
        if (t.kind !== 'existing') continue
        if (t.eventType === 'surrender_reinvest') {
          const targetId = t.targetInstance.instanceId
          const prefix = targetId.split('-')[0]
          expect(CERTIFIED_TARGETS.has(prefix)).toBe(false)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// uebertragenWhatIf
// ---------------------------------------------------------------------------

describe('uebertragenWhatIf', () => {
  it('Riester → AVD: emits certified transfer + riester_to_avd_certified atom', () => {
    const ws = makeRiesterAvdWorkspace()
    const sourceId = ws.baseline.assumptions.riester[0].instanceId
    const targetId = ws.baseline.assumptions.altersvorsorgedepot[0].instanceId
    const decision = uebertragenWhatIf(ws, sourceId, targetId, 'all')
    expect(decision.kind).toBe('uebertragen')
    if (decision.workspaceDelta.kind === 'transfer') {
      expect(decision.workspaceDelta.type).toBe('certified')
    }
    const atomIds = decision.atoms.map((a) => a.id)
    expect(atomIds).toContain('riester_to_avd_certified')
  })
})

// ---------------------------------------------------------------------------
// Dilan's old bAV: 2 distinct decisions (weiterfuehren / kuendigen — Beitragsfrei V1-excluded)
// ---------------------------------------------------------------------------

describe("Dilan's old bAV decisions", () => {
  it('generates weiterfuehren, beitragsfrei, and kuendigen', () => {
    const ws = makeDilanWorkspace()
    const instanceId = ws.baseline.assumptions.bav[0].instanceId
    const decisions = generateContractDecisions(ws, instanceId)
    const kinds = decisions.map((d) => d.kind)
    expect(kinds).toContain('weiterfuehren')
    expect(kinds).toContain('beitragsfrei')
    expect(kinds).toContain('kuendigen')
    const ids = new Set(decisions.map((d) => d.id))
    expect(ids.size).toBe(decisions.length)
    // ≥3 distinct candidates after M4 F1.
    expect(decisions.length).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// Basisrente: kuendigen NOT in candidate list
// ---------------------------------------------------------------------------

describe('Basisrente decisions', () => {
  it('kuendigen is not in the generated decisions (legally prohibited)', () => {
    const ws = makeBasisrenteWorkspace()
    const instanceId = ws.baseline.assumptions.basisrente[0].instanceId
    const decisions = generateContractDecisions(ws, instanceId)
    const kinds = decisions.map((d) => d.kind)
    expect(kinds).not.toContain('kuendigen')
  })

  it('weiterfuehren and beitragsfrei are present for Basisrente (M4 F1)', () => {
    const ws = makeBasisrenteWorkspace()
    const instanceId = ws.baseline.assumptions.basisrente[0].instanceId
    const decisions = generateContractDecisions(ws, instanceId)
    const kinds = decisions.map((d) => d.kind)
    expect(kinds).toContain('weiterfuehren')
    // Basisrente: capital payout legally prohibited → no kuendigen, but
    // beitragsfrei is allowed (paid-up Schicht-1 contracts continue running).
    expect(kinds).toContain('beitragsfrei')
    expect(kinds).not.toContain('kuendigen')
  })
})

// ---------------------------------------------------------------------------
// applyContractDecision
// ---------------------------------------------------------------------------

describe('applyContractDecision', () => {
  it('identity: returns a clone with no mutations', () => {
    const ws = makeDilanWorkspace()
    const instanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = weiterfuehrenWhatIf(ws, instanceId)
    const applied = applyContractDecision(ws, decision)
    expect(applied.baseline.assumptions.bav[0].status).toBe('active')
    // Should be a new object (deep clone)
    expect(applied).not.toBe(ws)
  })

  it('paid_up: flips instance status to paid_up', () => {
    const ws = makeDilanWorkspace()
    const instanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = beitragsfreiWhatIf(ws, instanceId)
    const applied = applyContractDecision(ws, decision)
    expect(applied.baseline.assumptions.bav[0].status).toBe('paid_up')
    // Original workspace is unchanged
    expect(ws.baseline.assumptions.bav[0].status).toBe('active')
  })

  it('surrender: flips instance status to surrendered', () => {
    const ws = makeKarinWorkspace()
    const instanceId = ws.baseline.assumptions.insurance[0].instanceId
    const decision = kuendigenWhatIf(ws, instanceId)!
    const applied = applyContractDecision(ws, decision)
    expect(applied.baseline.assumptions.insurance[0].status).toBe('surrendered')
  })

  it('transfer: appends transferEvent to source ("capital left") AND target ("capital received")', () => {
    const ws = makeRiesterAvdWorkspace()
    const sourceId = ws.baseline.assumptions.riester[0].instanceId
    const targetId = ws.baseline.assumptions.altersvorsorgedepot[0].instanceId
    const decision = uebertragenWhatIf(ws, sourceId, targetId, 'all')
    const applied = applyContractDecision(ws, decision)
    // Source carries "capital left" event.
    const sourceInst = applied.baseline.assumptions.riester[0]
    expect(sourceInst.transferEvents).toBeDefined()
    expect(sourceInst.transferEvents!.length).toBeGreaterThan(0)
    expect(sourceInst.transferEvents![0].type).toBe('certified')
    expect(sourceInst.transferEvents![0].targetInstanceId).toBe(targetId)
    // Target carries "capital received" event.
    const targetInst = applied.baseline.assumptions.altersvorsorgedepot[0]
    expect(targetInst.transferEvents).toBeDefined()
    expect(targetInst.transferEvents!.length).toBeGreaterThan(0)
    expect(targetInst.transferEvents![0].type).toBe('certified')
    expect(targetInst.transferEvents![0].sourceInstanceId).toBe(sourceId)
  })

  it('does not mutate the original workspace', () => {
    const ws = makeDilanWorkspace()
    const instanceId = ws.baseline.assumptions.bav[0].instanceId
    const decision = beitragsfreiWhatIf(ws, instanceId)
    applyContractDecision(ws, decision)
    expect(ws.baseline.assumptions.bav[0].status).toBe('active')
  })

  it('transfer_to_new: creates new AVD instance and appends certified transferEvent to both source and target', () => {
    const ws = makeRiesterAvdWorkspace()
    // Remove all AVD instances so the virtual target path is triggered.
    const wsNoAvd: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: { ...ws.baseline.assumptions, altersvorsorgedepot: [] },
      },
    }
    const sourceId = wsNoAvd.baseline.assumptions.riester[0].instanceId
    const decision = uebertragenVirtualWhatIf(wsNoAvd, sourceId, 'altersvorsorgedepot', 'all')
    const applied = applyContractDecision(wsNoAvd, decision, 2026)

    // A new AVD instance should have been created.
    expect(applied.baseline.assumptions.altersvorsorgedepot).toHaveLength(1)
    const newAvd = applied.baseline.assumptions.altersvorsorgedepot[0]
    expect(newAvd.instanceId).toMatch(/^altersvorsorgedepot-/)

    // Source carries "capital left" event.
    const sourceInst = applied.baseline.assumptions.riester[0]
    expect(sourceInst.transferEvents).toBeDefined()
    expect(sourceInst.transferEvents!.length).toBeGreaterThan(0)
    const sourceEvent = sourceInst.transferEvents![0]
    expect(sourceEvent.type).toBe('certified')
    expect(sourceEvent.targetInstanceId).toBe(newAvd.instanceId)

    // Target (new AVD) carries "capital received" event.
    expect(newAvd.transferEvents).toBeDefined()
    expect(newAvd.transferEvents!.length).toBeGreaterThan(0)
    const targetEvent = newAvd.transferEvents![0]
    expect(targetEvent.type).toBe('certified')
    expect(targetEvent.sourceInstanceId).toBe(sourceId)
  })

  it('year is deterministic (defaults to de2026Rules.year, no new Date())', () => {
    const ws = makeRiesterAvdWorkspace()
    const sourceId = ws.baseline.assumptions.riester[0].instanceId
    const targetId = ws.baseline.assumptions.altersvorsorgedepot[0].instanceId
    const decision = uebertragenWhatIf(ws, sourceId, targetId, 'all')
    const applied = applyContractDecision(ws, decision)
    const event = applied.baseline.assumptions.riester[0].transferEvents![0]
    // Year should be 2026 (de2026Rules.year) — not the runtime year.
    expect(event.year).toBe(2026)
  })

  it('surrender-reinvest: source carries "capital left" AND target carries "capital received"', () => {
    // pAV surrendered and reinvested into an ETF instance.
    const karinWs = makeKarinWorkspace()
    const etfInst: EtfInstance = {
      instanceId: 'etf-reinvest-target',
      label: 'ETF-Depot',
      status: 'active',
      contractStartYear: 2020,
      evidenceMap: {},
      annualAssetFee: 0.002,
      equityPartialExemption: 0.3,
      annualContributionGrowthRate: 0,
      monthlyContribution: 100,
    }
    const ws: Workspace = {
      ...karinWs,
      baseline: {
        ...karinWs.baseline,
        assumptions: { ...karinWs.baseline.assumptions, etf: [etfInst] },
      },
    }
    const sourceId = ws.baseline.assumptions.insurance[0].instanceId
    const targetId = 'etf-reinvest-target'
    // kuendigen with reallocateToInstanceId triggers the surrender-reinvest path.
    const decision = kuendigenWhatIf(ws, sourceId, undefined, targetId)!
    const applied = applyContractDecision(ws, decision, 2026)

    // Source (pAV) carries "capital left" event.
    const sourceInst = applied.baseline.assumptions.insurance[0]
    expect(sourceInst.transferEvents).toBeDefined()
    expect(sourceInst.transferEvents!.length).toBeGreaterThan(0)
    const sourceEvent = sourceInst.transferEvents![0]
    expect(sourceEvent.type).toBe('surrender_reinvest')
    expect(sourceEvent.sourceInstanceId).toBe(sourceId)
    expect(sourceEvent.targetInstanceId).toBe(targetId)

    // Target (ETF) carries "capital received" event.
    const targetInst = applied.baseline.assumptions.etf[0]
    expect(targetInst.transferEvents).toBeDefined()
    expect(targetInst.transferEvents!.length).toBeGreaterThan(0)
    const targetEvent = targetInst.transferEvents![0]
    expect(targetEvent.type).toBe('surrender_reinvest')
    expect(targetEvent.sourceInstanceId).toBe(sourceId)
    expect(targetEvent.targetInstanceId).toBe(targetId)
  })
})

// ---------------------------------------------------------------------------
// Karin's pAV menu (B3): 2-card menu after Beitragsfrei removal
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// M4 F1: Beitragsfrei skip for ETF and already-paid-up instances
// ---------------------------------------------------------------------------

describe('M4 F1: beitragsfrei card filtering', () => {
  it('ETF instance: no beitragsfrei card (no acquisition-fee semantics to drop)', () => {
    const ws = makeKarinWorkspace()
    // Add an ETF instance.
    const etfInst: EtfInstance = {
      instanceId: 'etf-paidup-test',
      label: 'ETF',
      status: 'active',
      contractStartYear: 2020,
      evidenceMap: {},
      annualAssetFee: 0.002,
      equityPartialExemption: 0.3,
      annualContributionGrowthRate: 0,
      monthlyContribution: 100,
    }
    const wsWithEtf: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: { ...ws.baseline.assumptions, etf: [etfInst] },
      },
    }
    const decisions = generateContractDecisions(wsWithEtf, etfInst.instanceId)
    const kinds = decisions.map((d) => d.kind)
    expect(kinds).not.toContain('beitragsfrei')
  })

  it('already-paid-up instance: no beitragsfrei card (no-op)', () => {
    const ws = makeDilanWorkspace()
    const instanceId = ws.baseline.assumptions.bav[0].instanceId
    // Mark the bAV as paid_up.
    const wsPaidUp: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          bav: ws.baseline.assumptions.bav.map((b) =>
            b.instanceId === instanceId ? { ...b, status: 'paid_up' } : b,
          ),
        },
      },
    }
    const decisions = generateContractDecisions(wsPaidUp, instanceId)
    const kinds = decisions.map((d) => d.kind)
    expect(kinds).not.toContain('beitragsfrei')
  })
})

describe("Karin's pAV menu (M4 F1: Beitragsfrei re-enabled)", () => {
  it('generates weiterfuehren, beitragsfrei, and kuendigen', () => {
    const ws = makeKarinWorkspace()
    const instanceId = ws.baseline.assumptions.insurance[0].instanceId
    const decisions = generateContractDecisions(ws, instanceId)
    const kinds = decisions.map((d) => d.kind)
    expect(kinds).toContain('weiterfuehren')
    expect(kinds).toContain('beitragsfrei')
    expect(kinds).toContain('kuendigen')
    expect(decisions.length).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// N7: round-trip validation — applyContractDecision output survives validateWorkspace
// ---------------------------------------------------------------------------

describe('round-trip validation (N7)', () => {
  it('surrender decision survives validateWorkspace round-trip', () => {
    const ws = makeKarinWorkspace()
    const instanceId = ws.baseline.assumptions.insurance[0].instanceId
    const decision = kuendigenWhatIf(ws, instanceId)!
    const applied = applyContractDecision(ws, decision, 2026)
    // Serialize + validate round-trip
    const serialised = JSON.stringify(applied)
    const revalidated = validateWorkspace(JSON.parse(serialised))
    expect(revalidated).not.toBeNull()
  })

  it('certified transfer decision survives validateWorkspace round-trip', () => {
    const ws = makeRiesterAvdWorkspace()
    const sourceId = ws.baseline.assumptions.riester[0].instanceId
    const targetId = ws.baseline.assumptions.altersvorsorgedepot[0].instanceId
    const decision = uebertragenWhatIf(ws, sourceId, targetId, 'all')
    const applied = applyContractDecision(ws, decision, 2026)
    const serialised = JSON.stringify(applied)
    const revalidated = validateWorkspace(JSON.parse(serialised))
    expect(revalidated).not.toBeNull()
  })

  it('transfer_to_new (virtual target) survives validateWorkspace round-trip', () => {
    const ws = makeRiesterAvdWorkspace()
    // Remove AVD so virtual target path fires.
    const wsNoAvd: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: { ...ws.baseline.assumptions, altersvorsorgedepot: [] },
      },
    }
    const sourceId = wsNoAvd.baseline.assumptions.riester[0].instanceId
    const decision = uebertragenVirtualWhatIf(wsNoAvd, sourceId, 'altersvorsorgedepot', 'all')
    const applied = applyContractDecision(wsNoAvd, decision, 2026)
    const serialised = JSON.stringify(applied)
    const revalidated = validateWorkspace(JSON.parse(serialised))
    expect(revalidated).not.toBeNull()
  })
})
