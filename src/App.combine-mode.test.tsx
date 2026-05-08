// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import App from './App'
import { addInstanceToWorkspace } from './features/inventory/inventoryHelpers'
import { defaultWorkspace, STORAGE_KEY_V2 } from './storage'
import type { Workspace } from './domain/workspace'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState(null, '', '/')
})

function cloneWorkspace(workspace: Workspace): Workspace {
  return JSON.parse(JSON.stringify(workspace)) as Workspace
}

/**
 * App now lazy-loads `Calculator` (compare-mode + combine-mode dashboard)
 * via `React.lazy`. After `render(<App />)` the dashboard is wrapped in
 * Suspense and the chunk's import() promise resolves asynchronously. The
 * first test in the file pays the actual module-resolution cost; subsequent
 * tests hit the lazy() cache and resolve in a single microtask. We give the
 * first-load a generous timeout to absorb that one-shot cost.
 */
async function waitForCalculator(): Promise<void> {
  await waitFor(
    () => expect(document.querySelectorAll('[role="tab"]').length).toBeGreaterThan(0),
    { timeout: 8000 },
  )
}

function saveCombineWorkspace() {
  let workspace = cloneWorkspace(defaultWorkspace)
  workspace = { ...workspace, mode: 'combine' }
  workspace = addInstanceToWorkspace(workspace, 'bav')
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
  localStorage.setItem('rentenrechner-workspace-v1', 'angebot')
}

// ---------------------------------------------------------------------------
// Issue #6: ?view= query param overrides activeView on mount
// ---------------------------------------------------------------------------

describe('App — ?view= query param overrides activeView on first mount', () => {
  it('overrides saved activeView=details with ?view=vergleich', async () => {
    // Arrange: save a combine workspace whose active tab is "details".
    let workspace = cloneWorkspace(defaultWorkspace)
    workspace = { ...workspace, mode: 'combine' }
    workspace = addInstanceToWorkspace(workspace, 'bav')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
    // Simulate saved activeView = 'details'
    localStorage.setItem('rentenrechner-workspace-v1', 'details')
    window.history.pushState(null, '', '/?view=vergleich')

    const { container } = render(<App />)
    await waitForCalculator()

    // Calculator mounts the ?view= override in a useEffect, which fires after
    // the lazy chunk's first render — wait for the override to take effect
    // before snapshotting the active tab.
    await waitFor(() => {
      const tabs = Array.from(container.querySelectorAll('[role="tab"]'))
      const vergleichTab = tabs.find((t) => /bersicht/.test(t.textContent ?? ''))
      expect(vergleichTab?.getAttribute('aria-selected')).toBe('true')
    })

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'))
    // The "details" tab should NOT be active.
    const detailsTab = tabs.find((t) => /Details/.test(t.textContent ?? ''))
    expect(detailsTab?.getAttribute('aria-selected')).toBe('false')
  })

  it('does NOT persist the ?view= override to localStorage', async () => {
    // Regression: previously workspace.setActiveView triggered the persist
    // useEffect, so the one-shot URL override permanently overwrote the
    // user's saved tab. The fix routes the override through
    // setActiveViewTransient which skips the next persist.
    let workspace = cloneWorkspace(defaultWorkspace)
    workspace = { ...workspace, mode: 'combine' }
    workspace = addInstanceToWorkspace(workspace, 'bav')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
    localStorage.setItem('rentenrechner-workspace-v1', 'details')
    window.history.pushState(null, '', '/?view=vergleich')

    const { container } = render(<App />)
    await waitForCalculator()

    // Wait for the override to take effect on the visible tab.
    await waitFor(() => {
      const tabs = Array.from(container.querySelectorAll('[role="tab"]'))
      const vergleichTab = tabs.find((t) => /bersicht/.test(t.textContent ?? ''))
      expect(vergleichTab?.getAttribute('aria-selected')).toBe('true')
    })

    // localStorage should still hold the user's previously-saved tab.
    expect(localStorage.getItem('rentenrechner-workspace-v1')).toBe('details')
  })

  it('preserves saved activeView when no ?view= param is present', async () => {
    // Arrange: save a combine workspace whose active tab is "details".
    let workspace = cloneWorkspace(defaultWorkspace)
    workspace = { ...workspace, mode: 'combine' }
    workspace = addInstanceToWorkspace(workspace, 'bav')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
    localStorage.setItem('rentenrechner-workspace-v1', 'details')
    // No ?view= param — URL stays at bare /
    window.history.pushState(null, '', '/')

    const { container } = render(<App />)
    await waitForCalculator()

    // The "details" tab should be active (saved state preserved).
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'))
    const detailsTab = tabs.find((t) => /Details/.test(t.textContent ?? ''))
    expect(detailsTab).not.toBeNull()
    expect(detailsTab?.getAttribute('aria-selected')).toBe('true')
  })
})

