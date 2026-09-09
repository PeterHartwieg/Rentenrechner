/**
 * Onboarding draft state — profile step and pension step.
 *
 * Pure, React-free. Package 2A-mechanical of the simplification project
 * (`docs/redesign/simplification/notes/state-contract.md` §2, §7, §11).
 *
 * The two short onboarding steps ("Über dich", "Deine Rente") and the two
 * editors reachable from the plan all edit the same drafts. A draft holds
 * `Field<T>` values so an explicit "weiß ich nicht" survives as its own state
 * instead of collapsing into 0 or into a silently confirmed default:
 *
 *   - `entered`  — the user typed it. Numeric **0 is a valid entered value**.
 *   - `document` — read off a Renteninformation / Versorgungsauskunft / PIB.
 *   - `assumed`  — a model default the user has never reviewed. This is also
 *                  the legacy fallback for scenarios saved before this
 *                  metadata existed (`resolveInputStatus`).
 *   - `unknown`  — the user explicitly declined. `value` is `null`; the last
 *                  real value is kept in `previousValue` so re-entering the
 *                  field can offer it back, and the *engine* field is left
 *                  untouched on commit (never overwritten with 0).
 *
 * Committing goes through `applyOnboardingToScenario`, which writes the engine
 * fields plus `assumptions.inputStatus` and
 * `assumptions.statutoryPension.pensionEntryMethod`. Nothing here touches
 * storage; the caller passes the returned `Scenario` to `replaceWorkspace` /
 * `setBaseline`.
 */

import type { GermanRules } from '../../domain'
import type { PersonalProfile } from '../../domain/profile'
import type { Scenario, WorkspaceAssumptionsV2 } from '../../domain/workspace'
import type { StatutoryPensionAssumptions, PensionBaselineType } from '../../domain/products/grv'
import type { InputStatus, InputStatusMap, PensionEntryMethod } from '../../domain/inputStatus'
import { resolveInputStatus } from '../results/provenanceHelpers'
import { de2026Rules } from '../../rules/de2026'
import { defaultProfile, defaultAssumptions } from '../../data/defaultScenario'
import { newScenarioId } from '../../app/workspaceIdentity'
import {
  estimateCareerPension,
  estimateEpFromYears,
  type CareerEstimateResult,
} from './inventoryHelpers'

// ---------------------------------------------------------------------------
// Field<T> — a value plus how it came to be, or an explicit unknown
// ---------------------------------------------------------------------------

/** The three statuses a field with a real value can carry. */
export type FieldStatus = Exclude<InputStatus, 'unknown'>

/**
 * A single draft input. Either a real value with provenance, or an explicit
 * unknown that remembers what the value used to be.
 */
export type Field<T> =
  | { value: T; status: FieldStatus }
  | { value: null; status: 'unknown'; previousValue?: T }

/** The user typed this value. `entered(0)` is a real, meaningful 0. */
export function entered<T>(value: T): Field<T> {
  return { value, status: 'entered' }
}

/** The value was read off a document (Renteninformation, Versorgungsauskunft, PIB). */
export function documented<T>(value: T): Field<T> {
  return { value, status: 'document' }
}

/** A model default the user has not reviewed. Also the legacy fallback. */
export function assumed<T>(value: T): Field<T> {
  return { value, status: 'assumed' }
}

/**
 * An explicit "weiß ich nicht". `previousValue` keeps the last real value so
 * the UI can offer it back and so nothing is silently lost.
 *
 * Exported both as `unknownField` (preferred, unambiguous) and as `unknown`
 * (the name the state contract uses).
 */
export function unknownField<T>(previousValue?: T): Field<T> {
  return previousValue === undefined
    ? { value: null, status: 'unknown' }
    : { value: null, status: 'unknown', previousValue }
}

export { unknownField as unknown }

/** Build a field from a value plus an `InputStatus` (the persisted vocabulary). */
export function fieldFromStatus<T>(value: T, status: InputStatus): Field<T> {
  return status === 'unknown' ? unknownField(value) : { value, status }
}

/** `true` when the user explicitly declined to answer. */
export function isUnknown<T>(field: Field<T>): field is { value: null; status: 'unknown'; previousValue?: T } {
  return field.status === 'unknown'
}

/** The current value, or `null` for an explicit unknown. */
export function fieldValue<T>(field: Field<T>): T | null {
  return field.status === 'unknown' ? null : field.value
}

/** The current value, falling back to `fallback` for an explicit unknown. */
export function fieldValueOr<T>(field: Field<T>, fallback: T): T {
  const v = fieldValue(field)
  return v === null ? fallback : v
}

/** The value the user last had here — the live one, or the remembered one. */
export function previousFieldValue<T>(field: Field<T>): T | undefined {
  return field.status === 'unknown' ? field.previousValue : field.value
}

/**
 * Mark a field explicitly unknown, preserving the value it had (or, when it was
 * already unknown, the value it remembered). Pure — neighbouring fields are
 * untouched because the caller replaces exactly one key.
 */
export function setUnknown<T>(field: Field<T>): Field<T> {
  return unknownField(previousFieldValue(field))
}

/**
 * Set a real value. This always clears an explicit unknown — typing `0` is a
 * real answer, not a continuation of "weiß ich nicht".
 */
export function setValue<T>(field: Field<T>, value: T, status: FieldStatus = 'entered'): Field<T> {
  void field
  return { value, status }
}

/** Replace exactly one field of a draft object, leaving every neighbour alone. */
function patchField<D extends object, K extends keyof D>(draft: D, key: K, next: D[K]): D {
  return { ...draft, [key]: next } as D
}

/** Mark exactly one field of a draft object unknown, leaving every neighbour alone. */
export function markFieldUnknown<D extends object, K extends keyof D>(draft: D, key: K): D {
  const current = draft[key] as unknown as Field<unknown>
  return patchField(draft, key, setUnknown(current) as unknown as D[K])
}

/** Set exactly one field of a draft object, leaving every neighbour alone. */
export function setDraftFieldValue<D extends object, K extends keyof D>(
  draft: D,
  key: K,
  value: unknown,
  status: FieldStatus = 'entered',
): D {
  const current = draft[key] as unknown as Field<unknown>
  return patchField(draft, key, setValue(current, value, status) as unknown as D[K])
}

