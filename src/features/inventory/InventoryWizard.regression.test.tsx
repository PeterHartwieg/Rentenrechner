// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { InventoryWizard } from './InventoryWizard'
import type { Workspace } from '../../domain/workspace'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

function makeProps(overrides?: Partial<Parameters<typeof InventoryWizard>[0]>) {
  return {
    grossSalaryYear: 75_000,
    childBirthYears: [] as readonly number[],
    age: 35,
    retirementAge: 67,
    publicHealthInsurance: true,
    onComplete: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  }
}

function advanceToProductStep(container: HTMLElement) {
  const nextBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button[type="button"]'))
    .find((b) => b.textContent?.includes('Weiter zu deinen'))
  if (!nextBtn) throw new Error('Could not find step-0 next button')
  fireEvent.click(nextBtn)
}

function checkProduct(container: HTMLElement, productId: string) {
  const checkbox = container.querySelector<HTMLInputElement>(`#inventory-check-${productId}`)
  if (!checkbox) throw new Error(`Could not find product checkbox ${productId}`)
  fireEvent.click(checkbox)
}

function completeWizard(container: HTMLElement) {
  const doneBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button[type="button"]'))
    .find((b) => b.textContent?.includes('Fertig') || b.textContent?.includes('Weiter ohne'))
  if (!doneBtn) throw new Error('Could not find wizard completion button')
  fireEvent.click(doneBtn)
}

function findInventoryField(container: HTMLElement, label: RegExp): HTMLElement {
  const labelNode = Array.from(container.querySelectorAll<HTMLElement>('.inventory-field > span, .inventory-field label'))
    .find((node) => label.test(node.textContent ?? ''))
  if (!labelNode) throw new Error(`Could not find inventory field ${label}`)
  const field = labelNode.closest<HTMLElement>('.inventory-field')
  if (!field) throw new Error(`Could not find .inventory-field ancestor for ${label}`)
  return field
}

function numberInput(field: HTMLElement): HTMLInputElement {
  const input = field.querySelector<HTMLInputElement>('input[type="number"]')
  if (!input) throw new Error('Expected numeric input in field')
  return input
}

function findGenericNumberInput(container: HTMLElement, label: RegExp): HTMLInputElement {
  const labelNode = Array.from(container.querySelectorAll<HTMLElement>('.field > span'))
    .find((node) => label.test(node.textContent ?? ''))
  if (!labelNode) throw new Error(`Could not find generic field ${label}`)
  const field = labelNode.closest<HTMLElement>('.field')
  const input = field?.querySelector<HTMLInputElement>('input[type="number"]')
  if (!input) throw new Error(`Expected generic numeric input in ${label}`)
  return input
}

describe('InventoryWizard regressions for fresh issue sessions', () => {
  it('promotes bAV Effektivkosten evidence when the user edits the field', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    advanceToProductStep(container)
    checkProduct(container, 'bav')

    const feeField = findInventoryField(container, /Effektivkosten p\.a\./)
    expect(feeField.querySelector('.evidence-badge--estimate')).not.toBeNull()

    fireEvent.change(numberInput(feeField), { target: { value: '2.7' } })

    expect(feeField.querySelector('.evidence-badge--confirmed')).not.toBeNull()
    expect(feeField.querySelector('.evidence-badge--estimate')).toBeNull()
  })

  it('persists confirmed bAV fee evidence when completing after an edit', () => {
    const onComplete = vi.fn<(workspace: Workspace) => void>()
    const { container } = render(<InventoryWizard {...makeProps({ onComplete })} />)
    advanceToProductStep(container)
    checkProduct(container, 'bav')

    const feeField = findInventoryField(container, /Effektivkosten p\.a\./)
    fireEvent.change(numberInput(feeField), { target: { value: '2.7' } })
    completeWizard(container)

    const workspace = onComplete.mock.calls[0]?.[0]
    expect(workspace).toBeDefined()
    expect(workspace.baseline.assumptions.bav[0].fees.wrapperAssetFee).toBeCloseTo(0.027)
    expect(workspace.baseline.assumptions.bav[0].evidenceMap['fees.wrapperAssetFee'])
      .toBe('user_confirmed')
  })

  it('promotes pAV Effektivkosten evidence when the user edits Einzelposten details', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    advanceToProductStep(container)
    checkProduct(container, 'versicherung')

    const feeField = findInventoryField(container, /Effektivkosten p\.a\./)
    expect(feeField.querySelector('.evidence-badge--estimate')).not.toBeNull()

    fireEvent.click(container.querySelector('.inv-layer3-summary')!)
    const einzelpostenTab = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Einzelposten')
    if (!einzelpostenTab) throw new Error('Could not find Einzelposten tab')
    fireEvent.click(einzelpostenTab)

    const fundInput = findGenericNumberInput(container, /Fondskosten/)
    fireEvent.change(fundInput, { target: { value: '0.3' } })
    fireEvent.blur(fundInput)

    expect(feeField.querySelector('.evidence-badge--confirmed')).not.toBeNull()
    expect(feeField.querySelector('.evidence-badge--estimate')).toBeNull()
  })

  it.each([
    ['bav', 'bav'],
    ['versicherung', 'insurance'],
    ['basisrente', 'basisrente'],
  ] as const)('does not save a zero onboarding fee default for %s', (productId, slot) => {
    const onComplete = vi.fn<(workspace: Workspace) => void>()
    const { container } = render(<InventoryWizard {...makeProps({ onComplete })} />)
    advanceToProductStep(container)
    checkProduct(container, productId)
    completeWizard(container)

    const workspace = onComplete.mock.calls[0]?.[0]
    expect(workspace).toBeDefined()
    const assumptions = workspace.baseline.assumptions
    const first = assumptions[slot][0]
    expect(first.fees.wrapperAssetFee + first.fees.fundAssetFee).toBeGreaterThan(0)
  })

  it('renders add-instance buttons without a duplicate literal plus', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    advanceToProductStep(container)
    checkProduct(container, 'bav')

    const addButton = container.querySelector<HTMLButtonElement>('.inv-add-instance-btn')
    expect(addButton).not.toBeNull()
    expect(addButton?.textContent?.trim()).toMatch(/^weitere bAV/)
    expect(addButton?.textContent?.trim()).not.toMatch(/^\+/)
  })
})
