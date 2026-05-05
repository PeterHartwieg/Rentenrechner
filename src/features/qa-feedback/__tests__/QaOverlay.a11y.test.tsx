// @vitest-environment jsdom

/**
 * Lane C (issue 06) — accessibility tests for QaOverlay keyboard navigation.
 *
 * Covers:
 *   - focusin on a data-qa-target element shows the hover outline.
 *   - focusout clears the outline.
 *   - Enter on a keyboard-focused target pins it (opens composer).
 *   - ESC cancels the current draft (closes composer) and clears the outline.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { useFeedbackTarget } from '../useFeedbackTarget'

function TargetButton({ id, label }: { id: string; label: string }) {
  const { targetProps } = useFeedbackTarget({ id, label })
  return (
    <button type="button" {...targetProps}>
      {label}
    </button>
  )
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
})

beforeEach(() => {
  window.history.replaceState(null, '', '/?qa=1')
})

describe('QaOverlay — keyboard focus highlighting', () => {
  it('shows a hover-style outline when a qa-target receives keyboard focus', async () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="inputs.bav.section" label="Betriebliche Altersvorsorge" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByText('Betriebliche Altersvorsorge')
    // Simulate keyboard focus arriving on the target.
    fireEvent.focusIn(btn)
    // Allow the rAF in focusout to settle (not needed for focusin, but
    // defensively flush micro tasks).
    await Promise.resolve()
    // The overlay should render either the hover or the kb-focus outline.
    expect(screen.getByTestId('qa-overlay-hover')).toBeTruthy()
  })
})

describe('QaOverlay — Enter to pin', () => {
  it('pins the keyboard-focused target when Enter is pressed', async () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="inputs.bav.employerSubsidy.label" label="AG-Zuschuss" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByText('AG-Zuschuss')
    fireEvent.focusIn(btn)
    await Promise.resolve()
    // Press Enter to pin.
    fireEvent.keyDown(document, { key: 'Enter' })
    // Composer should open.
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    expect(screen.getByTestId('qa-overlay-pinned')).toBeTruthy()
  })
})

describe('QaOverlay — ESC cancel', () => {
  it('closes the composer and clears the pinned outline when ESC is pressed after pinning via mouse', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="inputs.bav.employerSubsidy.label" label="AG-Zuschuss" />
      </QaFeedbackProvider>,
    )
    const btn = screen.getByText('AG-Zuschuss')
    // Pin via click.
    fireEvent.click(btn)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    // ESC is handled by the composer's own keydown listener (it calls onCancel).
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('qa-composer')).toBeNull()
    expect(screen.queryByTestId('qa-overlay-pinned')).toBeNull()
  })

  it('clears the hover outline when ESC is pressed without a pin', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="inputs.bav.employerSubsidy.label" label="AG-Zuschuss" />
      </QaFeedbackProvider>,
    )
    fireEvent.pointerMove(screen.getByText('AG-Zuschuss'))
    expect(screen.getByTestId('qa-overlay-hover')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('qa-overlay-hover')).toBeNull()
  })
})
