import { describe, expect, it } from 'vitest'
import type { SensitivityRowResult } from './sensitivitySelectors'
import { largestTestedChange, summarizeContractEvidence } from './calculationContext'

function row(id: string, delta: number, note?: SensitivityRowResult['note']) {
  return { id, result: { headlineDelta: delta, perturbedProjectedMonthly: 2000 + delta, perInstanceDelta: {}, note } }
}

describe('largestTestedChange', () => {
  it('selects the largest absolute change and preserves its direction and row', () => {
    const negative = row('return', -320.75)
    expect(largestTestedChange([row('contribution', 210), negative, row('inflation', 0)]))
      .toBe(negative)
  })

  it('selects a positive largest change and keeps stable order on equal magnitudes', () => {
    const positive = row('retirement', 400)
    expect(largestTestedChange([positive, row('return', -400)])).toBe(positive)
  })

  it('distinguishes tested zero and sub-euro changes from unavailable rows', () => {
    const zero = row('inflation', 0)
    expect(largestTestedChange([zero, row('etf', 0, 'no_etf_instance')])).toBe(zero)
    const tiny = row('return', -0.4)
    expect(largestTestedChange([zero, tiny])).toBe(tiny)
    expect(largestTestedChange([])).toBeUndefined()
    expect(largestTestedChange([
      row('etf', 0, 'no_etf_instance'),
      row('paid-up', 0, 'etf_paid_up_only'),
      row('missing-scenario', 0, 'unchanged'),
    ])).toBeUndefined()
  })

  it('ignores non-finite results and keeps an applied constrained variant', () => {
    const constrained = row('retirement', 30, 'retirement_age_clamped')
    const invalidProjection = row('invalid-projection', 1000)
    invalidProjection.result.perturbedProjectedMonthly = NaN
    expect(largestTestedChange([
      row('nan', NaN), row('infinite', Infinity), invalidProjection, constrained,
    ])).toBe(constrained)
  })
})

describe('summarizeContractEvidence', () => {
  it('does not infer estimated inputs or unknown-origin counts from an empty map', () => {
    expect(summarizeContractEvidence([{
      id: 'etf', instances: [{ status: 'active', evidenceMap: {} }],
    }])).toEqual({ contracts: 1, hasExplicitEstimates: false, hasConfirmedInputs: false })
  })

  it('recognizes explicit estimates independently of registry key names', () => {
    expect(summarizeContractEvidence([{
      id: 'bav', instances: [{ status: 'active', evidenceMap: { kostenQuote: 'model_estimate' } }],
    }])).toEqual({ contracts: 1, hasExplicitEstimates: true, hasConfirmedInputs: false })
  })

  it.each(['statement', 'user_confirmed'] as const)('recognizes recorded %s without inventing estimates', (state) => {
    expect(summarizeContractEvidence([{
      id: 'etf', instances: [{ status: 'active', evidenceMap: { monthlyContribution: state } }],
    }])).toEqual({ contracts: 1, hasExplicitEstimates: false, hasConfirmedInputs: true })
  })

  it('includes paid-up contracts and ignores offered or surrendered evidence', () => {
    expect(summarizeContractEvidence([{
      id: 'etf',
      instances: [
        { status: 'active', evidenceMap: {} },
        { status: 'paid_up', evidenceMap: { annualAssetFee: 'model_estimate' } },
        { status: 'offered', evidenceMap: { monthlyContribution: 'statement' } },
        { status: 'surrendered', evidenceMap: { monthlyContribution: 'user_confirmed' } },
      ],
    }])).toEqual({ contracts: 2, hasExplicitEstimates: true, hasConfirmedInputs: false })
    expect(summarizeContractEvidence([])).toEqual({ contracts: 0, hasExplicitEstimates: false, hasConfirmedInputs: false })
  })
})
