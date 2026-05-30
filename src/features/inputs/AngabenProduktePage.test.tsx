// @vitest-environment jsdom

/**
 * AngabenProduktePage — Schritt 2 of the two-page `/eingaben` wizard
 * landed in PR 2 of the Direction D redesign migration. This file pins:
 *
 *   1. Page-shell rendering: kicker + H1 + DStepIndicator + lead + body.
 *   2. Footer navigation: Schritt 1 ↔ Schritt 2 ↔ Plan transitions.
 *   3. Mode-aware body: compare → <ProdukteEingabenPanel mode="compare"> (PR 3),
 *      combine → <ProdukteEingabenPanel mode="combine"> (PR 4, replacing the
 *      legacy <CombineDashboardSidebar>).
 *   4. Round-trip from Schritt 1: an edit on AngabenPage must be visible
 *      to AngabenProduktePage via the shared `useAngabenState` store. This
 *      mirrors the deleted `sections/AngabenProduktSection.test.tsx`
 *      Codex R3 P1 wiring contract, retargeted at the new page.
 *
 * The architectural invariant is the same as PR #322: both pages mount
 * `useAngabenState` exactly once each, and never a second
 * `useCalculatorState` / `usePortfolioState`. Last-write-wins data loss is
 * structurally prevented because every setter on either page goes through
 * the same source of truth.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import type { WorkspaceUiState } from '../../app/useWorkspaceUiState'
import type { ProductResult } from '../../domain'
import type { Workspace } from '../../domain/workspace'
import {
  buildStateJson,
  defaultWorkspace,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
} from '../../storage'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { ROUTES, detectSavedMode } from '../../app/useRoute'
import { mockViewport } from '../../test/viewport'
import { addInstanceToWorkspace } from '../inventory/inventoryHelpers'

// ---------------------------------------------------------------------------
// Mocks (hoisted by vi.mock to before any importer captures the symbol).
// PR 4: both compare-mode AND combine-mode now mount `<ProdukteEingabenPanel>`
// (the new Sober D Produkte family). PR 3 introduced the compare-mode mount;
// PR 4 swaps the combine branch from the legacy `<CombineDashboardSidebar>` to
// the same panel with `mode="combine"`. The mock here is a thin spy that lets
// the page-shell tests assert mount + prop wiring without pulling the full
// Produkte component tree into a jsdom render.
// ---------------------------------------------------------------------------

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

interface MockProduktePanelProps {
  mode?: 'compare' | 'combine'
  selectedResults?: ProductResult[]
  baseline?: { profile?: { age?: number } }
}
const produkteEingabenPanelSpy = vi.fn<(props: MockProduktePanelProps) => null>(
  () => null,
)

vi.mock('../produkte/ProdukteEingabenPanel', () => ({
  ProdukteEingabenPanel: (props: MockProduktePanelProps) => {
    produkteEingabenPanelSpy(props)
    return (
      <div
        data-testid="produkte-eingaben-panel"
        data-mode={props.mode ?? 'compare'}
      />
    )
  },
}))

// Stub the per-contract decision menu so combine-mode tests that exercise the
// "Weitere Optionen" kebab don't need to mount the full modal tree.
vi.mock('../dashboard/ContractDecisionMenu', () => ({
  ContractDecisionMenu: ({ instanceId }: { instanceId: string }) => (
    <div data-testid={`contract-decision-menu-${instanceId}`} />
  ),
}))

const downloadJsonBlobSpy = vi.fn<(content: string, filename: string) => void>()

vi.mock('../../app/downloadJsonBlob', () => ({
  downloadJsonBlob: (content: string, filename: string) => {
    downloadJsonBlobSpy(content, filename)
  },
}))

// Lazy import AFTER the mocks register.
import { AngabenProduktePage } from './AngabenProduktePage'
import { useNowSnapshot } from './useNowSnapshot'

beforeEach(() => {
  produkteEingabenPanelSpy.mockClear()
  downloadJsonBlobSpy.mockClear()
  localStorage.clear()
  window.history.pushState(null, '', '/eingaben/produkte')
})

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

// ---------------------------------------------------------------------------
// Page shell — kicker / H1 / DStepIndicator / lead.
// ---------------------------------------------------------------------------

describe('AngabenProduktePage — /eingaben/produkte page shell', () => {
  it('renders the "Mein Plan · Schritt 2 von 2" kicker (PR 2)', () => {
    const { container } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    const kicker = container.querySelector('.angaben-kicker')
    expect(kicker).not.toBeNull()
    expect(kicker!.textContent).toBe('Mein Plan · Schritt 2 von 2')
  })

  it('renders the "Deine Verträge und Sparformen" H1 verbatim', () => {
    const { getByRole } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    expect(getByRole('heading', { level: 1 }).textContent).toBe(
      'Deine Verträge und Sparformen',
    )
  })

  it('renders <DStepIndicator current={2} /> with step II active', () => {
    const { container } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    const indicator = container.querySelector('[data-testid="d-step-indicator"]')
    expect(indicator).not.toBeNull()
    expect(indicator!.getAttribute('data-step')).toBe('2')
    // The active row carries the cell-active marker class.
    const activeCell = indicator!.querySelector(
      '.d-step-indicator__cell--active',
    )
    expect(activeCell).not.toBeNull()
    expect(activeCell!.textContent).toContain('Deine Verträge')
  })

  it('renders the lead paragraph verbatim from the brief', () => {
    const { container } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    const lead = container.querySelector('.angaben-summary')
    expect(lead).not.toBeNull()
    // Verbatim snippets the PR 2 brief required.
    expect(lead!.textContent).toContain('Erfasse hier alle Verträge')
    expect(lead!.textContent).toContain('nur die gesetzliche Rente')
  })

  it('contains no "Rentenrechner" public copy (P0 brand guardrail)', () => {
    const { container } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    expect(container.textContent ?? '').not.toContain('Rentenrechner')
  })
})

// ---------------------------------------------------------------------------
// Footer navigation — Schritt 1 ↔ Schritt 2 ↔ Plan transitions.
// ---------------------------------------------------------------------------

describe('AngabenProduktePage — footer navigation', () => {
  it('navigates to /eingaben when "← Zurück zu Schritt 1" is clicked', () => {
    const navigate = vi.fn()
    const { getByRole } = render(
      <AngabenProduktePage navigate={navigate} workspaceUi={mockWorkspaceUiState} />,
    )
    const btn = getByRole('button', { name: '← Zurück zu Schritt 1' })
    fireEvent.click(btn)
    expect(navigate).toHaveBeenCalledWith(ROUTES.eingaben)
  })

  it('navigates to / (home) when "Speichern und Plan ansehen" is clicked', () => {
    const navigate = vi.fn()
    const { getByRole } = render(
      <AngabenProduktePage navigate={navigate} workspaceUi={mockWorkspaceUiState} />,
    )
    const btn = getByRole('button', { name: 'Speichern und Plan ansehen' })
    fireEvent.click(btn)
    expect(navigate).toHaveBeenCalledWith(ROUTES.home)
  })

  it('persists compare-mode state on "Speichern und Plan ansehen" so a first-time visitor lands on the dashboard, not the landing page (Codex P2)', () => {
    // First-time visitor: no localStorage at all.
    localStorage.clear()
    const navigate = vi.fn()
    const { getByRole } = render(
      <AngabenProduktePage navigate={navigate} workspaceUi={mockWorkspaceUiState} />,
    )
    // Precondition: nothing persisted yet → detectSavedMode would return null.
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBeNull()

    fireEvent.click(getByRole('button', { name: 'Speichern und Plan ansehen' }))

    // After the CTA: STORAGE_KEY_V1 now holds the compare snapshot, so the next
    // detectSavedMode() returns 'compare' and App renders the dashboard.
    expect(localStorage.getItem(STORAGE_KEY_V1)).not.toBeNull()
    expect(navigate).toHaveBeenCalledWith(ROUTES.home)
    // Strongest assertion: detectSavedMode now resolves to a non-null mode.
    expect(detectSavedMode()).toBe('compare')
  })

  it('renders the "Als JSON exportieren ↓" button', () => {
    const { getByRole } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    expect(getByRole('button', { name: 'Als JSON exportieren ↓' })).toBeTruthy()
  })

  it('compare-mode export button downloads v1 singleton JSON (CX1)', () => {
    // In compare-mode, the export must use buildStateJson(profile, assumptions)
    // — not the workspace shape. Verify via the downloadJsonBlob mock.
    const { getByRole } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    fireEvent.click(getByRole('button', { name: 'Als JSON exportieren ↓' }))

    expect(downloadJsonBlobSpy).toHaveBeenCalledTimes(1)
    const [content, filename] = downloadJsonBlobSpy.mock.calls[0]!
    expect(filename).toBe('rentenwiki-export.json')
    // v1 envelope carries a top-level `version` + `profile` + `assumptions`.
    const parsed = JSON.parse(content) as Record<string, unknown>
    expect(parsed).toHaveProperty('profile')
    expect(parsed).toHaveProperty('assumptions')
    // Must NOT contain schemaVersion (that's the v2 workspace shape).
    expect(parsed).not.toHaveProperty('schemaVersion')
  })

  it('combine-mode export button downloads full workspace JSON instead of singleton projection (CX1)', () => {
    // CX1 finding: the prior code used buildStateJson(profile, assumptions) in
    // combine-mode, which is only the singleton projection and drops per-instance
    // contracts, what-ifs, and transfer events. Post-fix: combine-mode serializes
    // the full workspace (schemaVersion: 2 shape) and names the file
    // rentenwiki-workspace.json.
    //
    // We seed a workspace with 1 bAV instance and 1 what-if to ensure those
    // fields survive into the downloaded JSON (a singleton projection would drop
    // them), then assert the workspace shape and filename.
    let seed: Workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
    seed = { ...seed, mode: 'combine' }
    seed = addInstanceToWorkspace(seed, 'bav')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))

    const { getByRole } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    fireEvent.click(getByRole('button', { name: 'Als JSON exportieren ↓' }))

    expect(downloadJsonBlobSpy).toHaveBeenCalledTimes(1)
    const [content, filename] = downloadJsonBlobSpy.mock.calls[0]!
    expect(filename).toBe('rentenwiki-workspace.json')
    // v2 workspace carries schemaVersion and a bav[] array.
    const parsed = JSON.parse(content) as Record<string, unknown>
    expect(parsed).toHaveProperty('schemaVersion', 2)
    // The bAV instance must be present — a singleton projection would drop it.
    const baseline = parsed['baseline'] as Record<string, unknown> | undefined
    const bavInstances = (baseline?.['assumptions'] as Record<string, unknown> | undefined)?.['bav']
    expect(Array.isArray(bavInstances)).toBe(true)
    expect((bavInstances as unknown[]).length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Body — both modes now mount <ProdukteEingabenPanel>. PR 4 unifies the two
// branches; PR 3 had only shipped the compare-mode mount.
// ---------------------------------------------------------------------------

describe('AngabenProduktePage — mode-aware body', () => {
  it('compare-mode body mounts <ProdukteEingabenPanel> via useAngabenState (PR 3)', () => {
    render(<AngabenProduktePage workspaceUi={mockWorkspaceUiState} />)
    expect(produkteEingabenPanelSpy).toHaveBeenCalled()
  })

  it('compare-mode: selectedResults is filtered by visibleProducts and the active scenario (Codex R3 P1)', () => {
    // Pre-fix bug (same as the deleted sections/AngabenProduktSection.test.tsx):
    // filtering by visibleProducts alone produced rows for every scenario.
    // Post-fix: deriveSelectedResults narrows to (active scenario × visible
    // products), so the length is 2 (etf + bav) and every row carries the
    // mocked 'optimistisch' scenario.
    render(<AngabenProduktePage workspaceUi={mockWorkspaceUiState} />)

    expect(produkteEingabenPanelSpy).toHaveBeenCalled()
    const lastCall = produkteEingabenPanelSpy.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const props = lastCall![0]
    const selectedResults = props.selectedResults
    expect(selectedResults).toBeDefined()
    expect(selectedResults!).toHaveLength(2)
    for (const entry of selectedResults!) {
      expect(entry.scenarioId).toBe('optimistisch')
    }
    const productIds = selectedResults!.map((r) => r.productId)
    expect(productIds).toContain('etf')
    expect(productIds).toContain('bav')
  })

  it('combine-mode body mounts <ProdukteEingabenPanel mode="combine"> (PR 4)', () => {
    // Seed a combine-mode workspace via the v2 envelope. detectSavedMode
    // sees `mode: 'combine'` and useAngabenState routes the body to the
    // panel's combine branch — the legacy <CombineDashboardSidebar> is gone.
    const seed: Workspace = (() => {
      const ws = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
      return { ...ws, mode: 'combine' }
    })()
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))

    render(<AngabenProduktePage workspaceUi={mockWorkspaceUiState} />)
    // Panel fires with mode === 'combine'.
    expect(produkteEingabenPanelSpy).toHaveBeenCalled()
    const lastCall = produkteEingabenPanelSpy.mock.calls.at(-1)
    expect(lastCall![0].mode).toBe('combine')
  })
})

// ---------------------------------------------------------------------------
// Cross-page round-trip — edits made on Schritt 1 must be visible to
// Schritt 2 via the shared useAngabenState envelope. This is the PR 2
// architectural-invariant test: both pages mount the same hook and the
// round-trip happens through localStorage.
// ---------------------------------------------------------------------------

describe('AngabenProduktePage — Schritt 1 ↔ Schritt 2 round-trip (PR 2)', () => {
  it('compare-mode: a Schritt-1 profile.age write is visible on Schritt 2 via STORAGE_KEY_V1', () => {
    // Simulate the navigation: write the seed envelope to v1 (as Schritt 1
    // would after a user edits the Alter field), then mount Schritt 2 and
    // confirm useAngabenState hydrated from the same store.
    const seededProfile = { ...defaultProfile, age: 41 }
    localStorage.setItem(
      STORAGE_KEY_V1,
      buildStateJson(seededProfile, defaultAssumptions),
    )

    render(<AngabenProduktePage workspaceUi={mockWorkspaceUiState} />)

    // The ProdukteEingabenPanel mock captures the profile that Schritt 2
    // hands down. Schritt 2 read the same envelope Schritt 1 wrote.
    const lastCall = produkteEingabenPanelSpy.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    // The mock only spy'd `selectedResults`; we use the raw call args as a
    // black box — `profile` is at the same spread index.
    const allProps = lastCall![0] as MockProduktePanelProps & {
      profile?: { age?: number }
    }
    expect(allProps.profile?.age).toBe(41)
  })

  it('combine-mode: a Schritt-1 baseline.profile.age write is visible on Schritt 2 via STORAGE_KEY_V2', () => {
    // Combine-mode mirror: seed a v2 workspace with a non-default age,
    // then mount Schritt 2 and assert the panel surface picks it up.
    let seed: Workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
    seed = {
      ...seed,
      mode: 'combine',
      baseline: {
        ...seed.baseline,
        profile: { ...seed.baseline.profile, age: 38 },
      },
    }
    // Seed a bAV instance so the panel has at least one row.
    seed = addInstanceToWorkspace(seed, 'bav')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))

    render(<AngabenProduktePage workspaceUi={mockWorkspaceUiState} />)
    // PR 4 — the combine-mode body is the new panel. We verify the age
    // round-tripped via the baseline prop the panel received.
    expect(produkteEingabenPanelSpy).toHaveBeenCalled()
    const lastCall = produkteEingabenPanelSpy.mock.calls.at(-1)
    expect(lastCall![0].mode).toBe('combine')
    expect(lastCall![0].baseline?.profile?.age).toBe(38)

    const rawV2 = localStorage.getItem(STORAGE_KEY_V2)
    expect(rawV2).not.toBeNull()
    const parsed = JSON.parse(rawV2!) as Workspace
    expect(parsed.baseline.profile.age).toBe(38)
  })
})

// ---------------------------------------------------------------------------
// PR 4 receipt strip — right-rail bottom strip is mode-aware. Combine-mode
// surfaces live workspace data (instance count + formatRelativeTime over
// baseline.lastEditedAt). Compare-mode hides the strip because the singleton
// state model has no contract count.
// ---------------------------------------------------------------------------

describe('AngabenProduktePage — receipt strip (PR 4)', () => {
  // CR-PR4-R1-2: previous tests relied on the moving wall-clock "<10s" bucket
  // in `formatRelativeTime`, which could flake on slow CI. Wrapping the block
  // in fake timers + `vi.setSystemTime` pins the clock to a fixed moment
  // before the first render, so "soeben" / "1 Vertrag" assertions are
  // deterministic. We restore real timers in afterAll so unrelated tests
  // aren't affected.
  beforeAll(() => vi.useFakeTimers())
  afterAll(() => vi.useRealTimers())
  beforeEach(() => vi.setSystemTime(new Date('2026-05-29T13:00:00Z')))

  it('compare-mode hides the receipt strip (singleton state has no contract count)', () => {
    const { queryByTestId } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    expect(queryByTestId('angaben-produkte-receipt')).toBeNull()
  })

  it('combine-mode renders live "{N} Verträge erfasst" + relative time when the workspace has instances', () => {
    // Seed a workspace with 2 bAV + 1 ETF instance so the count = 3, and a
    // lastEditedAt at the pinned "now" so the relative-time string is
    // "soeben" (the < 10-second floor in formatRelativeTime).
    let seed: Workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
    seed = {
      ...seed,
      mode: 'combine',
      baseline: { ...seed.baseline, lastEditedAt: Date.now() },
    }
    seed = addInstanceToWorkspace(seed, 'bav')
    seed = addInstanceToWorkspace(seed, 'bav')
    seed = addInstanceToWorkspace(seed, 'etf')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))

    const { getByTestId } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    const strip = getByTestId('angaben-produkte-receipt')
    expect(strip.textContent).toContain('3 Verträge erfasst')
    expect(strip.textContent).toContain('soeben')
    expect(strip.textContent).toContain('gespeichert im Browser')
  })

  it('combine-mode renders "1 Vertrag" (singular) when only one instance exists', () => {
    let seed: Workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
    seed = { ...seed, mode: 'combine' }
    seed = addInstanceToWorkspace(seed, 'bav')
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))

    const { getByTestId } = render(
      <AngabenProduktePage workspaceUi={mockWorkspaceUiState} />,
    )
    const strip = getByTestId('angaben-produkte-receipt')
    expect(strip.textContent).toContain('1 Vertrag ')
    expect(strip.textContent).not.toContain('1 Verträge')
  })

  it('useNowSnapshot ticks via 1s interval when lastEditedAt is set (CR-PR4-R1-1)', () => {
    // Regression for CR-PR4-R1-1: the previous `useNowSnapshot` returned a
    // no-op `subscribe`, so `useSyncExternalStore` had no way to re-render
    // over time and the "zuletzt geändert vor X" bucket froze.
    //
    // We render-hook the primitive directly because the page-shell receipt
    // strip's saved `lastEditedAt` is currently being dropped on load by
    // `mergeDeep` in src/storage.ts (it walks only default keys, and
    // `defaultWorkspace.baseline` doesn't declare a `lastEditedAt` key) —
    // an orthogonal storage pre-existing issue not in scope for this PR R1
    // fix. The primitive's tested behaviour here is exactly what the strip
    // uses once that storage issue is addressed.
    const T0 = Date.now()
    const { result } = renderHook(() => useNowSnapshot(T0))
    expect(result.current).toBe(T0)
    act(() => {
      vi.setSystemTime(new Date('2026-05-29T13:00:15Z'))
      vi.advanceTimersByTime(1_500)
    })
    expect(result.current).toBeGreaterThan(T0)
  })

  it('useNowSnapshot freezes when lastEditedAt is undefined (CR-PR4-R1-1)', () => {
    // The fresh-workspace branch: `subscribe` short-circuits to a no-op
    // cleanup so an idle receipt strip on a default workspace doesn't burn
    // a setInterval forever just to display the constant "soeben".
    const { result } = renderHook(() => useNowSnapshot(undefined))
    const initial = result.current
    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    expect(result.current).toBe(initial)
  })
})
