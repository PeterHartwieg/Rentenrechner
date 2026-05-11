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
 * Routing convention: events are dual-stored under both source and target
 * instances (see `applyContractDecision` in `src/app/contractDecisions.ts` —
 * the source carries the "capital left" record and the target carries the
 * "capital received" record). To avoid double-counting we route by
 * **which instance the event was found in**, not by event metadata:
 *   - found in source's array  → push only to outbound bucket.
 *   - found in target's array  → push only to inbound bucket.
 *   - neither (legacy/malformed) → warn and skip.
 *
 * Dual-storage invariant: `backfillWorkspaceTransferEvents` in `storage.ts`
 * ensures every event is present on both sides at load time, so single-sided
 * legacy data is repaired before reaching this function. A malformed event
 * (instanceId matches neither source nor target) is warned and skipped.
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
  for (const inst of allInstances) {
    for (const ev of inst.transferEvents ?? []) {
      if (inst.instanceId === ev.sourceInstanceId) {
        const outArr = outboundBy.get(ev.sourceInstanceId) ?? []
        outArr.push(ev)
        outboundBy.set(ev.sourceInstanceId, outArr)
      } else if (inst.instanceId === ev.targetInstanceId) {
        const inArr = inboundBy.get(ev.targetInstanceId) ?? []
        inArr.push(ev)
        inboundBy.set(ev.targetInstanceId, inArr)
      } else {
        // Event metadata refers to neither this instance's source nor target —
        // legacy or malformed data. Warn and skip.
        console.warn(
          `[portfolioTransfer] transferEvent on ${inst.instanceId} references ` +
          `source=${ev.sourceInstanceId} target=${ev.targetInstanceId} — skipped.`,
        )
      }
    }
  }
  return { outboundBy, inboundBy }
}

// ---------------------------------------------------------------------------
// Surrender-tax computation
// ---------------------------------------------------------------------------

/**
 * Compute source-side surrender tax for a `surrender_reinvest` event.
 *
 * Approach: routes through per-channel surrender helpers to derive the tax
 * that matches the helper's normal payout-year math. The surrender proceeds
 * are passed directly (cost basis approximation: zero own contributions to
 * date, so the entire surrender amount is treated as gain unless the helper
 * short-circuits — e.g. pre-2005 insurance contracts are tax-free).
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
): number {
  if (surrenderProceeds <= 0) return 0
  const profile = workspace.baseline.profile
  const slot = detectProductSlot(sourceInstance)
  // ETF is rejected by the validator for surrender_reinvest; treat as 0 anyway.
  if (slot === 'etf') return 0

  if (slot === 'insurance') {
    const ins = sourceInstance as InsuranceInstance
    // Conservative cost-basis approximation: zero monthly contribution, so the
    // entire surrender amount is treated as gain unless the helper short-
    // circuits (pre-2005 contracts). Scope-limited per spec: other surrender
    // modes follow the same direct-helper invocation pattern.
    const totalContributedToDate = 0
    const ageAtEventYear = profile.age + (eventCalendarYear - rules.year)
    const taxMode = deriveInsuranceTaxMode(
      ins.contractStartYear,
      Math.max(1, eventCalendarYear - ins.contractStartYear),
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
  }

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
      // surrender_reinvest: source loses post-haircut proceeds. Per spec the
      // capital removed from the contract = amountEUR × (1 - haircut).
      const currentValue = instance.currentValueEUR ?? 0
      if (import.meta.env?.DEV && ev.amountEUR > currentValue) {
        console.warn(
          `[portfolioTransfer] surrender_reinvest amountEUR (${ev.amountEUR}) exceeds ` +
          `currentValueEUR (${currentValue}) on instance "${instance.instanceId}". ` +
          `Accumulation will clamp the withdrawal to actual capital at event year.`,
        )
      }
      const proceeds = ev.amountEUR * (1 - ev.surrenderHaircutPct)
      capitalWithdrawals.push({ year: contractYear, amount: proceeds })
    }
  }

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
      const proceeds = ev.amountEUR * (1 - ev.surrenderHaircutPct)
      const surrenderTax = computeSurrenderTax(sourceInst, proceeds, workspace, rules, ev.year)
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