describe('App — Mein Plan combine-mode chrome and profile editing', () => {
  it('uses a Mein Plan heading instead of comparison copy in combine mode', async () => {
    saveCombineWorkspace()
    const { container } = render(<App />)
    await waitForCalculator()

    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toContain('Mein Plan')
    expect(h1?.textContent).not.toContain('vergleichen')
  })

  it('uses plan-oriented tab labels in combine mode', async () => {
    saveCombineWorkspace()
    const { container } = render(<App />)
    await waitForCalculator()

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'))
      .map((tab) => tab.textContent ?? '')
    expect(tabs.some((tab) => /Meine Vertr.ge|Meine Vertraege/.test(tab))).toBe(true)
    expect(tabs.some((tab) => /Uebersicht|.bersicht/.test(tab))).toBe(true)
    expect(tabs).toContain('Details & Export')
    expect(tabs).not.toContain('Vergleich')
  })

  it('renders an editable personal-details section in combine mode', async () => {
    saveCombineWorkspace()
    const { container } = render(<App />)
    await waitForCalculator()

    const text = container.textContent ?? ''
    expect(/Pers.nliche Angaben|Persoenliche Angaben|Profil/.test(text)).toBe(true)
    expect(text).toContain('Bruttogehalt')
    expect(text).toContain('Renteneintrittsalter')
    expect(text).toContain('Krankenversicherung')
  })

  it('editing salary writes through to workspace baseline and persists to storage (#40)', async () => {
    saveCombineWorkspace()
    render(<App />)
    await waitForCalculator()

    // Find the Bruttogehalt input in the personal profile section.
    // The sidebar is rendered in the default "angebot" view (Meine Verträge tab).
    const allInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const bruttogehaltInput = Array.from(allInputs).find(
      (input) => {
        const field = input.closest('.combine-field')
        return field?.textContent?.includes('Bruttogehalt')
      },
    )
    expect(bruttogehaltInput).not.toBeNull()

    fireEvent.change(bruttogehaltInput!, { target: { value: '75000' } })

    // Storage is written reactively via useEffect — give React a tick then
    // read the persisted workspace directly from localStorage.
    const stored = localStorage.getItem(STORAGE_KEY_V2)
    expect(stored).not.toBeNull()
    const persisted = JSON.parse(stored!) as Workspace
    expect(persisted.baseline.profile.grossSalaryYear).toBe(75000)
  })

  it('editing retirement age writes through to workspace baseline (#40)', async () => {
    saveCombineWorkspace()
    render(<App />)
    await waitForCalculator()

    const allInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const retirementAgeInput = Array.from(allInputs).find(
      (input) => {
        const field = input.closest('.combine-field')
        return field?.textContent?.includes('Renteneintrittsalter')
      },
    )
    expect(retirementAgeInput).not.toBeNull()

    fireEvent.change(retirementAgeInput!, { target: { value: '63' } })

    const stored = localStorage.getItem(STORAGE_KEY_V2)
    expect(stored).not.toBeNull()
    const persisted = JSON.parse(stored!) as Workspace
    expect(persisted.baseline.profile.retirementAge).toBe(63)
  })
})
