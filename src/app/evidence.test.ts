import { describe, expect, it } from 'vitest'
import { lowestConfidence, confidenceForResult, confidenceLanguage } from './evidence'
import type { EvidenceState } from '../domain/instances'

describe('lowestConfidence', () => {
  it('returns model_estimate when any path is missing', () => {
    const map: Record<string, EvidenceState> = { monthlyContribution: 'user_confirmed' }
    expect(lowestConfidence(map, ['monthlyContribution', 'annualAssetFee'])).toBe('model_estimate')
  })

  it('returns model_estimate when any path is model_estimate', () => {
    const map: Record<string, EvidenceState> = {
      monthlyContribution: 'user_confirmed',
      annualAssetFee: 'model_estimate',
    }
    expect(lowestConfidence(map, ['monthlyContribution', 'annualAssetFee'])).toBe('model_estimate')
  })

  it('returns user_confirmed when all paths are user_confirmed', () => {
    const map: Record<string, EvidenceState> = {
      monthlyContribution: 'user_confirmed',
      annualAssetFee: 'user_confirmed',
    }
    expect(lowestConfidence(map, ['monthlyContribution', 'annualAssetFee'])).toBe('user_confirmed')
  })

  it('treats statement as confirmed (highest tier)', () => {
    const map: Record<string, EvidenceState> = {
      monthlyContribution: 'statement',
      annualAssetFee: 'user_confirmed',
    }
    expect(lowestConfidence(map, ['monthlyContribution', 'annualAssetFee'])).toBe('user_confirmed')
  })

  it('returns user_confirmed when all paths are statement', () => {
    const map: Record<string, EvidenceState> = {
      monthlyContribution: 'statement',
      annualAssetFee: 'statement',
    }
    expect(lowestConfidence(map, ['monthlyContribution', 'annualAssetFee'])).toBe('user_confirmed')
  })

  it('returns model_estimate for empty map (all missing)', () => {
    expect(lowestConfidence({}, ['monthlyContribution', 'annualAssetFee'])).toBe('model_estimate')
  })

  it('returns user_confirmed for empty field list (no fields consumed)', () => {
    expect(lowestConfidence({}, [])).toBe('user_confirmed')
  })
})

describe('confidenceForResult', () => {
  it('returns model_estimate for ETF when evidenceMap is empty', () => {
    const result = { productId: 'etf' as const }
    expect(confidenceForResult(result, {})).toBe('model_estimate')
  })

  it('returns model_estimate for bAV when any consumed field is missing', () => {
    const result = { productId: 'bav' as const }
    const partialMap: Record<string, EvidenceState> = {
      monthlyGrossConversion: 'user_confirmed',
    }
    expect(confidenceForResult(result, partialMap)).toBe('model_estimate')
  })

  it('returns user_confirmed for ETF when all consumed fields are confirmed', () => {
    const result = { productId: 'etf' as const }
    const map: Record<string, EvidenceState> = {
      monthlyContribution: 'user_confirmed',
      annualAssetFee: 'user_confirmed',
    }
    expect(confidenceForResult(result, map)).toBe('user_confirmed')
  })

  it('returns model_estimate for unknown productId', () => {
    const result = { productId: 'grv' as unknown as 'etf' }
    expect(confidenceForResult(result, { anything: 'user_confirmed' })).toBe('model_estimate')
  })
})

describe('confidenceLanguage', () => {
  it('returns hedged prefix for model_estimate', () => {
    expect(confidenceLanguage('model_estimate').prefix).toBe('auf deinen Schätzungen ergibt sich')
  })

  it('returns direct prefix for user_confirmed', () => {
    expect(confidenceLanguage('user_confirmed').prefix).toBe('ergibt sich')
  })

  it('returns direct prefix for statement', () => {
    expect(confidenceLanguage('statement').prefix).toBe('ergibt sich')
  })
})