// ---------------------------------------------------------------------------
// Profile draft
// ---------------------------------------------------------------------------

/**
 * UI-only occupation classification. `PersonalProfile` has no occupation field —
 * this exists to pick sensible pension-system defaults and to switch the income
 * label ("Jahreseinkommen brutto" vs "Gewinn vor Steuern pro Jahr"). It is the
 * same engine field (`profile.grossSalaryYear`) either way.
 *
 * Because nothing persists it, `profileDraftFromScenario` reconstructs it from
 * `statutoryPension.pensionBaselineType` and always reports it as `assumed`.
 */
export type EmploymentKind = 'employee' | 'self_employed' | 'civil_servant' | 'other'

/** Mandatory pension system. Mirrors the engine's `PensionBaselineType`. */
export type PensionSystem = PensionBaselineType

/** Retirement health-insurance status (engine: `statutoryPension.retirementHealthStatus`). */
export type RetirementHealthStatusValue = 'kvdr' | 'freiwillig_gkv' | 'pkv'

export const PROFILE_FIELD_KEYS = [
  'age',
  'grossSalaryYear',
  'employment',
  'publicHealthInsurance',
  'pkvMonthlyPremium',
  'pPVMonthlyPremium',
  'retirementAge',
  'desiredNetMonthlyPension',
] as const

export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number]

/**
 * The short "Über dich" step, plus every profile value the two editors must not
 * lose when saving.
 *
 * The last five keys are pass-throughs: they are edited elsewhere
 * (`/eingaben`), carried verbatim, and written back unchanged so editing the
 * onboarding steps never drops them.
 */
export interface ProfileDraft {
  age: Field<number>
  /**
   * `profile.grossSalaryYear`. For `employment === 'self_employed'` the UI
   * label becomes "Gewinn vor Steuern pro Jahr" — the engine field is the same.
   */
  grossSalaryYear: Field<number>
  employment: Field<EmploymentKind>
  publicHealthInsurance: Field<boolean>
  /**
   * `profile.pkvMonthlyPremium` — gross monthly PKV health premium. Consumed by
   * `calculateSalaryResult` (`engine/salary.ts`) for the §257 SGB V subsidy and
   * the net PKV cost. Relevant only when `publicHealthInsurance === false`.
   */
  pkvMonthlyPremium: Field<number>
  /** `profile.pPVMonthlyPremium` — private Pflegeversicherung premium, same path. */
  pPVMonthlyPremium: Field<number>
  retirementAge: Field<number>
  /** `profile.desiredNetMonthlyPension` — optional Wunschrente, in today's euro. */
  desiredNetMonthlyPension: Field<number>

  // --- carried through untouched ---
  taxClass: PersonalProfile['taxClass']
  childBirthYears: number[]
  churchTax: boolean
  healthAdditionalContributionPct: number
  partner?: PersonalProfile
}

/**
 * Pension systems offered for each occupation, most likely first. The first
 * entry is the default; when the list has more than one entry the user chooses.
 *
 * Employees are GRV, civil servants are Beamtenpension. Self-employed people
 * are the genuinely ambiguous case (GRV-pflichtig, Versorgungswerk member, or
 * exempt) and "andere" can be anything.
 */
export const PENSION_SYSTEMS_BY_EMPLOYMENT: Record<EmploymentKind, readonly PensionSystem[]> = {
  employee: ['grv'],
  civil_servant: ['beamtenpension'],
  self_employed: ['grv', 'versorgungswerk', 'none'],
  other: ['grv', 'versorgungswerk', 'beamtenpension', 'none'],
}

/** Default pension system for an occupation (the first offered option). */
export function defaultPensionSystemFor(employment: EmploymentKind): PensionSystem {
  return PENSION_SYSTEMS_BY_EMPLOYMENT[employment][0]
}

/** `true` when the occupation leaves the pension system open to the user. */
export function employmentChoosesPensionSystem(employment: EmploymentKind): boolean {
  return PENSION_SYSTEMS_BY_EMPLOYMENT[employment].length > 1
}

/** Occupation implied by a stored pension system. Used when reconstructing a draft. */
export function employmentFromPensionSystem(system: PensionSystem): EmploymentKind {
  switch (system) {
    case 'beamtenpension':
      return 'civil_servant'
    case 'grv':
      return 'employee'
    case 'versorgungswerk':
    case 'none':
      return 'self_employed'
  }
}

// ---------------------------------------------------------------------------
// Pension draft
// ---------------------------------------------------------------------------

/**
 * How the user supplies the statutory-pension figure. Mirrors
 * `PensionEntryMethod['kind']` one-to-one.
 */
export type PensionMethod = PensionEntryMethod['kind']

export const PENSION_FIELD_KEYS = [
  'monthlyGrossEUR',
  'careerStartAge',
  'pauseYears',
  'contributionYears',
  'entgeltpunkte',
  'versorgungswerkMonthlyContribution',
  'versorgungswerkEmployerMonthly',
  'retirementHealthStatus',
] as const

export type PensionFieldKey = (typeof PENSION_FIELD_KEYS)[number]

/**
 * The short "Deine Rente" step.
 *
 * Every method's raw inputs are kept **simultaneously**, so switching between
 * "Renteninformation liegt vor", "Ohne Unterlagen grob schätzen" and the direct
 * years/points entries never discards what the user already typed. `method`
 * alone decides which of them is committed.
 */
export interface PensionDraft {
  system: PensionSystem
  method: PensionMethod
  /** Shared by `document` and `projected-gross`; `method` keeps them distinct. */
  monthlyGrossEUR: Field<number>
  careerStartAge: Field<number>
  pauseYears: Field<number>
  contributionYears: Field<number>
  entgeltpunkte: Field<number>
  /** Only relevant for `system === 'versorgungswerk'` (§10 Abs. 3 Schicht-1 cap). */
  versorgungswerkMonthlyContribution: Field<number>
  versorgungswerkEmployerMonthly: Field<number>
  retirementHealthStatus: Field<RetirementHealthStatusValue>
}

