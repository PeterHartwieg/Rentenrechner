import type {
  MonteCarloAssumptions,
  PersonalProfile,
  ReturnScenario,
  ReturnScenarioId,
  ScenarioAssumptions,
  StatutoryPensionAssumptions,
} from '../domain'
import type { Workspace, WhatIfScenario, WorkspaceAssumptionsV2, Scenario } from '../domain/workspace'
import type { InstanceCommon } from '../domain/instances'
import { inRange, isFiniteNumber, isInt } from '../domain/validation/primitives'
import { PRODUCT_IDS, PRODUCT_REGISTRY } from '../engine/productRegistry'
import type { ProductId } from '../engine/productRegistry'
import { validateBav } from '../engine/products/bav.validation'
import { validateEtf } from '../engine/products/etf.validation'
import { validateInsurance } from '../engine/products/insurance.validation'
import { validateBasisrente } from '../engine/products/basisrente.validation'
import { validateAltersvorsorgedepot } from '../engine/products/altersvorsorgedepot.validation'
import { validateRiester } from '../engine/products/riester.validation'

// Range/shape validation for state loaded from URL share or localStorage (#49).
// Inputs are post-mergeDeep so all keys exist; this layer rejects NaN, ±Infinity,
// out-of-domain enums, broken invariants, and malformed nested arrays.

const VALID_SCENARIO_IDS: readonly ReturnScenarioId[] = ['konservativ', 'basis', 'optimistisch', 'custom']

export function validateProfile(input: unknown): PersonalProfile | null {
  if (!input || typeof input !== 'object') return null
  const p = input as PersonalProfile
  if (!isFiniteNumber(p.age) || p.age < 0) return null
  if (!isFiniteNumber(p.retirementAge)) return null
  if (p.retirementAge < p.age || p.retirementAge > 120) return null
  if (!isFiniteNumber(p.grossSalaryYear) || p.grossSalaryYear < 0) return null
  if (!isInt(p.taxClass) || p.taxClass < 1 || p.taxClass > 6) return null
  if (!Array.isArray(p.childBirthYears) || p.childBirthYears.length > 20) return null
  for (const y of p.childBirthYears) {
    if (!isInt(y) || y < 1900 || y > 2200) return null
  }
  if (typeof p.churchTax !== 'boolean') return null
  if (typeof p.publicHealthInsurance !== 'boolean') return null
  if (!inRange(p.healthAdditionalContributionPct, 0, 10)) return null
  if (!inRange(p.pkvMonthlyPremium, 0, 10_000)) return null
  if (!inRange(p.pPVMonthlyPremium, 0, 10_000)) return null
  if (p.desiredNetMonthlyPension !== undefined) {
    if (!inRange(p.desiredNetMonthlyPension, 0, 100_000)) return null
  }
  return p
}

export function validateReturnScenarios(input: unknown): ReturnScenario[] | null {
  if (!Array.isArray(input)) return null
  if (input.length < 1 || input.length > 10) return null
  const seen = new Set<string>()
  for (const item of input) {
    if (!item || typeof item !== 'object') return null
    const s = item as ReturnScenario
    if (!VALID_SCENARIO_IDS.includes(s.id)) return null
    if (seen.has(s.id)) return null
    seen.add(s.id)
    if (typeof s.label !== 'string' || s.label.length === 0) return null
    if (!inRange(s.annualReturn, -0.5, 0.5)) return null
  }
  return input as ReturnScenario[]
}

const VALID_PENSION_BASELINE_TYPES = ['grv', 'versorgungswerk', 'beamtenpension', 'none'] as const
const VALID_RETIREMENT_HEALTH_STATUSES = ['kvdr', 'freiwillig_gkv', 'pkv'] as const

function validateMonteCarlo(input: MonteCarloAssumptions): boolean {
  return (
    typeof input.enabled === 'boolean' &&
    isInt(input.runs) &&
    input.runs >= 100 &&
    input.runs <= 5_000 &&
    inRange(input.annualVolatility, 0, 0.6) &&
    isInt(input.seed) &&
    input.seed >= 1 &&
    input.seed <= 2_147_483_647
  )
}

