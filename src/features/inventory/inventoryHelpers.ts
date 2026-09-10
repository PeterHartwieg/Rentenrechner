/**
 * Pure helper functions for the InventoryWizard — separated from the React
 * component files to satisfy the react-refresh/only-export-components rule.
 *
 * ID generation (`newInstanceId`) and pure workspace mutations
 * (`addInstanceToWorkspace`, `removeInstanceFromWorkspace`) live in
 * `workspaceIdentity.ts` and are re-exported from here for backward compat.
 * This breaks the former circular dependency with `portfolioState.ts`.
 *
 * Draft-to-instance converters (`bavDraftToInstance` etc.) are now thin wrappers
 * over the corresponding `INVENTORY_PRODUCT_REGISTRY[id].draftToInstance` entries
 * (architecture-readability issue 09).  Each named export is kept for backward
 * compat with callers that import the specific function by name.
 *
 * Consumers:
 *  - InventoryWizard.tsx (buildWorkspaceFromDraft)
 *  - InstanceCard.tsx (estimateEpFromYears)
 *  - InventoryWizard.test.ts
 *  - portfolioState.ts (addInstanceToWorkspace, removeInstanceFromWorkspace — via workspaceIdentity)
 *  - contractDecisions.ts (avdDraftToInstance, newInstanceId)
 *  - CombineDashboardSidebar.tsx (bavOfferDraftToInstance)
 */

import type {
  GermanRules,
  InputStatusMap,
  PersonalProfile,
  StatutoryPensionAssumptions,
} from '../../domain'
import type { Workspace, Scenario, WorkspaceAssumptionsV2 } from '../../domain/workspace'
import { de2026Rules } from '../../rules/de2026'
import {
  legacyEpSeedDurchschnittsentgelt,
  legacyEpSeedPensionCapYear,
} from '../../rules/legacyArtefacts'
import { resolveInputStatus } from '../results/provenanceHelpers'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { defaultWorkspace } from '../../storage'
import {
  newScenarioId,
  newInstanceId,
  addInstanceToWorkspace,
  removeInstanceFromWorkspace,
} from '../../app/workspaceIdentity'
// Re-export so existing callers (contractDecisions, tests, portfolioState) keep working.
export { newInstanceId, addInstanceToWorkspace, removeInstanceFromWorkspace }
import { INVENTORY_PRODUCT_REGISTRY } from './inventoryProductRegistry'
import type {
  GrvDraft,
  BavDraft,
  PavDraft,
  RiesterDraft,
  BasisrenteDraft,
  AvdDraft,
  EtfDraft,
  PersonalDetailsDraft,
} from './types'
import type {
  BavInstance,
  InsuranceInstance,
  RiesterInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  EtfInstance,
} from '../../domain/instances'

// ---------------------------------------------------------------------------
// EP estimation
// ---------------------------------------------------------------------------

/**
 * Estimate Entgeltpunkte from years worked × current gross salary.
 * EP/year = min(salary, Beitragsbemessungsgrenze) / Durchschnittsentgelt
 *
 * Statutory values come from the active rule set (`rules.socialSecurity`), the
 * same denominator `projectStatutoryPension` uses (`engine/grv.ts`). Until the
 * simplification project this helper hardcoded `durchschnittsentgelt = 47_079`
 * while the active 2026 value is `51_944`, so the wizard seeded
 * `currentEntgeltpunkte` about 10.3 % too high before simulation. Reading the
 * rules corrects the estimate downward by 9.37 %.
 *
 * Rough UI estimate only: it assumes today's salary for every past year and
 * reconstructs no credited education, caring, child-rearing or unemployment
 * periods. It is not an official contribution record.
 */
