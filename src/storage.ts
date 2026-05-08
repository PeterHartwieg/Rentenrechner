import type { PersonalProfile, ScenarioAssumptions } from './domain'
import type { Workspace, WorkspaceAssumptionsV2, Scenario } from './domain/workspace'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
  TransferEvent,
} from './domain/instances'
import { defaultAssumptions, defaultProfile, DEFAULT_EQUAL_INPUT_AMOUNT_EUR } from './data/defaultScenario'
import { validateState, validateWorkspace } from './utils/scenarioSchema'
import { singletonViewOfWorkspace } from './engine/portfolioProjection'
import { STORAGE_KEY_V1, STORAGE_KEY_V2 } from './storageKeys'

// ---------------------------------------------------------------------------
// Storage keys
//
// Two localStorage keys coexist during the v1→v2 transition:
//   STORAGE_KEY_V1  — legacy compare-mode write path (useCalculatorState).
//                     Single { version: 1, profile, assumptions } envelope.
//   STORAGE_KEY_V2  — workspace write path (portfolioState / saveWorkspace).
//                     Full Workspace object with schemaVersion: 2.
//
// Read order: both loadSavedState and loadSavedWorkspace prefer STORAGE_KEY_V2,
// then fall back to STORAGE_KEY_V1 with v1→v2 migration applied.
//
// The compare-mode writer (useCalculatorState) still writes to STORAGE_KEY_V1.
// useCalculatorState must be updated to call saveWorkspace() and removed from
// the v1 write path once the full workspace edit-flow is complete.
// ---------------------------------------------------------------------------
// `STORAGE_KEY_V1` / `STORAGE_KEY_V2` live in `./storageKeys.ts` so that
// `useRoute.detectSavedMode` (called from the initial-paint code path of
// every route) doesn't have to import this module. The original constants
// are re-exported below to keep existing callers unchanged.
export { STORAGE_KEY_V1, STORAGE_KEY_V2 }

/**
 * Alias for the legacy write key. Kept for callers that reference STORAGE_KEY
 * directly (e.g. DatenschutzPage). New code should use STORAGE_KEY_V1 or
 * STORAGE_KEY_V2 explicitly.
 */
export const STORAGE_KEY = STORAGE_KEY_V1

const CURRENT_VERSION_V1 = 1
const CURRENT_VERSION_V2 = 2

// ---------------------------------------------------------------------------
// mergeDeep — recursive merge of saved data into defaults.
// Preserves explicit empty arrays (user clearing visibleProducts, instance arrays, etc.)
// ---------------------------------------------------------------------------

// Recursively merge `saved` into `defaults`: primitives and arrays use the saved
// value when the type matches; object fields recurse; missing keys keep the default.
// Empty saved arrays are preserved (the user can explicitly clear, e.g.,
// visibleProducts or childBirthYears). Arrays that genuinely require a non-empty
// fallback — currently only returnScenarios — are normalized in
// applyPreMergeMigrations before mergeDeep runs.
function mergeDeep<T>(saved: unknown, defaults: T): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(saved) ? saved : defaults) as T
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults
  const result = { ...(defaults as object) } as Record<string, unknown>
  const savedObj = saved as Record<string, unknown>
  for (const key of Object.keys(defaults as object)) {
    const savedVal = savedObj[key]
    if (savedVal === undefined || savedVal === null) continue
    const defaultVal = (defaults as Record<string, unknown>)[key]
    if (defaultVal !== null && typeof defaultVal === 'object' && !Array.isArray(defaultVal)) {
      result[key] = mergeDeep(savedVal, defaultVal)
    } else if (typeof savedVal === typeof defaultVal) {
      result[key] = savedVal
    }
    // type mismatch → keep default
  }
  return result as T
}

// ---------------------------------------------------------------------------
// Pre/post-merge migrations for v1 singleton assumptions
// ---------------------------------------------------------------------------

