// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO,
  type RentenluckeOverview,
} from '../../app/simulationSelectors'
import { defaultProfile } from '../../data/defaultScenario'
import { RentenluckeDashboard } from './RentenluckeDashboard'

afterEach(() => cleanup())

function makeOverview(overrides: Partial<RentenluckeOverview>): RentenluckeOverview {
  return {
    grvNet: 0,
    productBreakdown: [],
    projectedTotal: 0,
    target: 0,
    targetIsUserSet: false,
    gap: 0,
    goalReached: false,
    ...overrides,
  }
}

describe('RentenluckeDashboard', () => {
  it('prefills Wunschnetto with the salary-derived target', () => {
    const grossSalaryYear = 60_000
    const target = (grossSalaryYear / 12) * RENTENLUCKE_DEFAULT_REPLACEMENT_RATIO
    const profile = {
      ...defaultProfile,
      grossSalaryYear,
      desiredNetMonthlyPension: 0,
    }
    const overview = makeOverview({ target, gap: target })

    const { container } = render(
      <RentenluckeDashboard
        profile={profile}
        overview={overview}
        onTargetChange={() => {}}
        onAdjustContributions={() => {}}
      />,
    )

    const input = container.querySelector('input[type="number"]') as HTMLInputElement | null
    expect(input?.value).toBe('3500')
    expect(container.textContent).toMatch(/Voreinstellung:\s*70/)
  })
})
