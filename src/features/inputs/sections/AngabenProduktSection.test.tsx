// @vitest-environment jsdom

/**
 * AngabenProduktSection — Codex R3 P1 regression test for the § 5 scenario-
 * filter wiring.
 *
 * Pre-fix bug: `AngabenProduktCompareBody` filtered `simulation.products` by
 * `visibleProducts` alone. Because `simulation.products` carries one row per
 * (scenario × product), the resulting `selectedResults` array had length
 * `visibleProducts.length * returnScenarios.length` (3×) instead of
 * `visibleProducts.length` (1×). Downstream consumers (`InputsPanel`,
 * `BavInputs`) then read whichever scenario happened to come first in the
 * array — typically `konservativ` — instead of the user's active scenario.
 *
 * Post-fix call site (`AngabenProduktSection.tsx`):
 *   selectedResults = deriveSelectedResults(simulation, visibleProducts, effectiveScenarioId)
 *
 * The previous smoke test only asserted that the literal "Versicherung"
 * product-name label rendered — that copy is scenario-independent, so the
 * smoke test would silently pass even if the fix regressed. This file replaces
 * that smoke test with the real wiring check:
 *
 *   1. Pass `workspaceUi` to `<AngabenPage>` with `selectedScenarioId =
 *      'optimistisch'`. The Codex R5 P2 fix lifted `useWorkspaceUiState`
 *      into `App.tsx` and threads it down through `AngabenPage` →
 *      `AngabenProduktSection`; the section no longer mounts its own hook.
 *      Without a non-default value, `effectiveScenarioId` would coincide
 *      with `'basis'` and we couldn't distinguish "filtered by the right
 *      scenario" from "happened to use basis by coincidence".
 *   2. Mock `<InputsPanel>` with a capture spy so we can read the
 *      `selectedResults` prop the section passes in directly.
 *   3. Render `<AngabenPage workspaceUi={…} />` (default state — compare-mode,
 *      visibleProducts = ['etf', 'bav']).
 *   4. Assert: spy fired exactly once; `selectedResults.length` is 2 (not 6,
 *      which is the pre-fix all-scenarios shape); every entry's `scenarioId`
 *      equals 'optimistisch' (catches the "hardcoded 'basis'" regression).
 *
 * Why a sibling file rather than appending to `AngabenPage.test.tsx`: `vi.mock`
 * hoists to module scope, so once `./InputsPanel` is replaced in this file
 * every test in the same module would lose access to the real panel. The
 * existing `AngabenPage.test.tsx` block "AngabenPage — § 1 / § 5 shared-state
 * contract" exercises real `InputsPanel` rendering (e.g. the "Versicherung"
 * label, the "bAV-Brutto pro Monat" NumberField). Isolating the mocks here
 * keeps both surfaces honest.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { WorkspaceUiState } from '../../../app/useWorkspaceUiState'
import type { ProductResult } from '../../../domain'

// ---------------------------------------------------------------------------
// Mocks (hoisted by vi.mock to before any importer captures the symbol)
// ---------------------------------------------------------------------------

// Stand-in for the lifted workspace UI store. The Codex R5 P2 fix removed
// the local `useWorkspaceUiState()` mount inside the section; we now hand the
// store down explicitly via `<AngabenPage workspaceUi=…>` so the test can
// pin a non-default `selectedScenarioId` without mocking any module.
const mockWorkspaceUiState: WorkspaceUiState = {
  selectedScenarioId: 'optimistisch',
  setSelectedScenarioId: vi.fn(),
  showRealValues: false,
  setShowRealValues: vi.fn(),
  cashflowProductId: 'bav',
  setCashflowProductId: vi.fn(),
  tarifgebunden: false,
  setTarifgebunden: vi.fn(),
  showAssumptions: false,
  setShowAssumptions: vi.fn(),
}

// Capture the props `AngabenProduktCompareBody` hands to `<InputsPanel>`.
// We only care about `selectedResults`; the stub renders a marker so the
// surrounding page does not throw on hydrate.
interface MockInputsPanelProps {
  selectedResults: ProductResult[]
}
const inputsPanelSpy = vi.fn<(props: MockInputsPanelProps) => null>(() => null)
vi.mock('../InputsPanel', () => ({
  InputsPanel: (props: MockInputsPanelProps) => {
    inputsPanelSpy(props)
    return null
  },
}))

// Lazy import the page AFTER the mocks register so the hoisted replacements
// are visible to its module-level imports.
import { AngabenPage } from '../AngabenPage'

beforeEach(() => {
  inputsPanelSpy.mockClear()
  localStorage.clear()
  window.history.pushState(null, '', '/eingaben')
})

afterEach(() => {
  cleanup()
})

describe('AngabenProduktSection — § 5 binds to the active scenario (Codex R3 P1)', () => {
  it('compare-mode: selectedResults is filtered by the active scenario and visibleProducts only', () => {
    render(<AngabenPage workspaceUi={mockWorkspaceUiState} />)

    // The compare-mode body must mount the panel exactly once on initial render.
    expect(inputsPanelSpy).toHaveBeenCalled()
    const lastCall = inputsPanelSpy.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const props = lastCall![0]

    // Length contract: post-fix the array carries one entry per visible product
    // for the active scenario only. Pre-fix it carried one entry per
    // (scenario × visible product) — so for the default visibleProducts
    // (['etf', 'bav']) and 3 scenarios (konservativ + basis + optimistisch),
    // a regression would produce length 6 instead of 2. Asserting `=== 2`
    // catches both the original `.filter(visibleProducts).length === 6` shape
    // and any other regression that stops collapsing the scenario axis.
    expect(props.selectedResults).toHaveLength(2)

    // Scenario contract: every row must carry the mocked active scenario id.
    // Catches regressions where `deriveSelectedResults` is called with a
    // hardcoded `'basis'`, or where the wiring picks up `'konservativ'` (the
    // alphabetically/positionally first scenario) by reading the wrong field.
    for (const entry of props.selectedResults) {
      expect(entry.scenarioId).toBe('optimistisch')
    }

    // Product contract: each visible product appears exactly once. The default
    // comparison is ['etf', 'bav']; the registry-order sort inside
    // `deriveSelectedResults` puts ETF first, then bAV.
    const productIds = props.selectedResults.map((r) => r.productId)
    expect(productIds).toContain('etf')
    expect(productIds).toContain('bav')
  })
})
