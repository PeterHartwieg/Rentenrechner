import type {
  MonteCarloAssumptions,
  PersonalProfile,
  ReturnScenario,
  ReturnScenarioId,
  ScenarioAssumptions,
  StatutoryPensionAssumptions,
} from '../domain'
import type { Workspace, WorkspaceAssumptionsV2, Scenario } from '../domain/workspace'
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
  if (p.taxClass !== 1) return null
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

/** Illegal certified-transfer pairings under AltZertG / EStG. */
const ILLEGAL_CERTIFIED_PAIRINGS = new Set([
  'altersvorsorgedepot→riester', // AVD → Riester forbidden under AltZertG
  'etf→bav',                     // ETF → bAV requires §3 Nr. 63 contribution, not a transfer
  'etf→altersvorsorgedepot',     // ETF → AVD: no certified-transfer route
  'etf→riester',                 // ETF → Riester: no certified-transfer route
  'bav→altersvorsorgedepot',     // bAV → AVD: no certified-transfer route under AltZertG
  'bav→riester',                 // bAV → Riester: no certified-transfer route
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

function validateTransferEvent(event: unknown, allInstanceIds: Set<string>): boolean {
  if (!event || typeof event !== 'object') return false
  const e = event as Record<string, unknown>
  if (!VALID_TRANSFER_TYPES.includes(e.type as typeof VALID_TRANSFER_TYPES[number])) return false
  if (!isInt(e.year as unknown) || (e.year as number) < 1900 || (e.year as number) > 2200) return false
  if (typeof e.sourceInstanceId !== 'string' || !e.sourceInstanceId) return false
  if (typeof e.targetInstanceId !== 'string' || !e.targetInstanceId) return false
  if (!isFiniteNumber(e.amountEUR as unknown) || (e.amountEUR as number) < 0) return false

  // Target instance must exist in the workspace.
  if (!allInstanceIds.has(e.targetInstanceId as string)) return false

  // For certified transfers, check illegal pairings.
  if (e.type === 'certified') {
    const sourcePid = productIdFromInstanceId(e.sourceInstanceId as string)
    const targetPid = productIdFromInstanceId(e.targetInstanceId as string)
    if (sourcePid && targetPid) {
      const pairingKey = `${sourcePid}→${targetPid}`
      if (ILLEGAL_CERTIFIED_PAIRINGS.has(pairingKey)) return false
    }
  }

  if (e.type === 'surrender_reinvest') {
    if (!inRange(e.surrenderHaircutPct as unknown, 0, 1)) return false
    // Self-target is never legal (would be a contractual no-op with tax cost).
    if (e.sourceInstanceId === e.targetInstanceId) return false
    const sourcePid = productIdFromInstanceId(e.sourceInstanceId as string)
    const targetPid = productIdFromInstanceId(e.targetInstanceId as string)
    if (sourcePid && ILLEGAL_SURRENDER_REINVEST_SOURCES.has(sourcePid)) return false
    if (targetPid && CERTIFIED_TARGET_PRODUCTS.has(targetPid)) {
      // Reinvestment into a certified product (bAV / Riester / AVD / Basisrente)
      // must go through the product's own contribution path, not via a transfer.
      return false
    }
  }

  return true
}

/**
 * Validate the InstanceCommon fields shared by all instance types.
 */
function validateInstanceCommon(inst: unknown, allInstanceIds: Set<string>): inst is InstanceCommon {
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
      if (!validateTransferEvent(ev, allInstanceIds)) return false
    }
  }
  return true
}

/**
 * Validate a bAV instance (InstanceCommon + BavAssumptions).
 */
export function validateBavInstance(inst: unknown, allInstanceIds: Set<string>): boolean {
  if (!validateInstanceCommon(inst, allInstanceIds)) return false
  // Double-cast via unknown: validateInstanceCommon confirms the shape is InstanceCommon;
  // the validator then checks the additional product-specific fields.
  return validateBav(inst as unknown as Parameters<typeof validateBav>[0])
}

/**
 * Validate an ETF instance (InstanceCommon + EtfAssumptions).
 */
