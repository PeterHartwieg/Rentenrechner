// @vitest-environment jsdom
/**
 * Render tests for EvidenceBadge (Group G issue 09).
 *
 * Coverage:
 *   - model_estimate renders "Schätzung" badge with confirm button.
 *   - user_confirmed renders "bestätigt" badge without confirm button.
 *   - statement renders "lt. Beleg" badge.
 *   - Clicking "Wert ist okay" invokes onConfirm callback.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EvidenceBadge } from './EvidenceBadge'

describe('EvidenceBadge', () => {
  afterEach(() => cleanup())

  it('renders Schätzung badge for model_estimate', () => {
    render(<EvidenceBadge state="model_estimate" />)
    expect(screen.getByText(/Schätzung/)).toBeTruthy()
  })

  it('renders bestätigt badge for user_confirmed', () => {
    render(<EvidenceBadge state="user_confirmed" />)
    expect(screen.getByText(/bestätigt/)).toBeTruthy()
  })

  it('renders lt. Beleg badge for statement', () => {
    render(<EvidenceBadge state="statement" />)
    expect(screen.getByText(/lt\. Beleg/)).toBeTruthy()
  })

  it('renders confirm button for model_estimate when onConfirm is provided', () => {
    render(<EvidenceBadge state="model_estimate" onConfirm={() => {}} />)
    expect(screen.getByText(/Wert ist okay/)).toBeTruthy()
  })

  it('does not render confirm button for model_estimate without onConfirm', () => {
    render(<EvidenceBadge state="model_estimate" />)
    expect(screen.queryByText(/Wert ist okay/)).toBeNull()
  })

  it('does not render confirm button for user_confirmed', () => {
    render(<EvidenceBadge state="user_confirmed" onConfirm={() => {}} />)
    // The confirm button is only rendered for model_estimate.
    expect(screen.queryByText(/Wert ist okay/)).toBeNull()
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<EvidenceBadge state="model_estimate" onConfirm={onConfirm} />)
    const btn = screen.getByText(/Wert ist okay/)
    fireEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('has correct CSS class for estimate', () => {
    const { container } = render(<EvidenceBadge state="model_estimate" />)
    expect(container.querySelector('.evidence-badge--estimate')).toBeTruthy()
  })

  it('has correct CSS class for confirmed', () => {
    const { container } = render(<EvidenceBadge state="user_confirmed" />)
    expect(container.querySelector('.evidence-badge--confirmed')).toBeTruthy()
  })

  it('has correct CSS class for statement', () => {
    const { container } = render(<EvidenceBadge state="statement" />)
    expect(container.querySelector('.evidence-badge--statement')).toBeTruthy()
  })
})
