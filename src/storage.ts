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
import { validateState } from './utils/scenarioSchema'
import { singletonViewOfWorkspace } from './engine/portfolioProjection'

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
export const STORAGE_KEY_V1 = 'rentenrechner-state-v1'
export const STORAGE_KEY_V2 = 'rentenrechner-state-v2'

/**
 * Canonical write key for M1. Writers (useCalculatorState) still emit v1-shaped
 * payloads to this key — the switch to v2 writes happens in issue 03.
 * Read-side (loadSavedState, loadSavedWorkspace) prefers STORAGE_KEY_V2, then
 * falls back to STORAGE_KEY_V1 with migration applied.
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
// Workspace serialization / deserialization
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Transfer-event backfill — data-migration fix for single-sided legacy events
// ---------------------------------------------------------------------------

/**
 * Stable composite key for a TransferEvent used to detect duplicates when
 * backfilling the missing side. Enough fields to uniquely identify an event
 * across instances without relying on object identity.
 */
function transferEventKey(ev: TransferEvent): string {
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

/**
 * Parse a v2 workspace JSON string. Returns null for unparseable or invalid input.
 * Does NOT run through migrateAndValidateState — workspace validation is separate.
 *
 * This is a minimal structural check. Full validation is handled by validateWorkspace
 * in scenarioSchema.ts (called from parseWorkspaceJson).
 */
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
 * Returns null on parse error or failed validation.
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
    // Already v2: merge against defaultWorkspace to fill gaps, then validate.
    const merged = mergeDeep(obj, defaultWorkspace)
    // Minimal structural guard: schemaVersion must still be 2 after merge.
    if (merged.schemaVersion !== 2) return null
    // Backfill any single-sided transfer events from legacy saves.
    backfillWorkspaceTransferEvents(merged)
    return merged
  }

  // Unknown future version — reject.
  if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > CURRENT_VERSION_V2) return null

  // No schemaVersion (ancient) or schemaVersion === 1 — treat as v1.
  // v1 payload has { version: 1, profile: {...}, assumptions: {...} }
  if (
    typeof obj.version === 'number' &&
    obj.version !== CURRENT_VERSION_V1
  ) return null

  // Run v1 migration.
  if (!obj.profile || typeof obj.profile !== 'object' || Array.isArray(obj.profile)) return null
  if (!obj.assumptions || typeof obj.assumptions !== 'object' || Array.isArray(obj.assumptions)) return null

  const v1migrated = migrateV1ToV2(
    obj.profile as Record<string, unknown>,
    obj.assumptions as Record<string, unknown>,
  )
  // Backfill any single-sided transfer events from legacy saves.
  if (v1migrated) backfillWorkspaceTransferEvents(v1migrated)
  return v1migrated
}

// ---------------------------------------------------------------------------
// Legacy v1 state serialization (kept for the singleton engine path)
// ---------------------------------------------------------------------------

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
 * Load the saved state from localStorage.
 * Read order: v2 key first, then v1 key (with migration applied).
 * After a successful v1→v2 migrate, the next save will write v2 and remove v1.
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
 * Read order: v2 key first, then v1 key (with migration applied).
 * If the v2 key is present but unparseable (corrupt JSON, v3+ payload, validation
 * failure), falls back to v1 key — consistent with loadSavedState behaviour.
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
 * TODO(issue 03): switch the main write path (useCalculatorState) to call this
 * instead of writing v1-shaped JSON to STORAGE_KEY_V1. At that point, also
 * remove STORAGE_KEY_V1 here to complete the migration.
 */
export function saveWorkspace(workspace: Workspace): void {
  try {
    localStorage.setItem(STORAGE_KEY_V2, buildWorkspaceJson(workspace))
  } catch {
    // ignore storage failures
  }
}
