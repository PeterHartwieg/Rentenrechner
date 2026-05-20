// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { AppShell } from '../../ui/chrome/AppShell'
import { pathToRoute } from '../../app/useRoute'
import { VertragDetailPage } from './VertragDetailPage'
import { defaultWorkspace, STORAGE_KEY_V2 } from '../../storage'
import { addInstanceToWorkspace } from '../inventory/inventoryHelpers'
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

function inShell(node: ReactElement, path: string = '/') {
  return createElement(AppShell, {
    route: pathToRoute(path),
    navigate: () => {},
    children: node,
  })
}

/**
 * Build a combine-mode workspace with one active bAV + one active ETF
 * instance so the page has real per-instance simulation results to render.
 * Seeds STORAGE_KEY_V2 with the workspace so `usePortfolioState` picks it
 * up on mount and `detectSavedMode` returns 'combine'.
 */
function seedCombineWorkspaceWithBav(): { workspace: Workspace; bavId: string; etfId: string } {
  let ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
  ws = { ...ws, mode: 'combine' }
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, 'etf')
  const bavId = ws.baseline.assumptions.bav[0].instanceId
  const etfId = ws.baseline.assumptions.etf[0].instanceId
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
  return { workspace: ws, bavId, etfId }
}

describe('VertragDetailPage — combine-mode drill-in surface', () => {
  it('renders kicker, headline, and the four KPI tiles', () => {
    const { bavId } = seedCombineWorkspaceWithBav()
    const { container } = render(
      <VertragDetailPage instanceId={bavId} navigate={() => {}} />,
    )
    expect(container.querySelector('.vertrag-kicker')).not.toBeNull()
    expect(container.querySelector('.vertrag-headline')).not.toBeNull()
    const tiles = container.querySelectorAll('.vertrag-kpi-tile')
    expect(tiles.length).toBe(4)
  })

  it('shows the § 2 "Wie wir das berechnen" provenance section', () => {
    const { bavId } = seedCombineWorkspaceWithBav()
    const { container } = render(
      <VertragDetailPage instanceId={bavId} navigate={() => {}} />,
    )
    expect(container.querySelector('#vertrag-section-provenance')).not.toBeNull()
  })

  it('renders the scenario table with at least one current-marked row', () => {
    const { bavId } = seedCombineWorkspaceWithBav()
    const { container } = render(
      <VertragDetailPage instanceId={bavId} navigate={() => {}} />,
    )
    const rows = container.querySelectorAll('.vertrag-scenario-row')
    expect(rows.length).toBeGreaterThan(0)
    const currentRows = container.querySelectorAll('.vertrag-scenario-row--current')
    // Weiterführen wie bisher always pins as current.
    expect(currentRows.length).toBe(1)
  })

  it('renders the right-rail Vertragsdaten metadata aside', () => {
    const { bavId } = seedCombineWorkspaceWithBav()
    const { container } = render(
      <VertragDetailPage instanceId={bavId} navigate={() => {}} />,
    )
    expect(container.querySelector('.vertrag-metadata-aside')).not.toBeNull()
    // Status pill is rendered for the active instance.
    const status = container.querySelector('.vertrag-status-pill--active')
    expect(status).not.toBeNull()
  })

  it('falls back to the empty state when :instanceId does not match a workspace instance', () => {
    seedCombineWorkspaceWithBav()
    const { container } = render(
      <VertragDetailPage instanceId="bav-does-not-exist" navigate={() => {}} />,
    )
    expect(container.querySelector('.vertrag-empty')).not.toBeNull()
    expect(container.textContent ?? '').toContain('nicht gefunden')
    // No KPI / scenario / metadata sections in the fallback view.
    expect(container.querySelector('.vertrag-kpi-strip')).toBeNull()
    expect(container.querySelector('.vertrag-scenario-table')).toBeNull()
  })

  it('falls back to the compare-mode empty state when the saved mode is compare', () => {
    // Seed the v2 key with mode === 'compare' so detectSavedMode short-circuits
    // to the compare-mode empty state regardless of the instance id.
    const ws: Workspace = JSON.parse(JSON.stringify(defaultWorkspace))
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ ...ws, mode: 'compare' }))
    const { container } = render(
      <VertragDetailPage instanceId="bav-any" navigate={() => {}} />,
    )
    expect(container.querySelector('.vertrag-empty')).not.toBeNull()
    expect(container.textContent ?? '').toContain('Plan-Modus')
  })

  it('renders the KPI strip in 4-up grid at desktop and tablet, 2×2 at phone', () => {
    const { bavId } = seedCombineWorkspaceWithBav()
    eachViewport((viewport) => {
      const { container } = render(
        <VertragDetailPage instanceId={bavId} navigate={() => {}} />,
      )
      const tiles = container.querySelectorAll('.vertrag-kpi-tile')
      // Same four tiles render at every viewport — CSS handles the visual
      // collapse to 2×2 at phone via the `.vertrag-kpi-strip` media query.
      expect(tiles.length, `kpi-tile count at ${viewport}`).toBe(4)
      cleanup()
    })
  })

  it('contains no "Rentenrechner" public-copy regression (brand P0 guardrail)', () => {
    const { bavId } = seedCombineWorkspaceWithBav()
    const { container } = render(
      <VertragDetailPage instanceId={bavId} navigate={() => {}} />,
    )
    // The chrome reads "RentenWiki" / "RentenWiki.de"; the working name
    // "Rentenrechner" must never appear in user-visible copy.
    expect(container.textContent ?? '').not.toContain('Rentenrechner')
  })

  it('contains no "Empfehlung" framing in the scenario rows (commercial-license P0 guardrail)', () => {
    const { bavId } = seedCombineWorkspaceWithBav()
    const { container } = render(
      <VertragDetailPage instanceId={bavId} navigate={() => {}} />,
    )
    // The page is illustrative; "Empfehlung" would imply Beratung the
    // free product is not licensed to give. The scenario table must
    // never surface that word.
    expect(container.textContent ?? '').not.toMatch(/Empfehlung/)
  })

  it('mounts cleanly inside AppShell at all three viewports', () => {
    const { bavId } = seedCombineWorkspaceWithBav()
    eachViewport((viewport) => {
      const { container } = render(
        inShell(<VertragDetailPage instanceId={bavId} navigate={() => {}} />),
      )
      expect(container.querySelector('.vertrag-shell'), `shell at ${viewport}`).not.toBeNull()
      cleanup()
    })
  })
})
