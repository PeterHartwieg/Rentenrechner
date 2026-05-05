// @vitest-environment jsdom

/**
 * "Inert when disabled" regression coverage (PRD US-33).
 *
 * QA mode must not affect normal rendering or fire any DOM listeners when
 * the activation flag is off. These tests pin that contract — every Lane
 * B/C/D change must keep them passing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { QaModeIndicator } from '../QaModeIndicator'
import { useFeedbackTarget } from '../useFeedbackTarget'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-qa-mode')
  window.history.replaceState(null, '', '/')
})

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

function HostedTarget() {
  const { targetProps } = useFeedbackTarget({
    id: 'inputs.bav.employerSubsidy.label',
    label: 'AG-Zuschuss',
  })
  return (
    <button type="button" {...targetProps} data-testid="host">
      Host
    </button>
  )
}

describe('QaFeedbackProvider — inert when disabled', () => {
  it('does not render the indicator chip', () => {
    render(
      <QaFeedbackProvider>
        <QaModeIndicator />
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    expect(screen.queryByTestId('qa-indicator')).toBeNull()
  })

  it('does not render the overlay layer', () => {
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    expect(screen.queryByTestId('qa-overlay-hover')).toBeNull()
    expect(screen.queryByTestId('qa-overlay-pinned')).toBeNull()
  })

  it('does not add data-qa-target attributes to host elements', () => {
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    const host = screen.getByTestId('host')
    expect(host.getAttribute('data-qa-target')).toBeNull()
    expect(host.getAttribute('data-qa-precision')).toBeNull()
    expect(host.getAttribute('data-qa-label')).toBeNull()
  })

  it('does not attach a global pointermove listener (clicking does not pin)', () => {
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    fireEvent.pointerMove(screen.getByTestId('host'))
    fireEvent.click(screen.getByTestId('host'))
    expect(screen.queryByTestId('qa-composer')).toBeNull()
    expect(screen.queryByTestId('qa-preview')).toBeNull()
  })

  it('does not set the data-qa-mode attribute on the document root', () => {
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    expect(document.documentElement.getAttribute('data-qa-mode')).toBeNull()
  })

  it('renders children identically with and without the provider', () => {
    function StaticChild() {
      return (
        <div>
          <h1>Hello</h1>
          <HostedTarget />
        </div>
      )
    }
    const { container: bare } = render(<StaticChild />)
    const bareHtml = bare.innerHTML
    cleanup()
    const { container: wrapped } = render(
      <QaFeedbackProvider>
        <StaticChild />
      </QaFeedbackProvider>,
    )
    // The provider only inserts overlay/composer/indicator nodes when QA mode
    // is enabled. With the flag off, the children HTML must be identical.
    expect(wrapped.innerHTML).toBe(bareHtml)
  })

  it('does not call sessionStorage.setItem with the QA key when disabled', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(
      <QaFeedbackProvider>
        <HostedTarget />
      </QaFeedbackProvider>,
    )
    const qaWrites = setItemSpy.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.includes('qa-feedback'),
    )
    expect(qaWrites).toEqual([])
    setItemSpy.mockRestore()
  })
})
