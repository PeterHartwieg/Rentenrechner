// @vitest-environment jsdom
/**
 * Unit tests for RangeNumberField.
 *
 * The behaviours pinned here are the ones that are easy to regress and
 * expensive when they break:
 *   - the slider commits on release, never per frame (each commit costs a full
 *     simulation plus a 1 000-run Monte Carlo);
 *   - a release outside the track, or a cancelled touch, still commits;
 *   - card selection uses a tolerance, not `===`;
 *   - QA target ids carry the card index, never the amount;
 *   - the group is a fieldset/legend with no nested labels.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { RangeNumberField, type RangeNumberFieldProps } from './RangeNumberField'

afterEach(() => cleanup())

const CHOICES = [
  { value: 10, label: 'Mindestbeitrag' },
  { value: 30, label: 'Ende der 50 %-Stufe' },
  { value: 150, label: 'Volle Grundzulage' },
]

function setup(over: Partial<RangeNumberFieldProps> = {}) {
  const onCommit = vi.fn()
  const result = render(
    <RangeNumberField
      label="Eigenbeitrag"
      value={150}
      min={0}
      max={525}
      step={5}
      suffix="€"
      choices={CHOICES}
      onCommit={onCommit}
      {...over}
    />,
  )
  return { onCommit, ...result }
}

describe('RangeNumberField — commit timing', () => {
  it('does not commit while the slider is being dragged', () => {
    const { onCommit } = setup()
    const slider = screen.getByRole('slider')
    fireEvent.pointerDown(slider, { pointerId: 1 })
    fireEvent.change(slider, { target: { value: '200' } })
    fireEvent.change(slider, { target: { value: '250' } })
    fireEvent.change(slider, { target: { value: '300' } })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits once on pointer release, with the final value', () => {
    const { onCommit } = setup()
    const slider = screen.getByRole('slider')
    fireEvent.pointerDown(slider, { pointerId: 1 })
    fireEvent.change(slider, { target: { value: '200' } })
    fireEvent.change(slider, { target: { value: '300' } })
    fireEvent.pointerUp(slider, { pointerId: 1 })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(300)
  })

  it('commits on pointercancel (touch interrupted by a system gesture)', () => {
    const { onCommit } = setup()
    const slider = screen.getByRole('slider')
    fireEvent.pointerDown(slider, { pointerId: 1 })
    fireEvent.change(slider, { target: { value: '95' } })
    fireEvent.pointerCancel(slider, { pointerId: 1 })
    expect(onCommit).toHaveBeenCalledWith(95)
  })

  it('commits on blur when the pointer is released off the element', () => {
    const { onCommit } = setup()
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '85' } })
    fireEvent.blur(slider)
    expect(onCommit).toHaveBeenCalledWith(85)
  })

  it('commits after keyboard adjustment on keyup', () => {
    const { onCommit } = setup()
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '155' } })
    fireEvent.keyUp(slider, { key: 'ArrowRight' })
    expect(onCommit).toHaveBeenCalledWith(155)
  })

  it('does not commit when the value did not actually change', () => {
    const { onCommit } = setup()
    const slider = screen.getByRole('slider')
    fireEvent.pointerDown(slider, { pointerId: 1 })
    fireEvent.change(slider, { target: { value: '150' } })
    fireEvent.pointerUp(slider, { pointerId: 1 })
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('RangeNumberField — quick choices', () => {
  it('commits the chosen level', () => {
    const { onCommit } = setup()
    fireEvent.click(screen.getByText('Mindestbeitrag'))
    expect(onCommit).toHaveBeenCalledWith(10)
  })

  it('commits an off-grid rule-derived choice exactly', () => {
    const exactMonthlyAllowanceThreshold = 350 / 12
    const { onCommit } = setup({
      step: 1,
      choices: [{
        value: exactMonthlyAllowanceThreshold,
        label: 'Volle mittelbare Zulage',
      }],
    })

    fireEvent.click(screen.getByText('Volle mittelbare Zulage'))

    expect(onCommit).toHaveBeenCalledWith(exactMonthlyAllowanceThreshold)
  })

  it('marks a card selected within half a step, not on strict equality', () => {
    // 149.73 is the kind of engine-derived float the bound value really carries.
    setup({ value: 149.73 })
    const selected = screen.getByRole('radio', { checked: true })
    expect(within(selected).getByText('Volle Grundzulage')).toBeTruthy()
  })

  it('marks no card selected when the value is between levels', () => {
    setup({ value: 90 })
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
  })

  it('encodes the card index in the QA target, never the amount', () => {
    setup({ feedbackTargetId: 'inputs.avd.monthlyOwnContribution' })
    const cards = screen.getAllByRole('radio')
    const targets = cards.map((c) => c.getAttribute('data-qa-target'))
    expect(targets).toEqual([
      'inputs.avd.monthlyOwnContribution.choice.0',
      'inputs.avd.monthlyOwnContribution.choice.1',
      'inputs.avd.monthlyOwnContribution.choice.2',
    ])
    for (const t of targets) {
      expect(t).not.toMatch(/\b(10|30|150)\b/)
    }
  })

  it('moves focus and selection with radio-group navigation keys', () => {
    const { onCommit } = setup()
    const cards = screen.getAllByRole('radio')

    const expectMove = (from: HTMLElement, key: string, to: HTMLElement, value: number) => {
      from.focus()
      onCommit.mockClear()
      fireEvent.keyDown(from, { key })
      expect(document.activeElement).toBe(to)
      expect(onCommit).toHaveBeenCalledWith(value)
    }

    expectMove(cards[0], 'ArrowRight', cards[1], 30)
    expectMove(cards[1], 'ArrowDown', cards[2], 150)
    expectMove(cards[2], 'ArrowRight', cards[0], 10)
    expectMove(cards[0], 'ArrowLeft', cards[2], 150)
    expectMove(cards[2], 'ArrowUp', cards[1], 30)
    expectMove(cards[1], 'Home', cards[0], 10)
    expectMove(cards[0], 'End', cards[2], 150)
  })
})

describe('RangeNumberField — numeric field and bounds', () => {
  it('clamps and snaps a typed value to the step grid', () => {
    const { onCommit } = setup()
    const box = screen.getByRole('spinbutton')
    fireEvent.change(box, { target: { value: '9999' } })
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenCalledWith(525)
  })

  it('snaps an off-grid typed value', () => {
    const { onCommit } = setup()
    const box = screen.getByRole('spinbutton')
    fireEvent.change(box, { target: { value: '147' } })
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenCalledWith(145)
  })

  it('rounds fractional steps without floating-point drift', () => {
    const { onCommit } = setup({ value: 0.2, min: 0, max: 1, step: 0.1, decimals: 1 })
    const box = screen.getByRole('spinbutton')
    fireEvent.change(box, { target: { value: '0.3' } })
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenCalledWith(0.3)
  })
})

describe('RangeNumberField — accessibility and privacy', () => {
  it('groups with a fieldset/legend and does not nest labels', () => {
    const { container } = setup()
    const fieldset = container.querySelector('fieldset.range-number-field')
    expect(fieldset).not.toBeNull()
    expect(fieldset?.querySelector('legend')?.textContent).toBe('Eigenbeitrag')
    expect(container.querySelector('label label')).toBeNull()
  })

  it('exposes a unit-bearing aria-valuetext', () => {
    setup({ value: 150, suffix: '€' })
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('150 €')
  })

  it('gives the slider and exact numeric field distinct accessible names', () => {
    setup()
    expect(screen.getByRole('slider')).toHaveAccessibleName('Eigenbeitrag (Schieberegler)')
    expect(screen.getByRole('spinbutton')).toHaveAccessibleName(
      /Eigenbeitrag \(genauer Wert\)/,
    )
  })

  it('keeps exactly one card in the tab order', () => {
    setup({ value: 150 })
    const tabbable = screen.getAllByRole('radio').filter((c) => c.getAttribute('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
  })

  it('marks the whole group QA-sensitive, not just the numeric field', () => {
    const { container } = setup({ choices: undefined })
    expect(
      container.querySelector('fieldset.range-number-field')?.getAttribute('data-qa-sensitive'),
    ).toBe('true')
  })

  it('disables slider and cards when disabled', () => {
    setup({ disabled: true })
    expect(screen.getByRole('slider')).toBeDisabled()
    for (const card of screen.getAllByRole('radio')) expect(card).toBeDisabled()
  })
})
