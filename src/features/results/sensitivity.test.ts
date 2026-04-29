import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules } from '../../rules/de2026'
import { DEFAULT_PERTURBATIONS, runSensitivity } from './sensitivity'

describe('runSensitivity', () => {
  it('returns one entry per perturbation plus baseline', () => {
    const result = runSensitivity({
      profile: defaultProfile,
      assumptions: defaultAssumptions,
      rules: de2026Rules,
      visibleProducts: ['etf', 'bav', 'versicherung'],
    })

    expect(result.baseline.id).toBe('baseline')
    expect(result.perturbations).toHaveLength(DEFAULT_PERTURBATIONS.length)
    expect(result.perturbations.map((p) => p.id)).toEqual(
      DEFAULT_PERTURBATIONS.map((p) => p.id),
    )
  })

  it('does not mutate the input profile or assumptions', () => {
    const profileBefore = JSON.stringify(defaultProfile)
    const assumptionsBefore = JSON.stringify(defaultAssumptions)
    runSensitivity({
      profile: defaultProfile,
      assumptions: defaultAssumptions,
      rules: de2026Rules,
      visibleProducts: ['etf', 'bav', 'versicherung'],
    })
    expect(JSON.stringify(defaultProfile)).toBe(profileBefore)
    expect(JSON.stringify(defaultAssumptions)).toBe(assumptionsBefore)
  })

  it('classifies a product visible alone as robust', () => {
    const result = runSensitivity({
      profile: defaultProfile,
      assumptions: defaultAssumptions,
      rules: de2026Rules,
      visibleProducts: ['etf'],
    })
    expect(result.robustness).toHaveLength(1)
    expect(result.robustness[0].productId).toBe('etf')
    expect(result.robustness[0].badge).toBe('robust')
  })

  it('produces capital rankings limited to visible products', () => {
    const result = runSensitivity({
      profile: defaultProfile,
      assumptions: defaultAssumptions,
      rules: de2026Rules,
      visibleProducts: ['etf', 'bav'],
    })
    expect(result.baseline.capitalRank.every((id) => id === 'etf' || id === 'bav')).toBe(
      true,
    )
    expect(result.baseline.capitalRank).toHaveLength(2)
  })

  it('flags employer-zero perturbation as changing bAV outcome favourability', () => {
    // With zero employer support, bAV invests less and ETF should look comparatively better.
    // We don't assert a specific winner — just that the perturbation runs and reports
    // a winner (i.e., simulation didn't error out).
    const result = runSensitivity({
      profile: defaultProfile,
      assumptions: defaultAssumptions,
      rules: de2026Rules,
      visibleProducts: ['etf', 'bav'],
    })
    const employerZero = result.perturbations.find((p) => p.id === 'employer_zero')
    expect(employerZero).toBeDefined()
    expect(employerZero?.winnerCapital).not.toBeNull()
  })
})
