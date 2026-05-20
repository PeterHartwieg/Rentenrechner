/**
 * Per-contract decision generators (Group G issue 14, milestone M3.5).
 *
 * Pure module — no React imports, no DOM access.
 *
 * Generates up to three pre-built what-ifs for a specific instance in the
 * workspace: Weiterführen / Kündigen / Übertragen.
 *
 * Architecture:
 *   - `ContractDecision` is the output shape (mirrors `RecommendedCandidate`
 *     but is action-oriented rather than allocation-oriented).
 *   - `WorkspaceDelta` describes the mutation to apply to the workspace.
 *   - `applyContractDecision` is the pure state-transition helper that the
 *     UI calls to materialise a decision into a new what-if scenario.
 *   - Generator functions are exported individually so tests can target them.
 *   - `compatibleTransferTargets` implements AltZertG / §3 Nr. 63 transfer rules.
 *
 * Surrender haircut defaults (why these numbers):
 *   - pAV 10 %: typical Stornoabzug under §169 VVG for contracts < 20 years old.
 *   - bAV 5 %:  §169 VVG Stornoabzug (Direktversicherung); for §3 Nr. 63 there is no
 *               statutory minimum-payout rule, so the 5 % is a conservative working assumption.
 *   - Riester/AVD 15 %: subsidy clawback (§21 EStG) can be 10-15 % of policy
 *               value on top of provider Stornoabzug; pessimistic default per spec.
 *   - Basisrente: surrender legally prohibited (§10 Abs. 2 EStG) — no option generated.
 */

import type { Workspace } from '../domain/workspace'
import type {
  BavInstance,
  AltersvorsorgedepotInstance,
  InstanceCommon,
  TransferEvent,
} from '../domain/instances'
import type { ProductId } from '../domain/products/common'
import { deepCloneScenario } from './portfolioState'
import { runRules, type Atom } from './recommendations'
import type { AtomId } from './recommendations'
import { avdDraftToInstance } from '../features/inventory/inventoryHelpers'
import { newInstanceId } from './workspaceIdentity'
import { de2026Rules } from '../rules/de2026'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContractDecision {
  /** Stable id — `${kind}-${instanceId}` or `${kind}-${sourceId}-to-${targetId}`. */
  id: string
  kind: 'weiterfuehren' | 'beitragsfrei' | 'kuendigen' | 'uebertragen' | 'beitrag-erhoehen' | 'beitrag-senken'
  /** German display label shown on the card. */
  label: string
  sourceInstanceId: string
  /** Only set for uebertragen. */
  targetInstanceId?: string
  /** 1-2 sentence description of what this option does. */
  description: string
  /** How to apply this decision to the workspace. */
  workspaceDelta: WorkspaceDelta
  /**
   * EUR/month difference in combined Netto-Rente vs baseline.
   * 0 for weiterfuehren; negative for surrender/paid-up; positive for transfer
   * to a better vehicle. Approximated from the workspace simulation; the full
   * re-simulation runs after the user clicks "Plan erstellen".
   */
  deltaNettoRente: number
  /** Trade-off labels from the rules engine relevant to this decision. */
  atoms: Atom[]
}

/**
 * A virtual target creates a new instance of the given product class and
 * applies a certified transfer into it. Used when no existing instance of
 * the target type is present (e.g. "Neuen AVD anlegen" when Riester→AVD
 * is the only certified transfer path and no AVD instance exists yet).
 *
 * Only AltZertG-eligible certified pairings emit virtual targets:
 *   - Riester → AVD (no existing AVD)
 * ETF surrender_reinvest does NOT get a virtual target — the spec does not
 * require it and the flow would be confusing.
 */
export type TransferTarget =
  | {
      kind: 'existing'
      targetInstance: InstanceCommon
      eventType: 'certified' | 'surrender_reinvest'
      caveat?: string
    }
  | {
      kind: 'create_new'
      productId: ProductId
      eventType: 'certified'
      caveat?: string
    }

export type WorkspaceDelta =
  | { kind: 'identity' }
  | { kind: 'paid_up'; instanceId: string; paidUpAtAge: number }
  | { kind: 'surrender'; instanceId: string; haircutPct: number; reallocateToInstanceId?: string }
  | {
      kind: 'transfer'
      sourceInstanceId: string
      targetInstanceId: string
      amountEUR: number | 'all'
      type: 'certified' | 'surrender_reinvest'
    }
  | {
      /** Create a new instance of targetProductId, then apply a certified transfer from source. */
      kind: 'transfer_to_new'
      sourceInstanceId: string
      targetProductId: ProductId
      amountEUR: number | 'all'
    }
  | { kind: 'increase_contribution'; instanceId: string; newMonthlyEUR: number }


// ---------------------------------------------------------------------------
// Default surrender haircut per product type
// ---------------------------------------------------------------------------

/**
 * Pessimistic surrender-haircut defaults keyed by instance-id prefix (product type).
 *
 * pAV 10 %:      §169 VVG Stornoabzug, typical for policies < 20 years (pessimistic default).
 * bAV 5 %:       §169 VVG Stornoabzug (Direktversicherung); for §3 Nr. 63 there is no
 *                statutory minimum-payout rule, so the 5 % is a conservative working assumption.
 * Riester 15 %:  provider Stornoabzug (~5-10 %) plus subsidy clawback risk (~5-10 %,
 *                §21 EStG Zulagen-Rückforderung) — combined worst-case.
 * AVD 10 %:      AltZertG §2 caps Stornoabzug at "reasonable"; 10 % is a conservative estimate.
 * ETF 0 %:       ETF index funds have no surrender penalty (liquid market).
 * Basisrente:    capital payout legally prohibited — never generate a kuendigen option.
 */
export const DEFAULT_HAIRCUT_BY_PREFIX: Record<string, number> = {
  'versicherung-': 0.10, // pAV
  'bav-': 0.05,           // bAV
  'riester-': 0.15,       // Riester
  'altersvorsorgedepot-': 0.10, // AVD
  'etf-': 0.00,           // ETF (no penalty)
}

