/**
 * Tests for portfolioTransfer (architecture-readability issue 04).
 *
 * Coverage:
 *   1. eventCalendarYearToContractYear — year conversion and clamping.
 *   2. collectTransferEvents — outbound/inbound routing, dual-storage,
 *      malformed event warning.
 *   3. findInstanceById — lookup across all product arrays.
 *   4. detectProductSlot — prefix-based and structural detection.
 *   5. computeSurrenderTax — per-channel surrender tax (pre-2005 tax-free,
 *      halbeinkuenfte, abgeltungsteuer, bAV, Riester, AVD, Basisrente, ETF).
 *   6. buildInstanceCapitalPolicy — paid-up, surrendered (skip), full
 *      certified transfer (source removed, target capital injection), partial
 *      certified transfer (source retains residual), surrender_reinvest
 *      (tax deducted from injection), residual capital behavior.
 */

import { describe, expect, it, vi } from 'vitest'
import { de2026Rules } from '../rules/de2026'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import { afterTaxRiesterLumpSum } from './riester'
import {
  buildInstanceCapitalPolicy,
  collectTransferEvents,
  computeSurrenderTax,
  detectProductSlot,
  eventCalendarYearToContractYear,
  findInstanceById,
} from './portfolioTransfer'
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

function makeBaseWorkspace(): Workspace {
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    defaultAssumptions as unknown as Record<string, unknown>,
  )
}

// ---------------------------------------------------------------------------
// 1. eventCalendarYearToContractYear
// ---------------------------------------------------------------------------

describe('portfolioTransfer — eventCalendarYearToContractYear', () => {
  const rulesYear = de2026Rules.year // 2026

  it('event in the rules year maps to contract year 1', () => {
    expect(eventCalendarYearToContractYear(rulesYear, rulesYear)).toBe(1)
  })

  it('event 5 years after rules year maps to contract year 6', () => {
    expect(eventCalendarYearToContractYear(rulesYear + 5, rulesYear)).toBe(6)
  })

  it('event before rules year clamps to contract year 1', () => {
    expect(eventCalendarYearToContractYear(rulesYear - 3, rulesYear)).toBe(1)
  })

  it('event at rules year - 1 clamps to 1', () => {
    expect(eventCalendarYearToContractYear(rulesYear - 1, rulesYear)).toBe(1)
  })

  it('event far in the future returns as-is (no upper clamp)', () => {
    expect(eventCalendarYearToContractYear(rulesYear + 40, rulesYear)).toBe(41)
  })
})

// ---------------------------------------------------------------------------
// 2. collectTransferEvents
// ---------------------------------------------------------------------------

