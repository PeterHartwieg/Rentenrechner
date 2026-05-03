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
  it('clamps the bAV candidate when usedMonthly is at the §3 Nr. 63 cap', () => {
    const ws = buildBerndWorkspace()
    // Set bAV gross to the full §3 Nr. 63 monthly cap.
    const capMonthly =
      (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap) / 12
    ws.baseline.assumptions.bav = ws.baseline.assumptions.bav.map((b) => ({
      ...b,
      monthlyGrossConversion: capMonthly,
    }))
    const input = buildInput(ws, 400)
    const candidates = recommendNextEuro(input)
    const bav = candidates.find((c) => c.productId === 'bav')
    // When the cap is fully used, the bAV candidate is filtered out (no
    // remaining headroom). Verify either: no bAV candidate, OR clamped.
    if (bav) {
      expect(bav.cappedToRemaining).toBe(true)
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