const GRV_METHODS: readonly PensionMethod[] = [
  'document',
  'career',
  'years',
  'points',
  'projected-gross',
  'skipped',
]

/**
 * Entgeltpunkte only exist in the GRV (and as a GRV-equivalent). Versorgungswerk
 * and Beamtenpension amounts come from the plan's own Versorgungsauskunft, so
 * only the document / projected-gross / skipped paths apply there.
 */
const MANUAL_ONLY_METHODS: readonly PensionMethod[] = ['document', 'projected-gross', 'skipped']

/** The entry methods a pension system supports. */
export function pensionMethodsForSystem(system: PensionSystem): readonly PensionMethod[] {
  switch (system) {
    case 'grv':
      return GRV_METHODS
    case 'versorgungswerk':
    case 'beamtenpension':
      return MANUAL_ONLY_METHODS
    case 'none':
      // "Ich habe keine Pflichtversorgung" is itself the complete answer.
      return []
  }
}

// ---------------------------------------------------------------------------
// Validation — reject, never clip
// ---------------------------------------------------------------------------

export type ProfileDraftErrors = Partial<Record<ProfileFieldKey, string>>
export type PensionDraftErrors = Partial<Record<PensionFieldKey | 'method' | 'system', string>>

/** Youngest plausible age for a first contribution year (Ausbildungsbeginn). */
export const MIN_CAREER_START_AGE = 14
export const MIN_AGE = 18
export const MAX_AGE = 80
/** Upper bound for a planned retirement age. `scenarioSchema` allows 120; the onboarding form is stricter. */
export const MAX_RETIREMENT_AGE = 90

// Bounds below mirror `src/utils/scenarioSchema.ts` so anything this validator
// accepts also survives `validateProfile` / `validateStatutoryPension`.
const MAX_SALARY_YEAR = 1_000_000
const MAX_PKV_PREMIUM = 10_000
const MAX_DESIRED_NET = 100_000
const MAX_MONTHLY_GROSS = 100_000
const MAX_ENTGELTPUNKTE = 200
const MAX_VW_CONTRIBUTION = 10_000

function outOfRange(value: number, min: number, max: number): boolean {
  return !Number.isFinite(value) || value < min || value > max
}

/**
 * Validation options shared by both steps.
 *
 * `requireEntered` is the onboarding-mode switch (lead decision, "Browser
 * verification findings" §2): a first-time user must actually answer the core
 * questions instead of silently confirming the seeded defaults. Edit mode
 * leaves it off, so a stored `assumed` value keeps validating.
 */
export interface OnboardingValidationOptions {
  /**
   * When `true`, core fields still carrying a model default (`assumed`) are
   * rejected with `REQUIRE_ENTERED_MESSAGE`. Defaults to `false`.
   */
  requireEntered?: boolean
}

/** Error text for a core field the user has not answered yet (onboarding mode). */
export const REQUIRE_ENTERED_MESSAGE = 'Bitte eintragen.'

/**
 * `true` when the field still holds a value the user has never supplied — a
 * model default (`assumed`) or an explicit decline (`unknown`). Only `entered`
 * and `document` count as answered.
 */
function isUnanswered(field: Field<unknown>): boolean {
  return field.status === 'assumed' || field.status === 'unknown'
}

/**
 * Validate the profile step. Impossible values are **rejected with a message**,
 * never clipped to the nearest bound — the user has to see what went wrong.
 *
 * Age and retirement age must be answered; everything else may stay explicitly
 * unknown (an unknown PKV premium is what later blocks the household total via
 * `selectResultReadiness`, not what blocks saving).
 *
 * With `requireEntered` (onboarding mode) the two core fields — `age` and
 * `grossSalaryYear` — must additionally carry a real answer: a value still
 * marked `assumed` is a prefilled default nobody looked at, and committing it
 * would produce a plan built on numbers the user never gave.
 */
export function validateProfileDraft(
  draft: ProfileDraft,
  options: OnboardingValidationOptions = {},
): ProfileDraftErrors {
  const errors: ProfileDraftErrors = {}

  const age = fieldValue(draft.age)
  if (age === null) {
    errors.age = 'Bitte gib dein Alter an.'
  } else if (outOfRange(age, MIN_AGE, MAX_AGE)) {
    errors.age = `Bitte gib ein Alter zwischen ${MIN_AGE} und ${MAX_AGE} Jahren an.`
  }

  const retirementAge = fieldValue(draft.retirementAge)
  if (retirementAge === null) {
    errors.retirementAge = 'Bitte gib an, mit welchem Alter du in Rente gehen möchtest.'
  } else if (outOfRange(retirementAge, 0, MAX_RETIREMENT_AGE)) {
    errors.retirementAge = `Der Rentenbeginn darf höchstens bei ${MAX_RETIREMENT_AGE} Jahren liegen.`
  } else if (age !== null && retirementAge <= age) {
    errors.retirementAge = 'Der Rentenbeginn muss nach deinem heutigen Alter liegen.'
  }

  const salary = fieldValue(draft.grossSalaryYear)
  if (salary !== null && outOfRange(salary, 0, MAX_SALARY_YEAR)) {
    errors.grossSalaryYear = 'Bitte gib ein Jahreseinkommen zwischen 0 € und 1.000.000 € an.'
  }

  if (fieldValue(draft.publicHealthInsurance) === false) {
    const kv = fieldValue(draft.pkvMonthlyPremium)
    if (kv !== null && outOfRange(kv, 0, MAX_PKV_PREMIUM)) {
      errors.pkvMonthlyPremium = 'Bitte gib einen Monatsbeitrag zwischen 0 € und 10.000 € an.'
    }
    const pv = fieldValue(draft.pPVMonthlyPremium)
    if (pv !== null && outOfRange(pv, 0, MAX_PKV_PREMIUM)) {
      errors.pPVMonthlyPremium = 'Bitte gib einen Monatsbeitrag zwischen 0 € und 10.000 € an.'
    }
  }

  const desired = fieldValue(draft.desiredNetMonthlyPension)
  if (desired !== null && outOfRange(desired, 0, MAX_DESIRED_NET)) {
    errors.desiredNetMonthlyPension = 'Bitte gib eine Wunschrente zwischen 0 € und 100.000 € an.'
  }

  if (options.requireEntered) {
    // A range error is more specific than "please fill this in" — keep it.
    for (const key of REQUIRED_PROFILE_FIELDS) {
      if (errors[key] === undefined && isUnanswered(draft[key])) {
        errors[key] = REQUIRE_ENTERED_MESSAGE
      }
    }
  }

  return errors
}