/**
 * Apply pre-merge field migrations on a mutable assumptions object. Migrations
 * here run *before* mergeDeep so the user's saved value survives instead of
 * being clobbered by the default. Idempotent for already-current shapes.
 */
function applyPreMergeMigrations(rawAssumptions: Record<string, unknown>): void {
  // #55: migrate annualAssetFee → wrapperAssetFee + fundAssetFee
  const migrateFeesFields = (productData: Record<string, unknown> | undefined) => {
    const fees = productData?.fees as Record<string, unknown> | undefined
    if (fees && typeof fees.annualAssetFee === 'number' && fees.wrapperAssetFee === undefined) {
      fees.wrapperAssetFee = fees.annualAssetFee
      fees.fundAssetFee = 0
    }
  }
  migrateFeesFields(rawAssumptions.bav as Record<string, unknown> | undefined)
  migrateFeesFields(rawAssumptions.insurance as Record<string, unknown> | undefined)

  // Group E step 3: Basisrente zeitrente → leibrente (legal compliance).
  const rawBasisrente = rawAssumptions.basisrente as Record<string, unknown> | undefined
  if (rawBasisrente?.payoutMode === 'zeitrente') {
    rawBasisrente.payoutMode = 'leibrente'
  }

  // Lock canonical baseline return scenarios; preserve custom row.
  const rawScenarios = rawAssumptions.returnScenarios
  if (Array.isArray(rawScenarios)) {
    const customRow = rawScenarios.find(
      (s): s is { id: 'custom'; label: string; annualReturn: number } =>
        !!s && typeof s === 'object' && (s as { id?: unknown }).id === 'custom',
    )
    rawAssumptions.returnScenarios = customRow
      ? [...defaultAssumptions.returnScenarios, customRow]
      : [...defaultAssumptions.returnScenarios]
  }
}

/**
 * Apply post-merge migrations that read raw legacy keys (only present in
 * pre-#51 saves) and copy them onto the current schema fields if they were
 * left at their defaults.
 */
function applyPostMergeMigrations(
  rawAssumptions: Record<string, unknown>,
  merged: ScenarioAssumptions,
): void {
  // Old saves may contain compareSubMode: 'equal_cash'. Preserve the field
  // so share-URL round-trips don't lose it, but clear the paired equalInputAmountEUR
  // so the load path treats this state as a plain Netto-Belastung scenario
  // (resolveNettoBelastungTarget falls back to bAV net cost for these saves).
  if (rawAssumptions.compareSubMode === 'equal_cash') {
    merged.compareSubMode = 'equal_cash'
    merged.equalInputAmountEUR = undefined
  }

  const savedBav = rawAssumptions.bav as Record<string, unknown> | undefined
  if (!savedBav) return
  if (
    typeof savedBav.extraEmployerContributionPct === 'number' &&
    merged.bav.contractualMatchPercent === defaultAssumptions.bav.contractualMatchPercent
  ) {
    merged.bav.contractualMatchPercent = savedBav.extraEmployerContributionPct
  }
  if (
    typeof savedBav.extraEmployerContributionMonthly === 'number' &&
    merged.bav.contractualFixedMonthly === defaultAssumptions.bav.contractualFixedMonthly
  ) {
    merged.bav.contractualFixedMonthly = savedBav.extraEmployerContributionMonthly
  }
}

// ---------------------------------------------------------------------------
// V2 defaults — empty instance arrays so mergeDeep preserves them correctly
// ---------------------------------------------------------------------------

/**
 * Default v2 workspace used as the merge target in parseStateFromJson.
 * Instance arrays are empty by default — mergeDeep preserves explicit empty
 * arrays (invariant: user clearing a product slot must survive reload).
 * returnScenarios is populated from defaultAssumptions so there is always
 * at least one scenario available.
 */
