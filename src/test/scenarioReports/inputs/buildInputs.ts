/**
 * Builders for the frozen synthetic scenario inputs (issue #377).
 *
 * This module is the PROVENANCE RECORD of how the committed JSON inputs were
 * derived. It runs only inside `scripts/scenario-capture-inputs.ts` — routine
 * test execution reads the committed JSON files and never calls these
 * builders, so the suite cannot drift with `defaultScenario` at runtime.
 *
 * All inputs are SYNTHETIC (no real-person data). Every workspace uses
 * deterministic instance ids and a fixed `createdAt` so the JSON is stable.
 */

import type { PersonalProfile, ScenarioAssumptions } from '../../../domain'
import type {
  AltersvorsorgedepotInstance,
  BavInstance,
  BasisrenteInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
} from '../../../domain/instances'
import type { ReturnScenario } from '../../../domain/profile'
import type { WorkspaceAssumptionsV2 } from '../../../domain/workspace'
import type { CaseInput } from '../types'
import { defaultAssumptions, defaultProfile } from '../../../data/defaultScenario'

// ---------------------------------------------------------------------------
// Frozen base values (deliberately NOT the default scenario's own identity)
// ---------------------------------------------------------------------------

/** Synthetic base profile: 40-year-old employee, 60 k EUR, GKV, no children. */
const BASE_PROFILE: PersonalProfile = {
  ...defaultProfile,
  age: 40,
  retirementAge: 67,
  grossSalaryYear: 60_000,
  childBirthYears: [],
  desiredNetMonthlyPension: 0,
}

const BASE_MONTE_CARLO = {
  enabled: false,
  runs: 200,
  annualVolatility: 0.15,
  seed: 20260908,
}

const CANONICAL_RETURN_SCENARIOS: ReturnScenario[] = [
  { id: 'konservativ', label: 'Konservativ', annualReturn: 0.03 },
  { id: 'basis', label: 'Basis', annualReturn: 0.05 },
  { id: 'optimistisch', label: 'Optimistisch', annualReturn: 0.07 },
]

const ALL_PRODUCTS = [
  'etf',
  'bav',
  'versicherung',
  'basisrente',
  'altersvorsorgedepot',
  'riester',
] as const

function baseAssumptions(): ScenarioAssumptions {
  return {
    ...defaultAssumptions,
    inflationRate: 0,
    retirementEndAge: 90,
    visibleProducts: [...ALL_PRODUCTS],
    equalInputAmountEUR: 200,
    returnScenarios: CANONICAL_RETURN_SCENARIOS.map((s) => ({ ...s })),
    monteCarlo: { ...BASE_MONTE_CARLO },
    statutoryPension: {
      ...defaultAssumptions.statutoryPension,
      currentEntgeltpunkte: 18,
      includeGrvReduction: false,
      annualSalaryGrowthRate: 0,
      rentenwertGrowthRate: 0,
    },
  }
}

function cloneInput<T extends CaseInput>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T
}

function compareInput(overrides: {
  profile?: Partial<PersonalProfile>
  assumptions?: (a: ScenarioAssumptions) => ScenarioAssumptions
  anchorNetPerMonth?: number
}): Extract<CaseInput, { kind: 'compare' }> {
  const assumptions = overrides.assumptions
    ? overrides.assumptions(baseAssumptions())
    : baseAssumptions()
  return {
    kind: 'compare',
    profile: { ...BASE_PROFILE, ...overrides.profile },
    assumptions,
    anchorNetPerMonth: overrides.anchorNetPerMonth ?? 200,
  }
}

// ---------------------------------------------------------------------------
// Combine-mode workspace helpers
// ---------------------------------------------------------------------------

const WORKSPACE_CREATED_AT = '2026-09-08T00:00:00.000Z'

function commonInstance(
  instanceId: string,
  label: string,
  contractStartYear: number,
  currentValueEUR: number,
) {
  return {
    instanceId,
    label,
    status: 'active' as const,
    contractStartYear,
    currentValueEUR,
    evidenceMap: {},
  }
}

