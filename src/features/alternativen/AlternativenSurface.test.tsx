// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { PlanSummary } from '../../app/planSummary'
import type { WhatIfScenario } from '../../domain/workspace'
import { defaultWorkspace, STORAGE_KEY_V2 } from '../../storage'
import { ROUTES } from '../../app/useRoute'
import { usePortfolioState } from '../../app/portfolioState'
import { useCombineSimulation } from '../../app/useCombineSimulation'
import { INVENTORY_PRODUCT_REGISTRY } from '../inventory/inventoryProductRegistry'
import type { AlternativenHostProps } from './AlternativenPage'
import { ALTERNATIVEN_COPY, useAlternativenFlow, type SavedAlternative } from './useAlternativenFlow'
import { AlternativenSurface } from './AlternativenSurface'

const workspace = structuredClone(defaultWorkspace)
const whatIf: WhatIfScenario = {
  ...workspace.baseline, id: 'alternative-1', label: 'Mehr ins Depot', origin: 'manual',
  createdAt: '2026-09-01T12:00:00Z', derivedFromBaselineId: workspace.baseline.id,
  derivedFromBaselineSnapshot: { ...workspace.baseline, profile: { ...workspace.baseline.profile, retirementAge: 65 } },
}
function summary(amount: number, ready = true): PlanSummary {
  return {
    pkvRetirementMonthlyCost: 0,
    netMonthlyTotalReal: amount, netMonthlyTotalNominal: 9999, deflator: 0.7, yearsUntilRetirement: 30, rows: [],
    readiness: { status: ready ? 'available' : 'incomplete', canShowHouseholdTotal: ready, reasons: [], blocking: [], assumptions: [] },
  }
}
const description = {
  instanceId: 'etf-1', instanceLabel: 'Mein Depot', productId: 'etf' as const, decision: 'contribution' as const,
  changed: true, beforeContributionMonthly: 200, afterContributionMonthly: 300,
  sourceRevision: { baselineId: workspace.baseline.id, createdAt: whatIf.createdAt, snapshotTime: 1000 },
}
const preview = { whatIf, before: summary(1800), after: summary(1900), delta: 100, description }
const item: SavedAlternative = {
  id: whatIf.id, label: whatIf.label, savedAt: whatIf.createdAt, status: 'current', canApply: true,
  description, before: preview.before, after: preview.after,
}
function host(overrides: Partial<AlternativenHostProps> = {}): AlternativenHostProps {
  return {
    contracts: [{ instanceId: 'etf-1', label: 'Mein Depot', productId: 'etf', contributionMonthly: 200,
      contributionKind: 'savingsRate', contributionStatus: 'entered', allowedDecisions: ['contribution'] }],
    draft: { instanceId: 'etf-1', decision: 'contribution', newContribution: 300 },
    selectContract: vi.fn(), setDecision: vi.fn(), setContribution: vi.fn(),
    preview: null, previewError: null, runPreview: vi.fn(), invalidatePreview: vi.fn(),
    saveAlternative: vi.fn(() => item.id), saved: [], openSaved: vi.fn(), openWhatIfId: null,
    apply: vi.fn(), rebase: vi.fn(), remove: vi.fn(), undo: vi.fn(), notification: null,
    workspace, baselineSimulation: {} as AlternativenHostProps['baselineSimulation'], whatIfs: [whatIf],
    scenarioId: 'basis', navigate: vi.fn(), onReturnToPlan: vi.fn(), ...overrides,
  }
}
// A mocked host that publishes new props as the real flow would; no calculations.
function InteractiveHost({ initial }: { initial: AlternativenHostProps }) {
  const [state, setState] = useState(initial)
  return <AlternativenSurface {...state}
    invalidatePreview={() => { initial.invalidatePreview(); setState((s) => ({ ...s, preview: null, previewError: null })) }}
    setContribution={(value) => { initial.setContribution(value); setState((s) => ({ ...s, draft: { ...s.draft, newContribution: value } })) }}
    runPreview={() => { initial.runPreview(); setState((s) => ({ ...s, preview })) }}
    saveAlternative={() => { const id = initial.saveAlternative(); setState((s) => ({ ...s, saved: [item] })); return id }}
    openSaved={(id) => { initial.openSaved(id); setState((s) => ({ ...s, openWhatIfId: id })) }}
    rebase={(id) => {
      const result = initial.rebase(id)
      if (result.ok) setState((s) => ({ ...s, saved: [{ ...item, before: summary(2100), after: summary(2200) }] }))
      return result
    }}
    remove={(id) => {
      const result = initial.remove(id)
      setState((s) => ({ ...s, saved: [], openWhatIfId: null, notification: { message: ALTERNATIVEN_COPY.removed, canUndo: true } }))
      return result
    }} />
}