function validateStatutoryPension(sp: StatutoryPensionAssumptions): boolean {
  if (sp.pensionBaselineType !== undefined && !VALID_PENSION_BASELINE_TYPES.includes(sp.pensionBaselineType)) return false
  if (sp.manualMonthlyGross !== null && !inRange(sp.manualMonthlyGross, 0, 100_000)) return false
  if (!inRange(sp.currentEntgeltpunkte, 0, 200)) return false
  if (typeof sp.includeGrvReduction !== 'boolean') return false
  if (!inRange(sp.annualSalaryGrowthRate ?? 0, -0.1, 0.2)) return false
  if (!inRange(sp.rentenwertGrowthRate ?? 0, -0.05, 0.1)) return false
  if (!inRange(sp.versorgungswerkMonthlyContribution ?? 0, 0, 10_000)) return false
  if (!inRange(sp.versorgungswerkEmployerMonthly ?? 0, 0, 10_000)) return false
  if (sp.retirementHealthStatus !== undefined && !VALID_RETIREMENT_HEALTH_STATUSES.includes(sp.retirementHealthStatus)) return false
  return true
}

export function validateAssumptions(input: unknown): ScenarioAssumptions | null {
  if (!input || typeof input !== 'object') return null
  const a = input as ScenarioAssumptions
  if (!inRange(a.inflationRate, -0.1, 0.2)) return null
  if (!isFiniteNumber(a.retirementEndAge) || a.retirementEndAge > 120) return null
  if (validateReturnScenarios(a.returnScenarios) === null) return null
  if (!a.monteCarlo || typeof a.monteCarlo !== 'object' || !validateMonteCarlo(a.monteCarlo)) return null
  for (const product of PRODUCT_REGISTRY) {
    const productAssumptions = a[product.assumptionsKey]
    if (!productAssumptions || typeof productAssumptions !== 'object') return null
    if (!product.validate(productAssumptions)) return null
  }
  if (!a.statutoryPension || typeof a.statutoryPension !== 'object' || !validateStatutoryPension(a.statutoryPension)) return null
  if (!Array.isArray(a.visibleProducts)) return null
  if (a.visibleProducts.length > PRODUCT_IDS.length) return null
  for (const pid of a.visibleProducts) {
    if (!PRODUCT_IDS.includes(pid)) return null
  }
  return a
}

export function validateState(
  profileInput: unknown,
  assumptionsInput: unknown,
): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  const profile = validateProfile(profileInput)
  if (!profile) return null
  const assumptions = validateAssumptions(assumptionsInput)
  if (!assumptions) return null
  // Cross-object invariant: retirementEndAge > retirementAge.
  if (assumptions.retirementEndAge <= profile.retirementAge) return null
  return { profile, assumptions }
}

// ---------------------------------------------------------------------------
// V2 workspace validators
// ---------------------------------------------------------------------------

const VALID_INSTANCE_STATUSES = ['active', 'paid_up', 'surrendered', 'offered'] as const
const VALID_EVIDENCE_STATES = ['user_confirmed', 'model_estimate', 'statement'] as const
const VALID_TRANSFER_TYPES = ['certified', 'surrender_reinvest'] as const

/** Exhaustive certified-transfer pairings modelled by contractDecisions. */
const LEGAL_CERTIFIED_PAIRINGS = new Set([
  'riester→altersvorsorgedepot',
  'basisrente→basisrente',
  'bav→bav',
])

/**
 * Illegal surrender_reinvest source product classes — you cannot "reinvest"
 * an ETF into a certified product without going through that product's
 * contribution path. Issue 15.
 */
const ILLEGAL_SURRENDER_REINVEST_SOURCES = new Set(['etf'])
/** Certified product targets are forbidden as surrender_reinvest destinations. */
const CERTIFIED_TARGET_PRODUCTS = new Set(['bav', 'altersvorsorgedepot', 'riester', 'basisrente'])

/**
 * Extract the product id encoded in an instance id (format: `${productId}-${random8}`).
 * Returns `null` when the id has no known product prefix.
 */
export function productIdFromInstanceId(instanceId: string): ProductId | null {
  for (const productId of PRODUCT_IDS) {
    if (instanceId === productId || instanceId.startsWith(`${productId}-`)) return productId
  }
  return null
}

function validateTransferEventShape(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false
  const e = event as Record<string, unknown>
  if (!VALID_TRANSFER_TYPES.includes(e.type as typeof VALID_TRANSFER_TYPES[number])) return false
  if (!isInt(e.year as unknown) || (e.year as number) < 1900 || (e.year as number) > 2200) return false
  if (typeof e.sourceInstanceId !== 'string' || !e.sourceInstanceId) return false
  if (typeof e.targetInstanceId !== 'string' || !e.targetInstanceId) return false
  if (!isFiniteNumber(e.amountEUR as unknown) || (e.amountEUR as number) < 0) return false

  if (e.type === 'surrender_reinvest') {
    if (!inRange(e.surrenderHaircutPct as unknown, 0, 1)) return false
  }

  return true
}

