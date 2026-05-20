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
import * as sensitivitySelectors from './sensitivitySelectors'

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
 * target. The workspace mode is set to `'combine'`.
 *
 * Note: the receipt no longer reads from storage via `useAngabenState` — it
 * receives `profile` and `assumptions` directly from `MeinPlanPage` props.
 * This helper therefore does NOT need to seed `STORAGE_KEY_V2` for the
 * receipt to display correct data. The `buildProps` helper passes the
 * workspace directly as a prop.
 */
function buildCombineWorkspace(): Workspace {
  let ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
  ws = { ...ws, mode: 'combine' }
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, 'etf')
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

  it('does not write to STORAGE_KEY_V1 or STORAGE_KEY_V2 on first mount (no first-mount writes)', () => {
    // PR 6 must not regress the first-mount discipline pinned by PR 283.
    // Rendering MeinPlanPage must NOT trigger any storage writes — the page
    // only reads workspace + simulation props. The receipt is now a pure
    // presentation component receiving profile + assumptions via props, so it
    // never calls useAngabenState and never writes storage on mount.
    const ws = buildCombineWorkspace()
    const v2Before = localStorage.getItem(STORAGE_KEY_V2)
    const v1Before = localStorage.getItem(STORAGE_KEY_V1)
    const props = buildProps(ws)
    render(<MeinPlanPage {...props} />)
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBe(v1Before)
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBe(v2Before)
  })

  it('receipt follows props, not localStorage, when storage lags behind the live workspace (race regression)', () => {
    // Regression test for Codex P1 (PR #284 R1): the former useAngabenState()
    // call in MeinPlanReceiptAside read localStorage at mount time to detect
    // mode. When a user transitioned compare→combine in the same session,
    // usePortfolioState persisted the new mode asynchronously via a useEffect,
    // so localStorage could still contain compare-mode data at the moment the
    // receipt mounted. The receipt would then display stale compare-mode profile
    // values (e.g. a different retirementAge from the compare-mode singleton).
    //
    // The fix: the receipt receives profile + assumptions directly from
    // MeinPlanPage props (always derived from the live workspace). This test
    // simulates the race by poisoning localStorage with compare-mode data
    // carrying a distinct retirementAge (99), while the workspace prop carries
    // the real combine-mode value (67). The receipt must display 67.
    const staleCombineAge = 99 // obviously wrong sentinel value
    const staleCompareState = {
      profile: { ...defaultWorkspace.baseline.profile, retirementAge: staleCombineAge },
      assumptions: defaultWorkspace.baseline.assumptions,
    }
    // Poison compare-mode storage key (what useAngabenState used to read from
    // in compare-mode detection when mode was not yet persisted).
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(staleCompareState))

    // The workspace prop carries the correct combine-mode age.
    const ws = buildCombineWorkspace() // retirementAge = defaultWorkspace.baseline.profile.retirementAge (e.g. 67)
    const props = buildProps(ws)

    const { container } = render(<MeinPlanPage {...props} />)
    const receipt = container.querySelector('[data-testid="mein-plan-receipt"]')
    expect(receipt).not.toBeNull()

    // The receipt must show the prop-driven workspace age, not the stale
    // localStorage age. The sentinel value 99 must not appear anywhere.
    expect(receipt!.textContent).not.toContain(`${staleCombineAge}`)
    // And the real workspace age must appear.
    expect(receipt!.textContent).toContain(
      `${ws.baseline.profile.retirementAge} Jahre`,
    )
  })

  it('renders an empty-state for § 1 only when no rows exist at all', () => {
    // Default workspace with no instance arrays populated: `collectZusammenRows`
    // always emits a leading statutory-pension row regardless of whether contract
    // instances exist. So `hasZusammenRows` is true (the GRV row is present) and
    // the § 1 table renders — it just has only the statutory-pension entry.
    // The empty-state copy "Noch keine aktiven Verträge" must NOT appear for § 1.
    // No localStorage seeding needed: the receipt reads from props, not storage.
    const ws: Workspace = { ...defaultWorkspace, mode: 'combine' }
    const props = buildProps(ws)
    const { container } = render(<MeinPlanPage {...props} />)
    // § 1 table must render with the GRV row (statutory pension always present).
    const zusammenTable = container.querySelector('.mein-plan-zusammen-table')
    expect(zusammenTable).not.toBeNull()
    const rows = container.querySelectorAll('.mein-plan-zusammen-table tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].textContent).toContain('Gesetzliche Rente')
    // The "no contracts" empty-state must NOT appear inside § 1.
    const zusammenSec = container.querySelector('section[aria-labelledby="mein-plan-zusammensetzung"]')
    expect(zusammenSec).not.toBeNull()
    expect(zusammenSec!.querySelector('.mein-plan-zusammen-empty')).toBeNull()
  })

  it('Zusammensetzung table shows monthlyOwnContribution for AVD and Riester rows (Codex P2 regression)', () => {
    // Regression guard: AltersvorsorgedepotInstance and RiesterInstance carry
    // `monthlyOwnContribution` (from their Assumptions types), NOT
    // `eigenbeitragMonthly`. The R2 code read the wrong field and rendered
    // '–' (null dash) for every AVD/Riester row. This test seeds a workspace
    // with one AVD (default 200 €/Mon.) + one Riester (default 100 €/Mon.)
    // instance and asserts the "Beitrag heute" column shows the real values.
    let ws: Workspace = { ...defaultWorkspace, mode: 'combine' }
    ws = addInstanceToWorkspace(ws, 'altersvorsorgedepot')
    ws = addInstanceToWorkspace(ws, 'riester')
    const props = buildProps(ws)
    const { container } = render(<MeinPlanPage {...props} />)

    // Collect "Beitrag" cells from instance rows only (skip the leading
    // statutory-pension row, which always renders '–' because users don't
    // directly contribute to the GRV). Instance rows follow the statutory row.
    const allRows = Array.from(
      container.querySelectorAll('.mein-plan-zusammen-table tbody tr'),
    )
    // First row is the statutory pension row; skip it.
    const instanceRows = allRows.slice(1)
    const beitragCells = instanceRows.map(
      (tr) => tr.querySelector('td[data-label="Beitrag"]')?.textContent?.trim() ?? '',
    )

    // Neither AVD nor Riester contribution column must be '–' (null fallback).
    // Before the fix, `eigenbeitragMonthly` was read instead of `monthlyOwnContribution`,
    // yielding undefined → null → '–' for every AVD/Riester row.
    const dashes = beitragCells.filter((t) => t === '–')
    expect(dashes.length).toBe(0)
    // Default AVD = 200 €/Mon., default Riester = 100 €/Mon.
    expect(beitragCells.some((t) => t.includes('200'))).toBe(true)
    expect(beitragCells.some((t) => t.includes('100'))).toBe(true)
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

  it('hides sensitivity rows and shows empty-state copy when workspace has zero contract instances (Codex P2 guard)', () => {
    // Regression: when combinedForScenario is truthy but no active/paid_up
    // contract instances exist, the page must NOT build sensitivity rows (wasted
    // runCombineSimulation reruns) and must show the empty-state copy in § 2.
    //
    // Note: § 1 Zusammensetzung DOES render in this case (the statutory-pension
    // row is always present) — only § 2 is gated on `hasContractRows`.
    //
    // The hasContractRows guard in MeinPlanPage short-circuits the useMemo so
    // none of the sensitivity selectors are called. We spy on
    // sensitivityIfReturnScenario (the first candidate in buildSensitivityRows)
    // to assert that the guard holds — if it is called, the guard is broken.
    const spy = vi.spyOn(sensitivitySelectors, 'sensitivityIfReturnScenario')
    try {
      const ws: Workspace = { ...defaultWorkspace, mode: 'combine' }
      const props = buildProps(ws)
      const { container } = render(<MeinPlanPage {...props} />)
      // The sensitivity recompute selector must NOT have been invoked.
      expect(spy).not.toHaveBeenCalled()
      // No sensitivity rows rendered.
      expect(container.querySelectorAll('.mein-plan-sens-row').length).toBe(0)
      // The § 2 section must show the empty-state copy, not a real row.
      // The id is on the <h2>; the enclosing <section> uses aria-labelledby.
      const sensSec = container.querySelector('section[aria-labelledby="mein-plan-sensitivitaet"]')
      expect(sensSec).not.toBeNull()
      // The empty-state paragraph (not a <li> row) must be inside the section.
      expect(sensSec!.querySelector('.mein-plan-zusammen-empty')).not.toBeNull()
      expect(sensSec!.textContent).toContain('ersten Vertrag im Plan')
    } finally {
      spy.mockRestore()
    }
  })

  it('§ 1 leading row shows "Beamtenpension" when pensionBaselineType is beamtenpension (R6 regression)', () => {
    // Regression guard for Codex P2 (PR #284 R6): the old code checked
    // 'beamten' which never matched the actual enum value 'beamtenpension',
    // so Beamte users always saw "Gesetzliche Rente" instead of "Beamtenpension".
    const ws: Workspace = {
      ...defaultWorkspace,
      mode: 'combine',
      baseline: {
        ...defaultWorkspace.baseline,
        assumptions: {
          ...defaultWorkspace.baseline.assumptions,
          statutoryPension: {
            ...defaultWorkspace.baseline.assumptions.statutoryPension,
            pensionBaselineType: 'beamtenpension',
          },
        },
      },
    }
    const props = buildProps(ws)
    const { container } = render(<MeinPlanPage {...props} />)
    const rows = container.querySelectorAll('.mein-plan-zusammen-table tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].textContent).toContain('Beamtenpension')
    expect(rows[0].textContent).not.toContain('Gesetzliche Rente')
  })

  it('§ 1 leading row shows "Keine Pflichtrente" when pensionBaselineType is none (R6 regression)', () => {
    // Regression guard for Codex P2 (PR #284 R6): the old code checked
    // 'manual' which never matched the actual enum value 'none', so users
    // without a mandatory pension baseline always saw "Gesetzliche Rente".
    const ws: Workspace = {
      ...defaultWorkspace,
      mode: 'combine',
      baseline: {
        ...defaultWorkspace.baseline,
        assumptions: {
          ...defaultWorkspace.baseline.assumptions,
          statutoryPension: {
            ...defaultWorkspace.baseline.assumptions.statutoryPension,
            pensionBaselineType: 'none',
          },
        },
      },
    }
    const props = buildProps(ws)
    const { container } = render(<MeinPlanPage {...props} />)
    const rows = container.querySelectorAll('.mein-plan-zusammen-table tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].textContent).toContain('Keine Pflichtrente')
    expect(rows[0].textContent).not.toContain('Gesetzliche Rente')
  })

  it('§ 1 leading row sublabel shows "Beamtenversorgung · § 19 EStG" for beamtenpension (R7 regression)', () => {
    // Regression guard for CR Major (PR #284 R7): before the fix the statutory
    // row's sublabel was hardcoded to "Gesetzlich · § 22 Nr. 1 EStG" regardless
    // of PensionBaselineType. A Beamte user would see "Beamtenpension" as the
    // label but the contradictory GRV tax citation as the sublabel.
    const ws: Workspace = {
      ...defaultWorkspace,
      mode: 'combine',
      baseline: {
        ...defaultWorkspace.baseline,
        assumptions: {
          ...defaultWorkspace.baseline.assumptions,
          statutoryPension: {
            ...defaultWorkspace.baseline.assumptions.statutoryPension,
            pensionBaselineType: 'beamtenpension',
          },
        },
      },
    }
    const props = buildProps(ws)
    const { container } = render(<MeinPlanPage {...props} />)
    const rows = container.querySelectorAll('.mein-plan-zusammen-table tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    // Label (R6) must still be correct.
    expect(rows[0].textContent).toContain('Beamtenpension')
    // Sublabel (R7) must cite § 19, not the GRV § 22 citation.
    const subEl = rows[0].querySelector('.mein-plan-zusammen-sub')
    expect(subEl).not.toBeNull()
    expect(subEl!.textContent).toContain('§ 19 EStG')
    expect(subEl!.textContent).not.toContain('§ 22')
  })

  it('§ 1 leading row has no sublabel element for pensionBaselineType none (R7 regression)', () => {
    // Regression guard for CR Major (PR #284 R7): the 'none' case renders
    // "Keine Pflichtrente" as the label but must not show any tax citation
    // sub-line — there is no statutory pension channel, so no § applies.
    const ws: Workspace = {
      ...defaultWorkspace,
      mode: 'combine',
      baseline: {
        ...defaultWorkspace.baseline,
        assumptions: {
          ...defaultWorkspace.baseline.assumptions,
          statutoryPension: {
            ...defaultWorkspace.baseline.assumptions.statutoryPension,
            pensionBaselineType: 'none',
          },
        },
      },
    }
    const props = buildProps(ws)
    const { container } = render(<MeinPlanPage {...props} />)
    const rows = container.querySelectorAll('.mein-plan-zusammen-table tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    // The sublabel <div> must be absent entirely for the 'none' case.
    const subEl = rows[0].querySelector('.mein-plan-zusammen-sub')
    expect(subEl).toBeNull()
  })
})
