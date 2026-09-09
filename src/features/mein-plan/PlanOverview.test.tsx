// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { PlanSummary } from '../../app/planSummary'
import type { ReadinessReason } from '../../app/resultReadiness'
import { formatCurrency } from '../../utils/format'
import { PlanOverview, type PlanOverviewProps } from './PlanOverview'

afterEach(cleanup)

const money = (value: number) => formatCurrency(value).replace(/\u00a0/g, ' ')

const reason: ReadinessReason = {
  code: 'pension-entry-skipped', severity: 'blocking', label: 'Deine Rentenangabe fehlt.',
  target: { route: { kind: 'home' } },
}
const assumption: ReadinessReason = {
  code: 'assumed-fees', severity: 'assumption', label: 'Kosten für dein Depot sind angenommen.',
  target: { route: { kind: 'home' } },
}
const summary: PlanSummary = {
  netMonthlyTotalNominal: 2500, netMonthlyTotalReal: 1800, deflator: 0.72, yearsUntilRetirement: 25,
  rows: [
    { key: 'statutory', label: 'Gesetzliche Rente', netMonthlyNominal: 2000, netMonthlyReal: 1440, status: 'document', duration: { kind: 'lifelong' } },
    { key: 'etf-1', instanceId: 'etf-1', label: 'Mein Depot', netMonthlyNominal: 500, netMonthlyReal: 360, status: 'assumed', duration: { kind: 'drawdown-shared-horizon', endAge: 92, sharedWith: [] } },
  ],
  readiness: { status: 'estimated', reasons: [assumption], blocking: [], assumptions: [assumption], canShowHouseholdTotal: true },
}

function props(overrides: Partial<PlanOverviewProps> = {}): PlanOverviewProps {
  return {
    summary, retirementAge: 67, hasStarted: true, hasContracts: true, savedAlternativeCount: 2,
    moneyBasis: 'real', assumptions: { age: 42, grossSalaryYear: 60000, retirementAge: 67, pensionMethodLabel: 'lt. Renteninformation', inflationRate: 0.02 },
    onToggleMoneyBasis: vi.fn(), onStart: vi.fn(), onAddContract: vi.fn(), onTryAlternative: vi.fn(),
    onOpenSavedAlternatives: vi.fn(), onEditProfile: vi.fn(), onEditPension: vi.fn(), onEditTarget: vi.fn(),
    onEditSource: vi.fn(), onNavigateReason: vi.fn(), onOpenDuration: vi.fn(), onOpenKapital: vi.fn(),
    onOpenMethode: vi.fn(), onOpenEingaben: vi.fn(), ...overrides,
  }
}