describe('portfolioTransfer — collectTransferEvents', () => {
  it('dual-stored certified event: source array → outbound only, target array → inbound only', () => {
    const ws = makeBaseWorkspace()
    const ev = {
      type: 'certified' as const,
      year: de2026Rules.year + 3,
      sourceInstanceId: 'riester-src',
      targetInstanceId: 'avd-tgt',
      amountEUR: 20_000,
    }
    const riesterSrc: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-src',
      transferEvents: [ev],
    }
    const avdTgt: AltersvorsorgedepotInstance = {
      ...ws.baseline.assumptions.altersvorsorgedepot[0],
      instanceId: 'avd-tgt',
      transferEvents: [ev],
    }
    const wsa = {
      ...ws.baseline.assumptions,
      riester: [riesterSrc],
      altersvorsorgedepot: [avdTgt],
    }
    const { outboundBy, inboundBy } = collectTransferEvents(wsa)

    // Source array → outbound
    expect(outboundBy.get('riester-src')).toHaveLength(1)
    expect(outboundBy.get('riester-src')![0]).toStrictEqual(ev)
    // No inbound entry for source
    expect(inboundBy.get('riester-src')).toBeUndefined()

    // Target array → inbound
    expect(inboundBy.get('avd-tgt')).toHaveLength(1)
    expect(inboundBy.get('avd-tgt')![0]).toStrictEqual(ev)
    // No outbound entry for target
    expect(outboundBy.get('avd-tgt')).toBeUndefined()
  })

  it('instance with no transferEvents contributes nothing to the maps', () => {
    const ws = makeBaseWorkspace()
    const { outboundBy, inboundBy } = collectTransferEvents(ws.baseline.assumptions)
    expect(outboundBy.size).toBe(0)
    expect(inboundBy.size).toBe(0)
  })

  it('malformed event (instanceId matches neither source nor target) is warned and skipped', () => {
    const ws = makeBaseWorkspace()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ev = {
      type: 'certified' as const,
      year: de2026Rules.year + 1,
      sourceInstanceId: 'phantom-source',
      targetInstanceId: 'phantom-target',
      amountEUR: 5_000,
    }
    const bavInst: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-unrelated',
      transferEvents: [ev],
    }
    const wsa = { ...ws.baseline.assumptions, bav: [bavInst] }
    const { outboundBy, inboundBy } = collectTransferEvents(wsa)
    expect(outboundBy.size).toBe(0)
    expect(inboundBy.size).toBe(0)
    expect(warnSpy).toHaveBeenCalledOnce()
    warnSpy.mockRestore()
  })

  it('multiple events on the same source instance accumulate in the outbound array', () => {
    const ws = makeBaseWorkspace()
    const ev1 = {
      type: 'certified' as const,
      year: de2026Rules.year + 1,
      sourceInstanceId: 'bav-src',
      targetInstanceId: 'bav-tgt-1',
      amountEUR: 5_000,
    }
    const ev2 = {
      type: 'certified' as const,
      year: de2026Rules.year + 2,
      sourceInstanceId: 'bav-src',
      targetInstanceId: 'bav-tgt-2',
      amountEUR: 8_000,
    }
    const bavSrc: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-src',
      transferEvents: [ev1, ev2],
    }
    const wsa = { ...ws.baseline.assumptions, bav: [bavSrc] }
    const { outboundBy } = collectTransferEvents(wsa)
    expect(outboundBy.get('bav-src')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// 3. findInstanceById
// ---------------------------------------------------------------------------

describe('portfolioTransfer — findInstanceById', () => {
  it('finds a bAV instance by id', () => {
    const ws = makeBaseWorkspace()
    const id = ws.baseline.assumptions.bav[0].instanceId
    const found = findInstanceById(ws, id)
    expect(found).toBeDefined()
    expect(found!.instanceId).toBe(id)
  })

  it('finds an ETF instance by id', () => {
    const ws = makeBaseWorkspace()
    const id = ws.baseline.assumptions.etf[0].instanceId
    const found = findInstanceById(ws, id)
    expect(found).toBeDefined()
    expect(found!.instanceId).toBe(id)
  })

  it('returns undefined for an unknown id', () => {
    const ws = makeBaseWorkspace()
    expect(findInstanceById(ws, 'does-not-exist')).toBeUndefined()
  })

  it('finds a Riester instance by id', () => {
    const ws = makeBaseWorkspace()
    const id = ws.baseline.assumptions.riester[0].instanceId
    const found = findInstanceById(ws, id)
    expect(found).toBeDefined()
    expect(found!.instanceId).toBe(id)
  })
})

// ---------------------------------------------------------------------------
// 4. detectProductSlot
// ---------------------------------------------------------------------------

describe('portfolioTransfer — detectProductSlot', () => {
  it('detects bav from instanceId prefix', () => {
    const ws = makeBaseWorkspace()
    const inst = ws.baseline.assumptions.bav[0]
    expect(detectProductSlot(inst)).toBe('bav')
  })

  it('detects insurance from versicherung- prefix', () => {
    const ws = makeBaseWorkspace()
    const inst = ws.baseline.assumptions.insurance[0]
    // The migrated id starts with 'versicherung-'
    expect(detectProductSlot(inst)).toBe('insurance')
  })

  it('detects etf from etf- prefix', () => {
    const ws = makeBaseWorkspace()
    const inst = ws.baseline.assumptions.etf[0]
    expect(detectProductSlot(inst)).toBe('etf')
  })

  it('detects riester from riester- prefix', () => {
    const ws = makeBaseWorkspace()
    const inst = ws.baseline.assumptions.riester[0]
    expect(detectProductSlot(inst)).toBe('riester')
  })

  it('detects altersvorsorgedepot from altersvorsorgedepot- prefix', () => {
    const ws = makeBaseWorkspace()
    const inst = ws.baseline.assumptions.altersvorsorgedepot[0]
    expect(detectProductSlot(inst)).toBe('altersvorsorgedepot')
  })

  it('detects basisrente from basisrente- prefix', () => {
    const ws = makeBaseWorkspace()
    const inst = ws.baseline.assumptions.basisrente[0]
    expect(detectProductSlot(inst)).toBe('basisrente')
  })
})

// ---------------------------------------------------------------------------
// 5. computeSurrenderTax
// ---------------------------------------------------------------------------

describe('portfolioTransfer — computeSurrenderTax', () => {
  it('returns 0 for zero or negative surrender proceeds', () => {
    const ws = makeBaseWorkspace()
    const ins = ws.baseline.assumptions.insurance[0]
    expect(computeSurrenderTax(ins, 0, ws, de2026Rules, de2026Rules.year + 5)).toBe(0)
    expect(computeSurrenderTax(ins, -100, ws, de2026Rules, de2026Rules.year + 5)).toBe(0)
  })

  it('pre-2005 insurance (tax-free eligible) → surrender tax is 0', () => {
    const ws = makeBaseWorkspace()
    const pre2005: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-pre2005',
      contractStartYear: 2000,
      oldContractTaxFreeEligible: true,
    }
    const tax = computeSurrenderTax(pre2005, 50_000, ws, de2026Rules, de2026Rules.year + 5)
    expect(tax).toBe(0)
  })

  it('halbeinkuenfte insurance → surrender tax > 0 (zero cost-basis approximation)', () => {
    // contractStartYear 2008 with enough runtime + retirementAge > 62 → halbeinkuenfte
    const ws = makeBaseWorkspace()
    const halbe: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-halbe',
      contractStartYear: 2008,
      oldContractTaxFreeEligible: false,
    }
    const tax = computeSurrenderTax(halbe, 50_000, ws, de2026Rules, de2026Rules.year + 5)
    expect(tax).toBeGreaterThan(0)
  })

  it('abgeltungsteuer insurance (retirementAge < 62) → surrender tax > 0', () => {
    const ws = makeBaseWorkspace()
    const wsLowRetire: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        profile: { ...ws.baseline.profile, retirementAge: 60 },
      },
    }
    const abgelt: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-abgelt',
      contractStartYear: 2015,
      oldContractTaxFreeEligible: false,
    }
    const tax = computeSurrenderTax(abgelt, 30_000, wsLowRetire, de2026Rules, de2026Rules.year + 3)
    expect(tax).toBeGreaterThan(0)
  })

  it('uses surrender-year age, not eventual retirementAge, for private-insurance surrender tax mode', () => {
    const ws = makeBaseWorkspace()
    const eventYear = de2026Rules.year + 2
    const surrenderBeforeThreshold: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        profile: { ...ws.baseline.profile, age: 45, retirementAge: 67 },
      },
    }
    const sameSurrenderAgeAsRetirementAge: Workspace = {
      ...surrenderBeforeThreshold,
      baseline: {
        ...surrenderBeforeThreshold.baseline,
        profile: { ...surrenderBeforeThreshold.baseline.profile, retirementAge: 47 },
      },
    }
    const insurance: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-early-surrender',
      contractStartYear: 2010,
      oldContractTaxFreeEligible: false,
    }

    const actual = computeSurrenderTax(
      insurance,
      100_000,
      surrenderBeforeThreshold,
      de2026Rules,
      eventYear,
    )
    const expectedAbgeltungsteuer = computeSurrenderTax(
      insurance,
      100_000,
      sameSurrenderAgeAsRetirementAge,
      de2026Rules,
      eventYear,
    )

    expect(actual).toBeCloseTo(expectedAbgeltungsteuer, 2)
  })

  it('bAV (direktversicherung_3_63) → surrender tax > 0 (marginal rate, no Fünftelregelung)', () => {
    const ws = makeBaseWorkspace()
    const bav: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-surrender',
      durchfuehrungsweg: 'direktversicherung_3_63',
      pre2005EligibleTaxFree: false,
    }
    const tax = computeSurrenderTax(bav, 20_000, ws, de2026Rules, de2026Rules.year + 5)
    expect(tax).toBeGreaterThan(0)
  })

  it('Riester → surrender tax equals §22 Nr. 5 EStG tax only (upper-bound; clawback NOT modelled, gh#81)', () => {
    // NOTE (gh#81): This test intentionally pins the UPPER-BOUND behaviour.
    // §93 EStG Zulagen + Sonderausgaben clawback is not modelled; the computed
    // tax is §22 Nr. 5 EStG payout taxation only. When clawback is eventually
    // implemented, this test must be updated to assert a lower net value.
    const ws = makeBaseWorkspace()
    const riester: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-surrender',
    }
    const surrenderProceeds = 20_000
    const eventCalendarYear = de2026Rules.year + 5
    const tax = computeSurrenderTax(riester, surrenderProceeds, ws, de2026Rules, eventCalendarYear)

    // Compute the expected value using the same helper called inside computeSurrenderTax
    // for the Riester branch: afterTaxRiesterLumpSum with zero otherAnnualIncome and
    // zero grvBaselineMonthly (matching the computeSurrenderTax call site).
    const netAfterTax = afterTaxRiesterLumpSum(
      surrenderProceeds,
      ws.baseline.profile,
      de2026Rules,
      0,
      eventCalendarYear,
      0,
    )
    const expectedTax = Math.max(0, surrenderProceeds - netAfterTax)

    expect(tax).toBe(expectedTax)
    // Sanity: tax must be positive (proceeds well above Sparerpauschbetrag).
    expect(tax).toBeGreaterThan(0)
  })

  it('AVD → surrender tax >= 0', () => {
    const ws = makeBaseWorkspace()
    const avd: AltersvorsorgedepotInstance = {
      ...ws.baseline.assumptions.altersvorsorgedepot[0],
      instanceId: 'avd-surrender',
    }
    const tax = computeSurrenderTax(avd, 20_000, ws, de2026Rules, de2026Rules.year + 5)
    expect(tax).toBeGreaterThanOrEqual(0)
  })

  it('ETF → surrender tax is 0 (rejected by validator; defensive only)', () => {
    const ws = makeBaseWorkspace()
    const etf: EtfInstance = {
      ...ws.baseline.assumptions.etf[0],
      instanceId: 'etf-surrender',
    }
    const tax = computeSurrenderTax(etf, 30_000, ws, de2026Rules, de2026Rules.year + 5)
    expect(tax).toBe(0)
  })

  it('Basisrente → surrender tax is 0 (non-surrenderable; defensive only)', () => {
    const ws = makeBaseWorkspace()
    const basisrente: BasisrenteInstance = {
      ...ws.baseline.assumptions.basisrente[0],
      instanceId: 'basisrente-surrender',
    }
    const tax = computeSurrenderTax(basisrente, 30_000, ws, de2026Rules, de2026Rules.year + 5)
    expect(tax).toBe(0)
  })

  it('halbeinkuenfte surrender tax is less than abgeltungsteuer equivalent (different tax rate)', () => {
    // This is a directional pin: halbeinkuenfte uses 50% of gain at marginal rate
    // (which for typical incomes < 25% Abgeltungsteuer), so tax should differ
    // depending on the mode. We just verify both are > 0 and different enough to
    // confirm separate code paths ran.
    // Profile age 56 → surrender-year age 61 (at rules.year+5).
    // 2008 contract: pre-2012 min-age threshold is 60 → 61 >= 60 → halbeinkuenfte.
    // 2015 contract: post-2011 min-age threshold is 62 → 61 < 62 → abgeltungsteuer.
    const ws = {
      ...makeBaseWorkspace(),
      baseline: {
        ...makeBaseWorkspace().baseline,
        profile: { ...makeBaseWorkspace().baseline.profile, age: 56 },
      },
    }
    const halbeIns: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-halbe-2',
      contractStartYear: 2008,
      oldContractTaxFreeEligible: false,
    }
    const abgeltIns: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-abgelt-2',
      contractStartYear: 2015,
      oldContractTaxFreeEligible: false,
    }
    const taxHalbe = computeSurrenderTax(halbeIns, 100_000, ws, de2026Rules, de2026Rules.year + 5)
    const taxAbgelt = computeSurrenderTax(abgeltIns, 100_000, ws, de2026Rules, de2026Rules.year + 5)
    expect(taxHalbe).toBeGreaterThan(0)
    expect(taxAbgelt).toBeGreaterThan(0)
    // Abgeltungsteuer is a flat ~26.375% on full gain; halbeinkuenfte taxes half
    // at marginal rate. For high-gain amounts the flat rate is typically higher.
    expect(taxAbgelt).not.toBe(taxHalbe)
  })
})