export function defaultHaircutFor(instanceId: string): number {
  for (const [prefix, pct] of Object.entries(DEFAULT_HAIRCUT_BY_PREFIX)) {
    if (instanceId.startsWith(prefix)) return pct
  }
  return 0.10 // fallback
}

// ---------------------------------------------------------------------------
// Product type detection helpers
// ---------------------------------------------------------------------------

type ProductSlot = 'bav' | 'etf' | 'insurance' | 'basisrente' | 'altersvorsorgedepot' | 'riester'

function detectSlot(instanceId: string): ProductSlot {
  if (instanceId.startsWith('versicherung-')) return 'insurance'
  if (instanceId.startsWith('bav-')) return 'bav'
  if (instanceId.startsWith('etf-')) return 'etf'
  if (instanceId.startsWith('basisrente-')) return 'basisrente'
  if (instanceId.startsWith('altersvorsorgedepot-')) return 'altersvorsorgedepot'
  if (instanceId.startsWith('riester-')) return 'riester'
  // Structural fallback — used in tests with short ids
  return 'insurance'
}

function findInstanceById(
  workspace: Workspace,
  instanceId: string,
): InstanceCommon | undefined {
  const wsa = workspace.baseline.assumptions
  const lists: readonly InstanceCommon[][] = [
    wsa.bav, wsa.etf, wsa.insurance,
    wsa.basisrente, wsa.altersvorsorgedepot, wsa.riester,
  ]
  for (const arr of lists) {
    const m = arr.find((i) => i.instanceId === instanceId)
    if (m) return m
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Rules engine context builder (reuses workspace + empty sim result)
// ---------------------------------------------------------------------------

function buildRulesInput(workspace: Workspace) {
  return {
    workspace,
    simulationResult: { products: [] },
    combinedResult: { monthlyNetIncome: 0 } as import('../engine/portfolioCombine').CombinedResult,
  }
}

// ---------------------------------------------------------------------------
// Atom filtering by decision kind
// ---------------------------------------------------------------------------

/**
 * Atom ids that are relevant when KÜNDIGEN is the decision. These surface
 * as caveats on the kündigen card, warning the user about privileges they
 * would lose.
 */
const KUENDIGEN_RELEVANT_ATOM_IDS: ReadonlySet<AtomId> = new Set<AtomId>([
  'pre_2005_pav_taxfree_capital',
  'halbeinkuenfte_pav_eligible',
  'pre_2005_pav_high_garantiezins',
  'bav_40b_alt_eligible',
  'bav_durchfuehrungsweg_direktzusage',
])

/**
 * Atom ids relevant for beitragsfrei — warn about high-fee contracts stuck
 * in paid-up phase, or privilege atoms indicating value to preserve.
 */
const BEITRAGSFREI_RELEVANT_ATOM_IDS: ReadonlySet<AtomId> = new Set<AtomId>([
  'pre_2005_pav_taxfree_capital',
  'halbeinkuenfte_pav_eligible',
  'pre_2005_pav_high_garantiezins',
  'bav_40b_alt_eligible',
  'paid_up_high_fee_warning',
])

/**
 * Atom ids relevant for uebertragen (certified path privilege).
 */
const UEBERTRAGEN_RELEVANT_ATOM_IDS: ReadonlySet<AtomId> = new Set<AtomId>([
  'riester_to_avd_certified',
  'bav_40b_alt_eligible',
  'bav_durchfuehrungsweg_direktzusage',
  'pre_2005_pav_taxfree_capital',
])

function filterAtomsForDecision(
  atoms: Atom[],
  instanceId: string,
  relevantIds: ReadonlySet<AtomId>,
): Atom[] {
  return atoms.filter(
    (a) =>
      relevantIds.has(a.id) &&
      (a.context.instanceId === instanceId || a.context.instanceId === undefined),
  )
}

// ---------------------------------------------------------------------------
// New candidate-effect atoms (added inline — no engine dependency)
// ---------------------------------------------------------------------------

/** Emit `lose_pre_2005_privilege` when a pre-2005 pAV's vintage atom is present. */
function makeLosePre2005Atom(): Atom {
  return {
    id: 'lose_pre_2005_privilege',
    priority: 'high',
    context: {},
  }
}

function makePaidUpHighFeeAtom(riy: number): Atom {
  return {
    id: 'paid_up_high_fee_warning',
    priority: 'medium',
    context: { riyDecimal: riy },
  }
}

function makeRiesterToAvdCertifiedAtom(): Atom {
  return {
    id: 'riester_to_avd_certified',
    priority: 'high',
    context: {},
  }
}

// ---------------------------------------------------------------------------
// 1. weiterfuehrenWhatIf
// ---------------------------------------------------------------------------

/**
 * Identity decision — "keep this contract as-is". Used as the baseline card
 * within the menu. Never saved as a separate what-if.
 */
export function weiterfuehrenWhatIf(
  workspace: Workspace,
  instanceId: string,
): ContractDecision {
  const instance = findInstanceById(workspace, instanceId)
  const label = instance?.label ?? instanceId

  return {
    id: `weiterfuehren-${instanceId}`,
    kind: 'weiterfuehren',
    label: 'Weiterführen',
    sourceInstanceId: instanceId,
    description: `${label} läuft wie bisher weiter. Alle Beiträge und Konditionen bleiben unverändert.`,
    workspaceDelta: { kind: 'identity' },
    deltaNettoRente: 0,
    atoms: [],
  }
}

// ---------------------------------------------------------------------------
// 2. beitragsfreiWhatIf
// ---------------------------------------------------------------------------

/**
 * Flip the instance to `paid_up`. No more contributions; the contract
 * continues to accumulate on the existing balance under the paid-up fee model.
 *
 * Applicable to: bAV, pAV, Basisrente (though Basisrente paid-up is unusual),
 * Riester, AVD. Engine simulators honor `status === 'paid_up'` (zero
 * contributions, phase-2 fees, currentValueEUR carried as initial capital) —
 * see `src/engine/portfolioFunding.ts` "Beitragsfrei (paid_up) helpers".
 *
 * `paidUpAtAge` defaults to the user's current age from the profile.
 */
export function beitragsfreiWhatIf(
  workspace: Workspace,
  instanceId: string,
  paidUpAtAge?: number,
): ContractDecision {
  const instance = findInstanceById(workspace, instanceId)
  const label = instance?.label ?? instanceId
  const profile = workspace.baseline.profile
  const age = paidUpAtAge ?? profile.age

  // Collect atoms: vintage atoms for this instance + paid_up_high_fee_warning
  // when the contract has high fees.
  const allAtoms = runRules(buildRulesInput(workspace))
  const baseAtoms = filterAtomsForDecision(allAtoms, instanceId, BEITRAGSFREI_RELEVANT_ATOM_IDS)

  // Emit paid_up_high_fee_warning when the contract has >1.2 % effective fee.
  const HIGH_FEE_THRESHOLD = 0.012
  const slot = detectSlot(instanceId)
  let riy = 0
  if (slot === 'insurance') {
    const inst = workspace.baseline.assumptions.insurance.find((i) => i.instanceId === instanceId)
    if (inst) riy = inst.fees.wrapperAssetFee + inst.fees.fundAssetFee + inst.fees.pensionPayoutFeePct
  } else if (slot === 'bav') {
    const inst = workspace.baseline.assumptions.bav.find((i) => i.instanceId === instanceId)
    if (inst) riy = inst.fees.wrapperAssetFee + inst.fees.fundAssetFee + inst.fees.pensionPayoutFeePct
  } else if (slot === 'basisrente') {
    const inst = workspace.baseline.assumptions.basisrente.find((i) => i.instanceId === instanceId)
    if (inst) riy = inst.fees.wrapperAssetFee + inst.fees.fundAssetFee + inst.fees.pensionPayoutFeePct
  }
  const atoms = [...baseAtoms]
  if (riy > HIGH_FEE_THRESHOLD) {
    atoms.push(makePaidUpHighFeeAtom(riy))
  }

  return {
    id: `beitragsfrei-${instanceId}`,
    kind: 'beitragsfrei',
    label: 'Beitragsfrei stellen',
    sourceInstanceId: instanceId,
    description:
      `${label} wird ab Alter ${age} beitragsfrei gestellt. Beiträge entfallen; ` +
      'der angesparte Betrag wächst weiter auf Basis der bisherigen Anlage.',
    workspaceDelta: { kind: 'paid_up', instanceId, paidUpAtAge: age },
    deltaNettoRente: 0, // delta computed after applyContractDecision + re-simulation
    atoms,
  }
}

// ---------------------------------------------------------------------------
// 3. beitragErhoehenWhatIf
// ---------------------------------------------------------------------------

/**
 * Default first-render `newMonthlyEUR` = currentMonthly × 1.5, rounded to the
 * nearest €10.  Exposed so the modal's input field can initialise from here
 * without duplicating the formula.
 */
export function defaultBeitragErhoehenEUR(currentMonthlyEUR: number): number {
  return Math.round((currentMonthlyEUR * 1.5) / 10) * 10
}

/**
 * Annual statutory funding cap for each product slot.
 * Insurance and ETF have no relevant statutory cap → Infinity.
 */
function fundingCapAnnualFor(slot: ProductSlot): number {
  switch (slot) {
    case 'bav':
      return de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap
    case 'basisrente':
      return de2026Rules.basisrente.schicht1CapSingle
    case 'riester':
      return 2_100
    case 'altersvorsorgedepot':
      return de2026Rules.altersvorsorgedepot.contractContributionCapAnnual
    default:
      return Infinity
  }
}

/**
 * Increase a single instance's monthly contribution to `newMonthlyEUR`.
 *
 * Returns `null` when the instance has `status === 'surrendered'` or
 * `status === 'offered'` — those contracts cannot receive new contributions.
 *
 * Emits `funding_cap_hit` (priority `high`) when `newMonthlyEUR × 12`
 * exceeds the relevant statutory cap.  The applier writes `newMonthlyEUR`
 * verbatim — no auto-clamp — so the simulation naturally reflects cap
 * consequences (lost Zulagen, no §3 Nr. 63 deferral on excess, etc.).
 */
export function beitragErhoehenWhatIf(
  workspace: Workspace,
  instanceId: string,
  newMonthlyEUR: number,
): ContractDecision | null {
  const instance = findInstanceById(workspace, instanceId)
  if (!instance) return null
  if (instance.status === 'surrendered' || instance.status === 'offered') return null

  const label = instance.label ?? instanceId
  const slot = detectSlot(instanceId)

  // Determine old contribution for the description (each slot uses its own field name).
  let oldEUR: number
  if (slot === 'bav') {
    oldEUR = (instance as { monthlyGrossConversion?: number }).monthlyGrossConversion ?? 0
  } else if (slot === 'basisrente') {
    oldEUR = (instance as { monthlyGrossContribution?: number }).monthlyGrossContribution ?? 0
  } else if (slot === 'altersvorsorgedepot' || slot === 'riester') {
    oldEUR = (instance as { monthlyOwnContribution?: number }).monthlyOwnContribution ?? 0
  } else {
    // etf / insurance carry optional monthlyContribution
    oldEUR = (instance as { monthlyContribution?: number }).monthlyContribution ?? 0
  }

  // Suppress non-increases: proposed amount must be strictly above the current one.
  if (newMonthlyEUR <= oldEUR) return null

  // Funding-cap check.
  const atoms: Atom[] = []
  const capAnnualEUR = fundingCapAnnualFor(slot)
  const proposedAnnualEUR = newMonthlyEUR * 12
  if (isFinite(capAnnualEUR) && proposedAnnualEUR > capAnnualEUR) {
    atoms.push({
      id: 'funding_cap_hit',
      priority: 'high',
      context: { instanceId, capAnnualEUR, proposedAnnualEUR },
    })
  }

  return {
    id: `beitrag-erhoehen-${instanceId}-${Math.round(newMonthlyEUR)}`,
    kind: 'beitrag-erhoehen',
    label: 'Beitrag erhöhen',
    sourceInstanceId: instanceId,
    description: `${label}: Beitrag von ${Math.round(oldEUR)} € auf ${Math.round(newMonthlyEUR)} € pro Monat erhöhen.`,
    workspaceDelta: { kind: 'increase_contribution', instanceId, newMonthlyEUR },
    deltaNettoRente: 0,
    atoms,
  }
}

// ---------------------------------------------------------------------------
// 3b. beitragSenkenWhatIf
// ---------------------------------------------------------------------------

/**
 * Default first-render `newMonthlyEUR` for the Beitrag-senken row used in the
 * Vertrag-Detail scenario table (PR 7) — half the current contribution,
 * rounded to the nearest €10. Returns `null` when the current contribution
 * is too low for a sensible half (≤ €10) so the table can suppress the row.
 */
export function defaultBeitragSenkenEUR(currentMonthlyEUR: number): number | null {
  if (!isFinite(currentMonthlyEUR) || currentMonthlyEUR <= 10) return null
  return Math.round((currentMonthlyEUR * 0.5) / 10) * 10
}

/**
 * Decrease a single instance's monthly contribution to `newMonthlyEUR`.
 *
 * Sibling of `beitragErhoehenWhatIf`. Reuses the same `increase_contribution`
 * workspace delta (the applier writes the value verbatim regardless of
 * direction); the distinct `kind` lets the UI label the row differently
 * (`Beitrag senken` vs. `Beitrag erhöhen`) and lets callers route the
 * decision through `applyContractDecision` unchanged.
 *
 * Returns `null` when the instance is missing, has
 * `status === 'surrendered'` / `'offered'`, or when `newMonthlyEUR` is not
 * strictly less than the current contribution. No funding-cap atom is
 * emitted — a contribution decrease can never breach the statutory caps
 * the cap-hit warning protects against.
 */
export function beitragSenkenWhatIf(
  workspace: Workspace,
  instanceId: string,
  newMonthlyEUR: number,
): ContractDecision | null {
  const instance = findInstanceById(workspace, instanceId)
  if (!instance) return null
  if (instance.status === 'surrendered' || instance.status === 'offered') return null

  const label = instance.label ?? instanceId
  const slot = detectSlot(instanceId)

  // Determine old contribution for the description and the lower-bound guard.
  // Slot-keyed field reads mirror `beitragErhoehenWhatIf` exactly.
  let oldEUR: number
  if (slot === 'bav') {
    oldEUR = (instance as { monthlyGrossConversion?: number }).monthlyGrossConversion ?? 0
  } else if (slot === 'basisrente') {
    oldEUR = (instance as { monthlyGrossContribution?: number }).monthlyGrossContribution ?? 0
  } else if (slot === 'altersvorsorgedepot' || slot === 'riester') {
    oldEUR = (instance as { monthlyOwnContribution?: number }).monthlyOwnContribution ?? 0
  } else {
    oldEUR = (instance as { monthlyContribution?: number }).monthlyContribution ?? 0
  }

  // Suppress non-decreases: proposed amount must be strictly below the current one.
  // (A no-op decision would surface a misleading `Δ = 0` row in the Vertrag-Detail
  // scenario table; the page filters `null` decisions out of the row list.)
  if (newMonthlyEUR >= oldEUR) return null
  if (newMonthlyEUR < 0) return null

  return {
    id: `beitrag-senken-${instanceId}-${Math.round(newMonthlyEUR)}`,
    kind: 'beitrag-senken',
    label: 'Beitrag senken',
    sourceInstanceId: instanceId,
    description: `${label}: Beitrag von ${Math.round(oldEUR)} € auf ${Math.round(newMonthlyEUR)} € pro Monat senken.`,
    workspaceDelta: { kind: 'increase_contribution', instanceId, newMonthlyEUR },
    deltaNettoRente: 0,
    atoms: [],
  }
}

// ---------------------------------------------------------------------------
// 4. kuendigenWhatIf
// ---------------------------------------------------------------------------

/**
 * Surrender the contract. Marks the instance as `surrendered` and optionally
 * emits a `surrender_reinvest` transfer event to another instance.
 *
 * Basisrente: capital payout legally prohibited — returns `null`.
 * Caller must exclude it from the options list.
 */
export function kuendigenWhatIf(
  workspace: Workspace,
  instanceId: string,
  surrenderHaircutPct?: number,
  reallocateToInstanceId?: string,
): ContractDecision | null {
  // Basisrente: capital payout legally prohibited (§10 Abs. 2 EStG).
  if (detectSlot(instanceId) === 'basisrente') {
    return null
  }

  const instance = findInstanceById(workspace, instanceId)
  const label = instance?.label ?? instanceId
  const haircut = surrenderHaircutPct ?? defaultHaircutFor(instanceId)
  const haircutPct100 = Math.round(haircut * 100)

  // Atoms: any privilege atoms for this instance become caveats to losing them.
  const allAtoms = runRules(buildRulesInput(workspace))
  const privilegeAtoms = filterAtomsForDecision(allAtoms, instanceId, KUENDIGEN_RELEVANT_ATOM_IDS)

  const atoms = [...privilegeAtoms]
  // Add `lose_pre_2005_privilege` when the instance has the pre-2005 tax-free or
  // Halbeinkünfte privilege — surrendering loses the tax advantage.
  const hasPre2005Privilege = privilegeAtoms.some(
    (a) => a.id === 'pre_2005_pav_taxfree_capital' || a.id === 'halbeinkuenfte_pav_eligible',
  )
  if (hasPre2005Privilege) {
    atoms.push(makeLosePre2005Atom())
  }

  const reallocationNote = reallocateToInstanceId
    ? ' Der Erlös (nach Abzügen) wird in einen anderen Vertrag übertragen.'
    : ''

  return {
    id: reallocateToInstanceId
      ? `kuendigen-${instanceId}-to-${reallocateToInstanceId}`
      : `kuendigen-${instanceId}`,
    kind: 'kuendigen',
    label: 'Kündigen',
    sourceInstanceId: instanceId,
    targetInstanceId: reallocateToInstanceId,
    description:
      `${label} wird gekündigt. Geschätzter Stornoabzug: ${haircutPct100} % (🤔 Schätzung).` +
      reallocationNote,
    workspaceDelta: {
      kind: 'surrender',
      instanceId,
      haircutPct: haircut,
      reallocateToInstanceId,
    },
    deltaNettoRente: 0,
    atoms,
  }
}

// ---------------------------------------------------------------------------
// 4. compatibleTransferTargets
// ---------------------------------------------------------------------------

/**
 * Determine which instances (or virtual new instances) in the workspace can
 * receive a certified or surrender_reinvest transfer from `sourceInstance`.
 *
 * AltZertG / §3 Nr. 63 / Basisrente rules applied here:
 *   - Riester → AVD:              certified (AltZertG §1 Abs. 1 Nr. 4 explicit transfer path).
 *                                  If no AVD exists: emits a virtual "Neuen AVD anlegen" target.
 *   - AVD → Riester:              NOT allowed (AltZertG only allows Riester→AVD, not reverse).
 *   - AVD → AVD:                  REMOVED — no certified-transfer path between same-type AltZertG
 *                                  contracts; surrender_reinvest into certified products is
 *                                  validator-rejected (CERTIFIED_TARGET_PRODUCTS in scenarioSchema).
 *   - bAV → bAV (same DFW):       certified (§4 BetrAVG Übertragung).
 *   - bAV → bAV (diff DFW):       REMOVED — cross-DFW is a surrender + new contribution, not a
 *                                  transfer; validator rejects surrender_reinvest into bAV.
 *   - Basisrente → Basisrente:    certified (§10 Abs. 2 Satz 3 EStG provider change).
 *   - Riester → Riester:          REMOVED — no statutory transfer mechanism; user must surrender
 *                                  + start fresh. Validator would reject surrender_reinvest into
 *                                  a certified product.
 *   - pAV → pAV:                  REMOVED — surrender_reinvest into pAV would bypass that
 *                                  product's own contribution path; validator rejects it.
 *   - pAV → ETF:                  surrender_reinvest (valid; ETF is not a certified product).
 *   - bAV → ETF:                  surrender_reinvest (valid).
 *   - Riester → ETF:              surrender_reinvest (valid).
 */
export function compatibleTransferTargets(
  workspace: Workspace,
  sourceInstance: InstanceCommon,
): TransferTarget[] {
  const sourceId = sourceInstance.instanceId
  const sourceSlot = detectSlot(sourceId)
  const wsa = workspace.baseline.assumptions
  const targets: TransferTarget[] = []

  // Basisrente source: only other Basisrente instances (certified per §10 Abs. 2 Satz 3 EStG).
  if (sourceSlot === 'basisrente') {
    for (const inst of wsa.basisrente) {
      if (inst.instanceId === sourceId || inst.status === 'surrendered' || inst.status === 'offered') continue
      targets.push({ kind: 'existing', targetInstance: inst, eventType: 'certified' })
    }
    return targets
  }

  // Riester source: AVD instances are certified (AltZertG); surrender_reinvest only into ETF.
  // Riester→Riester and Riester→other certified products are excluded (validator-rejected).
  if (sourceSlot === 'riester') {
    const activeAvd = wsa.altersvorsorgedepot.filter((i) => i.status !== 'surrendered' && i.status !== 'offered')
    if (activeAvd.length > 0) {
      for (const inst of activeAvd) {
        targets.push({ kind: 'existing', targetInstance: inst, eventType: 'certified' })
      }
    } else {
      // No AVD exists yet — offer a virtual "Neuen AVD anlegen" target.
      targets.push({ kind: 'create_new', productId: 'altersvorsorgedepot', eventType: 'certified' })
    }
    // Riester → ETF: surrender_reinvest is valid (ETF is not a certified product).
    for (const inst of wsa.etf) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      targets.push({ kind: 'existing', targetInstance: inst, eventType: 'surrender_reinvest' })
    }
    return targets
  }

  // AVD source: AVD → Riester NOT allowed per AltZertG.
  // AVD → other AVD and AVD → certified products excluded (validator-rejected surrender_reinvest).
  // No valid certified or surrender_reinvest transfer targets for AVD.
  if (sourceSlot === 'altersvorsorgedepot') {
    return targets
  }

  // bAV source: only same-DFW bAV instances via certified path.
  // Cross-DFW excluded (validator-rejected surrender_reinvest into bAV).
  // bAV → ETF is valid as surrender_reinvest.
  if (sourceSlot === 'bav') {
    const sourceBav = wsa.bav.find((b) => b.instanceId === sourceId) as BavInstance | undefined
    for (const inst of wsa.bav) {
      if (inst.instanceId === sourceId || inst.status === 'surrendered' || inst.status === 'offered') continue
      if (sourceBav?.durchfuehrungsweg === inst.durchfuehrungsweg) {
        targets.push({ kind: 'existing', targetInstance: inst, eventType: 'certified' })
      }
      // Cross-DFW omitted: surrender_reinvest into bAV is validator-rejected.
    }
    for (const inst of wsa.etf) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      targets.push({ kind: 'existing', targetInstance: inst, eventType: 'surrender_reinvest' })
    }
    return targets
  }

  // Insurance (pAV) source: surrender_reinvest only into ETF.
  // pAV → pAV excluded (surrender_reinvest into certified products is validator-rejected for pAV
  // reuse; and transferring between pAV contracts is not a recognised statutory mechanism).
  // pAV → AVD excluded (surrender_reinvest into certified product is validator-rejected).
  if (sourceSlot === 'insurance') {
    for (const inst of wsa.etf) {
      if (inst.status === 'surrendered' || inst.status === 'offered') continue
      targets.push({ kind: 'existing', targetInstance: inst, eventType: 'surrender_reinvest' })
    }
    return targets
  }

  // ETF source: no valid transfer targets.
  // surrender_reinvest from ETF into certified products is validator-rejected
  // (ILLEGAL_SURRENDER_REINVEST_SOURCES in scenarioSchema). No other meaningful transfer.
  return targets
}