function bavInstance(
  instanceId: string,
  label: string,
  overrides: Partial<BavInstance> & { monthlyGrossConversion: number },
): BavInstance {
  return {
    ...defaultAssumptions.bav,
    ...commonInstance(instanceId, label, 2026, 0),
    ...overrides,
  }
}

function etfInstance(
  instanceId: string,
  label: string,
  overrides: Partial<EtfInstance> & { monthlyContribution: number },
): EtfInstance {
  return {
    ...defaultAssumptions.etf,
    ...commonInstance(instanceId, label, 2020, 0),
    ...overrides,
  }
}

function insuranceInstance(
  instanceId: string,
  label: string,
  overrides: Partial<InsuranceInstance> & { monthlyContribution: number },
): InsuranceInstance {
  return {
    ...defaultAssumptions.insurance,
    ...commonInstance(instanceId, label, 2020, 0),
    ...overrides,
  }
}

function basisrenteInstance(
  instanceId: string,
  label: string,
  overrides: Partial<BasisrenteInstance> & { monthlyGrossContribution: number },
): BasisrenteInstance {
  return {
    ...defaultAssumptions.basisrente,
    ...commonInstance(instanceId, label, 2026, 0),
    ...overrides,
  }
}

function avdInstance(
  instanceId: string,
  label: string,
  overrides: Partial<AltersvorsorgedepotInstance> & { monthlyOwnContribution: number },
): AltersvorsorgedepotInstance {
  return {
    ...defaultAssumptions.altersvorsorgedepot,
    ...commonInstance(instanceId, label, 2026, 0),
    ...overrides,
  }
}

function riesterInstance(
  instanceId: string,
  label: string,
  overrides: Partial<RiesterInstance> & { monthlyOwnContribution: number },
): RiesterInstance {
  return {
    ...defaultAssumptions.riester,
    ...commonInstance(instanceId, label, 2026, 0),
    ...overrides,
  }
}

