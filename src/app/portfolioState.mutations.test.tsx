// @vitest-environment jsdom
/**
 * Mutation and undo API tests (state contract §5, Phase 3).
 *
 * What these pin, in one sentence: a mutation is one atomic transaction, it
 * cleans up every reference to what it removed, and one level of undo brings
 * the whole workspace back — ids, pins, transfer events, visibility and what-if
 * staleness together.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { EtfInstance } from '../domain/instances'
import type { WhatIfScenario, Workspace } from '../domain/workspace'
import { defaultWorkspace, loadSavedWorkspace } from '../storage'
import { INVENTORY_PRODUCT_REGISTRY } from '../features/inventory/inventoryProductRegistry'
import type { WorkspaceUndo } from './portfolioState'
import {
  clearWorkspaceUndo,
  deepCloneScenario,
  resetPortfolioStore,
  forkBaselineScenario,
  productArrayShapeMatches,
  usePortfolioState,
  whatIfIsStale,
} from './portfolioState'

function etf(instanceId: string, monthlyContribution: number): EtfInstance {
  return {
    ...INVENTORY_PRODUCT_REGISTRY.etf.createDefault(2026, 1, () => instanceId),
    instanceId,
    label: instanceId,
    monthlyContribution,
  }
}

/** A two-contract combine workspace with a transfer, a pin and a frozen what-if. */
function populatedWorkspace(): Workspace {
  const ws = deepCloneScenario(defaultWorkspace)
  ws.mode = 'combine'
  ws.baseline.assumptions.etf = [
    etf('etf-aaaa1111', 200),
    {
      ...etf('etf-bbbb2222', 150),
      transferEvents: [
        {
          type: 'surrender_reinvest',
          year: 2030,
          sourceInstanceId: 'etf-aaaa1111',
          targetInstanceId: 'etf-bbbb2222',
          amountEUR: 5000,
          surrenderHaircutPct: 0.1,
        },
      ],
    },
  ]
  ws.baseline.assumptions.visibleInstanceIds = ['etf-aaaa1111', 'etf-bbbb2222']
  ws.baseline.lastEditedAt = 1000
  ws.pinnedComparisonIds = ['etf-aaaa1111']

  const whatIf: WhatIfScenario = {
    ...forkBaselineScenario(ws.baseline, 'Alternative'),
    frozenAt: 2000,
  }
  ws.whatIfs = [whatIf]
  return ws
}

/** Fork a what-if that changes one ETF contribution, timed so it is not stale. */
function contributionWhatIf(ws: Workspace, index: number, monthly: number): WhatIfScenario {
  const whatIf = forkBaselineScenario(ws.baseline, 'Mehr sparen')
  whatIf.assumptions.etf[index].monthlyContribution = monthly
  whatIf.derivedFromBaselineSnapshot.lastEditedAt = 5000
  return whatIf
}

beforeEach(() => {
  localStorage.clear()
  // The workspace is a module-level store shared by every route's hook mount;
  // drop it so this test hydrates from the just-cleared storage.
  resetPortfolioStore()
  // The undo handle is module-level so it survives a route change (the plan and
  // the contract editor mount separate hooks); drop it between tests.
  clearWorkspaceUndo()
})

// ---------------------------------------------------------------------------
// add / update
// ---------------------------------------------------------------------------

describe('addPopulatedInstance', () => {
  it('returns the id and an undo handle, and stamps the baseline', () => {
    const { result } = renderHook(() => usePortfolioState())
    let added: { instanceId: string } | null = null

    act(() => {
      added = result.current.addPopulatedInstance('etf', etf('etf-new00001', 300))
    })

    expect(added!.instanceId).toBe('etf-new00001')
    expect(result.current.workspace.baseline.assumptions.etf).toHaveLength(1)
    expect(result.current.workspace.baseline.lastEditedAt).toBeGreaterThan(0)
    expect(result.current.lastUndo?.label).toBe('Vertrag hinzugefügt')
  })

  it('merges the supplied input-status map onto the new instance', () => {
    const { result } = renderHook(() => usePortfolioState())
    act(() => {
      result.current.addPopulatedInstance('etf', etf('etf-new00001', 300), {
        currentValueEUR: 'unknown',
      })
    })
    expect(result.current.workspace.baseline.assumptions.etf[0].inputStatus).toEqual({
      currentValueEUR: 'unknown',
    })
  })

  it('undo removes it again', () => {
    const { result } = renderHook(() => usePortfolioState())
    let handle: ReturnType<typeof result.current.addPopulatedInstance> | null = null
    act(() => {
      handle = result.current.addPopulatedInstance('etf', etf('etf-new00001', 300))
    })
    act(() => result.current.undo(handle!.undo))

    expect(result.current.workspace.baseline.assumptions.etf).toHaveLength(0)
    expect(result.current.lastUndo).toBeNull()
  })
})