// ---------------------------------------------------------------------------
// 5. uebertragenWhatIf
// ---------------------------------------------------------------------------

/**
 * Emit a transfer event from source to an existing target instance.
 *
 * The transfer type is determined by `compatibleTransferTargets`:
 *   - Riester → AVD → `type: 'certified'`
 *   - bAV → bAV same DFW → `type: 'certified'`
 *   - All else → `type: 'surrender_reinvest'`
 */
export function uebertragenWhatIf(
  workspace: Workspace,
  sourceInstanceId: string,
  targetInstanceId: string,
  amountEUR: number | 'all',
): ContractDecision {
  const source = findInstanceById(workspace, sourceInstanceId)
  const target = findInstanceById(workspace, targetInstanceId)
  const sourceLabel = source?.label ?? sourceInstanceId
  const targetLabel = target?.label ?? targetInstanceId

  // Determine event type from compatible targets.
  const targets = source ? compatibleTransferTargets(workspace, source) : []
  const matchedTarget = targets.find(
    (t): t is Extract<TransferTarget, { kind: 'existing' }> =>
      t.kind === 'existing' && t.targetInstance.instanceId === targetInstanceId,
  )
  const eventType = matchedTarget?.eventType ?? 'surrender_reinvest'
  const caveat = matchedTarget?.caveat

  // Atoms: certified-transfer privilege atom for Riester → AVD.
  const atoms: Atom[] = []
  const sourceSlot = detectSlot(sourceInstanceId)
  const targetSlot = detectSlot(targetInstanceId)
  if (sourceSlot === 'riester' && targetSlot === 'altersvorsorgedepot') {
    atoms.push(makeRiesterToAvdCertifiedAtom())
  }

  const allAtoms = runRules(buildRulesInput(workspace))
  const relevantAtoms = filterAtomsForDecision(
    allAtoms,
    sourceInstanceId,
    UEBERTRAGEN_RELEVANT_ATOM_IDS,
  )
  atoms.push(...relevantAtoms)

  const eventLabel = eventType === 'certified' ? 'steuerneutral' : 'mit Steuer/Abzügen'
  const amountLabel = amountEUR === 'all' ? 'vollständig' : `${amountEUR} EUR`
  const description =
    `${sourceLabel} wird ${amountLabel} auf ${targetLabel} übertragen (${eventLabel}).` +
    (caveat ? ` Hinweis: ${caveat}` : '')

  return {
    id: `uebertragen-${sourceInstanceId}-to-${targetInstanceId}`,
    kind: 'uebertragen',
    label: `Übertragen auf ${targetLabel}`,
    sourceInstanceId,
    targetInstanceId,
    description,
    workspaceDelta: {
      kind: 'transfer',
      sourceInstanceId,
      targetInstanceId,
      amountEUR,
      type: eventType,
    },
    deltaNettoRente: 0,
    atoms,
  }
}

