// @vitest-environment jsdom
/**
 * `/alternativen` flow tests (simplification Phase 3).
 *
 * The rule everything here pins, in one sentence: previewing and saving an
 * alternative never touch the plan, applying one changes exactly the field the
 * alternative changed, and one level of undo brings the whole workspace back.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { EtfInstance } from '../../domain/instances'
import type { Workspace } from '../../domain/workspace'
import { defaultWorkspace, loadSavedWorkspace, STORAGE_KEY_V2 } from '../../storage'
import { INVENTORY_PRODUCT_REGISTRY } from '../../features/inventory/inventoryProductRegistry'
import { deepCloneScenario, usePortfolioState } from '../../app/portfolioState'
import { useCombineSimulation } from '../../app/useCombineSimulation'
import { ALTERNATIVEN_COPY, useAlternativenFlow } from './useAlternativenFlow'

const A = 'etf-aaaa1111'
const B = 'etf-bbbb2222'

function etf(instanceId: string, monthlyContribution: number): EtfInstance {
  return {
    ...INVENTORY_PRODUCT_REGISTRY.etf.createDefault(2026, 1, () => instanceId),
    instanceId,
    label: `Depot ${instanceId.slice(-4)}`,
    monthlyContribution,
    currentValueEUR: 10_000,
  }
}

/**
 * A two-contract combine plan, seeded into storage so `usePortfolioState`
 * loads it the way production does.
 *
 * `lastEditedAt` is a fixed past stamp: a what-if forked from this baseline is
 * therefore "current" until something actually edits the baseline.
 */
function seedWorkspace(): Workspace {
  const ws = deepCloneScenario(defaultWorkspace)
  ws.mode = 'combine'
  ws.baseline.assumptions.etf = [etf(A, 200), etf(B, 150)]
  ws.baseline.lastEditedAt = 1000
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
  return ws
}

function useHarness() {
  const portfolioState = usePortfolioState()
  const baselineSimulation = useCombineSimulation(portfolioState.workspace)
  const flow = useAlternativenFlow({
    workspace: portfolioState.workspace,
    portfolioState,
    baselineSimulation,
    scenarioId: 'basis',
  })
  return { portfolioState, flow }
}

function renderFlow() {
  return renderHook(() => useHarness())
}

/** Same harness, but with the return scenario as a rendered prop. */
function useScenarioHarness(scenarioId: string) {
  const portfolioState = usePortfolioState()
  const baselineSimulation = useCombineSimulation(portfolioState.workspace)
  const flow = useAlternativenFlow({
    workspace: portfolioState.workspace,
    portfolioState,
    baselineSimulation,
    scenarioId,
  })
  return { portfolioState, flow }
}

/** Select contract A, ask for a lower contribution, and compute the preview. */
function draftAndPreview(
  result: { current: ReturnType<typeof useHarness> },
  instanceId = A,
  monthly = 400,
): void {
  act(() => result.current.flow.selectContract(instanceId))
  act(() => result.current.flow.setContribution(monthly))
  act(() => result.current.flow.runPreview())
}