describe('PlanOverview', () => {
  it('offers the two-step start without requiring contracts', () => {
    const p = props({ hasStarted: false, hasContracts: false, summary: null })
    render(<PlanOverview {...p} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dein Plan beginnt hier.')
    expect(screen.getByText('Zwei kurze Schritte. Bestehende Verträge sind optional.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Meine Rente einschätzen' }))
    expect(p.onStart).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Gesamt · netto/)).not.toBeInTheDocument()
  })

  it('suppresses totals, sources and gap when incomplete and links each blocking reason', () => {
    const p = props({ summary: { ...summary, gap: { targetMonthly: 2000, gapNominal: 278, gapReal: 200 }, readiness: {
      status: 'incomplete', canShowHouseholdTotal: false, reasons: [reason], blocking: [reason], assumptions: [],
    } } })
    render(<PlanOverview {...p} />)
    expect(screen.getByText('Noch offen')).toBeVisible()
    expect(screen.queryByText(money(1800))).not.toBeInTheDocument()
    expect(screen.queryByText(money(1440))).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: reason.label }))
    expect(p.onNavigateReason).toHaveBeenCalledWith(reason)
  })

  it('renders an estimate, assumption cues, source provenance, duration and edit actions', () => {
    const p = props()
    render(<PlanOverview {...p} />)
    expect(screen.getByRole('heading', { name: 'Deine Rente im Überblick' })).toBeVisible()
    expect(screen.getByText('Geschätzt aus deinen Angaben')).toBeVisible()
    expect(screen.getByText(money(1800))).toBeVisible()
    expect(screen.getByRole('list', { name: 'Verwendete Annahmen' })).toHaveTextContent(assumption.label)
    const pension = screen.getByRole('button', { name: /Gesetzliche Rente/ })
    expect(pension).toHaveTextContent('Lebenslang')
    expect(pension).toHaveTextContent('lt. Beleg')
    fireEvent.click(pension)
    expect(p.onEditSource).toHaveBeenCalledWith(summary.rows[0])
    fireEvent.click(screen.getByRole('button', { name: 'Dauer ansehen →' }))
    expect(p.onOpenDuration).toHaveBeenCalledOnce()
    for (const [name, callback] of [
      ['Vorsorge ergänzen', p.onAddContract], ['Änderung ausprobieren', p.onTryAlternative],
      ['Gespeicherte Alternativen (2)', p.onOpenSavedAlternatives], ['Persönliche Angaben', p.onEditProfile],
      ['Rentenangabe', p.onEditPension], ['Wunschrente ergänzen (optional)', p.onEditTarget],
    ] as const) { fireEvent.click(screen.getByRole('button', { name })); expect(callback).toHaveBeenCalledOnce() }
  })

  it('shows the target gap in its explicitly labelled today-euro basis', () => {
    const p = props({ targetMonthly: 2000, summary: { ...summary, gap: { targetMonthly: 2000, gapNominal: 278, gapReal: 200 } } })
    const { rerender } = render(<PlanOverview {...p} />)
    const aside = screen.getByRole('complementary')
    expect(aside).toHaveTextContent(`Dein Wunsch: ${money(2000)}`)
    expect(aside).toHaveTextContent(`Zur Wunschrente fehlen rechnerisch ${money(200)} pro Monat.`)
    fireEvent.click(within(aside).getByRole('button', { name: 'Wunsch ändern' }))
    expect(p.onEditTarget).toHaveBeenCalledOnce()
    rerender(<PlanOverview {...p} moneyBasis="nominal" />)
    expect(within(aside).getByText('In heutigen Euro')).toBeVisible()
    expect(aside).toHaveTextContent(money(200))
  })

  it('switches displayed totals and rows through the controlled money-basis callback', () => {
    const p = props()
    const { rerender } = render(<PlanOverview {...p} />)
    fireEvent.click(screen.getByText('Angaben & Annahmen prüfen'))
    const toggle = screen.getByRole('button', { name: 'Beträge zum Rentenbeginn (nominal) anzeigen' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(p.onToggleMoneyBasis).toHaveBeenCalledOnce()
    rerender(<PlanOverview {...p} moneyBasis="nominal" />)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(money(2500))).toBeVisible()
    expect(screen.getByText(money(500))).toBeVisible()
    expect(screen.getByText('Zum Rentenbeginn (nominal)')).toBeVisible()
  })

  it('keeps deeper sections collapsed and exposes notification undo', () => {
    const onUndo = vi.fn()
    render(<PlanOverview {...props({ hasContracts: false, savedAlternativeCount: 0, notification: { message: 'Vorsorge entfernt.', onUndo } })}><p>Verlauf der Auszahlung</p></PlanOverview>)
    expect(screen.getByRole('status')).toHaveTextContent('Vorsorge entfernt.')
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Änderung ausprobieren' })).not.toBeInTheDocument()
    expect(screen.getByText('Verlauf der Auszahlung')).not.toBeVisible()
    fireEvent.click(screen.getByText('Weitere Auswertungen'))
    expect(screen.getByText('Verlauf der Auszahlung')).toBeVisible()
  })

  it('distinguishes a simulation error from missing input', () => {
    render(<PlanOverview {...props({ summary: { ...summary, readiness: { ...summary.readiness, status: 'error', canShowHouseholdTotal: false } } })} />)
    expect(screen.getByText('Berechnung nicht möglich')).toBeVisible()
    expect(screen.queryByText('Für deine Gesamtrente fehlen noch Angaben.')).not.toBeInTheDocument()
  })
})
