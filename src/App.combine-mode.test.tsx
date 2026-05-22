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
 *
 * Workspace-tabs collapse (this PR): the dashboard no longer renders a
 * workspace tab strip, so the pre-collapse `[role="tab"]` poll is gone. We
 * wait for the dashboard meta strip H1 instead — that mounts as soon as the
 * lazy `Calculator` chunk resolves and renders for both modes.
 */
async function waitForCalculator(): Promise<void> {
  await waitFor(
    () => expect(document.querySelector('.rw-dashboard-meta__title')).not.toBeNull(),
    { timeout: 8000 },
  )
}

/**
 * Wait for the lazy `AngabenPage` chunk to mount. The page's TOC kicker
 * ("In diesem Dokument") is the most stable signal — it renders for both
 * modes and is unique to `/eingaben`.
 */
async function waitForAngabenPage(): Promise<void> {
  await waitFor(
    () => expect(document.body.textContent ?? '').toContain('In diesem Dokument'),
    { timeout: 8000 },
  )
}

function saveCombineWorkspace() {
  let workspace = cloneWorkspace(defaultWorkspace)
  workspace = { ...workspace, mode: 'combine' }
  workspace = addInstanceToWorkspace(workspace, 'bav')
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))
}

describe('App — Mein Plan combine-mode chrome', () => {
  it('uses a Mein Plan heading instead of comparison copy in combine mode', async () => {
    saveCombineWorkspace()
    const { container } = render(<App />)
    await waitForCalculator()

    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toContain('Mein Plan')
    expect(h1?.textContent).not.toContain('vergleichen')
  })

  it('renders the Mein-Plan body inline — no workspace tab strip remains', async () => {
    // Workspace-tabs collapse: the segmented "Meine Verträge / Übersicht /
    // Details & Export" control is removed. The dashboard surface now renders
    // its content as one linear section under the meta strip.
    saveCombineWorkspace()
    const { container } = render(<App />)
    await waitForCalculator()

    // No workspace-level tablist anywhere on the page.
    expect(container.querySelector('.rw-workspace-tabs')).toBeNull()
    // The Mein-Plan host renders for combine mode regardless of any saved
    // legacy view value.
    expect(container.querySelector('.mein-plan-host')).not.toBeNull()
  })

  it('exposes the Details & Export surface inline under the headline view', async () => {
    saveCombineWorkspace()
    const { container } = render(<App />)
    await waitForCalculator()

    // Both surfaces co-exist in one document order; the `id="details"`
    // anchor is the deep-link target for future links into the export panels.
    expect(container.querySelector('.workspace-view--vergleich')).not.toBeNull()
    expect(container.querySelector('.workspace-view--details')).not.toBeNull()
    expect(container.querySelector('#details')).not.toBeNull()
  })
})

describe('App — combine-mode profile editing lives on /eingaben § 5', () => {
  // Workspace-tabs collapse: the per-contract sidebar (which carries the
  // Bruttogehalt / Renteneintrittsalter inputs in combine mode) moved out of
  // the workspace `angebot` tab and into `/eingaben` § 5 (AngabenProduktSection).
  // The behaviour-level guarantee — edits to those fields persist to
  // STORAGE_KEY_V2 — still holds; the tests now drive `/eingaben` instead of
  // an inert tab.

  it('renders the personal-details section on /eingaben in combine mode', async () => {
    saveCombineWorkspace()
    window.history.pushState(null, '', '/eingaben')
    const { container } = render(<App />)
    await waitForAngabenPage()

    const text = container.textContent ?? ''
    expect(/Pers.nliche Angaben|Persoenliche Angaben|Profil/.test(text)).toBe(true)
    expect(text).toContain('Bruttogehalt')
    expect(text).toContain('Renteneintrittsalter')
  })

  it('editing salary on /eingaben § 5 writes through to workspace baseline and persists (#40)', async () => {
    saveCombineWorkspace()
    window.history.pushState(null, '', '/eingaben')
    render(<App />)
    await waitForAngabenPage()

    // The CombineDashboardSidebar mounts as `/eingaben` § 5's body in combine
    // mode. The Bruttogehalt input lives inside a `.combine-field` wrapper
    // exactly as before — only the parent shell changed.
    await waitFor(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
      const bruttogehalt = Array.from(inputs).find((input) => {
        const field = input.closest('.combine-field')
        return field?.textContent?.includes('Bruttogehalt')
      })
      expect(bruttogehalt).not.toBeUndefined()
    })

    const allInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const bruttogehaltInput = Array.from(allInputs).find((input) => {
      const field = input.closest('.combine-field')
      return field?.textContent?.includes('Bruttogehalt')
    })!

    // DraftNumberInput commits on blur (not on change) — fire change then blur.
    fireEvent.change(bruttogehaltInput, { target: { value: '80000' } })
    fireEvent.blur(bruttogehaltInput)

    // Storage is written reactively via useEffect — give React a tick then
    // read the persisted workspace directly from localStorage.
    await waitFor(() => {
      const stored = localStorage.getItem(STORAGE_KEY_V2)
      expect(stored).not.toBeNull()
      const persisted = JSON.parse(stored!) as Workspace
      expect(persisted.baseline.profile.grossSalaryYear).toBe(80000)
    })
  })

  it('editing retirement age on /eingaben § 5 writes through to workspace baseline (#40)', async () => {
    saveCombineWorkspace()
    window.history.pushState(null, '', '/eingaben')
    render(<App />)
    await waitForAngabenPage()

    await waitFor(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
      const retirementAge = Array.from(inputs).find((input) => {
        const field = input.closest('.combine-field')
        return field?.textContent?.includes('Renteneintrittsalter')
      })
      expect(retirementAge).not.toBeUndefined()
    })

    const allInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const retirementAgeInput = Array.from(allInputs).find((input) => {
      const field = input.closest('.combine-field')
      return field?.textContent?.includes('Renteneintrittsalter')
    })!

    // DraftNumberInput commits on blur (not on change) — fire change then blur.
    fireEvent.change(retirementAgeInput, { target: { value: '63' } })
    fireEvent.blur(retirementAgeInput)

    await waitFor(() => {
      const stored = localStorage.getItem(STORAGE_KEY_V2)
      expect(stored).not.toBeNull()
      const persisted = JSON.parse(stored!) as Workspace
      expect(persisted.baseline.profile.retirementAge).toBe(63)
    })
  })
})