export const defaultWorkspace: Workspace = {
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
      // Carry forward the legacy compareSubMode field so old saved states round-trip
      // safely. The public UI no longer exposes this field; only equalInputAmountEUR
      // is the authoritative public Netto-Belastung anchor.
      compareSubMode: defaultAssumptions.compareSubMode ?? 'equal_cash',
      equalInputAmountEUR: defaultAssumptions.equalInputAmountEUR ?? DEFAULT_EQUAL_INPUT_AMOUNT_EUR,
    },
    createdAt: new Date(0).toISOString(),
    origin: 'baseline',
  },
  whatIfs: [],
  pinnedComparisonIds: [],
}

// ---------------------------------------------------------------------------
// V1 → V2 migration
// ---------------------------------------------------------------------------

/**
 * Detection rule for length-0 vs length-1 instance migration:
 * A singleton migrates to length-1 only if it has a non-zero monthly contribution,
 * non-zero current value, or non-zero employer match — i.e. the product is "in use".
 * If everything is at default-zero, migrate to length-0 (product not set up).
 * When in doubt (e.g. non-trivial fee customization only), prefer length-1 (reversible).
 */
function isBavMeaningful(bav: Record<string, unknown>): boolean {
  const monthlyGross = bav.monthlyGrossConversion as number | undefined
  const fixedEmployer = bav.contractualFixedMonthly as number | undefined
  const matchPct = bav.contractualMatchPercent as number | undefined
  return (
    (typeof monthlyGross === 'number' && monthlyGross > 0) ||
    (typeof fixedEmployer === 'number' && fixedEmployer > 0) ||
    (typeof matchPct === 'number' && matchPct > 0)
  )
}

function isEtfMeaningful(): boolean {
  // ETF has no monthly contribution field in the singleton shape — the contribution
  // is driven by bAV net cost (fair-comparison invariant). ETF is always meaningful
  // when explicitly present in a v1 save, so always migrate to length-1.
  // This is consistent with prefer-length-1 (reversible).
  return true
}

function isInsuranceMeaningful(): boolean {
  // Same reasoning as ETF — the pAV contribution is driven by bAV net cost.
  // Always migrate to length-1.
  return true
}

function isBasisrenteMeaningful(basisrente: Record<string, unknown>): boolean {
  const monthly = basisrente.monthlyGrossContribution as number | undefined
  return typeof monthly === 'number' && monthly > 0
}

function isAltersvorsorgedepotMeaningful(avd: Record<string, unknown>): boolean {
  const monthly = avd.monthlyOwnContribution as number | undefined
  return typeof monthly === 'number' && monthly > 0
}

function isRiesterMeaningful(riester: Record<string, unknown>): boolean {
  const monthly = riester.monthlyOwnContribution as number | undefined
  const existing = riester.existingCapital as number | undefined
  return (
    (typeof monthly === 'number' && monthly > 0) ||
    (typeof existing === 'number' && existing > 0)
  )
}

/**
 * Migrate a v1 (singleton-shaped) parsed state object to a v2 Workspace.
 * Runs the standard v1 field migrations first, then wraps each product singleton
 * in a length-0 or length-1 instance array depending on whether the product
 * was meaningfully configured.
 *
 * Each migrated instance gets:
 * - instanceId: "${productId}-singleton" (deterministic for share-URL stability)
 * - evidenceMap: {} (empty — legacy values treated as model_estimate per Plan §2.4)
 * - status: 'active'
 * - contractStartYear: current year (approximation; user can correct via UI)
 */
