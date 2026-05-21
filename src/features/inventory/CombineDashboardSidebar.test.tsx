// @vitest-environment jsdom
/**
 * Render-integration tests for CombineDashboardSidebar.
 *
 * Uses jsdom + @testing-library/react. The component has top-level hooks
 * (`useState` for the archive double-click guard) so a real React renderer
 * is required.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { AddVertragSection, CombineDashboardSidebar } from './CombineDashboardSidebar'
import { addInstanceToWorkspace } from './inventoryHelpers'
import { defaultWorkspace } from '../../storage'
import type { WorkspaceAssumptionsV2, WhatIfScenario, Scenario } from '../../domain/workspace'
import type { MultiInstanceProductId } from '../../app/portfolioState'
import { eachViewport, mockViewport } from '../../test/viewport'

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function dilanWorkspace() {
  let ws = { ...defaultWorkspace }
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, 'etf')
  ws = addInstanceToWorkspace(ws, 'riester')
  return ws
}

function wrapScenario(assumptions: WorkspaceAssumptionsV2): Scenario {
  return {
    id: 'baseline',
    label: 'Baseline',
    profile: defaultWorkspace.baseline.profile,
    assumptions,
    createdAt: new Date(0).toISOString(),
    origin: 'baseline',
  }
}

function makeProps(ws: ReturnType<typeof dilanWorkspace>) {
  const { assumptions } = ws.baseline
  return {
    baseline: wrapScenario(assumptions),
    assumptions,
    whatIfs: [] as WhatIfScenario[],
    onPatchAssumptions: () => {},
    addInstance: (_id: MultiInstanceProductId) => { void _id },
    removeInstance: (_pid: MultiInstanceProductId, _iid: string) => { void _pid; void _iid },
    onRebaseWhatIf: () => {},
    onFreezeWhatIf: () => {},
    onArchiveAndRestart: () => {},
  }
}

describe('CombineDashboardSidebar — render integration', () => {
  it('Dilan-shape workspace (2 bAV + 1 ETF + 1 Riester) renders 4 instance cards total', () => {
    const ws = dilanWorkspace()
    expect(ws.baseline.assumptions.bav.length).toBe(2)
    expect(ws.baseline.assumptions.etf.length).toBe(1)
    expect(ws.baseline.assumptions.riester.length).toBe(1)

    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const cards = container.querySelectorAll('.combine-instance-card')
    expect(cards.length).toBe(4)
    cleanup()
  })

  it('adding a third bAV instance causes a fifth card to appear', () => {
    const ws = dilanWorkspace()
    const { container, rerender } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    expect(container.querySelectorAll('.combine-instance-card').length).toBe(4)

    const ws3 = addInstanceToWorkspace(ws, 'bav')
    expect(ws3.baseline.assumptions.bav.length).toBe(3)
    rerender(<CombineDashboardSidebar {...makeProps(ws3)} />)

    expect(container.querySelectorAll('.combine-instance-card').length).toBe(5)
    cleanup()
  })

  it('M1 limitation banner is removed (issue 15) — no .inv-m1-banner nodes render', () => {
    const ws = addInstanceToWorkspace(dilanWorkspace(), 'versicherung')
    expect(ws.baseline.assumptions.insurance.length).toBe(1)

    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const banners = container.querySelectorAll('.inv-m1-banner')
    expect(banners.length).toBe(0)
    cleanup()
  })
})

describe('CombineDashboardSidebar — editable Mein Plan fields (#39)', () => {
  it('ETF instances expose Sparrate and current depot value fields', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'etf')
    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)

    expect(container.textContent).toContain('Monatliche Sparrate')
    expect(container.textContent).toContain('Aktueller Depotwert')
    cleanup()
  })

  it('bAV instances expose every onboarding-collected contract field after onboarding', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'bav')
    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)

    const text = container.textContent ?? ''
    expect(text).toContain('Aktueller Vertragswert')
    expect(text).toContain('Status')
    expect(text).toContain('Anbieter')
    expect(/Durchf.hrungsweg|Durchfuehrungsweg/.test(text)).toBe(true)
    expect(text).toContain('Auszahlungsform')
    expect(text).toContain('Garantierter Rentenfaktor')
    cleanup()
  })
})

describe('AddVertragSection — draft-before-save flow (#45)', () => {
  it('does not mutate the baseline immediately when a product type is chosen', () => {
    const addInstance = vi.fn()
    const { container } = render(<AddVertragSection addInstance={addInstance} />)

    const openButton = container.querySelector<HTMLButtonElement>('[data-testid="add-vertrag-btn"]')
    expect(openButton).not.toBeNull()
    fireEvent.click(openButton!)

    const etfOption = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('ETF-Sparplan'))
    expect(etfOption).not.toBeNull()
    fireEvent.click(etfOption!)

    expect(addInstance).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Monatliche Sparrate')
    cleanup()
  })

  it('saves a populated ETF instance (not defaults) on Vertrag speichern', () => {
    const addInstance = vi.fn()
    const addPopulatedInstance = vi.fn()
    const { container } = render(
      <AddVertragSection addInstance={addInstance} addPopulatedInstance={addPopulatedInstance} />,
    )

    const openButton = container.querySelector<HTMLButtonElement>('[data-testid="add-vertrag-btn"]')
    expect(openButton).not.toBeNull()
    fireEvent.click(openButton!)

    const etfOption = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('ETF-Sparplan'))
    expect(etfOption).not.toBeNull()
    fireEvent.click(etfOption!)

    // Fill in draft fields: Monatliche Sparrate = 350, Aktueller Depotwert = 5000
    // The ETF form renders: inputs[0] = Vertragsbeginn, inputs[1] = Sparrate, inputs[2] = Depotwert
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]')
    fireEvent.change(inputs[1], { target: { value: '350' } })
    fireEvent.change(inputs[2], { target: { value: '5000' } })

    const saveButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Vertrag speichern'))
    expect(saveButton).not.toBeNull()
    fireEvent.click(saveButton!)

    expect(addInstance).not.toHaveBeenCalled()
    expect(addPopulatedInstance).toHaveBeenCalledWith(
      'etf',
      expect.objectContaining({
        monthlyContribution: 350,
        currentValueEUR: 5000,
      }),
    )
    cleanup()
  })

  it('saves user-confirmed bAV fee/Rentenfaktor/payout mode (not hardcoded defaults)', () => {
    const addInstance = vi.fn()
    const addPopulatedInstance = vi.fn()
    const { container } = render(
      <AddVertragSection addInstance={addInstance} addPopulatedInstance={addPopulatedInstance} />,
    )

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-testid="add-vertrag-btn"]')!)

    const bavOption = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent === 'Betriebliche AV (bAV)')
    expect(bavOption).not.toBeNull()
    fireEvent.click(bavOption!)

    // bAV draft: number inputs in order = Vertragsbeginn, Brutto-Umwandlung,
    // Aktueller Vertragswert, Effektivkosten, Garantierter Rentenfaktor.
    const numberInputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]')
    fireEvent.change(numberInputs[3], { target: { value: '1.5' } })
    fireEvent.change(numberInputs[4], { target: { value: '32' } })

    // Auszahlungsform select — switch to Zeitrente.
    const payoutSelect = Array.from(container.querySelectorAll<HTMLSelectElement>('select'))
      .find((s) => Array.from(s.options).some((o) => o.value === 'kapitalverzehr'))
    expect(payoutSelect).not.toBeNull()
    fireEvent.change(payoutSelect!, { target: { value: 'zeitrente' } })

    fireEvent.click(
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.includes('Vertrag speichern'))!,
    )

    expect(addPopulatedInstance).toHaveBeenCalledTimes(1)
    const [, instance] = addPopulatedInstance.mock.calls[0]
    expect(instance.payoutMode).toBe('zeitrente')
    expect(instance.rentenfaktor).toBe(32)
    // Effektivkosten 1.5 % is stored as 0.015 (decimal) on wrapperAssetFee.
    expect(instance.fees.wrapperAssetFee).toBeCloseTo(0.015, 6)
    cleanup()
  })

  it('draft numeric field: clearing to empty does not commit 0 to workspace state', () => {
    // Use an ETF instance card which has a Monatliche Sparrate (monthlyContribution) field.
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'etf')
    const etfInstance = ws.baseline.assumptions.etf[0]
    expect(etfInstance).toBeDefined()
    // Set a known non-zero value.
    const sparRate = etfInstance.monthlyContribution ?? 100
    expect(sparRate).toBeGreaterThan(0)

    const onPatchAssumptions = vi.fn()
    const { container } = render(
      <CombineDashboardSidebar {...makeProps(ws)} onPatchAssumptions={onPatchAssumptions} />,
    )

    // Find the Monatliche Sparrate input (ETF card).
    const allInputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]')
    // Find the one whose value matches the sparRate.
    const sparrateInput = Array.from(allInputs).find(
      (inp) => inp.value === String(sparRate),
    )
    expect(sparrateInput).not.toBeUndefined()

    // Simulate the user clearing the field (deleting all characters).
    fireEvent.change(sparrateInput!, { target: { value: '' } })

    // onPatchAssumptions must NOT have been called — empty field is a transient state.
    expect(onPatchAssumptions).not.toHaveBeenCalled()

    cleanup()
  })

  it('draft numeric field: typing a new value commits on blur', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'etf')
    const etfInstance = ws.baseline.assumptions.etf[0]
    const sparRate = etfInstance.monthlyContribution ?? 100

    const onPatchAssumptions = vi.fn()
    const { container } = render(
      <CombineDashboardSidebar {...makeProps(ws)} onPatchAssumptions={onPatchAssumptions} />,
    )

    const allInputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const sparrateInput = Array.from(allInputs).find(
      (inp) => inp.value === String(sparRate),
    )
    expect(sparrateInput).not.toBeUndefined()

    // Simulate deleting the current value and typing a new one.
    fireEvent.change(sparrateInput!, { target: { value: '' } })
    expect(onPatchAssumptions).not.toHaveBeenCalled()

    fireEvent.change(sparrateInput!, { target: { value: '300' } })
    // Still not committed — just a draft change.
    expect(onPatchAssumptions).not.toHaveBeenCalled()

    // Commit on blur.
    fireEvent.blur(sparrateInput!)
    expect(onPatchAssumptions).toHaveBeenCalledTimes(1)
    const [patch] = onPatchAssumptions.mock.calls[0]
    expect(patch.etf).toBeDefined()
    expect(patch.etf[0].monthlyContribution).toBe(300)

    cleanup()
  })

  it('draft numeric field: typing a new value commits on Enter', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'etf')
    const etfInstance = ws.baseline.assumptions.etf[0]
    const sparRate = etfInstance.monthlyContribution ?? 100

    const onPatchAssumptions = vi.fn()
    const { container } = render(
      <CombineDashboardSidebar {...makeProps(ws)} onPatchAssumptions={onPatchAssumptions} />,
    )

    const allInputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const sparrateInput = Array.from(allInputs).find(
      (inp) => inp.value === String(sparRate),
    )
    expect(sparrateInput).not.toBeUndefined()

    fireEvent.change(sparrateInput!, { target: { value: '250' } })
    expect(onPatchAssumptions).not.toHaveBeenCalled()

    // Commit on Enter key.
    fireEvent.keyDown(sparrateInput!, { key: 'Enter' })
    expect(onPatchAssumptions).toHaveBeenCalledTimes(1)
    const [patch] = onPatchAssumptions.mock.calls[0]
    expect(patch.etf[0].monthlyContribution).toBe(250)

    cleanup()
  })

  it('draft numeric field: non-finite input (empty after full delete) does not commit on blur', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'etf')
    const etfInstance = ws.baseline.assumptions.etf[0]
    const sparRate = etfInstance.monthlyContribution ?? 100

    const onPatchAssumptions = vi.fn()
    const { container } = render(
      <CombineDashboardSidebar {...makeProps(ws)} onPatchAssumptions={onPatchAssumptions} />,
    )

    const allInputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const sparrateInput = Array.from(allInputs).find(
      (inp) => inp.value === String(sparRate),
    )
    expect(sparrateInput).not.toBeUndefined()

    fireEvent.change(sparrateInput!, { target: { value: '' } })
    fireEvent.blur(sparrateInput!)

    // Empty string must not commit anything.
    expect(onPatchAssumptions).not.toHaveBeenCalled()

    cleanup()
  })

  it('captures a bAV offer before saving it to Mein Plan', () => {
    const addInstance = vi.fn()
    const addBavOffer = vi.fn()
    const { container } = render(
      <AddVertragSection addInstance={addInstance} addBavOffer={addBavOffer} />,
    )

    const openButton = container.querySelector<HTMLButtonElement>('[data-testid="add-vertrag-btn"]')
    expect(openButton).not.toBeNull()
    fireEvent.click(openButton!)

    const offerOption = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('bAV-Angebot'))
    expect(offerOption).not.toBeNull()
    fireEvent.click(offerOption!)

    const inputs = container.querySelectorAll<HTMLInputElement>('input')
    fireEvent.change(inputs[0], { target: { value: 'Muster AG' } })
    fireEvent.change(inputs[2], { target: { value: '30' } })
    fireEvent.change(inputs[3], { target: { value: '50' } })

    const saveButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Angebot speichern'))
    expect(saveButton).not.toBeNull()
    fireEvent.click(saveButton!)

    expect(addInstance).not.toHaveBeenCalled()
    expect(addBavOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        anbieter: 'Muster AG',
        contractualMatchPercent: 0.3,
        contractualFixedMonthly: 50,
      }),
    )
    cleanup()
  })
})

// ---------------------------------------------------------------------------
// Programmatic label association (issue #69)
// ---------------------------------------------------------------------------

describe('CombineDashboardSidebar — programmatic label association (a11y #69)', () => {
  it('ETF instance: getByLabelText finds the Monatliche Sparrate numeric input', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'etf')
    render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const input = screen.getByLabelText('Monatliche Sparrate') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('number')
    cleanup()
  })

  it('bAV instance: getByLabelText finds the Auszahlungsform select', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'bav')
    render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const select = screen.getByLabelText('Auszahlungsform') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    cleanup()
  })

  it('PersonalProfileSection: getByLabelText finds the Alter numeric input', () => {
    const ws = { ...defaultWorkspace, mode: 'combine' } as typeof defaultWorkspace
    render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const input = screen.getByLabelText('Alter') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('number')
    cleanup()
  })

  it('PersonalProfileSection: getByLabelText finds the Krankenversicherung select', () => {
    const ws = { ...defaultWorkspace, mode: 'combine' } as typeof defaultWorkspace
    render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const select = screen.getByLabelText('Krankenversicherung') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    cleanup()
  })

  it('PR 11 viewport sweep — sidebar renders at phone / tablet / desktop', () => {
    const ws = dilanWorkspace()
    eachViewport(() => {
      const { container, unmount } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
      // Sidebar renders an "Add Vertrag" section across every viewport (the
      // chrome itself folds via RightRailAccordion on phone; the underlying
      // DOM is the same).
      expect(container.firstElementChild).not.toBeNull()
      unmount()
    })
  })
})

// ---------------------------------------------------------------------------
// H11: Vertragsdaten right-rail metadata table + action buttons (R2.4)
// ---------------------------------------------------------------------------

describe('CombineDashboardSidebar — Vertragsdaten right-rail (H11)', () => {
  it('.combine-sidebar class is present for the 280px rail width token', () => {
    const ws = dilanWorkspace()
    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    // The outermost rendered element carries .combine-sidebar so the
    // min-width: 280px rule in CombineDashboardSidebar.css applies.
    const sidebar = container.querySelector('.combine-sidebar')
    expect(sidebar).not.toBeNull()
    cleanup()
  })

  it('each instance card renders a vertragdaten-table panel', () => {
    const ws = dilanWorkspace() // 2 bAV + 1 ETF + 1 Riester = 4 cards
    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const tables = container.querySelectorAll('[data-testid="vertragdaten-table"]')
    expect(tables.length).toBe(4)
    cleanup()
  })

  it('each vertragdaten-table has exactly 8 metadata rows', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'bav')
    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const table = container.querySelector('[data-testid="vertragdaten-table"]')
    expect(table).not.toBeNull()
    const rows = table!.querySelectorAll('.cds-vertragdaten-row')
    expect(rows.length).toBe(8)
    cleanup()
  })

  it('vertragdaten-table contains the 8 canonical row labels', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'bav')
    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const tableText = container.querySelector('[data-testid="vertragdaten-table"]')!.textContent ?? ''
    for (const label of ['Vertragsnummer', 'Produkt', 'Schicht', 'Anbieter', 'Vertragsbeginn', 'Beitragshöhe', 'Garantiezins', 'Stand']) {
      expect(tableText).toContain(label)
    }
    cleanup()
  })

  it('"Vertrag bearbeiten" button is present on a bAV card', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'bav')
    render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const editBtn = screen.getByRole('button', { name: 'Vertrag bearbeiten' })
    expect(editBtn).toBeDefined()
    cleanup()
  })

  it('"Vertrag entfernen" button is present on a bAV card when canRemove=true (2+ instances)', () => {
    // canRemove is true only when there are 2 or more instances of the product.
    let ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'bav')
    ws = addInstanceToWorkspace(ws, 'bav')
    render(<CombineDashboardSidebar {...makeProps(ws)} />)
    // With 2 bAV cards, both should show "Vertrag entfernen".
    const removeBtns = screen.getAllByRole('button', { name: 'Vertrag entfernen' })
    expect(removeBtns.length).toBe(2)
    cleanup()
  })

  it('"Vertrag entfernen" click calls removeInstance with the correct product + instanceId', () => {
    let ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'bav')
    ws = addInstanceToWorkspace(ws, 'bav')
    const firstInstanceId = ws.baseline.assumptions.bav[0].instanceId

    const removeInstance = vi.fn()
    const props = { ...makeProps(ws), removeInstance }
    render(<CombineDashboardSidebar {...props} />)

    const removeBtns = screen.getAllByRole('button', { name: 'Vertrag entfernen' })
    fireEvent.click(removeBtns[0])

    expect(removeInstance).toHaveBeenCalledTimes(1)
    expect(removeInstance).toHaveBeenCalledWith('bav', firstInstanceId)
    cleanup()
  })

  it('vertragdaten-table for ETF shows Schicht 3', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'etf')
    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const tableText = container.querySelector('[data-testid="vertragdaten-table"]')!.textContent ?? ''
    expect(tableText).toContain('Schicht 3')
    cleanup()
  })

  it('vertragdaten-table for Basisrente shows Schicht 1', () => {
    const ws = addInstanceToWorkspace({ ...defaultWorkspace, mode: 'combine' }, 'basisrente')
    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const tableText = container.querySelector('[data-testid="vertragdaten-table"]')!.textContent ?? ''
    expect(tableText).toContain('Schicht 1')
    cleanup()
  })
})
