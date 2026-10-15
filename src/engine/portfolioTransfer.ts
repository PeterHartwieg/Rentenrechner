/**
 * portfolioTransfer — Transfer event collection and instance capital-policy construction.
 *
 * Extracted from portfolioAdapter.ts (architecture-readability issue 04).
 *
 * This module owns:
 *  - Transfer event collection from a workspace (outbound / inbound buckets).
 *  - Calendar-year to contract-year conversion.
 *  - Instance lookup by ID across all product arrays.
 *  - Surrender-tax computation for `surrender_reinvest` events.
 *  - `buildInstanceCapitalPolicy` — the public entry point that ties all the
 *    above together into an `InstanceCapitalPolicy` consumed by `buildContext`.
 *
 * The `transferEventKey` shape is defined in `src/storage.ts` and is used
 * there for deduplication during backfill. This module does not call it directly
 * because transfer collection routes by instance ownership rather than key
 * matching, but consumers may import it from storage.ts when they need stable
 * composite keys (e.g. future deduplication in portfolioTransfer itself).
 *
 * Pure: no DOM, no I/O.
 */

import type { GermanRules } from '../domain'
import type { Workspace, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type {
  AltersvorsorgedepotInstance,
  BavInstance,
  BasisrenteInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
  TransferEvent,
} from '../domain/instances'
import type { InstanceCapitalPolicy } from './simulationContext'
import { afterTaxInsuranceLumpSum, deriveInsuranceTaxMode } from './insurancePayout'
import { afterTaxBavLumpSum, deriveBavLumpSumTaxMode } from './bavPayout'
import { afterTaxRiesterLumpSum } from './riester'
import { afterTaxAvdLumpSum } from './altersvorsorgedepot'
import { detectProductSlot } from './portfolioProjection'

// Re-exported for back-compat with callers (and tests) that imported it from
// this module. Canonical home is `portfolioProjection.ts` (issue 03).
export { detectProductSlot }

// ---------------------------------------------------------------------------
// AnyInstance
// ---------------------------------------------------------------------------

/** All instance-shaped types accepted by the transfer helpers. */
export type AnyInstance =
  | BavInstance
  | EtfInstance
  | InsuranceInstance
  | BasisrenteInstance
  | AltersvorsorgedepotInstance
  | RiesterInstance

// ---------------------------------------------------------------------------
// Instance lookup
// ---------------------------------------------------------------------------

/**
 * Walk every instance array in the workspace and return the instance whose
 * `instanceId` matches `id`. Returns `undefined` when no match is found.
 */
export function findInstanceById(workspace: Workspace, id: string): AnyInstance | undefined {
  const wsa = workspace.baseline.assumptions
  const lists: readonly AnyInstance[][] = [
    wsa.bav, wsa.etf, wsa.insurance,
    wsa.basisrente, wsa.altersvorsorgedepot, wsa.riester,
  ]
  for (const arr of lists) {
    const m = arr.find(i => i.instanceId === id)
    if (m) return m
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Calendar-year → contract-year conversion
// ---------------------------------------------------------------------------

/**
 * Convert a calendar-year `TransferEvent.year` into the 1-based contract year
 * used by `AccumulationPolicy.capitalInjections / capitalWithdrawals`.
 *
 * Contract year 1 = `rules.year` (today). An event scheduled for `rules.year`
 * applies at the start of the first projection year (functionally additive to
 * `initialCapital`); an event scheduled for `rules.year + 5` applies at the
 * start of contract year 6.
 *
 * Years before `rules.year` clamp to year 1; years after the projection
 * horizon are returned as-is (the accumulation loop simply will not encounter
 * that year and the entry has no effect — no error needed).
 */
export function eventCalendarYearToContractYear(eventYear: number, rulesYear: number): number {
  return Math.max(1, eventYear - rulesYear + 1)
}

// ---------------------------------------------------------------------------
// Transfer event collection
// ---------------------------------------------------------------------------

/**
 * Walk every instance in the workspace and collect transfer events that target
 * `targetInstanceId` (inbound) or originate from `sourceInstanceId` (outbound).
 *
 * The discriminated union is preserved so the caller can branch on type when
 * computing surrender tax (only relevant for `surrender_reinvest`).
 *
 * Build one canonical occurrence list: source-array order wins, mirrored
 * target occurrences pair with it, and unmatched one-sided occurrences are
 * repaired in memory. Intentional repeated identical withdrawals remain
 * distinct; their mirrored copies do not count twice. Both bucket maps use
 * that same list. Storage backfill is still responsible for persisted parity.
 * Events carried by neither source nor target are warned and skipped.
 */
export function collectTransferEvents(
  wsa: WorkspaceAssumptionsV2,
): {
  outboundBy: Map<string, TransferEvent[]>
  inboundBy: Map<string, TransferEvent[]>
} {
  const outboundBy = new Map<string, TransferEvent[]>()
  const inboundBy = new Map<string, TransferEvent[]>()
  const allInstances: AnyInstance[] = [
    ...wsa.bav, ...wsa.etf, ...wsa.insurance,
    ...wsa.basisrente, ...wsa.altersvorsorgedepot, ...wsa.riester,
  ]
  // Source order defines repeated withdrawals. Pair mirror occurrences rather
  // than deduping by value: two identical deliberate withdrawals remain two.
  const canonical: TransferEvent[] = []
  for (const inst of allInstances) {
    canonical.push(...(inst.transferEvents ?? []).filter((event) => event.sourceInstanceId === inst.instanceId))
  }
  const matched = new Set<number>()
  for (const inst of allInstances) {
    for (const event of inst.transferEvents ?? []) {
      if (event.sourceInstanceId === inst.instanceId) continue
      if (event.targetInstanceId !== inst.instanceId) {
        console.warn(`[portfolioTransfer] transferEvent on ${inst.instanceId} references source=${event.sourceInstanceId} target=${event.targetInstanceId} — skipped.`)
        continue
      }
      const index = canonical.findIndex((candidate, i) => !matched.has(i) && sameTransfer(candidate, event))
      if (index >= 0) matched.add(index)
      else {
        matched.add(canonical.length)
        canonical.push(event)
      }
    }
  }
  for (const event of canonical) {
    const outgoing = outboundBy.get(event.sourceInstanceId) ?? []
    outgoing.push(event); outboundBy.set(event.sourceInstanceId, outgoing)
    const incoming = inboundBy.get(event.targetInstanceId) ?? []
    incoming.push(event); inboundBy.set(event.targetInstanceId, incoming)
  }
  return { outboundBy, inboundBy }
}

/** Current-year surrender ledger: basis follows the disposed contract fraction.
 * Future-dated insurance surrender is explicitly unavailable at result readiness:
 * no alternate return projection is invented here to value the future source.
 */
function insuranceSurrenderPlan(source: InsuranceInstance, workspace: Workspace, rules: GermanRules, supplied: TransferEvent[]) {
  const collected = collectTransferEvents(workspace.baseline.assumptions).outboundBy.get(source.instanceId) ?? []
  // Direct policy callers may supply events before attaching them to a workspace.
  const sourceEvents = collected.length ? collected : supplied.filter((event) => event.sourceInstanceId === source.instanceId)
  const events = sourceEvents
    .map((event, index) => ({ event, index })).sort((a, b) => a.event.year - b.event.year || a.index - b.index)
  const plan: { event: TransferEvent; proceeds: number; tax: number }[] = []
  let capital = source.currentValueEUR ?? 0
  let basis = source.historicalCostBasisEUR ?? 0
  for (const { event } of events) {
    if (event.year > rules.year) {
      // Retain the legacy raw estimate only as an incomplete placeholder.
      // Readiness blocks publication; this is not a forecast-valued basis.
      const proceeds = event.type === 'surrender_reinvest' ? event.amountEUR * (1 - event.surrenderHaircutPct) : event.amountEUR
      const tax = event.type === 'surrender_reinvest' ? computeSurrenderTax(source, proceeds, workspace, rules, event.year) : 0
      plan.push({ event, proceeds, tax })
      continue
    }
    const disposed = Math.min(capital, event.amountEUR)
    const allocatedBasis = capital > 0 ? basis * disposed / capital : 0
    const proceeds = event.type === 'surrender_reinvest' ? disposed * (1 - event.surrenderHaircutPct) : disposed
    const tax = event.type === 'surrender_reinvest'
      ? computeSurrenderTax(source, proceeds, workspace, rules, event.year, allocatedBasis) : 0
    plan.push({ event, proceeds, tax })
    basis -= allocatedBasis
    capital -= disposed
  }
  return plan
}

function sameTransfer(a: TransferEvent, b: TransferEvent): boolean {
  return a.type === b.type && a.year === b.year && a.sourceInstanceId === b.sourceInstanceId &&
    a.targetInstanceId === b.targetInstanceId && a.amountEUR === b.amountEUR &&
    (a.type !== 'surrender_reinvest' || (b.type === 'surrender_reinvest' && a.surrenderHaircutPct === b.surrenderHaircutPct))
}

// ---------------------------------------------------------------------------
// Surrender-tax computation
// ---------------------------------------------------------------------------

/**
 * Compute source-side surrender tax for a `surrender_reinvest` event.
 *
 * Approach: routes through per-channel surrender helpers to derive the tax
 * that matches the helper's normal payout-year math. The surrender proceeds
 * are passed directly (historical paid-in premiums as cost basis when supplied; missing
 * basis makes dependent plan outputs incomplete via result readiness.
 * The helper short-circuits — e.g. pre-2005 insurance contracts are tax-free).
 *
 * Pre-2005 insurance: helper short-circuits to zero tax. Other modes use the
 * standard gain-ratio × marginal-rate cascade.
 *
 * NOTE (gh#81): For Riester, only §22 Nr. 5 EStG capital-payout taxation is
 * applied via `afterTaxRiesterLumpSum`. Subsidy clawback (§93 EStG — repayment
 * of all Zulagen received plus Sonderausgaben tax savings) is NOT modelled; the
 * surrender value is therefore an UPPER BOUND on the actual capital available.
 * In practice the user may owe substantial clawback that reduces the ETF
 * injection. The UI must disclaim this (see ContractDecisionCards.tsx).
 *
 * Returns 0 when the source product class has no recognised surrender path
 * (e.g. ETF — those should be rejected by the validator anyway).
 */
export function computeSurrenderTax(
  sourceInstance: AnyInstance,
  surrenderProceeds: number,
  workspace: Workspace,
  rules: GermanRules,
  eventCalendarYear: number,
  allocatedInsuranceBasis?: number,
): number {
  if (surrenderProceeds <= 0) return 0
  const profile = workspace.baseline.profile
  const slot = detectProductSlot(sourceInstance)
  // ETF is rejected by the validator for surrender_reinvest; treat as 0 anyway.
  if (slot === 'etf') return 0

  if (slot === 'insurance') {
    const ins = sourceInstance as InsuranceInstance
    // Historical premiums belong to the surrendered contract, separately from
    // the after-tax principal reinvested into the target. Missing basis remains
    // an incomplete input at the readiness boundary, never a confirmed zero.
    const totalContributedToDate = allocatedInsuranceBasis ??
      (ins.historicalCostBasisEUR ?? 0) * Math.min(1, surrenderProceeds / (ins.currentValueEUR || surrenderProceeds))
    const effectiveEventCalendarYear = Math.max(eventCalendarYear, rules.year)
    const ageAtEventYear = profile.age + (effectiveEventCalendarYear - rules.year)
    const taxMode = deriveInsuranceTaxMode(
      ins.contractStartYear,
      Math.max(1, effectiveEventCalendarYear - ins.contractStartYear),
      ageAtEventYear,
      ins.oldContractTaxFreeEligible,
    )
    const kvdrMember =
      workspace.baseline.assumptions.statutoryPension.retirementHealthStatus !== 'freiwillig_gkv'
    const grossNet = afterTaxInsuranceLumpSum(
      surrenderProceeds,
      Math.min(totalContributedToDate, surrenderProceeds),
      taxMode,
      rules,
      0,
      eventCalendarYear,
      profile,
      kvdrMember,
      0,
    )
    return Math.max(0, surrenderProceeds - grossNet)
  }

  if (slot === 'bav') {
    const bav = sourceInstance as BavInstance
    const taxMode = deriveBavLumpSumTaxMode(bav.durchfuehrungsweg, bav.pre2005EligibleTaxFree)
    const grossNet = afterTaxBavLumpSum(
      surrenderProceeds,
      profile,
      rules,
      0,
      bav.kvdrMember !== false,
      eventCalendarYear,
      taxMode,
      0,
    )
    return Math.max(0, surrenderProceeds - grossNet)
  }

  if (slot === 'riester') {
    // NOTE (gh#81): Riester surrender clawback is NOT modelled here.
    // §93 EStG requires repayment of all Zulagen received plus the
    // Sonderausgaben tax savings if the contract is surrendered before
    // age 60 or used for non-housing purposes. The afterTaxRiesterLumpSum
    // helper applies §22 Nr. 5 EStG capital-payout taxation only.
    // The reinvest amount is therefore an UPPER BOUND on the actual
    // capital available; in practice the user may owe substantial
    // clawback that reduces the ETF injection. UI must disclaim this
    // (see ContractDecisionCards.tsx).
    const grossNet = afterTaxRiesterLumpSum(surrenderProceeds, profile, rules, 0, eventCalendarYear, 0)
    return Math.max(0, surrenderProceeds - grossNet)
  }

  if (slot === 'altersvorsorgedepot') {
    const grossNet = afterTaxAvdLumpSum(surrenderProceeds, profile, rules, 0, eventCalendarYear, 0)
    return Math.max(0, surrenderProceeds - grossNet)
  }

  if (slot === 'basisrente') {
    // Basisrente is non-surrenderable in practice (capital payout legally
    // prohibited). The validator rejects surrender_reinvest with a Basisrente
    // source; this branch is defensive only.
    return 0
  }

  return 0
}

// ---------------------------------------------------------------------------
// buildInstanceCapitalPolicy — public entry point
// ---------------------------------------------------------------------------

/**
 * Build the per-instance `InstanceCapitalPolicy` from `currentValueEUR` and
 * any inbound / outbound transfer events. Both compare-mode (singleton-shape,
 * length-1 arrays) and combine-mode call this; for compare-mode without any
 * transfer events the resulting policy carries only `initialCapital`, which
 * is the M2 zero-capital fix.
 *
 * Returns `undefined` when there is nothing to inject (no current value, no
 * events) — the caller omits `instanceCapitalPolicy` from `BuildContextOverrides`
 * and the accumulation loop behaves as if starting from zero capital.
 */
export function buildInstanceCapitalPolicy(
  instance: AnyInstance,
  workspace: Workspace,
  rules: GermanRules,
  outbound: TransferEvent[],
  inbound: TransferEvent[],
): InstanceCapitalPolicy | undefined {
  const hasCurrentValue =
    instance.currentValueEUR !== undefined && instance.currentValueEUR > 0
  if (!hasCurrentValue && outbound.length === 0 && inbound.length === 0) return undefined

  const policy: InstanceCapitalPolicy = {}

  // Starting capital from currentValueEUR. Legacy `existingCapital` (Riester) and
  // `riesterTransferCapital` (AVD) paths in the per-product simulators handle their
  // starting capital before the M2 fix. Setting initialCapital here would double-apply.
  // Issue 15 P2 may unify these once the legacy compare-mode fields are deleted.
  const slot = detectProductSlot(instance)
  if (hasCurrentValue && slot !== 'altersvorsorgedepot' && slot !== 'riester') {
    policy.initialCapital = instance.currentValueEUR
    if (slot === 'etf' || slot === 'insurance') {
      policy.initialCostBasis = instance.historicalCostBasisEUR
      if (slot === 'etf') policy.initialVorabpauschale = instance.historicalVorabpauschaleEUR
    }
  }

  if (slot === 'insurance') policy.proportionalCostBasisWithdrawals = true
  const capitalInjections: { year: number; amount: number }[] = []
  const capitalWithdrawals: { year: number; amount: number }[] = []
  const costBasisInjections: { year: number; amount: number }[] = []

  // Outbound: this instance is the source of every event in `outbound`.
  for (const ev of outbound) {
    const contractYear = eventCalendarYearToContractYear(ev.year, rules.year)
    if (ev.type === 'certified') {
      // Source loses gross amountEUR — tax-neutral on source side.
      capitalWithdrawals.push({ year: contractYear, amount: ev.amountEUR })
    } else {
      // Insurance disposes gross contract capital; haircut only reduces cash
      // proceeds. Other source channels retain their existing withdrawal model.
      const currentValue = instance.currentValueEUR ?? 0
      if (import.meta.env?.DEV && ev.amountEUR > currentValue) {
        console.warn(
          `[portfolioTransfer] surrender_reinvest amountEUR (${ev.amountEUR}) exceeds ` +
          `currentValueEUR (${currentValue}) on instance "${instance.instanceId}". ` +
          `Accumulation will clamp the withdrawal to actual capital at event year.`,
        )
      }
      capitalWithdrawals.push({ year: contractYear, amount: slot === 'insurance' ? ev.amountEUR : ev.amountEUR * (1 - ev.surrenderHaircutPct) })
    }
  }

  const insurancePlans = new Map<string, ReturnType<typeof insuranceSurrenderPlan>>()
  // Inbound: this instance is the target.
  for (const ev of inbound) {
    const contractYear = eventCalendarYearToContractYear(ev.year, rules.year)
    if (ev.type === 'certified') {
      // Tax-neutral; cost basis on target unchanged.
      capitalInjections.push({ year: contractYear, amount: ev.amountEUR })
    } else {
      // surrender_reinvest: target receives after-tax + post-haircut proceeds.
      // Need the source instance to compute surrender tax.
      const sourceInst = findInstanceById(workspace, ev.sourceInstanceId)
      if (!sourceInst) continue // Will fail validation; guard.
      let proceeds = ev.amountEUR * (1 - ev.surrenderHaircutPct)
      let surrenderTax: number
      if (detectProductSlot(sourceInst) === 'insurance') {
        if (!insurancePlans.has(sourceInst.instanceId)) {
          insurancePlans.set(sourceInst.instanceId, insuranceSurrenderPlan(sourceInst as InsuranceInstance, workspace, rules, inbound))
        }
        const plan = insurancePlans.get(sourceInst.instanceId)!
        const index = plan.findIndex((entry) => sameTransfer(entry.event, ev))
        const entry = index >= 0 ? plan.splice(index, 1)[0] : undefined
        proceeds = entry?.proceeds ?? 0
        surrenderTax = entry?.tax ?? 0
      } else surrenderTax = computeSurrenderTax(sourceInst, proceeds, workspace, rules, ev.year)
      const afterTaxInjection = Math.max(0, proceeds - surrenderTax)
      capitalInjections.push({ year: contractYear, amount: afterTaxInjection })
      // Cost basis on target = the after-tax injection (so future gain on
      // target capital is taxed only on subsequent appreciation, not on the
      // already-taxed surrender proceeds — §19 InvStG / §20 EStG).
      costBasisInjections.push({ year: contractYear, amount: afterTaxInjection })
    }
  }

  if (capitalInjections.length > 0) policy.capitalInjections = capitalInjections
  if (capitalWithdrawals.length > 0) policy.capitalWithdrawals = capitalWithdrawals
  if (costBasisInjections.length > 0) policy.costBasisInjections = costBasisInjections
  // Empty policy → no-op.
  if (
    policy.initialCapital === undefined &&
    !policy.capitalInjections &&
    !policy.capitalWithdrawals &&
    !policy.costBasisInjections
  ) {
    return undefined
  }
  return policy
}
