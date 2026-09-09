/**
 * Constrained property tests for portfolioTransfer.ts (issue #378).
 *
 * Complements `portfolioTransfer.test.ts` with generated properties. Generators
 * are constrained to the documented domain: events carry positive finite
 * amounts, haircut percentages in [0, 1], calendar years that map onto the
 * projection horizon; sources are surrender-capable product slots (ETF is
 * rejected for surrender_reinvest by the validator, Basisrente by law).
 * Out-of-domain shapes are covered deterministically in the boundary matrix.
 *
 * Properties under test:
 *   T1. Calendar-year → contract-year conversion matches its documented model
 *       (clamp at 1, identity above the rules year).
 *   T2. Event routing: each dual-stored event surfaces exactly once as an
 *       outbound entry of its source and once as an inbound entry of its
 *       target — no double counting, no cross-bucket leakage.
 *   T3. Certified transfers are tax-neutral: what leaves the source equals
 *       what arrives at the target (no haircut, no tax, no basis injection).
 *   T4. Surrender transfers conserve value across the explicitly modelled
 *       deductions: withdrawal = amount × (1 − haircut) on the source; on the
 *       target, injection = proceeds − surrenderTax with the same tax the
 *       surrender helper computes, and the target's cost basis mirrors the
 *       injection entry-for-entry (no double-counted basis).
 *   T5. Policy construction is deterministic and collapses to the documented
 *       degenerate shapes (no capital + no events → undefined policy).
 *
 * All `fc.assert` calls derive seed and run count from `propertyRunParams`
 * (`src/utils/propertyRunConfig.ts`): fixed seed base 378 and authored counts
 * by default, so CI failures are reproducible; PROPERTY_RUNS_MULTIPLIER /
 * PROPERTY_SEED scale the same properties for scheduled sweeps.
 */

import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import fc from 'fast-check'
import { propertyRunParams } from '../utils/propertyRunConfig'
import { de2026Rules } from '../rules/de2026'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { migrateV1ToV2 } from '../storage'
import {
  buildInstanceCapitalPolicy,
  collectTransferEvents,
  computeSurrenderTax,
  eventCalendarYearToContractYear,
  type AnyInstance,
} from './portfolioTransfer'
import type {
  AltersvorsorgedepotInstance,
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
  TransferEvent,
} from '../domain/instances'
import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RULES_YEAR = de2026Rules.year

function closeTo(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))
}

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

/** Surrender-capable source slots. Basisrente is legally non-surrenderable and
 *  ETF surrender_reinvest is rejected by the validator, so both stay out of the
 *  generated domain (they are pinned deterministically elsewhere). */
const SURRENDER_SOURCE_SLOTS = [
  'bav',
  'versicherung',
  'riester',
  'altersvorsorgedepot',
] as const

type SourceSlot = (typeof SURRENDER_SOURCE_SLOTS)[number]

/**
 * Keys of `WorkspaceAssumptionsV2` that hold product instance arrays — derived
 * from the type, so the scalar/scenario keys (`statutoryPension`,
 * `returnScenarios`, …) are excluded by construction.
 */
type ProductArrayKey = {
  [K in keyof WorkspaceAssumptionsV2]-?: WorkspaceAssumptionsV2[K] extends AnyInstance[] ? K : never
}[keyof WorkspaceAssumptionsV2]

const sourceSlotByInstance: Record<SourceSlot, ProductArrayKey> = {
  bav: 'bav',
  versicherung: 'insurance',
  riester: 'riester',
  altersvorsorgedepot: 'altersvorsorgedepot',
}

function makeInstance(id: string, slot: SourceSlot, currentValueEUR?: number): AnyInstance {
  const wsa = makeBaseWorkspace().baseline.assumptions
  const base = wsa[sourceSlotByInstance[slot]][0]
  return {
    ...base,
    instanceId: id,
    label: id,
    status: 'active',
    transferEvents: undefined,
    evidenceMap: {},
    ...(currentValueEUR !== undefined ? { currentValueEUR } : {}),
  }
}

