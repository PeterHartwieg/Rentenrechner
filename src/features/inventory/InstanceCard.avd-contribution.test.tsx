// @vitest-environment jsdom
/**
 * Inventory wizard — AVD contribution control.
 *
 * The AVD card previously took its contribution from the shared
 * `UniversalFields` block, whose 0–50 000 EUR range has no relation to the
 * statutory AVD limits. The replacement must *replace* that field rather than
 * sit beside it, and must keep the evidence bookkeeping the shared field did.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AvdCard } from './InstanceCard'
import type { AvdDraft } from './types'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

function makeAvdDraft(over: Partial<AvdDraft> = {}): AvdDraft {
  return {
    productId: 'altersvorsorgedepot',
    instanceLabel: undefined,
    status: 'active',
    contractStartYear: 2027,
    currentValueEUR: 0,
    monthlyContribution: 200,
    anbieter: undefined,
    subtype: 'standarddepot',
    useGlidepath: true,
    ...over,
  }
}

describe('AvdCard — contribution control replaces the generic field', () => {
  it('renders exactly one contribution control', () => {
    const { container } = render(
      <AvdCard draft={makeAvdDraft()} onChange={vi.fn()} setEvidence={vi.fn()} />,
    )
    expect(container.querySelectorAll('fieldset.range-number-field')).toHaveLength(1)
    expect(screen.queryByText('Monatlicher Beitrag (EUR)')).toBeNull()
  })

  it('offers the statutory levels', () => {
    render(<AvdCard draft={makeAvdDraft()} onChange={vi.fn()} setEvidence={vi.fn()} />)
    expect(screen.getByText('Mindestbeitrag')).toBeTruthy()
    expect(screen.getByText('Volle Grundzulage')).toBeTruthy()
  })

  it('writes the contribution and keeps marking it user_confirmed', () => {
    const onChange = vi.fn()
    const setEvidence = vi.fn()
    render(<AvdCard draft={makeAvdDraft()} onChange={onChange} setEvidence={setEvidence} />)
    fireEvent.click(screen.getByText('Volle Grundzulage'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ monthlyContribution: 150 }))
    expect(setEvidence).toHaveBeenCalledWith('monthlyContribution', 'user_confirmed')
  })

  it('does not clamp a stored contribution above the Vertragsrahmen', () => {
    render(
      <AvdCard
        draft={makeAvdDraft({ monthlyContribution: 800 })}
        onChange={vi.fn()}
        setEvidence={vi.fn()}
      />,
    )
    expect(screen.getByRole('slider')).toHaveValue('800')
  })

  it('disables the control for a beitragsfrei contract', () => {
    render(
      <AvdCard
        draft={makeAvdDraft({ status: 'paid_up' })}
        onChange={vi.fn()}
        setEvidence={vi.fn()}
      />,
    )
    expect(screen.getByRole('slider')).toBeDisabled()
  })

  it('leaves other products on the generic contribution field', async () => {
    const { EtfCard } = await import('./InstanceCard')
    render(
      <EtfCard
        draft={{
          productId: 'etf',
          instanceLabel: undefined,
          status: 'active',
          contractStartYear: 2027,
          currentValueEUR: 0,
          monthlyContribution: 200,
          anbieter: undefined,
          terPct: 0.2,
        }}
        onChange={vi.fn()}
        setEvidence={vi.fn()}
      />,
    )
    expect(screen.getByText('Monatliche Sparrate (EUR)')).toBeTruthy()
  })
})
