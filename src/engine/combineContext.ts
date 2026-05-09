/**
 * Shared combine-context construction (architecture-readability issue 02).
 *
 * Single home for building `CombineContext` from workspace profile + rules +
 * the statutory baseline gross pension. Both the combine-simulation hook
 * (`useCombineSimulation`) and the recommender (`recommender.ts`) call
 * `buildCombineContext` here so statutory pension taxable-share routing,
 * retirement health status, and KV/PV routing cannot drift between views.
 *
 * The three routing decisions made here:
 *
 *   1. `statutoryPensionTaxChannel` — which `RetirementIncomeComponents` slot
 *      the statutory baseline feeds into:
 *        - 'statutory_pension': GRV and Versorgungswerk use §22 Nr. 1 Satz 3 a aa
 *          EStG Besteuerungsanteil (cohort percentage of gross).
 *        - 'beamten_versorgungsbezug': Beamtenpension routes through
 *          `bavPensionAnnual` (Versorgungsbezug, §19 EStG Versorgungsfreibetrag).
 *        - 'none': no statutory pension (pensionBaselineType 'none' or zero gross).
 *
 *   2. `statutoryPensionKvChannel` — how the monthly statutory baseline enters
 *      the KV/PV aggregate:
 *        - 'kvdr_half_rate': GRV → §249a SGB V half-rate via `monthlyStatutoryPension`.
 *        - 'versorgungsbezug_full_rate': Versorgungswerk + Beamten → §229 SGB V full
 *          rate via `otherMonthlyVersorgungsbezuege` (§226 Abs. 2 Freibetrag applies).
 *        - 'none': PKV holders or zero statutory pension → no statutory KV/PV.
 *
 *   3. `retirementHealthStatus` — workspace-level flag from
 *      `assumptions.statutoryPension.retirementHealthStatus`. Reading from the
 *      workspace root (not from `bav[0]`) keeps KV/PV routing independent of
 *      whether a bAV instance exists (matches `simulationContext.ts:256`).
 */

import type { GermanRules, PersonalProfile } from '../domain'
import type { StatutoryPensionAssumptions } from '../domain/products/grv'
import type { RetirementHealthStatus } from './retirementPayout'
import type { CombineContext } from './portfolioCombine'

// ---------------------------------------------------------------------------
// Re-export the CombineContext type so callers only need one import
// ---------------------------------------------------------------------------

export type { CombineContext }

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Workspace-level fields needed to build a `CombineContext`.
 *
 * Extracted so callers can pass a narrowed shape rather than the full Workspace.
 */
export interface CombineContextInputs {
  profile: PersonalProfile
  rules: GermanRules
  statutoryPension: StatutoryPensionAssumptions
  /**
   * Gross GRV / Versorgungswerk / Beamtenpension monthly pension already
   * projected for the retirement year. Pass 0 (or the manual override value)
   * when `pensionBaselineType` is 'none'.
   */
  grvGrossMonthlyPension: number
  /**
   * Whether the workspace models a married household (i.e. `scenario.partner`
   * is present). When true, `buildCombineContext` sets `filingStatus` to
   * 'married' so `combinePortfolio` applies §32a Abs. 5 EStG Ehegattensplitting.
   * Defaults to false (Einzelveranlagung).
   */
  hasPartner?: boolean
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a `CombineContext` from profile + rules + the statutory baseline.
 *
 * Called by `useCombineSimulation.runCombineSimulation` (after it projects the
 * statutory pension) and by `recommender.ts` inside `generateCandidates`
 * (where the gross monthly value is passed from `RecommenderInput`).
 *
 * The routing logic is the single authoritative copy for all combine-mode
 * callers. Any change to how statutory pension type, health insurance status,
 * or KV/PV channel are derived must be made here.
 */
export function buildCombineContext(inputs: CombineContextInputs): CombineContext {
  const { profile, rules, statutoryPension, grvGrossMonthlyPension, hasPartner } = inputs
  const retirementYear = rules.year + (profile.retirementAge - profile.age)
  const filingStatus: 'single' | 'married' = hasPartner ? 'married' : 'single'

  const pensionType = statutoryPension.pensionBaselineType ?? 'grv'

  // -------------------------------------------------------------------------
  // 1. Statutory pension taxable-share routing
  // -------------------------------------------------------------------------
  let statutoryPensionTaxChannel: CombineContext['statutoryPensionTaxChannel']
  let statutoryPensionKvChannel: CombineContext['statutoryPensionKvChannel']

  if (pensionType === 'none' || grvGrossMonthlyPension <= 0) {
    // No statutory baseline — skip all routing.
    statutoryPensionTaxChannel = 'none'
    statutoryPensionKvChannel = 'none'
  } else if (pensionType === 'beamtenpension') {
    // Beamtenpension: §19 EStG Versorgungsbezug channel for tax; §229 SGB V
    // full-rate Versorgungsbezug channel for KV (GKV holders only).
    statutoryPensionTaxChannel = 'beamten_versorgungsbezug'
    statutoryPensionKvChannel = profile.publicHealthInsurance ? 'versorgungsbezug_full_rate' : 'none'
  } else if (pensionType === 'versorgungswerk') {
    // Versorgungswerk: same Besteuerungsanteil channel as GRV for tax; §229
    // Abs. 1 Nr. 3 SGB V Versorgungsbezug (full rate) for KV.
    statutoryPensionTaxChannel = 'statutory_pension'
    statutoryPensionKvChannel = profile.publicHealthInsurance ? 'versorgungsbezug_full_rate' : 'none'
  } else {
    // 'grv' (default): §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil for tax;
    // §249a SGB V half-rate via KVdR for KV.
    statutoryPensionTaxChannel = 'statutory_pension'
    statutoryPensionKvChannel = profile.publicHealthInsurance ? 'kvdr_half_rate' : 'none'
  }

  // -------------------------------------------------------------------------
  // 2. Retirement health status
  //
  //    Read from workspace-level `assumptions.statutoryPension.retirementHealthStatus`
  //    so KV/PV routing is independent of any specific bAV instance existing.
  //    Falls back to 'kvdr' (statutory default for GRV members).
  // -------------------------------------------------------------------------
  const retirementHealthStatus: RetirementHealthStatus =
    statutoryPension.retirementHealthStatus ?? 'kvdr'

  return {
    profile,
    rules,
    retirementYear,
    grvGrossMonthlyPension,
    statutoryPensionTaxChannel,
    statutoryPensionKvChannel,
    retirementHealthStatus,
    filingStatus,
  }
}