/** The profile fields onboarding mode insists on. */
const REQUIRED_PROFILE_FIELDS = ['age', 'grossSalaryYear'] as const satisfies readonly ProfileFieldKey[]

/**
 * The pension fields onboarding mode insists on, per entry method. Methods not
 * listed (`skipped`, and every method under `system === 'none'`) require
 * nothing — postponing is a valid answer.
 */
const REQUIRED_PENSION_FIELDS_BY_METHOD: Record<PensionMethod, readonly PensionFieldKey[]> = {
  document: ['monthlyGrossEUR'],
  'projected-gross': ['monthlyGrossEUR'],
  career: ['careerStartAge'],
  years: ['contributionYears'],
  points: ['entgeltpunkte'],
  skipped: [],
}

/**
 * The pension-draft fields the given system + method actually commit.
 *
 * Every method's raw inputs are kept simultaneously (`PensionDraft`), so a user
 * who tried "Beitragsjahre" and then switched to "Renteninformation" still has
 * the old year count sitting in the draft. Validating it would block saving on
 * a number the commit never reads — that is the bug this exists to prevent.
 *
 * `system === 'none'` and `method === 'skipped'` are complete answers in
 * themselves and therefore have **no** active fields at all.
 */
export function activePensionFields(
  system: PensionSystem,
  method: PensionMethod,
): readonly PensionFieldKey[] {
  if (system === 'none') return []

  // Versorgungswerk contributions belong to the system, not to a method, so
  // they stay active for every method it supports (including `skipped`).
  const systemFields: readonly PensionFieldKey[] =
    system === 'versorgungswerk'
      ? ['versorgungswerkMonthlyContribution', 'versorgungswerkEmployerMonthly']
      : []

  switch (method) {
    case 'document':
    case 'projected-gross':
      return [...systemFields, 'monthlyGrossEUR']
    case 'career':
      return [...systemFields, 'careerStartAge', 'pauseYears']
    case 'years':
      return [...systemFields, 'contributionYears']
    case 'points':
      return [...systemFields, 'entgeltpunkte']
    case 'skipped':
      return systemFields
  }
}

/**
 * Validate the pension step against the profile it belongs to (the career and
 * years bounds are relative to the current age).
 *
 * **Only the active method's inputs are checked** (`activePensionFields`). The
 * draft deliberately keeps every method's raw values so switching back and
 * forth loses nothing; validating the dormant ones would let a stale number in
 * a field the user cannot even see block the save. Switching method therefore
 * surfaces exactly that method's errors, and "Später ergänzen" (`skipped`) as
 * well as `system === 'none'` always validate clean.
 *
 * Each active method still requires its own primary input: a user who does not
 * know the answer picks `skipped` rather than leaving the method's field
 * unknown.
 */
export function validatePensionDraft(
  draft: PensionDraft,
  profile: ProfileDraft,
  options: OnboardingValidationOptions = {},
): PensionDraftErrors {
  const errors: PensionDraftErrors = {}
  const age = fieldValue(profile.age)

  if (draft.system !== 'none') {
    const allowed = pensionMethodsForSystem(draft.system)
    if (!allowed.includes(draft.method)) {
      errors.method = 'Diese Erfassungsart passt nicht zu deiner Altersversorgung.'
    }
  }

  const active = activePensionFields(draft.system, draft.method)
  const isActive = (key: PensionFieldKey) => active.includes(key)

  const gross = isActive('monthlyGrossEUR') ? fieldValue(draft.monthlyGrossEUR) : null
  if (isActive('monthlyGrossEUR')) {
    if (gross !== null && outOfRange(gross, 0, MAX_MONTHLY_GROSS)) {
      errors.monthlyGrossEUR = 'Bitte gib einen Monatsbetrag zwischen 0 € und 100.000 € an.'
    } else if (gross === null) {
      errors.monthlyGrossEUR =
        draft.method === 'document'
          ? 'Bitte trage die Monatsrente aus deiner Renteninformation ein oder wähle „Später ergänzen“.'
          : 'Bitte trage deine geschätzte Monatsrente ein oder wähle „Später ergänzen“.'
    }
  }

  const start = isActive('careerStartAge') ? fieldValue(draft.careerStartAge) : null
  if (isActive('careerStartAge')) {
    if (start === null) {
      errors.careerStartAge = 'Bitte gib an, mit welchem Alter du angefangen hast zu arbeiten.'
    } else {
      const upper = age ?? MAX_AGE
      if (outOfRange(start, MIN_CAREER_START_AGE, upper)) {
        errors.careerStartAge = `Der Berufsstart muss zwischen ${MIN_CAREER_START_AGE} und deinem heutigen Alter liegen.`
      }
    }
  }

  if (isActive('pauseYears')) {
    const pauses = fieldValue(draft.pauseYears)
    if (pauses !== null) {
      const span = age !== null && start !== null ? age - start : null
      if (!Number.isFinite(pauses) || pauses < 0) {
        errors.pauseYears = 'Pausen können nicht negativ sein.'
      } else if (span !== null && span >= 0 && pauses > span) {
        errors.pauseYears = `Deine Pausen sind länger als die ${span} Jahre seit deinem Berufsstart.`
      }
    }
  }

  if (isActive('contributionYears')) {
    const years = fieldValue(draft.contributionYears)
    if (years === null) {
      errors.contributionYears = 'Bitte gib deine bisherigen Beitragsjahre an.'
    } else {
      const upper = age !== null ? Math.max(0, age - MIN_CAREER_START_AGE) : MAX_AGE
      if (outOfRange(years, 0, upper)) {
        errors.contributionYears = `Bitte gib zwischen 0 und ${upper} Beitragsjahre an.`
      }
    }
  }

  if (isActive('entgeltpunkte')) {
    const ep = fieldValue(draft.entgeltpunkte)
    if (ep === null) {
      errors.entgeltpunkte = 'Bitte gib deine bisherigen Entgeltpunkte an.'
    } else if (outOfRange(ep, 0, MAX_ENTGELTPUNKTE)) {
      errors.entgeltpunkte = 'Bitte gib zwischen 0 und 200 Entgeltpunkte an.'
    }
  }

  if (isActive('versorgungswerkMonthlyContribution')) {
    const own = fieldValue(draft.versorgungswerkMonthlyContribution)
    if (own !== null && outOfRange(own, 0, MAX_VW_CONTRIBUTION)) {
      errors.versorgungswerkMonthlyContribution =
        'Bitte gib einen Monatsbeitrag zwischen 0 € und 10.000 € an.'
    }
  }
  if (isActive('versorgungswerkEmployerMonthly')) {
    const employer = fieldValue(draft.versorgungswerkEmployerMonthly)
    if (employer !== null && outOfRange(employer, 0, MAX_VW_CONTRIBUTION)) {
      errors.versorgungswerkEmployerMonthly =
        'Bitte gib einen Monatsbeitrag zwischen 0 € und 10.000 € an.'
    }
  }

  if (options.requireEntered && draft.system !== 'none') {
    for (const key of REQUIRED_PENSION_FIELDS_BY_METHOD[draft.method]) {
      // Only fields the active method actually commits, and never overwriting a
      // more specific message.
      if (!isActive(key)) continue
      if (errors[key] === undefined && isUnanswered(draft[key])) {
        errors[key] = REQUIRE_ENTERED_MESSAGE
      }
    }
  }

  return errors
}

