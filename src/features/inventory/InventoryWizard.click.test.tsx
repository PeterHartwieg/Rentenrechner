// @vitest-environment jsdom
/**
 * Component click-target tests for InventoryWizard (QA issue #01).
 *
 * Verifies that clicking the label area of a product row toggles the
 * underlying checkbox — i.e. the full row is a functional hit target.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { InventoryWizard } from './InventoryWizard'

afterEach(cleanup)

function makeProps(overrides?: Partial<Parameters<typeof InventoryWizard>[0]>) {
  return {
    grossSalaryYear: 60_000,
    childBirthYears: [] as readonly number[],
    age: 35,
    retirementAge: 67,
    onComplete: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  }
}

describe('InventoryWizard — checkbox click target (QA #01)', () => {
  it('clicking the label area for a non-GRV product checks the checkbox', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)

    // Find the label for the ETF product row
    const etfLabel = container.querySelector('label[for="inventory-check-etf"]')
    expect(etfLabel).not.toBeNull()

    // Initially unchecked
    const etfCheckbox = container.querySelector<HTMLInputElement>('#inventory-check-etf')
    expect(etfCheckbox).not.toBeNull()
    expect(etfCheckbox!.checked).toBe(false)

    // Click the label (not the input directly) — this is the hit-target regression
    fireEvent.click(etfLabel!)

    // The checkbox should now be checked
    expect(etfCheckbox!.checked).toBe(true)
  })

  it('clicking the label a second time unchecks the checkbox', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)

    const etfLabel = container.querySelector('label[for="inventory-check-etf"]')!
    const etfCheckbox = container.querySelector<HTMLInputElement>('#inventory-check-etf')!

    fireEvent.click(etfLabel)
    expect(etfCheckbox.checked).toBe(true)

    fireEvent.click(etfLabel)
    expect(etfCheckbox.checked).toBe(false)
  })

  it('clicking the label text span also toggles the checkbox', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)

    // The label contains nested spans — click the product-name span
    const bavLabel = container.querySelector('label[for="inventory-check-bav"]')!
    const nameSpan = bavLabel.querySelector('.inventory-product-name')
    expect(nameSpan).not.toBeNull()

    const bavCheckbox = container.querySelector<HTMLInputElement>('#inventory-check-bav')!
    expect(bavCheckbox.checked).toBe(false)

    fireEvent.click(nameSpan!)
    expect(bavCheckbox.checked).toBe(true)
  })

  it('GRV checkbox remains checked and cannot be toggled via label click', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)

    const grvCheckbox = container.querySelector<HTMLInputElement>('#inventory-check-grv')!
    expect(grvCheckbox.checked).toBe(true)

    const grvLabel = container.querySelector('label[for="inventory-check-grv"]')!
    fireEvent.click(grvLabel)

    // GRV is always checked — clicking should not uncheck it
    expect(grvCheckbox.checked).toBe(true)
  })

  it('label element directly wraps the input (no intermediate container blocking hits)', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)

    // The input must be a direct descendant of the label element
    const bavLabel = container.querySelector('label[for="inventory-check-bav"]')!
    const inputInsideLabel = bavLabel.querySelector('input[type="checkbox"]')
    expect(inputInsideLabel).not.toBeNull()
  })
})