export function migrateV1ToV2(
  rawProfile: Record<string, unknown>,
  rawAssumptions: Record<string, unknown>,
): Workspace {
  // Apply v1 field migrations first (annualAssetFee, Basisrente zeitrente, returnScenarios).
  const assumptionsCopy = { ...rawAssumptions }
  applyPreMergeMigrations(assumptionsCopy)

  // Merge against v1 defaults to fill in any missing fields.
  const profile = mergeDeep(rawProfile, defaultProfile)
  const merged = mergeDeep(assumptionsCopy, defaultAssumptions)
  applyPostMergeMigrations(rawAssumptions, merged)

  const currentYear = new Date().getFullYear()

  const rawBav = assumptionsCopy.bav as Record<string, unknown> | undefined
  const rawEtf = assumptionsCopy.etf as Record<string, unknown> | undefined
  const rawInsurance = assumptionsCopy.insurance as Record<string, unknown> | undefined
  const rawBasisrente = assumptionsCopy.basisrente as Record<string, unknown> | undefined
  const rawAvd = assumptionsCopy.altersvorsorgedepot as Record<string, unknown> | undefined
  const rawRiester = assumptionsCopy.riester as Record<string, unknown> | undefined

  const bavInstances: BavInstance[] = rawBav && isBavMeaningful(rawBav)
    ? [
        {
          instanceId: 'bav-singleton',
          label: 'bAV',
          status: 'active',
          contractStartYear: currentYear,
          evidenceMap: {},
          ...merged.bav,
        } as BavInstance,
      ]
    : []

  const etfInstances: EtfInstance[] = rawEtf && isEtfMeaningful()
    ? [
        {
          instanceId: 'etf-singleton',
          label: 'ETF-Depot',
          status: 'active',
          contractStartYear: currentYear,
          evidenceMap: {},
          ...merged.etf,
        } as EtfInstance,
      ]
    : []

  const insuranceInstances: InsuranceInstance[] = rawInsurance && isInsuranceMeaningful()
    ? [
        {
          // Spread merged.insurance first so InstanceCommon fields after it win.
          // Insurance contractStartYear comes from the assumptions (vintage-aware tax routing).
          ...merged.insurance,
          instanceId: 'versicherung-singleton',
          label: 'Private Rentenversicherung',
          status: 'active' as const,
          // contractStartYear from merged.insurance is authoritative (vintage matters for tax mode).
          contractStartYear: merged.insurance.contractStartYear ?? currentYear,
          evidenceMap: {},
        } as InsuranceInstance,
      ]
    : []

  const basisrenteInstances: BasisrenteInstance[] = rawBasisrente && isBasisrenteMeaningful(rawBasisrente)
    ? [
        {
          instanceId: 'basisrente-singleton',
          label: 'Basisrente',
          status: 'active',
          contractStartYear: currentYear,
          evidenceMap: {},
          ...merged.basisrente,
        } as BasisrenteInstance,
      ]
    : []

  const avdInstances: AltersvorsorgedepotInstance[] = rawAvd && isAltersvorsorgedepotMeaningful(rawAvd)
    ? [
        {
          instanceId: 'altersvorsorgedepot-singleton',
          label: 'Altersvorsorgedepot',
          status: 'active',
          contractStartYear: currentYear,
          evidenceMap: {},
          ...merged.altersvorsorgedepot,
        } as AltersvorsorgedepotInstance,
      ]
    : []

  const riesterInstances: RiesterInstance[] = rawRiester && isRiesterMeaningful(rawRiester)
    ? [
        {
          instanceId: 'riester-singleton',
          label: 'Riester-Rente',
          status: 'active',
          contractStartYear: currentYear,
          evidenceMap: {},
          ...merged.riester,
        } as RiesterInstance,
      ]
    : []

  const assumptionsV2: WorkspaceAssumptionsV2 = {
    bav: bavInstances,
    etf: etfInstances,
    insurance: insuranceInstances,
    basisrente: basisrenteInstances,
    altersvorsorgedepot: avdInstances,
    riester: riesterInstances,
    statutoryPension: merged.statutoryPension,
    inflationRate: merged.inflationRate,
    retirementEndAge: merged.retirementEndAge,
    returnScenarios: merged.returnScenarios,
    monteCarlo: merged.monteCarlo,
    visibleProducts: merged.visibleProducts,
    // Carry forward legacy compareSubMode for safe round-trip of old v1 saves.
    // New state uses equalInputAmountEUR as the single public Netto-Belastung anchor.
    compareSubMode: merged.compareSubMode ?? 'equal_cash',
    equalInputAmountEUR: merged.equalInputAmountEUR ?? DEFAULT_EQUAL_INPUT_AMOUNT_EUR,
  }

  const baseline: Scenario = {
    id: 'baseline-migrated',
    label: 'Mein Plan',
    profile,
    assumptions: assumptionsV2,
    createdAt: new Date().toISOString(),
    origin: 'baseline',
  }

  return {
    schemaVersion: 2,
    mode: 'compare',
    baseline,
    whatIfs: [],
    pinnedComparisonIds: [],
  }
}

