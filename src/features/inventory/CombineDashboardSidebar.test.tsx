// @vitest-environment jsdom
/**
 * Render-integration tests for CombineDashboardSidebar.
 *
 * Uses jsdom + @testing-library/react. The component has top-level hooks
 * (`useState` for the archive double-click guard) so a real React renderer
 * is required.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, cleanup } from '@testing-library/react'
import { AddVertragSection, CombineDashboardSidebar } from './CombineDashboardSidebar'
import { addInstanceToWorkspace } from './inventoryHelpers'
import { defaultWorkspace } from '../../storage'
import type { WorkspaceAssumptionsV2, WhatIfScenario, Scenario } from '../../domain/workspace'
import type { MultiInstanceProductId } from '../../app/portfolioState'

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