beforeEach(() => {
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

describe('contracts', () => {
  it('does not seed an alternative from a retained unknown source contribution', () => {
    const ws = seedWorkspace()
    ws.baseline.assumptions.etf[0].inputStatus = { monthlyContribution: 'unknown' }
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))
    const { result } = renderFlow()

    act(() => result.current.flow.selectContract(A))
    expect(result.current.flow.contracts[0].contributionStatus).toBe('unknown')
    expect(result.current.flow.draft.newContribution).toBeNull()

    act(() => result.current.flow.setContribution(0))
    expect(result.current.flow.draft.newContribution).toBe(0)
    expect(result.current.portfolioState.workspace.baseline.assumptions.etf[0].monthlyContribution).toBe(200)
    expect(result.current.portfolioState.workspace.baseline.assumptions.etf[0].inputStatus?.monthlyContribution).toBe('unknown')
  })

  it('lists every countable contract with its own contribution field', () => {
    seedWorkspace()
    const { result } = renderFlow()

    expect(result.current.flow.contracts.map((c) => c.instanceId)).toEqual([A, B])
    const [first] = result.current.flow.contracts
    expect(first.productId).toBe('etf')
    expect(first.contributionMonthly).toBe(200)
    expect(first.contributionKind).toBe('savingsRate')
    // ETF has no beitragsfrei decision — there are no contributions to stop.
    expect(first.allowedDecisions).toEqual(['contribution'])
  })

  it('offers beitragsfrei for a contract that supports it', () => {
    const ws = deepCloneScenario(defaultWorkspace)
    ws.mode = 'combine'
    ws.baseline.assumptions.bav = [
      {
        ...INVENTORY_PRODUCT_REGISTRY.bav.createDefault(2026, 1, () => 'bav-cccc3333'),
        instanceId: 'bav-cccc3333',
        label: 'Betriebsrente',
        monthlyGrossConversion: 100,
        currentValueEUR: 8_000,
      },
    ]
    ws.baseline.lastEditedAt = 1000
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(ws))

    const { result } = renderFlow()
    const bav = result.current.flow.contracts.find((c) => c.productId === 'bav')
    expect(bav?.contributionKind).toBe('grossConversion')
    expect(bav?.allowedDecisions).toEqual(['contribution', 'paid_up'])
  })
})

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