export function estimateEpFromYears(
  years: number,
  grossSalaryYear: number,
  rules: GermanRules = de2026Rules,
): number {
  if (!Number.isFinite(years) || years <= 0) return 0
  if (!Number.isFinite(grossSalaryYear) || grossSalaryYear <= 0) return 0
  const bbg = rules.socialSecurity.pensionCapYear
  const durchschnittsentgelt = rules.socialSecurity.durchschnittsentgelt
  const cappedSalary = Math.min(grossSalaryYear, bbg)
  return durchschnittsentgelt > 0
    ? Math.max(0, years * (cappedSalary / durchschnittsentgelt))
    : 0
}

/** Reserved scenario-level input-status key for the Entgeltpunkte (`domain/inputStatus.ts`). */
const EP_INPUT_STATUS_KEY = 'statutoryPension.currentEntgeltpunkte'

/**
 * Detect an unchanged pre-#394 estimate without migrating user-entered EP.
 *
 * Two payload shapes reach this detector:
 *
 * 1. **Method recorded** — `pensionEntryMethod` is `years` / `career`, so the
 *    year count that seeded the estimate is stored next to it. Both estimates
 *    are recomputed from it directly.
 * 2. **Method absent** — payloads saved before `pensionEntryMethod` existed
 *    (the same commit that fixed the denominator) carry only the seeded
 *    `currentEntgeltpunkte`. The year count is recovered by inverting the
 *    defective estimator and must reconstruct it exactly: the old estimator
 *    serialized its result at full double precision, so re-running
 *    `years * min(salary, legacyEpSeedPensionCapYear) /
 *    legacyEpSeedDurchschnittsentgelt` on the rounded count matches the stored
 *    value to within a few ULPs, while a hand-typed or rounded Entgeltpunkte
 *    value misses by many orders of magnitude — even when it happens to invert
 *    to a near-integer year count. Detection additionally requires a GRV
 *    baseline and an Entgeltpunkte value the user did not supply themselves —
 *    both `'entered'` (typed) and `'document'` (read off a Renteninformation)
 *    suppress it (`inputStatus`, resolved like `onboardingDraft.ts` does —
 *    absent means `assumed`, never user-owned).
 *
 * A manual gross-pension override suppresses detection in both shapes: while
 * `manualMonthlyGross` is non-null (including zero), the projection ignores `currentEntgeltpunkte`
 * entirely, so a stored seed behind an override cannot influence any number
 * the user sees and a re-estimate would do nothing.
 */
