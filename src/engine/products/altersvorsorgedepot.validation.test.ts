import { describe, expect, it } from 'vitest'
import { validateAltersvorsorgedepot } from './altersvorsorgedepot.validation'
import { defaultAvdAssumptions } from '../../data/defaultScenario'
import type { AltersvorsorgedepotAssumptions, AltersvorsorgedepotEligibility } from '../../domain'

const base: AltersvorsorgedepotAssumptions = JSON.parse(JSON.stringify(defaultAvdAssumptions))

function withEligibility(overrides: Record<string, unknown>): AltersvorsorgedepotAssumptions {
  return { ...base, eligibility: { ...base.eligibility, ...overrides } as AltersvorsorgedepotEligibility }
}

describe('validateAltersvorsorgedepot — claimsChildAllowance (#371)', () => {
  it('accepts the flag being absent (backwards-compatible stored state)', () => {
    expect(validateAltersvorsorgedepot(base)).toBe(true)
  })

  it.each([true, false])('accepts claimsChildAllowance = %s', (value) => {
    expect(validateAltersvorsorgedepot(withEligibility({ claimsChildAllowance: value }))).toBe(true)
  })

  // The engine reads `!== false`, so any of these would silently count as
  // claiming the Kinderzulage.
  it.each(['false', 0, null])('rejects claimsChildAllowance = %p', (value) => {
    expect(validateAltersvorsorgedepot(withEligibility({ claimsChildAllowance: value }))).toBe(false)
  })
})
