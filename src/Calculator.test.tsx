// @vitest-environment jsdom

/**
 * Compare-mode CSV export alignment, plus the F1a plan-start regression.
 *
 * The CSV must mirror what the comparison shows — `VergleichJourneyPage`
 * invariant 2, "only selected products render and export".
 *
 * Test strategy: render `<App />` at `/vergleich` with `localStorage` seeded
 * so that compare-mode loads with `visibleProducts: ['etf']` (a 1-product
 * subset). Mock `downloadCsv` to capture the CSV content, click the "CSV
 * exportieren" button on the rendered VergleichPage, and assert the captured
 * CSV contains rows for all 6 products — not just ETF.
 *
 * The route matters: `/` is the personal plan (and a compare-only session now
 * lands on its not-started state), so the comparison — and its CSV — lives at
 * `/vergleich`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { defaultProfile, defaultAssumptions } from './data/defaultScenario'
import { buildStateJson, defaultWorkspace, STORAGE_KEY_V1, STORAGE_KEY_V2 } from './storage'
import { addInstanceToWorkspace } from './features/inventory/inventoryHelpers'
import type { Workspace } from './domain/workspace'
import type { ProductId, ScenarioAssumptions } from './domain'

// Capture every (filename, content) pair passed to `downloadCsv`. The mock
// has to be hoisted via vi.mock so import-time bindings inside Calculator
// resolve to the mocked function.
const downloadCsvCalls: Array<{ filename: string; content: string }> = []

vi.mock('./utils/csvExport', async () => {
  const actual = await vi.importActual<typeof import('./utils/csvExport')>(
    './utils/csvExport',
  )
  return {
    ...actual,
    downloadCsv: (filename: string, content: string) => {
      downloadCsvCalls.push({ filename, content })
    },
  }
})

beforeEach(() => {
  downloadCsvCalls.length = 0
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState(null, '', '/')
})

afterEach(() => {
  cleanup()
})

async function waitForCalculator(): Promise<void> {
  // The chrome meta strip was removed; the rendered surface is the first
  // signal that the lazy Calculator chunk has resolved. Both modes mount
  // exactly one of the two shell classes (`vergleich-shell` in compare,
  // `mein-plan-shell` in combine), so a single comma selector covers both.
  await waitFor(
    () =>
      expect(
        document.querySelector('.vergleich-shell, .mein-plan-shell'),
      ).not.toBeNull(),
    { timeout: 8000 },
  )
}

/**
 * Seed compare-mode (singleton v1) state with a deliberately narrow
 * `visibleProducts` so any path that filters by it produces a 1-product
 * subset. The CSV must NOT honour the subset — it must mirror the page.
 */
function seedCompareModeWithEtfOnly(): void {
  const narrowedAssumptions: ScenarioAssumptions = {
    ...defaultAssumptions,
    visibleProducts: ['etf'] as ProductId[],
  }
  localStorage.setItem(
    STORAGE_KEY_V1,
    buildStateJson(defaultProfile, narrowedAssumptions),
  )
}

describe('Compare-mode CSV export aligns with the comparison surface', () => {
  it('exports exactly the selected products when visibleProducts is a subset', async () => {
    seedCompareModeWithEtfOnly()
    window.history.pushState(null, '', '/vergleich')
    const { container } = render(<App />)
    await waitForCalculator()

    // Find the action-bar CSV button rendered by VergleichPage.
    const csvButton = within(container).getByRole('button', { name: /CSV exportieren/i })
    fireEvent.click(csvButton)

    expect(downloadCsvCalls.length).toBe(1)
    const { filename, content } = downloadCsvCalls[0]!
    expect(filename).toBe('rentenwiki-export.csv')

    // The file mirrors the screen: the selection is ETF, so no other product
    // label may appear (VergleichJourneyPage invariant 2).
    expect(content).toContain('ETF')
    expect(content).not.toMatch(/bAV/)
    expect(content).not.toMatch(/Privatrente/i)
    expect(content).not.toMatch(/Basisrente|Rürup/i)
    expect(content).not.toMatch(/Altersvorsorgedepot/i)
    expect(content).not.toMatch(/Riester/i)
  })

  it('leaves the plan untouched: a compare-only session lands on the not-started plan at /', async () => {
    // F1a regression: a visitor who only ever used the comparison persists a
    // v1 envelope, which `migrateV1ToV2` projects into instances. Those are
    // not contracts, so `/` must still offer onboarding rather than a
    // household total for six contracts nobody entered.
    seedCompareModeWithEtfOnly()
    window.history.pushState(null, '', '/')
    render(<App />)
    await waitForCalculator()

    expect(await screen.findByText('Dein Plan beginnt hier.')).toBeDefined()
    expect(screen.queryByText('Deine Rente im Überblick')).toBeNull()
  })

  it('a returning combine-mode user still lands on their plan at /', async () => {
    // Counterpart to the test above: the wizard's onComplete promotes the
    // workspace to `mode: 'combine'`, and that alone must keep the plan.
    let seed: Workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
    seed = { ...seed, mode: 'combine' }
    seed = addInstanceToWorkspace(seed, 'etf')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))
    window.history.pushState(null, '', '/')
    render(<App />)
    await waitForCalculator()

    expect(await screen.findByText('Deine Rente im Überblick')).toBeDefined()
    expect(screen.queryByText('Dein Plan beginnt hier.')).toBeNull()
  })
})
