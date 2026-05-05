/**
 * ETF candidate generator — per-product unit tests.
 *
 * Coverage:
 *   - Visible candidate: returns null when no eligible ETF instance exists,
 *     produces a candidate when an active instance exists, prefers active over
 *     surrendered/offered.
 *   - Ranking inputs: gross == marginal (no accumulation tax leverage), netCash
 *     equals gross, mcInputs honor the instance's annual asset fee.
 *   - Materialized what-if: passing the candidate through `recommendNextEuro` +
 *     `buildWhatIfFromCandidate` bumps the target ETF instance's
 *     monthlyContribution by grossMonthlyEUR.
 */

import { describe, expect, it } from 'vitest'
import { defaultAssumptions } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import {
  buildWhatIfFromCandidate,
  recommendNextEuro,
  type RecommendNextEuroInput,
} from '../recommender'
import { runCombineSimulation } from '../useCombineSimulation'
import { makeEtfCandidate } from './etf'
import { buildBerndWorkspace, buildGeneratorContext } from './testHelpers'

describe('makeEtfCandidate — visible candidate behavior', () => {
  it('produces a candidate when at least one active ETF instance exists', () => {
    const ws = buildBerndWorkspace()
    expect(ws.baseline.assumptions.etf.length).toBeGreaterThan(0)
    const g = buildGeneratorContext(ws, 200)
    const draft = makeEtfCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.productId).toBe('etf')
    expect(draft!.isNewInstance).toBe(false)
    expect(draft!.targetInstanceId).toBe(ws.baseline.assumptions.etf[0].instanceId)
  })

  it('returns null when every ETF instance is surrendered', () => {
    const ws = buildBerndWorkspace()
    ws.baseline.assumptions.etf = ws.baseline.assumptions.etf.map((e) => ({
      ...e,
      status: 'surrendered' as const,
    }))
    const g = buildGeneratorContext(ws, 200)
    expect(makeEtfCandidate(g)).toBeNull()
  })

  it('returns null when every ETF instance is only offered (not yet active)', () => {
    const ws = buildBerndWorkspace()
    ws.baseline.assumptions.etf = ws.baseline.assumptions.etf.map((e) => ({
      ...e,
      status: 'offered' as const,
    }))
    const g = buildGeneratorContext(ws, 200)
    expect(makeEtfCandidate(g)).toBeNull()
  })

  it('skips surrendered instances and selects the first active one', () => {
    const ws = buildBerndWorkspace()
    const baseEtf = ws.baseline.assumptions.etf[0]
    ws.baseline.assumptions.etf = [
      { ...baseEtf, instanceId: 'etf-dead', status: 'surrendered' as const },
      { ...baseEtf, instanceId: 'etf-live', status: 'active' as const },
    ]
    const g = buildGeneratorContext(ws, 200)
    const draft = makeEtfCandidate(g)
    expect(draft).not.toBeNull()
    expect(draft!.targetInstanceId).toBe('etf-live')
  })
})

describe('makeEtfCandidate — ranking inputs', () => {
  it('gross == marginal (ETF has no accumulation tax leverage), netCash == gross', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 250)
    const draft = makeEtfCandidate(g)!
    expect(draft.grossMonthlyEUR).toBe(250)
    expect(draft.netCashOutEUR).toBe(250)
    expect(draft.cappedToRemaining).toBe(false)
  })

  it('mcInputs.totalFeeDecimal reflects the target instance asset fee', () => {
    const ws = buildBerndWorkspace()
    ws.baseline.assumptions.etf = ws.baseline.assumptions.etf.map((e) => ({
      ...e,
      annualAssetFee: 0.0075,
    }))
    const g = buildGeneratorContext(ws, 200)
    const draft = makeEtfCandidate(g)!
    expect(draft.mcInputs.totalFeeDecimal).toBeCloseTo(0.0075, 6)
    expect(draft.mcInputs.monthlyContribution).toBe(200)
  })

  it('falls back to the default asset fee when the instance does not specify one', () => {
    const ws = buildBerndWorkspace()
    ws.baseline.assumptions.etf = ws.baseline.assumptions.etf.map((e) => ({
      ...e,
      annualAssetFee: undefined as unknown as number,
    }))
    const g = buildGeneratorContext(ws, 200)
    const draft = makeEtfCandidate(g)!
    expect(draft.mcInputs.totalFeeDecimal).toBeCloseTo(
      defaultAssumptions.etf.annualAssetFee,
      6,
    )
  })

  it('candidateResult capital and totalContributions are positive and finite', () => {
    const ws = buildBerndWorkspace()
    const g = buildGeneratorContext(ws, 200)
    const draft = makeEtfCandidate(g)!
    expect(Number.isFinite(draft.candidateResult.capitalAtRetirement)).toBe(true)
    expect(draft.candidateResult.capitalAtRetirement).toBeGreaterThan(0)
    expect(draft.candidateResult.totalProductContributions).toBeCloseTo(
      200 * 12 * g.yearsToRetirement,
      2,
    )
    // ETF after-tax lump sum is non-null (Abgeltungsteuer with partial exemption).
    expect(draft.candidateResult.afterTaxLumpSum).not.toBeNull()
  })
})

describe('makeEtfCandidate — materialized what-if effects', () => {
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

  it('save-as-plan bumps the target ETF instance monthlyContribution by grossMonthlyEUR', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 150))
    const cand = candidates.find((c) => c.productId === 'etf')!
    const before =
      ws.baseline.assumptions.etf.find((e) => e.instanceId === cand.targetInstanceId)
        ?.monthlyContribution ?? 0
    const whatIf = buildWhatIfFromCandidate(ws.baseline, cand)
    const after =
      whatIf.assumptions.etf.find((e) => e.instanceId === cand.targetInstanceId)
        ?.monthlyContribution ?? 0
    expect(after - before).toBeCloseTo(cand.grossMonthlyEUR, 1)
  })

  it('what-if carries origin=recommender and the candidate label', () => {
    const ws = buildBerndWorkspace()
    const candidates = recommendNextEuro(buildInput(ws, 150))
    const cand = candidates.find((c) => c.productId === 'etf')!
    const whatIf = buildWhatIfFromCandidate(ws.baseline, cand)
    expect(whatIf.origin).toBe('recommender')
    expect(whatIf.label).toBe(cand.label)
  })
})
