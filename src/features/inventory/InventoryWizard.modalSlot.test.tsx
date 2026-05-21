// @vitest-environment jsdom
/**
 * InventoryWizard ModalSlot adoption regression tests (R2.1 / audit H1).
 *
 * Pins the visual port from the legacy inline overlay (.inventory-overlay /
 * .inventory-card / custom .inventory-header) to the shared Sober D modal
 * primitive (`src/ui/chrome/ModalSlot.tsx`).
 *
 * What we lock in here:
 *   - The wizard mounts inside `.rw-modal-slot__panel` (ModalSlot owns the
 *     dialog chrome).
 *   - The wizard's `panelClassName` extension lands on the panel
 *     (`.inventory-modal`).
 *   - The legacy `.inventory-overlay` + `.inventory-card` shells are gone.
 *   - The legacy `.inventory-header` (which used to wrap the eyebrow + H2)
 *     is gone — ModalSlot owns the eyebrow + title.
 *   - The Sober D eyebrow + title are rendered as ModalSlot's own
 *     `.rw-modal-slot__eyebrow` + `.rw-modal-slot__title`.
 *   - role="dialog" + aria-modal still wire up correctly (via ModalSlot).
 *   - The close button bears the original "Bestandsaufnahme schließen"
 *     aria-label.
 *
 * The actual interaction behaviour (step navigation, validation, evidence
 * promotion) is covered by InventoryWizard.regression.test.tsx and
 * InventoryWizard.step0.test.tsx; this file is the structural sentinel.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { InventoryWizard } from './InventoryWizard'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

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

describe('InventoryWizard — ModalSlot adoption (R2.1 / H1)', () => {
  it('renders the wizard inside .rw-modal-slot__panel', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.querySelector('.rw-modal-slot__panel')).not.toBeNull()
  })

  it('the ModalSlot panel carries the .inventory-modal modifier class', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    const panel = container.querySelector('.rw-modal-slot__panel')
    expect(panel).not.toBeNull()
    expect(panel!.classList.contains('inventory-modal')).toBe(true)
  })

  it('does not render the legacy .inventory-overlay shell', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.querySelector('.inventory-overlay')).toBeNull()
  })

  it('does not render the legacy .inventory-card shell', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.querySelector('.inventory-card')).toBeNull()
  })

  it('does not render the legacy .inventory-header (now owned by ModalSlot)', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.querySelector('.inventory-header')).toBeNull()
  })

  it('renders the Sober D eyebrow on step 0 via ModalSlot', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    const eyebrow = container.querySelector('.rw-modal-slot__eyebrow')
    expect(eyebrow).not.toBeNull()
    expect(eyebrow!.textContent).toBe('Schritt 1 von 2')
  })

  it('renders the Sober D title on step 0 via ModalSlot', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    const title = container.querySelector('.rw-modal-slot__title')
    expect(title).not.toBeNull()
    expect(title!.textContent).toBe('Deine Angaben')
  })

  it('exposes role="dialog" with aria-modal=true (inherited from ModalSlot)', () => {
    render(<InventoryWizard {...makeProps()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('keeps the "Bestandsaufnahme schließen" close-button aria-label', () => {
    render(<InventoryWizard {...makeProps()} />)
    // ModalSlot wires the same closeLabel to both the X button and the
    // backdrop, so we expect two matching elements.
    expect(screen.getAllByLabelText('Bestandsaufnahme schließen').length).toBeGreaterThanOrEqual(1)
  })

  it('still wraps the step content in .inventory-step-content for sticky-footer layout', () => {
    const { container } = render(<InventoryWizard {...makeProps()} />)
    expect(container.querySelector('.inventory-step-content')).not.toBeNull()
  })
})
