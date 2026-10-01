// @vitest-environment jsdom
//
// Regression: a contract added on `/vorsorge/neu` must survive the navigation
// back to `/`.
//
// The workspace used to live in per-mount `useState` inside
// `usePortfolioState`, persisted by a `useEffect`. `VorsorgeNeuPage.save()`
// commits and navigates in the same handler, so the page unmounted before its
// persist effect ran; the plan's fresh hook then re-read the *stale* storage
// value and wrote that back. The status bar said "Vertrag hinzugefügt" while
// the plan stayed empty and `rentenrechner-state-v2` kept an empty `etf` array.
//
// The fix is one module-level, write-through workspace store shared by every
// mount (`src/app/portfolioState.ts`). These tests pin both halves: the store
// survives the route change, and the write reaches localStorage synchronously.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { defaultWorkspace, loadSavedWorkspace, STORAGE_KEY_V2 } from './storage'
import type { Workspace } from './domain/workspace'

vi.setConfig({ testTimeout: 20_000 })

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState(null, '', '/')
})

/** A started, contract-free combine plan — the state after onboarding. */
function seedStartedPlan(): void {
  const workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  workspace.mode = 'combine'
  workspace.baseline.lastEditedAt = Date.now()
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
}

describe('adding a contract on /vorsorge/neu', () => {
  it('keeps the contract when the save navigates straight back to the plan', async () => {
    seedStartedPlan()
    window.history.pushState(null, '', '/vorsorge/neu?produkt=etf')
    render(<App />)

    await waitFor(() => expect(screen.getByTestId('vorsorge-neu')).toBeTruthy(), {
      timeout: 8000,
    })

    // "Weiß ich nicht" for the current value, a real monthly rate — the exact
    // path from the bug report.
    fireEvent.click(screen.getByLabelText('Aktueller Wert (€): Weiß ich nicht'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Monatliche Sparrate (€)' }), {
      target: { value: '150' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zum Plan hinzufügen' }))

    // The commit reached storage synchronously, before the plan re-mounted.
    const saved = loadSavedWorkspace()
    expect(saved?.baseline.assumptions.etf).toHaveLength(1)
    expect(saved?.baseline.assumptions.etf[0].monthlyContribution).toBe(150)

    // And the plan the user lands on shows it, rather than an empty plan that
    // silently overwrites the fresh contract on its own persist.
    await waitFor(() => expect(document.querySelector('.mein-plan-shell')).not.toBeNull(), {
      timeout: 8000,
    })
    await waitFor(() => expect(screen.getAllByText(/ETF/).length).toBeGreaterThan(0))
    expect(loadSavedWorkspace()?.baseline.assumptions.etf).toHaveLength(1)
  })
})