function workspaceInput(overrides: {
  profile?: Partial<PersonalProfile>
  partner?: PersonalProfile
  instances: {
    bav?: BavInstance[]
    etf?: EtfInstance[]
    insurance?: InsuranceInstance[]
    basisrente?: BasisrenteInstance[]
    altersvorsorgedepot?: AltersvorsorgedepotInstance[]
    riester?: RiesterInstance[]
  }
  visibleProducts?: Array<(typeof ALL_PRODUCTS)[number]>
  statutoryPensionOverrides?: Partial<ScenarioAssumptions['statutoryPension']>
  returnScenarios?: ReturnScenario[]
}): Extract<CaseInput, { kind: 'combine' }> {
  const profile = { ...BASE_PROFILE, ...overrides.profile }
  const wsa: WorkspaceAssumptionsV2 = {
    bav: overrides.instances.bav ?? [],
    etf: overrides.instances.etf ?? [],
    insurance: overrides.instances.insurance ?? [],
    basisrente: overrides.instances.basisrente ?? [],
    altersvorsorgedepot: overrides.instances.altersvorsorgedepot ?? [],
    riester: overrides.instances.riester ?? [],
    statutoryPension: {
      ...baseAssumptions().statutoryPension,
      ...overrides.statutoryPensionOverrides,
    },
    inflationRate: 0,
    retirementEndAge: 90,
    returnScenarios: (overrides.returnScenarios ?? CANONICAL_RETURN_SCENARIOS).map((s) => ({ ...s })),
    monteCarlo: { ...BASE_MONTE_CARLO },
    visibleProducts: overrides.visibleProducts ?? [...ALL_PRODUCTS],
    equalInputAmountEUR: 200,
  }
  return {
    kind: 'combine',
    workspace: {
      schemaVersion: 2,
      mode: 'combine',
      baseline: {
        id: 'baseline',
        label: 'Baseline',
        profile,
        ...(overrides.partner ? { partner: overrides.partner } : {}),
        assumptions: wsa,
        createdAt: WORKSPACE_CREATED_AT,
        origin: 'baseline',
      },
      whatIfs: [],
      pinnedComparisonIds: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Family A — compare-baseline
// ---------------------------------------------------------------------------

function compareBaselineFamily(): Record<string, CaseInput> {
  return {
    'all-products': cloneInput(compareInput({})),
    'default-pair': cloneInput(
      compareInput({
        assumptions: (a) => ({ ...a, visibleProducts: ['etf', 'bav'] }),
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family B — compare-payout-modes
// ---------------------------------------------------------------------------

function comparePayoutModesFamily(): Record<string, CaseInput> {
  const visible = ['etf', 'bav', 'versicherung'] as const
  return {
    kapitalverzehr: cloneInput(
      compareInput({
        assumptions: (a) => ({
          ...a,
          visibleProducts: [...visible],
          bav: { ...a.bav, payoutMode: 'kapitalverzehr' },
          insurance: { ...a.insurance, payoutMode: 'kapitalverzehr' },
        }),
      }),
    ),
    zeitrente: cloneInput(
      compareInput({
        assumptions: (a) => ({
          ...a,
          visibleProducts: [...visible],
          bav: { ...a.bav, payoutMode: 'zeitrente', zeitrenteYears: 15 },
          insurance: { ...a.insurance, payoutMode: 'zeitrente', zeitrenteYears: 15 },
        }),
      }),
    ),
    leibrente: cloneInput(
      compareInput({
        assumptions: (a) => ({
          ...a,
          visibleProducts: [...visible],
          bav: { ...a.bav, payoutMode: 'leibrente', rentenfaktor: 30 },
          insurance: { ...a.insurance, payoutMode: 'leibrente', rentenfaktor: 28 },
        }),
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family C — compare-contract-vintage
// ---------------------------------------------------------------------------

function compareContractVintageFamily(): Record<string, CaseInput> {
  return {
    'pre2005-kapitalverzehr': cloneInput(
      compareInput({
        assumptions: (a) => ({
          ...a,
          visibleProducts: ['etf', 'versicherung'],
          insurance: {
            ...a.insurance,
            contractStartYear: 1990,
            oldContractTaxFreeEligible: true,
            payoutMode: 'kapitalverzehr',
          },
        }),
      }),
    ),
    'halbeinkuenfte-kapitalverzehr': cloneInput(
      compareInput({
        assumptions: (a) => ({
          ...a,
          visibleProducts: ['etf', 'versicherung'],
          insurance: {
            ...a.insurance,
            contractStartYear: 2010,
            oldContractTaxFreeEligible: false,
            payoutMode: 'kapitalverzehr',
          },
        }),
      }),
    ),
    // 2026 vintage, Leibrente: runtime (2026→2053) = 27 years ≥ 12 and payout
    // at 67 ≥ 62, so the CAPITAL-payout mode for this vintage would be
    // Halbeinkünfte — this case pins the §22 Nr. 1 Ertragsanteil annuity
    // override instead. NOT an Abgeltungsteuer case (see the sibling below).
    'leibrente-ertragsanteil': cloneInput(
      compareInput({
        assumptions: (a) => ({
          ...a,
          visibleProducts: ['etf', 'versicherung'],
          insurance: {
            ...a.insurance,
            contractStartYear: 2026,
            oldContractTaxFreeEligible: false,
            payoutMode: 'leibrente',
          },
        }),
      }),
    ),
    // Current contract (start 2026) with early retirement at 60: runtime
    // (2026→2046) = 20 years ≥ 12, but the payout lands below the
    // Halbeinkünfte minimum age (62 for ≥2012 contracts), so the full gain
    // falls under §20 Abs. 2 EStG Abgeltungsteuer — the third leg of the
    // vintage triangle, without a future contract-start mismatch.
    'abgeltungsteuer-kapitalverzehr': cloneInput(
      compareInput({
        profile: { retirementAge: 60 },
        assumptions: (a) => ({
          ...a,
          visibleProducts: ['etf', 'versicherung'],
          insurance: {
            ...a.insurance,
            contractStartYear: 2026,
            oldContractTaxFreeEligible: false,
            payoutMode: 'kapitalverzehr',
          },
        }),
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family D — compare-horizons-returns
// ---------------------------------------------------------------------------

function compareHorizonsReturnsFamily(): Record<string, CaseInput> {
  return {
    'short-horizon': cloneInput(
      compareInput({
        profile: { age: 60, retirementAge: 67 },
      }),
    ),
    'zero-return': cloneInput(
      compareInput({
        assumptions: (a) => ({
          ...a,
          returnScenarios: CANONICAL_RETURN_SCENARIOS.map((s) => ({
            ...s,
            annualReturn: 0,
          })),
        }),
      }),
    ),
    'negative-return-with-guarantee': cloneInput(
      compareInput({
        assumptions: (a) => ({
          ...a,
          returnScenarios: CANONICAL_RETURN_SCENARIOS.map((s) => ({
            ...s,
            annualReturn: -0.02,
          })),
          // Guarantee floor stays on (default); the negative market path makes
          // the contractual minimum bite → guaranteeApplied must surface.
          insurance: { ...a.insurance, capitalGuarantee: { enabled: true, floorPctOfContributions: 1 } },
        }),
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family E — monte-carlo-seeded
// ---------------------------------------------------------------------------

function monteCarloSeededFamily(): Record<string, CaseInput> {
  const mcBase = (
    seed: number,
  ): Extract<CaseInput, { kind: 'monte-carlo' }> => ({
    ...compareInput({
      assumptions: (a) => ({
        ...a,
        visibleProducts: ['etf', 'versicherung'],
        monteCarlo: { ...BASE_MONTE_CARLO, enabled: true, runs: 200, seed },
      }),
    }),
    kind: 'monte-carlo',
    scenarioId: 'basis',
  })
  return {
    'seed-20260908': cloneInput(mcBase(20260908)),
    'seed-20260909': cloneInput(mcBase(20260909)),
  }
}

// ---------------------------------------------------------------------------
// Family F — combine-single-bav
// ---------------------------------------------------------------------------

function combineSingleBavFamily(): Record<string, CaseInput> {
  return {
    'single-conversion': cloneInput(
      workspaceInput({
        instances: { bav: [bavInstance('bav-1', 'bAV Arbeitgeber A', { monthlyGrossConversion: 200 })] },
        visibleProducts: ['bav'],
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family G — combine-mixed-household (2 × bAV + 2 × ETF)
// ---------------------------------------------------------------------------

function combineMixedHouseholdFamily(): Record<string, CaseInput> {
  return {
    'two-bav-two-etf': cloneInput(
      workspaceInput({
        instances: {
          bav: [
            bavInstance('bav-1', 'bAV Arbeitgeber A', { monthlyGrossConversion: 100 }),
            bavInstance('bav-2', 'bAV Arbeitgeber B', { monthlyGrossConversion: 120 }),
          ],
          etf: [
            etfInstance('etf-1', 'ETF Welt', {
              monthlyContribution: 100,
              contractStartYear: 2018,
              currentValueEUR: 5_000,
            }),
            etfInstance('etf-2', 'ETF SPARPLAN', {
              monthlyContribution: 80,
              contractStartYear: 2021,
              currentValueEUR: 3_000,
            }),
          ],
        },
        visibleProducts: ['bav', 'etf'],
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family H — combine-cap-thresholds (external-golden-anchored)
// ---------------------------------------------------------------------------

function combineCapThresholdsFamily(): Record<string, CaseInput> {
  return {
    'bav-single-at-tax-free-cap': cloneInput(
      workspaceInput({
        instances: {
          bav: [bavInstance('bav-1', 'bAV 8% BBG', { monthlyGrossConversion: 676 })],
        },
        visibleProducts: ['bav'],
      }),
    ),
    'bav-pair-over-shared-cap': cloneInput(
      workspaceInput({
        instances: {
          bav: [
            bavInstance('bav-1', 'bAV Arbeitgeber A', { monthlyGrossConversion: 500 }),
            bavInstance('bav-2', 'bAV Arbeitgeber B', { monthlyGrossConversion: 400 }),
          ],
        },
        visibleProducts: ['bav'],
      }),
    ),
    'basisrente-riester-avd-headroom': cloneInput(
      workspaceInput({
        instances: {
          basisrente: [
            basisrenteInstance('basisrente-1', 'Rürup Basisrente', { monthlyGrossContribution: 200 }),
          ],
          riester: [
            riesterInstance('riester-1', 'Riester Klassik', {
              monthlyOwnContribution: 250,
              eligibility: {
                directlyEligible: true,
                indirectSpouseEligible: false,
                ageAtContractStart: 40,
                careerStarterBonusUsed: true,
              },
            }),
          ],
          altersvorsorgedepot: [
            avdInstance('avd-1', 'AVD Standarddepot', { monthlyOwnContribution: 150 }),
          ],
        },
        visibleProducts: ['basisrente', 'riester', 'altersvorsorgedepot'],
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family I — combine-health-statuses
// ---------------------------------------------------------------------------

function combineHealthStatusesFamily(): Record<string, CaseInput> {
  const shared = {
    instances: {
      bav: [bavInstance('bav-1', 'bAV Direktversicherung', { monthlyGrossConversion: 150 })],
      basisrente: [
        basisrenteInstance('basisrente-1', 'Rürup Basisrente', { monthlyGrossContribution: 200 }),
      ],
      altersvorsorgedepot: [
        avdInstance('avd-1', 'AVD Standarddepot', { monthlyOwnContribution: 150 }),
      ],
      riester: [
        riesterInstance('riester-1', 'Riester Klassik', { monthlyOwnContribution: 200 }),
      ],
      etf: [etfInstance('etf-1', 'ETF Welt', { monthlyContribution: 100 })],
    },
  }
  return {
    kvdr: cloneInput(workspaceInput({ ...shared, visibleProducts: [...ALL_PRODUCTS] })),
    'freiwillig-gkv': cloneInput(
      workspaceInput({
        ...shared,
        visibleProducts: [...ALL_PRODUCTS],
        statutoryPensionOverrides: { retirementHealthStatus: 'freiwillig_gkv' },
      }),
    ),
    pkv: cloneInput(
      workspaceInput({
        ...shared,
        // A real PKV holder in this app is publicHealthInsurance: false —
        // every statutory retirement KV/PV channel gates on that flag, not on
        // the retirementHealthStatus. Meaningful PKV/PV premiums so the
        // salary-phase PKV branch carries real inputs.
        profile: {
          publicHealthInsurance: false,
          pkvMonthlyPremium: 450,
          pPVMonthlyPremium: 120,
        },
        visibleProducts: [...ALL_PRODUCTS],
        statutoryPensionOverrides: { retirementHealthStatus: 'pkv' },
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family J — combine-paid-up
// ---------------------------------------------------------------------------

function combinePaidUpFamily(): Record<string, CaseInput> {
  const bavActive = bavInstance('bav-1', 'bAV aktiv', { monthlyGrossConversion: 150 })
  const bavPaidUp: BavInstance = {
    ...bavInstance('bav-2', 'bAV beitragsfrei', { monthlyGrossConversion: 200 }),
    status: 'paid_up',
  }
  const insPaidUp: InsuranceInstance = {
    ...insuranceInstance('ins-1', 'pAV beitragsfrei', {
      monthlyContribution: 150,
      contractStartYear: 2015,
    }),
    status: 'paid_up',
  }
  return {
    'one-active-one-paid-up-per-class': cloneInput(
      workspaceInput({
        instances: {
          bav: [bavActive, bavPaidUp],
          insurance: [insPaidUp],
          etf: [etfInstance('etf-1', 'ETF aktiv', { monthlyContribution: 100 })],
        },
        visibleProducts: [...ALL_PRODUCTS],
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Families K + L — combine transfers
// ---------------------------------------------------------------------------

function combineTransferCertifiedFamily(): Record<string, CaseInput> {
  const event = {
    type: 'certified' as const,
    year: 2029,
    sourceInstanceId: 'bav-1',
    targetInstanceId: 'avd-1',
    amountEUR: 18_000,
  }
  return {
    'bav-to-avd': cloneInput(
      workspaceInput({
        instances: {
          bav: [
            {
              ...bavInstance('bav-1', 'bAV Umzugswagen', {
                monthlyGrossConversion: 200,
                contractStartYear: 2018,
                currentValueEUR: 18_000,
              }),
              transferEvents: [event],
            },
          ],
          altersvorsorgedepot: [
            {
              ...avdInstance('avd-1', 'AVD Zielvertrag', {
                monthlyOwnContribution: 100,
                contractStartYear: 2026,
              }),
              transferEvents: [event],
            },
          ],
        },
        visibleProducts: ['bav', 'altersvorsorgedepot'],
      }),
    ),
  }
}

function combineTransferSurrenderFamily(): Record<string, CaseInput> {
  const event = {
    type: 'surrender_reinvest' as const,
    year: 2029,
    sourceInstanceId: 'ins-1',
    targetInstanceId: 'etf-1',
    amountEUR: 20_000,
    surrenderHaircutPct: 0.05,
  }
  return {
    'insurance-to-etf': cloneInput(
      workspaceInput({
        instances: {
          insurance: [
            {
              ...insuranceInstance('ins-1', 'pAV Altvertrag', {
                monthlyContribution: 150,
                contractStartYear: 2015,
                currentValueEUR: 20_000,
              }),
              status: 'surrendered' as const,
              surrenderHaircutPct: 0.05,
              transferEvents: [event],
            },
          ],
          etf: [
            {
              ...etfInstance('etf-1', 'ETF Zieldepot', {
                monthlyContribution: 100,
                contractStartYear: 2020,
                currentValueEUR: 6_000,
              }),
              transferEvents: [event],
            },
          ],
        },
        visibleProducts: ['versicherung', 'etf'],
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family M — combine-married-splitting
// ---------------------------------------------------------------------------

function combineMarriedSplittingFamily(): Record<string, CaseInput> {
  return {
    // ONE modeled earner: the partner profile (tax class 5, 20 k EUR) carries
    // the hasPartner flag that switches the aggregate pipeline onto §32a
    // Abs. 5 EStG splitting, but the partner's salary and contracts do NOT
    // enter the simulation.
    'single-earner-splitting': cloneInput(
      workspaceInput({
        partner: {
          ...BASE_PROFILE,
          age: 41,
          grossSalaryYear: 20_000,
          taxClass: 5,
        },
        instances: {
          bav: [bavInstance('bav-1', 'bAV Arbeitgeber A', { monthlyGrossConversion: 200 })],
          basisrente: [
            basisrenteInstance('basisrente-1', 'Rürup Basisrente', { monthlyGrossContribution: 200 }),
          ],
        },
        visibleProducts: ['bav', 'basisrente'],
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Family N — combine-zero-return
// ---------------------------------------------------------------------------

function combineZeroReturnFamily(): Record<string, CaseInput> {
  return {
    'two-bav-one-etf': cloneInput(
      workspaceInput({
        instances: {
          bav: [
            bavInstance('bav-1', 'bAV Arbeitgeber A', { monthlyGrossConversion: 100 }),
            bavInstance('bav-2', 'bAV Arbeitgeber B', { monthlyGrossConversion: 120 }),
          ],
          etf: [
            etfInstance('etf-1', 'ETF Welt', {
              monthlyContribution: 100,
              contractStartYear: 2018,
              currentValueEUR: 5_000,
            }),
          ],
        },
        visibleProducts: ['bav', 'etf'],
        returnScenarios: CANONICAL_RETURN_SCENARIOS.map((s) => ({ ...s, annualReturn: 0 })),
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** familyId → caseId → frozen input. Written once to `inputs/<familyId>.json`. */
export function buildAllInputs(): Record<string, Record<string, CaseInput>> {
  return {
    'compare-baseline': compareBaselineFamily(),
    'compare-payout-modes': comparePayoutModesFamily(),
    'compare-contract-vintage': compareContractVintageFamily(),
    'compare-horizons-returns': compareHorizonsReturnsFamily(),
    'monte-carlo-seeded': monteCarloSeededFamily(),
    'combine-single-bav': combineSingleBavFamily(),
    'combine-mixed-household': combineMixedHouseholdFamily(),
    'combine-cap-thresholds': combineCapThresholdsFamily(),
    'combine-health-statuses': combineHealthStatusesFamily(),
    'combine-paid-up': combinePaidUpFamily(),
    'combine-transfer-certified': combineTransferCertifiedFamily(),
    'combine-transfer-surrender': combineTransferSurrenderFamily(),
    'combine-married-splitting': combineMarriedSplittingFamily(),
    'combine-zero-return': combineZeroReturnFamily(),
  }
}
