/**
 * Combine-mode aggregator (Group G issue 08, milestone M2.6).
 *
 * Takes per-instance `ProductResult`s (one scenario worth) and aggregates them
 * into a single combined retirement income via the SHARED retirement-tax +
 * KV/PV pipelines. Re-runs `calculateRetirementTax` and `calculateRetirementKvPv`
 * ONCE over aggregated income components — does NOT just sum per-source net
 * incomes, because:
 *
 *   1. Progressive income tax (§32a EStG): aggregated taxable income hits a
 *      higher marginal bracket than any single source taxed in isolation.
 *      Per-source net summation under-counts tax.
 *
 *   2. §226 Abs. 2 SGB V Freibetrag on Versorgungsbezüge applies ONCE across
 *      the aggregate, not once per source. Per-source summation over-counts
 *      the Freibetrag.
 *
 *   3. §57 Abs. 1 SGB XI PV Freigrenze is all-or-nothing on aggregate
 *      Versorgungsbezüge.
 *
 *   4. §9a + §10c Werbungskosten / Sonderausgaben Pauschbeträge apply once on
 *      the aggregate, not per source.
 *
 * Per-instance values are back-allocated AFTER the aggregate calculation so
 * the dashboard / waterfall view can attribute net retirement income to the
 * source that produced it.
 *
 * Critical invariants:
 *
 *   - Single-instance combine result is byte-identical to the existing
 *     `calculateMonthlyRetirementPayout` outputs. We achieve this by computing
 *     each instance's tax share as the marginal delta against an "aggregate
 *     minus this instance" base — when there is exactly one instance, that
 *     marginal delta equals what the per-instance primitive computes today.
 *
 *   - bAV lump-sum, pAV lump-sum, and certified pension lump-sum paths stay
 *     SEPARATE from this monthly aggregate. They use Fünftelregelung,
 *     §229 SGB V 1/120 spreading, and §22 Nr. 5 full-marginal that don't fit
 *     a single monthly cascade. This module only aggregates the MONTHLY net
 *     payout streams.
 *
 *   - ETF capital is taxed at flat 25 % Abgeltungsteuer (§20 Abs. 2 EStG)
 *     and is NOT a Versorgungsbezug. Its `netMonthlyPayout` is passed through
 *     unchanged from the per-instance result; ETF does not interact with the
 *     progressive personal-income-tax base.
 *
 *   - Cross-instance Sparerpauschbetrag is applied at the adapter layer before
 *     combine. `simulatePortfolio` calls `applyCrossInstanceSparerpauschbetrag`
 *     (Phase G M4 F3) to re-run active ETF instances with a shared per-year
 *     §20 Abs. 9 EStG allowance schedule, so the `netMonthlyPayout` values
 *     arriving here already reflect the correctly apportioned allowance.
 */

import type {
  GermanRules,
  InsuranceTaxMode,
  PayoutMode,
  PersonalProfile,
  ProductResult,
  RetirementIncomeComponents,
  RetirementKvPvBreakdown,
  RetirementTaxBreakdown,
} from '../domain'
import type { Workspace } from '../domain/workspace'
import type {
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
} from '../domain/instances'
import { calculateRetirementTax } from './retirementTax'
import {
  calculateProfileRetirementKvPv,
  type RetirementHealthStatus,
} from './retirementPayout'
import { ertragsanteilByAge, legalConstants } from '../rules/legalConstants'
import { deriveInsuranceTaxMode } from './insurancePayout'

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface CombinedInstanceShare {
  instanceId: string
  productId: ProductResult['productId']
  /** Pre-tax/SV monthly payout produced by this instance. */
  monthlyGross: number
  /** After-tax + KV/PV monthly payout share allocated to this instance. */
  monthlyNet: number
  /** Annual income-tax share allocated to this instance (EUR/year). */
  taxShareAnnual: number
  /** Monthly KV/PV share allocated to this instance (EUR/month). */
  kvPvShare: number
}

/**
 * Aggregated monthly gross by source channel — used by the waterfall view.
 *
 * Values are EUR/month gross before tax + KV/PV. The four progressive-base
 * channels (statutory pension, bAV, certified pension, basisrente) are
 * separate from the ETF (Abgeltungsteuer) channel and the multi-mode private
 * insurance channel.
 */
export interface CombinedMonthlyGrossPayouts {
  statutoryPension: number
  bav: number
  privateInsurance: number
  basisrente: number
  altersvorsorgedepot: number
  riester: number
  etf: number
}