function isUsableTransferEvent(
  event: NonNullable<InstanceCommon['transferEvents']>[number],
  allInstanceIds: Set<string>,
  bavById: Map<string, WorkspaceAssumptionsV2['bav'][number]>,
): boolean {
  if (!allInstanceIds.has(event.sourceInstanceId)) return false
  if (!allInstanceIds.has(event.targetInstanceId)) return false
  if (event.sourceInstanceId === event.targetInstanceId) return false

  const sourcePid = productIdFromInstanceId(event.sourceInstanceId)
  const targetPid = productIdFromInstanceId(event.targetInstanceId)
  if (!sourcePid || !targetPid) return false

  if (event.type === 'certified') {
    if (!LEGAL_CERTIFIED_PAIRINGS.has(`${sourcePid}→${targetPid}`)) return false
    const sourceBav = bavById.get(event.sourceInstanceId)
    const targetBav = bavById.get(event.targetInstanceId)
    if (
      sourceBav &&
      targetBav &&
      sourceBav.durchfuehrungsweg !== targetBav.durchfuehrungsweg
    ) return false
  }

  if (event.type === 'surrender_reinvest') {
    if (ILLEGAL_SURRENDER_REINVEST_SOURCES.has(sourcePid)) return false
    if (CERTIFIED_TARGET_PRODUCTS.has(targetPid)) return false
  }

  return true
}

/**
 * Validate the InstanceCommon fields shared by all instance types.
 */
function validateInstanceCommon(inst: unknown): inst is InstanceCommon {
  if (!inst || typeof inst !== 'object') return false
  const i = inst as Record<string, unknown>
  if (typeof i.instanceId !== 'string' || !i.instanceId) return false
  if (typeof i.label !== 'string') return false
  if (!VALID_INSTANCE_STATUSES.includes(i.status as typeof VALID_INSTANCE_STATUSES[number])) return false
  if (!isInt(i.contractStartYear as unknown) || (i.contractStartYear as number) < 1900 || (i.contractStartYear as number) > 2200) return false
  if (!i.evidenceMap || typeof i.evidenceMap !== 'object' || Array.isArray(i.evidenceMap)) return false
  // Validate each evidenceMap entry.
  for (const v of Object.values(i.evidenceMap as Record<string, unknown>)) {
    if (!VALID_EVIDENCE_STATES.includes(v as typeof VALID_EVIDENCE_STATES[number])) return false
  }
  // Optional currentValueEUR
  if (i.currentValueEUR !== undefined && (!isFiniteNumber(i.currentValueEUR as unknown) || (i.currentValueEUR as number) < 0)) return false
  // Optional ownedBy
  if (i.ownedBy !== undefined && i.ownedBy !== 'self' && i.ownedBy !== 'partner') return false
  // Optional anbieter
  if (i.anbieter !== undefined && typeof i.anbieter !== 'string') return false
  // Optional transferEvents
  if (i.transferEvents !== undefined) {
    if (!Array.isArray(i.transferEvents)) return false
    for (const ev of i.transferEvents as unknown[]) {
      if (!validateTransferEventShape(ev)) return false
    }
  }
  return true
}

/**
 * Validate a bAV instance (InstanceCommon + BavAssumptions).
 */
export function validateBavInstance(inst: unknown): boolean {
  if (!validateInstanceCommon(inst)) return false
  // Double-cast via unknown: validateInstanceCommon confirms the shape is InstanceCommon;
  // the validator then checks the additional product-specific fields.
  return validateBav(inst as unknown as Parameters<typeof validateBav>[0])
}

/**
 * Validate an ETF instance (InstanceCommon + EtfAssumptions).
 */
export function validateEtfInstance(inst: unknown): boolean {
  if (!validateInstanceCommon(inst)) return false
  return validateEtf(inst as unknown as Parameters<typeof validateEtf>[0])
}

/**
 * Validate a private insurance instance (InstanceCommon + InsuranceAssumptions).
 */
export function validateInsuranceInstance(inst: unknown): boolean {
  if (!validateInstanceCommon(inst)) return false
  return validateInsurance(inst as unknown as Parameters<typeof validateInsurance>[0])
}

/**
 * Validate a Basisrente instance (InstanceCommon + BasisrenteAssumptions).
 */