export function validateEtfInstance(inst: unknown, allInstanceIds: Set<string>): boolean {
  if (!validateInstanceCommon(inst, allInstanceIds)) return false
  return validateEtf(inst as unknown as Parameters<typeof validateEtf>[0])
}

/**
 * Validate a private insurance instance (InstanceCommon + InsuranceAssumptions).
 */
export function validateInsuranceInstance(inst: unknown, allInstanceIds: Set<string>): boolean {
  if (!validateInstanceCommon(inst, allInstanceIds)) return false
  return validateInsurance(inst as unknown as Parameters<typeof validateInsurance>[0])
}

/**
 * Validate a Basisrente instance (InstanceCommon + BasisrenteAssumptions).
 */
export function validateBasisrenteInstance(inst: unknown, allInstanceIds: Set<string>): boolean {
  if (!validateInstanceCommon(inst, allInstanceIds)) return false
  return validateBasisrente(inst as unknown as Parameters<typeof validateBasisrente>[0])
}

/**
 * Validate an Altersvorsorgedepot instance (InstanceCommon + AltersvorsorgedepotAssumptions).
 */
export function validateAltersvorsorgedepotInstance(inst: unknown, allInstanceIds: Set<string>): boolean {
  if (!validateInstanceCommon(inst, allInstanceIds)) return false
  return validateAltersvorsorgedepot(inst as unknown as Parameters<typeof validateAltersvorsorgedepot>[0])
}

/**
 * Validate a Riester instance (InstanceCommon + RiesterAssumptions).
 */
export function validateRiesterInstance(inst: unknown, allInstanceIds: Set<string>): boolean {
  if (!validateInstanceCommon(inst, allInstanceIds)) return false
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
  if (!a.monteCarlo || typeof a.monteCarlo !== 'object') return null
  if (!a.statutoryPension || typeof a.statutoryPension !== 'object') return null

  if (!Array.isArray(a.visibleProducts)) return null
  if (a.visibleProducts.length > PRODUCT_IDS.length) return null
  for (const pid of a.visibleProducts) {
    if (!PRODUCT_IDS.includes(pid)) return null
  }

  // Collect all instance ids across every product array for transfer-event target validation.
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
      if (typeof id === 'string') allInstanceIds.add(id)
    }
  }

  // Validate each product's instance array.
  if (!Array.isArray(a.bav)) return null
  for (const inst of a.bav) {
    if (!validateBavInstance(inst, allInstanceIds)) return null
  }

  if (!Array.isArray(a.etf)) return null
  for (const inst of a.etf) {
    if (!validateEtfInstance(inst, allInstanceIds)) return null
  }

  if (!Array.isArray(a.insurance)) return null
  for (const inst of a.insurance) {
    if (!validateInsuranceInstance(inst, allInstanceIds)) return null
  }

  if (!Array.isArray(a.basisrente)) return null
  for (const inst of a.basisrente) {
    if (!validateBasisrenteInstance(inst, allInstanceIds)) return null
  }

  if (!Array.isArray(a.altersvorsorgedepot)) return null
  for (const inst of a.altersvorsorgedepot) {
    if (!validateAltersvorsorgedepotInstance(inst, allInstanceIds)) return null
  }

  if (!Array.isArray(a.riester)) return null
  for (const inst of a.riester) {
    if (!validateRiesterInstance(inst, allInstanceIds)) return null
  }

  return a
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
  if (validateWorkspaceAssumptions(s.assumptions) === null) return null
  // Validate retirementEndAge > retirementAge cross-invariant
  if (s.assumptions.retirementEndAge <= s.profile.retirementAge) return null
  return s
}

/**
 * Validate a v2 Workspace object.
 * Returns the typed object or null on failure.
 */
export function validateWorkspace(input: unknown): Workspace | null {
  if (!input || typeof input !== 'object') return null
  const w = input as Workspace
  if (w.schemaVersion !== 2) return null
  if (w.mode !== 'compare' && w.mode !== 'combine') return null
  if (!Array.isArray(w.whatIfs)) return null
  if (!Array.isArray(w.pinnedComparisonIds)) return null
  if (validateScenario(w.baseline) === null) return null
  return w
}
