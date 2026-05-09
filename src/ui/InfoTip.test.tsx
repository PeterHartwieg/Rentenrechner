// @vitest-environment jsdom
/**
 * Accessibility tests for InfoTip — issue #79.
 *
 * Verifies that the trigger button has `aria-describedby` pointing to the
 * tooltip content element when the tooltip is open, and that the tooltip
 * content element has a stable `id` matching the `aria-describedby` value.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { QaFeedbackProvider } from '../features/qa-feedback/QaFeedbackProvider'
import { InfoTip } from './InfoTip'

function renderInfoTip(text = 'Tooltip explanation') {
  return render(
    <QaFeedbackProvider>
      <InfoTip text={text} />
    </QaFeedbackProvider>,
  )
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('InfoTip — aria-describedby accessibility (issue #79)', () => {
  it('trigger button has no aria-describedby when tooltip is closed', () => {
    renderInfoTip()
    const button = screen.getByRole('button', { name: 'Erklärung anzeigen' })
    expect(button.getAttribute('aria-describedby')).toBeNull()
  })

  it('trigger button has aria-describedby when tooltip is open', () => {
    renderInfoTip()
    const button = screen.getByRole('button', { name: 'Erklärung anzeigen' })

    fireEvent.click(button)

    expect(button.getAttribute('aria-describedby')).not.toBeNull()
  })

  it('aria-describedby on the trigger points to the tooltip element id', () => {
    renderInfoTip('Eine Erklärung')
    const button = screen.getByRole('button', { name: 'Erklärung anzeigen' })

    fireEvent.click(button)

    const describedById = button.getAttribute('aria-describedby')
    expect(describedById).not.toBeNull()

    const tooltip = document.getElementById(describedById!)
    expect(tooltip).not.toBeNull()
    expect(tooltip?.getAttribute('role')).toBe('tooltip')
    expect(tooltip?.textContent).toBe('Eine Erklärung')
  })

  it('aria-describedby is removed when the tooltip is closed again', () => {
    renderInfoTip()
    const button = screen.getByRole('button', { name: 'Erklärung anzeigen' })

    fireEvent.click(button)
    expect(button.getAttribute('aria-describedby')).not.toBeNull()

    fireEvent.click(button)
    expect(button.getAttribute('aria-describedby')).toBeNull()
  })

  it('tooltip element id is stable across open/close cycles', () => {
    renderInfoTip()
    const button = screen.getByRole('button', { name: 'Erklärung anzeigen' })

    fireEvent.click(button)
    const firstId = button.getAttribute('aria-describedby')

    fireEvent.click(button)
    fireEvent.click(button)
    const secondId = button.getAttribute('aria-describedby')

    expect(firstId).toBe(secondId)
  })

  it('tooltip element with role="tooltip" has the id referenced by aria-describedby', () => {
    renderInfoTip('Detailed info')
    const button = screen.getByRole('button', { name: 'Erklärung anzeigen' })

    fireEvent.click(button)

    const tooltip = screen.getByRole('tooltip')
    const tooltipId = tooltip.getAttribute('id')
    expect(tooltipId).not.toBeNull()
    expect(button.getAttribute('aria-describedby')).toBe(tooltipId)
  })
})