// ---------------------------------------------------------------------------
// Singleton view of a workspace (compare-mode bridge to the legacy engine path)
// ---------------------------------------------------------------------------

/**
 * Project a v2 Workspace down to a singleton-shaped ScenarioAssumptions for
 * compare-mode rendering. Wraps `singletonViewOfWorkspace` from the
 * PortfolioAdapter (issue 03), passing the canonical default assumptions for
 * any length-0 product slots.
 *
 * Replaces the M1 stop-gap `extractSingletonAssumptions`. The legacy compare-
 * mode singleton API now flows through the PortfolioAdapter projection so a
 * single code path drives both compare and combine modes.
 */
function workspaceToSingletonAssumptions(workspace: Workspace): ScenarioAssumptions {
  return singletonViewOfWorkspace(workspace, {
    bav: defaultAssumptions.bav,
    etf: defaultAssumptions.etf,
    insurance: defaultAssumptions.insurance,
    basisrente: defaultAssumptions.basisrente,
    altersvorsorgedepot: defaultAssumptions.altersvorsorgedepot,
    riester: defaultAssumptions.riester,
  })
}

// ---------------------------------------------------------------------------
// Shared migrate+validate pipeline (used by both main state and scenario library)
// ---------------------------------------------------------------------------

/**
 * Migrate raw profile + assumptions through the same pipeline used by
 * `parseStateFromJson`, then validate. Shared between the main state loader
 * and the saved-scenario library so a malformed library entry can't bypass
 * the validator.
 *
 * Returns null if the inputs are not plain objects or if validation fails.
 */
export function migrateAndValidateState(
  rawProfile: unknown,
  rawAssumptions: unknown,
): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return null
  if (!rawAssumptions || typeof rawAssumptions !== 'object' || Array.isArray(rawAssumptions)) return null

  // Mutate a shallow copy so the caller's object is not affected.
  const assumptionsCopy = { ...(rawAssumptions as Record<string, unknown>) }
  applyPreMergeMigrations(assumptionsCopy)

  const profile = mergeDeep(rawProfile, defaultProfile)
  const assumptions = mergeDeep(assumptionsCopy, defaultAssumptions)

  applyPostMergeMigrations(rawAssumptions as Record<string, unknown>, assumptions)

  return validateState(profile, assumptions)
}

// ---------------------------------------------------------------------------
// Transfer-event backfill — repair single-sided legacy events at load time
// ---------------------------------------------------------------------------

/**
 * Stable composite key for a TransferEvent, used to detect duplicates during
 * transfer-event backfill and — once issue 04 lands — by portfolio transfer
 * collection so both paths share the same identity definition.
 *
 * The key encodes enough fields to uniquely identify an event without relying
 * on object identity. Issue 04 should import this helper from storage rather
 * than reimplementing the key construction in portfolioAdapter.
 */
export function transferEventKey(ev: TransferEvent): string {
  const base = `${ev.type}|${ev.sourceInstanceId}|${ev.targetInstanceId}|${ev.year}`
  if (ev.type === 'surrender_reinvest') {
    return `${base}|${ev.amountEUR}|${ev.surrenderHaircutPct}`
  }
  return `${base}|${ev.amountEUR}`
}

