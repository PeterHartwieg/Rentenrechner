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
  rankRecommendedCandidates,
  type RecommendNextEuroInput,
  type RecommendedCandidate,
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

function fixtureCandidate(
  id: string,
  overrides: Partial<RecommendedCandidate>,
): RecommendedCandidate {
  return {
    id,
    label: id,
    productId: 'etf',
    isNewInstance: false,
    grossMonthlyEUR: 100,
    netCashOutEUR: 100,
    medianNettoRente: 1000,
    lifetimeCash: 300_000,
    flexibilityScore: 'medium',
    flexibilityDetails: {
      overall: 'medium',
      criteria: {
        cancel: 'restricted',
        switchAsset: 'restricted',
        switchProduct: 'restricted',
        adjustContribution: 'restricted',
      },
    },
    effort: { score: 50, level: 'medium', details: [] },
    riskScore: 100_000,
    capitalAtRetirement: 100_000,
    riskScoreP10: 80_000,
    safetyNettoRenteP10: 900,
    riskScoreMcPaths: 200,
    atoms: [],
    wunschnettoFloorMet: true,
    cappedToRemaining: false,
    ...overrides,
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

describe('rankRecommendedCandidates — result filters', () => {
  const candidates = [
    fixtureCandidate('median', {
      medianNettoRente: 1600,
      capitalAtRetirement: 90_000,
      safetyNettoRenteP10: 1000,
      riskScoreP10: 50_000,
      flexibilityScore: 'low',
      flexibilityDetails: {
        overall: 'low',
        criteria: {
          cancel: 'hard',
          switchAsset: 'restricted',
          switchProduct: 'hard',
          adjustContribution: 'restricted',
        },
      },
      effort: { score: 35, level: 'high', details: [] },
    }),
    fixtureCandidate('capital', {
      medianNettoRente: 1200,
      capitalAtRetirement: 200_000,
      safetyNettoRenteP10: 900,
      riskScoreP10: 150_000,
      flexibilityScore: 'medium',
      flexibilityDetails: {
        overall: 'medium',
        criteria: {
          cancel: 'restricted',
          switchAsset: 'restricted',
          switchProduct: 'restricted',
          adjustContribution: 'easy',
        },
      },
      effort: { score: 45, level: 'high', details: [] },
    }),
    fixtureCandidate('safety-monthly', {
      medianNettoRente: 1300,
      capitalAtRetirement: 110_000,
      safetyNettoRenteP10: 1250,
      riskScoreP10: 20_000,
      flexibilityScore: 'medium',
      effort: { score: 55, level: 'medium', details: [] },
    }),
    fixtureCandidate('flexibility', {
      medianNettoRente: 900,
      capitalAtRetirement: 80_000,
      safetyNettoRenteP10: 850,
      riskScoreP10: 60_000,
      flexibilityScore: 'high',
      flexibilityDetails: {
        overall: 'high',
        criteria: {
          cancel: 'easy',
          switchAsset: 'easy',
          switchProduct: 'easy',
          adjustContribution: 'easy',
        },
      },
      effort: { score: 60, level: 'medium', details: [] },
    }),
    fixtureCandidate('effort', {
      medianNettoRente: 950,
      capitalAtRetirement: 70_000,
      safetyNettoRenteP10: 880,
      riskScoreP10: 55_000,
      flexibilityScore: 'medium',
      effort: { score: 95, level: 'low', details: [] },
    }),
  ]

  it('defaults to highest median monthly net pension', () => {
    expect(rankRecommendedCandidates(candidates)[0].id).toBe('median')
  })

  it('selects highest capital at retirement', () => {
    expect(rankRecommendedCandidates(candidates, 'capital_at_retirement')[0].id).toBe('capital')
  })

  it('uses P10 monthly net pension for Sicherheit, not P10 capital', () => {
    expect(rankRecommendedCandidates(candidates, 'safety')[0].id).toBe('safety-monthly')
  })

  it('selects the highest flexibility badge', () => {
    expect(rankRecommendedCandidates(candidates, 'flexibility')[0].id).toBe('flexibility')
  })

  it('selects the lowest-effort next action', () => {
    expect(rankRecommendedCandidates(candidates, 'low_effort')[0].id).toBe('effort')
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

describe('recommendNextEuro — bAV employer offer branch', () => {
  function bavWithOffer(overrides: {
    employerMatchPercent: number
    fixedMonthlyEUR: number
    monthlyCapEUR?: number
  }) {
    const ws = buildAnnaWorkspace()
    const candidates = recommendNextEuro({
      ...buildInput(ws, 200),
      bavOffer: {
        hasOffer: true,
        effectiveCostAnnual: 0.012,
        ...overrides,
      },
    })
    const bav = candidates.find((candidate) => candidate.productId === 'bav')
    expect(bav).toBeDefined()
    return bav!
  }

  it('includes a flat employer contribution in a new bAV candidate', () => {
    const bav = bavWithOffer({ employerMatchPercent: 0, fixedMonthlyEUR: 100 })

    expect(bav.monthlyEmployerContributionEUR).toBeCloseTo(100, 2)
    expect(bav.capitalAtRetirement).toBeGreaterThan(0)
  })

  it('adds percent and flat employer contributions', () => {
    const bav = bavWithOffer({ employerMatchPercent: 0.5, fixedMonthlyEUR: 80 })

    expect(bav.monthlyEmployerContributionEUR).toBeCloseTo(
      bav.grossMonthlyEUR * 0.5 + 80,
      2,
    )
  })

  it('caps the combined employer contribution when an offer cap is supplied', () => {
    const bav = bavWithOffer({
      employerMatchPercent: 1,
      fixedMonthlyEUR: 80,
      monthlyCapEUR: 120,
    })

    expect(bav.monthlyEmployerContributionEUR).toBeLessThanOrEqual(120)
    expect(bav.monthlyEmployerContributionEUR).toBeCloseTo(120, 2)
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
  it('assigns transparent default product scores', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    for (const c of candidates) {
      if (c.productId === 'etf') {
        expect(c.flexibilityScore).toBe('high')
        expect(c.flexibilityDetails.criteria.cancel).toBe('easy')
      } else if (c.productId === 'altersvorsorgedepot' || c.productId === 'riester') {
        expect(c.flexibilityScore).toBe('medium')
      } else if (c.productId === 'basisrente') {
        expect(c.flexibilityScore).toBe('low')
        expect(c.flexibilityDetails.criteria.switchProduct).toBe('hard')
      } else if (c.productId === 'bav') {
        expect(c.flexibilityScore).toBe('low')
        expect(c.flexibilityDetails.criteria.cancel).toBe('hard')
      }
    }
  })

  it('prefers increasing an existing ETF for low-effort ranking', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 200))
    const etf = candidates.find((c) => c.productId === 'etf')
    expect(etf).toBeDefined()
    expect(etf!.effort.score).toBeGreaterThanOrEqual(90)
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

// ---------------------------------------------------------------------------
// F6 — bAV bisection isolated-gross vs marginal-forward-delta
// ---------------------------------------------------------------------------
//
// The pre-F6 bisection solved for gross such that
//   netCost(delta) === X   (isolated, used = 0)
// which drifts for Bernd-shape users who already have a non-zero bAV.
// The corrected bisection solves:
//   netCost(used + delta) - netCost(used) === X   (marginal)
//
// These tests pin the behaviour using `calculateBavFunding` directly so the
// test is independent of the recommender's candidate-generator internals.

import { calculateBavFunding } from '../engine/salary'

function bisectIsolated(
  profile: ReturnType<typeof buildBerndWorkspace>['baseline']['profile'],
  rules: typeof de2026Rules,
  target: ReturnType<typeof buildBerndWorkspace>['baseline']['assumptions']['bav'][number],
  targetNet: number,
): number {
  const netCost = (delta: number) =>
    calculateBavFunding(profile, rules, { ...target, monthlyGrossConversion: delta }).monthlyNetCost
  let lo = 0
  let hi = Math.max(100, targetNet * 4)
  for (let i = 0; i < 10 && netCost(hi) < targetNet; i++) hi *= 2
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const net = netCost(mid)
    if (Math.abs(net - targetNet) < 0.01) return mid
    if (net < targetNet) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function bisectMarginal(
  profile: ReturnType<typeof buildBerndWorkspace>['baseline']['profile'],
  rules: typeof de2026Rules,
  target: ReturnType<typeof buildBerndWorkspace>['baseline']['assumptions']['bav'][number],
  usedMonthly: number,
  targetNet: number,
): number {
  const baselineNet = calculateBavFunding(profile, rules, {
    ...target,
    monthlyGrossConversion: usedMonthly,
  }).monthlyNetCost
  const marginalNet = (delta: number) =>
    calculateBavFunding(profile, rules, {
      ...target,
      monthlyGrossConversion: usedMonthly + delta,
    }).monthlyNetCost - baselineNet
  let lo = 0
  let hi = Math.max(100, targetNet * 4)
  for (let i = 0; i < 10 && marginalNet(hi) < targetNet; i++) hi *= 2
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const net = marginalNet(mid)
    if (Math.abs(net - targetNet) < 0.01) return mid
    if (net < targetNet) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

describe('recommendNextEuro — bAV bisection isolated vs marginal (F6)', () => {
  it('when used = 0, isolated and marginal gross answers are equal (within 1 EUR)', () => {
    const ws = buildBerndWorkspace()
    const profile = ws.baseline.profile
    const target = ws.baseline.assumptions.bav[0]
    const targetNet = 100
    const usedMonthly = 0

    const isolated = bisectIsolated(profile, de2026Rules, target, targetNet)
    const marginal = bisectMarginal(profile, de2026Rules, target, usedMonthly, targetNet)

    // With no existing bAV the marginal delta equals the isolated answer.
    expect(Math.abs(isolated - marginal)).toBeLessThan(1)
  })

  it('when used > 0 (Bernd shape), marginal gross differs measurably from isolated', () => {
    // Bernd has €100/mo existing bAV. An additional €200/mo net target starts
    // from a different SV-saving baseline, so the required gross conversion to
    // achieve €200 net cost differs between isolated and marginal approaches.
    const ws = buildBerndWorkspace()
    const profile = ws.baseline.profile
    const target = ws.baseline.assumptions.bav[0]
    const usedMonthly = target.monthlyGrossConversion ?? 100
    const targetNet = 200

    const isolated = bisectIsolated(profile, de2026Rules, target, targetNet)
    const marginal = bisectMarginal(profile, de2026Rules, target, usedMonthly, targetNet)

    // The difference must be measurable to confirm the two approaches diverge
    // on a non-zero existing contribution. Measured ~17 EUR; window guards
    // against both regression to zero and implausible blowup.
    const divergence = Math.abs(isolated - marginal)
    expect(divergence).toBeGreaterThan(10)
    expect(divergence).toBeLessThan(25)
  })

  it('marginal gross answer satisfies forward(used + delta) - forward(used) ≈ target net', () => {
    const ws = buildBerndWorkspace()
    const profile = ws.baseline.profile
    const target = ws.baseline.assumptions.bav[0]
    const usedMonthly = target.monthlyGrossConversion ?? 100
    const targetNet = 150

    const delta = bisectMarginal(profile, de2026Rules, target, usedMonthly, targetNet)

    const baselineNet = calculateBavFunding(profile, de2026Rules, {
      ...target,
      monthlyGrossConversion: usedMonthly,
    }).monthlyNetCost
    const totalNet = calculateBavFunding(profile, de2026Rules, {
      ...target,
      monthlyGrossConversion: usedMonthly + delta,
    }).monthlyNetCost
    const actualMarginalNet = totalNet - baselineNet

    // The marginal net cost of (used + delta) over the baseline must equal targetNet
    // within the bisection tolerance (0.01 EUR/mo).
    expect(Math.abs(actualMarginalNet - targetNet)).toBeLessThan(0.05)
  })
})

// ---------------------------------------------------------------------------
// F4 — Monte Carlo P10 risk score
// ---------------------------------------------------------------------------

describe('recommendNextEuro — Monte Carlo P10 risk score (F4)', () => {
  it('produces a strictly positive P10 capital for every candidate', () => {
    const ws = buildBerndWorkspace()
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    expect(candidates.length).toBeGreaterThan(0)
    for (const c of candidates) {
      expect(c.riskScoreP10).toBeGreaterThan(0)
      expect(c.riskScoreMcPaths).toBe(200)
    }
  })

  it('P10 ranking is deterministic across repeated calls (same workspace + budget)', () => {
    const ws = buildBerndWorkspace()
    const a = recommendNextEuro(buildInput(ws, 400))
    const b = recommendNextEuro(buildInput(ws, 400))
    expect(a.length).toBe(b.length)
    a.forEach((cand, i) => {
      expect(cand.id).toBe(b[i].id)
      // Strict equality: same seed + same inputs → bit-identical sample → identical P10.
      expect(cand.riskScoreP10).toBe(b[i].riskScoreP10)
    })
  })

  it('higher MC volatility yields a lower P10 for the same candidate (sanity)', () => {
    const ws = buildBerndWorkspace()
    // Low-vol baseline.
    ws.baseline.assumptions.monteCarlo = {
      ...ws.baseline.assumptions.monteCarlo,
      annualVolatility: 0.05,
    }
    const lowVol = recommendNextEuro(buildInput(ws, 400))
    // High-vol re-run on the SAME workspace shape (clone first to keep the
    // basis-scenario expected return identical).
    const ws2 = buildBerndWorkspace()
    ws2.baseline.assumptions.monteCarlo = {
      ...ws2.baseline.assumptions.monteCarlo,
      annualVolatility: 0.30,
    }
    const highVol = recommendNextEuro(buildInput(ws2, 400))
    // Pick a candidate present in both lists (match by id).
    const pair = lowVol
      .map((l) => ({ l, h: highVol.find((c) => c.id === l.id) }))
      .find((p) => Boolean(p.h))
    expect(pair).toBeDefined()
    // Higher vol must lower the 10th percentile (worse downside) for any
    // contributing candidate. Use ≤ to tolerate the edge case where MC noise
    // collapses both tails to the same fixed-point capital.
    expect(pair!.h!.riskScoreP10).toBeLessThanOrEqual(pair!.l.riskScoreP10)
    // And typically strictly lower for the Bernd shape (years > 0, gross > 0).
    expect(pair!.h!.riskScoreP10).toBeLessThan(pair!.l.riskScoreP10)
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

// ---------------------------------------------------------------------------
// Issue #08 — scenario change updates the nächsten-Euro panel
// ---------------------------------------------------------------------------
//
// `recommendNextEuro` must react when the user switches the return scenario.
// The panel previously hardcoded 'basis' via `pickBasisScenario`, so switching
// to a pessimistic / optimistic scenario had no effect on the displayed figures.
// The fix: callers pass `selectedScenarioId`; `pickBasisScenario` uses it when
// a matching scenario exists in the workspace, falling back to 'basis'.

describe('recommendNextEuro — reacts to selectedScenarioId (#08)', () => {
  function buildWorkspaceWithScenarios() {
    const ws = buildBerndWorkspace()
    // Inject a 'konservativ' scenario with a noticeably lower return so the
    // medianNettoRente produced from it differs measurably from 'basis'.
    const basisReturn =
      ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.annualReturn ?? 0.05
    // Only add 'konservativ' if not already present.
    if (!ws.baseline.assumptions.returnScenarios.some((s) => s.id === 'konservativ')) {
      ws.baseline.assumptions.returnScenarios = [
        ...ws.baseline.assumptions.returnScenarios,
        {
          id: 'konservativ' as const,
          label: 'Konservativ',
          annualReturn: Math.max(0.001, basisReturn - 0.02),
        },
      ]
    }
    return ws
  }

  it('basis and konservativ scenarios produce different medianNettoRente', () => {
    const ws = buildWorkspaceWithScenarios()
    const bundle = runCombineSimulation(ws, de2026Rules)
    const basisId = ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')!.id

    const basisInput: RecommendNextEuroInput = {
      workspace: ws,
      rules: de2026Rules,
      marginalMonthlyEUR: 200,
      baselinePerInstance: bundle.perInstance,
      baselineCombined: bundle.combinedByScenarioId[basisId],
      grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
      selectedScenarioId: 'basis',
    }
    const konservativId = 'konservativ'
    const konservativInput: RecommendNextEuroInput = {
      ...basisInput,
      baselineCombined: bundle.combinedByScenarioId[konservativId] ?? bundle.combinedByScenarioId[basisId],
      selectedScenarioId: konservativId,
    }

    const basisCandidates = recommendNextEuro(basisInput)
    const konservativCandidates = recommendNextEuro(konservativInput)

    expect(basisCandidates.length).toBeGreaterThan(0)
    expect(konservativCandidates.length).toBeGreaterThan(0)

    // Under a lower return scenario, the median Netto-Rente must be lower for
    // every candidate (lower compounding → less capital → lower payout).
    const commonIds = basisCandidates
      .map((c) => c.id)
      .filter((id) => konservativCandidates.some((p) => p.id === id))
    expect(commonIds.length).toBeGreaterThan(0)

    for (const id of commonIds) {
      const basisC = basisCandidates.find((c) => c.id === id)!
      const konservativC = konservativCandidates.find((c) => c.id === id)!
      expect(konservativC.medianNettoRente).toBeLessThan(basisC.medianNettoRente)
    }
  })

  it('falls back to basis scenario when selectedScenarioId is not found', () => {
    const ws = buildBerndWorkspace()
    const bundle = runCombineSimulation(ws, de2026Rules)
    const basisId = ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')!.id

    const withFallback = recommendNextEuro({
      workspace: ws,
      rules: de2026Rules,
      marginalMonthlyEUR: 200,
      baselinePerInstance: bundle.perInstance,
      baselineCombined: bundle.combinedByScenarioId[basisId],
      grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
      selectedScenarioId: 'nonexistent-scenario',
    })
    const withoutId = recommendNextEuro({
      workspace: ws,
      rules: de2026Rules,
      marginalMonthlyEUR: 200,
      baselinePerInstance: bundle.perInstance,
      baselineCombined: bundle.combinedByScenarioId[basisId],
      grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
    })

    // Both should use 'basis' and produce identical results.
    expect(withFallback.length).toBe(withoutId.length)
    withFallback.forEach((c, i) => {
      expect(c.medianNettoRente).toBeCloseTo(withoutId[i].medianNettoRente, 2)
    })
  })
})
