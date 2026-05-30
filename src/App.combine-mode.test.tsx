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

describe('App — combine-mode profile editing lives on /eingaben Schritt 1 (PR 4 unification)', () => {
  // PR 2 of the Direction D /eingaben redesign migration split the page in
  // two. PR 4 (this PR) retires `<CombineDashboardSidebar>` from Schritt 2 —
  // the page now hosts only the per-contract Produkte panel. Personal-profile
  // editing (Bruttogehalt / Renteneintrittsalter) lives on Schritt 1
  // (`/eingaben`) via the `<AngabenEinkommenSection>` /
  // `<AngabenRenteneintrittSection>` Sober D sections. The behaviour-level
  // guarantee — edits to those fields persist to STORAGE_KEY_V2 — still
  // holds; these tests now drive `/eingaben` Schritt 1.
  //
  // The `useAngabenState` invariant from PR #322 stands: both pages mount the
  // SAME hook so a Schritt-1 profile edit and a Schritt-2 contract edit
  // round-trip through one store.

  /** Schritt 1's hero kicker is "Mein Plan · Schritt 1 von 2". */
  async function waitForAngabenPage(): Promise<void> {
    await waitFor(
      () =>
        expect(document.body.textContent ?? '').toContain(
          'Schritt 1 von 2',
        ),
      { timeout: 8000 },
    )
  }

  /** Schritt 2's hero kicker is "Mein Plan · Schritt 2 von 2". */
  async function waitForAngabenProduktePage(): Promise<void> {
    await waitFor(
      () =>
        expect(document.body.textContent ?? '').toContain(
          'Schritt 2 von 2',
        ),
      { timeout: 8000 },
    )
  }

  it('renders the per-contract Produkte panel on /eingaben/produkte in combine mode', async () => {
    saveCombineWorkspace()
    window.history.pushState(null, '', '/eingaben/produkte')
    const { container } = render(<App />)
    await waitForAngabenProduktePage()

    // PR 4: combine-mode body is the new ProdukteEingabenPanel (data-mode="combine").
    await waitFor(() => {
      const panel = container.querySelector('[data-testid="produkte-eingaben-panel"]')
      expect(panel).not.toBeNull()
      expect(panel!.getAttribute('data-mode')).toBe('combine')
    })
  })

  it('editing salary on /eingaben Schritt 1 writes through to workspace baseline and persists (#40)', async () => {
    saveCombineWorkspace()
    window.history.pushState(null, '', '/eingaben')
    render(<App />)
    await waitForAngabenPage()

    // The Bruttoeinkommen input on Schritt 1 lives in a NumberField rendered
    // by AngabenEinkommenSection. We locate it via its <label> text.
    await waitFor(() => {
      const labelSpans = Array.from(
        document.querySelectorAll<HTMLSpanElement>('label.field > span'),
      )
      const hit = labelSpans.find((span) =>
        (span.textContent ?? '').includes('Bruttoeinkommen pro Jahr'),
      )
      expect(hit).not.toBeUndefined()
    })
    const labelSpans = Array.from(
      document.querySelectorAll<HTMLSpanElement>('label.field > span'),
    )
    const bruttoSpan = labelSpans.find((span) =>
      (span.textContent ?? '').includes('Bruttoeinkommen pro Jahr'),
    )!
    const bruttoLabel = bruttoSpan.closest('label.field') as HTMLLabelElement
    const bruttoInput = bruttoLabel.querySelector<HTMLInputElement>('input[type="number"]')!

    // NumberField (DraftNumberInput) commits on blur — fire change then blur.
    fireEvent.change(bruttoInput, { target: { value: '80000' } })
    fireEvent.blur(bruttoInput)

    // Storage is written reactively via useEffect.
    await waitFor(() => {
      const stored = localStorage.getItem(STORAGE_KEY_V2)
      expect(stored).not.toBeNull()
      const persisted = JSON.parse(stored!) as Workspace
      expect(persisted.baseline.profile.grossSalaryYear).toBe(80000)
    })
  })

  it('editing retirement age on /eingaben Schritt 1 writes through to workspace baseline (#40)', async () => {
    saveCombineWorkspace()
    window.history.pushState(null, '', '/eingaben')
    render(<App />)
    await waitForAngabenPage()

    await waitFor(() => {
      const labelSpans = Array.from(
        document.querySelectorAll<HTMLSpanElement>('label.field > span'),
      )
      const hit = labelSpans.find((span) =>
        (span.textContent ?? '').includes('Renteneintrittsalter'),
      )
      expect(hit).not.toBeUndefined()
    })
    const labelSpans = Array.from(
      document.querySelectorAll<HTMLSpanElement>('label.field > span'),
    )
    const renteneintrittSpan = labelSpans.find((span) =>
      (span.textContent ?? '').includes('Renteneintrittsalter'),
    )!
    const renteneintrittLabel = renteneintrittSpan.closest('label.field') as HTMLLabelElement
    const renteneintrittInput = renteneintrittLabel.querySelector<HTMLInputElement>('input[type="number"]')!

    fireEvent.change(renteneintrittInput, { target: { value: '63' } })
    fireEvent.blur(renteneintrittInput)

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
  //
  // PR #344 R2 (CodeRabbit CR-R2-1): the previous versions of these two tests
  // seeded storage and asserted without driving a real write, so they would
  // pass even if persistence regressed. Both now drive the actual save path:
  // CR4-1 edits Bruttogehalt on /eingaben Schritt 1 + blur (triggers the
  // reactive STORAGE_KEY_V1 write through `useAngabenState`); CR4-2 clicks
  // the "Speichern und Plan ansehen" button on /eingaben/produkte Schritt 2
  // (calls `angabenState.persistNow()` → `saveWorkspace` → STORAGE_KEY_V2).

  it('CR4-1: compare-mode singleton — editing Bruttogehalt on /eingaben Schritt 1 persists the new value to STORAGE_KEY_V1', async () => {
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

    // CR-R2-1: drive the real save path so the test would fail if persistence regressed.
    // The Bruttoeinkommen NumberField on /eingaben Schritt 1 renders a
    // `<label class="field">` with a `<span>` containing the label text and a
    // `<input type="number">` next to it. Find the input by walking from the
    // label span up to the wrapping `<label>`, then querying its input.
    await waitFor(() => {
      const labelSpans = Array.from(document.querySelectorAll<HTMLSpanElement>('label.field > span'))
      const hit = labelSpans.find((span) =>
        (span.textContent ?? '').includes('Bruttoeinkommen pro Jahr'),
      )
      expect(hit).not.toBeUndefined()
    })
    const labelSpans = Array.from(document.querySelectorAll<HTMLSpanElement>('label.field > span'))
    const bruttoSpan = labelSpans.find((span) =>
      (span.textContent ?? '').includes('Bruttoeinkommen pro Jahr'),
    )!
    const bruttoLabel = bruttoSpan.closest('label.field') as HTMLLabelElement
    const bruttoInput = bruttoLabel.querySelector<HTMLInputElement>('input[type="number"]')!

    // NumberField (DraftNumberInput) commits on blur — change + blur.
    fireEvent.change(bruttoInput, { target: { value: '60000' } })
    fireEvent.blur(bruttoInput)

    // Wait for STORAGE_KEY_V1 to reflect the edit (reactive write via
    // `useAngabenState` persistence effect → `persistNow` → `safeSetItem`).
    await waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEY_V1)
      expect(raw).not.toBeNull()
      const persisted = JSON.parse(raw!) as { profile: { grossSalaryYear: number } }
      expect(persisted.profile.grossSalaryYear).toBe(60000)
    })
    // Compare-mode path must NOT have spawned a v2 workspace.
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull()
  })

  it('CR4-2: combine-mode multi-instance — clicking "Speichern" on /eingaben/produkte writes the 2-bAV-instance workspace to STORAGE_KEY_V2', async () => {
    // Seed a workspace with 2 bAV instances. The /eingaben/produkte page must
    // not drop instances on the explicit save path (the "Speichern und Plan
    // ansehen" CTA calls `angabenState.persistNow()` → `saveWorkspace`).
    let workspace = cloneWorkspace(defaultWorkspace)
    workspace = { ...workspace, mode: 'combine' }
    workspace = addInstanceToWorkspace(workspace, 'bav')
    workspace = addInstanceToWorkspace(workspace, 'bav')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workspace))

    const bavBefore = workspace.baseline.assumptions.bav ?? []
    expect(bavBefore.length).toBe(2)
    const secondInstanceIdBefore = bavBefore[1]!.instanceId

    window.history.pushState(null, '', '/eingaben/produkte')
    render(<App />)
    await waitForAngabenProduktePage()

    // CR-R2-1: drive the real save path so the test would fail if persistence regressed.
    // Click the "Speichern und Plan ansehen" CTA. It calls
    // `angabenState.persistNow()` (R1 wiring), which serialises the workspace
    // to STORAGE_KEY_V2 via `saveWorkspace`. If a regression dropped instances
    // during the singleton-view projection round-trip, the post-click write
    // would show fewer than 2 bAV entries.
    await waitFor(() => {
      const speichern = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (btn) => (btn.textContent ?? '').includes('Speichern und Plan ansehen'),
      )
      expect(speichern).not.toBeUndefined()
    })
    const speichern = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (btn) => (btn.textContent ?? '').includes('Speichern und Plan ansehen'),
    )!
    fireEvent.click(speichern)

    // Assert both bAV instances survived the explicit save — and verify the
    // second instance's id matches the seeded one (so we're not reading a
    // defaults envelope that just happens to have 2 entries).
    await waitFor(() => {
      const stored = localStorage.getItem(STORAGE_KEY_V2)
      expect(stored).not.toBeNull()
      const persisted = JSON.parse(stored!) as Workspace
      const bavAfter = persisted.baseline.assumptions.bav ?? []
      expect(bavAfter.length).toBe(2)
      expect(bavAfter[1]!.instanceId).toBe(secondInstanceIdBefore)
    })
  })
})