export function detectLegacyEpSeed({
  statutoryPension,
  profile,
  rules,
  inputStatus,
}: {
  statutoryPension: StatutoryPensionAssumptions
  profile: PersonalProfile
  rules: GermanRules
  /** Scenario-level input statuses; an `'entered'` or `'document'` EP value suppresses detection. */
  inputStatus?: InputStatusMap
}): { legacy: true; freshEstimate: number } | { legacy: false } {
  const method = statutoryPension.pensionEntryMethod
  const stored = statutoryPension.currentEntgeltpunkte
  const tolerance = 0.005

  // Any non-null manual figure, including zero, wins in the projection —
  // never offer a re-estimate that has no effect on the shown numbers.
  if (statutoryPension.manualMonthlyGross !== null) {
    return { legacy: false }
  }

  // 'entered' and 'document' both mean the user owns the value (typed, or read
  // off a Renteninformation) — neither can be a wizard seed, in either branch.
  const epStatus = resolveInputStatus(inputStatus, undefined, EP_INPUT_STATUS_KEY)
  if (epStatus === 'entered' || epStatus === 'document') return { legacy: false }

  if (method?.kind === 'years' || method?.kind === 'career') {
    const years = method.kind === 'years'
      ? method.contributionYears
      : profile.age - method.careerStartAge - method.pauseYears
    const freshEstimate = estimateEpFromYears(years, profile.grossSalaryYear, rules)
    // Frozen legacy cap, not the live BBG: the seed was written by the old
    // estimator, so it must be reconstructed with the values that estimator used.
    const oldEstimate = years * (
      Math.min(profile.grossSalaryYear, legacyEpSeedPensionCapYear) /
      legacyEpSeedDurchschnittsentgelt
    )
    if (
      Number.isFinite(stored) && Number.isFinite(freshEstimate) &&
      Number.isFinite(oldEstimate) && freshEstimate > 0 && oldEstimate > 0 &&
      Math.abs(stored - oldEstimate) <= oldEstimate * tolerance &&
      Math.abs(stored - freshEstimate) > freshEstimate * tolerance
    ) {
      return { legacy: true, freshEstimate }
    }
    return { legacy: false }
  }
  // Any other recorded method (points, document, projected-gross, skipped)
  // owns its value — nothing here was seeded from the defective estimator.
  if (method !== undefined) return { legacy: false }

  // Absent method: Entgeltpunkte only exist in the GRV; every other baseline
  // stores a manual figure or nothing at all.
  if ((statutoryPension.pensionBaselineType ?? 'grv') !== 'grv') return { legacy: false }

  const cappedSalary = Math.min(profile.grossSalaryYear, legacyEpSeedPensionCapYear)
  const ratio = cappedSalary / legacyEpSeedDurchschnittsentgelt
  const impliedYears = ratio > 0 ? stored / ratio : NaN
  // The old wizard advertised whole years but never quantised the input, so a
  // legacy seed may come from a fractional year count (12.5). Quantise to
  // hundredths; the exact-reconstruction test below still rejects anything
  // that was not written by the old estimator.
  const years = Math.round(impliedYears * 100) / 100
  if (!Number.isFinite(impliedYears) || stored <= 0 || years <= 0 || years > 60) {
    return { legacy: false }
  }
  // Exact-reconstruction test: a seed the old estimator wrote was serialized at
  // full double precision, so re-running its operation order on the rounded
  // year count reproduces the stored value to within a few ULPs. A hand-typed
  // value misses by far more — even when it inverts to a near-integer year
  // count, so no drift band is warranted here.
  const reconstructed = years * (cappedSalary / legacyEpSeedDurchschnittsentgelt)
  if (Math.abs(stored - reconstructed) > 4 * Number.EPSILON * Math.abs(reconstructed)) {
    return { legacy: false }
  }
  const freshEstimate = estimateEpFromYears(years, profile.grossSalaryYear, rules)
  // Same 0.5 % guard as the recorded-method branch: the notice must vanish
  // once the fresh estimate has been applied, and stay quiet should the
  // active denominator ever coincide with the legacy one.
  if (
    !Number.isFinite(freshEstimate) || freshEstimate <= 0 ||
    Math.abs(stored - freshEstimate) <= freshEstimate * tolerance
  ) {
    return { legacy: false }
  }
  return { legacy: true, freshEstimate }
}

// ---------------------------------------------------------------------------
// Career-based pension estimate (simplification project §7)
// ---------------------------------------------------------------------------

export interface CareerEstimateInput {
  currentAge: number
  careerStartAge: number
  pauseYears?: number
  grossSalaryYear: number
}

export type CareerEstimateResult =
  | {
      ok: true
      contributionYears: number
      entgeltpunkte: number
      monthlyGrossEUR: number
      assumptions: {
        durchschnittsentgelt: number
        beitragsbemessungsgrenze: number
        aktuellerRentenwert: number
      }
    }
  | { ok: false; code: 'start-after-now' | 'pauses-exceed-career' | 'no-salary' }

/** Youngest age at which contribution years are plausible (Ausbildungsbeginn). */
const MIN_CAREER_START_AGE = 14

/**
 * Rough career-based estimate of the statutory pension earned *so far*.
 *
 * `contributionYears = currentAge − careerStartAge − pauseYears`, fed into the
 * rules-backed `estimateEpFromYears`. Impossible ranges are **rejected, never
 * clipped**, so the UI can explain the problem instead of silently inventing a
 * plausible number.
 *
 * `monthlyGrossEUR` values the earned Entgeltpunkte at today's Rentenwert; it
 * is the amount earned to date, not a projection to retirement (the engine's
 * `projectStatutoryPension` adds the remaining years).
 */