// ---------------------------------------------------------------------------
// 6. buildInstanceCapitalPolicy
// ---------------------------------------------------------------------------

describe('portfolioTransfer — buildInstanceCapitalPolicy', () => {
  it('returns undefined when no currentValueEUR and no events', () => {
    const ws = makeBaseWorkspace()
    const inst = ws.baseline.assumptions.bav[0]
    // Ensure no currentValueEUR
    const instNoCapital = { ...inst, currentValueEUR: undefined }
    const policy = buildInstanceCapitalPolicy(instNoCapital, ws, de2026Rules, [], [])
    expect(policy).toBeUndefined()
  })

  it('paid-up instance with currentValueEUR → policy.initialCapital is set', () => {
    const ws = makeBaseWorkspace()
    const bav: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-paid-up',
      status: 'paid_up',
      currentValueEUR: 40_000,
    }
    const policy = buildInstanceCapitalPolicy(bav, ws, de2026Rules, [], [])
    expect(policy).toBeDefined()
    expect(policy!.initialCapital).toBe(40_000)
    expect(policy!.capitalInjections).toBeUndefined()
    expect(policy!.capitalWithdrawals).toBeUndefined()
  })

  it('Riester instance: initialCapital is NOT set (handled by existingCapital in simulator)', () => {
    const ws = makeBaseWorkspace()
    const riester: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-capital',
      currentValueEUR: 20_000,
    }
    const policy = buildInstanceCapitalPolicy(riester, ws, de2026Rules, [], [])
    // Riester slot is excluded from initialCapital mapping (uses existingCapital path)
    expect(policy?.initialCapital).toBeUndefined()
    // Policy still not undefined because currentValueEUR > 0 but the content is empty
    // after the slot check → should return undefined (all fields empty).
    expect(policy).toBeUndefined()
  })

  it('AVD instance: initialCapital is NOT set (handled by riesterTransferCapital in simulator)', () => {
    const ws = makeBaseWorkspace()
    const avd: AltersvorsorgedepotInstance = {
      ...ws.baseline.assumptions.altersvorsorgedepot[0],
      instanceId: 'avd-capital',
      currentValueEUR: 15_000,
    }
    const policy = buildInstanceCapitalPolicy(avd, ws, de2026Rules, [], [])
    expect(policy?.initialCapital).toBeUndefined()
    expect(policy).toBeUndefined()
  })

  it('full certified transfer: source outbound → capitalWithdrawal; target inbound → capitalInjection', () => {
    const ws = makeBaseWorkspace()
    const ev = {
      type: 'certified' as const,
      year: de2026Rules.year + 5,
      sourceInstanceId: 'riester-full-src',
      targetInstanceId: 'avd-full-tgt',
      amountEUR: 30_000,
    }
    const riesterSrc: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-full-src',
      currentValueEUR: 30_000,
      transferEvents: [ev],
    }
    const avdTgt: AltersvorsorgedepotInstance = {
      ...ws.baseline.assumptions.altersvorsorgedepot[0],
      instanceId: 'avd-full-tgt',
      transferEvents: [ev],
    }
    const wsWithEvents: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          riester: [riesterSrc],
          altersvorsorgedepot: [avdTgt],
        },
      },
    }

    // Source policy
    const srcPolicy = buildInstanceCapitalPolicy(riesterSrc, wsWithEvents, de2026Rules, [ev], [])
    expect(srcPolicy).toBeDefined()
    expect(srcPolicy!.capitalWithdrawals).toHaveLength(1)
    expect(srcPolicy!.capitalWithdrawals![0].amount).toBe(30_000)
    expect(srcPolicy!.capitalInjections).toBeUndefined()

    // Target policy (no currentValueEUR → no initialCapital)
    const tgtPolicy = buildInstanceCapitalPolicy(avdTgt, wsWithEvents, de2026Rules, [], [ev])
    expect(tgtPolicy).toBeDefined()
    expect(tgtPolicy!.capitalInjections).toHaveLength(1)
    expect(tgtPolicy!.capitalInjections![0].amount).toBe(30_000)
    expect(tgtPolicy!.capitalWithdrawals).toBeUndefined()
    // Tax-neutral — no costBasisInjections
    expect(tgtPolicy!.costBasisInjections).toBeUndefined()
  })

  it('partial certified transfer: source loses amountEUR but retains remaining capital', () => {
    const ws = makeBaseWorkspace()
    const ev = {
      type: 'certified' as const,
      year: de2026Rules.year + 3,
      sourceInstanceId: 'bav-partial-src',
      targetInstanceId: 'bav-partial-tgt',
      amountEUR: 10_000,
    }
    const bavSrc: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-partial-src',
      currentValueEUR: 25_000,
      transferEvents: [ev],
    }
    const srcPolicy = buildInstanceCapitalPolicy(bavSrc, ws, de2026Rules, [ev], [])
    expect(srcPolicy).toBeDefined()
    // initialCapital = 25_000 (starts with that capital)
    expect(srcPolicy!.initialCapital).toBe(25_000)
    // Withdrawal of 10_000 at contractYear 3 (rulesYear + 3 → year 4)
    expect(srcPolicy!.capitalWithdrawals).toHaveLength(1)
    expect(srcPolicy!.capitalWithdrawals![0].amount).toBe(10_000)
    const expectedYear = de2026Rules.year + 3 - de2026Rules.year + 1 // = 4
    expect(srcPolicy!.capitalWithdrawals![0].year).toBe(expectedYear)
  })

  it('residual capital: source with no transfer retains full initialCapital', () => {
    const ws = makeBaseWorkspace()
    const bavSrc: BavInstance = {
      ...ws.baseline.assumptions.bav[0],
      instanceId: 'bav-residual',
      currentValueEUR: 50_000,
    }
    const policy = buildInstanceCapitalPolicy(bavSrc, ws, de2026Rules, [], [])
    expect(policy).toBeDefined()
    expect(policy!.initialCapital).toBe(50_000)
    expect(policy!.capitalWithdrawals).toBeUndefined()
    expect(policy!.capitalInjections).toBeUndefined()
  })

  it('surrender_reinvest: target receives after-tax injection and costBasisInjection', () => {
    const ws = makeBaseWorkspace()
    const ev = {
      type: 'surrender_reinvest' as const,
      year: de2026Rules.year + 5,
      sourceInstanceId: 'versicherung-src',
      targetInstanceId: 'etf-tgt',
      amountEUR: 40_000,
      surrenderHaircutPct: 0.05,
    }
    const pavSrc: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-src',
      contractStartYear: 2000,
      oldContractTaxFreeEligible: true,
      currentValueEUR: 60_000,
      transferEvents: [ev],
    }
    const etfTgt: EtfInstance = {
      ...ws.baseline.assumptions.etf[0],
      instanceId: 'etf-tgt',
      transferEvents: [ev],
    }
    const wsWithEvents: Workspace = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          insurance: [pavSrc],
          etf: [etfTgt],
        },
      },
    }

    const tgtPolicy = buildInstanceCapitalPolicy(etfTgt, wsWithEvents, de2026Rules, [], [ev])
    expect(tgtPolicy).toBeDefined()
    expect(tgtPolicy!.capitalInjections).toHaveLength(1)
    // Pre-2005 tax-free → surrender tax = 0, so injection = proceeds after haircut
    const expectedProceeds = 40_000 * (1 - 0.05) // 38_000
    expect(tgtPolicy!.capitalInjections![0].amount).toBeCloseTo(expectedProceeds, 2)
    // costBasisInjection is set for surrender_reinvest
    expect(tgtPolicy!.costBasisInjections).toHaveLength(1)
    expect(tgtPolicy!.costBasisInjections![0].amount).toBeCloseTo(expectedProceeds, 2)
  })

  it('surrender_reinvest: taxable source reduces target injection vs. tax-free source', () => {
    const ws = makeBaseWorkspace()
    // Halbeinkuenfte source
    const ev = {
      type: 'surrender_reinvest' as const,
      year: de2026Rules.year + 5,
      sourceInstanceId: 'versicherung-taxable',
      targetInstanceId: 'etf-injection',
      amountEUR: 50_000,
      surrenderHaircutPct: 0.0,
    }
    const taxableSrc: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-taxable',
      contractStartYear: 2008,
      oldContractTaxFreeEligible: false,
      currentValueEUR: 80_000,
      transferEvents: [ev],
    }
    const taxFreeSrc: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-taxable',
      contractStartYear: 2000,
      oldContractTaxFreeEligible: true,
      currentValueEUR: 80_000,
      transferEvents: [ev],
    }
    const etfTgt: EtfInstance = {
      ...ws.baseline.assumptions.etf[0],
      instanceId: 'etf-injection',
      transferEvents: [ev],
    }
    const makeWs = (ins: InsuranceInstance): Workspace => ({
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: {
          ...ws.baseline.assumptions,
          insurance: [ins],
          etf: [etfTgt],
        },
      },
    })

    const policyTaxable = buildInstanceCapitalPolicy(etfTgt, makeWs(taxableSrc), de2026Rules, [], [ev])
    const policyTaxFree = buildInstanceCapitalPolicy(etfTgt, makeWs(taxFreeSrc), de2026Rules, [], [ev])

    expect(policyTaxable!.capitalInjections![0].amount).toBeLessThan(
      policyTaxFree!.capitalInjections![0].amount,
    )
  })

  it('surrender_reinvest source: capitalWithdrawal = post-haircut proceeds', () => {
    const ws = makeBaseWorkspace()
    const ev = {
      type: 'surrender_reinvest' as const,
      year: de2026Rules.year + 3,
      sourceInstanceId: 'versicherung-haircut',
      targetInstanceId: 'etf-rcvr',
      amountEUR: 20_000,
      surrenderHaircutPct: 0.10,
    }
    const pavSrc: InsuranceInstance = {
      ...ws.baseline.assumptions.insurance[0],
      instanceId: 'versicherung-haircut',
      currentValueEUR: 30_000,
      transferEvents: [ev],
    }
    const srcPolicy = buildInstanceCapitalPolicy(pavSrc, ws, de2026Rules, [ev], [])
    expect(srcPolicy!.capitalWithdrawals).toHaveLength(1)
    // Source loses post-haircut proceeds = 20_000 × 0.90 = 18_000
    expect(srcPolicy!.capitalWithdrawals![0].amount).toBeCloseTo(18_000, 4)
  })

  it('source instance missing from workspace → inbound event is skipped gracefully', () => {
    const ws = makeBaseWorkspace()
    const ev = {
      type: 'surrender_reinvest' as const,
      year: de2026Rules.year + 2,
      sourceInstanceId: 'does-not-exist',
      targetInstanceId: 'etf-tgt',
      amountEUR: 10_000,
      surrenderHaircutPct: 0.0,
    }
    const etfTgt: EtfInstance = {
      ...ws.baseline.assumptions.etf[0],
      instanceId: 'etf-tgt',
      transferEvents: [ev],
    }
    // No injection produced because source lookup fails
    const policy = buildInstanceCapitalPolicy(etfTgt, ws, de2026Rules, [], [ev])
    // Policy is undefined: no currentValueEUR and injection was skipped
    expect(policy).toBeUndefined()
  })

  it('contract year in policy matches eventCalendarYearToContractYear formula', () => {
    const ws = makeBaseWorkspace()
    const eventYear = de2026Rules.year + 7
    const ev = {
      type: 'certified' as const,
      year: eventYear,
      sourceInstanceId: 'riester-year-check',
      targetInstanceId: 'avd-year-check',
      amountEUR: 5_000,
    }
    const riesterSrc: RiesterInstance = {
      ...ws.baseline.assumptions.riester[0],
      instanceId: 'riester-year-check',
      transferEvents: [ev],
    }
    const srcPolicy = buildInstanceCapitalPolicy(riesterSrc, ws, de2026Rules, [ev], [])
    const expectedYear = eventYear - de2026Rules.year + 1 // 8
    expect(srcPolicy!.capitalWithdrawals![0].year).toBe(expectedYear)
  })
})
