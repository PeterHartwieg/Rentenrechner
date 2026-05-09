// @vitest-environment jsdom
/**
 * Keyboard accessibility tests for FocusTrap (gh#70).
 *
 * Covers:
 *   - Tab key wraps within the trap (last → first).
 *   - Shift+Tab key wraps within the trap (first → last).
 *   - Escape key fires the onEscape callback.
 *   - Focus returns to the opener element on unmount.
 *   - Focus moves into the trap on mount (first focusable element).
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FocusTrap } from './FocusTrap'

afterEach(() => {
  cleanup()
})

describe('FocusTrap — tab containment', () => {
  it('wraps Tab forward from last focusable to first focusable', () => {
    const onEscape = vi.fn()
    render(
      <FocusTrap onEscape={onEscape}>
        <div>
          <button>First</button>
          <button>Second</button>
          <button>Last</button>
        </div>
      </FocusTrap>,
    )

    const buttons = screen.getAllByRole('button')
    const last = buttons[buttons.length - 1]

    // Simulate Tab while last element is focused
    last.focus()
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false })

    // Focus should have wrapped to the first button
    expect(document.activeElement).toBe(buttons[0])
  })

  it('wraps Shift+Tab backward from first focusable to last focusable', () => {
    const onEscape = vi.fn()
    render(
      <FocusTrap onEscape={onEscape}>
        <div>
          <button>First</button>
          <button>Second</button>
          <button>Last</button>
        </div>
      </FocusTrap>,
    )

    const buttons = screen.getAllByRole('button')
    const first = buttons[0]

    // Simulate Shift+Tab while first element is focused
    first.focus()
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })

    // Focus should have wrapped to the last button
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
  })

  it('does not wrap Tab when focus is not on the last element', () => {
    const onEscape = vi.fn()
    render(
      <FocusTrap onEscape={onEscape}>
        <div>
          <button>First</button>
          <button>Middle</button>
          <button>Last</button>
        </div>
      </FocusTrap>,
    )

    const buttons = screen.getAllByRole('button')
    const middle = buttons[1]

    middle.focus()
    expect(document.activeElement).toBe(middle)

    // Tab from middle — focus is NOT on last, so no wrapping
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false })

    // Focus should remain on middle (no preventDefault/wrap occurred)
    expect(document.activeElement).toBe(middle)
  })
})

describe('FocusTrap — Escape key', () => {
  it('calls onEscape when Escape is pressed', () => {
    const onEscape = vi.fn()
    render(
      <FocusTrap onEscape={onEscape}>
        <div>
          <button>Close</button>
        </div>
      </FocusTrap>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('does not call onEscape for other keys', () => {
    const onEscape = vi.fn()
    render(
      <FocusTrap onEscape={onEscape}>
        <div>
          <button>Action</button>
        </div>
      </FocusTrap>,
    )

    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: 'Space' })
    fireEvent.keyDown(document, { key: 'ArrowDown' })

    expect(onEscape).not.toHaveBeenCalled()
  })
})

describe('FocusTrap — focus management', () => {
  it('moves focus to first focusable element on mount', () => {
    const onEscape = vi.fn()
    render(
      <FocusTrap onEscape={onEscape}>
        <div>
          <button>Alpha</button>
          <button>Beta</button>
        </div>
      </FocusTrap>,
    )

    const buttons = screen.getAllByRole('button')
    expect(document.activeElement).toBe(buttons[0])
  })

  it('restores focus to the previously focused element on unmount', () => {
    const onEscape = vi.fn()

    // Create an opener button outside the trap
    const opener = document.createElement('button')
    opener.textContent = 'Open dialog'
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const { unmount } = render(
      <FocusTrap onEscape={onEscape}>
        <div>
          <button>Dialog button</button>
        </div>
      </FocusTrap>,
    )

    // Focus should have moved into the trap
    expect(document.activeElement).not.toBe(opener)

    // Unmounting the trap should restore focus to the opener
    unmount()
    expect(document.activeElement).toBe(opener)

    document.body.removeChild(opener)
  })

  it('cleans up its event listener on unmount', () => {
    const onEscape = vi.fn()
    const { unmount } = render(
      <FocusTrap onEscape={onEscape}>
        <div>
          <button>Action</button>
        </div>
      </FocusTrap>,
    )

    unmount()

    // After unmount, Escape should no longer call onEscape
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onEscape).not.toHaveBeenCalled()
  })
})
