// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DurationDescriptor, PlanSourceRow } from '../../app/planSummary'
import { PlanDurationSummary, PlanDurationText } from './PlanDurationSummary'

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
    })
    const rows = [
      row('Rente', { kind: 'lifelong' }),
      row('Depot A', { kind: 'drawdown-shared-horizon', endAge: 95, sharedWith: ['Depot B'] }),
      row('Depot B', { kind: 'drawdown-shared-horizon', endAge: 95, sharedWith: ['Depot A'] }),
      row('Zeitrente', { kind: 'fixed-term', years: 20, endAge: 87 }),
      row('Altersvorsorgedepot', { kind: 'avd-plan', endAge: 85 }),
    ]
    const onEditSharedHorizon = vi.fn(), onOpenKapital = vi.fn()
    render(<PlanDurationSummary rows={rows} onEditSharedHorizon={onEditSharedHorizon} onOpenKapital={onOpenKapital} />)
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
    render(<PlanDurationSummary rows={[]} onEditSharedHorizon={vi.fn()} onOpenKapital={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Gemeinsame Entnahmedauer ändern' })).not.toBeInTheDocument()
  })
})
