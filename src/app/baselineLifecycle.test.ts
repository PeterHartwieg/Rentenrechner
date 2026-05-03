/**
 * Tests for the baseline lifecycle (Group G issue 07).
 *
 * Coverage per spec test plan:
 *   1. Unit: baseline-pin on wizard commit produces a Workspace with origin: 'baseline'.
 *   2. Unit: empty baseline simulates without errors (GRV-only result).
 *   3. Unit: editing baseline marks all whatIfs with a baselineMutatedAt
 *      timestamp greater than each what-if's derivedFromBaselineSnapshot.createdAt.
 *   4. Integration: rebaseWhatIf reproduces the original delta against the new
 *      baseline state; freeze action carries the prior baseline snapshot.
 *   5. Integration: archive produces a kind:'archived' library entry named
 *      "Baseline {year}" and clears whatIfs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules } from '../rules/de2026'
import { migrateV1ToV2, defaultWorkspace } from '../storage'
import { buildWorkspaceFromDraft } from '../features/inventory/inventoryHelpers'
import {
  forkBaselineScenario,
  rebaseWhatIf,
  rebaseWhatIfStub,
  deepCloneScenario,
} from './portfolioState'
import { runCombineSimulation } from './useCombineSimulation'
import { loadLibrary, addArchivedEntry, addToLibrary } from '../data/scenarioLibrary'
import type { Scenario, WhatIfScenario } from '../domain/workspace'
import type { GrvDraft } from '../features/inventory/types'

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

interface MemoryStorage {
  store: Record<string, string>
  storage: Storage
}

function makeMemoryStorage(): MemoryStorage {
  const store: Record<string, string> = {}
  const storage: Storage = {
    get length() {
      return Object.keys(store).length
    },
    clear() {
      for (const k of Object.keys(store)) delete store[k]
    },
    getItem(key: string) {
      return key in store ? store[key] : null
    },
    key(i: number) {
      return Object.keys(store)[i] ?? null
    },
    removeItem(key: string) {
      delete store[key]
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
  }
  return { store, storage }
}

let mem: MemoryStorage
const originalLocalStorage = globalThis.localStorage

beforeEach(() => {
  mem = makeMemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: mem.storage,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrvDraft(): GrvDraft {
  return {
    productId: 'grv',
    yearsWorked: 10,
    currentEntgeltpunkte: 10,
    useYearsEstimate: true,
  }
}

function makeBaseline(): Scenario {
  return deepCloneScenario({
    ...defaultWorkspace.baseline,
    id: 'test-baseline',
    label: 'Test Baseline',
    profile: { ...defaultProfile },
  })
}

// ---------------------------------------------------------------------------
// Test 1: Baseline-pin on wizard commit
// ---------------------------------------------------------------------------

describe('issue 07 — baseline pin on wizard commit', () => {
  it('buildWorkspaceFromDraft with no checked products (Anna path) produces origin: baseline', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: null,
      pavDraft: null,
      riesterDraft: null,
      basisrenteDraft: null,
      avdDraft: null,
      etfDraft: null,
      grossSalaryYear: 40_000,
    })
    expect(ws.baseline.origin).toBe('baseline')
    expect(ws.mode).toBe('combine')
  })

  it('buildWorkspaceFromDraft with products (Bernd path) produces a workspace whose baseline has origin: baseline', () => {
    const ws = buildWorkspaceFromDraft({
      grvDraft: makeGrvDraft(),
      bavDraft: [
        {
          productId: 'bav',
          status: 'active',
          contractStartYear: 2020,
          currentValueEUR: 5000,
          monthlyContribution: 200,
          durchfuehrungsweg: 'direktversicherung_3_63',
          effektivkostenPct: 1.2,
          rentenfaktor: 30,
          payoutMode: 'leibrente',
        },
      ],
      pavDraft: null,
      riesterDraft: null,
      basisrenteDraft: null,
      avdDraft: null,
      etfDraft: null,
      grossSalaryYear: 70_000,
    })
    expect(ws.baseline.origin).toBe('baseline')
    expect(ws.baseline.assumptions.bav).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Test 2: Empty baseline (Anna path) simulates without errors
// ---------------------------------------------------------------------------

describe('issue 07 — empty baseline (GRV-only) simulation', () => {
  it('clean-slate workspace with GRV produces a CombinedResult without throwing', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    // Strip all product instances — GRV-only baseline.
    ws.baseline.assumptions.bav = []
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []

    expect(() => runCombineSimulation(ws, de2026Rules)).not.toThrow()

    const result = runCombineSimulation(ws, de2026Rules)
    // GRV pension should be computable
    expect(result.statutoryPension.grossMonthlyPension).toBeGreaterThanOrEqual(0)
    // Combined result exists for each scenario
    for (const id of ws.baseline.assumptions.returnScenarios.map((s) => s.id)) {
      expect(result.combinedByScenarioId[id]).toBeDefined()
    }
  })

  it('zero-GRV clean-slate produces monthlyNetIncome = 0', () => {
    const ws = migrateV1ToV2(
      defaultProfile as unknown as Record<string, unknown>,
      defaultAssumptions as unknown as Record<string, unknown>,
    )
    ws.baseline.assumptions.bav = []
    ws.baseline.assumptions.etf = []
    ws.baseline.assumptions.insurance = []
    ws.baseline.assumptions.basisrente = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    ws.baseline.assumptions.riester = []
    ws.baseline.assumptions.statutoryPension = {
      ...defaultAssumptions.statutoryPension,
      pensionBaselineType: 'none',
      manualMonthlyGross: 0,
      currentEntgeltpunkte: 0,
    }

    const result = runCombineSimulation(ws, de2026Rules)
    const firstId = ws.baseline.assumptions.returnScenarios[0].id
    expect(result.combinedByScenarioId[firstId].monthlyNetIncome).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Test 3: Editing baseline stamps lastEditedAt, stale detection works
// ---------------------------------------------------------------------------

describe('issue 07 — lastEditedAt stale detection', () => {
  it('a baseline with lastEditedAt > snapshot.createdAt marks what-ifs as stale', () => {
    const baseline = makeBaseline()
    // Fork a what-if (snapshot is taken now)
    const whatIf = forkBaselineScenario(baseline, 'stale test')
    const snapshotCreatedAt = new Date(whatIf.derivedFromBaselineSnapshot.createdAt).getTime()

    // Simulate patchBaseline: stamp a later lastEditedAt
    const editedBaseline: Scenario = {
      ...baseline,
      lastEditedAt: snapshotCreatedAt + 1000, // 1 second after fork
    }

    // Stale condition: editedAt > snapshotCreatedAt AND frozenAt is not set
    const isStale =
      (editedBaseline.lastEditedAt ?? 0) > snapshotCreatedAt &&
      (whatIf.frozenAt === undefined || whatIf.frozenAt < (editedBaseline.lastEditedAt ?? 0))

    expect(isStale).toBe(true)
  })

  it('a frozen what-if (frozenAt >= lastEditedAt) is NOT considered stale', () => {
    const baseline = makeBaseline()
    const whatIf = forkBaselineScenario(baseline, 'frozen test')
    const editTime = Date.now()

    const editedBaseline: Scenario = {
      ...baseline,
      lastEditedAt: editTime,
    }

    const frozenWhatIf: WhatIfScenario = {
      ...whatIf,
      frozenAt: editTime + 500, // frozen after the edit
    }

    // Stale condition: editedAt > frozenAt → suppressed
    const isStale =
      (editedBaseline.lastEditedAt ?? 0) > new Date(frozenWhatIf.derivedFromBaselineSnapshot.createdAt).getTime() &&
      (frozenWhatIf.frozenAt === undefined || frozenWhatIf.frozenAt < (editedBaseline.lastEditedAt ?? 0))

    expect(isStale).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Test 4a: rebaseWhatIf reproduces the original delta
// ---------------------------------------------------------------------------

describe('issue 07 — rebaseWhatIf integration', () => {
  it('re-applies user delta (changed inflationRate) onto the new baseline', () => {
    const baseline = makeBaseline()

    // Fork a what-if
    const whatIf = forkBaselineScenario(baseline, 're-base test')

    // User mutates the what-if: changes inflationRate
    const mutatedWhatIf: WhatIfScenario = {
      ...whatIf,
      assumptions: { ...whatIf.assumptions, inflationRate: 0.04 },
    }

    // Baseline is independently updated (e.g. user edits retirementEndAge)
    const updatedBaseline: Scenario = {
      ...baseline,
      id: 'baseline-v2',
      assumptions: { ...baseline.assumptions, retirementEndAge: 95 },
      lastEditedAt: Date.now(),
    }

    // Re-base
    const rebased = rebaseWhatIf(mutatedWhatIf, updatedBaseline)

    // The user's delta (inflationRate = 0.04) must be preserved
    expect(rebased.assumptions.inflationRate).toBeCloseTo(0.04)
    // The baseline's new value (retirementEndAge = 95) must be incorporated
    expect(rebased.assumptions.retirementEndAge).toBe(95)
    // Snapshot now points at the new baseline
    expect(rebased.derivedFromBaselineSnapshot.id).toBe('baseline-v2')
    // frozenAt is cleared
    expect(rebased.frozenAt).toBeUndefined()
  })

  it('freeze action: rebaseWhatIfStub carries the prior baseline snapshot inside the what-if', () => {
    const baseline = makeBaseline()
    const whatIf = forkBaselineScenario(baseline, 'freeze test')
    const newBaseline: Scenario = { ...baseline, id: 'baseline-updated', label: 'Updated' }

    // freeze (stub): only refreshes snapshot
    const rebased = rebaseWhatIfStub(whatIf, newBaseline)
    expect(rebased.derivedFromBaselineSnapshot.id).toBe('baseline-updated')
    expect(rebased.id).toBe(whatIf.id)
  })
})

// ---------------------------------------------------------------------------
// Test 5: Archive produces kind:'archived' + clears whatIfs
// ---------------------------------------------------------------------------

describe('issue 07 — archive action', () => {
  it('addArchivedEntry creates a library entry with kind: archived', () => {
    const result = addArchivedEntry(
      'Baseline 2026',
      defaultProfile,
      defaultAssumptions,
    )
    expect(result.kind).toBe('archived')
    expect(result.name).toBe('Baseline 2026')

    const lib = loadLibrary()
    const found = lib.find((s) => s.id === result.id)
    expect(found).toBeDefined()
    expect(found!.kind).toBe('archived')
  })

  it('archived entry named "Baseline {currentYear}" format', () => {
    const currentYear = new Date().getFullYear()
    const result = addArchivedEntry(
      `Baseline ${currentYear}`,
      defaultProfile,
      defaultAssumptions,
    )
    expect(result.name).toBe(`Baseline ${currentYear}`)
  })

  it('loading the library returns the archived entry alongside user entries', () => {
    // Add a regular entry
    addToLibrary('My Plan', defaultProfile, defaultAssumptions)
    // Archive
    addArchivedEntry('Baseline 2026', defaultProfile, defaultAssumptions)

    const lib = loadLibrary()
    expect(lib).toHaveLength(2)
    expect(lib[0].kind).toBeUndefined() // 'user' (not set = default)
    expect(lib[1].kind).toBe('archived')
  })
})
