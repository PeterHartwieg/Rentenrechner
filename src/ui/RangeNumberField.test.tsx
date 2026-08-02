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
import { RangeNumberField } from './RangeNumberField'

afterEach(() => cleanup())

const CHOICES = [
  { value: 10, label: 'Mindestbeitrag' },
  { value: 30, label: 'Ende der 50 %-Stufe' },
  { value: 150, label: 'Volle Grundzulage' },
]

function setup(over: Partial<Parameters<typeof RangeNumberField>[0]> = {}) {
  const onCommit = vi.fn()
  render(
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
  return { onCommit }
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
})

describe('RangeNumberField — accessibility and privacy', () => {
  it('groups with a fieldset/legend and does not nest labels', () => {
    const { container } = render(
      <RangeNumberField
        label="Eigenbeitrag"
        value={150}
        min={0}
        max={525}
        step={5}
        choices={CHOICES}
        onCommit={vi.fn()}
      />,
    )
    const fieldset = container.querySelector('fieldset.range-number-field')
    expect(fieldset).not.toBeNull()
    expect(fieldset?.querySelector('legend')?.textContent).toBe('Eigenbeitrag')
    expect(container.querySelector('label label')).toBeNull()
  })

  it('exposes a unit-bearing aria-valuetext', () => {
    setup({ value: 150, suffix: '€' })
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('150 €')
  })

  it('keeps exactly one card in the tab order', () => {
    setup({ value: 150 })
    const tabbable = screen.getAllByRole('radio').filter((c) => c.getAttribute('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
  })

  it('marks the whole group QA-sensitive, not just the numeric field', () => {
    const { container } = render(
      <RangeNumberField label="Eigenbeitrag" value={150} min={0} max={525} onCommit={vi.fn()} />,
    )
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
