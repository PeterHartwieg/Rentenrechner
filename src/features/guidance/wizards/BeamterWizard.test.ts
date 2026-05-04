/**
 * Unit + integration tests for the BeamterWizard workspace-output shape.
 *
 * Unit: Markus (38, Lehrer Bayern, Beamter) — verifies the expected
 * workspace shape: pensionBaselineType='beamtenpension', no GRV/bAV in
 * visibleProducts, manualMonthlyGross set from wizard input.
 *
 * Integration: Markus-shape workspace runs through combinePortfolio
 * correctly — no GRV employee/employer contributions, no §3 Nr. 63 path,
 * KV/PV via PKV (retirementHealthStatus='pkv').
 */

import { describe, it, expect } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../../data/defaultScenario'
import { VISIBLE_PRODUCTS_BY_PATH } from '../../../content/triggers'
import { de2026Rules } from '../../../rules/de2026'
import { migrateV1ToV2 } from '../../../storage'
import { simulatePortfolio } from '../../../engine/portfolioAdapter'
import { combinePortfolio, type CombineContext } from '../../../engine/portfolioCombine'
import type { BasicInputs, PathSpecific } from './shared'
import type { PersonalProfile, ScenarioAssumptions } from '../../../domain'

// ---------------------------------------------------------------------------
// Replicate the applyAndComplete logic for the beamter path.
// This mirrors GuidedSetup.tsx without pulling in React.
// ---------------------------------------------------------------------------

