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

  // Issue 64: the goal-reached CTA label is "Mehr sparen", replacing the old
  // "Beiträge anpassen" copy that was misleading in the new gap-closing flow.
  it('uses "Mehr sparen" CTA label when the gap is closed', () => {
    const profile = { ...defaultProfile, desiredNetMonthlyPension: 1500 }
    const overview = makeOverview({
      target: 1500,
      targetIsUserSet: true,
      projectedTotal: 2000,
      goalReached: true,
    })
    const { container } = render(
      <RentenluckeDashboard
        profile={profile}
        overview={overview}
        onTargetChange={() => {}}
        onAdjustContributions={() => {}}
      />,
    )
    const cta = container.querySelector('.rentenlucke-dashboard__cta') as HTMLButtonElement | null
    expect(cta?.textContent).toBe('Mehr sparen')
  })

  it('uses "Lücke schließen" CTA label when there is still a gap', () => {
    const profile = { ...defaultProfile, desiredNetMonthlyPension: 1500 }
    const overview = makeOverview({
      target: 1500,
      targetIsUserSet: true,
      projectedTotal: 800,
      gap: 700,
      goalReached: false,
    })
    const { container } = render(
      <RentenluckeDashboard
        profile={profile}
        overview={overview}
        onTargetChange={() => {}}
        onAdjustContributions={() => {}}
      />,
    )
    const cta = container.querySelector('.rentenlucke-dashboard__cta') as HTMLButtonElement | null
    expect(cta?.textContent).toBe('Lücke schließen')
  })

  // Issue 65: action button width is constrained by a fixed-width column +
  // flex group; changing the underlying `target` (Wunschnetto) must not
  // resize the CTA. We assert the CTA stays wrapped in the stable
  // `.rentenlucke-dashboard__cta-group` container regardless of overview state.
  it('keeps the CTA inside a stable-width wrapper across goalReached states', () => {
    const profile = { ...defaultProfile, desiredNetMonthlyPension: 1500 }
    const overviewGap = makeOverview({
      target: 1500,
      targetIsUserSet: true,
      projectedTotal: 1000,
      gap: 500,
      goalReached: false,
    })
    const overviewReached = makeOverview({
      target: 1500,
      targetIsUserSet: true,
      projectedTotal: 2000,
      goalReached: true,
    })
    for (const overview of [overviewGap, overviewReached]) {
      const { container, unmount } = render(
        <RentenluckeDashboard
          profile={profile}
          overview={overview}
          onTargetChange={() => {}}
          onAdjustContributions={() => {}}
        />,
      )
      const wrapper = container.querySelector('.rentenlucke-dashboard__cta-group')
      const cta = wrapper?.querySelector('.rentenlucke-dashboard__cta')
      expect(wrapper).toBeTruthy()
      expect(cta).toBeTruthy()
      unmount()
    }
  })
})
