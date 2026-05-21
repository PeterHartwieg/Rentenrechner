// @vitest-environment jsdom
/**
 * Tests for wizard step 0 — personal details (QA issue #06, #36).
 *
 * Coverage:
 *  - Step 0 renders the five required fields.
 *  - Submitting step 0 (clicking Weiter) advances to the product checklist.
 *  - End-to-end: completing the wizard with step-0 data persists profile fields
 *    (age, retirementAge, grossSalaryYear, ehegattensplitting) in the workspace.
 *  - Validation errors are rendered inline when invalid data is submitted (#36).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { InventoryWizard } from './InventoryWizard'
import type { Workspace } from '../../domain/workspace'
import { eachViewport, mockViewport } from '../../test/viewport'

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function makeProps(overrides?: Partial<Parameters<typeof InventoryWizard>[0]>) {
  return {
    grossSalaryYear: 60_000,
    childBirthYears: [] as readonly number[],
    age: 35,
    retirementAge: 67,
    publicHealthInsurance: true,
    onComplete: vi.fn<(workspace: Workspace) => void>(),
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

const CURRENT_YEAR = new Date().getFullYear()
const MAX_PLANNED_CHILD_YEAR = CURRENT_YEAR + 20

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

  it('renders the Krankenversicherung field', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    const kvField = container.querySelector('[data-testid="field-public-health-insurance"]')
    expect(kvField).not.toBeNull()
    expect(kvField!.textContent).toContain('Krankenversicherung')
  })

  it('renders the Rentenbasis dropdown', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    const baseField = container.querySelector('[data-testid="field-pension-baseline"]')
    expect(baseField).not.toBeNull()
    expect(baseField!.textContent).toContain('Gesetzliche Rente')
  })

  it('renames the statutory section to Gesetzliche Altersvorsorge', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.textContent).toContain('Gesetzliche Altersvorsorge')
    expect(container.textContent).not.toContain('Mandatorische Altersversorgung')
  })

  it('renders the Kinder section', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    const childrenField = container.querySelector('[data-testid="field-children"]')
    expect(childrenField).not.toBeNull()
    expect(childrenField!.textContent).toContain('Kinder')
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

describe('InventoryWizard step 0 — planned children and empty numeric drafts', () => {
  it('labels future child birth years as geplant and accepts them up to current year + 20', () => {
    const { container } = render(
      <InventoryWizard
        {...makeProps({ childBirthYears: [CURRENT_YEAR + 1] })}
      />,
    )

    expect(container.textContent).toContain('(geplant)')
    fireEvent.click(getNextButton(container)!)

    expect(container.querySelector('[data-testid="personal-details-errors"]')).toBeNull()
    expect(container.querySelector('#inventory-check-grv')).not.toBeNull()
  })

  it('rejects child birth years beyond current year + 20', () => {
    const { container } = render(
      <InventoryWizard
        {...makeProps({ childBirthYears: [MAX_PLANNED_CHILD_YEAR + 1] })}
      />,
    )

    fireEvent.click(getNextButton(container)!)

    const errorList = container.querySelector('[data-testid="personal-details-errors"]')
    expect(errorList).not.toBeNull()
    expect(errorList!.textContent).toContain(String(MAX_PLANNED_CHILD_YEAR))
    expect(container.querySelector('#inventory-check-grv')).toBeNull()
  })

  it('allows clearing a personal-details 0 while focused without writing NaN', () => {
    const onComplete = vi.fn<(workspace: Workspace) => void>()
    const { container } = render(
      <InventoryWizard {...makeProps({ grossSalaryYear: 0, onComplete })} />,
    )
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>(
      '[data-testid="personal-details-step"] input[type="number"]',
    ))
    const salaryInput = inputs[1]
    expect(salaryInput.value).toBe('0')

    fireEvent.change(salaryInput, { target: { value: '' } })
    expect(salaryInput.value).toBe('')

    fireEvent.blur(salaryInput)
    expect(salaryInput.value).toBe('0')

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    expect(Number.isNaN(workspace.baseline.profile.grossSalaryYear)).toBe(false)
    expect(workspace.baseline.profile.grossSalaryYear).toBe(0)
  })
})

describe('InventoryWizard step 1 — GRV input mode', () => {
  it('shows an explicit either/or mode and only the selected GRV fields', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    fireEvent.click(getNextButton(container)!)

    expect(screen.getByText('Wie möchtest du deine gesetzliche Rente erfassen?')).toBeDefined()
    expect(screen.getByLabelText('Schätzen aus Arbeitsjahren und Gehalt')).toBeDefined()
    expect(screen.getByLabelText('Entgeltpunkte aus Renteninformation eingeben')).toBeDefined()
    expect(screen.getByText(/Wie viele Jahre arbeitest du schon/i)).toBeDefined()
    expect(screen.queryByText(/^Entgeltpunkte \(aus Renteninformation\)$/i)).toBeNull()

    fireEvent.click(screen.getByLabelText('Entgeltpunkte aus Renteninformation eingeben'))

    expect(screen.queryByText(/Wie viele Jahre arbeitest du schon/i)).toBeNull()
    expect(screen.getByText(/^Entgeltpunkte \(aus Renteninformation\)$/i)).toBeDefined()
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
    const onComplete = vi.fn<(workspace: Workspace) => void>()
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
    const onComplete = vi.fn<(workspace: Workspace) => void>()
    const { container } = render(<InventoryWizard {...makeProps({ age: 40, onComplete })} />)

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    // age is derived as CURRENT_YEAR - birthYear; birthYear was seeded as CURRENT_YEAR - 40
    expect(workspace.baseline.profile.age).toBe(40)
  })

  it('completing the wizard writes retirementAge into baseline.profile', () => {
    const onComplete = vi.fn<(workspace: Workspace) => void>()
    const { container } = render(<InventoryWizard {...makeProps({ retirementAge: 65, onComplete })} />)

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    expect(workspace.baseline.profile.retirementAge).toBe(65)
  })

  it('Ehegattensplitting unchecked (default): no partner on baseline', () => {
    const onComplete = vi.fn<(workspace: Workspace) => void>()
    const { container } = render(<InventoryWizard {...makeProps({ onComplete })} />)

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    expect((workspace.baseline as unknown as Record<string, unknown>).partner).toBeUndefined()
  })

  it('Ehegattensplitting checked: baseline.partner is set', () => {
    const onComplete = vi.fn<(workspace: Workspace) => void>()
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
    expect((workspace.baseline as unknown as Record<string, unknown>).partner).toBeDefined()
  })

  it('workspace is mode: combine after wizard completes', () => {
    const onComplete = vi.fn<(workspace: Workspace) => void>()
    const { container } = render(<InventoryWizard {...makeProps({ onComplete })} />)

    fireEvent.click(getNextButton(container)!)
    fireEvent.click(getFinishButton(container)!)

    const workspace: Workspace = onComplete.mock.calls[0][0]
    expect(workspace.mode).toBe('combine')
  })
})

// ---------------------------------------------------------------------------
// QA #36 — validation errors must be visible, not silent
// ---------------------------------------------------------------------------

describe('InventoryWizard step 0 — validation errors surface on invalid submit (#36)', () => {
  /**
   * Commit an invalid retirement-age value: change the retirement-age input to
   * a number below the user's current age, blur to commit, then click Weiter.
   * The error banner must appear without advancing to step 1.
   */
  function setRetirementAgeInput(container: HTMLElement, value: number) {
    // The retirement-age NumberField is the last <input type="number"> in step 0
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>(
      '[data-testid="personal-details-step"] input[type="number"]',
    ))
    const retirementInput = inputs[inputs.length - 1]
    expect(retirementInput).not.toBeNull()
    fireEvent.change(retirementInput, { target: { value: String(value) } })
    fireEvent.blur(retirementInput)
  }

  it('clicking Weiter with an invalid retirement age shows the validation-error banner', () => {
    // age=35 → retirementAge must be > 35. Setting it to 30 is invalid.
    const { container } = render(<InventoryWizard {...makeProps({ age: 35, retirementAge: 67 })} />)

    setRetirementAgeInput(container, 30)

    // Click Weiter — wizard must NOT advance
    fireEvent.click(getNextButton(container)!)

    // Error banner must be present in the DOM
    const errorList = container.querySelector('[data-testid="personal-details-errors"]')
    expect(errorList).not.toBeNull()
    expect(errorList!.textContent).toContain('Wunschrente-Alter')
  })

  it('the step does NOT advance when validation fails', () => {
    const { container } = render(<InventoryWizard {...makeProps({ age: 35, retirementAge: 67 })} />)

    setRetirementAgeInput(container, 30)
    fireEvent.click(getNextButton(container)!)

    // Still on step 0 — personal-details step still visible
    expect(container.querySelector('[data-testid="personal-details-step"]')).not.toBeNull()
    // Product checklist (step 1) is NOT visible yet
    expect(container.querySelector('#inventory-check-grv')).toBeNull()
  })

  it('onComplete is NOT called when Weiter is blocked by validation', () => {
    const onComplete = vi.fn<(workspace: Workspace) => void>()
    const { container } = render(<InventoryWizard {...makeProps({ age: 35, retirementAge: 67, onComplete })} />)

    setRetirementAgeInput(container, 30)
    fireEvent.click(getNextButton(container)!)

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('fixing the invalid field and clicking Weiter clears errors and advances', () => {
    const { container } = render(<InventoryWizard {...makeProps({ age: 35, retirementAge: 67 })} />)

    // First make it invalid
    setRetirementAgeInput(container, 30)
    fireEvent.click(getNextButton(container)!)
    expect(container.querySelector('[data-testid="personal-details-errors"]')).not.toBeNull()

    // Now fix it
    setRetirementAgeInput(container, 67)
    // Errors are cleared immediately on draft change
    expect(container.querySelector('[data-testid="personal-details-errors"]')).toBeNull()

    // Clicking Weiter now advances
    fireEvent.click(getNextButton(container)!)
    expect(container.querySelector('#inventory-check-grv')).not.toBeNull()
  })
})

describe('InventoryWizard step 0 — viewport sweep (PR 11)', () => {
  it('renders step 0 with the personal-details panel at phone / tablet / desktop', () => {
    eachViewport(() => {
      const { container, unmount } = render(<InventoryWizard {...makeProps()} />)
      expect(container.querySelector('[data-testid="personal-details-step"]')).not.toBeNull()
      unmount()
    })
  })
})
