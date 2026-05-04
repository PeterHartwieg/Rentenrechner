/**
 * Per-contract decision generators (Group G issue 14, milestone M3.5).
 *
 * Pure module — no React imports, no DOM access.
 *
 * Generates up to four pre-built what-ifs for a specific instance in the
 * workspace: Weiterführen / Beitragsfrei / Kündigen / Übertragen.
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
 *   - bAV 5 %:  directversicherung §3 Nr. 63 transfers have lower penalty because
 *               the employer may offer portability; DZ/UK usually zero haircut on
 *               certified transfer but we default 5 % for surrender path.
 *   - Riester/AVD 15 %: subsidy clawback (§21 EStG) can be 10-15 % of policy
 *               value on top of provider Stornoabzug; pessimistic default per spec.
 *   - Basisrente: surrender legally prohibited (§10 Abs. 2 EStG) — no option generated.
 */

import type { Workspace } from '../domain/workspace'
import type {
  BavInstance,
  InstanceCommon,
  TransferEvent,
} from '../domain/instances'
import { deepCloneScenario } from './portfolioState'
import { runRules, type Atom } from './recommendations'
import type { AtomId } from './recommendations'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContractDecision {
  /** Stable id — `${kind}-${instanceId}` or `${kind}-${sourceId}-to-${targetId}`. */
  id: string
  kind: 'weiterfuehren' | 'beitragsfrei' | 'kuendigen' | 'uebertragen'
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

export interface TransferTarget {
  targetInstance: InstanceCommon
  eventType: 'certified' | 'surrender_reinvest'
  /** Optional warning shown on the card (e.g. "AVD → Riester not supported"). */
  caveat?: string
}

// ---------------------------------------------------------------------------
// Default surrender haircut per product type
// ---------------------------------------------------------------------------

/**
 * Pessimistic surrender-haircut defaults keyed by instance-id prefix (product type).
 *
 * pAV 10 %:      §169 VVG Stornoabzug, typical for policies < 20 years (pessimistic default).
 * bAV 5 %:       §3 Nr. 63 Direktversicherung portability; lower than pAV due to mandatory
 *                minimum payout of contributions on termination (§2 Abs. 2 BetrAVG).
 * Riester 15 %:  provider Stornoabzug (~5-10 %) plus subsidy clawback risk (~5-10 %,
 *                §21 EStG Zulagen-Rückforderung) — combined worst-case.
 * AVD 10 %:      AltZertG §2 caps Stornoabzug at "reasonable"; 10 % is a conservative estimate.
 * ETF 0 %:       ETF index funds have no surrender penalty (liquid market).
 * Basisrente:    capital payout legally prohibited — never generate a kuendigen option.
 */
const DEFAULT_HAIRCUT_BY_PREFIX: Record<string, number> = {
  'versicherung-': 0.10, // pAV
  'bav-': 0.05,           // bAV
  'riester-': 0.15,       // Riester
  'altersvorsorgedepot-': 0.10, // AVD
  'etf-': 0.00,           // ETF (no penalty)
}

function defaultHaircutFor(instanceId: string): number {
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
 * Riester, AVD.
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
    if (inst) riy = inst.fees.wrapperAssetFee + inst.fees.fundAssetFee
  } else if (slot === 'bav') {
    const inst = workspace.baseline.assumptions.bav.find((i) => i.instanceId === instanceId)
    if (inst) riy = inst.fees.wrapperAssetFee + inst.fees.fundAssetFee
  } else if (slot === 'basisrente') {
    const inst = workspace.baseline.assumptions.basisrente.find((i) => i.instanceId === instanceId)
    if (inst) riy = inst.fees.wrapperAssetFee + inst.fees.fundAssetFee
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
// 3. kuendigenWhatIf
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
  if (instanceId.startsWith('basisrente-') || detectSlot(instanceId) === 'basisrente') {
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
 * Determine which instances in the workspace can receive a certified or
 * surrender_reinvest transfer from `sourceInstance`.
 *
 * AltZertG / §3 Nr. 63 / Basisrente rules:
 *   - Riester → AVD:           certified (AltZertG §1 Abs. 1 Nr. 4 explicit transfer path).
 *   - AVD → Riester:           NOT allowed (AltZertG only allows Riester→AVD, not reverse).
 *   - bAV → bAV (same DFW):    certified if same Durchführungsweg (§4 BetrAVG Übertragung).
 *   - bAV → bAV (diff DFW):    surrender_reinvest (taxable event).
 *   - Basisrente → Basisrente: certified (§10 Abs. 2 Satz 3 EStG provider change).
 *   - pAV → pAV:               surrender_reinvest with caveat about lost privileges.
 *   - All else:                 surrender_reinvest.
 */
export function compatibleTransferTargets(
  workspace: Workspace,
  sourceInstance: InstanceCommon,
): TransferTarget[] {
  const sourceId = sourceInstance.instanceId
  const sourceSlot = detectSlot(sourceId)
  const wsa = workspace.baseline.assumptions
  const targets: TransferTarget[] = []

  // Basisrente source: only other Basisrente instances (certified).
  if (sourceSlot === 'basisrente') {
    for (const inst of wsa.basisrente) {
      if (inst.instanceId === sourceId || inst.status === 'surrendered') continue
      targets.push({ targetInstance: inst, eventType: 'certified' })
    }
    return targets
  }

  // Riester source: AVD instances are certified; anything else is surrender_reinvest.
  if (sourceSlot === 'riester') {
    for (const inst of wsa.altersvorsorgedepot) {
      if (inst.status === 'surrendered') continue
      targets.push({
        targetInstance: inst,
        eventType: 'certified',
      })
    }
    // Also riester → riester (same product type, surrender_reinvest — different provider).
    for (const inst of wsa.riester) {
      if (inst.instanceId === sourceId || inst.status === 'surrendered') continue
      targets.push({
        targetInstance: inst,
        eventType: 'surrender_reinvest',
        caveat: 'Anbieter-Wechsel bei Riester: Zulagen-Rückforderung prüfen.',
      })
    }
    return targets
  }

  // AVD source: AVD → Riester NOT allowed per AltZertG.
  if (sourceSlot === 'altersvorsorgedepot') {
    // AVD → other AVD: surrender_reinvest (no certified path defined in AltZertG for same-type).
    for (const inst of wsa.altersvorsorgedepot) {
      if (inst.instanceId === sourceId || inst.status === 'surrendered') continue
      targets.push({ targetInstance: inst, eventType: 'surrender_reinvest' })
    }
    // Note: AVD → Riester deliberately excluded (AltZertG does not support reverse transfer).
    return targets
  }

  // bAV source.
  if (sourceSlot === 'bav') {
    const sourceBav = wsa.bav.find((b) => b.instanceId === sourceId) as BavInstance | undefined
    for (const inst of wsa.bav) {
      if (inst.instanceId === sourceId || inst.status === 'surrendered') continue
      // §4 BetrAVG: certified transfer when same Durchführungsweg.
      const sameType =
        sourceBav?.durchfuehrungsweg === inst.durchfuehrungsweg
      targets.push({
        targetInstance: inst,
        eventType: sameType ? 'certified' : 'surrender_reinvest',
        caveat: sameType ? undefined : 'Unterschiedliche Durchführungswege — als Kündigung + Neuanlage behandelt.',
      })
    }
    return targets
  }

  // Insurance (pAV) source: surrender_reinvest to any other instance type.
  if (sourceSlot === 'insurance') {
    for (const inst of [...wsa.insurance, ...wsa.etf, ...wsa.altersvorsorgedepot]) {
      if ((inst as InstanceCommon).instanceId === sourceId) continue
      if ((inst as InstanceCommon).status === 'surrendered') continue
      targets.push({
        targetInstance: inst as InstanceCommon,
        eventType: 'surrender_reinvest',
        caveat: detectSlot((inst as InstanceCommon).instanceId) === 'insurance'
          ? 'Verlust von Altvertrag-Privilegien prüfen.'
          : undefined,
      })
    }
    return targets
  }

  // ETF source: surrender_reinvest to any other ETF or AVD.
  for (const inst of [...wsa.etf, ...wsa.altersvorsorgedepot]) {
    if ((inst as InstanceCommon).instanceId === sourceId) continue
    if ((inst as InstanceCommon).status === 'surrendered') continue
    targets.push({ targetInstance: inst as InstanceCommon, eventType: 'surrender_reinvest' })
  }
  return targets
}

// ---------------------------------------------------------------------------
// 5. uebertragenWhatIf
// ---------------------------------------------------------------------------

/**
 * Emit a transfer event from source to target.
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
  const matchedTarget = targets.find((t) => t.targetInstance.instanceId === targetInstanceId)
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

// ---------------------------------------------------------------------------
// 6. applyContractDecision
// ---------------------------------------------------------------------------

/**
 * Pure function: returns a deep-cloned workspace with the decision's delta applied.
 * Does NOT trigger any simulation — caller is responsible for re-simulating.
 */
export function applyContractDecision(
  workspace: Workspace,
  decision: ContractDecision,
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
    applySurrender(wsa, delta.instanceId, delta.haircutPct, delta.reallocateToInstanceId)
    return cloned
  }

  if (delta.kind === 'transfer') {
    applyTransfer(wsa, delta)
    return cloned
  }

  return cloned
}

// ---------------------------------------------------------------------------
// Delta appliers
// ---------------------------------------------------------------------------

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
  reallocateToInstanceId?: string,
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

  // If reallocating, append a surrender_reinvest transfer event on the target instance.
  if (reallocateToInstanceId) {
    const sourceInstance = findInstanceInWsa(wsa, instanceId)
    const amount = sourceInstance?.currentValueEUR ?? 0
    const event: TransferEvent = {
      type: 'surrender_reinvest',
      year: new Date().getFullYear(),
      sourceInstanceId: instanceId,
      targetInstanceId: reallocateToInstanceId,
      amountEUR: amount,
      surrenderHaircutPct: haircutPct,
    }
    appendTransferEvent(wsa, reallocateToInstanceId, event)
  }
}

function applyTransfer(
  wsa: Workspace['baseline']['assumptions'],
  delta: Extract<WorkspaceDelta, { kind: 'transfer' }>,
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
          year: new Date().getFullYear(),
          sourceInstanceId: delta.sourceInstanceId,
          targetInstanceId: delta.targetInstanceId,
          amountEUR: amount,
        }
      : {
          type: 'surrender_reinvest',
          year: new Date().getFullYear(),
          sourceInstanceId: delta.sourceInstanceId,
          targetInstanceId: delta.targetInstanceId,
          amountEUR: amount,
          surrenderHaircutPct: defaultHaircutFor(delta.sourceInstanceId),
        }

  // Append to the SOURCE instance's transferEvents array.
  appendTransferEvent(wsa, delta.sourceInstanceId, event)
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
 * Active or paid-up: returns weiterfuehren + beitragsfrei (if not already paid_up) +
 *   kuendigen (if not basisrente) + uebertragen (for each compatible target).
 */
export function generateContractDecisions(
  workspace: Workspace,
  instanceId: string,
): ContractDecision[] {
  const instance = findInstanceById(workspace, instanceId)
  if (!instance || instance.status === 'surrendered') return []

  const decisions: ContractDecision[] = []

  // 1. Weiterfuehren (always first)
  decisions.push(weiterfuehrenWhatIf(workspace, instanceId))

  // 2. Beitragsfrei (if not already paid_up)
  if (instance.status !== 'paid_up') {
    decisions.push(beitragsfreiWhatIf(workspace, instanceId))
  }

  // 3. Kuendigen (not for Basisrente)
  const kuendigen = kuendigenWhatIf(workspace, instanceId)
  if (kuendigen) {
    decisions.push(kuendigen)
  }

  // 4. Uebertragen (for each compatible target, max 2 to keep card count manageable)
  const targets = compatibleTransferTargets(workspace, instance)
  for (const t of targets.slice(0, 2)) {
    decisions.push(
      uebertragenWhatIf(workspace, instanceId, t.targetInstance.instanceId, 'all'),
    )
  }

  return decisions
}
