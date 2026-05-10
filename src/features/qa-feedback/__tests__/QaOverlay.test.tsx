// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
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

describe('QaOverlay — hover and click-to-pin', () => {
  it('shows the hover outline when the pointer enters a target', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="inputs.bav.employerSubsidy.label" label="AG-Zuschuss" />
      </QaFeedbackProvider>,
    )
    const button = screen.getByText('AG-Zuschuss')
    fireEvent.pointerMove(button)
    expect(screen.getByTestId('qa-overlay-hover')).toBeTruthy()
  })

  it('clears the hover outline when the pointer leaves all targets', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="inputs.bav.employerSubsidy.label" label="AG-Zuschuss" />
        <div data-testid="non-target">No target here</div>
      </QaFeedbackProvider>,
    )
    fireEvent.pointerMove(screen.getByText('AG-Zuschuss'))
    expect(screen.getByTestId('qa-overlay-hover')).toBeTruthy()
    fireEvent.pointerMove(screen.getByTestId('non-target'))
    expect(screen.queryByTestId('qa-overlay-hover')).toBeNull()
  })

  it('pins a target on click and opens the composer', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="inputs.bav.employerSubsidy.label" label="AG-Zuschuss" />
      </QaFeedbackProvider>,
    )
    const button = screen.getByText('AG-Zuschuss')
    fireEvent.click(button)
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    expect(screen.getByTestId('qa-overlay-pinned')).toBeTruthy()
  })

  it('walks up to the nearest data-qa-target ancestor when a child is clicked', () => {
    function NestedTarget() {
      const { targetProps } = useFeedbackTarget({ id: 'inputs.bav.section', precision: 'section' })
      return (
        <section {...targetProps}>
          <p>
            <span data-testid="leaf">deep child</span>
          </p>
        </section>
      )
    }
    render(
      <QaFeedbackProvider>
        <NestedTarget />
      </QaFeedbackProvider>,
    )
    fireEvent.click(screen.getByTestId('leaf'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
  })

  it('cancels the draft when the composer Cancel button is pressed', () => {
    render(
      <QaFeedbackProvider>
        <TargetButton id="inputs.bav.employerSubsidy.label" label="AG-Zuschuss" />
      </QaFeedbackProvider>,
    )
    fireEvent.click(screen.getByText('AG-Zuschuss'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    // Cancel button has aria-label "Abbrechen"
    fireEvent.click(screen.getAllByRole('button', { name: 'Abbrechen' })[0])
    expect(screen.queryByTestId('qa-composer')).toBeNull()
    expect(screen.queryByTestId('qa-overlay-pinned')).toBeNull()
  })

  it('clears hover outline on Escape', () => {
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

  it('clicking inner <input> of a labeled field resolves to the label target, not auto.input', () => {
    function LabeledInput() {
      const { targetProps } = useFeedbackTarget({
        id: 'inputs.bav.fees.wrapperAssetFee',
        label: 'Mantelgebühr',
        precision: 'exact',
      })
      return (
        <label {...targetProps}>
          <span>Mantelgebühr (Versicherer)</span>
          <input type="number" data-testid="fee-input" defaultValue={0} />
        </label>
      )
    }
    render(
      <QaFeedbackProvider>
        <LabeledInput />
      </QaFeedbackProvider>,
    )
    fireEvent.click(screen.getByTestId('fee-input'))
    expect(screen.getByTestId('qa-composer')).toBeTruthy()
    // Before fix: shows "Zu: auto.input". After fix: shows "Zu: Mantelgebühr".
    expect(screen.getByText(/Zu: Mantelgebühr/)).toBeTruthy()
  })
})