/**
 * Backfill single-sided transfer events in a WorkspaceAssumptionsV2 so that
 * every event is stored on both the source instance (outbound record) and the
 * target instance (inbound record).
 *
 * Context: `collectTransferEvents` in portfolioAdapter.ts routes by which
 * instance array the event was found in — source array → outbound only, target
 * array → inbound only. Pre-dual-storage workspaces may have stored the event
 * on only one side, causing a capital withdrawal without a matching injection
 * (or vice versa). This backfill runs at load time and is idempotent.
 *
 * Only backfills when both source and target instances exist in the workspace
 * — if either is missing the event is left alone (the existing console.warn in
 * `collectTransferEvents` will surface it at simulation time).
 *
 * Mutates `assumptions` in place. Called once per scenario on load.
 */
function backfillSingleSidedTransferEvents(assumptions: WorkspaceAssumptionsV2): void {
  type AnyMutableInstance = {
    instanceId: string
    transferEvents?: TransferEvent[]
  }
  const allInstances: AnyMutableInstance[] = [
    ...(assumptions.bav as AnyMutableInstance[]),
    ...(assumptions.etf as AnyMutableInstance[]),
    ...(assumptions.insurance as AnyMutableInstance[]),
    ...(assumptions.basisrente as AnyMutableInstance[]),
    ...(assumptions.altersvorsorgedepot as AnyMutableInstance[]),
    ...(assumptions.riester as AnyMutableInstance[]),
  ]
  const instanceById = new Map<string, AnyMutableInstance>(
    allInstances.map(inst => [inst.instanceId, inst]),
  )

  for (const inst of allInstances) {
    for (const ev of inst.transferEvents ?? []) {
      const sourceInst = instanceById.get(ev.sourceInstanceId)
      const targetInst = instanceById.get(ev.targetInstanceId)

      // Only backfill when both sides exist; otherwise leave alone.
      if (!sourceInst || !targetInst) continue

      const key = transferEventKey(ev)

      // Ensure the event is on the source instance.
      if (inst.instanceId !== ev.sourceInstanceId) {
        // Found on target — source is missing it. Push to source if not already there.
        const srcKeys = new Set((sourceInst.transferEvents ?? []).map(transferEventKey))
        if (!srcKeys.has(key)) {
          sourceInst.transferEvents = [...(sourceInst.transferEvents ?? []), ev]
        }
      }

      // Ensure the event is on the target instance.
      if (inst.instanceId !== ev.targetInstanceId) {
        // Found on source — target is missing it. Push to target if not already there.
        const tgtKeys = new Set((targetInst.transferEvents ?? []).map(transferEventKey))
        if (!tgtKeys.has(key)) {
          targetInst.transferEvents = [...(targetInst.transferEvents ?? []), ev]
        }
      }
    }
  }
}

/**
 * Run `backfillSingleSidedTransferEvents` across all scenarios in a Workspace:
 * the baseline and every whatIf's assumptions.
 */
function backfillWorkspaceTransferEvents(workspace: Workspace): void {
  backfillSingleSidedTransferEvents(workspace.baseline.assumptions)
  for (const wi of workspace.whatIfs) {
    backfillSingleSidedTransferEvents(wi.assumptions)
    backfillSingleSidedTransferEvents(wi.derivedFromBaselineSnapshot.assumptions)
  }
}

// ---------------------------------------------------------------------------
// Workspace serialization / deserialization
//
// buildWorkspaceJson — serialize a Workspace to a JSON string.
// parseWorkspaceJson — deserialize, migrate (v1→v2), backfill, validate.
// ---------------------------------------------------------------------------

/** True when the raw parsed object carries a v2 schemaVersion marker. */
function isV2Shape(obj: Record<string, unknown>): boolean {
  return obj.schemaVersion === CURRENT_VERSION_V2
}

/**
 * Serialize a Workspace to JSON for storage/share-URL.
 */
export function buildWorkspaceJson(workspace: Workspace): string {
  return JSON.stringify(workspace)
}

