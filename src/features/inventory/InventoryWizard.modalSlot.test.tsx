// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InventoryWizard } from './InventoryWizard'
import { createFreshOnboardingScenario } from './onboardingDraft'

afterEach(cleanup)
describe('onboarding dialog keyboard behavior', () => {
  it.each(['profile', 'pension'] as const)('uses ModalSlot for %s and Escape restores focus to the opener', (initialStep) => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const onDismiss = vi.fn()
    const { unmount } = render(<InventoryWizard scenario={createFreshOnboardingScenario()} mode="onboarding" initialStep={initialStep} onComplete={vi.fn()} onDismiss={onDismiss} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.classList.contains('rw-modal-slot__panel')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()
    unmount()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).not.toBe('hidden')
    opener.remove()
  })

  it('wraps Tab and Shift+Tab; closed disclosures do not contain hidden inputs', () => {
    const { container } = render(<InventoryWizard scenario={createFreshOnboardingScenario()} mode="onboarding" onComplete={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.queryByLabelText('Rentenbeginn mit')).toBeNull()
    const last = screen.getByRole('button', { name: 'Weiter' })
    const first = container.querySelector<HTMLButtonElement>('.rw-modal-slot__backdrop')!
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})
