/**
 * Mein-Plan sensitivity selectors (PR 6).
 *
 * Pure perturbation functions that re-run combine-mode simulation under a
 * single-axis change ("what if the user retires at 70 instead of 67?") and
 * report the resulting delta against a baseline `CombinedResult`. The selectors
 * are framework-agnostic (no React, no DOM access) and live here instead of
 * `src/app/simulationSelectors.ts` because they consume a workspace + rules and
 * call `runCombineSimulation` — closer in shape to the combine-mode pipeline
 * than to the generic UI selectors.
 *
 * ## Contract
 *
 * Each selector takes the baseline `Workspace` + a baseline `CombinedResult`
 * for a single scenario, plus selector-specific perturbation parameters. It
 * clones the workspace, applies the perturbation **without mutating the
 * baseline**, and re-runs `runCombineSimulation`. The matching scenario's
 * combined result is then diffed against the baseline so the caller gets one
 * `SensitivityRowResult` per selector:
 *   - `headlineDelta` = perturbed.monthlyNetIncome − baseline.monthlyNetIncome
 *   - `perInstanceDelta[id]` = perturbed.byInstance[id].monthlyNet − baseline.byInstance[id].monthlyNet
 *   - `perturbedProjectedMonthly` = perturbed.monthlyNetIncome
 *
 * The selector also reports a structured `note` when the perturbation could
 * not be applied (e.g. ETF bump when no ETF instance exists) so the UI can
 * either hide the row or show an explanatory message instead of a spurious
 * zero-delta line.
 *
 * ## Cost
 *
 * Each selector is **O(N) per row** in the number of workspace instances —
 * each call drives a full `simulatePortfolio` + `combinePortfolio` pass. The
 * UI budgets ≤5 sensitivity rows so the worst case is ~5× the baseline
 * combine-mode cost. No memoisation is wired today; if perf bites later,
 * memoise by (perturbation hash, baseline.lastEditedAt). The doc-comment on
 * each selector pins the O(N) cost so future refactors don't drift.
 *
 * ## Engine boundary
 *
 * Selectors **do not** mutate the engine, the rules, or the workspace they
 * receive. They only call `runCombineSimulation`, which is a pure factory.
 * Adding a new sensitivity row therefore never requires an engine change. If
 * a future row needs information `CombinedResult` does not expose, surface
 * that as a P0 routing question rather than expanding the engine.
 */

import type { GermanRules } from '../../domain'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from '../../domain/instances'
import type {
  Workspace,
  WorkspaceAssumptionsV2,
  Scenario,
} from '../../domain/workspace'
import type { CombinedResult } from '../../engine/portfolioCombine'
import { runCombineSimulation } from '../../app/useCombineSimulation'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/**
 * Why a perturbation was a no-op or was constrained. Lets the UI skip the row
 * or display a structured "nicht anwendbar" caption instead of an unexplained
 * 0 €/Monat.
 *
 * - `'no_etf_instance'`: the workspace has zero ETF instances, OR all existing
 *   ETF instances are `surrendered` or `offered` (or a mix of non-paid_up
 *   statuses). In either case the bump cannot be applied to any contract and
 *   the ETF-bump row is suppressed or shows a neutral caption.
 * - `'etf_paid_up_only'`: the workspace has at least one ETF instance AND
 *   every ETF instance is `paid_up` (beitragsfrei). The bump cannot be applied
 *   because the portfolio adapter forces `etfMonthlyUserCostOverride = 0` for
 *   paid-up instances regardless of `monthlyContribution`. The row still
 *   renders with `headlineDelta = 0` but surfacing this note lets the user
 *   understand why ("ETF-Vertrag vorhanden, aber beitragsfrei — Aufstockung
 *   würde einen neuen aktiven Vertrag erfordern"). Mixed workspaces (some
 *   paid_up, some surrendered/offered) also fall back to `'no_etf_instance'`
 *   because the surrendered/offered instances are not recoverable by bumping.
 * - `'retirement_age_clamped'`: the requested retirement age was above
 *   `retirementEndAge − 1`. We clamp and the row still runs, but the caller
 *   may wish to surface that the clamp happened. This note is preserved even
 *   when the clamped value coincides with the user's current retirement age
 *   (delta = 0) so the row does not silently render "±0 €/Mon." without
 *   explanation.
 * - `'unchanged'`: the perturbation produced no observable change (e.g. the
 *   scenario id requested already matches the baseline, or the retirement age
 *   target equals the current age without any clamping). The row still
 *   renders with `headlineDelta = 0`.
 */