export function validateBasisrenteInstance(inst: unknown): boolean {
  if (!validateInstanceCommon(inst)) return false
  return validateBasisrente(inst as unknown as Parameters<typeof validateBasisrente>[0])
}

/**
 * Validate an Altersvorsorgedepot instance (InstanceCommon + AltersvorsorgedepotAssumptions).
 */
export function validateAltersvorsorgedepotInstance(inst: unknown): boolean {
  if (!validateInstanceCommon(inst)) return false
  return validateAltersvorsorgedepot(inst as unknown as Parameters<typeof validateAltersvorsorgedepot>[0])
}

/**
 * Validate a Riester instance (InstanceCommon + RiesterAssumptions).
 */
export function validateRiesterInstance(inst: unknown): boolean {
  if (!validateInstanceCommon(inst)) return false
  return validateRiester(inst as unknown as Parameters<typeof validateRiester>[0])
}

/**
 * Validate a WorkspaceAssumptionsV2 object.
 * Returns the typed object or null on failure.
 */
export function validateWorkspaceAssumptions(input: unknown): WorkspaceAssumptionsV2 | null {
  if (!input || typeof input !== 'object') return null
  const a = input as WorkspaceAssumptionsV2

  if (!inRange(a.inflationRate, -0.1, 0.2)) return null
  if (!isFiniteNumber(a.retirementEndAge) || a.retirementEndAge > 120) return null
  if (validateReturnScenarios(a.returnScenarios) === null) return null
  if (!a.monteCarlo || typeof a.monteCarlo !== 'object' || !validateMonteCarlo(a.monteCarlo)) return null
  if (!a.statutoryPension || typeof a.statutoryPension !== 'object' || !validateStatutoryPension(a.statutoryPension)) return null

  if (!Array.isArray(a.visibleProducts)) return null
  if (a.visibleProducts.length > PRODUCT_IDS.length) return null
  for (const pid of a.visibleProducts) {
    if (!PRODUCT_IDS.includes(pid)) return null
  }

  // Collect all instance ids across every product array for transfer-event target validation.
  // Duplicate instanceId values across product arrays are rejected — they indicate a corrupt
  // workspace and would cause silent simulation errors (wrong capital injections, etc.).
  const allInstanceIds = new Set<string>()
  const productArrays: unknown[] = [
    ...(Array.isArray(a.bav) ? a.bav : []),
    ...(Array.isArray(a.etf) ? a.etf : []),
    ...(Array.isArray(a.insurance) ? a.insurance : []),
    ...(Array.isArray(a.basisrente) ? a.basisrente : []),
    ...(Array.isArray(a.altersvorsorgedepot) ? a.altersvorsorgedepot : []),
    ...(Array.isArray(a.riester) ? a.riester : []),
  ]
  for (const inst of productArrays) {
    if (inst && typeof inst === 'object') {
      const id = (inst as Record<string, unknown>).instanceId
      if (typeof id === 'string') {
        if (allInstanceIds.has(id)) return null
        allInstanceIds.add(id)
      }
    }
  }

  const hasExpectedProductPrefix = (inst: unknown, expected: ProductId): boolean => {
    if (!inst || typeof inst !== 'object') return false
    const instanceId = (inst as Record<string, unknown>).instanceId
    return typeof instanceId === 'string' && productIdFromInstanceId(instanceId) === expected
  }

  // Validate each product's instance array. The product prefix is part of the
  // persisted identity contract and must agree with the array containing it.
  if (!Array.isArray(a.bav)) return null
  for (const inst of a.bav) {
    if (!hasExpectedProductPrefix(inst, 'bav')) return null
    if (!validateBavInstance(inst)) return null
  }

  if (!Array.isArray(a.etf)) return null
  for (const inst of a.etf) {
    if (!hasExpectedProductPrefix(inst, 'etf')) return null
    if (!validateEtfInstance(inst)) return null
  }

  if (!Array.isArray(a.insurance)) return null
  for (const inst of a.insurance) {
    if (!hasExpectedProductPrefix(inst, 'versicherung')) return null
    if (!validateInsuranceInstance(inst)) return null
  }

  if (!Array.isArray(a.basisrente)) return null
  for (const inst of a.basisrente) {
    if (!hasExpectedProductPrefix(inst, 'basisrente')) return null
    if (!validateBasisrenteInstance(inst)) return null
  }

  if (!Array.isArray(a.altersvorsorgedepot)) return null
  for (const inst of a.altersvorsorgedepot) {
    if (!hasExpectedProductPrefix(inst, 'altersvorsorgedepot')) return null
    if (!validateAltersvorsorgedepotInstance(inst)) return null
  }

  if (!Array.isArray(a.riester)) return null
  for (const inst of a.riester) {
    if (!hasExpectedProductPrefix(inst, 'riester')) return null
    if (!validateRiesterInstance(inst)) return null
  }

  // Transfer legality is event-scoped. A stale event can arise after a user
  // edits or removes a contract; discard that event rather than rejecting the
  // entire persisted workspace and falling back to an empty default.
  const bavById = new Map(a.bav.map((inst) => [inst.instanceId, inst]))
  const sanitizeInstances = <T extends InstanceCommon>(instances: T[]): T[] => {
    return instances.map((instance) => {
      if (!instance.transferEvents) return instance
      const transferEvents = instance.transferEvents.filter((event) =>
        isUsableTransferEvent(event, allInstanceIds, bavById),
      )
      return transferEvents.length === instance.transferEvents.length
        ? instance
        : { ...instance, transferEvents }
    })
  }

  return {
    ...a,
    bav: sanitizeInstances(a.bav),
    etf: sanitizeInstances(a.etf),
    insurance: sanitizeInstances(a.insurance),
    basisrente: sanitizeInstances(a.basisrente),
    altersvorsorgedepot: sanitizeInstances(a.altersvorsorgedepot),
    riester: sanitizeInstances(a.riester),
  }
}