function makeTargetEtf(id: string, currentValueEUR?: number): EtfInstance {
  const base = makeBaseWorkspace().baseline.assumptions.etf[0]
  return {
    ...base,
    instanceId: id,
    label: id,
    status: 'active',
    transferEvents: undefined,
    evidenceMap: {},
    ...(currentValueEUR !== undefined ? { currentValueEUR } : {}),
  }
}

/** Workspace containing the given source (in its product array) + ETF target so
 *  `findInstanceById` resolves for the surrender-tax path. */
function makeTransferWorkspace(source: AnyInstance, target: AnyInstance, sourceSlot: SourceSlot): Workspace {
  const ws = makeBaseWorkspace()
  const wsa = ws.baseline.assumptions
  return {
    ...ws,
    baseline: {
      ...ws.baseline,
      assumptions: {
        ...wsa,
        [sourceSlotByInstance[sourceSlot]]: [source],
        etf: [target as EtfInstance],
      } as WorkspaceAssumptionsV2,
    },
  }
}

// ---------------------------------------------------------------------------
// T1 — calendar-year conversion (model-based)
// ---------------------------------------------------------------------------

describe('eventCalendarYearToContractYear — generated model property', () => {
  it('T1: clamps to contract year 1 below the rules year and is linear above it', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1990, max: 2100 }),
        fc.integer({ min: 2024, max: 2032 }),
        (eventYear, rulesYear) => {
          const contractYear = eventCalendarYearToContractYear(eventYear, rulesYear)
          // Model: max(1, eventYear − rulesYear + 1).
          expect(contractYear).toBe(Math.max(1, eventYear - rulesYear + 1))
          expect(contractYear).toBeGreaterThanOrEqual(1)
          if (eventYear >= rulesYear) {
            expect(contractYear).toBe(eventYear - rulesYear + 1)
          } else {
            expect(contractYear).toBe(1)
          }
        },
      ),
      propertyRunParams(500, 0),
    )
  })
})

// ---------------------------------------------------------------------------
// T2 — collectTransferEvents routing
// ---------------------------------------------------------------------------

describe('collectTransferEvents — generated routing property', () => {
  const poolIds = ['bav-a', 'bav-b', 'etf-a', 'etf-b'] as const
  type PoolId = (typeof poolIds)[number]

  const eventsArb = fc
    .array(
      fc.record({
        type: fc.constantFrom('certified', 'surrender_reinvest'),
        year: fc.integer({ min: RULES_YEAR - 2, max: RULES_YEAR + 30 }),
        sourceInstanceId: fc.constantFrom<PoolId>(...poolIds),
        targetInstanceId: fc.constantFrom<PoolId>(...poolIds),
        amountEUR: fc.integer({ min: 1, max: 250_000 }),
        surrenderHaircutPct: fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1 }),
      }),
      { minLength: 1, maxLength: 4 },
    )
    // Exclude self-transfers (never produced upstream; the routing contract is
    // about distinct source/target pairs).
    .filter((events) => events.every((ev) => ev.sourceInstanceId !== ev.targetInstanceId))

  /** Dual-store every event on its source and target instance (production backfill shape). */
  function wsaWithEvents(events: TransferEvent[]): WorkspaceAssumptionsV2 {
    const ws = makeBaseWorkspace()
    const wsa = ws.baseline.assumptions
    const byId = new Map<string, AnyInstance>()
    for (const id of poolIds) {
      const isBav = id.startsWith('bav')
      const base = isBav ? wsa.bav[0] : wsa.etf[0]
      byId.set(id, {
        ...base,
        instanceId: id,
        label: id,
        status: 'active',
        evidenceMap: {},
        transferEvents: [],
      } as AnyInstance)
    }
    for (const ev of events) {
      ;(byId.get(ev.sourceInstanceId)!.transferEvents as TransferEvent[]).push(ev)
      ;(byId.get(ev.targetInstanceId)!.transferEvents as TransferEvent[]).push(ev)
    }
    return {
      ...wsa,
      bav: [...byId.values()].filter((i) => i.instanceId.startsWith('bav')) as BavInstance[],
      etf: [...byId.values()].filter((i) => i.instanceId.startsWith('etf')) as EtfInstance[],
    }
  }

  it('T2: every dual-stored event surfaces exactly once per bucket, never in the wrong bucket', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fc.assert(
      fc.property(eventsArb, (events) => {
        const wsa = wsaWithEvents(events)
        const { outboundBy, inboundBy } = collectTransferEvents(wsa)

        // No malformed warnings: every event matches its host instance.
        expect(warnSpy).not.toHaveBeenCalled()

        // Each event: exactly one outbound entry at its source, one inbound at
        // its target, and nothing in the opposite buckets.
        for (const ev of events) {
          const outbound = outboundBy.get(ev.sourceInstanceId) ?? []
          expect(outbound.filter((e) => e === ev)).toHaveLength(1)
          expect(inboundBy.get(ev.sourceInstanceId) ?? []).not.toContain(ev)

          const inbound = inboundBy.get(ev.targetInstanceId) ?? []
          expect(inbound.filter((e) => e === ev)).toHaveLength(1)
          expect(outboundBy.get(ev.targetInstanceId) ?? []).not.toContain(ev)
        }

        // Bucket totals match the event count exactly (no double counting).
        const totalOutbound = [...outboundBy.values()].reduce((s, xs) => s + xs.length, 0)
        const totalInbound = [...inboundBy.values()].reduce((s, xs) => s + xs.length, 0)
        expect(totalOutbound).toBe(events.length)
        expect(totalInbound).toBe(events.length)
      }),
      propertyRunParams(200, 1),
    )
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// T3/T4 — buildInstanceCapitalPolicy conservation (model-based)
// ---------------------------------------------------------------------------

const transferYearArb = fc.integer({ min: RULES_YEAR, max: RULES_YEAR + 25 })
const amountArb = fc.integer({ min: 1, max: 200_000 })
const haircutArb = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1 })

