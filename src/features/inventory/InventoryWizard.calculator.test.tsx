// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Calculator from '../../Calculator'
import { useWorkspaceUiState } from '../../app/useWorkspaceUiState'
import { hasStartedPlan } from '../../app/portfolioState'
import { ROUTES } from '../../app/useRoute'
import { loadSavedWorkspace } from '../../storage'
import type { LandingChoice } from '../landing/LandingPage'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

describe('Calculator onboarding hand-off', () => {
  it('persists a contract-free plan and forwards topic selection to its contract editor', async () => {
    const navigate = vi.fn()
    const choice: LandingChoice = { kind: 'combine', visibleProducts: ['etf', 'bav'] }
    function Host() {
      const ui = useWorkspaceUiState()
      return <Calculator workspaceUi={ui} navigate={navigate} pendingChoice={choice} />
    }
    render(<Host />)
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Dein Alter'), { target: { value: '41' } })
    fireEvent.change(within(dialog).getByLabelText('Jahreseinkommen brutto (€)'), { target: { value: '62000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Weiter' }))
    fireEvent.click(within(dialog).getByLabelText('Später ergänzen'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Meinen Plan ansehen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const saved = loadSavedWorkspace()!
    expect(saved.mode).toBe('combine')
    expect(hasStartedPlan(saved)).toBe(true)
    expect(saved.baseline.profile.age).toBe(41)
    expect(saved.baseline.profile.grossSalaryYear).toBe(62000)
    expect(saved.baseline.assumptions.statutoryPension.pensionEntryMethod).toEqual({ kind: 'skipped' })
    expect(saved.baseline.assumptions.etf).toEqual([])
    expect(saved.baseline.assumptions.bav).toEqual([])
    expect(navigate).toHaveBeenCalledWith(ROUTES.vorsorgeNeu, '?produkt=etf')
  })
})
