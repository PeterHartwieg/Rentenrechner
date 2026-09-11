// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { DurationDescriptor, PlanSourceRow } from '../../app/planSummary'
import { PlanDurationSummary, PlanDurationText } from './PlanDurationSummary'
import { checkpointAges, isPayingAt } from './durationCheckpoints'

afterEach(cleanup)

describe('Plan duration copy', () => {
  it.each<[DurationDescriptor, string]>([
    [{ kind: 'lifelong' }, 'Lebenslang'],
    [{ kind: 'fixed-term', years: 20, endAge: 87 }, 'Für 20 Jahre · bis Alter 87'],
    [{ kind: 'drawdown-shared-horizon', endAge: 95, sharedWith: [] }, 'Entnahme geplant bis Alter 95 · gemeinsame Annahme'],
    [{ kind: 'avd-plan', endAge: 85 }, 'Auszahlplan bis Alter 85'],
  ])('renders %j from the supplied descriptor', (duration, text) => {
    render(<PlanDurationText duration={duration} />)
    expect(screen.getByText(text)).toBeVisible()
  })

  it('lists affected sources, consequences and both navigation actions', () => {
    const row = (key: string, duration: DurationDescriptor): PlanSourceRow => ({
      key, label: key, status: 'assumed', netMonthlyNominal: 100, netMonthlyReal: 70, duration,
      contributionMonthly: null, contributionStatus: null, contributionLabel: '', provenanceLabel: 'Angenommen',
    })
    const rows = [
      row('Rente', { kind: 'lifelong' }),
      row('Depot A', { kind: 'drawdown-shared-horizon', endAge: 95, sharedWith: ['Depot B'] }),
      row('Depot B', { kind: 'drawdown-shared-horizon', endAge: 95, sharedWith: ['Depot A'] }),
      row('Zeitrente', { kind: 'fixed-term', years: 20, endAge: 87 }),
      row('Altersvorsorgedepot', { kind: 'avd-plan', endAge: 85 }),
    ]
    const onEditSharedHorizon = vi.fn(), onOpenKapital = vi.fn()
    render(<PlanDurationSummary rows={rows} canShowAmounts onEditSharedHorizon={onEditSharedHorizon} onOpenKapital={onOpenKapital} />)
    expect(screen.getByRole('heading', { name: 'Wie lange kommt welches Geld?' })).toBeVisible()
    expect(screen.getByText('Die gemeinsame Entnahmedauer gilt für Depot A, Depot B.')).toBeVisible()
    expect(screen.getAllByText('Danach endet diese Auszahlung.')).toHaveLength(4)
    expect(screen.getByText('Eine lebenslange Auszahlung ist hier angenommen.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Gemeinsame Entnahmedauer ändern' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kapital im Verlauf ansehen →' }))
    expect(onEditSharedHorizon).toHaveBeenCalledOnce()
    expect(onOpenKapital).toHaveBeenCalledOnce()
  })

  it('omits the shared-horizon editor when no source uses it', () => {
    render(<PlanDurationSummary rows={[]} canShowAmounts onEditSharedHorizon={vi.fn()} onOpenKapital={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Gemeinsame Entnahmedauer ändern' })).not.toBeInTheDocument()
  })
})

describe('later-life checkpoints (audit F13)', () => {
  const row = (key: string, duration: DurationDescriptor, netMonthlyReal: number): PlanSourceRow => ({
    key, label: key, status: 'entered', netMonthlyNominal: netMonthlyReal / 0.7, netMonthlyReal, duration,
    contributionMonthly: null, contributionStatus: null, contributionLabel: '', provenanceLabel: 'Von dir angegeben',
  })

  it('shows which source still pays at each age and never sums income after a cutoff', () => {
    const rows = [
      row('Gesetzliche Rente', { kind: 'lifelong' }, 681),
      row('Depot', { kind: 'drawdown-shared-horizon', endAge: 90, sharedWith: [] }, 972),
    ]
    render(<PlanDurationSummary rows={rows} canShowAmounts retirementAge={67} targetMonthly={2000} onEditSharedHorizon={vi.fn()} onOpenKapital={vi.fn()} />)
    const table = screen.getByTestId('plan-duration-checkpoints')
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Quelle', 'Ab Rentenbeginn', 'Mit 67', 'Mit 80', 'Mit 90', 'Mit 95', 'Mit 100'])
    const depot = within(table).getByRole('row', { name: /^Depot/ })
    const paying = Array.from(depot.querySelectorAll('td[data-paying]')).map((td) => td.getAttribute('data-paying'))
    expect(paying).toEqual(['true', 'true', 'false', 'false', 'false'])
    const pension = within(table).getByRole('row', { name: /^Gesetzliche Rente/ })
    expect(Array.from(pension.querySelectorAll('td[data-paying]')).every((td) => td.getAttribute('data-paying') === 'true')).toBe(true)
    expect(depot).toHaveTextContent('972')
    expect(within(table).getByRole('row', { name: /^Dein Wunsch/ })).toHaveTextContent('2.000')
    const cutoff = screen.getByTestId('plan-duration-cutoff')
    expect(cutoff).toHaveTextContent('Ab Alter 90 fällt Depot weg')
    expect(cutoff).toHaveTextContent('972')
    expect(cutoff).toHaveTextContent('Diese Summe rechnen wir hier nicht aus')
    expect(table).not.toHaveTextContent('1.653')
  })

  it('omits the cutoff note and the target row when nothing ends and no target is set', () => {
    render(<PlanDurationSummary rows={[row('Rente', { kind: 'lifelong' }, 700)]} canShowAmounts retirementAge={67} onEditSharedHorizon={vi.fn()} onOpenKapital={vi.fn()} />)
    expect(screen.queryByTestId('plan-duration-cutoff')).not.toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /^Dein Wunsch/ })).not.toBeInTheDocument()
  })

  it('hides every source amount while household readiness is blocked, even when rows carry numbers', () => {
    // Row nets come out of the one household tax + KV/PV run. When that run is
    // blocked (unknown / incomplete / error input state) the numbers on the
    // rows are stale or partial and must not surface; the durations and the
    // paying / ended markers remain useful on their own.
    const rows = [
      row('Gesetzliche Rente', { kind: 'lifelong' }, 681),
      row('Depot', { kind: 'drawdown-shared-horizon', endAge: 90, sharedWith: [] }, 972),
    ]
    render(<PlanDurationSummary rows={rows} canShowAmounts={false} retirementAge={67} targetMonthly={2000} onEditSharedHorizon={vi.fn()} onOpenKapital={vi.fn()} />)
    const table = screen.getByTestId('plan-duration-checkpoints')
    expect(table).not.toHaveTextContent('972')
    expect(table).not.toHaveTextContent('681')
    const amountCells = Array.from(table.querySelectorAll('tbody td.plan-duration-summary__num:first-of-type')).map((td) => td.textContent)
    expect(amountCells).toEqual(['—', '—'])
    const depot = within(table).getByRole('row', { name: /^Depot/ })
    expect(Array.from(depot.querySelectorAll('td[data-paying]')).map((td) => td.getAttribute('data-paying'))).toEqual(['true', 'true', 'false', 'false', 'false'])
    expect(screen.getByText('Entnahme geplant bis Alter 90 · gemeinsame Annahme')).toBeVisible()
    const cutoff = screen.getByTestId('plan-duration-cutoff')
    expect(cutoff).toHaveTextContent('Ab Alter 90 fällt Depot weg.')
    expect(cutoff).not.toHaveTextContent('972')
    expect(cutoff).not.toHaveTextContent('pro Monat in heutigen Euro')
    // The user's own target is not a computed source net and stays visible.
    expect(within(table).getByRole('row', { name: /^Dein Wunsch/ })).toHaveTextContent('2.000')
  })

  it('derives the checkpoint ages from the retirement age', () => {
    expect(checkpointAges(67)).toEqual([67, 80, 90, 95, 100])
    expect(checkpointAges(85)).toEqual([85, 90, 95, 100])
    expect(checkpointAges(undefined)).toEqual([80, 90, 95, 100])
    expect(isPayingAt({ kind: 'fixed-term', years: 10, endAge: 77 }, 77)).toBe(false)
    expect(isPayingAt({ kind: 'fixed-term', years: 10, endAge: 77 }, 76)).toBe(true)
  })
})