export type SensitivityNote =
  | 'no_etf_instance'
  | 'etf_paid_up_only'
  | 'retirement_age_clamped'
  | 'unchanged'

export interface SensitivityRowResult {
  /** EUR/Monat. perturbed.monthlyNetIncome − baseline.monthlyNetIncome. */
  headlineDelta: number
  /** EUR/Monat per instance, keyed by `instanceId`. */
  perInstanceDelta: Record<string, number>
  /** Perturbed projected monthly net retirement income (EUR/Monat). */
  perturbedProjectedMonthly: number
  /**
   * Optional context flag for the caller. Absent when the perturbation
   * applied cleanly and produced a non-zero delta on at least one instance.
   */
  note?: SensitivityNote
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Diff a perturbed combined result against the baseline. Pure — no I/O, no
 * mutation; safe to share across every selector.
 *
 * Per-instance delta keys are the union of baseline + perturbed instance ids.
 * Missing entries on either side are treated as 0 (a surrendered instance has
 * no `byInstance` entry; the selector that surrendered it will report the
 * baseline value as the delta). This avoids losing information on rows that
 * structurally change the active instance set.
 */
function diffCombined(
  baseline: CombinedResult,
  perturbed: CombinedResult,
): Pick<SensitivityRowResult, 'headlineDelta' | 'perInstanceDelta' | 'perturbedProjectedMonthly'> {
  const headlineDelta = perturbed.monthlyNetIncome - baseline.monthlyNetIncome
  const perInstanceDelta: Record<string, number> = {}
  const ids = new Set<string>([
    ...Object.keys(baseline.byInstance),
    ...Object.keys(perturbed.byInstance),
  ])
  for (const id of ids) {
    const before = baseline.byInstance[id]?.monthlyNet ?? 0
    const after = perturbed.byInstance[id]?.monthlyNet ?? 0
    perInstanceDelta[id] = after - before
  }
  return {
    headlineDelta,
    perInstanceDelta,
    perturbedProjectedMonthly: perturbed.monthlyNetIncome,
  }
}

/**
 * Type-safe workspace clone. Each instance slot is shallow-copied so a
 * perturbation that mutates one instance's field never leaks into the
 * baseline workspace held by the caller.
 *
 * We rely on the fact that workspace instances are plain data records (no
 * class instances, no methods); a per-array `map(inst => ({ ...inst }))` is
 * sufficient. Nested objects (`fees`, `evidenceMap`, `monteCarlo`,
 * `transferEvents`) are NOT deep-cloned because every selector below either
 * writes a fresh nested object or leaves the nested structure untouched.
 *
 * If a future selector needs to mutate a nested object on an instance, it
 * MUST replace the nested object wholesale (`{ ...inst, fees: { ...inst.fees, ... } }`)
 * to preserve the no-mutation invariant.
 */
function cloneWorkspaceShallow(workspace: Workspace): Workspace {
  const baseline = workspace.baseline
  const wsa = baseline.assumptions
  const next: Workspace = {
    ...workspace,
    baseline: {
      ...baseline,
      profile: { ...baseline.profile },
      partner: baseline.partner ? { ...baseline.partner } : baseline.partner,
      assumptions: cloneAssumptions(wsa),
    } as Scenario,
    whatIfs: workspace.whatIfs,
    pinnedComparisonIds: [...workspace.pinnedComparisonIds],
  }
  return next
}

function cloneAssumptions(wsa: WorkspaceAssumptionsV2): WorkspaceAssumptionsV2 {
  return {
    ...wsa,
    bav: wsa.bav.map((i) => ({ ...i }) as BavInstance),
    etf: wsa.etf.map((i) => ({ ...i }) as EtfInstance),
    insurance: wsa.insurance.map((i) => ({ ...i }) as InsuranceInstance),
    basisrente: wsa.basisrente.map((i) => ({ ...i }) as BasisrenteInstance),
    altersvorsorgedepot: wsa.altersvorsorgedepot.map((i) => ({ ...i }) as AltersvorsorgedepotInstance),
    riester: wsa.riester.map((i) => ({ ...i }) as RiesterInstance),
    returnScenarios: wsa.returnScenarios.map((s) => ({ ...s })),
    monteCarlo: { ...wsa.monteCarlo },
    statutoryPension: { ...wsa.statutoryPension },
    visibleProducts: [...wsa.visibleProducts],
    visibleInstanceIds: wsa.visibleInstanceIds ? [...wsa.visibleInstanceIds] : wsa.visibleInstanceIds,
  }
}

/**
 * Re-run combine simulation for a perturbed workspace and pick the same
 * scenario id the baseline came from. Centralises the lookup so each selector
 * stays tight and the scenario-id discipline ("look up by id, never by index"
 * per CLAUDE.md) is enforced in exactly one place.
 *
 * Returns `null` when the perturbed workspace does not produce a result for
 * `scenarioId` — extremely unusual (it would mean the perturbation dropped a
 * scenario, which none of today's selectors do), but the null-guard prevents
 * a downstream TypeError if it ever happens.
 */
function runAndPickScenario(
  workspace: Workspace,
  rules: GermanRules,
  scenarioId: string,
): CombinedResult | null {
  const bundle = runCombineSimulation(workspace, rules)
  return bundle.combinedByScenarioId[scenarioId] ?? null
}

// ---------------------------------------------------------------------------
// Row 1 — Rendite konservativ
// ---------------------------------------------------------------------------

/**
 * What if equity markets deliver the conservative scenario instead of the
 * basis scenario?
 *
 * Engineering: the baseline is computed against the user's selected scenario
 * id (in practice `'basis'`). The perturbation re-runs the same workspace and
 * picks the scenario at `targetScenarioId` from the resulting bundle — no
 * workspace fields are mutated. `runCombineSimulation` already runs every
 * scenario in `assumptions.returnScenarios`, so this is effectively a
 * scenario-id swap on the existing run output. It is included here as a
 * proper selector (rather than inlined in the page) so it shares the same
 * delta shape as the other rows.
 *
 * Cost: re-runs `simulatePortfolio` once per call — O(N) on the number of
 * active workspace instances. The page-level batch budget (≤5 rows) caps the
 * total cost.
 */
export function sensitivityIfReturnScenario(
  workspace: Workspace,
  baselineCombined: CombinedResult,
  rules: GermanRules,
  baselineScenarioId: string,
  targetScenarioId: string,
): SensitivityRowResult {
  // Same workspace as baseline — but we still go through `runCombineSimulation`
  // rather than picking from a cached bundle because the caller does not pass
  // us the bundle. Cost stays bounded by the ≤5 rows budget.
  const bundle = runCombineSimulation(workspace, rules)
  const perturbed = bundle.combinedByScenarioId[targetScenarioId]
  if (!perturbed) {
    // Caller-supplied scenario id is not present in the workspace's
    // `returnScenarios`. Surface a structured no-op rather than throwing so
    // the UI degrades gracefully when a user's scenario list deviates from
    // the canonical [konservativ, basis, optimistisch] triple.
    return {
      headlineDelta: 0,
      perInstanceDelta: {},
      perturbedProjectedMonthly: baselineCombined.monthlyNetIncome,
      note: 'unchanged',
    }
  }
  if (targetScenarioId === baselineScenarioId) {
    return {
      headlineDelta: 0,
      perInstanceDelta: {},
      perturbedProjectedMonthly: perturbed.monthlyNetIncome,
      note: 'unchanged',
    }
  }
  return diffCombined(baselineCombined, perturbed)
}

// ---------------------------------------------------------------------------
// Row 2 — Renteneintritt 70 statt 67
// ---------------------------------------------------------------------------

/**
 * What if the user retires at `newRetirementAge` (default 70) instead of the
 * baseline `profile.retirementAge`?
 *
 * Clamps the requested age against `assumptions.retirementEndAge − 1` so the
 * simulation never sees `retirementAge >= retirementEndAge` (which the engine
 * rejects). When the clamp fires, the result carries
 * `note: 'retirement_age_clamped'`.
 *
 * Cost: O(N) on workspace instances per call.
 */
export function sensitivityIfRetirementAge(
  workspace: Workspace,
  baselineCombined: CombinedResult,
  rules: GermanRules,
  scenarioId: string,
  newRetirementAge: number,
): SensitivityRowResult {
  const next = cloneWorkspaceShallow(workspace)
  const maxAge = next.baseline.assumptions.retirementEndAge - 1
  const targetAge = Math.min(newRetirementAge, maxAge)
  const clamped = targetAge !== newRetirementAge
  next.baseline.profile.retirementAge = targetAge

  if (targetAge === workspace.baseline.profile.retirementAge) {
    // The target age equals the current age. This can happen two ways:
    //   (a) The caller passed the same age as the current profile age — a
    //       genuine no-op, note: 'unchanged'.
    //   (b) The requested age was clamped down to the current age (e.g.
    //       retirementAge = 69, retirementEndAge = 70 → clamp to 69 = current).
    //       In this case we MUST preserve the 'retirement_age_clamped' note so
    //       the UI does not silently render "±0 €/Mon." without explanation.
    return {
      headlineDelta: 0,
      perInstanceDelta: {},
      perturbedProjectedMonthly: baselineCombined.monthlyNetIncome,
      note: clamped ? 'retirement_age_clamped' : 'unchanged',
    }
  }

  const perturbed = runAndPickScenario(next, rules, scenarioId)
  if (!perturbed) {
    return {
      headlineDelta: 0,
      perInstanceDelta: {},
      perturbedProjectedMonthly: baselineCombined.monthlyNetIncome,
      note: 'unchanged',
    }
  }
  const diff = diffCombined(baselineCombined, perturbed)
  return clamped ? { ...diff, note: 'retirement_age_clamped' } : diff
}

// ---------------------------------------------------------------------------
// Row 3 — Inflation 3 % statt 2 %
// ---------------------------------------------------------------------------

/**
 * What if inflation runs at `newInflationRate` (default 3 %) instead of the
 * baseline `assumptions.inflationRate`?
 *
 * Inflation drives `accumulation.realBalance` (the rows' real-value series)
 * but does NOT affect nominal `netMonthlyPayout`. The headline delta on this
 * row is therefore typically 0 for non-leibrente products. The UI body copy
 * frames this row in terms of real purchasing power, not nominal monthly
 * net. The selector still returns nominal deltas — interpretation belongs at
 * the display boundary.
 *
 * Cost: O(N) on workspace instances per call.
 */
export function sensitivityIfInflation(
  workspace: Workspace,
  baselineCombined: CombinedResult,
  rules: GermanRules,
  scenarioId: string,
  newInflationRate: number,
): SensitivityRowResult {
  if (newInflationRate === workspace.baseline.assumptions.inflationRate) {
    return {
      headlineDelta: 0,
      perInstanceDelta: {},
      perturbedProjectedMonthly: baselineCombined.monthlyNetIncome,
      note: 'unchanged',
    }
  }
  const next = cloneWorkspaceShallow(workspace)
  next.baseline.assumptions.inflationRate = newInflationRate
  const perturbed = runAndPickScenario(next, rules, scenarioId)
  if (!perturbed) {
    return {
      headlineDelta: 0,
      perInstanceDelta: {},
      perturbedProjectedMonthly: baselineCombined.monthlyNetIncome,
      note: 'unchanged',
    }
  }
  return diffCombined(baselineCombined, perturbed)
}

// ---------------------------------------------------------------------------
// Row 4 — Beitrag +100 €/Monat in den ETF
// ---------------------------------------------------------------------------

/**
 * What if the user invests an additional `bumpEUR` (default 100) per month in
 * the **first active ETF instance**?
 *
 * Four cases are distinguished:
 *
 * 1. **No ETF instance at all** (note: `'no_etf_instance'`): the workspace
 *    contains zero ETF instances. The row is a no-op; the UI should skip it
 *    or show "Noch kein ETF-Sparplan im Plan". We deliberately do NOT fabricate
 *    a synthetic ETF instance — fees, equityPartialExemption, and
 *    contractStartYear choices would silently bias the comparison.
 *
 * 2. **ETF exists but all are paid-up** (note: `'etf_paid_up_only'`): the
 *    workspace has at least one ETF instance, and EVERY instance carries
 *    `status = 'paid_up'`. Paid-up instances receive `etfMonthlyUserCostOverride
 *    = 0` in the portfolio adapter regardless of `monthlyContribution`, so
 *    bumping their contribution field has no effect on the simulation. Returning
 *    this distinct note lets the UI tell the user "ETF-Vertrag vorhanden, aber
 *    beitragsfrei — Aufstockung würde einen neuen aktiven Vertrag erfordern".
 *
 * 3. **ETF exists but none are active — not all paid-up** (note: `'no_etf_instance'`):
 *    one or more instances exist but carry `status = 'surrendered'` or `'offered'`
 *    (or a mix). These are not recoverable by bumping a contribution field.
 *    The note falls back to `'no_etf_instance'` so the UI does not imply that
 *    a beitragsfrei contract exists that could be extended.
 *
 * 4. **Active ETF exists**: the bump is applied to the first active instance.
 *
 * Cost: O(N) on workspace instances per call.
 */
export function sensitivityIfEtfBump(
  workspace: Workspace,
  baselineCombined: CombinedResult,
  rules: GermanRules,
  scenarioId: string,
  bumpEUR: number,
): SensitivityRowResult {
  const etfInstances = workspace.baseline.assumptions.etf
  if (etfInstances.length === 0) {
    return {
      headlineDelta: 0,
      perInstanceDelta: {},
      perturbedProjectedMonthly: baselineCombined.monthlyNetIncome,
      note: 'no_etf_instance',
    }
  }

  const firstActiveEtfIdx = etfInstances.findIndex((i) => i.status === 'active')
  if (firstActiveEtfIdx === -1) {
    // ETF instances exist but none are active.
    //
    // Two sub-cases:
    //   a) Every instance is `paid_up` → `'etf_paid_up_only'`. The user has a
    //      beitragsfrei ETF contract; the UI shows a specific note about upgrading
    //      to an active contract.
    //   b) At least one instance is `surrendered` or `offered` (even if others
    //      are `paid_up`) → `'no_etf_instance'`. Surrendered/offered contracts
    //      are not recoverable by bumping a contribution field, so the "paid_up"
    //      framing would be misleading.
    //
    // `etfInstances.length === 0` is already handled above so we never reach
    // here with an empty array. `Array.every` on a non-empty array is safe.
    const allPaidUp = etfInstances.every((i) => i.status === 'paid_up')
    return {
      headlineDelta: 0,
      perInstanceDelta: {},
      perturbedProjectedMonthly: baselineCombined.monthlyNetIncome,
      note: allPaidUp ? 'etf_paid_up_only' : 'no_etf_instance',
    }
  }

  const next = cloneWorkspaceShallow(workspace)
  const target = next.baseline.assumptions.etf[firstActiveEtfIdx]
  const currentContribution = target.monthlyContribution ?? 0
  next.baseline.assumptions.etf[firstActiveEtfIdx] = {
    ...target,
    monthlyContribution: currentContribution + bumpEUR,
  }
  const perturbed = runAndPickScenario(next, rules, scenarioId)
  if (!perturbed) {
    return {
      headlineDelta: 0,
      perInstanceDelta: {},
      perturbedProjectedMonthly: baselineCombined.monthlyNetIncome,
      note: 'unchanged',
    }
  }
  return diffCombined(baselineCombined, perturbed)
}