describe('runPreview', () => {
  it('computes both sides and leaves the workspace untouched', () => {
    seedWorkspace()
    const { result } = renderFlow()
    const before = JSON.parse(JSON.stringify(result.current.portfolioState.workspace))

    draftAndPreview(result)

    const preview = result.current.flow.preview
    expect(preview).not.toBeNull()
    expect(result.current.flow.previewError).toBeNull()
    expect(preview!.description.instanceId).toBe(A)
    expect(preview!.description.decision).toBe('contribution')
    expect(preview!.description.afterContributionMonthly).toBe(400)
    // One money basis: both sides carry the baseline's deflator.
    expect(preview!.after.deflator).toBe(preview!.before.deflator)
    expect(preview!.delta).not.toBeNull()
    // More contribution must not lower the household result.
    expect(preview!.delta!).toBeGreaterThan(0)

    // The plan itself did not move.
    expect(result.current.portfolioState.workspace).toEqual(before)
    expect(result.current.portfolioState.workspace.whatIfs).toHaveLength(0)
  })

  it('reports a missing contract and a missing contribution in German', () => {
    seedWorkspace()
    const { result } = renderFlow()

    act(() => result.current.flow.runPreview())
    expect(result.current.flow.previewError).toBe(ALTERNATIVEN_COPY.noContract)

    act(() => result.current.flow.selectContract(A))
    act(() => result.current.flow.setContribution(null))
    act(() => result.current.flow.runPreview())
    expect(result.current.flow.previewError).toBe(ALTERNATIVEN_COPY.noContribution)
  })

  it('drops the preview on any draft change', () => {
    seedWorkspace()
    const { result } = renderFlow()
    draftAndPreview(result)
    expect(result.current.flow.preview).not.toBeNull()

    act(() => result.current.flow.setContribution(500))
    expect(result.current.flow.preview).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Save, reopen, staleness
// ---------------------------------------------------------------------------

describe('saveAlternative', () => {
  it('persists a what-if that survives the storage round trip', () => {
    seedWorkspace()
    const { result } = renderFlow()
    draftAndPreview(result)

    let id: string | null = null
    act(() => {
      id = result.current.flow.saveAlternative()
    })
    expect(id).not.toBeNull()

    // In-memory: one saved alternative, still marked current.
    expect(result.current.flow.saved).toHaveLength(1)
    expect(result.current.flow.saved[0].id).toBe(id)
    expect(result.current.flow.saved[0].status).toBe('current')
    expect(result.current.flow.saved[0].canApply).toBe(true)

    // On disk: the same alternative comes back through the real load path.
    const reloaded = loadSavedWorkspace()
    expect(reloaded?.whatIfs.map((w) => w.id)).toEqual([id])
    expect(reloaded?.baseline.assumptions.etf[0].monthlyContribution).toBe(200)
  })

  it('shows the frozen before/after when the alternative is reopened', () => {
    seedWorkspace()
    const { result } = renderFlow()
    draftAndPreview(result)
    const previewDelta =
      result.current.flow.preview!.after.netMonthlyTotalReal -
      result.current.flow.preview!.before.netMonthlyTotalReal

    let id = ''
    act(() => {
      id = result.current.flow.saveAlternative('Mehr sparen') ?? ''
    })
    act(() => result.current.flow.openSaved(id))

    expect(result.current.flow.openWhatIfId).toBe(id)
    const entry = result.current.flow.saved[0]
    expect(entry.label).toBe('Mehr sparen')
    expect(entry.before).not.toBeNull()
    expect(entry.after).not.toBeNull()
    // The frozen pair reproduces the preview it was saved from.
    expect(entry.after!.netMonthlyTotalReal - entry.before!.netMonthlyTotalReal).toBeCloseTo(
      previewDelta,
      6,
    )
    expect(entry.after!.deflator).toBe(entry.before!.deflator)
  })

  it('goes stale when the plan is edited after saving, and refuses to apply', () => {
    seedWorkspace()
    const { result } = renderFlow()
    draftAndPreview(result)
    let id = ''
    act(() => {
      id = result.current.flow.saveAlternative() ?? ''
    })

    const frozenBefore = result.current.flow.saved[0].before!.netMonthlyTotalReal

    act(() => {
      result.current.portfolioState.patchBaseline({
        profile: {
          ...result.current.portfolioState.workspace.baseline.profile,
          grossSalaryYear:
            result.current.portfolioState.workspace.baseline.profile.grossSalaryYear + 5_000,
        },
      })
    })

    const entry = result.current.flow.saved[0]
    expect(entry.status).toBe('stale')
    expect(entry.canApply).toBe(false)
    expect(entry.blockReason).toBe(ALTERNATIVEN_COPY.stale)
    // The saved comparison basis stays frozen — it does not follow the plan.
    expect(entry.before!.netMonthlyTotalReal).toBe(frozenBefore)

    let outcome: ReturnType<typeof result.current.flow.apply> | null = null
    act(() => {
      outcome = result.current.flow.apply(id)
    })
    expect(outcome).toEqual({ ok: false, reason: 'stale', message: ALTERNATIVEN_COPY.stale })
  })

  it('reports shape drift when a different contract is removed', () => {
    seedWorkspace()
    const { result } = renderFlow()
    draftAndPreview(result)
    act(() => {
      result.current.flow.saveAlternative()
    })

    act(() => {
      result.current.portfolioState.removeInstance('etf', B)
    })

    expect(result.current.flow.saved[0].status).toBe('shape-drift')
    expect(result.current.flow.saved[0].blockReason).toBe(ALTERNATIVEN_COPY.shapeDrift)
  })

  it('reports a missing source when the changed contract is removed', () => {
    seedWorkspace()
    const { result } = renderFlow()
    draftAndPreview(result)
    act(() => {
      result.current.flow.saveAlternative()
    })

    act(() => {
      result.current.portfolioState.removeInstance('etf', A)
    })

    expect(result.current.flow.saved[0].status).toBe('missing-source')
    expect(result.current.flow.saved[0].canApply).toBe(false)
  })
})

describe('frozen pair cache', () => {
  it('recomputes a saved alternative when the return scenario changes', () => {
    seedWorkspace()
    const { result, rerender } = renderHook(
      ({ scenarioId }: { scenarioId: string }) => useScenarioHarness(scenarioId),
      { initialProps: { scenarioId: 'basis' } },
    )
    act(() => result.current.flow.selectContract(A))
    act(() => result.current.flow.setContribution(400))
    act(() => result.current.flow.runPreview())
    act(() => {
      result.current.flow.saveAlternative()
    })

    const basis = result.current.flow.saved[0]
    expect(basis.after).not.toBeNull()

    // A lower-return scenario must produce a different pair. Keyed on the
    // what-if object alone, the cache handed back the 'basis' pair here.
    rerender({ scenarioId: 'konservativ' })
    const konservativ = result.current.flow.saved[0]
    expect(konservativ.after!.netMonthlyTotalNominal).not.toBe(
      basis.after!.netMonthlyTotalNominal,
    )
    expect(konservativ.before!.netMonthlyTotalNominal).not.toBe(
      basis.before!.netMonthlyTotalNominal,
    )

    // Switching back returns the original pair, so the cache still caches.
    rerender({ scenarioId: 'basis' })
    expect(result.current.flow.saved[0].after!.netMonthlyTotalNominal).toBe(
      basis.after!.netMonthlyTotalNominal,
    )
  })
})

// ---------------------------------------------------------------------------
// Apply, undo, remove
// ---------------------------------------------------------------------------

describe('apply and undo', () => {
  it('writes only the changed contribution and offers an undo', () => {
    seedWorkspace()
    const { result } = renderFlow()
    const original = JSON.parse(
      JSON.stringify(result.current.portfolioState.workspace),
    ) as Workspace
    draftAndPreview(result)
    let id = ''
    act(() => {
      id = result.current.flow.saveAlternative() ?? ''
    })

    act(() => {
      const outcome = result.current.flow.apply(id)
      expect(outcome.ok).toBe(true)
    })

    const applied = result.current.portfolioState.workspace.baseline.assumptions
    expect(applied.etf[0].monthlyContribution).toBe(400)
    // Everything else about both contracts is untouched.
    expect(applied.etf[1]).toEqual(original.baseline.assumptions.etf[1])
    expect({ ...applied.etf[0], monthlyContribution: 200 }).toEqual(
      original.baseline.assumptions.etf[0],
    )

    expect(result.current.flow.notification).toEqual({
      message: ALTERNATIVEN_COPY.applied,
      canUndo: true,
    })
  })

  it('restores the previous workspace deep-equal on undo', () => {
    seedWorkspace()
    const { result } = renderFlow()
    draftAndPreview(result)
    let id = ''
    act(() => {
      id = result.current.flow.saveAlternative() ?? ''
    })
    const beforeApply = JSON.parse(
      JSON.stringify(result.current.portfolioState.workspace),
    ) as Workspace

    act(() => {
      result.current.flow.apply(id)
    })
    act(() => {
      result.current.flow.undo()
    })

    expect(
      JSON.parse(JSON.stringify(result.current.portfolioState.workspace)) as Workspace,
    ).toEqual(beforeApply)
    expect(result.current.flow.notification).toEqual({
      message: ALTERNATIVEN_COPY.undone,
      canUndo: false,
    })
  })

  it('removes an alternative and brings it back with undo', () => {
    seedWorkspace()
    const { result } = renderFlow()
    draftAndPreview(result)
    let id = ''
    act(() => {
      id = result.current.flow.saveAlternative() ?? ''
    })
    const withWhatIf = JSON.parse(
      JSON.stringify(result.current.portfolioState.workspace),
    ) as Workspace

    act(() => {
      result.current.flow.remove(id)
    })
    expect(result.current.flow.saved).toHaveLength(0)
    expect(result.current.flow.notification).toEqual({
      message: ALTERNATIVEN_COPY.removed,
      canUndo: true,
    })

    act(() => {
      result.current.flow.undo()
    })
    expect(result.current.flow.saved.map((s) => s.id)).toEqual([id])
    expect(
      JSON.parse(JSON.stringify(result.current.portfolioState.workspace)) as Workspace,
    ).toEqual(withWhatIf)
  })
})
