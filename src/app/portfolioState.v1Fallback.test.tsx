// @vitest-environment jsdom
/**
 * Phantom-contract regression (browser finding: "ETF-Depot / #2 / #3" after a
 * single add).
 *
 * `migrateV1ToV2` synthesises one `${productId}-singleton` instance per
 * meaningful v1 product slot — and ETF / private Rentenversicherung are
 * synthesised unconditionally, because their contribution is derived from the
 * bAV net cost rather than stored. Those instances are a projection of the
 * *comparison*, not contracts the user entered.
 *
 * `hasStartedPlan` already refuses to count them, and `withoutPlanInstances`
 * hides them on the not-started plan surface — but both are display-side. The
 * live store still carried them, so the first real contract landed next to a
 * phantom, was numbered "#2", and the phantom was persisted to
 * STORAGE_KEY_V2 by that very mutation.
 *
 * Storage invariant pinned here (CONTEXT.md, "storage path bypassing
 * migrateAndValidateState" / dual-key coexistence): a compare-mode v1 envelope
 * may seed scenario-level assumptions, never contracts.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { EtfInstance } from '../domain/instances'
import { defaultProfile, defaultAssumptions } from '../data/defaultScenario'
import {
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  buildStateJson,
  buildWorkspaceJson,
  defaultWorkspace,
} from '../storage'
import { INVENTORY_PRODUCT_REGISTRY } from '../features/inventory/inventoryProductRegistry'
import { createFreshOnboardingScenario } from '../features/inventory/onboardingDraft'
import { deepCloneScenario, resetPortfolioStore, usePortfolioState } from './portfolioState'

/** What `/vergleich` leaves behind: a v1 compare envelope, contracts absent. */
function seedCompareV1(): void {
  localStorage.setItem(STORAGE_KEY_V1, buildStateJson(defaultProfile, defaultAssumptions))
}

/** What the onboarding wizard leaves behind: a combine workspace, no contracts. */
function seedOnboardedV2(): void {
  const ws = deepCloneScenario(defaultWorkspace)
  ws.mode = 'combine'
  ws.baseline = createFreshOnboardingScenario()
  localStorage.setItem(STORAGE_KEY_V2, buildWorkspaceJson(ws))
}

/** The contract the user types into `/vorsorge/neu?produkt=etf`: 10 000 € / 150 €. */
function enteredEtf(): EtfInstance {
  return {
    ...INVENTORY_PRODUCT_REGISTRY.etf.createDefault(2026, 1, () => 'etf-3g340wxt'),
    instanceId: 'etf-3g340wxt',
    label: 'ETF-Depot',
    currentValueEUR: 10_000,
    monthlyContribution: 150,
  }
}

beforeEach(() => {
  localStorage.clear()
  resetPortfolioStore()
})

describe('first contract added after a compare-mode visit', () => {
  it('v1 envelope only: the plan holds exactly the entered contract', () => {
    seedCompareV1()
    resetPortfolioStore()

    const { result } = renderHook(() => usePortfolioState())
    act(() => {
      result.current.addPopulatedInstance('etf', enteredEtf())
    })

    const etf = result.current.workspace.baseline.assumptions.etf
    expect(etf.map((i) => i.instanceId)).toEqual(['etf-3g340wxt'])
    expect(etf[0].label).toBe('ETF-Depot')
    expect(etf[0].currentValueEUR).toBe(10_000)
    // The private-Rentenversicherung slot is synthesised just as unconditionally.
    expect(result.current.workspace.baseline.assumptions.insurance).toEqual([])
  })

  it('v1 envelope plus an onboarded v2 workspace: v2 wins untouched', () => {
    seedOnboardedV2()
    seedCompareV1()
    resetPortfolioStore()

    const { result } = renderHook(() => usePortfolioState())
    expect(result.current.workspace.baseline.assumptions.etf).toEqual([])

    act(() => {
      result.current.addPopulatedInstance('etf', enteredEtf())
    })

    const etf = result.current.workspace.baseline.assumptions.etf
    expect(etf.map((i) => i.instanceId)).toEqual(['etf-3g340wxt'])
    expect(etf[0].label).toBe('ETF-Depot')
    expect(etf[0].currentValueEUR).toBe(10_000)
  })

  it('no `-singleton` contract ever reaches STORAGE_KEY_V2', () => {
    seedCompareV1()
    resetPortfolioStore()

    const { result } = renderHook(() => usePortfolioState())
    act(() => {
      result.current.addPopulatedInstance('etf', enteredEtf())
    })

    expect(localStorage.getItem(STORAGE_KEY_V2)).not.toContain('-singleton')
  })
})
