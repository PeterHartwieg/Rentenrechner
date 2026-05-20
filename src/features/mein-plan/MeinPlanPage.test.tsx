// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import type { Route } from '../../app/useRoute'
import { MeinPlanPage } from './MeinPlanPage'
import { defaultWorkspace, STORAGE_KEY_V1, STORAGE_KEY_V2 } from '../../storage'
import { addInstanceToWorkspace } from '../inventory/inventoryHelpers'
import { runCombineSimulation } from '../../app/useCombineSimulation'
import { de2026Rules } from '../../rules/de2026'
import type { Workspace } from '../../domain/workspace'
import { eachViewport, mockViewport } from '../../test/viewport'

beforeEach(() => {
  localStorage.clear()
  window.history.pushState(null, '', '/')
})

afterEach(() => {
  cleanup()
  mockViewport('desktop')
})

function inShell(node: ReactElement, route: Route = '/') {
  return createElement(AppShell, { route, navigate: () => {}, children: node })
}

/**
 * Build a minimal combine-mode workspace seed with one active bAV + one
 * active ETF instance so the sensitivity-row "ETF +100 €" branch has a
 * target. The workspace mode is set to `'combine'` so the
 * receipt-side `useAngabenState` resolves to combine-mode.
 */
function buildCombineWorkspace(): Workspace {
  let ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
  ws = { ...ws, mode: 'combine' }
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, 'etf')
  // Persist so MeinPlanReceiptAside (which reads via useAngabenState)
  // sees the combine workspace rather than falling back to compare defaults.
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
  return ws
}

function buildProps(workspace: Workspace = buildCombineWorkspace()) {
  const bundle = runCombineSimulation(workspace, de2026Rules)
  const basis = workspace.baseline.assumptions.returnScenarios.find((s) => s.id === 'basis')!
  return {
    workspace,
    perInstance: bundle.perInstance,
    selectedScenarioId: basis.id,
    selectedScenarioLabel: basis.label,
    combinedForScenario: bundle.combinedByScenarioId[basis.id],
    rules: de2026Rules,
  }
}

