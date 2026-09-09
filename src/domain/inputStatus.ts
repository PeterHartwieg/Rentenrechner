/**
 * Input-status metadata — "known, assumed, unknown" at the scenario boundary.
 *
 * Pure, React-free domain module. Phase 1 of the simplification project
 * (`docs/redesign/simplification/notes/state-contract.md` §2).
 *
 * The engine keeps working with plain numbers; this metadata records *how the
 * user supplied* each number so the UI can tell an explicit "weiß ich nicht"
 * apart from a model default and from a typed 0.
 *
 * Semantics (binding):
 *   - `unknown`   — the user explicitly declined to answer. Setting a field to
 *                   `unknown` must not write 0 and must not touch neighbours.
 *   - `assumed`   — a model/default value the user has never reviewed. This is
 *                   also the legacy fallback: absent metadata resolves to
 *                   `assumed`, never `unknown` and never `entered`.
 *   - `entered`   — the user typed it. Numeric **0 is a valid `entered` value**.
 *   - `document`  — read off a document (Renteninformation, PIB, Angebot).
 *
 * Opening a screen must never write metadata; only an explicit user edit or an
 * explicit "weiß ich nicht" click writes.
 */

/** How a single input value came to be. See the module docstring for semantics. */
export type InputStatus = 'unknown' | 'assumed' | 'entered' | 'document'

/**
 * Field-path → status. Per-instance maps are keyed exactly like `evidenceMap`
 * (bare field names); scenario-level maps use the namespaced reserved keys
 * below (`profile.*` / `statutoryPension.*` / `assumptions.*`).
 */
export type InputStatusMap = Record<string, InputStatus>

/**
 * How the user supplied the statutory-pension figure, including the inputs that
 * produced it. Stored so the editor can show what was actually entered instead
 * of guessing from the resulting Entgeltpunkte.
 *
 * - `skipped` — the user postponed the pension step entirely.
 * - `document` — a gross monthly amount from a Renteninformation.
 * - `career` — the rough career estimate (`estimateCareerPension`).
 * - `years` — direct contribution years.
 * - `points` — direct Entgeltpunkte.
 * - `projected-gross` — a manually projected gross monthly pension.
 */
export type PensionEntryMethod =
  | { kind: 'skipped' }
  | { kind: 'document'; monthlyGrossEUR: number }
  | { kind: 'career'; careerStartAge: number; pauseYears: number }
  | { kind: 'years'; contributionYears: number }
  | { kind: 'points'; entgeltpunkte: number }
  | { kind: 'projected-gross'; monthlyGrossEUR: number }

export const INPUT_STATUSES: readonly InputStatus[] = [
  'unknown',
  'assumed',
  'entered',
  'document',
] as const

/**
 * Reserved scenario-level keys for `profile.*`. Exported as a `const` so UI,
 * selectors and exports cannot drift apart on spelling.
 */
export const PROFILE_INPUT_STATUS_KEYS = [
  'profile.age',
  'profile.retirementAge',
  'profile.grossSalaryYear',
  'profile.taxClass',
  'profile.publicHealthInsurance',
  'profile.pkvMonthlyPremium',
  'profile.pPVMonthlyPremium',
  'profile.desiredNetMonthlyPension',
] as const

/** Reserved scenario-level keys for `statutoryPension.*`. */
export const STATUTORY_PENSION_INPUT_STATUS_KEYS = [
  'statutoryPension.pensionBaselineType',
  'statutoryPension.currentEntgeltpunkte',
  'statutoryPension.manualMonthlyGross',
] as const

/**
 * Reserved scenario-level keys for `assumptions.*` — model assumptions that are
 * not profile facts but still need a provenance marker, because the UI shows
 * them in "Angaben & Annahmen prüfen" and must tell a reviewed value apart from
 * a seeded default.
 */
export const ASSUMPTION_INPUT_STATUS_KEYS = ['assumptions.inflationRate'] as const

/** Every reserved scenario-level key. Per-instance maps are NOT restricted. */
export const RESERVED_INPUT_STATUS_KEYS = [
  ...PROFILE_INPUT_STATUS_KEYS,
  ...STATUTORY_PENSION_INPUT_STATUS_KEYS,
  ...ASSUMPTION_INPUT_STATUS_KEYS,
] as const

export type ProfileInputStatusKey = (typeof PROFILE_INPUT_STATUS_KEYS)[number]
export type StatutoryPensionInputStatusKey = (typeof STATUTORY_PENSION_INPUT_STATUS_KEYS)[number]
export type AssumptionInputStatusKey = (typeof ASSUMPTION_INPUT_STATUS_KEYS)[number]
export type ReservedInputStatusKey = (typeof RESERVED_INPUT_STATUS_KEYS)[number]

const RESERVED_KEY_SET: ReadonlySet<string> = new Set(RESERVED_INPUT_STATUS_KEYS)

export function isInputStatus(value: unknown): value is InputStatus {
  return typeof value === 'string' && (INPUT_STATUSES as readonly string[]).includes(value)
}

/**
 * Sanitise a persisted input-status map — never reject.
 *
 * Drops entries whose value is not a known `InputStatus`, and (when
 * `restrictToReservedKeys` is true, the scenario-level case) drops keys outside
 * the reserved set. Returns `undefined` when nothing usable survives, so an
 * absent map and an empty map are indistinguishable downstream.
 *
 * A bad status byte must never discard a user's whole workspace — this follows
 * the transfer-event precedent in `scenarioSchema.ts`.
 */
export function sanitizeInputStatusMap(
  value: unknown,
  options: { restrictToReservedKeys?: boolean } = {},
): InputStatusMap | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: InputStatusMap = {}
  let count = 0
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue
    if (options.restrictToReservedKeys && !RESERVED_KEY_SET.has(key)) continue
    if (!isInputStatus(raw)) continue
    out[key] = raw
    count += 1
  }
  return count > 0 ? out : undefined
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Sanitise a persisted `PensionEntryMethod` — degrades to `undefined` on any
 * shape failure rather than rejecting the surrounding scenario.
 */
export function sanitizePensionEntryMethod(value: unknown): PensionEntryMethod | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const m = value as Record<string, unknown>
  switch (m.kind) {
    case 'skipped':
      return { kind: 'skipped' }
    case 'document':
      return finiteNumber(m.monthlyGrossEUR) && m.monthlyGrossEUR >= 0
        ? { kind: 'document', monthlyGrossEUR: m.monthlyGrossEUR }
        : undefined
    case 'projected-gross':
      return finiteNumber(m.monthlyGrossEUR) && m.monthlyGrossEUR >= 0
        ? { kind: 'projected-gross', monthlyGrossEUR: m.monthlyGrossEUR }
        : undefined
    case 'career':
      return finiteNumber(m.careerStartAge) &&
        m.careerStartAge >= 0 &&
        finiteNumber(m.pauseYears) &&
        m.pauseYears >= 0
        ? { kind: 'career', careerStartAge: m.careerStartAge, pauseYears: m.pauseYears }
        : undefined
    case 'years':
      return finiteNumber(m.contributionYears) && m.contributionYears >= 0
        ? { kind: 'years', contributionYears: m.contributionYears }
        : undefined
    case 'points':
      return finiteNumber(m.entgeltpunkte) && m.entgeltpunkte >= 0
        ? { kind: 'points', entgeltpunkte: m.entgeltpunkte }
        : undefined
    default:
      return undefined
  }
}
