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
  it('keeps missing evidence separate from explicitly estimated fields', () => {
    expect(summarizeContractEvidence([{
      id: 'etf',
      instances: [{ status: 'active', evidenceMap: { monthlyContribution: 'model_estimate' } }],
    }])).toEqual({ contracts: 1, estimated: 1, unknown: 1 })
  })

  it('uses only tracked fields of active or paid-up contracts', () => {
    expect(summarizeContractEvidence([{
      id: 'etf',
      instances: [
        { status: 'active', evidenceMap: { monthlyContribution: 'statement', annualAssetFee: 'user_confirmed', unrelated: 'model_estimate' } },
        { status: 'paid_up', evidenceMap: {} },
        { status: 'offered', evidenceMap: {} },
        { status: 'surrendered', evidenceMap: {} },
      ],
    }])).toEqual({ contracts: 2, estimated: 0, unknown: 2 })
    expect(summarizeContractEvidence([])).toEqual({ contracts: 0, estimated: 0, unknown: 0 })
  })
})