/**
 * Emit a "Übertragen auf neuen X" decision for a virtual target.
 * Called when `compatibleTransferTargets` emits a `kind: 'create_new'` entry —
 * e.g. Riester→AVD when no AVD instance exists yet.
 *
 * The workspaceDelta carries `kind: 'transfer_to_new'`; `applyContractDecision`
 * creates the new instance and then appends the certified transfer event.
 */
export function uebertragenVirtualWhatIf(
  workspace: Workspace,
  sourceInstanceId: string,
  targetProductId: ProductId,
  amountEUR: number | 'all',
): ContractDecision {
  const source = findInstanceById(workspace, sourceInstanceId)
  const sourceLabel = source?.label ?? sourceInstanceId
  const productLabel = targetProductId === 'altersvorsorgedepot' ? 'Altersvorsorgedepot' : targetProductId

  // Atoms: certified-transfer privilege atom for Riester → AVD.
  const atoms: Atom[] = []
  const sourceSlot = detectSlot(sourceInstanceId)
  if (sourceSlot === 'riester' && targetProductId === 'altersvorsorgedepot') {
    atoms.push(makeRiesterToAvdCertifiedAtom())
  }

  const allAtoms = runRules(buildRulesInput(workspace))
  const relevantAtoms = filterAtomsForDecision(
    allAtoms,
    sourceInstanceId,
    UEBERTRAGEN_RELEVANT_ATOM_IDS,
  )
  atoms.push(...relevantAtoms)

  const amountLabel = amountEUR === 'all' ? 'vollständig' : `${amountEUR} EUR`
  const description =
    `${sourceLabel} wird ${amountLabel} steuerneutral auf ein neues ${productLabel} übertragen. ` +
    `Ein neues ${productLabel} wird dabei angelegt.`

  return {
    id: `uebertragen-${sourceInstanceId}-to-new-${targetProductId}`,
    kind: 'uebertragen',
    label: `Übertragen auf neues ${productLabel}`,
    sourceInstanceId,
    description,
    workspaceDelta: {
      kind: 'transfer_to_new',
      sourceInstanceId,
      targetProductId,
      amountEUR,
    },
    deltaNettoRente: 0,
    atoms,
  }
}

