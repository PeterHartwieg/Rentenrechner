// @vitest-environment jsdom
/**
 * Unit tests for NumberField — issue #04: Backspace cannot delete a lone "0".
 *
 * Coverage:
 *   - Pressing Backspace on a lone "0" clears the field (draft="") and does NOT
 *     reinject "0" via onCommit, so the field stays empty until the user types
 *     a replacement or blurs (which reverts to the prior engine value without
 *     calling onCommit).
 *   - Blurring an empty draft does not call onCommit (engine value is preserved).
 *   - Blurring a valid draft does call onCommit with that value.
 *   - onChange fires on every keystroke, including empty string.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { NumberField } from './NumberField'

describe('NumberField — Backspace / lone-zero clearing (#04)', () => {
  afterEach(() => cleanup())

  it('does not call onCommit when blurring an empty draft (Backspace on lone 0)', () => {
    const onCommit = vi.fn()
    render(
      <NumberField label="Test" value={0} onCommit={onCommit} />,
    )
    const input = screen.getByRole('spinbutton')

    // Simulate the user pressing Backspace on "0": browser fires change with ""
    fireEvent.change(input, { target: { value: '' } })
    // Blur without typing a replacement
    fireEvent.blur(input)

    // onCommit must NOT be called — the engine value stays at 0, field just
    // reverts its display to "0" (draft cleared to null).
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('calls onCommit with the new value when a valid replacement is typed after clearing', () => {
    const onCommit = vi.fn()
    render(
      <NumberField label="Test" value={0} onCommit={onCommit} />,
    )
    const input = screen.getByRole('spinbutton')

    // Clear then type "500"
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit).toHaveBeenCalledWith('500')
  })

  it('calls onCommit when blurring a valid non-zero draft', () => {
    const onCommit = vi.fn()
    render(
      <NumberField label="Test" value={100} onCommit={onCommit} />,
    )
    const input = screen.getByRole('spinbutton')

    fireEvent.change(input, { target: { value: '200' } })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledWith('200')
  })

  it('calls onChange with empty string when field is cleared (live-preview callers)', () => {
    const onChange = vi.fn()
    render(
      <NumberField label="Test" value={0} onChange={onChange} />,
    )
    const input = screen.getByRole('spinbutton')

    fireEvent.change(input, { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does not call onCommit when blurring a non-numeric draft', () => {
    const onCommit = vi.fn()
    render(
      <NumberField label="Test" value={42} onCommit={onCommit} />,
    )
    const input = screen.getByRole('spinbutton')

    // type="number" inputs prevent non-numeric input in real browsers, but
    // jsdom allows arbitrary values — guard the commit path anyway.
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)

    expect(onCommit).not.toHaveBeenCalled()
  })
})