/** `true` when an error map has no entries. */
export function isValid(errors: Record<string, string | undefined>): boolean {
  return Object.keys(errors).length === 0
}

// ---------------------------------------------------------------------------
// Estimation
// ---------------------------------------------------------------------------

export interface PensionEstimateAssumptions {
  durchschnittsentgelt: number
  beitragsbemessungsgrenze: number
  aktuellerRentenwert: number
}

export type PensionDraftEstimate =
  | {
      ok: true
      method: PensionMethod
      /** `null` when the method does not produce a year count (points, document). */
      contributionYears: number | null
      /** `null` when the method does not produce Entgeltpunkte (document, projected-gross). */
      entgeltpunkte: number | null
      monthlyGrossEUR: number
      assumptions: PensionEstimateAssumptions
      /** One German line naming what the estimate assumes. Surfaced on demand. */
      note: string
    }
  | {
      ok: false
      code: CareerEstimateFailure | 'not-estimable' | 'invalid-input'
      message: string
    }

type CareerEstimateFailure = Extract<CareerEstimateResult, { ok: false }>['code']

const CAREER_NOTE =
  'Grobe Arbeitshilfe: gerechnet mit deinem heutigen Bruttoeinkommen für jedes Beitragsjahr. ' +
  'Ausbildungs-, Kindererziehungs-, Pflege- und Arbeitslosigkeitszeiten sind nicht berücksichtigt. ' +
  'Das ersetzt keine Renteninformation der Deutschen Rentenversicherung.'

const POINTS_NOTE =
  'Deine Entgeltpunkte bewertet mit dem heutigen aktuellen Rentenwert. Das ist der bisher ' +
  'erworbene Anspruch, keine Hochrechnung bis zum Rentenbeginn.'

const DOCUMENT_NOTE =
  'Betrag aus deinen Unterlagen. Er wird unverändert übernommen und nicht neu geschätzt.'

const FAILURE_MESSAGES: Record<CareerEstimateFailure, string> = {
  'start-after-now': 'Der Berufsstart muss zwischen 14 und deinem heutigen Alter liegen.',
  'pauses-exceed-career': 'Deine Pausen sind länger als die Zeit seit deinem Berufsstart.',
  'no-salary': 'Für die Schätzung brauchen wir dein Jahreseinkommen brutto.',
}

/**
 * Run the estimate that belongs to the draft's current method.
 *
 * `career` and `years` go through the rules-backed `estimateEpFromYears`
 * (`inventoryHelpers.ts`), which reads `rules.socialSecurity.durchschnittsentgelt`
 * — not the obsolete hardcoded 47.079 €. `points` values the given Entgeltpunkte
 * at today's Rentenwert. `document` / `projected-gross` return the user's own
 * figure unchanged; `skipped` is not estimable.
 */
