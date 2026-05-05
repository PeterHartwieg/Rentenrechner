/**
 * Altersvorsorgedepot (AVD) candidate generator — per-product unit tests.
 *
 * Coverage:
 *   - Visible candidate: always emits a NEW-instance candidate when marginal
 *     > 0; clamps to the AltZertG per-contract annual cap; returns null when
 *     marginal is non-positive.
 *   - Reasons: `cappedToRemaining` fires when marginal exceeds the monthly
 *     cap; `afterTaxLumpSum` is null (≤30 % partial-capital under §22 Nr. 5).
 *   - Ranking inputs: gross matches the sized contribution after cap clamp;
 *     mcInputs honor the default AVD fee profile.
 *   - Materialized what-if: passing the candidate through `recommendNextEuro`
 *     + `buildWhatIfFromCandidate` appends a fresh AVD instance with the
 *     sized monthly own contribution.
 */

import { describe, expect, it } from 'vitest'
import { de2026Rules } from '../../rules/de2026'
import {
  buildWhatIfFromCandidate,
  recommendNextEuro,
  type RecommendNextEuroInput,
} from '../recommender'
import { runCombineSimulation } from '../useCombineSimulation'
import { makeAvdCandidate } from './altersvorsorgedepot'
import { buildBerndWorkspace, buildGeneratorContext } from './testHelpers'

describe('makeAvdCandidate — visible candidate behavior', () => {
  it('always emits a NEW-instance candidate when marginal > 0', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeAvdCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.productId).toBe('altersvorsorgedepot')
    expect(draft!.isNewInstance).toBe(true)
    expect(draft!.id).toBe('new_avd')
    expect(draft!.newInstance).toBeDefined()
  })

  it('returns null when marginal is non-positive', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 0)
    expect(makeAvdCandidate(g)).toBeNull()
  })

  it('clamps the gross to the AltZertG per-contract monthly cap', () => {
    const ws = buildBerndWorkspace()
    const capMonthly = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual / 12
    const g = buildGeneratorContext(ws, capMonthly + 200)
    const draft = makeAvdCandidate(g)!
    expect(draft.grossMonthlyEUR).toBeCloseTo(capMonthly, 4)
    expect(draft.cappedToRemaining).toBe(true)
  })

  it('does NOT clamp when marginal stays below the per-contract cap', () => {
    const ws = buildBerndWorkspace()
    const capMonthly = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual / 12
    const g = buildGeneratorContext(ws, Math.min(200, capMonthly - 1))
    const draft = makeAvdCandidate(g)!
    expect(draft.cappedToRemaining).toBe(false)
  })
})

describe('makeAvdCandidate — reasons', () => {
  it('afterTaxLumpSum is null (≤30 % partial-capital cap under §22 Nr. 5)', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeAvdCandidate(g)!
    expect(draft.candidateResult.afterTaxLumpSum).toBeNull()
  })
})

describe('makeAvdCandidate — ranking inputs', () => {
  it('gross == netCash (no accumulation tax leverage)', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 250)
    const draft = makeAvdCandidate(g)!
    expect(draft.netCashOutEUR).toBe(draft.grossMonthlyEUR)
  })

  it('totalContributions = gross × 12 × yearsToRetirement', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 250)
    const draft = makeAvdCandidate(g)!
    expect(draft.candidateResult.totalProductContributions).toBeCloseTo(
      draft.grossMonthlyEUR * 12 * g.yearsToRetirement,
      1,
    )
  })

  it('mcInputs.monthlyContribution matches the sized contribution', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 250)
    const draft = makeAvdCandidate(g)!
    expect(draft.mcInputs.monthlyContribution).toBeCloseTo(draft.grossMonthlyEUR, 6)
    expect(draft.mcInputs.totalFeeDecimal).toBeGreaterThanOrEqual(0)
  })

  it('candidateResult capital is positive and finite', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeAvdCandidate(g)!
    expect(Number.isFinite(draft.candidateResult.capitalAtRetirement)).toBe(true)
    expect(draft.candidateResult.capitalAtRetirement).toBeGreaterThan(0)
  })
})

describe('makeAvdCandidate — materialized what-if effects', () => {
  function buildInput(ws: ReturnType<typeof buildBerndWorkspace>, eur: number): RecommendNextEuroInput {
    const bundle = runCombineSimulation(ws, de2026Rules)
    const basisId =
      ws.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')?.id ??
      ws.baseline.assumptions.returnScenarios[0].id
    return {
      workspace: ws,
      rules: de2026Rules,
      marginalMonthlyEUR: eur,
      baselinePerInstance: bundle.perInstance,
      baselineCombined: bundle.combinedByScenarioId[basisId],
      grvGrossMonthlyPension: bundle.statutoryPension.grossMonthlyPension,
    }
  }

  it('appends a new AVD instance with monthlyOwnContribution = grossMonthlyEUR', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 200))
    const cand = candidates.find((c) => c.productId === 'altersvorsorgedepot')
    expect(cand).toBeDefined()
    const whatIf = buildWhatIfFromCandidate(ws.baseline, cand!)
    expect(whatIf.assumptions.altersvorsorgedepot.length).toBe(
      ws.baseline.assumptions.altersvorsorgedepot.length + 1,
    )
    const added = whatIf.assumptions.altersvorsorgedepot[
      whatIf.assumptions.altersvorsorgedepot.length - 1
    ]
    expect(added.monthlyOwnContribution).toBeCloseTo(cand!.grossMonthlyEUR, 1)
    expect(added.status).toBe('active')
  })

  it('what-if carries origin=recommender', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 200))
    const cand = candidates.find((c) => c.productId === 'altersvorsorgedepot')!
    const whatIf = buildWhatIfFromCandidate(ws.baseline, cand)
    expect(whatIf.origin).toBe('recommender')
  })
})