export function estimateCareerPension(
  input: CareerEstimateInput,
  rules: GermanRules = de2026Rules,
): CareerEstimateResult {
  const { currentAge, careerStartAge, grossSalaryYear } = input
  const pauseYears = input.pauseYears ?? 0

  if (!Number.isFinite(grossSalaryYear) || grossSalaryYear <= 0) {
    return { ok: false, code: 'no-salary' }
  }
  if (
    !Number.isFinite(currentAge) ||
    !Number.isFinite(careerStartAge) ||
    careerStartAge < MIN_CAREER_START_AGE ||
    careerStartAge > currentAge
  ) {
    return { ok: false, code: 'start-after-now' }
  }
  const careerSpan = currentAge - careerStartAge
  if (!Number.isFinite(pauseYears) || pauseYears < 0 || pauseYears > careerSpan) {
    return { ok: false, code: 'pauses-exceed-career' }
  }

  const contributionYears = careerSpan - pauseYears
  const entgeltpunkte = estimateEpFromYears(contributionYears, grossSalaryYear, rules)
  return {
    ok: true,
    contributionYears,
    entgeltpunkte,
    monthlyGrossEUR: entgeltpunkte * rules.socialSecurity.aktuellerRentenwert,
    assumptions: {
      durchschnittsentgelt: rules.socialSecurity.durchschnittsentgelt,
      beitragsbemessungsgrenze: rules.socialSecurity.pensionCapYear,
      aktuellerRentenwert: rules.socialSecurity.aktuellerRentenwert,
    },
  }
}

// ---------------------------------------------------------------------------
// Workspace instance count
// ---------------------------------------------------------------------------

/**
 * Total contract count across every multi-instance product array in a v2
 * assumptions object. Registry-driven (iterates `PRODUCT_REGISTRY` and indexes
 * each entry's `assumptionsKey`) so a newly-added product is counted
 * automatically — never a hardcoded product list outside the registry, which
 * CLAUDE.md treats as a P1 bypass (Codex PR #347 R6). Single source of truth so
 * the combine-mode archive CTA and the receipt strip can't drift apart.
 */
export function countWorkspaceInstances(a: WorkspaceAssumptionsV2): number {
  return PRODUCT_REGISTRY.reduce(
    (sum, entry) => sum + a[entry.assumptionsKey].length,
    0,
  )
}

// ---------------------------------------------------------------------------
// Draft → domain instance converters
//
// Each function is a thin named wrapper over the corresponding registry entry's
// `draftToInstance` (issue 09). Kept as named exports for backward compat with
// callers that import them by name.
// ---------------------------------------------------------------------------

export function bavDraftToInstance(d: BavDraft): BavInstance {
  return INVENTORY_PRODUCT_REGISTRY.bav.draftToInstance(d, newInstanceId)
}

export interface BavOfferDraft {
  anbieter?: string
  contractStartYear: number
  contractualMatchPercent: number
  contractualFixedMonthly: number
  effektivkostenPct: number
  rentenfaktor: number
  durchfuehrungsweg: BavInstance['durchfuehrungsweg']
  payoutMode: BavInstance['payoutMode']
}

