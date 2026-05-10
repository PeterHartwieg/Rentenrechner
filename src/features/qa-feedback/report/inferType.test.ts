import { describe, expect, it } from 'vitest'
import { inferFeedbackType } from './inferType'
import type { ResolvedTarget } from './types'

function target(overrides: Partial<ResolvedTarget> = {}): ResolvedTarget {
  return {
    id: 'results.total.value',
    precision: 'exact',
    ...overrides,
  }
}

describe('inferFeedbackType', () => {
  it('uses suggested replacement text as a copy signal', () => {
    expect(
      inferFeedbackType({
        comment: 'Bitte anpassen.',
        suggestedText: 'Netto-Beitrag',
        target: target({ id: 'inputs.bav.monthlyNetCost.label' }),
      }),
    ).toBe('copy')
  })

  it('uses label-like target ids as copy reports', () => {
    expect(
      inferFeedbackType({
        comment: 'Das Wort passt nicht.',
        target: target({ id: 'inputs.bav.employerSubsidy.label' }),
      }),
    ).toBe('copy')
  })

  it('detects value reports from calculation language', () => {
    expect(
      inferFeedbackType({
        comment: 'Der Betrag rechnet sich nicht neu.',
        target: target({ id: 'results.summary.netMonthly' }),
      }),
    ).toBe('value')
  })

  it('detects layout and accessibility reports', () => {
    expect(
      inferFeedbackType({
        comment: 'Auf mobile ist der Text abgeschnitten.',
        target: target({ id: 'results.chart.legend' }),
      }),
    ).toBe('layout')
    expect(
      inferFeedbackType({
        comment: 'Keyboard focus geht verloren.',
        target: target({ id: 'dashboard.nextButton' }),
      }),
    ).toBe('a11y')
  })
})
