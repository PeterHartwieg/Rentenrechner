// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { BavInstance } from '../domain/instances'
import type { BavDraft } from '../features/inventory/types'
import { INVENTORY_PRODUCT_REGISTRY } from '../features/inventory/inventoryProductRegistry'
import { buildWorkspaceFromDraft } from '../features/inventory/inventoryHelpers'
import {
  draftFromInstance,
  draftToInstancePatch,
  draftToNewInstance,
  newDraft,
  patchDraftField,
} from '../features/inventory/contractDraft'
import { resetPortfolioStore, usePortfolioState } from './portfolioState'

const offeredDraft: BavDraft = {
  productId: 'bav', status: 'offered', contractStartYear: 2026,
  currentValueEUR: 0, monthlyContribution: 200,
  durchfuehrungsweg: 'direktversicherung_3_63', effektivkostenPct: 0.8,
  rentenfaktor: 30, payoutMode: 'leibrente',
}
const makeId = () => 'bav-offer001'
const rawOffer = (): BavInstance => ({
  ...INVENTORY_PRODUCT_REGISTRY.bav.createDefault(2026, 1, makeId),
  status: 'offered', monthlyGrossConversion: 200,
})

beforeEach(() => {
  localStorage.clear()
  resetPortfolioStore()
})

describe('offered bAV write invariant (issue 349)', () => {
  const routes = {
    registry: () => INVENTORY_PRODUCT_REGISTRY.bav.draftToInstance(offeredDraft, makeId),
    onboarding: () => buildWorkspaceFromDraft({
      grvDraft: { productId: 'grv', yearsWorked: 10, currentEntgeltpunkte: 12, useYearsEstimate: false },
      bavDraft: offeredDraft, pavDraft: null, riesterDraft: null,
      basisrenteDraft: null, avdDraft: null, etfDraft: null, grossSalaryYear: 60_000,
    }).baseline.assumptions.bav[0],
    newContract: () => {
      let draft = patchDraftField(newDraft('bav'), 'status', 'offered')
      draft = patchDraftField(draft, 'monthlyGrossConversion', 200)
      return draftToNewInstance(draft, makeId) as unknown as BavInstance
    },
    draftPatch: () => {
      const base = rawOffer()
      return { ...base, ...draftToInstancePatch(draftFromInstance('bav', base)).patch }
    },
  }

  it.each(Object.entries(routes))('%s creates at zero and activation keeps zero', (_, create) => {
    const instance = create()
    expect(instance).toMatchObject({ status: 'offered', monthlyGrossConversion: 0 })
    const { result } = renderHook(() => usePortfolioState())
    act(() => { expect(result.current.addPopulatedInstance('bav', instance)).not.toBeNull() })
    act(() => { expect(result.current.updateInstance('bav', instance.instanceId, { status: 'active' })).toBe(true) })
    expect(result.current.workspace.baseline.assumptions.bav.find(i => i.instanceId === instance.instanceId))
      .toMatchObject({ status: 'active', monthlyGrossConversion: 0 })
  })

  it('addPopulatedInstance normalises a raw offer without mutating the caller', () => {
    const instance = rawOffer()
    const { result } = renderHook(() => usePortfolioState())
    act(() => { expect(result.current.addPopulatedInstance('bav', instance)).not.toBeNull() })
    expect(result.current.workspace.baseline.assumptions.bav[0].monthlyGrossConversion).toBe(0)
    expect(instance.monthlyGrossConversion).toBe(200)
    act(() => { result.current.updateInstance('bav', instance.instanceId, { status: 'active' }) })
    expect(result.current.workspace.baseline.assumptions.bav[0].monthlyGrossConversion).toBe(0)
  })

  it('updates cannot write conversion on an offer, with or without a status patch', () => {
    const { result } = renderHook(() => usePortfolioState())
    act(() => { result.current.addPopulatedInstance('bav', { ...rawOffer(), status: 'active' }) })
    for (const patch of [
      { status: 'offered' as const, monthlyGrossConversion: 200 },
      { monthlyGrossConversion: 200 },
      { status: 'offered' as const, monthlyGrossConversion: 200 },
    ]) {
      act(() => { expect(result.current.updateInstance('bav', makeId(), patch)).toBe(true) })
      expect(result.current.workspace.baseline.assumptions.bav[0].monthlyGrossConversion).toBe(0)
    }
  })
})
