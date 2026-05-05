// @vitest-environment jsdom

/**
 * Phase 4 — Inert at the app boundary (issue 10).
 *
 * Mirrors the "renders identically" pattern from `inert.test.tsx` but at the
 * calculator's external seams. For each representative seam, the test runs
 * the operation twice — once outside any provider, once inside a
 * `QaFeedbackProvider` mounted in QA-off mode — and asserts byte-for-byte
 * identical output. If a future change leaks QA artifacts into CSV / PDF /
 * share URLs / localStorage migrations / scenario-library payloads, one of
 * these comparisons fails.
 *
 * Seams covered:
 *   1. CSV export (`buildExportCsv`) — pure function; the provider mount
 *      doesn't reach it, but the test asserts that even with the provider
 *      mounted in the same React tree the CSV output is identical and
 *      contains no `data-qa-*` substring.
 *   2. PrintReport snapshot — full DOM render; rendered inside vs. outside
 *      the provider. Same `innerHTML`, same DOM structure, no QA leaks.
 *   3. Share-link round-trip (`buildShareUrl` + `readUrlState` / `parseStateFromJson`).
 *   4. localStorage migrations (`migrateAndValidateState`, `parseStateFromJson`).
 *   5. Scenario-library load (`loadLibrary`).
 *
 * The provider in QA-off mode (no `?qa=1`, sessionStorage clean) is required
 * by the contract: every Phase 4 sibling test runs the same way and the
 * disclaimer / engine / storage migration / CSV / PDF code is intentionally
 * not modified.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { QaFeedbackProvider } from '../QaFeedbackProvider'
import { PrintReport } from '../../results/PrintReport'
import { buildExportCsv } from '../../../utils/csvExport'
import {
  buildStateJson,
  parseStateFromJson,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  migrateAndValidateState,
} from '../../../storage'
import { LIBRARY_KEY, loadLibrary, addToLibrary } from '../../../data/scenarioLibrary'
import { defaultProfile, defaultAssumptions } from '../../../data/defaultScenario'
import { de2026Rules } from '../../../rules/de2026'
import type { ProductResult, SimulationResult } from '../../../domain'

// ---------------------------------------------------------------------------
// Test lifecycle — make sure no QA flag bleeds between tests.
// ---------------------------------------------------------------------------

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.documentElement.removeAttribute('data-qa-mode')
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.documentElement.removeAttribute('data-qa-mode')
})

// ---------------------------------------------------------------------------
// Fixtures shared across the boundary tests.
// ---------------------------------------------------------------------------

const FIXTURE_PRODUCT: ProductResult = {
  productId: 'etf',
  label: 'ETF',
  scenarioId: 'basis',
  scenarioLabel: 'Basis',
  annualReturn: 0.06,
  monthlyUserCost: 200,
  monthlyProductContribution: 200,
  monthlyEmployerContribution: 0,
  totalUserCost: 48000,
  totalProductContributions: 48000,
  totalEmployerContributions: 0,
  totalFees: 1000,
  capitalAtRetirement: 120000,
  realCapitalAtRetirement: 90000,
  afterTaxLumpSum: 110000,
  grossMonthlyPayout: 500,
  netMonthlyPayout: 450,
  taxAndSvSavings: 0,
  valueMultipleOnUserCost: 2.5,
  capitalMultipleAnnualized: 1.05,
  accumulationRiy: 0.008,
  inputConfidence: 'model_estimate',
  rows: [],
  etfPayoutRows: [],
} as unknown as ProductResult

const CSV_OPTS = {
  products: [FIXTURE_PRODUCT],
  bavAnnualTaxSvSavings: 0,
  bavProfile: defaultProfile,
  bavKvdrMember: true,
  bavOtherAnnualIncome: 0,
  insuranceTaxMode: 'halbeinkuenfte' as const,
  equityPartialExemption: 0.3,
  insuranceOtherAnnualIncome: 0,
  rules: de2026Rules,
  inflationRate: 0.02,
}

function makeSimulation(): SimulationResult {
  return {
    products: [FIXTURE_PRODUCT],
    bavFunding: {
      monthlyNetCost: 0,
      monthlyGrossConversion: 0,
      monthlyEmployerContribution: 0,
      annualTaxSaving: 0,
      annualSvSaving: 0,
      annualTaxSvSavings: 0,
      annualSavings: 0,
      effectiveMonthlyEmployerContribution: 0,
      effectiveLimit3Nr63: 0,
      effectiveLimitSvEV: 0,
      monthly3Nr63Contribution: 0,
      monthlySvContribution: 0,
      monthlyExcessContribution: 0,
      cappedAt3Nr63: false,
      cappedAtSvEV: false,
      iterations: 0,
    } as unknown as SimulationResult['bavFunding'],
    statutoryPension: {
      grossMonthlyPension: 1000,
      netMonthlyPension: 900,
      projectedEntgeltpunkte: 35,
    } as unknown as SimulationResult['statutoryPension'],
    basisrenteFunding: { monthlyGrossContribution: 0 } as unknown as SimulationResult['basisrenteFunding'],
    altersvorsorgedepotFunding: { monthlyOwnContribution: 0 } as unknown as SimulationResult['altersvorsorgedepotFunding'],
    riesterFunding: { monthlyOwnContribution: 0 } as unknown as SimulationResult['riesterFunding'],
  }
}

// Quick assertion helpers — no QA-related substring should appear in any
// app-boundary output that wasn't there before.
function expectNoQaArtifacts(text: string) {
  expect(text).not.toContain('data-qa-target')
  expect(text).not.toContain('data-qa-precision')
  expect(text).not.toContain('data-qa-section')
  expect(text).not.toContain('data-qa-sensitive')
  expect(text).not.toContain('data-qa-overlay')
  expect(text).not.toContain('qa-feedback')
  expect(text).not.toContain('qa-indicator')
  expect(text).not.toContain('QA-Modus')
}

// ---------------------------------------------------------------------------
// Seam 1: CSV export
// ---------------------------------------------------------------------------

describe('Inert at app boundary — buildExportCsv', () => {
  it('produces identical CSV with vs. without the provider mounted alongside', () => {
    // Bare run.
    const bare = buildExportCsv(CSV_OPTS)

    // Wrapped run — render the provider into the same DOM (QA-off mode), then
    // call the CSV builder. The CSV is a pure function; mounting the provider
    // must not perturb its output, and no QA attributes may have leaked into
    // the CSV string itself.
    render(
      <QaFeedbackProvider>
        <div />
      </QaFeedbackProvider>,
    )
    const wrapped = buildExportCsv(CSV_OPTS)

    expect(wrapped).toBe(bare)
    expectNoQaArtifacts(wrapped)
    // Disclaimer banner stays first — guard against any future ordering shift.
    expect(wrapped.split('\n')[0]).toBe('Hinweis')
  })
})

// ---------------------------------------------------------------------------
// Seam 2: PrintReport snapshot
// ---------------------------------------------------------------------------

describe('Inert at app boundary — PrintReport', () => {
  it('renders identical innerHTML with vs. without the provider wrapping it', () => {
    const props = {
      profile: defaultProfile,
      assumptions: defaultAssumptions,
      simulation: makeSimulation(),
    }

    const { container: bare } = render(<PrintReport {...props} />)
    const bareHtml = bare.innerHTML
    cleanup()

    const { container: wrapped } = render(
      <QaFeedbackProvider>
        <PrintReport {...props} />
      </QaFeedbackProvider>,
    )
    const wrappedHtml = wrapped.innerHTML

    expect(wrappedHtml).toBe(bareHtml)
    expectNoQaArtifacts(wrappedHtml)
    // The disclaimer is the FIRST child of #print-report (publication-blocking
    // compliance). Re-assert at this seam too — it's the cheapest cross-check.
    const printRoot = wrapped.querySelector('#print-report')
    expect(printRoot?.firstElementChild?.classList.contains('pr-disclaimer-top')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Seam 3: Share-link round-trip (urlShare / parseStateFromJson)
// ---------------------------------------------------------------------------

describe('Inert at app boundary — share-link round-trip', () => {
  it('buildStateJson + parseStateFromJson yield identical state with vs. without provider', () => {
    const bareJson = buildStateJson(defaultProfile, defaultAssumptions)
    const bareParsed = parseStateFromJson(bareJson)

    render(
      <QaFeedbackProvider>
        <div />
      </QaFeedbackProvider>,
    )

    const wrappedJson = buildStateJson(defaultProfile, defaultAssumptions)
    const wrappedParsed = parseStateFromJson(wrappedJson)

    expect(wrappedJson).toBe(bareJson)
    expectNoQaArtifacts(wrappedJson)
    expect(JSON.stringify(wrappedParsed)).toBe(JSON.stringify(bareParsed))
    // No QA-flag query params should ever survive into the share JSON.
    expect(wrappedJson).not.toContain('?qa=')
    expect(wrappedJson).not.toContain('"qa"')
  })

  it('share-URL state survives a round-trip identically with the provider mounted', () => {
    // Activate QA mode mid-flight and confirm the share-state JSON it writes
    // doesn't pick up any QA-mode markers. The provider may be enabled in the
    // session, but the calculator's state serialiser must not learn about it.
    window.history.replaceState(null, '', '/?qa=1')
    render(
      <QaFeedbackProvider>
        <div />
      </QaFeedbackProvider>,
    )
    const json = buildStateJson(defaultProfile, defaultAssumptions)
    expectNoQaArtifacts(json)
    const parsed = parseStateFromJson(json)
    expect(parsed).not.toBeNull()
    // Round-trip equality — re-stringify and compare keys to original.
    const reJson = buildStateJson(parsed!.profile, parsed!.assumptions)
    expect(reJson).toBe(json)
  })
})

// ---------------------------------------------------------------------------
// Seam 4: localStorage migrations / parseStateFromJson
// ---------------------------------------------------------------------------

describe('Inert at app boundary — storage migrations', () => {
  it('migrateAndValidateState yields identical output with vs. without provider', () => {
    // Use the v1-shaped raw input that the migrator handles.
    const rawProfile = JSON.parse(JSON.stringify(defaultProfile))
    const rawAssumptions = JSON.parse(JSON.stringify(defaultAssumptions))

    const bare = migrateAndValidateState(rawProfile, rawAssumptions)
    expect(bare).not.toBeNull()

    render(
      <QaFeedbackProvider>
        <div />
      </QaFeedbackProvider>,
    )
    const wrapped = migrateAndValidateState(rawProfile, rawAssumptions)
    expect(wrapped).not.toBeNull()

    expect(JSON.stringify(wrapped)).toBe(JSON.stringify(bare))
  })

  it('mounting the provider does not write the QA-mode flag to localStorage', () => {
    // Sanity at the migration boundary: even when the provider mounts and
    // children call buildStateJson / parseStateFromJson, the migration code
    // path must never see a `qa-feedback-mode` key in localStorage.
    window.history.replaceState(null, '', '/?qa=1')
    render(
      <QaFeedbackProvider>
        <div />
      </QaFeedbackProvider>,
    )
    // The provider writes its session flag to sessionStorage, never localStorage.
    expect(localStorage.getItem('qa-feedback-mode')).toBeNull()
    // No QA key, no incidental write either — localStorage stays empty here.
    expect(localStorage.length).toBe(0)
    // sessionStorage is the QA flag's home; it is OK for that to carry the flag.
    expect(sessionStorage.getItem('qa-feedback-mode')).toBe('1')
  })

  it('parseStateFromJson returns identical results when the v2 storage key is populated and the provider is mounted', () => {
    // Seed a realistic v2 payload as the loader would see it on reload.
    const v2Json = JSON.stringify({
      schemaVersion: 2,
      mode: 'compare',
      baseline: {
        id: 'baseline-default',
        label: 'Mein Plan',
        profile: defaultProfile,
        assumptions: {
          bav: [],
          etf: [],
          insurance: [],
          basisrente: [],
          altersvorsorgedepot: [],
          riester: [],
          statutoryPension: defaultAssumptions.statutoryPension,
          inflationRate: defaultAssumptions.inflationRate,
          retirementEndAge: defaultAssumptions.retirementEndAge,
          returnScenarios: defaultAssumptions.returnScenarios,
          monteCarlo: defaultAssumptions.monteCarlo,
          visibleProducts: defaultAssumptions.visibleProducts,
          compareSubMode: 'equal_cash',
          equalInputAmountEUR: 200,
        },
        createdAt: new Date(0).toISOString(),
        origin: 'baseline',
      },
      whatIfs: [],
      pinnedComparisonIds: [],
    })

    const bare = parseStateFromJson(v2Json)
    expect(bare).not.toBeNull()

    localStorage.setItem(STORAGE_KEY_V2, v2Json)
    render(
      <QaFeedbackProvider>
        <div />
      </QaFeedbackProvider>,
    )
    const wrapped = parseStateFromJson(v2Json)
    expect(JSON.stringify(wrapped)).toBe(JSON.stringify(bare))
    // The known storage keys (V1, V2) are never read by anything in the
    // provider — assert their values match what we put in.
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBe(v2Json)
  })
})

// ---------------------------------------------------------------------------
// Seam 5: Scenario-library load
// ---------------------------------------------------------------------------

describe('Inert at app boundary — scenarioLibrary', () => {
  it('loadLibrary returns identical results with vs. without the provider mounted', () => {
    // Seed an entry through the public API so the persisted shape is realistic.
    addToLibrary('Test scenario', defaultProfile, defaultAssumptions)
    const bare = loadLibrary()
    expect(bare).toHaveLength(1)

    render(
      <QaFeedbackProvider>
        <div />
      </QaFeedbackProvider>,
    )
    const wrapped = loadLibrary()
    expect(JSON.stringify(wrapped)).toBe(JSON.stringify(bare))
    // No QA-mode mention in the persisted JSON.
    const stored = localStorage.getItem(LIBRARY_KEY) ?? ''
    expectNoQaArtifacts(stored)
  })

  it('loadLibrary rejects malformed entries identically whether or not the provider is mounted', () => {
    // Mix of valid + malformed entries; the loader silently drops the bad one.
    const validEntry = {
      id: 'good',
      name: 'Good scenario',
      savedAt: '2026-01-01T00:00:00.000Z',
      schemaVersion: 1,
      profile: defaultProfile,
      assumptions: defaultAssumptions,
    }
    const malformed = { id: '', name: '', savedAt: '' }
    const seeded = JSON.stringify([validEntry, malformed])
    localStorage.setItem(LIBRARY_KEY, seeded)

    const bare = loadLibrary()
    expect(bare).toHaveLength(1)
    expect(bare[0].id).toBe('good')

    cleanup()
    localStorage.setItem(LIBRARY_KEY, seeded)

    render(
      <QaFeedbackProvider>
        <div />
      </QaFeedbackProvider>,
    )
    const wrapped = loadLibrary()
    expect(JSON.stringify(wrapped)).toBe(JSON.stringify(bare))
  })
})
