// @vitest-environment jsdom
/**
 * Render-integration tests for CombineDashboardSidebar.
 *
 * Uses jsdom + @testing-library/react. The component has top-level hooks
 * (`useState` for the archive double-click guard) so a real React renderer
 * is required.
 */

import { describe, expect, it } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { CombineDashboardSidebar } from './CombineDashboardSidebar'
import { addInstanceToWorkspace } from './inventoryHelpers'
import { defaultWorkspace } from '../../storage'
import type { WorkspaceAssumptionsV2, WhatIfScenario, Scenario } from '../../domain/workspace'
import type { MultiInstanceProductId } from '../../app/portfolioState'

function dilanWorkspace() {
  let ws = { ...defaultWorkspace }
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, 'bav')
  ws = addInstanceToWorkspace(ws, 'etf')
  ws = addInstanceToWorkspace(ws, 'riester')
  return ws
}

function wrapScenario(assumptions: WorkspaceAssumptionsV2): Scenario {
  return {
    id: 'baseline',
    label: 'Baseline',
    profile: defaultWorkspace.baseline.profile,
    assumptions,
    createdAt: new Date(0).toISOString(),
    origin: 'baseline',
  }
}

function makeProps(ws: ReturnType<typeof dilanWorkspace>) {
  const { assumptions } = ws.baseline
  return {
    baseline: wrapScenario(assumptions),
    assumptions,
    whatIfs: [] as WhatIfScenario[],
    onPatchAssumptions: () => {},
    addInstance: (_id: MultiInstanceProductId) => { void _id },
    removeInstance: (_pid: MultiInstanceProductId, _iid: string) => { void _pid; void _iid },
    onRebaseWhatIf: () => {},
    onFreezeWhatIf: () => {},
    onArchiveAndRestart: () => {},
  }
}

describe('CombineDashboardSidebar — render integration', () => {
  it('Dilan-shape workspace (2 bAV + 1 ETF + 1 Riester) renders 4 instance cards total', () => {
    const ws = dilanWorkspace()
    expect(ws.baseline.assumptions.bav.length).toBe(2)
    expect(ws.baseline.assumptions.etf.length).toBe(1)
    expect(ws.baseline.assumptions.riester.length).toBe(1)

    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const cards = container.querySelectorAll('.combine-instance-card')
    expect(cards.length).toBe(4)
    cleanup()
  })

  it('adding a third bAV instance causes a fifth card to appear', () => {
    const ws = dilanWorkspace()
    const { container, rerender } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    expect(container.querySelectorAll('.combine-instance-card').length).toBe(4)

    const ws3 = addInstanceToWorkspace(ws, 'bav')
    expect(ws3.baseline.assumptions.bav.length).toBe(3)
    rerender(<CombineDashboardSidebar {...makeProps(ws3)} />)

    expect(container.querySelectorAll('.combine-instance-card').length).toBe(5)
    cleanup()
  })

  it('M1 limitation banner renders for the ETF card', () => {
    const ws = dilanWorkspace()
    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const banners = container.querySelectorAll('.inv-m1-banner')
    // Dilan has 1 ETF, 0 pAV → 1 banner.
    expect(banners.length).toBe(1)
    expect(banners[0].textContent).toContain('ETF')
    expect(banners[0].textContent).toContain('Issue 15')
    cleanup()
  })

  it('M1 limitation banner renders for both ETF and pAV cards when both exist', () => {
    const ws = addInstanceToWorkspace(dilanWorkspace(), 'versicherung')
    expect(ws.baseline.assumptions.insurance.length).toBe(1)

    const { container } = render(<CombineDashboardSidebar {...makeProps(ws)} />)
    const banners = container.querySelectorAll('.inv-m1-banner')
    expect(banners.length).toBe(2)
    const texts = Array.from(banners).map((b) => b.textContent ?? '')
    expect(texts.some((t) => t.includes('ETF'))).toBe(true)
    expect(texts.some((t) => t.includes('Versicherung'))).toBe(true)
    cleanup()
  })
})
