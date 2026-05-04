// @vitest-environment jsdom
/**
 * Tests for wizard step 0 — personal details (QA issue #06).
 *
 * Coverage:
 *  - Step 0 renders the five required fields.
 *  - Submitting step 0 (clicking Weiter) advances to the product checklist.
 *  - End-to-end: completing the wizard with step-0 data persists profile fields
 *    (age, retirementAge, grossSalaryYear, ehegattensplitting) in the workspace.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { InventoryWizard } from './InventoryWizard'
import type { Workspace } from '../../domain/workspace'

afterEach(cleanup)

function makeProps(overrides?: Partial<Parameters<typeof InventoryWizard>[0]>) {
  return {
    grossSalaryYear: 60_000,
    childBirthYears: [] as readonly number[],
    age: 35,
    retirementAge: 67,
    onComplete: vi.fn<[Workspace], void>(),
    onDismiss: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNextButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[type="button"]'))
    .find((b) => b.textContent?.includes('Weiter zu deinen Verträgen'))
}

function getFinishButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[type="button"]'))
    .find((b) => b.textContent?.includes('Fertig') || b.textContent?.includes('Weiter ohne'))
}

// ---------------------------------------------------------------------------
// Step 0 renders the five required fields
// ---------------------------------------------------------------------------

describe('InventoryWizard step 0 — personal details fields', () => {
  it('renders the personal-details step on initial mount (before any interaction)', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.querySelector('[data-testid="personal-details-step"]')).not.toBeNull()
  })

  it('renders the birth-year field', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    // NumberField renders a label with "Geburtsjahr" and an input
    expect(container.textContent).toContain('Geburtsjahr')
  })

  it('renders the gross-salary field', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.textContent).toContain('Bruttogehalt')
  })

  it('renders the Steuerklasse field', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    const steuerkField = container.querySelector('[data-testid="field-steuerklasse"]')
    expect(steuerkField).not.toBeNull()
    expect(steuerkField!.textContent).toContain('Steuerklasse')
  })

  it('renders the Ehegattensplitting toggle', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    const field = container.querySelector('[data-testid="field-ehegattensplitting"]')
    expect(field).not.toBeNull()
    expect(field!.textContent).toContain('Ehegattensplitting')
  })

  it('renders the retirement-age field', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.textContent).toContain('Renteneintrittsalter')
  })

  it('shows "Schritt 1 von 2" eyebrow on step 0', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.textContent).toContain('Schritt 1 von 2')
  })

  it('shows "Weiter zu deinen Verträgen" button', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(getNextButton(container)).not.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Submitting step 0 advances to the product checklist
// ---------------------------------------------------------------------------

describe('InventoryWizard step 0 — Weiter button advances to product step', () => {
  it('clicking Weiter shows the product checklist (GRV checkbox appears)', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)

    // Step 0: product checkboxes are NOT yet visible
    expect(container.querySelector('#inventory-check-grv')).toBeNull()

    // Click Weiter
    fireEvent.click(getNextButton(container)!)

    // Step 1: product checklist is now visible
    expect(container.querySelector('#inventory-check-grv')).not.toBeNull()
  })

  it('clicking Weiter shows "Schritt 2 von 2" eyebrow', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    fireEvent.click(getNextButton(container)!)
    expect(container.textContent).toContain('Schritt 2 von 2')
  })

  it('clicking Weiter hides the personal-details step', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    fireEvent.click(getNextButton(container)!)
    expect(container.querySelector('[data-testid="personal-details-step"]')).toBeNull()
  })

  it('after advancing, the Fertig/Weiter-ohne button is visible', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    fireEvent.click(getNextButton(container)!)
    expect(getFinishButton(container)).not.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// End-to-end: profile fields persist in workspace after wizard completes
// ---------------------------------------------------------------------------

describe('InventoryWizard step 0 — end-to-end profile persistence', () => {
  it('completing the wizard writes grossSalaryYear from step 0 into baseline.profile', () => {
    const onComplete = vi.fn<[Workspace], void>()
    const { container } = render(<InventoryWizard {...makeProps({ onComplete })} />)

    // The birth year input is seeded from age prop (35 → birthYear = CURRENT_YEAR - 35)
    // Advance past step 0
    fireEvent.click(getNextButton(container)!)

    // Complete wizard
    fireEvent.click(getFinishButton(container)!)

    expect(onComplete).toHaveBeenCalledOnce()
    const workspace: Workspace = onComplete.mock.calls[0][0]
    expect(workspace.baseline.profile.grossSalaryYear).toBe(60_000)
  })

  it('completing the wizard writes age (derived from birthYear) into baseline.profile', () => {
    const onComplete = vi.fn<[Workspace], void>()
    const { container } = render(<InventoryWizard {...makeProps({ age: 40, onComplete })} />)

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    // age is derived as CURRENT_YEAR - birthYear; birthYear was seeded as CURRENT_YEAR - 40
    expect(workspace.baseline.profile.age).toBe(40)
  })

  it('completing the wizard writes retirementAge into baseline.profile', () => {
    const onComplete = vi.fn<[Workspace], void>()
    const { container } = render(<InventoryWizard {...makeProps({ retirementAge: 65, onComplete })} />)

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    expect(workspace.baseline.profile.retirementAge).toBe(65)
  })

  it('Ehegattensplitting unchecked (default): no partner on baseline', () => {
    const onComplete = vi.fn<[Workspace], void>()
    const { container } = render(<InventoryWizard {...makeProps({ onComplete })} />)

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    expect((workspace.baseline as Record<string, unknown>).partner).toBeUndefined()
  })

  it('Ehegattensplitting checked: baseline.partner is set', () => {
    const onComplete = vi.fn<[Workspace], void>()
    const { container } = render(<InventoryWizard {...makeProps({ onComplete })} />)

    // Tick the Ehegattensplitting checkbox
    const splittingCheckbox = container.querySelector<HTMLInputElement>(
      '[data-testid="field-ehegattensplitting"] input[type="checkbox"]',
    )
    expect(splittingCheckbox).not.toBeNull()
    fireEvent.click(splittingCheckbox!)

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    expect((workspace.baseline as Record<string, unknown>).partner).toBeDefined()
  })

  it('workspace is mode: combine after wizard completes', () => {
    const onComplete = vi.fn<[Workspace], void>()
    const { container } = render(<InventoryWizard {...makeProps({ onComplete })} />)

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    expect(workspace.mode).toBe('combine')
  })
})
