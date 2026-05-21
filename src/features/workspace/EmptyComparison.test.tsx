// @vitest-environment jsdom
/**
 * Render tests for `EmptyComparison` (UX10).
 *
 * Coverage:
 *   - H3 heading renders.
 *   - CTA button fires `onOpenAngebot` when clicked.
 *   - "Du"-Ansprache: body text contains "deine" and does not contain "Sie"
 *     or "Ihren" (formal register guard).
 *   - Copy does not contain "Mehrwert" (replaced with "Unterschied").
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EmptyComparison } from './EmptyComparison'

afterEach(() => cleanup())

describe('EmptyComparison', () => {
  it('renders the H3 heading', () => {
    render(<EmptyComparison onOpenAngebot={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 3 })).not.toBeNull()
  })

  it('fires onOpenAngebot when the CTA button is clicked', () => {
    const handler = vi.fn()
    render(<EmptyComparison onOpenAngebot={handler} />)
    screen.getByRole('button', { name: /Produkte auswählen/i }).click()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('uses Du-Ansprache — body text contains "deine" and not "Sie" or "Ihren"', () => {
    const { container } = render(<EmptyComparison onOpenAngebot={vi.fn()} />)
    const bodyText = container.textContent ?? ''
    expect(bodyText).toMatch(/deine/i)
    expect(bodyText).not.toMatch(/\bSie\b/)
    expect(bodyText).not.toMatch(/\bIhren\b/)
  })

  it('copy does not contain "Mehrwert" (replaced with "Unterschied")', () => {
    const { container } = render(<EmptyComparison onOpenAngebot={vi.fn()} />)
    expect(container.textContent).not.toContain('Mehrwert')
  })
})