describe('buildInstanceCapitalPolicy — generated conservation properties', () => {
  let warnSpy: MockInstance

  beforeEach(() => {
    // DEV-mode warnings for amounts above currentValue are expected in generated runs.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('T3: certified transfers are tax-neutral — source loses exactly what the target gains', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ year: transferYearArb, amountEUR: amountArb }), { minLength: 1, maxLength: 4 }),
        amountArb,
        (events, currentValue) => {
          const source = makeInstance('src-bav', 'bav', currentValue)
          const target = makeTargetEtf('tgt-etf', 0)
          const ws = makeTransferWorkspace(source, target, 'bav')
          const transferEvents: TransferEvent[] = events.map((ev) => ({
            type: 'certified',
            year: ev.year,
            sourceInstanceId: 'src-bav',
            targetInstanceId: 'tgt-etf',
            amountEUR: ev.amountEUR,
          }))

          const sourcePolicy = buildInstanceCapitalPolicy(source, ws, de2026Rules, transferEvents, [])
          expect(sourcePolicy).toBeDefined()
          const withdrawals = sourcePolicy!.capitalWithdrawals ?? []
          expect(withdrawals).toHaveLength(transferEvents.length)
          for (const [i, ev] of transferEvents.entries()) {
            expect(withdrawals[i].year).toBe(eventCalendarYearToContractYear(ev.year, RULES_YEAR))
            expect(withdrawals[i].amount).toBe(ev.amountEUR)
          }
          // Starting capital comes solely from currentValueEUR.
          expect(sourcePolicy!.initialCapital).toBe(currentValue)
          expect(sourcePolicy!.capitalInjections).toBeUndefined()
          expect(sourcePolicy!.costBasisInjections).toBeUndefined()

          const targetPolicy = buildInstanceCapitalPolicy(target, ws, de2026Rules, [], transferEvents)
          const injections = targetPolicy!.capitalInjections ?? []
          // Tax-neutral: the target gains exactly what the source loses.
          expect(injections).toHaveLength(transferEvents.length)
          expect(injections.reduce((s, w) => s + w.amount, 0)).toBe(
            withdrawals.reduce((s, w) => s + w.amount, 0),
          )
          // Certified transfers carry no cost-basis injection (basis unchanged).
          expect(targetPolicy!.costBasisInjections).toBeUndefined()
        },
      ),
      propertyRunParams(150, 2),
    )
  })

  it('T4: surrender transfers conserve value across the modelled haircut and surrender tax', () => {
    fc.assert(
      fc.property(
        fc.record({
          slot: fc.constantFrom<SourceSlot>(...SURRENDER_SOURCE_SLOTS),
          year: transferYearArb,
          amountEUR: amountArb,
          surrenderHaircutPct: haircutArb,
        }),
        fc.record({ currentValue: amountArb, targetStart: amountArb }),
        (ev, capital) => {
          const source = makeInstance('src', ev.slot, capital.currentValue)
          const target = makeTargetEtf('tgt', capital.targetStart)
          const ws = makeTransferWorkspace(source, target, ev.slot)
          const event: TransferEvent = {
            type: 'surrender_reinvest',
            year: ev.year,
            sourceInstanceId: 'src',
            targetInstanceId: 'tgt',
            amountEUR: ev.amountEUR,
            surrenderHaircutPct: ev.surrenderHaircutPct,
          }

          // Source model: withdrawal = proceeds = amount × (1 − haircut).
          const proceeds = ev.amountEUR * (1 - ev.surrenderHaircutPct)
          const sourcePolicy = buildInstanceCapitalPolicy(source, ws, de2026Rules, [event], [])
          expect(sourcePolicy).toBeDefined()
          const withdrawals = sourcePolicy!.capitalWithdrawals ?? []
          expect(withdrawals).toHaveLength(1)
          expect(closeTo(withdrawals[0].amount, proceeds)).toBe(true)
          expect(withdrawals[0].year).toBe(eventCalendarYearToContractYear(ev.year, RULES_YEAR))

          // Target model: injection = proceeds − surrenderTax, basis mirrors injection.
          const expectedTax = computeSurrenderTax(source, proceeds, ws, de2026Rules, ev.year)
          expect(expectedTax).toBeGreaterThanOrEqual(0)
          const targetPolicy = buildInstanceCapitalPolicy(target, ws, de2026Rules, [], [event])
          expect(targetPolicy).toBeDefined()
          const injections = targetPolicy!.capitalInjections ?? []
          const basisInjections = targetPolicy!.costBasisInjections ?? []
          expect(injections).toHaveLength(1)
          expect(basisInjections).toHaveLength(1)
          const expectedInjection = Math.max(0, proceeds - expectedTax)
          expect(closeTo(injections[0].amount, expectedInjection)).toBe(true)
          // Conservation identity: injection + explicitly modelled tax = proceeds.
          expect(closeTo(injections[0].amount + expectedTax, proceeds)).toBe(true)
          // Cost basis is injected once, not double-counted.
          expect(closeTo(basisInjections[0].amount, injections[0].amount)).toBe(true)
          expect(basisInjections[0].year).toBe(injections[0].year)
        },
      ),
      propertyRunParams(200, 3),
    )
  })

  it('T5: policy construction is deterministic for identical inputs', () => {
    fc.assert(
      fc.property(
        fc.record({ slot: fc.constantFrom<SourceSlot>(...SURRENDER_SOURCE_SLOTS), year: transferYearArb, amountEUR: amountArb, surrenderHaircutPct: haircutArb }),
        (ev) => {
          const source = makeInstance('src', ev.slot, 10_000)
          const target = makeTargetEtf('tgt', 0)
          const ws = makeTransferWorkspace(source, target, ev.slot)
          const event: TransferEvent = {
            type: 'surrender_reinvest',
            year: ev.year,
            sourceInstanceId: 'src',
            targetInstanceId: 'tgt',
            amountEUR: ev.amountEUR,
            surrenderHaircutPct: ev.surrenderHaircutPct,
          }
          const first = buildInstanceCapitalPolicy(target, ws, de2026Rules, [], [event])
          const second = buildInstanceCapitalPolicy(target, ws, de2026Rules, [], [event])
          expect(second).toStrictEqual(first)
        },
      ),
      propertyRunParams(60, 4),
    )
  })
})