/**
 * Validate a Scenario object.
 */
export function validateScenario(input: unknown): Scenario | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Scenario
  if (typeof s.id !== 'string' || !s.id) return null
  if (typeof s.label !== 'string') return null
  if (typeof s.createdAt !== 'string') return null
  if (!['baseline', 'manual', 'recommender'].includes(s.origin)) return null
  if (!validateProfile(s.profile)) return null
  const assumptions = validateWorkspaceAssumptions(s.assumptions)
  if (assumptions === null) return null
  // Validate retirementEndAge > retirementAge cross-invariant
  if (assumptions.retirementEndAge <= s.profile.retirementAge) return null
  return { ...s, assumptions }
}

/**
 * Validate a WhatIfScenario object — Scenario plus the what-if-specific
 * `derivedFromBaselineId` / `derivedFromBaselineSnapshot` / `frozenAt` fields.
 *
 * The snapshot is a frozen baseline copy; it must itself be a valid Scenario
 * so downstream code (transfer-event backfill, re-base flows) can safely
 * dereference it.
 */
export function validateWhatIfScenario(input: unknown): WhatIfScenario | null {
  if (!input || typeof input !== 'object') return null
  const w = input as WhatIfScenario
  const scenario = validateScenario(w)
  if (scenario === null) return null
  if (typeof w.derivedFromBaselineId !== 'string' || !w.derivedFromBaselineId) return null
  const derivedFromBaselineSnapshot = validateScenario(w.derivedFromBaselineSnapshot)
  if (derivedFromBaselineSnapshot === null) return null
  if (w.frozenAt !== undefined && (typeof w.frozenAt !== 'number' || !Number.isFinite(w.frozenAt))) return null
  return { ...w, ...scenario, derivedFromBaselineSnapshot }
}

/**
 * Validate a v2 Workspace object.
 *
 * Validates the baseline scenario, every entry in `whatIfs`, and each
 * what-if's `derivedFromBaselineSnapshot`. The deep validation is required
 * because downstream code (transfer-event backfill, re-base flows) walks
 * those nested scenarios and would crash on a malformed shape otherwise —
 * see the `parseWorkspaceJson` pipeline order in `storage.ts`, where
 * `validateWorkspace` runs **before** `backfillWorkspaceTransferEvents`.
 *
 * Returns the typed object or null on failure.
 */
export function validateWorkspace(input: unknown): Workspace | null {
  if (!input || typeof input !== 'object') return null
  const w = input as Workspace
  if (w.schemaVersion !== 2) return null
  if (w.mode !== 'compare' && w.mode !== 'combine') return null
  if (!Array.isArray(w.whatIfs)) return null
  if (!Array.isArray(w.pinnedComparisonIds)) return null
  const baseline = validateScenario(w.baseline)
  if (baseline === null) return null
  // Deep-validate every what-if and its baseline snapshot so the backfill
  // and re-base paths can dereference them without defensive null checks.
  const whatIfs: WhatIfScenario[] = []
  for (const wi of w.whatIfs) {
    const validated = validateWhatIfScenario(wi)
    if (validated === null) return null
    whatIfs.push(validated)
  }
  return { ...w, baseline, whatIfs }
}