// ---------------------------------------------------------------------------
// 6. applyContractDecision
// ---------------------------------------------------------------------------

/**
 * Pure function: returns a deep-cloned workspace with the decision's delta applied.
 * Does NOT trigger any simulation — caller is responsible for re-simulating.
 *
 * `currentYear` defaults to `de2026Rules.year` so the function is deterministic
 * in tests and avoids `new Date().getFullYear()` non-determinism.
 */
export function applyContractDecision(
  workspace: Workspace,
  decision: ContractDecision,
  currentYear: number = de2026Rules.year,
): Workspace {
  const cloned = deepCloneScenario(workspace)
  const delta = decision.workspaceDelta
  const wsa = cloned.baseline.assumptions

  if (delta.kind === 'identity') {
    return cloned
  }

  if (delta.kind === 'paid_up') {
    applyPaidUp(wsa, delta.instanceId)
    return cloned
  }

  if (delta.kind === 'surrender') {
    applySurrender(wsa, delta.instanceId, delta.haircutPct, delta.reallocateToInstanceId, currentYear)
    return cloned
  }

  if (delta.kind === 'transfer') {
    applyTransfer(wsa, delta, currentYear)
    return cloned
  }

  if (delta.kind === 'transfer_to_new') {
    applyTransferToNew(wsa, delta, currentYear)
    return cloned
  }

  if (delta.kind === 'increase_contribution') {
    applyIncreaseContribution(wsa, delta.instanceId, delta.newMonthlyEUR)
    return cloned
  }

  return cloned
}