export function estimateFromPensionDraft(
  draft: PensionDraft,
  profile: ProfileDraft,
  rules: GermanRules = de2026Rules,
): PensionDraftEstimate {
  const assumptions: PensionEstimateAssumptions = {
    durchschnittsentgelt: rules.socialSecurity.durchschnittsentgelt,
    beitragsbemessungsgrenze: rules.socialSecurity.pensionCapYear,
    aktuellerRentenwert: rules.socialSecurity.aktuellerRentenwert,
  }

  if (draft.system === 'none') {
    return { ok: false, code: 'not-estimable', message: 'Ohne Pflichtversorgung gibt es hier nichts zu schätzen.' }
  }

  switch (draft.method) {
    case 'document':
    case 'projected-gross': {
      const gross = fieldValue(draft.monthlyGrossEUR)
      if (gross === null) {
        return { ok: false, code: 'invalid-input', message: 'Es fehlt noch der Monatsbetrag.' }
      }
      return {
        ok: true,
        method: draft.method,
        contributionYears: null,
        entgeltpunkte: null,
        monthlyGrossEUR: gross,
        assumptions,
        note: DOCUMENT_NOTE,
      }
    }
    case 'career': {
      const age = fieldValue(profile.age)
      const start = fieldValue(draft.careerStartAge)
      const salary = fieldValue(profile.grossSalaryYear)
      if (age === null || start === null) {
        return { ok: false, code: 'invalid-input', message: 'Es fehlen noch Alter und Berufsstart.' }
      }
      if (salary === null) {
        return { ok: false, code: 'no-salary', message: FAILURE_MESSAGES['no-salary'] }
      }
      const result = estimateCareerPension(
        {
          currentAge: age,
          careerStartAge: start,
          pauseYears: fieldValueOr(draft.pauseYears, 0),
          grossSalaryYear: salary,
        },
        rules,
      )
      if (!result.ok) {
        return { ok: false, code: result.code, message: FAILURE_MESSAGES[result.code] }
      }
      return {
        ok: true,
        method: 'career',
        contributionYears: result.contributionYears,
        entgeltpunkte: result.entgeltpunkte,
        monthlyGrossEUR: result.monthlyGrossEUR,
        assumptions: result.assumptions,
        note: CAREER_NOTE,
      }
    }
    case 'years': {
      const years = fieldValue(draft.contributionYears)
      const salary = fieldValue(profile.grossSalaryYear)
      if (years === null) {
        return { ok: false, code: 'invalid-input', message: 'Es fehlen noch deine Beitragsjahre.' }
      }
      if (salary === null || salary <= 0) {
        return { ok: false, code: 'no-salary', message: FAILURE_MESSAGES['no-salary'] }
      }
      const ep = estimateEpFromYears(years, salary, rules)
      return {
        ok: true,
        method: 'years',
        contributionYears: years,
        entgeltpunkte: ep,
        monthlyGrossEUR: ep * assumptions.aktuellerRentenwert,
        assumptions,
        note: CAREER_NOTE,
      }
    }
    case 'points': {
      const ep = fieldValue(draft.entgeltpunkte)
      if (ep === null) {
        return { ok: false, code: 'invalid-input', message: 'Es fehlen noch deine Entgeltpunkte.' }
      }
      return {
        ok: true,
        method: 'points',
        contributionYears: null,
        entgeltpunkte: ep,
        monthlyGrossEUR: ep * assumptions.aktuellerRentenwert,
        assumptions,
        note: POINTS_NOTE,
      }
    }
    case 'skipped':
      return {
        ok: false,
        code: 'not-estimable',
        message: 'Die Angaben zu deiner Rente stehen noch aus.',
      }
  }
}

// ---------------------------------------------------------------------------
// Adapters: Scenario → draft
// ---------------------------------------------------------------------------

const KEY_AGE = 'profile.age'
const KEY_RETIREMENT_AGE = 'profile.retirementAge'
const KEY_SALARY = 'profile.grossSalaryYear'
const KEY_PUBLIC_HEALTH = 'profile.publicHealthInsurance'
const KEY_PKV = 'profile.pkvMonthlyPremium'
const KEY_PPV = 'profile.pPVMonthlyPremium'
const KEY_DESIRED = 'profile.desiredNetMonthlyPension'
const KEY_BASELINE_TYPE = 'statutoryPension.pensionBaselineType'
const KEY_EP = 'statutoryPension.currentEntgeltpunkte'
const KEY_MANUAL_GROSS = 'statutoryPension.manualMonthlyGross'
/** Reserved assumption key; `applyOnboardingToScenario` never rewrites it. */
const KEY_INFLATION_RATE = 'assumptions.inflationRate'

/**
 * Read the persisted status for a scenario-level key.
 *
 * Legacy-conservative by construction: `resolveInputStatus` maps an absent
 * entry to `'assumed'` — never to `'unknown'` and never to `'entered'`. Opening
 * an editor therefore neither confirms defaults nor invents an unknown.
 */
function statusOf(map: InputStatusMap | undefined, key: string): InputStatus {
  return resolveInputStatus(map, undefined, key)
}

/** Build the profile draft from a scenario. Values are preserved verbatim. */
export function profileDraftFromScenario(scenario: Scenario): ProfileDraft {
  const p = scenario.profile
  const map = scenario.assumptions.inputStatus
  const system: PensionSystem = scenario.assumptions.statutoryPension.pensionBaselineType ?? 'grv'

  return {
    age: fieldFromStatus(p.age, statusOf(map, KEY_AGE)),
    grossSalaryYear: fieldFromStatus(p.grossSalaryYear, statusOf(map, KEY_SALARY)),
    // Occupation is not persisted (no `PersonalProfile` field); it is
    // reconstructed from the pension system and therefore always 'assumed'.
    employment: assumed(employmentFromPensionSystem(system)),
    publicHealthInsurance: fieldFromStatus(
      p.publicHealthInsurance,
      statusOf(map, KEY_PUBLIC_HEALTH),
    ),
    pkvMonthlyPremium: fieldFromStatus(p.pkvMonthlyPremium, statusOf(map, KEY_PKV)),
    pPVMonthlyPremium: fieldFromStatus(p.pPVMonthlyPremium, statusOf(map, KEY_PPV)),
    retirementAge: fieldFromStatus(p.retirementAge, statusOf(map, KEY_RETIREMENT_AGE)),
    desiredNetMonthlyPension: fieldFromStatus(
      p.desiredNetMonthlyPension ?? 0,
      statusOf(map, KEY_DESIRED),
    ),
    taxClass: p.taxClass,
    childBirthYears: [...p.childBirthYears],
    churchTax: p.churchTax,
    healthAdditionalContributionPct: p.healthAdditionalContributionPct,
    partner: scenario.partner,
  }
}

/** Default career start offered when nothing was recorded. */
const DEFAULT_CAREER_START_AGE = 20

/**
 * Build the pension draft from a scenario.
 *
 * When `pensionEntryMethod` is present it reconstructs the method *and* its
 * source inputs. When it is absent (legacy data) the method is inferred
 * conservatively from the engine fields — a manual gross amount means
 * `projected-gross`, otherwise `points` — and every value keeps its own
 * resolved status (`assumed` for legacy data). Nothing is upgraded to
 * `entered`, and nothing is downgraded to `unknown`.
 */
