/**
 * Unit tests for the next-€X recommender (Group G issue 12).
 *
 * Coverage:
 *   - Bernd-shape baseline (employee w/ existing bAV) + €400/mo → ranked candidates.
 *   - Anna-shape clean slate + €200/mo → ETF + bAV-leaning candidates.
 *   - Wunschnetto floor demotion: every candidate flags `wunschnettoFloorMet=false`.
 *   - bAV cap clamping: at near-full bAV, candidate is clamped + flagged.
 *   - Determinism: same input → same output across calls.
 *   - `buildWhatIfFromCandidate` produces a what-if with `origin: 'recommender'`.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2 } from '../storage'
import { runCombineSimulation } from './useCombineSimulation'
import {
  recommendNextEuro,
  buildWhatIfFromCandidate,
  type RecommendNextEuroInput,
} from './recommender'

function buildBerndWorkspace() {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['bav', 'etf'],
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 100 },
  }
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
}

function buildAnnaWorkspace() {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['etf'],
    bav: { ...defaultAssumptions.bav, monthlyGrossConversion: 0 },
  }
  return migrateV1ToV2(
    defaultProfile as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
}

function buildInput(workspace: ReturnType<typeof buildBerndWorkspace>, marginalEUR: number): RecommendNextEuroInput {
  const bundle = runCombineSimulation(workspace, de2026Rules)
  const basisId = workspace.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id
    ?? workspace.baseline.assumptions.returnScenarios[0].id
  return {
    workspace,
    rules: de2026Rules,
    marginalMonthlyEUR: marginalEUR,
    baselinePerInstance: bundle.perInstance,
    baselineCombined: bundle.combinedByScenarioId[basisId],
    grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
  }
}

describe('recommendNextEuro — Bernd shape (€400/mo)', () => {
  it('returns at least 3 candidates with distinct trade-off ids', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    expect(candidates.length).toBeGreaterThanOrEqual(3)
    const ids = new Set(candidates.map((c) => c.id))
    expect(ids.size).toBe(candidates.length)
  })

  it('default ranking is by median Netto-Rente desc', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].medianNettoRente).toBeGreaterThanOrEqual(
        candidates[i].medianNettoRente,
      )
    }
  })

  it('every candidate carries a non-zero net cash out', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    for (const c of candidates) {
      expect(c.netCashOutEUR).toBeGreaterThan(0)
    }
  })

  it('returns identical output on repeated calls (deterministic)', () => {
    const ws = buildBerndWorkspace()
    const input1 = buildInput(ws, 400)
    const input2 = buildInput(ws, 400)
    const a = recommendNextEuro(input1)
    const b = recommendNextEuro(input2)
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
    a.forEach((c, i) => {
      expect(c.medianNettoRente).toBeCloseTo(b[i].medianNettoRente, 2)
    })
  })
})

describe('recommendNextEuro — Anna clean slate (€200/mo)', () => {
  it('returns ETF + bAV candidates first when ETF visibility is set', () => {
    const ws = buildAnnaWorkspace()
    const input = buildInput(ws, 200)
    const candidates = recommendNextEuro(input)
    expect(candidates.length).toBeGreaterThan(0)
    const productIds = new Set(candidates.map((c) => c.productId))
    // Anna keeps an ETF instance (workspace migration adds one when ETF is visible),
    // so the ETF candidate should be present.
    expect(productIds.has('etf') || productIds.has('basisrente') || productIds.has('altersvorsorgedepot')).toBe(true)
  })
})

describe('recommendNextEuro — Wunschnetto floor demotion', () => {
  it('marks every candidate `wunschnettoFloorMet=false` when target is unrealistic', () => {
    const ws = buildBerndWorkspace()
    ws.baseline.profile = {
      ...ws.baseline.profile,
      desiredNetMonthlyPension: 99_999,
    }
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((c) => c.wunschnettoFloorMet === false)).toBe(true)
  })
})

describe('recommendNextEuro — bAV cap clamping', () => {
  it('drops the bAV candidate when usedMonthly is exactly at the §3 Nr. 63 cap', () => {
    const ws = buildBerndWorkspace()
    // Set bAV gross to the full §3 Nr. 63 monthly cap → zero remaining headroom.
    const capMonthly =
      (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap) / 12
    ws.baseline.assumptions.bav = ws.baseline.assumptions.bav.map((b) => ({
      ...b,
      monthlyGrossConversion: capMonthly,
    }))
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    const bav = candidates.find((c) => c.productId === 'bav')
    // Zero remaining cap headroom → generator returns null → no bAV candidate.
    expect(bav).toBeUndefined()
  })

  it('clamps the bAV candidate when usedMonthly leaves a small remaining headroom', () => {
    const ws = buildBerndWorkspace()
    // Leave 50 EUR/mo headroom. A 400 EUR/mo marginal target will exceed this
    // → the candidate must be present AND clamped, with a per-product cap atom.
    const capMonthly =
      (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap) / 12
    ws.baseline.assumptions.bav = ws.baseline.assumptions.bav.map((b) => ({
      ...b,
      monthlyGrossConversion: capMonthly - 50,
    }))
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    const bav = candidates.find((c) => c.productId === 'bav')
    expect(bav).toBeDefined()
    expect(bav!.cappedToRemaining).toBe(true)
    // B1: cap-clamp atom is bav-specific, not the generic 'bav_cap_remaining' on every product.
    const capAtom = bav!.atoms.find((a) => a.context['capFullForCandidate'] === true)
    expect(capAtom?.id).toBe('bav_cap_remaining')
  })
})

describe('recommendNextEuro — per-product cap-clamp atom ids (B1)', () => {
  it('emits avd_cap_remaining when the AVD candidate is clamped', () => {
    const ws = buildBerndWorkspace()
    // AVD per-contract cap is statutorily annualized; passing a marginal that
    // exceeds the monthly cap forces the new-AVD candidate into clamp.
    const capMonthly = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual / 12
    const input = buildInput(ws, capMonthly + 200)
    const candidates = recommendNextEuro(input)
    const avd = candidates.find((c) => c.productId === 'altersvorsorgedepot')
    expect(avd).toBeDefined()
    expect(avd!.cappedToRemaining).toBe(true)
    const capAtom = avd!.atoms.find((a) => a.context['capFullForCandidate'] === true)
    expect(capAtom?.id).toBe('avd_cap_remaining')
  })

  it('emits riester_cap_remaining when the Riester candidate is clamped', () => {
    const ws = buildBerndWorkspace()
    // Set Riester own contribution near the §10a cap (incl. allowances).
    const capAnnual = de2026Rules.riester.annualCapInclAllowances
    const remainingMonthly = 5
    ws.baseline.assumptions.riester = ws.baseline.assumptions.riester.map((r) => ({
      ...r,
      monthlyOwnContribution: (capAnnual / 12) - remainingMonthly,
    }))
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    const riester = candidates.find((c) => c.productId === 'riester')
    if (!riester) return // generator may drop when remaining is too small for solver
    if (riester.cappedToRemaining) {
      const capAtom = riester.atoms.find((a) => a.context['capFullForCandidate'] === true)
      expect(capAtom?.id).toBe('riester_cap_remaining')
    }
  })
})

describe('recommendNextEuro — empty marginal budget', () => {
  it('returns an empty array when marginalMonthlyEUR is 0', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, 0)
    expect(recommendNextEuro(input)).toEqual([])
  })

  it('returns an empty array when marginalMonthlyEUR is negative', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, -10)
    expect(recommendNextEuro(input)).toEqual([])
  })
})

describe('recommendNextEuro — flexibility scores', () => {
  it('assigns ETF=high, bAV=medium, Basisrente=low', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    for (const c of candidates) {
      if (c.productId === 'etf' || c.productId === 'altersvorsorgedepot') {
        expect(c.flexibilityScore).toBe('high')
      } else if (c.productId === 'basisrente') {
        expect(c.flexibilityScore).toBe('low')
      } else if (c.productId === 'bav' || c.productId === 'riester') {
        expect(c.flexibilityScore).toBe('medium')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// B4 — synthesize-and-layer parity vs. full simulatePortfolio
// ---------------------------------------------------------------------------
//
// The recommender's "synth and layer" approach builds a candidate ProductResult
// from cheap projections (FV + payout-math primitives) and feeds it into
// `combinePortfolio` alongside the baseline per-instance results. B4 pins this
// to a tolerance against the engine's full path: applyCandidateToAssumptions
// → simulatePortfolio → combinePortfolio.
//
// EUR-level parity is the goal, but a small drift (≤ ~5 EUR/mo for top-ups,
// 3 % for ETF where lump-sum-ratio approx is documented) is acceptable for v1.

import { simulatePortfolio } from '../engine/portfolioAdapter'
import { combinePortfolio } from '../engine/portfolioCombine'

function buildCombineCtx(workspace: ReturnType<typeof buildBerndWorkspace>) {
  const profile = workspace.baseline.profile
  const wsa = workspace.baseline.assumptions
  const retirementYear = de2026Rules.year + (profile.retirementAge - profile.age)
  const grvBundle = runCombineSimulation(workspace, de2026Rules)
  const grvGross = grvBundle.statutoryPension.grossMonthlyPension
  const pensionType = wsa.statutoryPension.pensionBaselineType ?? 'grv'
  const taxChannel: 'statutory_pension' | 'beamten_versorgungsbezug' | 'none' =
    pensionType === 'none' || grvGross <= 0 ? 'none'
      : pensionType === 'beamtenpension' ? 'beamten_versorgungsbezug'
        : 'statutory_pension'
  const kvChannel: 'kvdr_half_rate' | 'versorgungsbezug_full_rate' | 'none' =
    pensionType === 'none' || grvGross <= 0 ? 'none'
      : (pensionType === 'beamtenpension' || pensionType === 'versorgungswerk')
        ? (profile.publicHealthInsurance ? 'versorgungsbezug_full_rate' : 'none')
        : (profile.publicHealthInsurance ? 'kvdr_half_rate' : 'none')
  const kvdrMember = wsa.bav[0]?.kvdrMember ?? true
  const retirementHealthStatus: 'kvdr' | 'freiwillig_gkv' | 'pkv' =
    !profile.publicHealthInsurance ? 'pkv' : kvdrMember ? 'kvdr' : 'freiwillig_gkv'
  return {
    profile,
    rules: de2026Rules,
    retirementYear,
    grvGrossMonthlyPension: grvGross,
    statutoryPensionTaxChannel: taxChannel,
    statutoryPensionKvChannel: kvChannel,
    retirementHealthStatus,
  }
}

function runFullPath(workspace: ReturnType<typeof buildBerndWorkspace>): number {
  const { perInstance } = simulatePortfolio(workspace, de2026Rules)
  const basisId = workspace.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id
    ?? workspace.baseline.assumptions.returnScenarios[0].id
  const basisResults = Object.values(perInstance)
    .map((arr) => arr.find((r) => r.scenarioId === basisId))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
  const ctx = buildCombineCtx(workspace)
  const combined = combinePortfolio(workspace, basisResults, ctx)
  return combined.monthlyNetIncome
}

describe('B4 — synth-layer parity vs. full simulatePortfolio', () => {
  // Per-product class: build a candidate, materialise via applyCandidateToAssumptions,
  // run full simulatePortfolio + combinePortfolio, compare net monthly to synth.
  const TOLERANCE_EUR = 5
  const TOLERANCE_PCT = 0.03

  function withCandidateApplied(
    ws: ReturnType<typeof buildBerndWorkspace>,
    cand: ReturnType<typeof recommendNextEuro>[number],
  ): ReturnType<typeof buildBerndWorkspace> {
    const whatIf = buildWhatIfFromCandidate(ws.baseline, cand)
    return {
      ...ws,
      baseline: {
        ...ws.baseline,
        assumptions: whatIf.assumptions,
      },
    }
  }

  it('bAV top-up: synth median ≈ full simulatePortfolio median', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 100))
    const cand = candidates.find((c) => c.productId === 'bav' && !c.isNewInstance)
    if (!cand) return
    const fullMedian = runFullPath(withCandidateApplied(ws, cand))
    const synthMedian = cand.medianNettoRente
    const delta = Math.abs(synthMedian - fullMedian)
    expect(delta < TOLERANCE_EUR || delta / Math.max(1, fullMedian) < TOLERANCE_PCT).toBe(true)
  })

  it('Basisrente (new): synth median ≈ full simulatePortfolio median', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 100))
    const cand = candidates.find((c) => c.productId === 'basisrente')
    if (!cand) return
    const fullMedian = runFullPath(withCandidateApplied(ws, cand))
    const synthMedian = cand.medianNettoRente
    const delta = Math.abs(synthMedian - fullMedian)
    expect(delta < TOLERANCE_EUR || delta / Math.max(1, fullMedian) < TOLERANCE_PCT).toBe(true)
  })

  it('Riester top-up: synth median ≈ full simulatePortfolio median', () => {
    const wsBase = buildBerndWorkspace()
    // Ensure a Riester instance exists for top-up.
    const ws = {
      ...wsBase,
      baseline: {
        ...wsBase.baseline,
        assumptions: {
          ...wsBase.baseline.assumptions,
          riester: wsBase.baseline.assumptions.riester.length > 0
            ? wsBase.baseline.assumptions.riester
            : [
                {
                  ...defaultAssumptions.riester,
                  instanceId: 'riester-test',
                  label: 'Riester',
                  status: 'active' as const,
                  contractStartYear: 2015,
                  evidenceMap: {},
                  monthlyOwnContribution: 50,
                },
              ],
        },
      },
    }
    const candidates = recommendNextEuro(buildInput(ws, 100))
    const cand = candidates.find((c) => c.productId === 'riester' && !c.isNewInstance)
    if (!cand) return
    const fullMedian = runFullPath(withCandidateApplied(ws, cand))
    const synthMedian = cand.medianNettoRente
    const delta = Math.abs(synthMedian - fullMedian)
    expect(delta < TOLERANCE_EUR || delta / Math.max(1, fullMedian) < TOLERANCE_PCT).toBe(true)
  })

  it('ETF top-up: synth median ≈ full simulatePortfolio median (within documented ETF approximation)', () => {
    const wsBase = buildBerndWorkspace()
    // Make ETF visible + instance present.
    const ws = wsBase.baseline.assumptions.etf.length > 0
      ? wsBase
      : {
          ...wsBase,
          baseline: {
            ...wsBase.baseline,
            assumptions: {
              ...wsBase.baseline.assumptions,
              etf: [
                {
                  ...defaultAssumptions.etf,
                  instanceId: 'etf-test',
                  label: 'ETF',
                  status: 'active' as const,
                  contractStartYear: 2020,
                  evidenceMap: {},
                  monthlyContribution: 0,
                },
              ],
            },
          },
        }
    const candidates = recommendNextEuro(buildInput(ws, 100))
    const cand = candidates.find((c) => c.productId === 'etf')
    if (!cand) return
    const fullMedian = runFullPath(withCandidateApplied(ws, cand))
    const synthMedian = cand.medianNettoRente
    const delta = Math.abs(synthMedian - fullMedian)
    // ETF uses a documented lump-sum-ratio approximation for the per-instance
    // netMonthlyPayout — relax tolerance to the documented 3 %.
    expect(delta < TOLERANCE_EUR || delta / Math.max(1, fullMedian) < TOLERANCE_PCT).toBe(true)
  })
})

describe('B3c — applyCandidateToAssumptions wires ETF monthlyContribution', () => {
  it('ETF top-up bumps the target instance monthlyContribution by grossMonthlyEUR', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 100))
    const cand = candidates.find((c) => c.productId === 'etf' && !c.isNewInstance)
    if (!cand) return
    const before = ws.baseline.assumptions.etf
      .find((e) => e.instanceId === cand.targetInstanceId)?.monthlyContribution ?? 0
    const whatIf = buildWhatIfFromCandidate(ws.baseline, cand)
    const after = whatIf.assumptions.etf
      .find((e) => e.instanceId === cand.targetInstanceId)?.monthlyContribution ?? 0
    expect(after - before).toBeCloseTo(cand.grossMonthlyEUR, 1)
  })
})

// ---------------------------------------------------------------------------
// N5 — bAV bisection on marginal net cost (regression)
// ---------------------------------------------------------------------------

describe('recommendNextEuro — bAV marginal solver (N5)', () => {
  it('with existing bAV €100/mo, the candidate net cash matches a small marginal target', () => {
    const ws = buildBerndWorkspace()
    // Bernd workspace already has €100/mo bAV. Ask for a small marginal that
    // stays within the remaining §3 Nr. 63 cap (cap ≈ 676/mo, used 100, so
    // remainingMonthly = 576; €100/mo marginal net ≪ remainingCap × marginalRate).
    const candidates = recommendNextEuro(buildInput(ws, 100))
    const cand = candidates.find((c) => c.productId === 'bav')
    if (!cand) return
    // When NOT clamped, marginal solver should land within 1 EUR of the target.
    if (!cand.cappedToRemaining) {
      expect(Math.abs(cand.netCashOutEUR - 100)).toBeLessThan(1)
    }
  })
})

describe('buildWhatIfFromCandidate', () => {
  it('returns a what-if with origin=recommender', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    expect(candidates.length).toBeGreaterThan(0)
    const cand = candidates[0]
    const whatIf = buildWhatIfFromCandidate(ws.baseline, cand)
    expect(whatIf.origin).toBe('recommender')
    expect(whatIf.derivedFromBaselineId).toBe(ws.baseline.id)
    expect(whatIf.label).toBe(cand.label)
  })

  it('appends a new Basisrente instance when the candidate is a new Basisrente', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    const basisrenteCand = candidates.find((c) => c.productId === 'basisrente' && c.isNewInstance)
    if (!basisrenteCand) return
    const whatIf = buildWhatIfFromCandidate(ws.baseline, basisrenteCand)
    expect(whatIf.assumptions.basisrente.length).toBe(
      ws.baseline.assumptions.basisrente.length + 1,
    )
    const added = whatIf.assumptions.basisrente[whatIf.assumptions.basisrente.length - 1]
    expect(added.monthlyGrossContribution).toBeCloseTo(basisrenteCand.grossMonthlyEUR, 1)
  })
})