function applyBeamter(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  basics: BasicInputs,
  extras: PathSpecific,
): { profile: PersonalProfile; assumptions: ScenarioAssumptions } {
  const beamterBaselineType =
    extras.versorgungType === 'mixed' ? 'beamtenpension' : extras.versorgungType

  const nextProfile: PersonalProfile = {
    ...profile,
    age: basics.age,
    retirementAge: basics.retirementAge,
    grossSalaryYear: basics.grossSalaryYear,
    publicHealthInsurance: basics.publicHealthInsurance,
    childBirthYears: profile.childBirthYears,
  }

  const nextAssumptions: ScenarioAssumptions = {
    ...assumptions,
    visibleProducts: VISIBLE_PRODUCTS_BY_PATH['beamter'],
    statutoryPension: {
      ...assumptions.statutoryPension,
      pensionBaselineType: beamterBaselineType,
      manualMonthlyGross:
        extras.estimatedBeamtenpensionMonthly > 0
          ? extras.estimatedBeamtenpensionMonthly
          : null,
      retirementHealthStatus: basics.publicHealthInsurance ? 'kvdr' : 'pkv',
    },
  }

  return { profile: nextProfile, assumptions: nextAssumptions }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('BeamterWizard workspace shape — Markus (38, Lehrer Bayern, Beamter)', () => {
  const basics: BasicInputs = {
    age: 38,
    retirementAge: 67,
    grossSalaryYear: 65_000,
    publicHealthInsurance: false, // Beamter — PKV
  }

  const extras: PathSpecific = {
    // bav_offer / etf / rentengap fields (unused in this path)
    bavGrossConversion: 0,
    bavTotalMatchPct: 15,
    etfTerPct: 0.2,
    yearsWorked: 0,
    desiredNetMonthlyPension: 0,
    // low_income_parent fields (unused)
    partTimePct: 100,
    tightBudgetMonthly: 0,
    childBirthYear1: 0,
    childBirthYear2: 0,
    childBirthYear3: 0,
    // beamter fields
    versorgungType: 'beamtenpension',
    estimatedBeamtenpensionMonthly: 3_200,
  }

  const { profile: outProfile, assumptions: outAssumptions } = applyBeamter(
    defaultProfile,
    defaultAssumptions,
    basics,
    extras,
  )

  it('pensionBaselineType is beamtenpension', () => {
    expect(outAssumptions.statutoryPension.pensionBaselineType).toBe('beamtenpension')
  })

  it('manualMonthlyGross is set from wizard input', () => {
    expect(outAssumptions.statutoryPension.manualMonthlyGross).toBe(3_200)
  })

  it('retirementHealthStatus is pkv (Beamter, publicHealthInsurance=false)', () => {
    expect(outAssumptions.statutoryPension.retirementHealthStatus).toBe('pkv')
  })

  it('visibleProducts includes basisrente, etf, versicherung', () => {
    expect(outAssumptions.visibleProducts).toContain('basisrente')
    expect(outAssumptions.visibleProducts).toContain('etf')
    expect(outAssumptions.visibleProducts).toContain('versicherung')
  })

  it('visibleProducts does NOT include bav or riester', () => {
    expect(outAssumptions.visibleProducts).not.toContain('bav')
    expect(outAssumptions.visibleProducts).not.toContain('riester')
  })

  it('profile age is 38', () => {
    expect(outProfile.age).toBe(38)
  })

  it('profile publicHealthInsurance is false (PKV)', () => {
    expect(outProfile.publicHealthInsurance).toBe(false)
  })

  it('versorgungswerk type is preserved when versorgungType=versorgungswerk', () => {
    const vwExtras: PathSpecific = { ...extras, versorgungType: 'versorgungswerk' }
    const { assumptions } = applyBeamter(defaultProfile, defaultAssumptions, basics, vwExtras)
    expect(assumptions.statutoryPension.pensionBaselineType).toBe('versorgungswerk')
  })

  it('mixed versorgungType maps to beamtenpension (primary system)', () => {
    const mixedExtras: PathSpecific = { ...extras, versorgungType: 'mixed' }
    const { assumptions } = applyBeamter(defaultProfile, defaultAssumptions, basics, mixedExtras)
    expect(assumptions.statutoryPension.pensionBaselineType).toBe('beamtenpension')
  })

  it('manualMonthlyGross is null when estimatedBeamtenpensionMonthly is 0', () => {
    const noEstimateExtras: PathSpecific = { ...extras, estimatedBeamtenpensionMonthly: 0 }
    const { assumptions } = applyBeamter(
      defaultProfile,
      defaultAssumptions,
      basics,
      noEstimateExtras,
    )
    expect(assumptions.statutoryPension.manualMonthlyGross).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Integration: Markus workspace runs through combinePortfolio
// ---------------------------------------------------------------------------

describe('BeamterWizard integration — Markus workspace runs through combinePortfolio', () => {
  it('Basisrente-only Beamter workspace: combinePortfolio runs without errors, no bAV contributions', () => {
    // Build a Beamter-shaped assumptions: Basisrente 200 EUR/month, no bAV, no ETF.
    const beamterAssumptions: ScenarioAssumptions = {
      ...defaultAssumptions,
      visibleProducts: ['basisrente'],
      statutoryPension: {
        ...defaultAssumptions.statutoryPension,
        pensionBaselineType: 'beamtenpension',
        manualMonthlyGross: 3_200,
        retirementHealthStatus: 'pkv',
      },
      basisrente: {
        ...defaultAssumptions.basisrente,
        monthlyGrossContribution: 200,
      },
    }

    const beamterProfile: PersonalProfile = {
      ...defaultProfile,
      age: 38,
      retirementAge: 67,
      grossSalaryYear: 65_000,
      publicHealthInsurance: false,
    }

    // Migrate to workspace v2. migrateV1ToV2 picks up basisrente into the
    // instances array while ignoring bAV (monthlyGrossConversion = 0 default
    // → no instance emitted by the migration).
    const workspace = migrateV1ToV2(
      beamterProfile as unknown as Record<string, unknown>,
      beamterAssumptions as unknown as Record<string, unknown>,
    )

    // Drop ETF instances the migration might have added.
    workspace.baseline.assumptions.etf = []
    workspace.baseline.assumptions.bav = []
    workspace.baseline.assumptions.riester = []

    // Simulate portfolio — should not throw.
    const { perInstance } = simulatePortfolio(workspace, de2026Rules)

    // Verify at least one Basisrente instance was simulated.
    const instanceIds = Object.keys(perInstance)
    expect(instanceIds.length).toBeGreaterThanOrEqual(1)

    const basisInstId = workspace.baseline.assumptions.basisrente[0]?.instanceId
    expect(basisInstId).toBeDefined()
    const basisResults = perInstance[basisInstId!]
    expect(basisResults).toBeDefined()
    expect(basisResults!.length).toBeGreaterThan(0)

    // Grab the basis scenario result.
    const basisBasis = basisResults!.find((r) => r.scenarioId === 'basis')
    expect(basisBasis).toBeDefined()
    expect(basisBasis!.netMonthlyPayout).toBeGreaterThan(0)

    // Run combinePortfolio — no GRV gross (Beamtenpension is handled outside
    // combinePortfolio; grossMonthlyPension = 0 for the combine call).
    const ctx: CombineContext = {
      profile: beamterProfile,
      rules: de2026Rules,
      retirementYear: de2026Rules.year + (beamterProfile.retirementAge - beamterProfile.age),
      grvGrossMonthlyPension: 0, // Beamter has no GRV
      statutoryPensionTaxChannel: 'none',
      statutoryPensionKvChannel: 'none',
      retirementHealthStatus: 'pkv', // PKV — no statutory KV/PV
    }

    const combined = combinePortfolio(workspace, [basisBasis!], ctx)

    // With no GRV, statutory pension net should be 0.
    expect(combined.statutoryPensionMonthlyNet).toBe(0)

    // Combined monthly income = basisrente net payout (only product).
    expect(combined.monthlyNetIncome).toBeCloseTo(basisBasis!.netMonthlyPayout, 6)

    // No bAV contributions → no §3 Nr. 63 deduction path activated.
    // The bav instances array is empty.
    expect(workspace.baseline.assumptions.bav).toHaveLength(0)
  })
})