// ---------------------------------------------------------------------------
// Minimal-instance factory for virtual transfer targets (Q2)
// ---------------------------------------------------------------------------

/**
 * Create a sensible default instance for a product class when the user
 * picks a virtual "Neuen X anlegen" transfer target. Only AVD is supported
 * today — that is the only AltZertG-eligible certified target that may not
 * exist yet in the workspace.
 */
function createMinimalInstance(
  productId: ProductId,
  contractStartYear: number,
): InstanceCommon {
  if (productId === 'altersvorsorgedepot') {
    const inst = avdDraftToInstance({
      productId: 'altersvorsorgedepot',
      status: 'active',
      contractStartYear,
      currentValueEUR: 0,
      monthlyContribution: 0,
      anbieter: undefined,
      subtype: 'standarddepot',
      useGlidepath: true,
    })
    return { ...inst, instanceId: newInstanceId('altersvorsorgedepot'), label: 'Altersvorsorgedepot (neu)' }
  }
  // Extend this switch when additional certified transfer targets are added.
  throw new Error(`createMinimalInstance: unsupported productId ${String(productId)}`)
}

// ---------------------------------------------------------------------------
// Delta appliers
// ---------------------------------------------------------------------------

/**
 * Write `newMonthlyEUR` verbatim onto the contribution field(s) of the
 * matching instance.  Deep-clone semantics are handled by the caller
 * (`applyContractDecision` clones the workspace before invoking this).
 *
 * Field mapping per slot:
 *   bav              → `monthlyGrossConversion`
 *   etf              → `monthlyContribution`
 *   insurance        → `monthlyContribution`
 *   basisrente       → `monthlyGrossContribution`
 *   altersvorsorgedepot → `monthlyOwnContribution`
 *   riester          → `monthlyOwnContribution`
 */