export interface CombinedResult {
  /** Aggregate after-tax + KV/PV monthly retirement income (EUR/month). */
  monthlyNetIncome: number
  /** Aggregate gross monthly payouts split by source channel. */
  monthlyGrossPayouts: CombinedMonthlyGrossPayouts
  /** Aggregate retirement-tax breakdown (single `calculateRetirementTax` call). */
  aggregateTax: RetirementTaxBreakdown
  /** Aggregate KV/PV breakdown (single `calculateRetirementKvPv` call). */
  aggregateKvPv: RetirementKvPvBreakdown
  /**
   * Per-instance back-allocated values. Sum of `monthlyNet` across entries
   * (plus the GRV / statutory pension net) equals `monthlyNetIncome` within
   * floating-point precision (better than 1 ct).
   */
  byInstance: Record<string, CombinedInstanceShare>
  /** GRV / Versorgungswerk / Beamtenpension net contribution (EUR/month). */
  statutoryPensionMonthlyNet: number
  /** Free-form notes (Sparerpauschbetrag deferral, multi-employer warnings, ...). */
  notes: string[]
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Workspace-level context required to combine per-instance ProductResults.
 *
 * The combine function does NOT re-run any per-product simulator. It only
 * aggregates monthly gross payouts already produced by `simulatePortfolio`
 * (or an equivalent caller) and routes them through the shared retirement-tax
 * + KV/PV pipelines.
 */
export interface CombineContext {
  profile: PersonalProfile
  rules: GermanRules
  /** Calendar year when GRV / first product payout begins. */
  retirementYear: number
  /**
   * Gross GRV / Versorgungswerk / Beamtenpension monthly pension in the payout
   * year. Threaded into the aggregate retirement-tax base via
   * `statutoryPensionAnnual` and into KV/PV via `monthlyStatutoryPension`.
   */
  grvGrossMonthlyPension: number
  /**
   * §22 Nr. 1 Satz 3 a aa EStG cohort routing. For Versorgungswerk + GRV this is
   * 'statutory_pension'; for Beamtenpension we route through `bavPensionAnnual`
   * as a Versorgungsbezug (matches `projectStatutoryPension`). 'none' means
   * there is no statutory baseline (clean slate).
   */
  statutoryPensionTaxChannel: 'statutory_pension' | 'beamten_versorgungsbezug' | 'none'
  /**
   * §249a vs §229 SGB V routing for the statutory baseline. KVdR (default for
   * GRV) uses half-rate via `monthlyStatutoryPension`. Versorgungswerk + Beamten
   * route through `otherMonthlyVersorgungsbezuege` (full rate, §226(2) Freibetrag).
   * 'none' = no KV/PV on statutory baseline (PKV holders w/ VW/Beamten).
   */
  statutoryPensionKvChannel: 'kvdr_half_rate' | 'versorgungsbezug_full_rate' | 'none'
  /** Retirement health-insurance status — drives every per-instance KV/PV branch. */
  retirementHealthStatus: RetirementHealthStatus
}

// ---------------------------------------------------------------------------
// Internal: per-instance taxable line builders
// ---------------------------------------------------------------------------

interface PerSourceLine {
  instanceId: string
  productId: ProductResult['productId']
  /** Gross monthly payout from this instance. */
  monthlyGross: number
  /**
   * Annual taxable amount entering the personal-income-tax base for this
   * instance. For bAV this is the gross annual; for pAV with Ertragsanteil,
   * gross × Ertragsanteil; for AVD/Riester, gross annual; for Basisrente, gross
   * annual; for ETF and pAV-Abgeltungsteuer this stays 0 because the gain is
   * routed via the separate Abgeltungsteuer channel or pre-taxed (ETF flat).
   */
  taxableAnnual: number
  /**
   * For pAV instances: which `InsuranceTaxMode` lane the instance feeds into.
   * Passed through `privateInsuranceContributions` so multi-instance mixed-mode
   * portfolios route each contract independently.
   */
  insuranceTaxMode?: InsuranceTaxMode
  /** Tax channel — drives `RetirementIncomeComponents` slot routing. */
  taxChannel: 'bav_pension' | 'private_insurance' | 'basisrente' | 'other_22_5' | 'etf'
  /** KV/PV channel for this instance's monthly payout. */
  kvPvChannel: 'bav_versorgungsbezug' | 'freiwillig_other' | 'none'
}

/**
 * Compute per-instance tax base + channel routing from per-instance ProductResults
 * + the workspace's instance metadata.
 *
 * Why we still need workspace metadata after `simulatePortfolio` already ran:
 * the ProductResult does not carry the instance's payout mode / tax mode /
 * Durchführungsweg / health flags, so we resolve them here from the workspace's
 * matching instance for each result. Indexed by `instanceId`.
 */
function buildPerSourceLines(
  workspace: Workspace,
  perInstanceResults: ProductResult[],
  ctx: CombineContext,
): PerSourceLine[] {
  const wsa = workspace.baseline.assumptions
  const lines: PerSourceLine[] = []

  // Quick lookups by instanceId for each product's instance array.
  const bavById = new Map(wsa.bav.map((i: BavInstance) => [i.instanceId, i]))
  const etfById = new Map(wsa.etf.map((i: EtfInstance) => [i.instanceId, i]))
  const insById = new Map(wsa.insurance.map((i: InsuranceInstance) => [i.instanceId, i]))
  const basById = new Map(wsa.basisrente.map((i: BasisrenteInstance) => [i.instanceId, i]))
  const avdById = new Map(wsa.altersvorsorgedepot.map((i: AltersvorsorgedepotInstance) => [i.instanceId, i]))
  const riesterById = new Map(wsa.riester.map((i: RiesterInstance) => [i.instanceId, i]))

  const isFreiwillig = ctx.retirementHealthStatus === 'freiwillig_gkv'

  for (const result of perInstanceResults) {
    const id = result.instanceId
    if (!id) continue
    const grossMonthly = result.grossMonthlyPayout

    if (result.productId === 'bav') {
      const inst = bavById.get(id)
      if (!inst) continue
      lines.push({
        instanceId: id,
        productId: 'bav',
        monthlyGross: grossMonthly,
        taxableAnnual: grossMonthly * 12,
        taxChannel: 'bav_pension',
        kvPvChannel: 'bav_versorgungsbezug',
        // Note: bAV always routes via `bav_versorgungsbezug` (§229 Abs. 1 Nr. 5
        // SGB V) regardless of kvdrMember. The `kvdrMember` flag affects whether
        // the §226(2) Freibetrag applies inside the aggregate KV/PV calc — done
        // at the workspace level below, not per-line.
      })
    } else if (result.productId === 'versicherung') {
      const inst = insById.get(id)
      if (!inst) continue
      const taxMode = derivePavInsuranceTaxModeForCombine(inst, ctx)
      const taxableAnnual = computePavTaxableAnnual(result, inst, ctx.profile.retirementAge, taxMode)
      // KV/PV: pAV is NOT a Versorgungsbezug (§229 SGB V). KVdR pays nothing;
      // freiwillig pays §240 SGB V on the full payout (capped at BBG aggregate).
      const kvPvChannel: PerSourceLine['kvPvChannel'] = isFreiwillig ? 'freiwillig_other' : 'none'
      lines.push({
        instanceId: id,
        productId: 'versicherung',
        monthlyGross: grossMonthly,
        taxableAnnual,
        insuranceTaxMode: taxMode,
        taxChannel: 'private_insurance',
        kvPvChannel,
      })
    } else if (result.productId === 'basisrente') {
      const inst = basById.get(id)
      if (!inst) continue
      lines.push({
        instanceId: id,
        productId: 'basisrente',
        monthlyGross: grossMonthly,
        taxableAnnual: grossMonthly * 12,
        // Basisrente shares the §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil
        // channel with GRV — route through statutoryPensionAnnual.
        taxChannel: 'basisrente',
        // Not a Versorgungsbezug — only freiwillig owes KV/PV.
        kvPvChannel: isFreiwillig ? 'freiwillig_other' : 'none',
      })
    } else if (result.productId === 'altersvorsorgedepot') {
      const inst = avdById.get(id)
      if (!inst) continue
      lines.push({
        instanceId: id,
        productId: 'altersvorsorgedepot',
        monthlyGross: grossMonthly,
        taxableAnnual: grossMonthly * 12,
        taxChannel: 'other_22_5',
        kvPvChannel: isFreiwillig ? 'freiwillig_other' : 'none',
      })
    } else if (result.productId === 'riester') {
      const inst = riesterById.get(id)
      if (!inst) continue
      lines.push({
        instanceId: id,
        productId: 'riester',
        monthlyGross: grossMonthly,
        taxableAnnual: grossMonthly * 12,
        taxChannel: 'other_22_5',
        kvPvChannel: isFreiwillig ? 'freiwillig_other' : 'none',
      })
    } else if (result.productId === 'etf') {
      // ETF stays separate — flat Abgeltungsteuer is already accounted for in
      // `result.netMonthlyPayout`. We pass it through unchanged.
      const inst = etfById.get(id)
      if (!inst) continue
      lines.push({
        instanceId: id,
        productId: 'etf',
        monthlyGross: grossMonthly,
        taxableAnnual: 0,
        taxChannel: 'etf',
        kvPvChannel: 'none',
      })
    }
  }
  return lines
}

/**
 * Derive the InsuranceTaxMode for a private-insurance instance in combine-mode.
 *
 * Mirrors `deriveInsuranceTaxMode` + the Leibrente override applied inside
 * `netInsurancePayout`. Used so each instance's progressive-base contribution
 * uses the contract's own vintage-aware mode.
 */
function derivePavInsuranceTaxModeForCombine(
  instance: InsuranceInstance,
  ctx: CombineContext,
): InsuranceTaxMode {
  const payoutMode: PayoutMode = instance.payoutMode
  if (payoutMode === 'leibrente') {
    // §22 Nr. 1 Satz 3 a EStG Ertragsanteil applies to ALL private Leibrenten.
    return 'ertragsanteil'
  }
  const contractRuntimeYears = ctx.retirementYear - instance.contractStartYear
  return deriveInsuranceTaxMode(
    instance.contractStartYear,
    contractRuntimeYears,
    ctx.profile.retirementAge,
    instance.oldContractTaxFreeEligible,
  )
}

/**
 * Compute the per-instance pAV `taxableAnnual` consistent with the existing
 * `netInsurancePayout` math (Ertragsanteil for Leibrente; gain ratio otherwise).
 *
 * `result.totalProductContributions` is treated as `totalContributionsBeforeFees`
 * — the two are equal in the accumulation projection (see `projectAccumulation`).
 */
function computePavTaxableAnnual(
  result: ProductResult,
  _instance: InsuranceInstance,
  retirementAge: number,
  taxMode: InsuranceTaxMode,
): number {
  const grossAnnual = result.grossMonthlyPayout * 12
  if (taxMode === 'ertragsanteil') {
    return grossAnnual * ertragsanteilByAge(retirementAge)
  }
  if (taxMode === 'pre2005') {
    return 0
  }
  // halbeinkuenfte / abgeltungsteuer: gain-ratio method
  const capital = result.capitalAtRetirement
  const totalContributions = result.totalProductContributions
  const gainRatio = capital > 0 ? Math.max(0, capital - totalContributions) / capital : 0
  return grossAnnual * gainRatio
  // Note: for `instance.payoutMode === 'leibrente'` we already returned above;
  // for the other modes the gain-ratio applies.
}

// ---------------------------------------------------------------------------
// Aggregate components builder
// ---------------------------------------------------------------------------

interface AggregateComponentsAndKvPv {
  components: RetirementIncomeComponents
  kvPvBavMonthly: number
  kvPvOtherVersorgungMonthly: number
  kvPvFreiwilligOtherMonthly: number
  kvPvStatutoryMonthly: number
  isFreiwilligVersichert: boolean
}

function buildAggregateInputs(
  lines: PerSourceLine[],
  ctx: CombineContext,
): AggregateComponentsAndKvPv {
  const isFreiwilligVersichert = ctx.retirementHealthStatus === 'freiwillig_gkv'

  // Tax-base aggregations
  let bavPensionAnnual = 0
  let basisrenteAnnual = 0
  let other225Annual = 0
  const insuranceContributions: { amount: number; mode: InsuranceTaxMode }[] = []

  // KV/PV channel aggregations (monthly)
  let kvPvBavMonthly = 0
  let kvPvFreiwilligOtherMonthly = 0

  for (const line of lines) {
    if (line.taxChannel === 'bav_pension') {
      bavPensionAnnual += line.taxableAnnual
    } else if (line.taxChannel === 'basisrente') {
      basisrenteAnnual += line.taxableAnnual
    } else if (line.taxChannel === 'other_22_5') {
      other225Annual += line.taxableAnnual
    } else if (line.taxChannel === 'private_insurance') {
      insuranceContributions.push({
        amount: line.taxableAnnual,
        mode: line.insuranceTaxMode ?? 'abgeltungsteuer',
      })
    }
    // 'etf' contributes nothing to the progressive base.

    if (line.kvPvChannel === 'bav_versorgungsbezug') {
      kvPvBavMonthly += line.monthlyGross
    } else if (line.kvPvChannel === 'freiwillig_other') {
      kvPvFreiwilligOtherMonthly += line.monthlyGross
    }
  }

  // Statutory pension routing — adds GRV (or Basisrente) to the tax base via
  // the §22 Nr. 1 Satz 3 a aa Besteuerungsanteil channel; Versorgungswerk and
  // Beamtenpension route differently.
  let statutoryPensionAnnualForTax = 0
  let bavLikeFromStatutory = 0
  if (ctx.statutoryPensionTaxChannel === 'statutory_pension') {
    statutoryPensionAnnualForTax = ctx.grvGrossMonthlyPension * 12
  } else if (ctx.statutoryPensionTaxChannel === 'beamten_versorgungsbezug') {
    bavLikeFromStatutory = ctx.grvGrossMonthlyPension * 12
  }
  // Basisrente shares the same Besteuerungsanteil channel as GRV.
  const aggregatedStatutoryAnnual = statutoryPensionAnnualForTax + basisrenteAnnual

  // KV/PV statutory routing
  let kvPvStatutoryMonthly = 0
  let kvPvOtherVersorgungMonthly = 0
  if (ctx.statutoryPensionKvChannel === 'kvdr_half_rate') {
    kvPvStatutoryMonthly = ctx.grvGrossMonthlyPension
  } else if (ctx.statutoryPensionKvChannel === 'versorgungsbezug_full_rate') {
    kvPvOtherVersorgungMonthly = ctx.grvGrossMonthlyPension
  }

  const components: RetirementIncomeComponents = {
    statutoryPensionAnnual: aggregatedStatutoryAnnual,
    bavPensionAnnual: bavPensionAnnual + bavLikeFromStatutory,
    bavIsLumpSum: false,
    privateInsuranceTaxableAnnual: 0,
    privateInsuranceTaxMode: 'abgeltungsteuer',
    privateInsuranceContributions:
      insuranceContributions.length > 0 ? insuranceContributions : undefined,
    otherTaxableAnnual: other225Annual,
    retirementYear: ctx.retirementYear,
  }

  return {
    components,
    kvPvBavMonthly,
    kvPvOtherVersorgungMonthly,
    kvPvFreiwilligOtherMonthly,
    kvPvStatutoryMonthly,
    isFreiwilligVersichert,
  }
}

// ---------------------------------------------------------------------------
// Per-instance back-allocation
// ---------------------------------------------------------------------------

/**
 * Compute the marginal-tax delta of EXCLUDING a single instance from the
 * aggregate components. Equivalent to `aggTax - tax(allMinusThis)` —
 * conceptually "what extra tax does this instance cause".
 *
 * For single-instance combine workspaces this delta equals what
 * `calculateMonthlyRetirementPayout`'s marginal cascade computes, preserving
 * byte-identity with `simulate.integration.test.ts` snapshots.
 */
function instanceMarginalTax(
  aggregate: AggregateComponentsAndKvPv,
  line: PerSourceLine,
  rules: GermanRules,
  totalTaxFull: number,
): number {
  // Build an "aggregate minus this line" components view and re-call the tax
  // pipeline. This is ~N tax calls in the worst case (one per instance) — for
  // realistic portfolios (<10 instances) the cost is trivial.
  const components = aggregate.components
  let bavPensionAnnual = components.bavPensionAnnual
  let statutoryPensionAnnual = components.statutoryPensionAnnual
  let otherTaxableAnnual = components.otherTaxableAnnual
  let insuranceContributions = components.privateInsuranceContributions

  if (line.taxChannel === 'bav_pension') {
    bavPensionAnnual = Math.max(0, bavPensionAnnual - line.taxableAnnual)
  } else if (line.taxChannel === 'basisrente') {
    statutoryPensionAnnual = Math.max(0, statutoryPensionAnnual - line.taxableAnnual)
  } else if (line.taxChannel === 'other_22_5') {
    otherTaxableAnnual = Math.max(0, otherTaxableAnnual - line.taxableAnnual)
  } else if (line.taxChannel === 'private_insurance' && insuranceContributions) {
    // Drop the first matching (amount, mode) entry — simple removal that's
    // exact when each instance contributes one entry.
    const idx = insuranceContributions.findIndex(
      (e) => e.amount === line.taxableAnnual && e.mode === (line.insuranceTaxMode ?? 'abgeltungsteuer'),
    )
    insuranceContributions =
      idx >= 0
        ? [...insuranceContributions.slice(0, idx), ...insuranceContributions.slice(idx + 1)]
        : insuranceContributions
  }
  // ETF: no tax-base contribution — marginal is 0.
  if (line.taxChannel === 'etf') return 0

  const reduced: RetirementIncomeComponents = {
    ...components,
    bavPensionAnnual,
    statutoryPensionAnnual,
    otherTaxableAnnual,
    privateInsuranceContributions: insuranceContributions,
  }
  const reducedTax = calculateRetirementTax(reduced, rules, 'single').totalTaxAnnual
  return Math.max(0, totalTaxFull - reducedTax)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Aggregate per-instance ProductResults into a combined retirement income
 * (single scenario). Caller picks the scenario by passing the matching
 * `perInstanceResults` slice.
 *
 * @param workspace Workspace state (read for instance metadata only — no
 *   simulation re-runs).
 * @param perInstanceResults `ProductResult[]` (one per active instance) for a
 *   single return scenario. `instanceId` must be set on each entry — produced
 *   by `simulatePortfolio`.
 * @param ctx Profile + rules + statutory-baseline routing.
 */
export function combinePortfolio(
  workspace: Workspace,
  perInstanceResults: ProductResult[],
  ctx: CombineContext,
): CombinedResult {
  const lines = buildPerSourceLines(workspace, perInstanceResults, ctx)
  const aggregate = buildAggregateInputs(lines, ctx)

  // -------------------------------------------------------------------------
  // 1. Aggregate retirement-tax (single call over all sources).
  // -------------------------------------------------------------------------
  const aggregateTax = calculateRetirementTax(aggregate.components, ctx.rules, 'single')

  // -------------------------------------------------------------------------
  // 2. Aggregate KV/PV (single call over all monthly bases).
  // -------------------------------------------------------------------------
  const aggregateKvPv: RetirementKvPvBreakdown = calculateProfileRetirementKvPv(
    ctx.profile,
    ctx.rules,
    ctx.retirementYear,
    {
      bavMonthlyVersorgungsbezuege: aggregate.kvPvBavMonthly,
      otherMonthlyVersorgungsbezuege: aggregate.kvPvOtherVersorgungMonthly,
      monthlyStatutoryPension: aggregate.kvPvStatutoryMonthly,
      freiwilligOtherMonthlyIncome: aggregate.kvPvFreiwilligOtherMonthly,
      isFreiwilligVersichert: aggregate.isFreiwilligVersichert,
    },
  )

  // -------------------------------------------------------------------------
  // 3. Statutory pension net (GRV / VW / Beamten) — its share of the aggregate
  //    tax + KV/PV.
  //
  //    Allocation choice: statutory bears its "alone" tax (matches today's
  //    `projectStatutoryPension`), instances bear marginal-on-top deltas.
  //    For single-instance combine this gives bit-identity with
  //    `simulateRetirementComparison` snapshots — there each product's
  //    `netMonthlyPayout` is computed against the GRV baseline already taxed
  //    in isolation by `projectStatutoryPension`.
  // -------------------------------------------------------------------------
  const statutoryGrossMonthly = ctx.grvGrossMonthlyPension
  const statutoryGrossAnnual = statutoryGrossMonthly * 12

  let statutoryTaxAnnual = 0
  if (statutoryGrossAnnual > 0 && ctx.statutoryPensionTaxChannel !== 'none') {
    // Tax of statutory income alone — instances zeroed out.
    const statutoryOnlyComponents: RetirementIncomeComponents = {
      statutoryPensionAnnual:
        ctx.statutoryPensionTaxChannel === 'statutory_pension' ? statutoryGrossAnnual : 0,
      bavPensionAnnual:
        ctx.statutoryPensionTaxChannel === 'beamten_versorgungsbezug' ? statutoryGrossAnnual : 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: 0,
      retirementYear: ctx.retirementYear,
    }
    statutoryTaxAnnual = calculateRetirementTax(statutoryOnlyComponents, ctx.rules, 'single').totalTaxAnnual
  }

  // Statutory's KV/PV share — for KVdR half-rate route, use the breakdown's
  // statutory split directly. For the Versorgungsbezug route, lift the
  // "otherVersorgungsbezuege" split (statutory was in that channel).
  let statutoryKvPvMonthly = 0
  if (ctx.statutoryPensionKvChannel === 'kvdr_half_rate') {
    statutoryKvPvMonthly =
      aggregateKvPv.statutoryPensionKvMonthly + aggregateKvPv.statutoryPensionPvMonthly
  } else if (ctx.statutoryPensionKvChannel === 'versorgungsbezug_full_rate') {
    // Split the otherVersorgungsbezuege channel proportionally. For combine,
    // the statutory baseline is the only contributor to that channel today.
    statutoryKvPvMonthly =
      aggregateKvPv.otherVersorgungsbezuegeKvMonthly + aggregateKvPv.otherVersorgungsbezuegePvMonthly
  }

  const statutoryNetMonthly = Math.max(
    0,
    statutoryGrossMonthly - statutoryTaxAnnual / 12 - statutoryKvPvMonthly,
  )

  // -------------------------------------------------------------------------
  // 4. Per-instance back-allocation.
  //
  //    Tax: each instance's marginal delta against an "aggregate minus this
  //    instance" base. Then rescale so the sum across instances + statutory
  //    equals the aggregate tax.
  //
  //    KV/PV: split the per-channel breakdown proportionally across same-channel
  //    instances by gross.
  // -------------------------------------------------------------------------
  const marginalTaxByInstance: Record<string, number> = {}
  let sumMarginals = 0
  for (const line of lines) {
    const m = instanceMarginalTax(aggregate, line, ctx.rules, aggregateTax.totalTaxAnnual)
    marginalTaxByInstance[line.instanceId] = m
    sumMarginals += m
  }

  // Portfolio's share of aggregate tax = aggTax - statutoryTax (statutory is
  // accounted for separately above). Allocate this to instances by marginal-delta
  // proportions; falls back to gross when sumMarginals is 0 (e.g. all-ETF).
  const portfolioTaxAnnual = Math.max(0, aggregateTax.totalTaxAnnual - statutoryTaxAnnual)
  const totalGross = lines.reduce((s, l) => s + l.monthlyGross * 12, 0)

  const taxByInstance: Record<string, number> = {}
  for (const line of lines) {
    if (sumMarginals > 0) {
      taxByInstance[line.instanceId] =
        portfolioTaxAnnual * (marginalTaxByInstance[line.instanceId] / sumMarginals)
    } else if (totalGross > 0) {
      // No marginal tax (all sources are tax-free or below Grundfreibetrag); split
      // any remaining (should be ≈0) by gross.
      taxByInstance[line.instanceId] = portfolioTaxAnnual * ((line.monthlyGross * 12) / totalGross)
    } else {
      taxByInstance[line.instanceId] = 0
    }
    // ETF carries its own flat-tax already in result.netMonthlyPayout — exclude
    // it from the progressive allocation entirely.
    if (line.taxChannel === 'etf') taxByInstance[line.instanceId] = 0
  }

  // Re-allocate any "leftover" portfolio tax (rounding from rescale) to keep
  // the byInstance sum exact.
  const allocatedSum = Object.values(taxByInstance).reduce((s, v) => s + v, 0)
  const drift = portfolioTaxAnnual - allocatedSum
  if (Math.abs(drift) > 1e-9) {
    // Push drift into the largest non-ETF allocation so per-instance values
    // stay non-negative for typical portfolios.
    let largest: PerSourceLine | undefined
    let largestVal = -Infinity
    for (const line of lines) {
      if (line.taxChannel === 'etf') continue
      const v = taxByInstance[line.instanceId]
      if (v > largestVal) {
        largestVal = v
        largest = line
      }
    }
    if (largest) {
      taxByInstance[largest.instanceId] += drift
    }
  }

  // KV/PV per-instance shares
  const sumBavGross = lines
    .filter((l) => l.kvPvChannel === 'bav_versorgungsbezug')
    .reduce((s, l) => s + l.monthlyGross, 0)
  const sumFreiwilligGross = lines
    .filter((l) => l.kvPvChannel === 'freiwillig_other')
    .reduce((s, l) => s + l.monthlyGross, 0)

  const bavKvPvTotal = aggregateKvPv.bavKvMonthly + aggregateKvPv.bavPvMonthly
  const freiwilligKvPvTotal =
    aggregateKvPv.freiwilligOtherKvMonthly + aggregateKvPv.freiwilligOtherPvMonthly

  const kvPvByInstance: Record<string, number> = {}
  for (const line of lines) {
    if (line.kvPvChannel === 'bav_versorgungsbezug' && sumBavGross > 0) {
      kvPvByInstance[line.instanceId] = bavKvPvTotal * (line.monthlyGross / sumBavGross)
    } else if (line.kvPvChannel === 'freiwillig_other' && sumFreiwilligGross > 0) {
      kvPvByInstance[line.instanceId] = freiwilligKvPvTotal * (line.monthlyGross / sumFreiwilligGross)
    } else {
      kvPvByInstance[line.instanceId] = 0
    }
  }

  // -------------------------------------------------------------------------
  // 5. Build per-instance share entries.
  //
  //    For ETF we use `result.netMonthlyPayout` directly (Abgeltungsteuer is
  //    flat and already in that figure). All other channels reconstruct net
  //    from gross − allocated tax/12 − allocated KV/PV.
  // -------------------------------------------------------------------------
  const byInstance: Record<string, CombinedInstanceShare> = {}
  for (const line of lines) {
    if (line.taxChannel === 'etf') {
      // Use the per-instance result's netMonthlyPayout — keeps Abgeltungsteuer
      // bit-identical to single-instance behaviour.
      const result = perInstanceResults.find((r) => r.instanceId === line.instanceId)
      const netMonthly = result?.netMonthlyPayout ?? line.monthlyGross
      byInstance[line.instanceId] = {
        instanceId: line.instanceId,
        productId: line.productId,
        monthlyGross: line.monthlyGross,
        monthlyNet: netMonthly,
        // Tax share for ETF = result.gross − result.net (the Abgeltungsteuer
        // already taken out at the per-instance level).
        taxShareAnnual: Math.max(0, (line.monthlyGross - netMonthly) * 12),
        kvPvShare: 0,
      }
      continue
    }

    const taxAnnual = taxByInstance[line.instanceId] ?? 0
    const kvPvMonthly = kvPvByInstance[line.instanceId] ?? 0
    const monthlyNet = Math.max(0, line.monthlyGross - taxAnnual / 12 - kvPvMonthly)
    byInstance[line.instanceId] = {
      instanceId: line.instanceId,
      productId: line.productId,
      monthlyGross: line.monthlyGross,
      monthlyNet,
      taxShareAnnual: taxAnnual,
      kvPvShare: kvPvMonthly,
    }
  }

  // -------------------------------------------------------------------------
  // 6. Aggregate monthly net = statutory net + sum(per-instance net).
  // -------------------------------------------------------------------------
  const monthlyNetIncome =
    statutoryNetMonthly +
    Object.values(byInstance).reduce((s, share) => s + share.monthlyNet, 0)

  // Gross-by-channel summary (for the dashboard waterfall)
  const monthlyGrossPayouts: CombinedMonthlyGrossPayouts = {
    statutoryPension: statutoryGrossMonthly,
    bav: lines.filter((l) => l.productId === 'bav').reduce((s, l) => s + l.monthlyGross, 0),
    privateInsurance: lines.filter((l) => l.productId === 'versicherung').reduce((s, l) => s + l.monthlyGross, 0),
    basisrente: lines.filter((l) => l.productId === 'basisrente').reduce((s, l) => s + l.monthlyGross, 0),
    altersvorsorgedepot: lines
      .filter((l) => l.productId === 'altersvorsorgedepot')
      .reduce((s, l) => s + l.monthlyGross, 0),
    riester: lines.filter((l) => l.productId === 'riester').reduce((s, l) => s + l.monthlyGross, 0),
    etf: lines.filter((l) => l.productId === 'etf').reduce((s, l) => s + l.monthlyGross, 0),
  }

  const notes: string[] = []
  // Halbeinkünfte verifier (silently confirmed) — pin the const reference.
  void legalConstants.insurance.halbeinkuenfteFactor

  return {
    monthlyNetIncome,
    monthlyGrossPayouts,
    aggregateTax,
    aggregateKvPv,
    byInstance,
    statutoryPensionMonthlyNet: statutoryNetMonthly,
    notes,
  }
}