export function pensionDraftFromScenario(scenario: Scenario): PensionDraft {
  const sp = scenario.assumptions.statutoryPension
  const map = scenario.assumptions.inputStatus
  const system: PensionSystem = sp.pensionBaselineType ?? 'grv'
  const method = sp.pensionEntryMethod
  const manualGross = sp.manualMonthlyGross

  const epStatus = statusOf(map, KEY_EP)
  const grossStatus = statusOf(map, KEY_MANUAL_GROSS)

  let resolvedMethod: PensionMethod
  if (method) resolvedMethod = method.kind
  else if (system === 'none') resolvedMethod = 'skipped'
  else if (manualGross !== null && manualGross !== undefined) resolvedMethod = 'projected-gross'
  else resolvedMethod = 'points'

  const careerStart =
    method?.kind === 'career'
      ? fieldFromStatus(method.careerStartAge, 'entered')
      : assumed(DEFAULT_CAREER_START_AGE)
  const pauseYears =
    method?.kind === 'career' ? fieldFromStatus(method.pauseYears, 'entered') : assumed(0)
  const contributionYears =
    method?.kind === 'career'
      ? assumed(Math.max(0, scenario.profile.age - method.careerStartAge - method.pauseYears))
      : method?.kind === 'years'
        ? fieldFromStatus(method.contributionYears, 'entered')
        : assumed(0)
  const grossSeed =
    manualGross ??
    (method?.kind === 'document' || method?.kind === 'projected-gross'
      ? method.monthlyGrossEUR
      : 0)

  return {
    system,
    method: resolvedMethod,
    monthlyGrossEUR: fieldFromStatus(grossSeed, grossStatus),
    careerStartAge: careerStart,
    pauseYears,
    contributionYears,
    entgeltpunkte: fieldFromStatus(sp.currentEntgeltpunkte, epStatus),
    // No reserved scenario-level status key exists for these three, so they are
    // always read back as 'assumed'. (`sanitizeInputStatusMap` drops
    // non-reserved scenario-level keys, so persisting one would not survive.)
    versorgungswerkMonthlyContribution: assumed(sp.versorgungswerkMonthlyContribution ?? 0),
    versorgungswerkEmployerMonthly: assumed(sp.versorgungswerkEmployerMonthly ?? 0),
    retirementHealthStatus: assumed(sp.retirementHealthStatus ?? 'kvdr'),
  }
}

// ---------------------------------------------------------------------------
// Adapter: drafts → Scenario
// ---------------------------------------------------------------------------

/**
 * Write a numeric/boolean field onto an engine object.
 *
 * An explicit unknown leaves the engine value exactly as it was (never 0) and
 * records `'unknown'` in the status map. Everything else writes the value and
 * the field's own status.
 */
function applyField<T>(
  field: Field<T>,
  current: T,
  key: string,
  status: InputStatusMap,
): T {
  if (field.status === 'unknown') {
    status[key] = 'unknown'
    return current
  }
  status[key] = field.status
  return field.value
}

/**
 * Commit both drafts onto a scenario.
 *
 * Writes the profile fields, the statutory-pension engine fields,
 * `pensionEntryMethod`, and `assumptions.inputStatus` (reserved keys only).
 * Pure — the input scenario is not mutated.
 *
 * Invariants:
 *   - An explicit unknown never writes 0 into an engine field; the previous
 *     engine value (or its default) stays put and the status becomes `unknown`.
 *   - `system === 'none'` writes `pensionBaselineType: 'none'` as `entered`,
 *     carries **no** `pensionEntryMethod`, and clears any stale statutory
 *     status (so a previous "Später ergänzen" cannot keep blocking the total).
 *   - `method === 'skipped'` writes `{ kind: 'skipped' }` and marks both
 *     statutory keys `unknown`, leaving the engine values untouched.
 *   - `career` seeds `currentEntgeltpunkte` from the rules-backed estimate and
 *     marks it `assumed` (state contract §7); `years` does the same from the
 *     entered year count. `points` writes the Entgeltpunkte the user gave, and
 *     `document` / `projected-gross` write `manualMonthlyGross` — the three
 *     keep their distinct meanings via `pensionEntryMethod`.
 */
export function applyOnboardingToScenario(
  scenario: Scenario,
  profileDraft: ProfileDraft,
  pensionDraft: PensionDraft,
  rules: GermanRules = de2026Rules,
): Scenario {
  const status: InputStatusMap = { ...(scenario.assumptions.inputStatus ?? {}) }
  const prev = scenario.profile

  const profile: PersonalProfile = {
    ...prev,
    age: applyField(profileDraft.age, prev.age, KEY_AGE, status),
    retirementAge: applyField(
      profileDraft.retirementAge,
      prev.retirementAge,
      KEY_RETIREMENT_AGE,
      status,
    ),
    grossSalaryYear: applyField(
      profileDraft.grossSalaryYear,
      prev.grossSalaryYear,
      KEY_SALARY,
      status,
    ),
    publicHealthInsurance: applyField(
      profileDraft.publicHealthInsurance,
      prev.publicHealthInsurance,
      KEY_PUBLIC_HEALTH,
      status,
    ),
    pkvMonthlyPremium: applyField(
      profileDraft.pkvMonthlyPremium,
      prev.pkvMonthlyPremium,
      KEY_PKV,
      status,
    ),
    pPVMonthlyPremium: applyField(
      profileDraft.pPVMonthlyPremium,
      prev.pPVMonthlyPremium,
      KEY_PPV,
      status,
    ),
    desiredNetMonthlyPension: applyField(
      profileDraft.desiredNetMonthlyPension,
      prev.desiredNetMonthlyPension ?? 0,
      KEY_DESIRED,
      status,
    ),
    // Pass-throughs — carried so editing the short steps never drops them.
    taxClass: profileDraft.taxClass,
    childBirthYears: [...profileDraft.childBirthYears],
    churchTax: profileDraft.churchTax,
    healthAdditionalContributionPct: profileDraft.healthAdditionalContributionPct,
  }

  const statutoryPension = applyPensionDraft(
    scenario.assumptions.statutoryPension,
    pensionDraft,
    profileDraft,
    status,
    rules,
  )

  const assumptions: WorkspaceAssumptionsV2 = {
    ...scenario.assumptions,
    statutoryPension,
    inputStatus: status,
  }

  const next: Scenario = {
    ...scenario,
    profile,
    assumptions,
  }
  if (profileDraft.partner) next.partner = profileDraft.partner
  else delete next.partner
  return next
}

