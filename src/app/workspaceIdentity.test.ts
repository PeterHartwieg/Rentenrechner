/**
 * Unit tests for workspaceIdentity.ts (architecture-readability issue 01).
 *
 * Coverage:
 *  - newScenarioId  shape, prefix, uniqueness
 *  - newInstanceId  shape, prefix, uniqueness
 *  - deepCloneScenario  structural clone isolation
 *  - addInstanceToWorkspace  add / label / immutability / id format / all products
 *  - removeInstanceFromWorkspace  remove / multi-instance / no-op / pinned cleanup / immutability
 */

import { describe, expect, it } from 'vitest'
import { defaultWorkspace } from '../storage'
import {
  newScenarioId,
  newInstanceId,
  deepCloneScenario,
  addInstanceToWorkspace,
  removeInstanceFromWorkspace,
} from './workspaceIdentity'

// ---------------------------------------------------------------------------
// newScenarioId
// ---------------------------------------------------------------------------

describe('newScenarioId', () => {
  it('returns a string starting with the requested prefix', () => {
    expect(newScenarioId('whatif')).toMatch(/^whatif-/)
    expect(newScenarioId('baseline')).toMatch(/^baseline-/)
  })

  it('defaults to "whatif" prefix when none is supplied', () => {
    expect(newScenarioId()).toMatch(/^whatif-/)
  })

  it('returns distinct values on successive calls', () => {
    const a = newScenarioId('whatif')
    const b = newScenarioId('whatif')
    expect(a).not.toBe(b)
  })

  it('returns a non-empty suffix after the prefix', () => {
    const id = newScenarioId('whatif')
    // Must contain something after "whatif-"
    expect(id.length).toBeGreaterThan('whatif-'.length)
  })
})

// ---------------------------------------------------------------------------
// newInstanceId
// ---------------------------------------------------------------------------

describe('newInstanceId', () => {
  it('returns a string in the format ${productId}-${random8}', () => {
    expect(newInstanceId('bav')).toMatch(/^bav-[a-z0-9]{8}$/)
    expect(newInstanceId('etf')).toMatch(/^etf-[a-z0-9]{8}$/)
    expect(newInstanceId('versicherung')).toMatch(/^versicherung-[a-z0-9]{8}$/)
  })

  it('returns distinct values on successive calls', () => {
    const a = newInstanceId('bav')
    const b = newInstanceId('bav')
    expect(a).not.toBe(b)
  })

  it('accepts any productId prefix', () => {
    const id = newInstanceId('altersvorsorgedepot')
    expect(id).toMatch(/^altersvorsorgedepot-/)
  })
})

// ---------------------------------------------------------------------------
// deepCloneScenario
// ---------------------------------------------------------------------------

describe('deepCloneScenario', () => {
  it('produces a structural clone that does not share references', () => {
    const source = { a: { b: 1 } }
    const clone = deepCloneScenario(source)
    clone.a.b = 99
    expect(source.a.b).toBe(1)
  })

  it('handles arrays inside the cloned value', () => {
    const source = { items: [1, 2, 3] }
    const clone = deepCloneScenario(source)
    clone.items.push(4)
    expect(source.items).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// addInstanceToWorkspace
// ---------------------------------------------------------------------------

describe('addInstanceToWorkspace', () => {
  it('adds a bAV instance to an empty workspace', () => {
    const ws = deepCloneScenario(defaultWorkspace)
    expect(ws.baseline.assumptions.bav).toHaveLength(0)
    const updated = addInstanceToWorkspace(ws, 'bav')
    expect(updated.baseline.assumptions.bav).toHaveLength(1)
  })

  it('appends a second bAV instance', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'bav')
    const ws2 = addInstanceToWorkspace(ws1, 'bav')
    expect(ws2.baseline.assumptions.bav).toHaveLength(2)
  })

  it('labels the first bAV instance "bAV #1"', () => {
    const ws = addInstanceToWorkspace(defaultWorkspace, 'bav')
    expect(ws.baseline.assumptions.bav[0].label).toBe('bAV #1')
  })

  it('labels the second bAV instance with "#2" suffix', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'bav')
    const ws2 = addInstanceToWorkspace(ws1, 'bav')
    expect(ws2.baseline.assumptions.bav[1].label).toMatch(/#2/)
  })

  it('instanceId follows ${productId}-${random8} format', () => {
    const ws = addInstanceToWorkspace(defaultWorkspace, 'bav')
    expect(ws.baseline.assumptions.bav[0].instanceId).toMatch(/^bav-[a-z0-9]{8}$/)
  })

  it('assigns distinct instanceIds to consecutive bAV instances', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'bav')
    const ws2 = addInstanceToWorkspace(ws1, 'bav')
    const id0 = ws2.baseline.assumptions.bav[0].instanceId
    const id1 = ws2.baseline.assumptions.bav[1].instanceId
    expect(id0).not.toBe(id1)
  })

  it('does not mutate the original workspace', () => {
    const origCount = defaultWorkspace.baseline.assumptions.bav.length
    addInstanceToWorkspace(defaultWorkspace, 'bav')
    expect(defaultWorkspace.baseline.assumptions.bav).toHaveLength(origCount)
  })

  it('adds instances for all supported product types', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'versicherung')
    expect(ws1.baseline.assumptions.insurance).toHaveLength(1)

    const ws2 = addInstanceToWorkspace(defaultWorkspace, 'riester')
    expect(ws2.baseline.assumptions.riester).toHaveLength(1)

    const ws3 = addInstanceToWorkspace(defaultWorkspace, 'basisrente')
    expect(ws3.baseline.assumptions.basisrente).toHaveLength(1)

    const ws4 = addInstanceToWorkspace(defaultWorkspace, 'altersvorsorgedepot')
    expect(ws4.baseline.assumptions.altersvorsorgedepot).toHaveLength(1)

    const ws5 = addInstanceToWorkspace(defaultWorkspace, 'etf')
    expect(ws5.baseline.assumptions.etf).toHaveLength(1)
  })

  it('versicherung instanceId follows versicherung-${random8} format', () => {
    const ws = addInstanceToWorkspace(defaultWorkspace, 'versicherung')
    expect(ws.baseline.assumptions.insurance[0].instanceId).toMatch(/^versicherung-[a-z0-9]{8}$/)
  })

  it('etf instanceId follows etf-${random8} format', () => {
    const ws = addInstanceToWorkspace(defaultWorkspace, 'etf')
    expect(ws.baseline.assumptions.etf[0].instanceId).toMatch(/^etf-[a-z0-9]{8}$/)
  })
})