/**
 * Parse a workspace JSON string produced by buildWorkspaceJson.
 * Handles both v1 (singleton) and v2 (instance-array) payloads.
 * Returns null on parse error, unsupported version, or failed validation.
 *
 * Load pipeline for a v2 payload:
 *   1. JSON.parse
 *   2. mergeDeep against defaultWorkspace (fills additive schema additions)
 *   3. validateWorkspace (full structural + invariant check, including every
 *      what-if and its derivedFromBaselineSnapshot — the backfill step below
 *      dereferences both, so they must be validated first)
 *   4. backfillWorkspaceTransferEvents (repairs single-sided legacy events)
 *   → returns null if any step fails
 *
 * Policy:
 *   - Unknown (v3+) schema → always null (caller surfaces error state).
 *   - Malformed v2 that survives merge but fails validation → null.
 *     Local callers (loadSavedWorkspace) fall back to v1 or return null.
 *     Share-URL callers receive null and surface an invalid-link state.
 *   - v1 payload → migrated via migrateV1ToV2; result is always structurally
 *     valid (migration produces a fresh Workspace from validated defaults).
 */
export function parseWorkspaceJson(raw: string): Workspace | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>

  if (isV2Shape(obj)) {
    // Merge against defaultWorkspace to fill any additive schema gaps, then
    // run full validation, then repair single-sided transfer events.
    //
    // Validation runs **before** the backfill because the backfill walks
    // every what-if and its `derivedFromBaselineSnapshot` (issue 08 contract
    // gap). Without a deep validation pass first, malformed v2 payloads would
    // either throw or silently survive into the load result.
    const merged = mergeDeep(obj, defaultWorkspace)
    if (merged.schemaVersion !== 2) return null
    const validated = validateWorkspace(merged)
    if (validated === null) return null
    backfillWorkspaceTransferEvents(validated)
    return validated
  }

  // Unknown future version — reject so callers can surface an error state.
  if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > CURRENT_VERSION_V2) return null

  // No schemaVersion (ancient) or schemaVersion === 1 — treat as v1.
  // v1 payload: { version: 1, profile: {...}, assumptions: {...} }
  if (typeof obj.version === 'number' && obj.version !== CURRENT_VERSION_V1) return null

  // Run v1→v2 migration. The migrated workspace is built entirely from
  // validated defaults + migrated fields, so validateWorkspace is not called
  // here — the migration itself is the correctness guarantee.
  if (!obj.profile || typeof obj.profile !== 'object' || Array.isArray(obj.profile)) return null
  if (!obj.assumptions || typeof obj.assumptions !== 'object' || Array.isArray(obj.assumptions)) return null

  const v1migrated = migrateV1ToV2(
    obj.profile as Record<string, unknown>,
    obj.assumptions as Record<string, unknown>,
  )
  if (v1migrated) backfillWorkspaceTransferEvents(v1migrated)
  return v1migrated
}

// ---------------------------------------------------------------------------
// Singleton state serialization — compare-mode engine path
//
// parseStateFromJson and buildStateJson serve the legacy v1 singleton path
// used by useCalculatorState (compare mode), urlShare.ts (share-URL), and
// scenarioLibrary.ts. They produce { profile, assumptions } pairs for
// simulateRetirementComparison. New code that needs a full Workspace should
// use parseWorkspaceJson / buildWorkspaceJson instead.
// ---------------------------------------------------------------------------

/**
 * Parse any stored state string to a singleton { profile, assumptions } pair.
 * Handles v2 workspace payloads (projects to singleton) and v1 payloads.
 * Returns null on parse error or validation failure.
 *
 * Note: for v2 payloads, this path skips transfer-event backfill (backfill only
 * matters for simulation, not for singleton projection). Use parseWorkspaceJson
 * when a full Workspace is needed.
 */
