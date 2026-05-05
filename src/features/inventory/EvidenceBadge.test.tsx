// @vitest-environment jsdom
/**
 * Render tests for EvidenceBadge (Group G issue 09).
 *
 * Coverage:
 *   - model_estimate renders "Schätzung" badge with confirm button.
 *   - user_confirmed renders "bestätigt" badge without confirm button.
 *   - statement renders "lt. Beleg" badge.
 *   - Clicking "Uebernehmen" invokes onConfirm callback.
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
    expect(screen.getByText(/Uebernehmen/)).toBeTruthy()
  })

  it('does not render confirm button for model_estimate without onConfirm', () => {
    render(<EvidenceBadge state="model_estimate" />)
    expect(screen.queryByText(/Uebernehmen/)).toBeNull()
  })

  it('does not render confirm button for user_confirmed', () => {
    render(<EvidenceBadge state="user_confirmed" onConfirm={() => {}} />)
    // The confirm button is only rendered for model_estimate.
    expect(screen.queryByText(/Uebernehmen/)).toBeNull()
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<EvidenceBadge state="model_estimate" onConfirm={onConfirm} />)
    const btn = screen.getByText(/Uebernehmen/)
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

  // -------------------------------------------------------------------------
  // N9 explicit coverage: green-state appearance and derived-display cases
  // -------------------------------------------------------------------------

  it('user_confirmed: .evidence-badge--confirmed class is present and "Uebernehmen" button is absent', () => {
    const { container } = render(<EvidenceBadge state="user_confirmed" onConfirm={() => {}} />)
    expect(container.querySelector('.evidence-badge--confirmed')).toBeTruthy()
    expect(container.querySelector('.evidence-badge-confirm-btn')).toBeNull()
  })

  it('model_estimate + onConfirm: clicking "Uebernehmen" fires callback with no args', () => {
    const onConfirm = vi.fn()
    render(<EvidenceBadge state="model_estimate" onConfirm={onConfirm} />)
    const btn = screen.getByText(/Uebernehmen/)
    fireEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('model_estimate WITHOUT onConfirm: "Uebernehmen" button is absent (derived-display / Zulagen-Status case)', () => {
    const { container } = render(<EvidenceBadge state="model_estimate" />)
    expect(container.querySelector('.evidence-badge-confirm-btn')).toBeNull()
  })
})
