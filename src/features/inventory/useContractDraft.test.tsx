// @vitest-environment jsdom
/**
 * `useContractDraft` tests — the draft must survive re-renders of the plan and
 * must never let a "weiß ich nicht" collapse into a zero.
 */

import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Workspace } from '../../domain/workspace'
import { defaultWorkspace } from '../../storage'
import { deepCloneScenario } from '../../app/workspaceIdentity'
import { INVENTORY_PRODUCT_REGISTRY } from './inventoryProductRegistry'
import { draftFieldState, draftFieldValue } from './contractDraft'
import { useContractDraft } from './useContractDraft'

function workspace(): Workspace {
  const ws = deepCloneScenario(defaultWorkspace)
  ws.baseline.profile.age = 38
  return ws
}

function bavInstance() {
  return {
    ...INVENTORY_PRODUCT_REGISTRY.bav.createDefault(2026, 1, () => 'bav-test0001'),
    monthlyGrossConversion: 250,
    currentValueEUR: 4200,
  } as unknown as Record<string, unknown>
}

describe('useContractDraft', () => {
  it('seeds an existing contract as assumed with its values intact', () => {
    const { result } = renderHook(() =>
      useContractDraft({ productId: 'bav', instance: bavInstance(), workspace: workspace() }),
    )
    expect(draftFieldValue(result.current.draft, 'monthlyGrossConversion')).toBe(250)
    expect(draftFieldState(result.current.draft, 'currentValueEUR')).toBe('assumed')
    expect(result.current.dirty).toBe(false)
    expect(result.current.valid).toBe(true)
  })

  it('starts a new contract invalid until the core fields are answered', () => {
    const { result } = renderHook(() =>
      useContractDraft({ productId: 'etf', instance: null, workspace: workspace() }),
    )
    expect(result.current.valid).toBe(false)

    act(() => result.current.patchField('currentValueEUR', 0))
    act(() => result.current.patchField('monthlyContribution', 150))
    expect(result.current.valid).toBe(true)
    expect(result.current.dirty).toBe(true)
  })

  it('an unknown does not disturb a neighbour, and typing 0 clears it', () => {
    const { result } = renderHook(() =>
      useContractDraft({ productId: 'bav', instance: bavInstance(), workspace: workspace() }),
    )

    act(() => result.current.patchField('monthlyGrossConversion', 300))
    act(() => result.current.setFieldUnknown('currentValueEUR'))
    expect(draftFieldState(result.current.draft, 'currentValueEUR')).toBe('unknown')
    expect(draftFieldValue(result.current.draft, 'monthlyGrossConversion')).toBe(300)

    act(() => result.current.patchField('currentValueEUR', 0))
    expect(draftFieldState(result.current.draft, 'currentValueEUR')).toBe('entered')
    expect(draftFieldValue(result.current.draft, 'currentValueEUR')).toBe(0)
    expect(draftFieldValue(result.current.draft, 'monthlyGrossConversion')).toBe(300)
  })

  it('keeps the draft across a workspace re-render of the same contract', () => {
    const instance = bavInstance()
    const { result, rerender } = renderHook(
      ({ ws }: { ws: Workspace }) =>
        useContractDraft({ productId: 'bav', instance, workspace: ws }),
      { initialProps: { ws: workspace() } },
    )

    act(() => result.current.patchField('monthlyGrossConversion', 999))
    rerender({ ws: workspace() })
    expect(draftFieldValue(result.current.draft, 'monthlyGrossConversion')).toBe(999)
  })

  it('re-seeds when the edited contract changes', () => {
    const first = bavInstance()
    const second = { ...bavInstance(), instanceId: 'bav-test0002', monthlyGrossConversion: 80 }
    const { result, rerender } = renderHook(
      ({ inst }: { inst: Record<string, unknown> }) =>
        useContractDraft({ productId: 'bav', instance: inst, workspace: workspace() }),
      { initialProps: { inst: first } },
    )

    act(() => result.current.patchField('monthlyGrossConversion', 999))
    rerender({ inst: second })
    expect(draftFieldValue(result.current.draft, 'monthlyGrossConversion')).toBe(80)
    expect(result.current.dirty).toBe(false)
  })

  it('reset discards every edit', () => {
    const { result } = renderHook(() =>
      useContractDraft({ productId: 'bav', instance: bavInstance(), workspace: workspace() }),
    )
    act(() => result.current.patchField('monthlyGrossConversion', 999))
    act(() => result.current.reset())
    expect(draftFieldValue(result.current.draft, 'monthlyGrossConversion')).toBe(250)
    expect(result.current.dirty).toBe(false)
  })

  it('exposes only the currently visible fields', () => {
    const { result } = renderHook(() =>
      useContractDraft({
        productId: 'bav',
        instance: { ...bavInstance(), payoutMode: 'kapitalverzehr' },
        workspace: workspace(),
      }),
    )
    expect(result.current.visibleSpecs.map((s) => s.id)).not.toContain('zeitrenteYears')
    expect(result.current.specs.map((s) => s.id)).toContain('zeitrenteYears')
  })

  it('toPatch reports unknown without writing a value', () => {
    const { result } = renderHook(() =>
      useContractDraft({ productId: 'bav', instance: bavInstance(), workspace: workspace() }),
    )
    act(() => result.current.setFieldUnknown('currentValueEUR'))
    const { patch, inputStatus } = result.current.toPatch()
    expect(patch.currentValueEUR).toBeUndefined()
    expect(inputStatus.currentValueEUR).toBe('unknown')
  })
})