function applyIncreaseContribution(
  wsa: Workspace['baseline']['assumptions'],
  instanceId: string,
  newMonthlyEUR: number,
): void {
  const slot = detectSlot(instanceId)

  if (slot === 'bav') {
    const idx = wsa.bav.findIndex((i) => i.instanceId === instanceId)
    if (idx >= 0) {
      wsa.bav[idx] = { ...wsa.bav[idx], monthlyGrossConversion: newMonthlyEUR }
    }
  } else if (slot === 'etf') {
    const idx = wsa.etf.findIndex((i) => i.instanceId === instanceId)
    if (idx >= 0) {
      wsa.etf[idx] = { ...wsa.etf[idx], monthlyContribution: newMonthlyEUR }
    }
  } else if (slot === 'insurance') {
    const idx = wsa.insurance.findIndex((i) => i.instanceId === instanceId)
    if (idx >= 0) {
      wsa.insurance[idx] = { ...wsa.insurance[idx], monthlyContribution: newMonthlyEUR }
    }
  } else if (slot === 'basisrente') {
    const idx = wsa.basisrente.findIndex((i) => i.instanceId === instanceId)
    if (idx >= 0) {
      wsa.basisrente[idx] = { ...wsa.basisrente[idx], monthlyGrossContribution: newMonthlyEUR }
    }
  } else if (slot === 'altersvorsorgedepot') {
    const idx = wsa.altersvorsorgedepot.findIndex((i) => i.instanceId === instanceId)
    if (idx >= 0) {
      wsa.altersvorsorgedepot[idx] = { ...wsa.altersvorsorgedepot[idx], monthlyOwnContribution: newMonthlyEUR }
    }
  } else if (slot === 'riester') {
    const idx = wsa.riester.findIndex((i) => i.instanceId === instanceId)
    if (idx >= 0) {
      wsa.riester[idx] = { ...wsa.riester[idx], monthlyOwnContribution: newMonthlyEUR }
    }
  }
}

function applyPaidUp(wsa: Workspace['baseline']['assumptions'], instanceId: string): void {
  const slot = detectSlot(instanceId)
  if (slot === 'bav') {
    updateStatus(wsa.bav, instanceId, 'paid_up')
  } else if (slot === 'insurance') {
    updateStatus(wsa.insurance, instanceId, 'paid_up')
  } else if (slot === 'basisrente') {
    updateStatus(wsa.basisrente, instanceId, 'paid_up')
  } else if (slot === 'altersvorsorgedepot') {
    updateStatus(wsa.altersvorsorgedepot, instanceId, 'paid_up')
  } else if (slot === 'riester') {
    updateStatus(wsa.riester, instanceId, 'paid_up')
  }
}

function applySurrender(
  wsa: Workspace['baseline']['assumptions'],
  instanceId: string,
  haircutPct: number,
  reallocateToInstanceId: string | undefined,
  currentYear: number,
): void {
  const slot = detectSlot(instanceId)
  if (slot === 'bav') {
    updateStatus(wsa.bav, instanceId, 'surrendered')
  } else if (slot === 'insurance') {
    updateStatus(wsa.insurance, instanceId, 'surrendered')
  } else if (slot === 'altersvorsorgedepot') {
    updateStatus(wsa.altersvorsorgedepot, instanceId, 'surrendered')
  } else if (slot === 'riester') {
    updateStatus(wsa.riester, instanceId, 'surrendered')
  } else if (slot === 'etf') {
    updateStatus(wsa.etf, instanceId, 'surrendered')
  }

  // If reallocating, append a surrender_reinvest transfer event to both instances:
  // source carries "capital left"; target carries "capital received".
  if (reallocateToInstanceId) {
    const sourceInstance = findInstanceInWsa(wsa, instanceId)
    const amount = sourceInstance?.currentValueEUR ?? 0
    const event: TransferEvent = {
      type: 'surrender_reinvest',
      year: currentYear,
      sourceInstanceId: instanceId,
      targetInstanceId: reallocateToInstanceId,
      amountEUR: amount,
      surrenderHaircutPct: haircutPct,
    }
    appendTransferEvent(wsa, instanceId, event)
    appendTransferEvent(wsa, reallocateToInstanceId, event)
  }
}