export function bavOfferDraftToInstance(d: BavOfferDraft): BavInstance {
  return {
    instanceId: newInstanceId('bav'),
    label: d.anbieter ? `bAV-Angebot ${d.anbieter}` : 'bAV-Angebot',
    anbieter: d.anbieter,
    status: 'offered',
    contractStartYear: d.contractStartYear,
    currentValueEUR: 0,
    evidenceMap: {},
    ownedBy: 'self',
    monthlyGrossConversion: 0,
    statutoryMinimumSubsidyEnabled: defaultAssumptions.bav.statutoryMinimumSubsidyEnabled,
    contractualMatchPercent: d.contractualMatchPercent,
    contractualFixedMonthly: d.contractualFixedMonthly,
    fees: {
      ...defaultAssumptions.bav.fees,
      wrapperAssetFee: d.effektivkostenPct / 100,
      fundAssetFee: 0,
    },
    monthlyOtherRetirementIncome: defaultAssumptions.bav.monthlyOtherRetirementIncome,
    includeGrvReduction: defaultAssumptions.bav.includeGrvReduction,
    kvdrMember: defaultAssumptions.bav.kvdrMember,
    durchfuehrungsweg: d.durchfuehrungsweg,
    pre2005EligibleTaxFree: defaultAssumptions.bav.pre2005EligibleTaxFree,
    payoutMode: d.payoutMode,
    rentenfaktor: d.rentenfaktor,
    rentenfaktorConfirmed: false,
    zeitrenteYears: defaultAssumptions.bav.zeitrenteYears,
    annualContributionGrowthRate: 0,
  }
}

export function pavDraftToInstance(d: PavDraft): InsuranceInstance {
  return INVENTORY_PRODUCT_REGISTRY.versicherung.draftToInstance(d, newInstanceId)
}

export function riesterDraftToInstance(d: RiesterDraft): RiesterInstance {
  return INVENTORY_PRODUCT_REGISTRY.riester.draftToInstance(d, newInstanceId)
}

export function basisrenteDraftToInstance(d: BasisrenteDraft): BasisrenteInstance {
  return INVENTORY_PRODUCT_REGISTRY.basisrente.draftToInstance(d, newInstanceId)
}

export function avdDraftToInstance(d: AvdDraft): AltersvorsorgedepotInstance {
  return INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.draftToInstance(d, newInstanceId)
}

export function etfDraftToInstance(d: EtfDraft): EtfInstance {
  return INVENTORY_PRODUCT_REGISTRY.etf.draftToInstance(d, newInstanceId)
}

// ---------------------------------------------------------------------------
// Build a v2 Workspace from wizard draft state
// ---------------------------------------------------------------------------

export interface BuildWorkspaceDraftParams {
  grvDraft: GrvDraft
  /** Single draft (backward-compat) or array of drafts for multi-instance. */
  bavDraft: BavDraft | BavDraft[] | null
  pavDraft: PavDraft | PavDraft[] | null
  riesterDraft: RiesterDraft | RiesterDraft[] | null
  basisrenteDraft: BasisrenteDraft | BasisrenteDraft[] | null
  avdDraft: AvdDraft | AvdDraft[] | null
  etfDraft: EtfDraft | EtfDraft[] | null
  /** @deprecated Use `personalDetails` instead. Kept for backward-compat. */
  grossSalaryYear: number
  /**
   * Personal details from wizard step 0 (issue #06).
   * When provided, populates profile.age, retirementAge, grossSalaryYear, and
   * (when ehegattensplitting=true) a minimal partner profile on the scenario.
   * When absent, grossSalaryYear is used as before (backward-compat).
   */
  personalDetails?: PersonalDetailsDraft
}

/** Normalise a possibly-null singleton or array draft to a non-null array. */
function toArray<T>(v: T | T[] | null): T[] {
  if (v === null) return []
  return Array.isArray(v) ? v : [v]
}