describe('addPopulatedInstance — contract labels', () => {
  /** What the contract editor hands over when the user typed no name. */
  function generated(instanceId: string): EtfInstance {
    return { ...etf(instanceId, 200), label: 'ETF-Depot', anbieter: undefined }
  }

  it('names the first contract of a product after the product, without a #1', () => {
    const { result } = renderHook(() => usePortfolioState())
    act(() => {
      result.current.addPopulatedInstance('etf', generated('etf-first0001'))
    })
    expect(result.current.workspace.baseline.assumptions.etf[0].label).toBe('ETF-Depot')
  })

  it('numbers the second contract of the same product', () => {
    const { result } = renderHook(() => usePortfolioState())
    act(() => {
      result.current.addPopulatedInstance('etf', generated('etf-first0001'))
    })
    act(() => {
      result.current.addPopulatedInstance('etf', generated('etf-secnd002'))
    })
    expect(
      result.current.workspace.baseline.assumptions.etf.map((i) => i.label),
    ).toEqual(['ETF-Depot', 'ETF-Depot #2'])
  })

  it('never rewrites a label the user typed', () => {
    const { result } = renderHook(() => usePortfolioState())
    act(() => {
      result.current.addPopulatedInstance('etf', generated('etf-first0001'))
    })
    act(() => {
      result.current.addPopulatedInstance('etf', {
        ...generated('etf-secnd002'),
        label: 'Weltdepot',
      })
    })
    expect(
      result.current.workspace.baseline.assumptions.etf.map((i) => i.label),
    ).toEqual(['ETF-Depot', 'Weltdepot'])
  })
})

describe('shared workspace store', () => {
  it('makes a commit from one mount visible to another, and persists it synchronously', () => {
    // Two mounts is the route change in miniature: `/vorsorge/neu` commits and
    // navigates, and the plan's own hook must see that commit rather than
    // re-reading (and re-writing) the pre-commit storage value.
    const plan = renderHook(() => usePortfolioState())
    const editor = renderHook(() => usePortfolioState())

    act(() => {
      editor.result.current.addPopulatedInstance('etf', etf('etf-new00001', 150))
    })

    expect(plan.result.current.workspace.baseline.assumptions.etf).toHaveLength(1)
    expect(plan.result.current.workspace).toBe(editor.result.current.workspace)
    // Persisted inside the setter — not in an effect the committing component
    // has to stay mounted for.
    editor.unmount()
    const saved = loadSavedWorkspace()
    expect(saved?.baseline.assumptions.etf).toHaveLength(1)
    expect(saved?.baseline.assumptions.etf[0].monthlyContribution).toBe(150)
  })
})

