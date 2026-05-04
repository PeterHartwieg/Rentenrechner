/**
 * Equal-input compare-mode sub-mode (Group G issue 16, milestone M4).
 *
 * Today's compare-mode (`simulateRetirementComparison`) honours the
 * fair-comparison invariant: ETF and private insurance both invest
 * `bavFunding.monthlyNetCost` so the user is comparing apples to apples on
 * cash-out-of-pocket. That works for personal planning ("If I redirect my bAV
 * net cost into an ETF instead, what changes?") but not for the broker
 * scenario ("Compare €X/Monat across N candidate pAV products against ETF").
 *
 * This module implements the broker view as a SECOND escape from the
 * fair-comparison invariant — scoped to compare-mode equal-input sub-mode.
 * The first escape (combine-mode per-instance overrides) lives on
 * `BuildContextOverrides.etfMonthlyUserCostOverride`.
 *
 * Design rules:
 *
 *  - bAV still flows through `calculateBavFunding`, so its tax-deferral and
 *    employer-subsidy math run normally. The user's bAV monthly net cost is
 *    its OWN net cost (whatever `assumptions.bav.monthlyGrossConversion`
 *    + the funding pipeline produces) — bAV is not forced to `equalInputAmountEUR`.
 *    Brokers pitching €200/Monat into a pAV against the user's existing bAV
 *    can still see realistic tax savings on bAV.
 *
 *  - ETF and private insurance both run at `equalInputAmountEUR` (nominal).
 *    The override cascade is: combine-mode per-instance override > equal-input
 *    override > bAV net-cost anchor. Equal-input is compare-mode-only, so the
 *    combine-mode override never coexists with equal-input.
 *
 *  - Schicht-2 / Schicht-1 products (Basisrente, AVD, Riester) keep their own
 *    monthly contribution fields. They are out of scope for the broker
 *    equal-input pitch — those products have statutory contribution caps and
 *    user-set monthly amounts that already drive their funding.
 *
 *  - Output is a `SimulationResult` shape-identical to
 *    `simulateRetirementComparison`. Existing UI consumers work unchanged.
 *
 * Byte-identity guarantee: when `compareSubMode` is `'equal_cash'` (the
 * default) or undefined, the entry-point dispatch in `useSimulationResult`
 * keeps using `simulateRetirementComparison`, so existing oracle goldens stay
 * exactly as they are. This module is only invoked for the broker sub-mode.
 */

import type {
  GermanRules,
  PersonalProfile,
  ProductId,
  ScenarioAssumptions,
  SimulationResult,
} from '../domain'
import { buildContext } from './simulationContext'
import { PRODUCT_REGISTRY } from './productRegistry'

/**
 * Run the compare-mode equal-input scenario across every visible product
 * in `assumptions.visibleProducts`.
 *
 * @param monthlyContributionEUR Nominal monthly contribution for ETF and pAV
 *   (clamped to ≥ 0). bAV continues to use its own
 *   `assumptions.bav.monthlyGrossConversion` so tax-deferral is computed
 *   correctly.
 */
export function simulateEqualInputComparison(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  rules: GermanRules,
  monthlyContributionEUR: number,
): SimulationResult {
  const amount = Math.max(0, Number.isFinite(monthlyContributionEUR) ? monthlyContributionEUR : 0)

  // bAV funding still runs through `calculateBavFunding` inside `buildContext`
  // — equal-input does NOT bypass salary tax-deferral on bAV. The override below
  // only redirects ETF and pAV to the nominal `amount`.
  const ctx = buildContext(profile, assumptions, rules, {
    etfMonthlyUserCostOverride: amount,
    insuranceMonthlyUserCostOverride: amount,
  })

  const visible = new Set<ProductId>(assumptions.visibleProducts)
  const productsToSimulate =
    visible.size === 0
      ? []
      : PRODUCT_REGISTRY.filter((entry) => visible.has(entry.metadata.id as ProductId))

  const products = assumptions.returnScenarios.flatMap((scenario) =>
    productsToSimulate.map((product) => product.simulate(ctx, scenario)),
  )

  return {
    bavFunding: ctx.bavFunding,
    products,
    statutoryPension: ctx.statutoryPension,
    basisrenteFunding: ctx.basisrenteFunding,
    altersvorsorgedepotFunding: ctx.altersvorsorgedepotFunding,
    riesterFunding: ctx.riesterFunding,
  }
}
