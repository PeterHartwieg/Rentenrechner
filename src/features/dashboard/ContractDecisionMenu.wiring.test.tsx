// @vitest-environment jsdom
/**
 * B1 wiring test: ContractDecisionMenu renders when activeMenuInstanceId is set.
 *
 * Mirrors the wiring in App.tsx:
 *   - activeMenuInstanceId === null → menu NOT rendered
 *   - activeMenuInstanceId === someId → <ContractDecisionMenu> rendered
 *   - onClose sets activeMenuInstanceId back to null → menu removed
 */

import { describe, expect, it } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import { afterEach } from 'vitest'
import { ContractDecisionMenu } from './ContractDecisionMenu'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { migrateV1ToV2 } from '../../storage'
import type { Workspace } from '../../domain/workspace'

afterEach(() => cleanup())

// Minimal combine-mode workspace with a pAV instance.
function makeCombineWorkspace(): { ws: Workspace; instanceId: string } {
  const v1 = {
    ...defaultAssumptions,
    visibleProducts: ['versicherung'],
    insurance: {
      ...defaultAssumptions.insurance,
      contractStartYear: 2002,
      oldContractTaxFreeEligible: true,
    },
  }
  const ws = migrateV1ToV2(
    { ...defaultProfile, age: 45, retirementAge: 67 } as unknown as Record<string, unknown>,
    v1 as unknown as Record<string, unknown>,
  )
  const instanceId = ws.baseline.assumptions.insurance[0].instanceId
  return { ws, instanceId }
}

/**
 * Minimal harness that replicates App.tsx combine-mode menu logic:
 *   const [activeMenuInstanceId, setActiveMenuInstanceId] = useState<string | null>(null)
 *   {activeMenuInstanceId !== null && <ContractDecisionMenu ... />}
 */
function MenuHarness({ workspace, instanceId }: { workspace: Workspace; instanceId: string }) {
  const [activeMenuInstanceId, setActiveMenuInstanceId] = useState<string | null>(null)
  return (
    <div>
      <button
        data-testid="open-menu"
        onClick={() => setActiveMenuInstanceId(instanceId)}
      >
        Optionen
      </button>
      {activeMenuInstanceId !== null && (
        <ContractDecisionMenu
          workspace={workspace}
          instanceId={activeMenuInstanceId}
          onClose={() => setActiveMenuInstanceId(null)}
          onCreatePlans={() => {}}
        />
      )}
    </div>
  )
}

describe('ContractDecisionMenu wiring (B1)', () => {
  it('menu is NOT rendered when activeMenuInstanceId is null', () => {
    const { ws, instanceId } = makeCombineWorkspace()
    const { container } = render(<MenuHarness workspace={ws} instanceId={instanceId} />)
    expect(container.querySelector('.contract-decision-menu')).toBeNull()
  })

  it('menu IS rendered when activeMenuInstanceId is set (Optionen button clicked)', () => {
    const { ws, instanceId } = makeCombineWorkspace()
    const { container, getByTestId } = render(<MenuHarness workspace={ws} instanceId={instanceId} />)
    expect(container.querySelector('.contract-decision-menu')).toBeNull()

    fireEvent.click(getByTestId('open-menu'))

    expect(container.querySelector('.contract-decision-menu')).toBeTruthy()
    expect(container.querySelector('.contract-decision-menu-overlay')).toBeTruthy()
  })

  it('menu closes when onClose is triggered (× button)', () => {
    const { ws, instanceId } = makeCombineWorkspace()
    const { container, getByTestId } = render(<MenuHarness workspace={ws} instanceId={instanceId} />)
    fireEvent.click(getByTestId('open-menu'))
    expect(container.querySelector('.contract-decision-menu')).toBeTruthy()

    const closeBtn = container.querySelector('.contract-decision-menu-close') as HTMLButtonElement
    fireEvent.click(closeBtn)

    expect(container.querySelector('.contract-decision-menu')).toBeNull()
  })
})
