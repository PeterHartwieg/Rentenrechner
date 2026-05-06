// @vitest-environment jsdom
/**
 * InventoryWizard preselection tests (issue #13 — `?topic=<slug>` deep-link).
 *
 * Verifies the new `initialEnabledProducts` prop seeds the product checklist
 * when the wizard opens via topic-preselection (combine-mode entry).
 *
 * Contract:
 *   - Without `initialEnabledProducts`, only the GRV row is checked.
 *   - With `initialEnabledProducts: ['etf', 'bav']`, those rows are checked
 *     in addition to GRV.
 *   - GRV remains universally checked and read-only regardless of the seed.
 *   - Unknown ids in the seed are silently ignored (no crash).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { InventoryWizard } from './InventoryWizard'

afterEach(cleanup)

function makeProps(overrides?: Partial<Parameters<typeof InventoryWizard>[0]>) {
  return {
    grossSalaryYear: 60_000,
    childBirthYears: [] as readonly number[],
    age: 35,
    retirementAge: 67,
    publicHealthInsurance: true,
    onComplete: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  }
}

/** Advance past step 0 (personal details) to reach the product checklist. */
function advanceToProductStep(container: HTMLElement) {
  const nextBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button[type="button"]'))
    .find((b) => b.textContent?.includes('Weiter zu deinen Verträgen'))
  if (!nextBtn) throw new Error('Could not find "Weiter zu deinen Verträgen" button')
  fireEvent.click(nextBtn)
}

describe('InventoryWizard.initialEnabledProducts (issue #13)', () => {
  it('without the prop, only GRV is checked', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    advanceToProductStep(container)

    expect(container.querySelector<HTMLInputElement>('#inventory-check-grv')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-etf')!.checked).toBe(false)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-bav')!.checked).toBe(false)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-versicherung')!.checked).toBe(false)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-riester')!.checked).toBe(false)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-basisrente')!.checked).toBe(false)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-altersvorsorgedepot')!.checked).toBe(false)
  })

  it('with ["etf"], GRV + ETF rows are checked', () => {
    const { container } = render(
      <InventoryWizard {...makeProps({ initialEnabledProducts: ['etf'] })} />,
    )
    advanceToProductStep(container)

    expect(container.querySelector<HTMLInputElement>('#inventory-check-grv')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-etf')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-bav')!.checked).toBe(false)
  })

  it('with ["etf","bav"], GRV + ETF + bAV rows are checked', () => {
    const { container } = render(
      <InventoryWizard {...makeProps({ initialEnabledProducts: ['etf', 'bav'] })} />,
    )
    advanceToProductStep(container)

    expect(container.querySelector<HTMLInputElement>('#inventory-check-grv')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-etf')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-bav')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-versicherung')!.checked).toBe(false)
  })

  it('with all 6 non-GRV products, all checklist rows are checked', () => {
    const { container } = render(
      <InventoryWizard
        {...makeProps({
          initialEnabledProducts: [
            'etf',
            'bav',
            'versicherung',
            'basisrente',
            'altersvorsorgedepot',
            'riester',
          ],
        })}
      />,
    )
    advanceToProductStep(container)

    expect(container.querySelector<HTMLInputElement>('#inventory-check-grv')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-etf')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-bav')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-versicherung')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-basisrente')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-altersvorsorgedepot')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-riester')!.checked).toBe(true)
  })

  it('GRV remains universally checked and read-only with a seed', () => {
    const { container } = render(
      <InventoryWizard {...makeProps({ initialEnabledProducts: ['etf'] })} />,
    )
    advanceToProductStep(container)

    const grvCheckbox = container.querySelector<HTMLInputElement>('#inventory-check-grv')!
    expect(grvCheckbox.checked).toBe(true)
    expect(grvCheckbox.readOnly).toBe(true)
  })

  it('preseeded products can still be unchecked via the UI', () => {
    const { container } = render(
      <InventoryWizard {...makeProps({ initialEnabledProducts: ['etf'] })} />,
    )
    advanceToProductStep(container)

    const etfCheckbox = container.querySelector<HTMLInputElement>('#inventory-check-etf')!
    expect(etfCheckbox.checked).toBe(true)

    // Click the label to toggle (mirrors the QA #01 click-target test)
    const etfLabel = container.querySelector<HTMLLabelElement>('label[for="inventory-check-etf"]')!
    fireEvent.click(etfLabel)
    expect(etfCheckbox.checked).toBe(false)
  })

  it('empty array seed leaves only GRV checked', () => {
    const { container } = render(
      <InventoryWizard {...makeProps({ initialEnabledProducts: [] })} />,
    )
    advanceToProductStep(container)

    expect(container.querySelector<HTMLInputElement>('#inventory-check-grv')!.checked).toBe(true)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-etf')!.checked).toBe(false)
    expect(container.querySelector<HTMLInputElement>('#inventory-check-bav')!.checked).toBe(false)
  })
})