export function buildWorkspaceFromDraft(params: BuildWorkspaceDraftParams): Workspace {
  const {
    grvDraft,
    bavDraft,
    pavDraft,
    riesterDraft,
    basisrenteDraft,
    avdDraft,
    etfDraft,
    grossSalaryYear,
    personalDetails,
  } = params

  // Resolve effective profile values: prefer personalDetails when present.
  const CURRENT_YEAR = new Date().getFullYear()
  const effectiveSalary = personalDetails?.grossSalaryYear ?? grossSalaryYear
  const effectiveAge = personalDetails
    ? Math.max(0, CURRENT_YEAR - personalDetails.birthYear)
    : defaultProfile.age
  const effectiveRetirementAge = personalDetails?.retirementAge ?? defaultProfile.retirementAge
  const effectiveKv = personalDetails?.publicHealthInsurance ?? defaultProfile.publicHealthInsurance
  const effectiveChildren = personalDetails?.childBirthYears ?? defaultProfile.childBirthYears
  const pensionBaseline = personalDetails?.pensionBaseline ?? 'grv'

  // For non-GRV baselines we skip EP estimation entirely and use the user's
  // manual Versorgungsauskunft figure (Beamtenpension has no EP equivalent;
  // Versorgungswerk EP is plan-specific and not modelled). GRV uses years/EP.
  const ep =
    pensionBaseline === 'grv'
      ? grvDraft.useYearsEstimate
        ? estimateEpFromYears(grvDraft.yearsWorked, effectiveSalary)
        : grvDraft.currentEntgeltpunkte
      : 0
  const manualMonthlyGross =
    pensionBaseline === 'grv'
      ? null
      : personalDetails && personalDetails.manualMonthlyGrossPension > 0
        ? personalDetails.manualMonthlyGrossPension
        : null

  const ageAtContractStart = (contractStartYear: number) =>
    Math.max(0, effectiveAge + contractStartYear - CURRENT_YEAR)
  const riesterInstances = toArray(riesterDraft).map((draft) => {
    const instance = riesterDraftToInstance(draft)
    return {
      ...instance,
      eligibility: {
        ...instance.eligibility,
        ageAtContractStart: ageAtContractStart(draft.contractStartYear),
        careerStarterBonusUsed: draft.contractStartYear < CURRENT_YEAR,
      },
    }
  })
  const avdInstances = toArray(avdDraft).map((draft) => {
    const instance = avdDraftToInstance(draft)
    return {
      ...instance,
      eligibility: {
        ...instance.eligibility,
        ageAtContractStart: ageAtContractStart(draft.contractStartYear),
        careerStarterBonusUsed: draft.contractStartYear < CURRENT_YEAR,
      },
    }
  })

  const assumptionsV2: WorkspaceAssumptionsV2 = {
    bav: toArray(bavDraft).map(bavDraftToInstance),
    etf: toArray(etfDraft).map(etfDraftToInstance),
    insurance: toArray(pavDraft).map(pavDraftToInstance),
    basisrente: toArray(basisrenteDraft).map(basisrenteDraftToInstance),
    altersvorsorgedepot: avdInstances,
    riester: riesterInstances,
    statutoryPension: {
      ...defaultAssumptions.statutoryPension,
      pensionBaselineType: pensionBaseline,
      currentEntgeltpunkte: ep,
      manualMonthlyGross,
    },
    inflationRate: defaultAssumptions.inflationRate,
    retirementEndAge: defaultAssumptions.retirementEndAge,
    returnScenarios: defaultAssumptions.returnScenarios,
    monteCarlo: defaultAssumptions.monteCarlo,
    visibleProducts: [],
  }

  const profile = {
    ...defaultProfile,
    grossSalaryYear: effectiveSalary,
    age: effectiveAge,
    retirementAge: effectiveRetirementAge,
    taxClass: 1 as const,
    publicHealthInsurance: effectiveKv,
    childBirthYears: [...effectiveChildren],
  }

  // Ehegattensplitting: add a minimal partner profile (age = profile age,
  // zero income — the engine uses this to enable Zusammenveranlagung).
  const partner: import('../../domain/profile').PersonalProfile | undefined =
    personalDetails?.ehegattensplitting
      ? { ...defaultProfile, age: effectiveAge, grossSalaryYear: 0 }
      : undefined

  const baseline: Scenario = {
    id: newScenarioId('baseline'),
    label: 'Mein Plan',
    profile,
    ...(partner ? { partner } : {}),
    assumptions: assumptionsV2,
    createdAt: new Date().toISOString(),
    origin: 'baseline',
  }

  return {
    ...defaultWorkspace,
    schemaVersion: 2,
    mode: 'combine',
    baseline,
    whatIfs: [],
    pinnedComparisonIds: [],
  }
}
