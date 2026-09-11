// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { PlanSummary } from '../../app/planSummary'
import type { ReadinessReason } from '../../app/resultReadiness'
import { formatCurrency } from '../../utils/format'
import { PlanOverview, type PlanOverviewProps } from './PlanOverview'

afterEach(cleanup)

const money = (value: number) => formatCurrency(value).replace(/\u00a0/g, ' ')
const blockedSourcesHint = 'Einzelbeträge erscheinen, sobald alle Angaben vorliegen. Steuern und Krankenversicherung hängen von allen Renten zusammen ab.'

const reason: ReadinessReason = {
  code: 'pension-entry-skipped', severity: 'blocking', label: 'Deine Rentenangabe fehlt.',
  target: { route: { kind: 'home' } },
}
const assumption: ReadinessReason = {
  code: 'assumed-fees', severity: 'assumption', label: 'Kosten für dein Depot sind angenommen.',
  target: { route: { kind: 'home' } },
}
const summary: PlanSummary = {
  pkvRetirementMonthlyCost: 0,
  netMonthlyTotalNominal: 2500, netMonthlyTotalReal: 1800, deflator: 0.72, yearsUntilRetirement: 25,
  rows: [
    { key: 'statutory', label: 'Gesetzliche Rente', netMonthlyNominal: 2000, netMonthlyReal: 1440, status: 'document', duration: { kind: 'lifelong' }, contributionMonthly: null, contributionStatus: null, contributionLabel: '', provenanceLabel: 'lt. Renteninformation' },
    { key: 'etf-1', instanceId: 'etf-1', label: 'Mein Depot', netMonthlyNominal: 500, netMonthlyReal: 360, status: 'assumed', duration: { kind: 'drawdown-shared-horizon', endAge: 92, sharedWith: [] }, contributionMonthly: 250, contributionStatus: 'entered', contributionLabel: 'Sparrate', provenanceLabel: 'Angenommen' },
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
    const hint = screen.getByText(blockedSourcesHint)
    expect(hint).toBeVisible()
    expect(hint.nextElementSibling).toBe(screen.getByRole('list', { name: 'Deine Rentenquellen' }))
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
    expect(screen.queryByText(blockedSourcesHint)).not.toBeInTheDocument()
    expect(screen.getByText(money(1800))).toBeVisible()
    expect(screen.getByRole('list', { name: 'Verwendete Annahmen' })).toHaveTextContent(assumption.label)
    const pension = screen.getByRole('button', { name: 'Gesetzliche Rente bearbeiten' })
    expect(pension).toHaveTextContent('Lebenslang')
    expect(pension).toHaveTextContent('lt. Renteninformation')
    expect(screen.getByRole('button', { name: 'Mein Depot bearbeiten' })).toBeVisible()
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

  it.each([0, 250.75])('shows a formatted monthly contribution of %s independently of the payout money basis', (contributionMonthly) => {
    const p = props({ summary: { ...summary, rows: [summary.rows[0], { ...summary.rows[1], contributionMonthly }] } })
    const { rerender } = render(<PlanOverview {...p} />)
    const depot = screen.getByRole('button', { name: 'Mein Depot bearbeiten' })
    expect(within(depot).getByText(`Sparrate: ${money(contributionMonthly)} / Monat`)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Gesetzliche Rente bearbeiten' }).querySelectorAll('small')).toHaveLength(2)
    rerender(<PlanOverview {...p} moneyBasis="nominal" />)
    expect(within(depot).getByText(`Sparrate: ${money(contributionMonthly)} / Monat`)).toBeVisible()
  })

  it.each([null, 250])('shows an unknown contribution instead of the stored amount %s', (contributionMonthly) => {
    render(<PlanOverview {...props({ summary: { ...summary, rows: [{
      ...summary.rows[1], contributionMonthly, contributionStatus: 'unknown', contributionLabel: 'Eigenbeitrag',
    }] } })} />)
    const depot = screen.getByRole('button', { name: 'Mein Depot bearbeiten' })
    expect(within(depot).getByText('Eigenbeitrag: unbekannt')).toBeVisible()
    expect(depot).not.toHaveTextContent('/ Monat')
  })

  it('omits the contribution line for a contract without a monthly contribution', () => {
    render(<PlanOverview {...props({ summary: { ...summary, rows: [{
      ...summary.rows[1], contributionMonthly: null, contributionStatus: null,
    }] } })} />)
    expect(screen.getByRole('button', { name: 'Mein Depot bearbeiten' })).not.toHaveTextContent('Sparrate:')
  })

  it('uses the career-estimate provenance instead of the statutory row status', () => {
    render(<PlanOverview {...props({ summary: { ...summary, rows: [{
      ...summary.rows[0], status: 'assumed', provenanceLabel: 'Grob aus Berufsstart geschätzt',
    }] } })} />)
    const pension = screen.getByRole('button', { name: 'Gesetzliche Rente bearbeiten' })
    expect(within(pension).getByText('Grob aus Berufsstart geschätzt')).toBeVisible()
    expect(pension).not.toHaveTextContent('Angenommen')
  })

  it.each([
    ['assumed', 'Angenommen'], ['unknown', 'Unbekannt'], ['entered', 'Bestätigt'], ['document', 'lt. Beleg'],
  ] as const)('falls back to the legacy label for %s when provenance is absent', (status, label) => {
    const row = { ...summary.rows[1], status }
    Reflect.deleteProperty(row, 'provenanceLabel')
    render(<PlanOverview {...props({ summary: { ...summary, rows: [row] } })} />)
    expect(within(screen.getByRole('button', { name: 'Mein Depot bearbeiten' })).getByText(label)).toBeVisible()
  })

  it('keeps the target and gap on the same money basis as the headline', () => {
    const p = props({ targetMonthly: 2000, summary: { ...summary, gap: { targetMonthly: 2000, gapNominal: 278, gapReal: 200 } } })
    const { rerender } = render(<PlanOverview {...p} />)
    const aside = screen.getByRole('complementary')
    expect(screen.getByText(money(1800))).toBeVisible()
    expect(aside).toHaveTextContent(`Dein Wunsch: ${money(2000)} · in heutigen Euro`)
    expect(aside).toHaveTextContent(`Zur Wunschrente fehlen rechnerisch ${money(200)} pro Monat.`)
    fireEvent.click(within(aside).getByRole('button', { name: 'Wunsch ändern' }))
    expect(p.onEditTarget).toHaveBeenCalledOnce()
    rerender(<PlanOverview {...p} moneyBasis="nominal" />)
    expect(screen.getByText(money(2500))).toBeVisible()
    expect(aside).toHaveTextContent(`Dein Wunsch: ${money(2000 / summary.deflator)} · zum Rentenbeginn (nominal)`)
    expect(aside).toHaveTextContent(`Zur Wunschrente fehlen rechnerisch ${money(278)} pro Monat.`)
    expect(aside).not.toHaveTextContent('in heutigen Euro')
  })

  it.each(['real', 'nominal'] as const)('shows an achieved target on the %s basis', (moneyBasis) => {
    render(<PlanOverview {...props({ moneyBasis, summary: {
      ...summary, gap: { targetMonthly: 1800, gapReal: 0, gapNominal: 0 },
    } })} />)
    const aside = screen.getByRole('complementary')
    expect(aside).toHaveTextContent('Dein Wunsch ist in dieser Schätzung erreicht.')
    expect(aside).not.toHaveTextContent('Zur Wunschrente fehlen')
  })

  it.each([0, -1])('does not re-inflate the target with an invalid deflator of %s', (deflator) => {
    render(<PlanOverview {...props({ moneyBasis: 'nominal', summary: {
      ...summary, deflator, gap: { targetMonthly: 2000, gapReal: 200, gapNominal: 278 },
    } })} />)
    const aside = screen.getByRole('complementary')
    expect(aside).toHaveTextContent('Dein Wunsch: — · zum Rentenbeginn (nominal)')
    expect(aside).toHaveTextContent(`Zur Wunschrente fehlen rechnerisch ${money(278)} pro Monat.`)
  })

  it('switches displayed totals and rows through the controlled money-basis callback', () => {
    const p = props()
    const { rerender } = render(<PlanOverview {...p} />)
    fireEvent.click(screen.getByText('Angaben & Annahmen prüfen'))
    const toggle = screen.getByRole('button', { name: 'Beträge zum Rentenbeginn (nominal) anzeigen' })
    expect(screen.getByText('In heutigen Euro')).toBeVisible()
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(p.onToggleMoneyBasis).toHaveBeenCalledOnce()
    rerender(<PlanOverview {...p} moneyBasis="nominal" />)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(money(2500))).toBeVisible()
    expect(screen.getByText(money(500))).toBeVisible()
    expect(screen.getByText('Zum Rentenbeginn (nominal)')).toBeVisible()
  })

  it.each(['real', 'nominal'] as const)('labels zero inflation as nominal and hides the toggle for %s', (moneyBasis) => {
    const p = props({ moneyBasis })
    render(<PlanOverview {...p} assumptions={{ ...p.assumptions, inflationRate: 0 }} />)
    expect(screen.getByText('Ohne Inflationsannahme (nominal)')).toBeVisible()
    expect(screen.queryByText('In heutigen Euro')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Angaben & Annahmen prüfen'))
    expect(screen.queryByRole('button', { name: 'Beträge zum Rentenbeginn (nominal) anzeigen' })).not.toBeInTheDocument()
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
    expect(screen.queryByText(blockedSourcesHint)).not.toBeInTheDocument()
    expect(screen.queryByText('Für deine Gesamtrente fehlen noch Angaben.')).not.toBeInTheDocument()
  })
})

describe('PlanOverview — offers, topic intent and assumptions (audit F04 / F12 / F18)', () => {
  const offer = {
    instanceId: 'versicherung-1', label: 'Audit Brokerangebot', productLabel: 'Private Rentenversicherung',
    contributionMonthly: 270, contributionLabel: 'Beitrag',
  }

  it('lists unsigned offers apart from the sources with review and edit actions', () => {
    const p = props({ offers: [offer], onEditOffer: vi.fn(), onReviewOffer: vi.fn() })
    render(<PlanOverview {...p} />)
    const section = screen.getByTestId('plan-offers')
    expect(within(section).getByRole('heading', { name: 'Angebote, noch nicht abgeschlossen' })).toBeVisible()
    expect(within(section).getByText(`Beitrag lt. Angebot: ${money(270)} / Monat`)).toBeVisible()
    expect(section).toHaveTextContent('Angebote zählen nicht zu deiner Rente oben.')
    expect(within(screen.getByRole('list', { name: 'Deine Rentenquellen' })).queryByText('Audit Brokerangebot')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Angebot prüfen: Audit Brokerangebot' }))
    expect(p.onReviewOffer).toHaveBeenCalledWith(offer)
    fireEvent.click(screen.getByRole('button', { name: 'Angebot bearbeiten: Audit Brokerangebot' }))
    expect(p.onEditOffer).toHaveBeenCalledWith(offer)
  })

  it('hides the review action without a review flow and the whole section without offers', () => {
    render(<PlanOverview {...props({ offers: [offer], onEditOffer: vi.fn() })} />)
    expect(screen.queryByRole('button', { name: /Angebot prüfen/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Angebot bearbeiten: Audit Brokerangebot' })).toBeVisible()
    cleanup()
    render(<PlanOverview {...props()} />)
    expect(screen.queryByTestId('plan-offers')).not.toBeInTheDocument()
  })

  it('keeps a topic arrival as a banner with add, compare and dismiss actions', () => {
    const intent = { productLabel: 'Private Rentenversicherung', onAddProduct: vi.fn(), onCompareExample: vi.fn(), onDismiss: vi.fn() }
    render(<PlanOverview {...props({ topicIntent: intent })} />)
    const banner = screen.getByTestId('plan-topic-intent')
    expect(banner).toHaveTextContent('Du hast schon einen Plan.')
    expect(banner).toHaveTextContent('Private Rentenversicherung: ergänze ein Angebot oder einen Vertrag')
    fireEvent.click(within(banner).getByRole('button', { name: 'Private Rentenversicherung ergänzen' }))
    fireEvent.click(within(banner).getByRole('button', { name: 'Beispiel vergleichen' }))
    fireEvent.click(within(banner).getByRole('button', { name: 'Ausblenden' }))
    expect(intent.onAddProduct).toHaveBeenCalledOnce()
    expect(intent.onCompareExample).toHaveBeenCalledOnce()
    expect(intent.onDismiss).toHaveBeenCalledOnce()
  })

  it('offers only the comparison when the topic names no single product, and nothing before the plan started', () => {
    const intent = { onCompareExample: vi.fn(), onDismiss: vi.fn() }
    render(<PlanOverview {...props({ topicIntent: intent })} />)
    const banner = screen.getByTestId('plan-topic-intent')
    expect(within(banner).queryByRole('button', { name: /ergänzen$/ })).not.toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Beispiel vergleichen' })).toBeVisible()
    cleanup()
    render(<PlanOverview {...props({ topicIntent: intent, hasStarted: false, hasContracts: false, summary: null })} />)
    expect(screen.queryByTestId('plan-topic-intent')).not.toBeInTheDocument()
  })

  it('puts the growth assumptions next to the result and bridges the statutory gross figure to today\'s money', () => {
    const p = props({ assumptions: {
      ...props().assumptions, returnRate: 0.05, returnScenarioLabel: 'Basis', retirementEndAge: 90,
      salaryGrowthRate: 0, pensionValueGrowthRate: 0, statutoryGrossMonthly: 2400,
    } })
    render(<PlanOverview {...p} />)
    const line = screen.getByTestId('plan-assumption-line')
    expect(line).toHaveTextContent('Rendite 5 % p. a. (Basis)')
    expect(line).toHaveTextContent('Inflation 2 %')
    expect(line).toHaveTextContent('Entnahme bis 90')
    expect(line).toHaveTextContent('Einkommen 0 % p. a.')
    expect(line).toHaveTextContent('Rentenwert 0 % p. a.')
    const bridge = screen.getByTestId('plan-statutory-bridge')
    expect(bridge).toHaveTextContent(`${money(2400)} brutto`)
    expect(bridge).toHaveTextContent(`${money(2000)} netto`)
    expect(bridge).toHaveTextContent(`${money(1440)} in heutigen Euro`)
    expect(bridge).toHaveTextContent('Renteninformation nennt Bruttobeträge')
    const details = screen.getByText('Angaben & Annahmen prüfen').closest('details')
    expect(details).not.toHaveAttribute('open')
    fireEvent.click(within(line).getByRole('button', { name: 'Alle Annahmen' }))
    expect(details).toHaveAttribute('open')
    expect(details).toHaveTextContent('beides ohne Wachstum angesetzt')
  })

  it('suppresses the assumption line and the bridge while the total is blocked', () => {
    render(<PlanOverview {...props({ assumptions: { ...props().assumptions, statutoryGrossMonthly: 2400 }, summary: { ...summary, readiness: {
      status: 'incomplete', canShowHouseholdTotal: false, reasons: [reason], blocking: [reason], assumptions: [],
    } } })} />)
    expect(screen.queryByTestId('plan-assumption-line')).not.toBeInTheDocument()
    expect(screen.queryByTestId('plan-statutory-bridge')).not.toBeInTheDocument()
  })
})