function applyTransfer(
  wsa: Workspace['baseline']['assumptions'],
  delta: Extract<WorkspaceDelta, { kind: 'transfer' }>,
  currentYear: number,
): void {
  const sourceInstance = findInstanceInWsa(wsa, delta.sourceInstanceId)
  const amount: number =
    delta.amountEUR === 'all'
      ? (sourceInstance?.currentValueEUR ?? 0)
      : delta.amountEUR

  const event: TransferEvent =
    delta.type === 'certified'
      ? {
          type: 'certified',
          year: currentYear,
          sourceInstanceId: delta.sourceInstanceId,
          targetInstanceId: delta.targetInstanceId,
          amountEUR: amount,
        }
      : {
          type: 'surrender_reinvest',
          year: currentYear,
          sourceInstanceId: delta.sourceInstanceId,
          targetInstanceId: delta.targetInstanceId,
          amountEUR: amount,
          surrenderHaircutPct: defaultHaircutFor(delta.sourceInstanceId),
        }

  // Append to both instances: source carries "capital left"; target carries "capital received".
  appendTransferEvent(wsa, delta.sourceInstanceId, event)
  appendTransferEvent(wsa, delta.targetInstanceId, event)
}

function applyTransferToNew(
  wsa: Workspace['baseline']['assumptions'],
  delta: Extract<WorkspaceDelta, { kind: 'transfer_to_new' }>,
  currentYear: number,
): void {
  // Create a new minimal AVD instance and add it to the workspace assumptions.
  const newInst = createMinimalInstance(delta.targetProductId, currentYear)
  if (delta.targetProductId === 'altersvorsorgedepot') {
    wsa.altersvorsorgedepot = [...wsa.altersvorsorgedepot, newInst as AltersvorsorgedepotInstance]
  }
  // Apply the certified transfer event from source to the newly created instance.
  applyTransfer(
    wsa,
    {
      kind: 'transfer',
      sourceInstanceId: delta.sourceInstanceId,
      targetInstanceId: newInst.instanceId,
      amountEUR: delta.amountEUR,
      type: 'certified',
    },
    currentYear,
  )
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function updateStatus(
  arr: InstanceCommon[],
  instanceId: string,
  status: InstanceCommon['status'],
): void {
  const idx = arr.findIndex((i) => i.instanceId === instanceId)
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], status }
  }
}

function appendTransferEvent(
  wsa: Workspace['baseline']['assumptions'],
  instanceId: string,
  event: TransferEvent,
): void {
  const slot = detectSlot(instanceId)
  type WithTransfer = InstanceCommon & { transferEvents?: TransferEvent[] }
  const arr: WithTransfer[] = slot === 'bav' ? wsa.bav :
    slot === 'insurance' ? wsa.insurance :
    slot === 'etf' ? wsa.etf :
    slot === 'basisrente' ? wsa.basisrente :
    slot === 'altersvorsorgedepot' ? wsa.altersvorsorgedepot :
    wsa.riester
  const idx = arr.findIndex((i) => i.instanceId === instanceId)
  if (idx >= 0) {
    const existing = arr[idx].transferEvents ?? []
    arr[idx] = { ...arr[idx], transferEvents: [...existing, event] }
  }
}

function findInstanceInWsa(
  wsa: Workspace['baseline']['assumptions'],
  instanceId: string,
): InstanceCommon | undefined {
  const lists: readonly InstanceCommon[][] = [
    wsa.bav, wsa.etf, wsa.insurance,
    wsa.basisrente, wsa.altersvorsorgedepot, wsa.riester,
  ]
  for (const arr of lists) {
    const m = arr.find((i) => i.instanceId === instanceId)
    if (m) return m
  }
  return undefined
}

// ---------------------------------------------------------------------------
// 7. generateContractDecisions — convenience aggregate
// ---------------------------------------------------------------------------

/**
 * Generate all applicable decisions for an instance.
 *
 * Basisrente: kuendigen is excluded (legally prohibited).
 * Surrendered instances: returns empty array.
 * Active or paid-up: returns weiterfuehren + beitragsfrei (where applicable) +
 *   kuendigen (if not basisrente) + uebertragen (for each compatible target, max 2).
 *
 * Beitragsfrei: wired across all 5 contributing simulators (bAV, pAV,
 * Basisrente, AVD, Riester). ETF instances do not get a beitragsfrei card —
 * there are no contributions to stop and no acquisition costs to drop; the
 * user simply lowers `monthlyContribution` to 0. Already-paid-up instances
 * also do not show the card (would be a no-op).
 */
export function generateContractDecisions(
  workspace: Workspace,
  instanceId: string,
): ContractDecision[] {
  const instance = findInstanceById(workspace, instanceId)
  if (!instance || instance.status === 'surrendered' || instance.status === 'offered') return []

  const decisions: ContractDecision[] = []

  // 1. Weiterfuehren (always first)
  decisions.push(weiterfuehrenWhatIf(workspace, instanceId))

  // 2. Beitragsfrei (skip ETF — no acquisition fees / contribution-stop semantics
  // distinct from "set monthlyContribution to 0"; skip already-paid-up instances).
  const slot = detectSlot(instanceId)
  if (slot !== 'etf' && instance.status !== 'paid_up') {
    decisions.push(beitragsfreiWhatIf(workspace, instanceId))
  }

  // 3. Kuendigen (not for Basisrente — capital payout legally prohibited)
  const kuendigen = kuendigenWhatIf(workspace, instanceId)
  if (kuendigen) {
    decisions.push(kuendigen)
  }

  // 4. Uebertragen (for each compatible target, max 2 to keep card count manageable)
  const targets = compatibleTransferTargets(workspace, instance)
  for (const t of targets.slice(0, 2)) {
    if (t.kind === 'existing') {
      decisions.push(
        uebertragenWhatIf(workspace, instanceId, t.targetInstance.instanceId, 'all'),
      )
    } else {
      // Virtual target: "Neuen X anlegen" — creates instance + certified transfer.
      decisions.push(
        uebertragenVirtualWhatIf(workspace, instanceId, t.productId, 'all'),
      )
    }
  }

  return decisions
}