// ---------------------------------------------------------------------------
// removeInstanceFromWorkspace
// ---------------------------------------------------------------------------

describe('removeInstanceFromWorkspace', () => {
  it('removes the only bAV instance', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'bav')
    const id = ws1.baseline.assumptions.bav[0].instanceId
    const ws2 = removeInstanceFromWorkspace(ws1, 'bav', id)
    expect(ws2.baseline.assumptions.bav).toHaveLength(0)
  })

  it('removes only the matching instance when two exist', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'bav')
    const ws2 = addInstanceToWorkspace(ws1, 'bav')
    const id0 = ws2.baseline.assumptions.bav[0].instanceId
    const id1 = ws2.baseline.assumptions.bav[1].instanceId
    const ws3 = removeInstanceFromWorkspace(ws2, 'bav', id0)
    expect(ws3.baseline.assumptions.bav).toHaveLength(1)
    expect(ws3.baseline.assumptions.bav[0].instanceId).toBe(id1)
  })

  it('is a no-op for an unknown instanceId', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'bav')
    const ws2 = removeInstanceFromWorkspace(ws1, 'bav', 'bav-unknown00')
    expect(ws2.baseline.assumptions.bav).toHaveLength(1)
  })

  it('cleans up pinnedComparisonIds referencing the removed instance', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'bav')
    const id = ws1.baseline.assumptions.bav[0].instanceId
    const ws1pinned = { ...ws1, pinnedComparisonIds: [id, 'other-id'] }
    const ws2 = removeInstanceFromWorkspace(ws1pinned, 'bav', id)
    expect(ws2.pinnedComparisonIds).toEqual(['other-id'])
  })

  it('does not mutate the original workspace', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'bav')
    const id = ws1.baseline.assumptions.bav[0].instanceId
    removeInstanceFromWorkspace(ws1, 'bav', id)
    expect(ws1.baseline.assumptions.bav).toHaveLength(1)
  })

  it('removes versicherung instance by id', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'versicherung')
    const id = ws1.baseline.assumptions.insurance[0].instanceId
    const ws2 = removeInstanceFromWorkspace(ws1, 'versicherung', id)
    expect(ws2.baseline.assumptions.insurance).toHaveLength(0)
  })

  it('removes riester instance by id', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'riester')
    const id = ws1.baseline.assumptions.riester[0].instanceId
    const ws2 = removeInstanceFromWorkspace(ws1, 'riester', id)
    expect(ws2.baseline.assumptions.riester).toHaveLength(0)
  })

  it('removes etf instance by id', () => {
    const ws1 = addInstanceToWorkspace(defaultWorkspace, 'etf')
    const id = ws1.baseline.assumptions.etf[0].instanceId
    const ws2 = removeInstanceFromWorkspace(ws1, 'etf', id)
    expect(ws2.baseline.assumptions.etf).toHaveLength(0)
  })
})