export function parseStateFromJson(
  raw: string,
): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>

  // v2 workspace payload: extract singleton via the inverse projection.
  if (isV2Shape(obj)) {
    const merged = mergeDeep(obj, defaultWorkspace)
    if (merged.schemaVersion !== 2) return null
    const singleton = workspaceToSingletonAssumptions(merged)
    const profileMerged = mergeDeep(
      merged.baseline.profile,
      defaultProfile,
    )
    return validateState(profileMerged, singleton)
  }

  // Future unknown version: reject.
  if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > CURRENT_VERSION_V2) return null

  // v1 or legacy (no version field).
  if (obj.version !== CURRENT_VERSION_V1) return null
  return migrateAndValidateState(obj.profile, obj.assumptions)
}

export function buildStateJson(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
): string {
  return JSON.stringify({ version: CURRENT_VERSION_V1, profile, assumptions })
}

// ---------------------------------------------------------------------------
// localStorage load/save
// ---------------------------------------------------------------------------

/**
 * Load the saved state from localStorage as a singleton { profile, assumptions }
 * pair for use by the compare-mode engine path (simulateRetirementComparison).
 *
 * Read order:
 *   1. STORAGE_KEY_V2 — parse + validate via parseWorkspaceJson, then project
 *      to singleton via workspaceToSingletonAssumptions + validateState.
 *   2. STORAGE_KEY_V1 — parse + migrate via parseStateFromJson (includes
 *      migrateAndValidateState).
 *
 * If the v2 key is present but invalid (malformed JSON, failed validation,
 * future schemaVersion), falls through to the v1 key rather than returning
 * null immediately — so a corrupt v2 write does not wipe the user's v1 data.
 */
export function loadSavedState(): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  try {
    // Prefer v2 key.
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2)
    if (rawV2) {
      const workspace = parseWorkspaceJson(rawV2)
      if (workspace) {
        const singleton = workspaceToSingletonAssumptions(workspace)
        const profile = mergeDeep(workspace.baseline.profile, defaultProfile)
        return validateState(profile, singleton)
      }
    }

    // Fall back to v1 key with migration.
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1)
    if (!rawV1) return null
    return parseStateFromJson(rawV1)
  } catch {
    return null
  }
}

/**
 * Load the saved Workspace from localStorage.
 *
 * Read order:
 *   1. STORAGE_KEY_V2 — merge, backfill, and fully validate via parseWorkspaceJson.
 *   2. STORAGE_KEY_V1 — migrate via migrateV1ToV2.
 *
 * If the v2 key is present but invalid (malformed JSON, future schemaVersion,
 * or failed validateWorkspace), falls back to the v1 key. This means a corrupt
 * v2 write does not discard the user's v1 data.
 *
 * If both keys are absent or invalid, returns null. Callers should fall back
 * to defaultWorkspace in that case.
 */
export function loadSavedWorkspace(): Workspace | null {
  try {
    // Prefer v2 key.
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2)
    if (rawV2) {
      const workspace = parseWorkspaceJson(rawV2)
      if (workspace) return workspace
      // V2 key present but unparseable — fall through to v1 fallback.
    }

    // Fall back to v1 key with migration.
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1)
    if (!rawV1) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(rawV1)
    } catch {
      return null
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const obj = parsed as Record<string, unknown>
    if (obj.version !== CURRENT_VERSION_V1) return null
    if (!obj.profile || typeof obj.profile !== 'object' || Array.isArray(obj.profile)) return null
    if (!obj.assumptions || typeof obj.assumptions !== 'object' || Array.isArray(obj.assumptions)) return null

    return migrateV1ToV2(
      obj.profile as Record<string, unknown>,
      obj.assumptions as Record<string, unknown>,
    )
  } catch {
    return null
  }
}

/**
 * Save a Workspace to localStorage using the v2 key.
 * Called by portfolioState (combine-mode). The compare-mode write path
 * (useCalculatorState) still writes v1-shaped JSON to STORAGE_KEY_V1 and
 * must be updated to call this function once the full workspace edit-flow
 * is complete.
 */
export function saveWorkspace(workspace: Workspace): void {
  try {
    localStorage.setItem(STORAGE_KEY_V2, buildWorkspaceJson(workspace))
  } catch {
    // ignore storage failures
  }
}