// ---------------------------------------------------------------------------
// Deterministic boundary matrix — clamping, degenerate haircuts, empty policies
// ---------------------------------------------------------------------------

describe('buildInstanceCapitalPolicy — boundary matrix (deterministic)', () => {
  let warnSpy: MockInstance
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  function certifiedEvent(year: number, amountEUR: number): TransferEvent {
    return {
      type: 'certified',
      year,
      sourceInstanceId: 'src',
      targetInstanceId: 'tgt',
      amountEUR,
    }
  }

  it('event in the rules year and events in the past both land on contract year 1', () => {
    const source = makeInstance('src', 'bav', 0)
    const target = makeTargetEtf('tgt', 0)
    const ws = makeTransferWorkspace(source, target, 'bav')
    const policy = buildInstanceCapitalPolicy(
      source,
      ws,
      de2026Rules,
      [certifiedEvent(RULES_YEAR, 1_000), certifiedEvent(RULES_YEAR - 5, 2_000)],
      [],
    )
    expect(policy!.capitalWithdrawals).toEqual([
      { year: 1, amount: 1_000 },
      { year: 1, amount: 2_000 },
    ])
  })

  it('haircut 0 moves the full amount; haircut 1 moves nothing', () => {
    const source = makeInstance('src', 'bav', 50_000)
    const target = makeTargetEtf('tgt', 0)
    const ws = makeTransferWorkspace(source, target, 'bav')
    const base = { year: RULES_YEAR + 2, sourceInstanceId: 'src', targetInstanceId: 'tgt' }

    const full = buildInstanceCapitalPolicy(
      source,
      ws,
      de2026Rules,
      [{ ...base, type: 'surrender_reinvest', amountEUR: 20_000, surrenderHaircutPct: 0 }],
      [],
    )
    expect(full!.capitalWithdrawals).toEqual([{ year: 3, amount: 20_000 }])

    const empty = buildInstanceCapitalPolicy(
      source,
      ws,
      de2026Rules,
      [{ ...base, type: 'surrender_reinvest', amountEUR: 20_000, surrenderHaircutPct: 1 }],
      [],
    )
    expect(empty!.capitalWithdrawals).toEqual([{ year: 3, amount: 0 }])
    // Proceeds of 0 short-circuit the surrender-tax path — nothing arrives.
    const targetPolicy = buildInstanceCapitalPolicy(
      target,
      ws,
      de2026Rules,
      [],
      [{ ...base, type: 'surrender_reinvest', amountEUR: 20_000, surrenderHaircutPct: 1 }],
    )
    const injections = targetPolicy!.capitalInjections ?? []
    expect(injections).toEqual([{ year: 3, amount: 0 }])
  })

  it('currentValueEUR alone yields an initialCapital-only policy; nothing at all yields undefined', () => {
    const ws = makeBaseWorkspace()
    const withCapital = makeInstance('solo', 'bav', 12_345)
    expect(buildInstanceCapitalPolicy(withCapital, ws, de2026Rules, [], [])).toEqual({
      initialCapital: 12_345,
    })

    const bare = makeInstance('bare', 'bav', 0)
    expect(buildInstanceCapitalPolicy(bare, ws, de2026Rules, [], [])).toBeUndefined()
  })

  it('AVD/Riester legacy capital paths are respected — no initialCapital, so no double-apply', () => {
    const ws = makeBaseWorkspace()
    const avd = makeInstance('avd-solo', 'altersvorsorgedepot', 9_000) as AltersvorsorgedepotInstance
    const riester = makeInstance('riester-solo', 'riester', 7_000) as RiesterInstance
    expect(buildInstanceCapitalPolicy(avd, ws, de2026Rules, [], [])).toBeUndefined()
    expect(buildInstanceCapitalPolicy(riester, ws, de2026Rules, [], [])).toBeUndefined()
  })

  it('a private-insurance source with a pre-2005-style tax-free contract surrenders tax-free', () => {
    const ws = makeBaseWorkspace()
    const ins = makeInstance('ins-src', 'versicherung', 30_000) as InsuranceInstance
    // Force the tax-free short-circuit: contract started before 2005.
    const pre2005 = { ...ins, contractStartYear: 1998, oldContractTaxFreeEligible: true }
    const wsPre2005 = {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: { ...ws.baseline.assumptions, insurance: [pre2005] },
      },
    }
    const tax = computeSurrenderTax(pre2005, 25_000, wsPre2005, de2026Rules, RULES_YEAR + 4)
    expect(tax).toBe(0)
  })
})
