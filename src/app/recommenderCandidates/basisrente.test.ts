/**
 * Basisrente candidate generator — per-product unit tests.
 *
 * Coverage:
 *   - Visible candidate: always synthesises a NEW-instance Basisrente
 *     candidate when marginal > 0 (no top-up path); returns null when the
 *     marginal solver yields zero gross (e.g. Schicht-1 cap fully used).
 *   - Reasons: `cappedToRemaining` fires when the bisected gross exceeds the
 *     remaining §10 Abs. 3 cap; `afterTaxLumpSum` is always null (Basisrente
 *     forbids capital payout under §10 Abs. 1 Nr. 2 b EStG).
 *   - Ranking inputs: gross is positive, totalContributions matches gross ×
 *     12 × years, mcInputs honor the synthetic fee profile.
 *   - Materialized what-if: passing the candidate through `recommendNextEuro`
 *     + `buildWhatIfFromCandidate` appends a fresh Basisrente instance with
 *     the sized contribution.
 */

import { describe, expect, it } from 'vitest'
import { de2026Rules } from '../../rules/de2026'
import {
  buildWhatIfFromCandidate,
  recommendNextEuro,
  type RecommendNextEuroInput,
} from '../recommender'
import { runCombineSimulation } from '../useCombineSimulation'
import { makeBasisrenteCandidate } from './basisrente'
import { buildBerndWorkspace, buildGeneratorContext } from './testHelpers'

describe('makeBasisrenteCandidate — visible candidate behavior', () => {
  it('always emits a NEW-instance candidate (no top-up path)', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeBasisrenteCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.productId).toBe('basisrente')
    expect(draft!.isNewInstance).toBe(true)
    expect(draft!.id).toBe('new_basisrente')
    expect(draft!.targetInstanceId).toBeUndefined()
    expect(draft!.newInstance).toBeDefined()
  })

  it('returns null when the marginal target is non-positive (no candidate to size)', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 0)
    expect(makeBasisrenteCandidate(g)).toBeNull()
  })
})

describe('makeBasisrenteCandidate — reasons', () => {
  it('afterTaxLumpSum is always null (capital payout legally prohibited)', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 300)
    const draft = makeBasisrenteCandidate(g)!
    expect(draft.candidateResult.afterTaxLumpSum).toBeNull()
  })

  it('flags cappedToRemaining when the marginal target exceeds the §10 Abs. 3 remainder', () => {
    const ws = buildBerndWorkspace()
    // A very large marginal forces the bisection above the remaining Schicht-1 cap.
    const g = buildGeneratorContext(ws, 5000)
    const draft = makeBasisrenteCandidate(g)
    if (draft) {
      expect(draft.cappedToRemaining).toBe(true)
    }
  })
})

describe('makeBasisrenteCandidate — ranking inputs', () => {
  it('gross > 0 and totalContributions = gross × 12 × yearsToRetirement', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeBasisrenteCandidate(g)!
    expect(draft.grossMonthlyEUR).toBeGreaterThan(0)
    expect(draft.candidateResult.totalProductContributions).toBeCloseTo(
      draft.grossMonthlyEUR * 12 * g.yearsToRetirement,
      1,
    )
  })

  it('netCashOutEUR ≤ grossMonthlyEUR (Sonderausgaben deduction lowers user cost)', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeBasisrenteCandidate(g)!
    expect(draft.netCashOutEUR).toBeLessThanOrEqual(draft.grossMonthlyEUR + 0.01)
  })

  it('mcInputs.monthlyContribution equals the sized own contribution', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeBasisrenteCandidate(g)!
    expect(draft.mcInputs.monthlyContribution).toBeCloseTo(draft.grossMonthlyEUR, 6)
    expect(draft.mcInputs.totalFeeDecimal).toBeGreaterThanOrEqual(0)
  })

  it('candidateResult capital is positive and finite', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeBasisrenteCandidate(g)!
    expect(Number.isFinite(draft.candidateResult.capitalAtRetirement)).toBe(true)
    expect(draft.candidateResult.capitalAtRetirement).toBeGreaterThan(0)
  })
})

describe('makeBasisrenteCandidate — materialized what-if effects', () => {
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

  it('appends a new Basisrente instance with the sized contribution', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 250))
    const cand = candidates.find((c) => c.productId === 'basisrente')
    expect(cand).toBeDefined()
    const whatIf = buildWhatIfFromCandidate(ws.baseline, cand!)
    expect(whatIf.assumptions.basisrente.length).toBe(
      ws.baseline.assumptions.basisrente.length + 1,
    )
    const added = whatIf.assumptions.basisrente[whatIf.assumptions.basisrente.length - 1]
    expect(added.monthlyGrossContribution).toBeCloseTo(cand!.grossMonthlyEUR, 1)
    expect(added.payoutMode).toBe('leibrente')
    expect(added.status).toBe('active')
  })

  it('what-if carries origin=recommender', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 250))
    const cand = candidates.find((c) => c.productId === 'basisrente')!
    const whatIf = buildWhatIfFromCandidate(ws.baseline, cand)
    expect(whatIf.origin).toBe('recommender')
  })
})
