// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Scenario } from '../../domain/workspace'
import {
  createFreshOnboardingScenario,
  fieldValue,
  REQUIRE_ENTERED_MESSAGE,
  type PensionDraft,
} from './onboardingDraft'
import { useOnboardingDraft } from './useOnboardingDraft'

function scenario(): Scenario {
  return createFreshOnboardingScenario(new Date('2026-01-01T00:00:00.000Z'))
}

describe('useOnboardingDraft', () => {
  it('starts on the requested step and exposes both drafts', () => {
    const s = scenario()
    const { result } = renderHook(() => useOnboardingDraft({ scenario: s, initialStep: 'pension' }))
    expect(result.current.step).toBe('pension')
    expect(result.current.profile.age.status).toBe('assumed')
    expect(result.current.pension.system).toBe('grv')
    expect(result.current.isComplete).toBe(true)
  })

  it('setProfileValue clears an unknown and leaves neighbours alone', () => {
    const s = scenario()
    const { result } = renderHook(() => useOnboardingDraft({ scenario: s }))

    act(() => result.current.setProfileValue('grossSalaryYear', 61_000))
    act(() => result.current.setFieldUnknown('profile', 'pkvMonthlyPremium'))
    expect(result.current.profile.pkvMonthlyPremium.status).toBe('unknown')
    expect(fieldValue(result.current.profile.grossSalaryYear)).toBe(61_000)

    act(() => result.current.setProfileValue('pkvMonthlyPremium', 0))
    expect(result.current.profile.pkvMonthlyPremium).toEqual({ value: 0, status: 'entered' })
    expect(fieldValue(result.current.profile.grossSalaryYear)).toBe(61_000)
  })

  it('surfaces validation errors and refuses to commit while invalid', () => {
    const s = scenario()
    const { result } = renderHook(() => useOnboardingDraft({ scenario: s }))
    act(() => result.current.setProfileValue('age', 12))
    expect(result.current.errors.profile.age).toBeDefined()
    expect(result.current.isComplete).toBe(false)
    expect(result.current.commit()).toBeNull()
  })

  it('commits a valid draft into a new scenario without saving anything', () => {
    const source = scenario()
    const { result } = renderHook(() => useOnboardingDraft({ scenario: source }))

    act(() => result.current.setProfileValue('age', 35))
    act(() => result.current.setProfileValue('grossSalaryYear', 58_000))
    act(() => result.current.patchPension('method', 'career' as PensionDraft['method']))
    act(() => result.current.setPensionValue('careerStartAge', 25))

    const committed = result.current.commit()
    expect(committed).not.toBeNull()
    expect(committed!.profile.age).toBe(35)
    expect(committed!.assumptions.statutoryPension.pensionEntryMethod).toEqual({
      kind: 'career',
      careerStartAge: 25,
      pauseYears: 0,
    })
    // The source scenario is untouched — persistence is the caller's job.
    expect(source.profile.age).not.toBe(35)
  })

  it('exposes the estimate for the active method', () => {
    const s = scenario()
    const { result } = renderHook(() => useOnboardingDraft({ scenario: s }))
    act(() => result.current.setProfileValue('age', 45))
    act(() => result.current.setProfileValue('grossSalaryYear', 50_000))
    act(() => result.current.patchPension('method', 'career' as PensionDraft['method']))
    act(() => result.current.setPensionValue('careerStartAge', 25))

    const estimate = result.current.estimate
    expect(estimate.ok).toBe(true)
    if (!estimate.ok) return
    expect(estimate.contributionYears).toBe(20)
  })

  it('reset discards every edit', () => {
    const s = scenario()
    const { result } = renderHook(() => useOnboardingDraft({ scenario: s }))
    act(() => result.current.setProfileValue('age', 51))
    act(() => result.current.setFieldUnknown('pension', 'entgeltpunkte'))
    act(() => result.current.reset())

    expect(result.current.profile.age.status).toBe('assumed')
    expect(result.current.pension.entgeltpunkte.status).toBe('assumed')
  })

  it('re-seeds when the host swaps to a different scenario, not on every render', () => {
    const first = scenario()
    const { result, rerender } = renderHook(({ s }) => useOnboardingDraft({ scenario: s }), {
      initialProps: { s: first },
    })
    act(() => result.current.setProfileValue('age', 44))

    rerender({ s: first })
    expect(fieldValue(result.current.profile.age)).toBe(44)

    const second = scenario()
    second.profile = { ...second.profile, age: 30 }
    rerender({ s: second })
    expect(result.current.profile.age).toEqual({ value: 30, status: 'assumed' })
  })

  it('requireEntered blocks a commit built on untouched defaults', () => {
    const s = scenario()
    const { result } = renderHook(() =>
      useOnboardingDraft({ scenario: s, requireEntered: true }),
    )

    expect(result.current.isComplete).toBe(false)
    expect(result.current.errors.profile.age).toBe(REQUIRE_ENTERED_MESSAGE)
    expect(result.current.errors.profile.grossSalaryYear).toBe(REQUIRE_ENTERED_MESSAGE)
    expect(result.current.commit()).toBeNull()

    act(() => result.current.setProfileValue('age', 35))
    act(() => result.current.setProfileValue('grossSalaryYear', 58_000))
    // A fresh scenario resolves to the 'points' method, whose Entgeltpunkte are
    // still a default — "Später ergänzen" is the answer for a user who has none.
    expect(result.current.errors.pension.entgeltpunkte).toBe(REQUIRE_ENTERED_MESSAGE)
    act(() => result.current.patchPension('method', 'skipped' as PensionDraft['method']))

    expect(result.current.isComplete).toBe(true)
    expect(result.current.commit()).not.toBeNull()
  })

  it('requireEntered surfaces the active method\'s missing pension answer', () => {
    const s = scenario()
    const { result } = renderHook(() =>
      useOnboardingDraft({ scenario: s, requireEntered: true }),
    )
    act(() => result.current.setProfileValue('age', 35))
    act(() => result.current.setProfileValue('grossSalaryYear', 58_000))
    act(() => result.current.patchPension('method', 'career' as PensionDraft['method']))

    expect(result.current.errors.pension.careerStartAge).toBe(REQUIRE_ENTERED_MESSAGE)
    expect(result.current.commit()).toBeNull()

    act(() => result.current.setPensionValue('careerStartAge', 22))
    expect(result.current.errors.pension.careerStartAge).toBeUndefined()
    expect(result.current.commit()).not.toBeNull()
  })

  it('defaults to edit-mode behaviour: assumed values still commit', () => {
    const s = scenario()
    const { result } = renderHook(() => useOnboardingDraft({ scenario: s }))
    expect(result.current.isComplete).toBe(true)
    expect(result.current.commit()).not.toBeNull()
  })

  it('carries the fresh 2 % inflation assumption through a commit', () => {
    const s = scenario()
    const { result } = renderHook(() =>
      useOnboardingDraft({ scenario: s, requireEntered: true }),
    )
    act(() => result.current.setProfileValue('age', 35))
    act(() => result.current.setProfileValue('grossSalaryYear', 58_000))
    act(() => result.current.patchPension('method', 'skipped' as PensionDraft['method']))

    const committed = result.current.commit()
    expect(committed!.assumptions.inflationRate).toBe(0.02)
    expect(committed!.assumptions.inputStatus?.['assumptions.inflationRate']).toBe('assumed')
  })
})