describe('updateInstance', () => {
  it('merges the patch and the status map, leaving other statuses alone', () => {
    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(populatedWorkspace()))
    act(() =>
      result.current.updateInstance(
        'etf',
        'etf-aaaa1111',
        { monthlyContribution: 350, inputStatus: undefined },
        { monthlyContribution: 'entered' },
      ),
    )
    act(() =>
      result.current.updateInstance('etf', 'etf-aaaa1111', {}, { currentValueEUR: 'unknown' }),
    )

    const instance = result.current.workspace.baseline.assumptions.etf[0]
    expect(instance.monthlyContribution).toBe(350)
    expect(instance.inputStatus).toEqual({
      monthlyContribution: 'entered',
      currentValueEUR: 'unknown',
    })
    // The neighbouring contract is untouched.
    expect(result.current.workspace.baseline.assumptions.etf[1].monthlyContribution).toBe(150)
  })

  it('is a no-op for an unknown id — including on a compare-mode workspace with no instances', () => {
    const { result } = renderHook(() => usePortfolioState())
    const before = result.current.workspace
    act(() => result.current.updateInstance('etf', 'etf-missing0', { monthlyContribution: 1 }))

    expect(result.current.workspace).toBe(before)
    expect(result.current.workspace.baseline.lastEditedAt).toBeUndefined()
    expect(result.current.lastUndo).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// remove + reference cleanup + undo
// ---------------------------------------------------------------------------

describe('removeInstance', () => {
  it('cleans transfer events on other contracts, pins and visibility in one transaction', () => {
    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(populatedWorkspace()))
    act(() => {
      result.current.removeInstance('etf', 'etf-aaaa1111')
    })

    const ws = result.current.workspace
    expect(ws.baseline.assumptions.etf.map((i) => i.instanceId)).toEqual(['etf-bbbb2222'])
    expect(ws.baseline.assumptions.etf[0].transferEvents).toEqual([])
    expect(ws.baseline.assumptions.visibleInstanceIds).toEqual(['etf-bbbb2222'])
    expect(ws.pinnedComparisonIds).toEqual([])
    expect(ws.baseline.lastEditedAt).toBeGreaterThan(1000)
  })

  it('marks a referencing what-if stale rather than deleting it', () => {
    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(populatedWorkspace()))
    act(() => {
      result.current.removeInstance('etf', 'etf-aaaa1111')
    })

    expect(result.current.workspace.whatIfs).toHaveLength(1)
    expect(result.current.workspace.whatIfs[0].frozenAt).toBeUndefined()
  })

  it('offers the undo handle to a hook mounted later, and drops it on the next plain write', () => {
    // The contract editor and the plan mount separate `usePortfolioState`
    // hooks, and removing a contract redirects from one to the other — so the
    // handle has to outlive the mount that produced it.
    const editor = renderHook(() => usePortfolioState())
    act(() => editor.result.current.replaceWorkspace(populatedWorkspace()))
    act(() => { editor.result.current.removeInstance('etf', 'etf-aaaa1111') })
    editor.unmount()

    const plan = renderHook(() => usePortfolioState())
    expect(plan.result.current.lastUndo?.label).toBe('Vertrag entfernt')
    act(() => { plan.result.current.undo(plan.result.current.lastUndo!) })
    expect(plan.result.current.lastUndo).toBeNull()
    expect(plan.result.current.workspace.baseline.assumptions.etf.map((i) => i.instanceId))
      .toEqual(['etf-aaaa1111', 'etf-bbbb2222'])

    // A mutation that records no handle of its own must not leave the old one
    // standing: undoing it would silently discard the newer edit.
    act(() => { plan.result.current.removeInstance('etf', 'etf-bbbb2222') })
    expect(plan.result.current.lastUndo).not.toBeNull()
    act(() => { plan.result.current.patchBaseline({ label: 'Neu' }) })
    expect(plan.result.current.lastUndo).toBeNull()
  })

  it('undo restores the whole workspace, references included', () => {
    const { result } = renderHook(() => usePortfolioState())
    const initial = populatedWorkspace()
    act(() => result.current.replaceWorkspace(initial))

    let undo: WorkspaceUndo | null = null
    act(() => {
      undo = result.current.removeInstance('etf', 'etf-aaaa1111')
    })
    act(() => result.current.undo(undo!))

    expect(result.current.workspace).toEqual(initial)
  })
})

// ---------------------------------------------------------------------------
// what-ifs
// ---------------------------------------------------------------------------

describe('removeWhatIf', () => {
  it('drops the alternative and its pin, and undo brings both back', () => {
    const { result } = renderHook(() => usePortfolioState())
    const initial = populatedWorkspace()
    initial.pinnedComparisonIds = [initial.whatIfs[0].id]
    act(() => result.current.replaceWorkspace(initial))

    let undo: WorkspaceUndo | null = null
    act(() => {
      undo = result.current.removeWhatIf(initial.whatIfs[0].id)
    })
    expect(result.current.workspace.whatIfs).toHaveLength(0)
    expect(result.current.workspace.pinnedComparisonIds).toEqual([])

    act(() => result.current.undo(undo!))
    expect(result.current.workspace).toEqual(initial)
  })
})

describe('applyWhatIf', () => {
  it('writes only the fields the what-if actually changed', () => {
    const ws = populatedWorkspace()
    const whatIf = contributionWhatIf(ws, 1, 400)
    ws.whatIfs = [whatIf]
    // The baseline moved on an unrelated field *before* the snapshot stamp, so
    // the alternative is current — and that unrelated value must survive.
    ws.baseline.assumptions.inflationRate = 0.03
    ws.baseline.lastEditedAt = 4000

    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(ws))

    let outcome: ReturnType<typeof result.current.applyWhatIf> | null = null
    act(() => {
      outcome = result.current.applyWhatIf(whatIf.id)
    })

    expect(outcome!.ok).toBe(true)
    const assumptions = result.current.workspace.baseline.assumptions
    expect(assumptions.etf[1].monthlyContribution).toBe(400)
    expect(assumptions.etf[0].monthlyContribution).toBe(200)
    expect(assumptions.inflationRate).toBe(0.03)
  })

  it('undo reverts an applied alternative', () => {
    const ws = populatedWorkspace()
    const whatIf = contributionWhatIf(ws, 1, 400)
    ws.whatIfs = [whatIf]
    ws.baseline.lastEditedAt = 4000

    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(ws))
    let outcome: ReturnType<typeof result.current.applyWhatIf> | null = null
    act(() => {
      outcome = result.current.applyWhatIf(whatIf.id)
    })
    act(() => {
      if (outcome!.ok) result.current.undo(outcome!.undo)
    })

    expect(result.current.workspace.baseline.assumptions.etf[1].monthlyContribution).toBe(150)
  })

  it('refuses an unknown id', () => {
    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(populatedWorkspace()))
    let outcome: ReturnType<typeof result.current.applyWhatIf> | null = null
    act(() => {
      outcome = result.current.applyWhatIf('whatif-nope')
    })
    expect(outcome).toEqual({ ok: false, reason: 'not-found' })
  })

  it('refuses a stale alternative — freezing is not an apply permission', () => {
    const ws = populatedWorkspace()
    const whatIf = { ...contributionWhatIf(ws, 1, 400), frozenAt: 9_999_999 }
    ws.whatIfs = [whatIf]
    ws.baseline.lastEditedAt = 9000

    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(ws))
    let outcome: ReturnType<typeof result.current.applyWhatIf> | null = null
    act(() => {
      outcome = result.current.applyWhatIf(whatIf.id)
    })

    expect(outcome).toEqual({ ok: false, reason: 'stale' })
    expect(result.current.workspace.baseline.assumptions.etf[1].monthlyContribution).toBe(150)
  })

  it('refuses when the contract sequence drifted', () => {
    const ws = populatedWorkspace()
    const whatIf = contributionWhatIf(ws, 1, 400)
    // A third contract lands in the baseline after the snapshot was taken. The
    // index-matched diff would now target the wrong contract.
    ws.baseline.assumptions.etf = [
      etf('etf-cccc3333', 50),
      ...ws.baseline.assumptions.etf,
    ]
    ws.whatIfs = [whatIf]
    ws.baseline.lastEditedAt = 4000

    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(ws))
    let outcome: ReturnType<typeof result.current.applyWhatIf> | null = null
    act(() => {
      outcome = result.current.applyWhatIf(whatIf.id)
    })

    expect(outcome).toEqual({ ok: false, reason: 'shape-drift' })
    expect(result.current.workspace.baseline.assumptions.etf[0].monthlyContribution).toBe(50)
  })
})