afterEach(() => { cleanup(); localStorage.clear() })

describe('AlternativenSurface', () => {
  it('offers add and return with no contracts, including the empty saved list', () => {
    const props = host({ contracts: [] })
    render(<AlternativenSurface {...props} />)
    expect(screen.getByRole('heading', { name: 'Welche Vorsorge möchtest du verändern?' })).toBeInTheDocument()
    expect(screen.getByText('Ergänze zuerst eine Sparform in deinem Plan.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sparform ergänzen' }))
    expect(props.navigate).toHaveBeenCalledWith(ROUTES.vorsorgeNeu)
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zum Plan' }))
    expect(props.onReturnToPlan).toHaveBeenCalledOnce()
    expect(screen.getByText('Noch keine Alternative gespeichert.')).toBeInTheDocument()
  })

  it('shows one contract by name without a Sparform select and selects it in the draft', () => {
    const props = host({ draft: { instanceId: null, decision: 'contribution', newContribution: null } })
    render(<AlternativenSurface {...props} />)
    expect(screen.getByText('Mein Depot')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Sparform' })).not.toBeInTheDocument()
    expect(props.selectContract).toHaveBeenCalledWith('etf-1')
  })

  it('offers a labelled selector for several contracts and invalidates on selection', () => {
    const props = host()
    props.contracts.push({ ...props.contracts[0], instanceId: 'etf-2', label: 'Zweites Depot' })
    render(<AlternativenSurface {...props} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Sparform' }), { target: { value: 'etf-2' } })
    expect(props.invalidatePreview).toHaveBeenCalledOnce()
    expect(props.selectContract).toHaveBeenCalledWith('etf-2')
    expect(screen.queryByRole('option', { name: 'Keine weiteren Beiträge zahlen' })).not.toBeInTheDocument()
  })

  it('hides a preview on draft edits and focuses the result only after rerunning', () => {
    const props = host({ preview })
    render(<InteractiveHost initial={props} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Neuer monatlicher Beitrag in €' }), { target: { value: '450' } })
    expect(props.setContribution).toHaveBeenCalledWith(450)
    expect(props.invalidatePreview).toHaveBeenCalledOnce()
    expect(screen.queryByRole('heading', { name: 'Vorher und nachher' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vorher und nachher ansehen' }))
    expect(screen.getByRole('heading', { name: 'Vorher und nachher' })).toHaveFocus()
  })

  it('requires a visibly labelled numeric contribution without unknown or provenance controls', () => {
    const props = host()
    render(<InteractiveHost initial={props} />)
    const input = screen.getByRole('spinbutton', { name: 'Neuer monatlicher Beitrag in €' })
    expect(screen.getByText('Neuer monatlicher Beitrag in €')).toBeVisible()
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('step', '1')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Weiß ich nicht')).not.toBeInTheDocument()
    expect(screen.queryByText('Von dir angegeben')).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(input).toHaveValue(null)
    expect(props.setContribution).toHaveBeenLastCalledWith(null)
    fireEvent.click(screen.getByRole('button', { name: 'Vorher und nachher ansehen' }))
    expect(props.runPreview).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '-1' } })
    expect(input).toBeInvalid()
    fireEvent.click(screen.getByRole('button', { name: 'Vorher und nachher ansehen' }))
    expect(props.runPreview).not.toHaveBeenCalled()
  })

  it('renders real totals, signed delta, source contributions and the snapshot retirement age', () => {
    render(<AlternativenSurface {...host({ preview })} />)
    expect(screen.getByText('1.800 €')).toBeInTheDocument()
    expect(screen.getByText('1.900 €')).toBeInTheDocument()
    expect(screen.getByText('Änderung: +100 € / Monat')).toBeInTheDocument()
    expect(screen.getByText('Danach: 300 € / Monat')).toBeInTheDocument()
    expect(screen.getByText('Gesamt · netto pro Monat ab 65 · in heutigen Euro')).toBeInTheDocument()
    expect(screen.queryByText('9.999 €')).not.toBeInTheDocument()
    expect(screen.getByText('Die Änderung gilt erst, wenn du sie in deinen Plan übernimmst.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Vorher und nachher' }).parentElement).toHaveAttribute('aria-live', 'polite')
  })

  it.each(['before', 'after'] as const)('suppresses only the incomplete %s side and the delta', (side) => {
    render(<AlternativenSurface {...host({ preview: { ...preview, [side]: summary(0, false), delta: null } })} />)
    expect(screen.getByText('Noch offen')).toBeInTheDocument()
    expect(screen.getByText(side === 'before' ? '1.900 €' : '1.800 €')).toBeInTheDocument()
    expect(screen.queryByText(/Änderung: /)).not.toBeInTheDocument()
    expect(screen.getByText('Für eine Gesamtrente fehlen noch Angaben in deinem Plan.')).toBeInTheDocument()
  })

  it('saves and opens the saved view without applying', () => {
    const props = host({ preview })
    render(<InteractiveHost initial={props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alternative speichern' }))
    expect(props.openSaved).toHaveBeenCalledWith(item.id)
    expect(screen.getByRole('heading', { level: 1, name: item.label })).toBeInTheDocument()
    expect(screen.getByText('Gespeicherte Alternative')).toBeInTheDocument()
    expect(screen.getByText('Die Änderung gilt erst, wenn du sie in deinen Plan übernimmst.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(props.apply).not.toHaveBeenCalled()
  })

  it('blocks stale apply, keeps the frozen view, then shows recalculated values to review', () => {
    const props = host({ saved: [{ ...item, status: 'stale', canApply: false }], openWhatIfId: item.id,
      rebase: vi.fn<AlternativenHostProps['rebase']>(() => ({ ok: true, undo: {} as never })) })
    render(<InteractiveHost initial={props} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Dein Plan hat sich seit dem Speichern geändert.')
    expect(screen.queryByText('Die Änderung gilt erst, wenn du sie in deinen Plan übernimmst.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /in meinen Plan übernehmen/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gespeicherten Stand ansehen' }))
    expect(screen.getByRole('heading', { name: 'Vorher und nachher' })).toHaveFocus()
    expect(screen.getByText('1.800 €')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mit aktuellem Plan neu berechnen' }))
    expect(props.rebase).toHaveBeenCalledWith(item.id)
    expect(screen.getByRole('heading', { name: 'Änderung prüfen' })).toHaveFocus()
    expect(screen.getByText('2.100 €')).toBeInTheDocument()
    expect(screen.getByText('2.200 €')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Beitrag in meinen Plan übernehmen' })).toBeInTheDocument()
    expect(screen.getByText('Die Änderung gilt erst, wenn du sie in deinen Plan übernimmst.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(props.apply).not.toHaveBeenCalled()
  })

  it.each(['shape-drift', 'missing-source'] as const)('shows the host blockReason for %s and offers a new change', (status) => {
    render(<AlternativenSurface {...host({ saved: [{ ...item, status, canApply: false, blockReason: 'Blockgrund aus dem Hook.' }], openWhatIfId: item.id })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Blockgrund aus dem Hook.')
    expect(screen.queryByRole('button', { name: /in meinen Plan übernehmen/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neue Änderung ausprobieren' })).toBeInTheDocument()
  })

  it.each(['saved', 'preview'] as const)('returns to the plan immediately after applying a %s alternative', (view) => {
    const props = host({ ...(view === 'saved' ? { saved: [item], openWhatIfId: item.id } : { preview }),
      apply: vi.fn<AlternativenHostProps['apply']>(() => ({ ok: true, undo: {} as never })) })
    render(<AlternativenSurface {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Beitrag in meinen Plan übernehmen' }))
    expect(props.apply).toHaveBeenCalledWith(item.id)
    expect(props.onReturnToPlan).toHaveBeenCalledOnce()
  })

  it.each(['saved', 'preview'] as const)('stays and focuses an apply failure for a %s alternative', (view) => {
    const props = host({ ...(view === 'saved' ? { saved: [item], openWhatIfId: item.id } : { preview }),
      apply: vi.fn<AlternativenHostProps['apply']>(() => ({ ok: false, reason: 'stale', message: ALTERNATIVEN_COPY.stale })) })
    render(<AlternativenSurface {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Beitrag in meinen Plan übernehmen' }))
    expect(props.apply).toHaveBeenCalledWith(item.id)
    expect(screen.getByRole('alert')).toHaveTextContent(ALTERNATIVEN_COPY.stale)
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(props.onReturnToPlan).not.toHaveBeenCalled()
  })

  it('renders saved rows with dates, stale badges, open and remove actions', () => {
    const props = host({ saved: [item, { ...item, id: 'other', label: 'Andere Alternative', status: 'stale', before: null }] })
    render(<AlternativenSurface {...props} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('1.800 € → 1.900 € netto / Monat')
    expect(rows[0]).toHaveTextContent('Stand beim Speichern: 01.09.2026')
    expect(rows[1]).toHaveTextContent('Noch offen')
    expect(rows[1]).toHaveTextContent('Plan seit dem Speichern geändert')
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Vorher und nachher öffnen' }))
    expect(props.openSaved).toHaveBeenCalledWith(item.id)
  })

  it('shows remove notification immediately with working undo', () => {
    const props = host({ saved: [item], openWhatIfId: item.id })
    render(<InteractiveHost initial={props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }))
    expect(props.remove).toHaveBeenCalledWith(item.id)
    expect(screen.getByRole('status')).toHaveTextContent('Alternative entfernt.')
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Rückgängig' }))
    expect(props.undo).toHaveBeenCalledOnce()
  })

  it('shows preview errors with retry', () => {
    const props = host({ previewError: ALTERNATIVEN_COPY.simulationFailed })
    render(<AlternativenSurface {...props} />)
    expect(screen.getByRole('alert')).toHaveTextContent(ALTERNATIVEN_COPY.simulationFailed)
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(props.runPreview).toHaveBeenCalledOnce()
  })

  it.each([null, 200])('keeps an unknown source contribution (%s) editable, supports zero, and labels bAV gross contributions', (contributionMonthly) => {
    const props = host()
    props.contracts[0] = { ...props.contracts[0], productId: 'bav', contributionKind: 'grossConversion', contributionMonthly, contributionStatus: 'unknown', allowedDecisions: ['contribution', 'paid_up'] }
    props.draft.newContribution = null
    render(<InteractiveHost initial={props} />)
    const input = screen.getByRole('spinbutton', { name: 'Neuer monatlicher Bruttobeitrag zur bAV in €' })
    expect(input).toHaveValue(null)
    expect(input).toBeEnabled()
    expect(input).toBeRequired()
    expect(screen.getByText('Bisher: unbekannt')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '0' } })
    expect(input).toHaveValue(0)
    expect(props.setContribution).toHaveBeenCalledWith(0)
    expect(input).toBeValid()
    expect(screen.getByText('Bisher: unbekannt')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Änderung' }), { target: { value: 'paid_up' } })
    expect(props.setDecision).toHaveBeenCalledWith('paid_up')
    expect(props.invalidatePreview).toHaveBeenCalledTimes(2)
  })

  it('uses the paid-up explanation and apply label', () => {
    const props = host({ draft: { instanceId: 'etf-1', decision: 'paid_up', newContribution: 300 }, preview: { ...preview, description: { ...description, decision: 'paid_up' } } })
    props.contracts[0].allowedDecisions = ['contribution', 'paid_up']
    render(<AlternativenSurface {...props} />)
    expect(screen.getByText('Das vorhandene Guthaben bleibt bestehen.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Änderung in meinen Plan übernehmen' })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })
})

it('applies a fresh preview using the real flow and makes undo immediately available', () => {
  const ws = structuredClone(defaultWorkspace)
  ws.mode = 'combine'
  ws.baseline.lastEditedAt = 1000
  ws.baseline.assumptions.etf = [{ ...INVENTORY_PRODUCT_REGISTRY.etf.createDefault(2026, 1, () => 'etf-real'), label: 'Echtes Depot', monthlyContribution: 200 }]
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
  function RealHost() {
    const portfolioState = usePortfolioState()
    const baselineSimulation = useCombineSimulation(portfolioState.workspace)
    const flow = useAlternativenFlow({ workspace: portfolioState.workspace, portfolioState, baselineSimulation, scenarioId: 'basis' })
    return <>
      <span data-testid="actual-contribution">{portfolioState.workspace.baseline.assumptions.etf[0].monthlyContribution}</span>
      <AlternativenSurface {...flow} workspace={portfolioState.workspace} baselineSimulation={baselineSimulation}
        whatIfs={portfolioState.workspace.whatIfs} scenarioId="basis" navigate={vi.fn()} onReturnToPlan={vi.fn()} />
    </>
  }
  render(<RealHost />)
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Neuer monatlicher Beitrag in €' }), { target: { value: '350' } })
  fireEvent.click(screen.getByRole('button', { name: 'Vorher und nachher ansehen' }))
  expect(screen.getByTestId('actual-contribution')).toHaveTextContent('200')
  fireEvent.click(screen.getByRole('button', { name: 'Beitrag in meinen Plan übernehmen' }))
  expect(screen.getByTestId('actual-contribution')).toHaveTextContent('350')
  expect(screen.getByRole('status')).toHaveTextContent(ALTERNATIVEN_COPY.applied)
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
  expect(screen.getByTestId('actual-contribution')).toHaveTextContent('200')
})
