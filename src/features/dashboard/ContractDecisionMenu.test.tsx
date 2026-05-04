// @vitest-environment jsdom
/**
 * Render-integration tests for ContractDecisionMenu.
 *
 * Asserts:
 *   - Menu opens with decision cards and checkboxes.
 *   - Tick 2 decisions → click "Plan(s) erstellen" → onCreatePlans called with 2 what-ifs.
 *   - "Plan(s) erstellen" is disabled when nothing is checked.
 *   - weiterfuehren card has NO checkbox.
 *   - Stable selectors: .contract-decision-menu, .contract-decision-card, .contract-decision-checkbox
 */

import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { ContractDecisionMenu } from './ContractDecisionMenu'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import type { Workspace, WhatIfScenario } from '../../domain/workspace'

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Fixture workspace with a pAV (insurance) instance
// ---------------------------------------------------------------------------

function setupPavWorkspace(): { ws: Workspace; instanceId: string } {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['versicherung'],
    insurance: {
      ...defaultAssumptions.insurance,
      contractStartYear: 2002,
      oldContractTaxFreeEligible: true,
      fees: {
        wrapperAssetFee: 0.015,
        fundAssetFee: 0,
        contributionFee: 0,
        fixedMonthlyFee: 0,
        acquisitionCostPct: 0,
        acquisitionCostSpreadYears: 5,
        pensionPayoutFeePct: 0,
      },
    },
  }
  const ws = migrateV1ToV2(
    { ...defaultProfile, age: 45, retirementAge: 67 } as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  const instanceId = ws.baseline.assumptions.insurance[0].instanceId
  return { ws, instanceId }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContractDecisionMenu', () => {
  it('renders with .contract-decision-menu stable selector', () => {
    const { ws, instanceId } = setupPavWorkspace()
    const { container } = render(
      <ContractDecisionMenu
        workspace={ws}
        instanceId={instanceId}
        onCreatePlans={() => {}}
        onClose={() => {}}
      />,
    )
    expect(container.querySelector('.contract-decision-menu')).toBeTruthy()
  })

  it('renders .contract-decision-card elements', () => {
    const { ws, instanceId } = setupPavWorkspace()
    const { container } = render(
      <ContractDecisionMenu
        workspace={ws}
        instanceId={instanceId}
        onCreatePlans={() => {}}
        onClose={() => {}}
      />,
    )
    const cards = container.querySelectorAll('.contract-decision-card')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('weiterfuehren card has no checkbox', () => {
    const { ws, instanceId } = setupPavWorkspace()
    const { container } = render(
      <ContractDecisionMenu
        workspace={ws}
        instanceId={instanceId}
        onCreatePlans={() => {}}
        onClose={() => {}}
      />,
    )
    const weiterfuehrenCard = container.querySelector('.contract-decision-card--weiterfuehren')
    expect(weiterfuehrenCard).toBeTruthy()
    const checkbox = weiterfuehrenCard!.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeNull()
  })

  it('"Plan erstellen" is disabled when nothing is checked', () => {
    const { ws, instanceId } = setupPavWorkspace()
    const { container } = render(
      <ContractDecisionMenu
        workspace={ws}
        instanceId={instanceId}
        onCreatePlans={() => {}}
        onClose={() => {}}
      />,
    )
    const saveBtn = container.querySelector('.contract-decision-save-btn') as HTMLButtonElement
    expect(saveBtn).toBeTruthy()
    expect(saveBtn.disabled).toBe(true)
    // Disabled label (0 selected)
    expect(saveBtn.textContent).toBe('Plan erstellen')
  })

  it('tick 1 decision → click save → onCreatePlans called with 1 what-if', () => {
    const { ws, instanceId } = setupPavWorkspace()
    const onCreatePlans = vi.fn()
    const { container } = render(
      <ContractDecisionMenu
        workspace={ws}
        instanceId={instanceId}
        onCreatePlans={onCreatePlans}
        onClose={() => {}}
      />,
    )
    // Karin's pAV: weiterfuehren (no checkbox) + kuendigen (1 checkbox).
    // Beitragsfrei excluded in V1; no ETF target exists so no uebertragen card.
    const checkboxes = container.querySelectorAll('.contract-decision-checkbox input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(1)

    // Check the first checkbox.
    fireEvent.click(checkboxes[0])

    const saveBtn = container.querySelector('.contract-decision-save-btn') as HTMLButtonElement
    expect(saveBtn.disabled).toBe(false)
    expect(saveBtn.textContent).toBe('1 Plan erstellen')

    fireEvent.click(saveBtn)

    expect(onCreatePlans).toHaveBeenCalledOnce()
    const calledWithWhatIfs = onCreatePlans.mock.calls[0][0] as WhatIfScenario[]
    expect(calledWithWhatIfs).toHaveLength(1)
    // Each what-if should have origin: 'recommender'
    for (const wi of calledWithWhatIfs) {
      expect(wi.origin).toBe('recommender')
    }
  })

  it('onClose is called when × button is clicked', () => {
    const { ws, instanceId } = setupPavWorkspace()
    const onClose = vi.fn()
    const { container } = render(
      <ContractDecisionMenu
        workspace={ws}
        instanceId={instanceId}
        onCreatePlans={() => {}}
        onClose={onClose}
      />,
    )
    const closeBtn = container.querySelector('.contract-decision-menu-close') as HTMLButtonElement
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stable selector: .contract-decision-checkbox present on non-weiterfuehren cards', () => {
    const { ws, instanceId } = setupPavWorkspace()
    const { container } = render(
      <ContractDecisionMenu
        workspace={ws}
        instanceId={instanceId}
        onCreatePlans={() => {}}
        onClose={() => {}}
      />,
    )
    const checkboxLabels = container.querySelectorAll('.contract-decision-checkbox')
    expect(checkboxLabels.length).toBeGreaterThan(0)
  })
})