function applyPensionDraft(
  prev: StatutoryPensionAssumptions,
  draft: PensionDraft,
  profileDraft: ProfileDraft,
  status: InputStatusMap,
  rules: GermanRules,
): StatutoryPensionAssumptions {
  const next: StatutoryPensionAssumptions = { ...prev }
  next.pensionBaselineType = draft.system
  status[KEY_BASELINE_TYPE] = 'entered'

  // Rebuild the two statutory statuses from scratch on every commit so a stale
  // 'unknown' from an earlier "Später ergänzen" cannot survive a real answer.
  delete status[KEY_EP]
  delete status[KEY_MANUAL_GROSS]
  delete next.pensionEntryMethod

  if (draft.system === 'versorgungswerk') {
    next.versorgungswerkMonthlyContribution = fieldValueOr(
      draft.versorgungswerkMonthlyContribution,
      prev.versorgungswerkMonthlyContribution ?? 0,
    )
    next.versorgungswerkEmployerMonthly = fieldValueOr(
      draft.versorgungswerkEmployerMonthly,
      prev.versorgungswerkEmployerMonthly ?? 0,
    )
  }
  next.retirementHealthStatus = fieldValueOr(
    draft.retirementHealthStatus,
    prev.retirementHealthStatus ?? 'kvdr',
  )

  // "Keine Pflichtversorgung" is a complete answer, not a missing one.
  if (draft.system === 'none') return next

  switch (draft.method) {
    case 'skipped': {
      next.pensionEntryMethod = { kind: 'skipped' }
      status[KEY_EP] = 'unknown'
      status[KEY_MANUAL_GROSS] = 'unknown'
      return next
    }
    case 'document':
    case 'projected-gross': {
      const gross = fieldValue(draft.monthlyGrossEUR)
      if (gross === null) {
        // Defensive: `validatePensionDraft` rejects this, so a caller can only
        // reach it by bypassing validation. Treat it like a skip.
        next.pensionEntryMethod = { kind: 'skipped' }
        status[KEY_EP] = 'unknown'
        status[KEY_MANUAL_GROSS] = 'unknown'
        return next
      }
      next.manualMonthlyGross = gross
      next.pensionEntryMethod = { kind: draft.method, monthlyGrossEUR: gross }
      status[KEY_MANUAL_GROSS] =
        draft.method === 'document' ? 'document' : statusOfField(draft.monthlyGrossEUR)
      return next
    }
    case 'career': {
      const start = fieldValue(draft.careerStartAge)
      const pauses = fieldValueOr(draft.pauseYears, 0)
      const age = fieldValue(profileDraft.age)
      const salary = fieldValue(profileDraft.grossSalaryYear)
      next.pensionEntryMethod = {
        kind: 'career',
        careerStartAge: start ?? 0,
        pauseYears: pauses,
      }
      // EP-based estimation only; a stale manual override would silently win.
      next.manualMonthlyGross = null
      if (start !== null && age !== null && salary !== null) {
        const result = estimateCareerPension(
          { currentAge: age, careerStartAge: start, pauseYears: pauses, grossSalaryYear: salary },
          rules,
        )
        if (result.ok) next.currentEntgeltpunkte = result.entgeltpunkte
      }
      // A career estimate is a model estimate, never a confirmed figure (§7).
      status[KEY_EP] = 'assumed'
      return next
    }
    case 'years': {
      const years = fieldValue(draft.contributionYears)
      const salary = fieldValue(profileDraft.grossSalaryYear)
      next.pensionEntryMethod = { kind: 'years', contributionYears: years ?? 0 }
      next.manualMonthlyGross = null
      if (years !== null && salary !== null) {
        next.currentEntgeltpunkte = estimateEpFromYears(years, salary, rules)
      }
      // The years are entered; the resulting Entgeltpunkte are still derived.
      status[KEY_EP] = 'assumed'
      return next
    }
    case 'points': {
      const ep = fieldValue(draft.entgeltpunkte)
      next.pensionEntryMethod = { kind: 'points', entgeltpunkte: ep ?? prev.currentEntgeltpunkte }
      next.manualMonthlyGross = null
      if (ep !== null) next.currentEntgeltpunkte = ep
      status[KEY_EP] = ep === null ? 'unknown' : statusOfField(draft.entgeltpunkte)
      return next
    }
  }
}

function statusOfField<T>(field: Field<T>): InputStatus {
  return field.status
}

// ---------------------------------------------------------------------------
// Fresh scenario
// ---------------------------------------------------------------------------

/**
 * Inflation a fresh plan starts from, as a decimal (2 % p.a.).
 *
 * The compare defaults use 0, which would make "in heutigen Euro" identical to
 * the nominal figure and quietly overstate every long-horizon result. A fresh
 * plan therefore seeds a real assumption and marks it `assumed`, so the
 * "Angaben & Annahmen prüfen" disclosure can show it as a model value the user
 * has not reviewed.
 */
export const FRESH_ONBOARDING_INFLATION_RATE = 0.02

/**
 * A scenario for a first-time user: the existing defaults, no contracts, and
 * **nothing marked entered**. Every profile and pension field resolves to
 * `'assumed'` — opening the wizard confirms nothing. The one seeded status is
 * `assumptions.inflationRate`, which is explicitly an assumption, not an answer.
 */
export function createFreshOnboardingScenario(now: Date = new Date()): Scenario {
  return {
    id: newScenarioId('baseline'),
    label: 'Mein Plan',
    profile: { ...defaultProfile, childBirthYears: [] },
    assumptions: {
      bav: [],
      etf: [],
      insurance: [],
      basisrente: [],
      altersvorsorgedepot: [],
      riester: [],
      statutoryPension: { ...defaultAssumptions.statutoryPension },
      inflationRate: FRESH_ONBOARDING_INFLATION_RATE,
      retirementEndAge: defaultAssumptions.retirementEndAge,
      returnScenarios: defaultAssumptions.returnScenarios.map((s) => ({ ...s })),
      monteCarlo: { ...defaultAssumptions.monteCarlo },
      visibleProducts: [],
      inputStatus: { [KEY_INFLATION_RATE]: 'assumed' },
    },
    createdAt: now.toISOString(),
    origin: 'baseline',
  }
}