describe('tryRebaseWhatIf', () => {
  it('refuses shape drift, and the void wrapper is then a no-op', () => {
    const ws = populatedWorkspace()
    const whatIf = contributionWhatIf(ws, 1, 400)
    ws.baseline.assumptions.etf = [etf('etf-cccc3333', 50), ...ws.baseline.assumptions.etf]
    ws.whatIfs = [whatIf]

    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(ws))

    let outcome: ReturnType<typeof result.current.tryRebaseWhatIf> | null = null
    act(() => {
      outcome = result.current.tryRebaseWhatIf(whatIf.id)
    })
    expect(outcome).toEqual({ ok: false, reason: 'shape-drift' })

    const before = result.current.workspace
    act(() => result.current.rebaseWhatIf(whatIf.id))
    expect(result.current.workspace).toBe(before)
  })

  it('rebases against a moved baseline and clears staleness', () => {
    const ws = populatedWorkspace()
    const whatIf = contributionWhatIf(ws, 1, 400)
    ws.whatIfs = [whatIf]
    ws.baseline.assumptions.etf[0].monthlyContribution = 275
    ws.baseline.lastEditedAt = 9000

    const { result } = renderHook(() => usePortfolioState())
    act(() => result.current.replaceWorkspace(ws))
    act(() => {
      result.current.tryRebaseWhatIf(whatIf.id)
    })

    const rebased = result.current.workspace.whatIfs[0]
    // The user's own delta survives; the baseline's unrelated edit is picked up.
    expect(rebased.assumptions.etf[1].monthlyContribution).toBe(400)
    expect(rebased.assumptions.etf[0].monthlyContribution).toBe(275)
    expect(whatIfIsStale(rebased, result.current.workspace.baseline)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

describe('productArrayShapeMatches', () => {
  it('is true for identical instance sequences and false once one moves', () => {
    const ws = populatedWorkspace()
    const other = deepCloneScenario(ws.baseline)
    expect(productArrayShapeMatches(ws.baseline, other)).toBe(true)

    other.assumptions.etf = [other.assumptions.etf[1], other.assumptions.etf[0]]
    expect(productArrayShapeMatches(ws.baseline, other)).toBe(false)
  })

  it('ignores value changes — only identity and order matter', () => {
    const ws = populatedWorkspace()
    const other = deepCloneScenario(ws.baseline)
    other.assumptions.etf[0].monthlyContribution = 99_999
    expect(productArrayShapeMatches(ws.baseline, other)).toBe(true)
  })
})
