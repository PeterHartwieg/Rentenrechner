// @vitest-environment jsdom

/**
 * PR 332 R2 (Codex P2) — Calculator compare-mode CSV export alignment.
 *
 * Pins the regression-test for the R1 review finding: VergleichPage forces
 * all 6 products on screen, but `handleExportCsv` (from `useDerivedViews`)
 * was building the CSV from the user's filtered `visibleProducts` subset.
 * R2 lifts the all-6 simulation to Calculator and wires a dedicated
 * `handleExportCsvAllProducts` so the file matches what the page shows.
 *
 * Test strategy: render `<App />` with `localStorage` seeded so that
 * compare-mode loads with `visibleProducts: ['etf']` (a 1-product subset).
 * Mock `downloadCsv` to capture the CSV content, click the "CSV exportieren"
 * button on the rendered VergleichPage, and assert the captured CSV
 * contains rows for all 6 products — not just ETF.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import App from './App'
import { defaultProfile, defaultAssumptions } from './data/defaultScenario'
import { buildStateJson, STORAGE_KEY_V1 } from './storage'
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
  await waitFor(
    () => expect(document.querySelector('.rw-dashboard-meta__title')).not.toBeNull(),
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

describe('Calculator — compare-mode CSV export aligns with VergleichPage (PR 332 R2)', () => {
  it('exports all 6 products even when assumptions.visibleProducts is a subset', async () => {
    seedCompareModeWithEtfOnly()
    const { container } = render(<App />)
    await waitForCalculator()

    // Find the action-bar CSV button rendered by VergleichPage.
    const buttons = Array.from(container.querySelectorAll('button'))
    const csvButton = buttons.find((b) => b.textContent?.trim() === 'CSV exportieren')
    expect(csvButton, 'CSV exportieren button must be rendered on VergleichPage').not.toBeUndefined()

    fireEvent.click(csvButton!)

    // The captured CSV must mention every product label, not only ETF.
    expect(downloadCsvCalls.length).toBe(1)
    const { filename, content } = downloadCsvCalls[0]!
    expect(filename).toBe('rentenwiki-export.csv')

    // Spot-check at least 5 of the 6 product names. The CSV labels each
    // product row by the PRODUCT_REGISTRY label, so a subset path would
    // miss bAV / Versicherung / Basisrente / AVD / Riester.
    expect(content).toContain('ETF')
    expect(content).toContain('bAV')
    // Allow either "Privatrente"/"Versicherung" (alias-tolerant): the
    // private-insurance product is registered as "Privatrente" in default
    // assumptions; "Versicherung" is the internal product id.
    expect(content).toMatch(/Privatrente|Versicherung/i)
    expect(content).toMatch(/Basisrente|Rürup/i)
    expect(content).toMatch(/Altersvorsorgedepot|AVD/i)
    expect(content).toMatch(/Riester/i)
  })
})
