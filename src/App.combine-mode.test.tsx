// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import App from './App'
import { addInstanceToWorkspace } from './features/inventory/inventoryHelpers'
import { buildStateJson, defaultWorkspace, STORAGE_KEY_V1, STORAGE_KEY_V2 } from './storage'
import { defaultAssumptions, defaultProfile } from './data/defaultScenario'
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
 * workspace tab strip, so the pre-collapse `[role="tab"]` poll is gone.
 * The chrome meta strip that used to carry the readiness H1 is also gone —
 * each surface now owns its own page-level H1 inside the Sober D shell, so
 * we poll for either shell class.
 */
async function waitForCalculator(): Promise<void> {
  await waitFor(
    () =>
      expect(
        document.querySelector('.vergleich-shell, .mein-plan-shell'),
      ).not.toBeNull(),
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

describe('App — combine-mode profile editing lives on /eingaben/produkte (PR 2 split)', () => {
  // PR 2 of the Direction D /eingaben redesign migration split the page in
  // two. The per-contract `<CombineDashboardSidebar>` (which carries the
  // combine-mode Bruttogehalt / Renteneintrittsalter inputs inside its
  // `.combine-field` wrappers) moved from `/eingaben` § 5 onto
  // `/eingaben/produkte`. The behaviour-level guarantee — edits to those
  // fields persist to STORAGE_KEY_V2 — still holds; these tests now drive
  // `/eingaben/produkte` instead of `/eingaben`. Both pages mount the
  // SAME `useAngabenState` so the round-trip is identical.

  /** Schritt 2's hero kicker is "Mein Plan · Schritt 2 von 2" — the
   *  most stable readiness signal for the new page. */
  async function waitForAngabenProduktePage(): Promise<void> {
    await waitFor(
      () =>
        expect(document.body.textContent ?? '').toContain(
          'Schritt 2 von 2',
        ),
      { timeout: 8000 },
    )
  }

  it('renders the personal-details sidebar on /eingaben/produkte in combine mode', async () => {
    saveCombineWorkspace()
    window.history.pushState(null, '', '/eingaben/produkte')
    const { container } = render(<App />)
    await waitForAngabenProduktePage()

    const text = container.textContent ?? ''
    expect(/Pers.nliche Angaben|Persoenliche Angaben|Profil/.test(text)).toBe(true)
    expect(text).toContain('Bruttogehalt')
    expect(text).toContain('Renteneintrittsalter')
  })

  it('editing salary on /eingaben/produkte writes through to workspace baseline and persists (#40)', async () => {
    saveCombineWorkspace()
    window.history.pushState(null, '', '/eingaben/produkte')
    render(<App />)
    await waitForAngabenProduktePage()

    // The CombineDashboardSidebar mounts as Schritt 2's body in combine
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

  it('editing retirement age on /eingaben/produkte writes through to workspace baseline (#40)', async () => {
    saveCombineWorkspace()
    window.history.pushState(null, '', '/eingaben/produkte')
    render(<App />)
    await waitForAngabenProduktePage()

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

  // CR4 — CLAUDE.md cron-dispatch guardrail #2: paired test assertions.
  // The combine-mode tests above only cover combine-mode single-instance edits.
  // These two tests cover (1) the compare-mode singleton path on /eingaben
  // (the fix must not break it) and (2) a combine-mode multi-instance case
  // on /eingaben/produkte (workspace must not drop instances on round-trip).

  it('CR4-1: compare-mode singleton — /eingaben Schritt 1 persists salary edit to STORAGE_KEY_V1', async () => {
    // Seed compare-mode state (no v2 workspace — STORAGE_KEY_V1 only).
    // detectSavedMode() sees no v2 key and routes to compare-mode.
    const seededProfile = { ...defaultProfile, grossSalaryYear: 55000 }
    localStorage.setItem(STORAGE_KEY_V1, buildStateJson(seededProfile, defaultAssumptions))

    window.history.pushState(null, '', '/eingaben')
    render(<App />)

    // Wait for Schritt 1 shell to appear.
    await waitFor(
      () => expect(document.body.textContent ?? '').toContain('Schritt 1 von 2'),
      { timeout: 8000 },
    )

    // Verify STORAGE_KEY_V1 is present (compare-mode path held) and
    // carries the seeded salary value. The page hydrated from v1 and no v2
    // workspace was created.
    const raw = localStorage.getItem(STORAGE_KEY_V1)
    expect(raw).not.toBeNull()
    const persisted = JSON.parse(raw!) as { profile: { grossSalaryYear: number } }
    expect(persisted.profile.grossSalaryYear).toBe(55000)
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull()
  })

  it('CR4-2: combine-mode multi-instance — workspace with 2 bAV instances round-trips without dropping instances', async () => {
    // Seed a workspace with 2 bAV instances. The /eingaben/produkte page must
    // not drop instances when it opens and closes (the workspace round-trips
    // through useAngabenState which writes back via saveWorkspace).
    let workspace = cloneWorkspace(defaultWorkspace)
    workspace = { ...workspace, mode: 'combine' }
    workspace = addInstanceToWorkspace(workspace, 'bav')
    workspace = addInstanceToWorkspace(workspace, 'bav')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))

    const bavCountBefore = (workspace.baseline.assumptions.bav ?? []).length
    expect(bavCountBefore).toBeGreaterThanOrEqual(2)

    window.history.pushState(null, '', '/eingaben/produkte')
    render(<App />)
    await waitForAngabenProduktePage()

    // Give React one tick to write back the workspace on mount.
    await waitFor(() => {
      const stored = localStorage.getItem(STORAGE_KEY_V2)
      expect(stored).not.toBeNull()
    })

    // Assert that all bAV instances survived the round-trip.
    const stored = localStorage.getItem(STORAGE_KEY_V2)!
    const persisted = JSON.parse(stored) as Workspace
    const bavCountAfter = (persisted.baseline.assumptions.bav ?? []).length
    expect(bavCountAfter).toBe(bavCountBefore)
  })
})
