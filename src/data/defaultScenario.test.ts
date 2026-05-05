import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPERT_INFLATION_RATE,
  DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR,
  defaultAssumptions,
} from './defaultScenario'

describe('default scenario assumptions', () => {
  it('starts standard comparisons at 200 EUR monthly Netto-Belastung', () => {
    expect(DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR).toBe(200)
    expect(defaultAssumptions.equalInputAmountEUR).toBe(200)
  })

  it('keeps standard scenarios inflation-free until expert inflation is enabled', () => {
    expect(defaultAssumptions.inflationRate).toBe(0)
    expect(DEFAULT_EXPERT_INFLATION_RATE).toBe(0.02)
  })
})
