// @vitest-environment jsdom

/**
 * VergleichRenditeStrip tests (R1 — issue #319, Decision C).
 *
 * Coverage:
 *   - Three scenarios → three chips
 *   - Inactive chips show bare rate ("3 %") — no scenario label like
 *     "Konservativ" visible
 *   - Active chip wraps the rate in brackets ("[ 5 % ]")
 *   - aria-pressed is true on active chip, false on others
 *   - aria-label still names the scenario for screen readers
 *   - onSelect is invoked with the chip's scenario id on click
 *   - Empty scenarios array → null
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent } from '@testing-library/react'
import { VergleichRenditeStrip } from './VergleichRenditeStrip'
import type { ReturnScenario } from '../../domain'

afterEach(() => {
  cleanup()
})

const SCENARIOS: ReturnScenario[] = [
  { id: 'konservativ', label: 'Konservativ', annualReturn: 0.03 },
  { id: 'basis', label: 'Basis', annualReturn: 0.05 },
  { id: 'optimistisch', label: 'Optimistisch', annualReturn: 0.07 },
]

describe('VergleichRenditeStrip', () => {
  it('renders one chip per scenario', () => {
    const { container } = render(
      <VergleichRenditeStrip scenarios={SCENARIOS} selectedId="basis" onSelect={() => {}} />,
    )
    const chips = container.querySelectorAll('.vergleich-rendite-chip')
    expect(chips.length).toBe(3)
  })

  it('inactive chips show the bare rate without scenario label', () => {
    const { container } = render(
      <VergleichRenditeStrip scenarios={SCENARIOS} selectedId="basis" onSelect={() => {}} />,
    )
    const chips = container.querySelectorAll('.vergleich-rendite-chip')
    // `formatPercent` returns rates with NBSP between number and "%"; normalise
    // whitespace to keep the assertion locale-stable across icu builds.
    const normalised = (el: Element) => (el.textContent ?? '').replace(/\s/g, ' ').trim()
    // First chip is "konservativ" (3 %), not active.
    expect(normalised(chips[0])).toBe('3 %')
    // Third chip is "optimistisch" (7 %), not active.
    expect(normalised(chips[2])).toBe('7 %')
    // No visible scenario label anywhere.
    const text = (container.textContent ?? '').replace(/\s/g, ' ')
    expect(text).not.toMatch(/Konservativ|Basis|Optimistisch/)
  })

  it('active chip wraps the rate in brackets', () => {
    const { container } = render(
      <VergleichRenditeStrip scenarios={SCENARIOS} selectedId="basis" onSelect={() => {}} />,
    )
    const activeChip = container.querySelector('.vergleich-rendite-chip--active')
    expect(activeChip).not.toBeNull()
    const normalised = (activeChip!.textContent ?? '').replace(/\s/g, ' ').trim()
    expect(normalised).toBe('[ 5 % ]')
  })

  it('aria-pressed reflects selection state', () => {
    const { container } = render(
      <VergleichRenditeStrip scenarios={SCENARIOS} selectedId="optimistisch" onSelect={() => {}} />,
    )
    const chips = container.querySelectorAll('.vergleich-rendite-chip')
    expect(chips[0].getAttribute('aria-pressed')).toBe('false')
    expect(chips[1].getAttribute('aria-pressed')).toBe('false')
    expect(chips[2].getAttribute('aria-pressed')).toBe('true')
  })

  it('aria-label names the scenario for screen readers', () => {
    const { container } = render(
      <VergleichRenditeStrip scenarios={SCENARIOS} selectedId="basis" onSelect={() => {}} />,
    )
    const chips = container.querySelectorAll('.vergleich-rendite-chip')
    expect(chips[0].getAttribute('aria-label')).toContain('Konservativ')
    expect(chips[1].getAttribute('aria-label')).toContain('Basis')
    expect(chips[2].getAttribute('aria-label')).toContain('Optimistisch')
  })

  it('onSelect fires with the chip scenario id on click', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <VergleichRenditeStrip scenarios={SCENARIOS} selectedId="basis" onSelect={onSelect} />,
    )
    const chips = container.querySelectorAll('.vergleich-rendite-chip')
    fireEvent.click(chips[2])
    expect(onSelect).toHaveBeenCalledWith('optimistisch')
  })

  it('returns null on empty scenarios', () => {
    const { container } = render(
      <VergleichRenditeStrip scenarios={[]} selectedId="basis" onSelect={() => {}} />,
    )
    expect(container.querySelector('.vergleich-rendite-strip')).toBeNull()
  })
})