describe('MeinPlanPage — Sober D combine-mode surface', () => {
  it('renders the lead statement, headline figure, and both § sections', () => {
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    expect(container.querySelector('.mein-plan-lead')).not.toBeNull()
    expect(container.querySelector('.mein-plan-headline-value')).not.toBeNull()
    // Stable section ids drive the URL fragment + the receipt's edit link.
    expect(container.querySelector('#mein-plan-zusammensetzung')).not.toBeNull()
    expect(container.querySelector('#mein-plan-sensitivitaet')).not.toBeNull()
    // Mono kicker labels for both sections.
    const kickers = Array.from(
      container.querySelectorAll('.mein-plan-section-num'),
    ).map((n) => n.textContent ?? '')
    expect(kickers).toContain('§ 1')
    expect(kickers).toContain('§ 2')
  })

  it('shows the projected monthly net retirement income in the headline', () => {
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    const value = container.querySelector('.mein-plan-headline-value')
    expect(value).not.toBeNull()
    // formatCurrency adds a non-breaking space + "€" suffix — accept either
    // ASCII or non-breaking variants.
    expect(value!.textContent).toMatch(/€/)
  })

  it('lists the statutory pension as the leading composition row', () => {
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    const rows = container.querySelectorAll('.mein-plan-zusammen-table tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    // The statutory row always renders first; default workspace has
    // pensionBaselineType = 'grv' → label "Gesetzliche Rente".
    expect(rows[0].textContent).toContain('Gesetzliche Rente')
  })

  it('renders at least four sensitivity rows by default (Rendite, Renteneintritt, Inflation, ETF-Bump)', () => {
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    const sensRows = container.querySelectorAll('.mein-plan-sens-row')
    // Each of the four perturbations contributes one row when its
    // precondition is met; the default workspace satisfies all four
    // (basis scenario != konservativ, retirementAge 67 != 70, default
    // inflationRate 0 != 0.03, at least one ETF instance).
    expect(sensRows.length).toBeGreaterThanOrEqual(4)
  })

  it('emits no inline JSON-LD (head pipeline owns the "/" WebPage block)', () => {
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    // The "/" WebPage JSON-LD is emitted into <head> by
    // `renderRouteHeadHtml('/')` via the SSG prerender path. Emitting a
    // second copy inline would duplicate the schema and trip the "single
    // JSON-LD per route" invariant.
    expect(container.innerHTML).not.toMatch(/application\/ld\+json/)
  })

  it('contains no "Rentenrechner" public-copy regression (brand P0 guardrail)', () => {
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    // Brand: chrome reads as "RentenWiki"; "Rentenrechner" is the internal
    // working name and must NEVER appear in user-visible copy.
    expect(container.textContent ?? '').not.toContain('Rentenrechner')
  })

  it('contains no "Empfehlung" framing in the body (commercial-license P0 guardrail)', () => {
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    // The page is illustrative; "Empfehlung" would imply Beratung which we
    // are not licensed to provide (see CLAUDE.md compliance guardrails).
    expect(container.textContent ?? '').not.toMatch(/Empfehlung/)
  })

  it('renders without throwing at every viewport (phone / tablet / desktop)', () => {
    const props = buildProps()
    eachViewport(() => {
      const { unmount } = render(inShell(<MeinPlanPage {...props} />))
      // At each viewport, the headline figure stays in the DOM.
      expect(document.querySelector('.mein-plan-headline-value')).not.toBeNull()
      unmount()
    })
  })

  it('exposes the right-rail receipt as a phone-collapsible strip at the phone breakpoint', () => {
    mockViewport('phone')
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    // RightRailAccordion renders a strip button at phone breakpoint.
    const strip = container.querySelector('.rw-right-rail__strip')
    expect(strip).not.toBeNull()
    expect(strip!.getAttribute('aria-expanded')).toBe('false')
    expect(strip!.getAttribute('aria-controls')).toBe('rw-right-rail-drawer')
    // Tapping opens the drawer which contains the receipt body.
    fireEvent.click(strip!)
    const drawer = container.querySelector('#rw-right-rail-drawer')
    expect(drawer).not.toBeNull()
    const receipt = drawer!.querySelector('[data-testid="mein-plan-receipt"]')
    expect(receipt).not.toBeNull()
  })

  it('renders the right-rail receipt inline (aside, not strip) at desktop', () => {
    mockViewport('desktop')
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    // Desktop: aside is always visible, no strip element.
    expect(container.querySelector('.rw-right-rail__strip')).toBeNull()
    expect(container.querySelector('.rw-right-rail')).not.toBeNull()
    expect(container.querySelector('[data-testid="mein-plan-receipt"]')).not.toBeNull()
  })

  it('routes the receipt "Angaben bearbeiten" link through the SPA navigator', () => {
    const props = buildProps()
    const navigate = vi.fn()
    const { container } = render(<MeinPlanPage {...props} navigate={navigate} />)
    const editLink = container.querySelector(
      'a.mein-plan-receipt-edit',
    ) as HTMLAnchorElement | null
    expect(editLink).not.toBeNull()
    fireEvent.click(editLink!)
    expect(navigate).toHaveBeenCalledWith('/eingaben')
  })

  it('preserves modified-click default on the receipt edit link', () => {
    // Cmd/Ctrl/middle/Shift-click must NOT preventDefault, so users can open
    // the link in a new tab. `shouldUseSpaNavigation` guards SPA-intercept
    // anchors against modifier clicks.
    const props = buildProps()
    const navigate = vi.fn()
    const { container } = render(<MeinPlanPage {...props} navigate={navigate} />)
    const editLink = container.querySelector(
      'a.mein-plan-receipt-edit',
    ) as HTMLAnchorElement | null
    expect(editLink).not.toBeNull()
    fireEvent.click(editLink!, { metaKey: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not write to STORAGE_KEY_V1 or modify STORAGE_KEY_V2 on first mount (no first-mount writes)', () => {
    // PR 6 must not regress the first-mount discipline pinned by PR 283.
    // Rendering MeinPlanPage must NOT trigger any storage writes — the page
    // only reads workspace + simulation props. The receipt does consume
    // `useAngabenState`, which has its own mount-time write skip
    // (`persistOnMount: false` for combine-mode workspaces).
    // Seed once (random instance ids are stable across a single fixture
    // call) so the before/after comparison is byte-identical when no
    // write occurred.
    const ws = buildCombineWorkspace()
    const v2Before = localStorage.getItem(STORAGE_KEY_V2)
    const v1Before = localStorage.getItem(STORAGE_KEY_V1)
    const props = buildProps(ws)
    render(<MeinPlanPage {...props} />)
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBe(v1Before)
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBe(v2Before)
  })

  it('renders an empty-state when no instances are active', () => {
    // Default workspace with no instance arrays populated yields an empty
    // composition table; the page surfaces a "noch keine aktiven Verträge"
    // copy block rather than rendering an empty table.
    const ws: Workspace = { ...defaultWorkspace, mode: 'combine' }
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
    const props = buildProps(ws)
    const { container } = render(<MeinPlanPage {...props} />)
    expect(container.textContent).toContain('Noch keine aktiven Verträge')
  })

  it('does not render the old MeinPlanSidebar pane navigation', () => {
    // PR 6 deleted the pane switcher from the combine-mode render path.
    // The class names that drove it must not appear anywhere in the page
    // output, even as legacy CSS hooks.
    const props = buildProps()
    const { container } = render(<MeinPlanPage {...props} />)
    expect(container.querySelector('.pane-sidebar')).toBeNull()
    // Vergleich sidebar specifically — used in compare-mode only.
    expect(container.querySelector('.compare-layout-sidebar')).toBeNull()
  })
})
