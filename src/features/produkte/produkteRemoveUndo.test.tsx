// @vitest-environment jsdom

/**
 * F4 — "Entfernen" on `/eingaben/produkte` must be reversible.
 *
 * The combine-mode contract editor already routed removal through the shared
 * workspace store's undo-recording commit; this page wrote straight through,
 * so a removal here was silent and final — no "Rückgängig" on the page, and
 * none on the plan after returning to it.
 *
 * These tests mount the real page (no panel mock) so the whole path is
 * covered: `ProdukteEingabenPanel` → `useAngabenState.removeInstance` →
 * `commitWorkspace` → the shared `lastUndo` handle.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AngabenProduktePage } from '../inputs/AngabenProduktePage'
import { defaultWorkspace, STORAGE_KEY_V2 } from '../../storage'
import { addInstanceToWorkspace } from '../inventory/inventoryHelpers'
import { getWorkspaceSnapshot } from '../../app/portfolioState'
import type { Workspace } from '../../domain/workspace'

beforeEach(() => {
  localStorage.clear()
  window.history.pushState(null, '', '/eingaben/produkte')
})

afterEach(() => {
  cleanup()
})

/** Seed a combine-mode workspace holding exactly one ETF contract. */
function seedCombineWithEtf(): Workspace {
  let seed: Workspace = JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
  seed = { ...seed, mode: 'combine' }
  seed = addInstanceToWorkspace(seed, 'etf')
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(seed))
  return seed
}

function etfCount(): number {
  return getWorkspaceSnapshot().baseline.assumptions.etf.length
}

describe('/eingaben/produkte — Entfernen is reversible', () => {
  it('records an undo handle and surfaces "… · Rückgängig" after a removal', () => {
    seedCombineWithEtf()
    render(<AngabenProduktePage />)
    expect(etfCount()).toBe(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'Entfernen' })[0]!)

    expect(etfCount()).toBe(0)
    const status = screen.getByRole('status')
    expect(status.textContent ?? '').toContain('Vertrag entfernt')
    expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeDefined()
  })

  it('restores the removed contract when the undo is taken', () => {
    const seeded = seedCombineWithEtf()
    const instanceId = seeded.baseline.assumptions.etf[0]!.instanceId
    render(<AngabenProduktePage />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Entfernen' })[0]!)
    expect(etfCount()).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))

    const restored = getWorkspaceSnapshot().baseline.assumptions.etf
    expect(restored.length).toBe(1)
    expect(restored[0]!.instanceId).toBe(instanceId)
    // The handle is one level deep and consumed by the undo.
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull()
  })
})
